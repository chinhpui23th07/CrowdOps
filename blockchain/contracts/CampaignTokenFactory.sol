// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CampaignToken} from "./CampaignToken.sol";

/// @title CampaignTokenFactory - tạo token quản trị cho từng chiến dịch
/// @notice Tách khỏi CrowdOps để CrowdOps không vượt giới hạn 24 KB bytecode.
///  Factory do CrowdOps deploy trong constructor nên chỉ CrowdOps gọi được deploy(),
///  và mọi token được tạo đều nhận CrowdOps làm minter duy nhất.
contract CampaignTokenFactory {
    error OnlyCrowdOps();

    address public immutable crowdOps;

    constructor() {
        crowdOps = msg.sender;
    }

    function deploy(string calldata name, string calldata symbol, uint256 campaignId)
        external
        returns (CampaignToken)
    {
        if (msg.sender != crowdOps) revert OnlyCrowdOps();
        return new CampaignToken(name, symbol, campaignId, crowdOps);
    }
}
