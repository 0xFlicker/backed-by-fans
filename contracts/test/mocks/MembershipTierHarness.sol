// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTier} from "../../src/MembershipTier.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";

/// @notice Test-only access to U3's internal paid-time lifecycle hooks.
contract MembershipTierHarness is MembershipTier {
    constructor(
        address factory,
        IERC20 paymentToken,
        address renderer,
        MembershipTypes.TierConfig memory config
    ) MembershipTier(factory, paymentToken, renderer, config) {}

    function addPaidPeriods(address recipient, uint64 periods) external returns (uint256 tokenId) {
        tokenId = _addPaidPeriods(recipient, periods);
    }

    function addPaidTime(address recipient, uint64 duration) external returns (uint256 tokenId) {
        tokenId = _addPaidTime(recipient, duration);
    }

    function storedTimeState(uint256 tokenId)
        external
        view
        returns (MembershipTypes.MembershipState memory state)
    {
        state = _membershipStates[tokenId];
    }
}
