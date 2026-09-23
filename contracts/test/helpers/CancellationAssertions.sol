// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {MembershipTier} from "../../src/MembershipTier.sol";

/// @dev Numeric payout assertion helper; caller authority is preserved and never impersonated.
function cancelPayout(
    MembershipTier tier,
    uint256 tokenId,
    address expectedOwner,
    uint256 minimum,
    uint256 steps
) returns (uint256 paid) {
    (paid,) = tier.cancelMembership(tokenId, expectedOwner, minimum, uint64(block.timestamp), steps);
}
