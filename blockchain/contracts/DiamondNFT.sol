// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title DiamondNFT - NFT ERC-721 tri ân người ủng hộ hạng "Kim cương"
/// @notice Một collection chung cho mọi chiến dịch; mỗi NFT ghi lại campaignId của nó.
///  Chỉ contract CrowdOps (minter) được mint, và CrowdOps kiểm tra điều kiện Kim cương
///  + chống mint trùng trước khi gọi. Ở đây kiểm tra trùng thêm một lần nữa (phòng thủ 2 lớp).
contract DiamondNFT is ERC721URIStorage {
    error OnlyMinter();
    error AlreadyMinted();

    address public immutable minter;
    uint256 public totalMinted;

    /// @notice tokenId => campaignId
    mapping(uint256 => uint256) public campaignOf;
    /// @notice campaignId => ví => đã có NFT của chiến dịch này chưa
    mapping(uint256 => mapping(address => bool)) public hasDiamond;

    event DiamondMinted(uint256 indexed campaignId, address indexed to, uint256 indexed tokenId);

    constructor() ERC721("Crowd Ops Diamond Backer", "CODIAMOND") {
        minter = msg.sender;
    }

    function mint(address to, uint256 campaignId, string calldata metadataURI) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert OnlyMinter();
        if (hasDiamond[campaignId][to]) revert AlreadyMinted();

        hasDiamond[campaignId][to] = true;
        tokenId = ++totalMinted;
        campaignOf[tokenId] = campaignId;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, metadataURI);
        emit DiamondMinted(campaignId, to, tokenId);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://";
    }
}
