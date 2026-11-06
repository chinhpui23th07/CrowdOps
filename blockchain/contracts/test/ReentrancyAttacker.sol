// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICrowdOps {
    function contribute(uint256 campaignId) external payable;
    function refund(uint256 campaignId) external;
    function executeSpending(uint256 campaignId, uint256 requestId) external;
    function voteDissolution(uint256 campaignId, uint256 proposalId, bool support) external;
    function claimDissolutionRefund(uint256 campaignId) external;
}

/// @dev CHỈ DÙNG TRONG TEST. Khi nhận ETH hoàn tiền, cố gọi lại refund() (hoặc
///  claimDissolutionRefund() ở chế độ giải thể) để rút hai lần.
contract ReentrancyAttacker {
    ICrowdOps public immutable target;
    uint256 public campaignId;
    uint256 public reentryAttempts;
    uint256 public reentrySucceeded;
    bool public dissolutionMode;

    constructor(address target_) {
        target = ICrowdOps(target_);
    }

    function contribute(uint256 campaignId_) external payable {
        campaignId = campaignId_;
        target.contribute{value: msg.value}(campaignId_);
    }

    function attackRefund() external {
        target.refund(campaignId);
    }

    function voteDissolution(uint256 proposalId) external {
        target.voteDissolution(campaignId, proposalId, true);
    }

    function attackDissolutionClaim() external {
        dissolutionMode = true;
        target.claimDissolutionRefund(campaignId);
    }

    receive() external payable {
        if (reentryAttempts == 0) {
            reentryAttempts++;
            // Bắt lỗi để giao dịch ngoài không bị revert: chứng minh lần rút thứ hai thất bại
            // nhưng lần rút hợp lệ đầu tiên vẫn thành công.
            if (dissolutionMode) {
                try target.claimDissolutionRefund(campaignId) {
                    reentrySucceeded++;
                } catch {}
            } else {
                try target.refund(campaignId) {
                    reentrySucceeded++;
                } catch {}
            }
        }
    }
}

/// @dev CHỈ DÙNG TRONG TEST. Ví nhận luôn từ chối ETH để kiểm tra TransferFailed.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}
