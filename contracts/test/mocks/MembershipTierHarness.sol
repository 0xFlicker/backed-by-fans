// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTier} from "../../src/MembershipTier.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";

/// @notice Test-only access to stored lifecycle checkpoints.
contract MembershipTierHarness is MembershipTier {
    constructor(
        address factory,
        IERC20 paymentToken,
        address renderer,
        MembershipTypes.TierConfig memory config
    ) MembershipTier(factory, paymentToken, config) {}

    function storedTimeState(uint256 tokenId)
        external
        view
        returns (MembershipTypes.MembershipState memory state)
    {
        state = _membershipStates[tokenId];
    }
}
