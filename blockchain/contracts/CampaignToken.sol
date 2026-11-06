// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title CampaignToken - token quản trị ERC-20 riêng cho MỘT chiến dịch Crowd Ops
/// @notice Quy tắc:
///  - 1 wei góp vào chiến dịch = 1 đơn vị token (18 decimals) => góp 1 ETH nhận 1 token.
///  - Chỉ contract CrowdOps (minter) được mint/burn. Không ai khác, kể cả chủ dự án.
///  - Trong giai đoạn Huy động và khi Thất bại: KHÔNG chuyển nhượng được (chỉ mint/burn).
///    Lý do: số token phải luôn khớp với số ETH đã góp để hoàn tiền/burn chính xác.
///  - Khi chiến dịch Thành công: minter bật chuyển nhượng. Quyền biểu quyết của mỗi
///    yêu cầu chi được chụp (snapshot) tại một block cố định nên chuyển token sau mốc đó
///    không tạo thêm phiếu.
///  - ERC20Votes chỉ tính phiếu cho token đã được "delegate". Để người dùng không phải
///    tự gửi giao dịch delegate, contract tự delegate cho chính người nhận nếu họ chưa
///    chọn người đại diện nào.
contract CampaignToken is ERC20, ERC20Permit, ERC20Votes {
    error OnlyMinter();
    error TransfersDisabled();

    /// @notice Contract CrowdOps - bên duy nhất có quyền mint/burn/bật chuyển nhượng.
    address public immutable minter;
    /// @notice Id chiến dịch mà token này thuộc về.
    uint256 public immutable campaignId;
    /// @notice true sau khi chiến dịch được chốt Thành công.
    bool public transfersEnabled;

    event TransfersEnabled();

    modifier onlyMinter() {
        if (msg.sender != minter) revert OnlyMinter();
        _;
    }

    constructor(string memory name_, string memory symbol_, uint256 campaignId_, address minter_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        minter = minter_;
        campaignId = campaignId_;
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMinter {
        _burn(from, amount);
    }

    function enableTransfers() external onlyMinter {
        transfersEnabled = true;
        emit TransfersEnabled();
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        // Chuyển nhượng thông thường (không phải mint/burn) chỉ được phép sau khi thành công.
        if (from != address(0) && to != address(0) && !transfersEnabled) revert TransfersDisabled();

        // Tự delegate cho người nhận lần đầu để token có quyền biểu quyết ngay.
        if (to != address(0) && delegates(to) == address(0)) {
            _delegate(to, to);
        }
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
