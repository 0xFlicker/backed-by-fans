// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MembershipTierHarness} from "./mocks/MembershipTierHarness.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract PaymentsAndTimeTest is Test {
    MembershipTierHarness private tier;
    address private member;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        member = makeAddr("member");

        MockUSDG token = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTierHarness(address(this), token, address(renderer), _config());
    }

    function test_paidTimeExtendsActiveExpirationAndRestartsExpiredTimeFromNow() public {
        uint256 tokenId = tier.addPaidPeriods(member, 1);
        uint64 firstExpiration = tier.expiresAt(tokenId);

        vm.warp(_START + 10 days);
        tier.addPaidPeriods(member, 2);
        assertEq(tier.expiresAt(tokenId), firstExpiration + 2 * _PERIOD);

        vm.warp(tier.expiresAt(tokenId));
        assertFalse(tier.isActive(member));
        tier.addPaidPeriods(member, 1);

        assertEq(tier.expiresAt(tokenId), block.timestamp + _PERIOD);
        assertTrue(tier.isActive(member));
    }

    function test_paidTimeInsertedAheadOfGrantTimeIsConsumedFirst() public {
        uint256 tokenId = tier.grantTime(member, 2);
        uint64 originalExpiration = tier.expiresAt(tokenId);
        vm.warp(_START + 15 days);

        tier.addPaidPeriods(member, 1);

        (uint64 paidSeconds, uint64 grantSeconds, uint64 checkpoint) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, _PERIOD);
        assertEq(grantSeconds, 45 days);
        assertEq(checkpoint, block.timestamp);
        assertEq(tier.expiresAt(tokenId), originalExpiration + _PERIOD);

        vm.warp(block.timestamp + _PERIOD);
        (paidSeconds, grantSeconds, checkpoint) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 45 days);
        assertEq(checkpoint, block.timestamp);
    }

    function test_activityChangesAtExactExpirationWithoutMutationOrSync() public {
        uint256 tokenId = tier.addPaidPeriods(member, 1);
        uint64 expiration = tier.expiresAt(tokenId);

        vm.warp(expiration - 1);
        assertTrue(tier.isActive(member));
        assertEq(tier.activeBalanceOf(member), 1);

        vm.warp(expiration);
        assertFalse(tier.isActive(member));
        assertFalse(tier.isActiveToken(tokenId));
        assertEq(tier.activeBalanceOf(member), 0);
        assertEq(tier.expiresAt(tokenId), expiration);

        (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint) =
            tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
        assertEq(effectiveCheckpoint, expiration);
    }

    function test_timeBalanceViewReturnsEffectiveCheckpointWithoutWriting() public {
        uint256 tokenId = tier.addPaidPeriods(member, 2);
        tier.grantTime(member, 1);
        vm.warp(_START + 15 days);

        (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint) =
            tier.timeBalances(tokenId);

        assertEq(paidSeconds, 45 days);
        assertEq(grantSeconds, _PERIOD);
        assertEq(effectiveCheckpoint, block.timestamp);
        assertEq(tier.expiresAt(tokenId), _START + 3 * _PERIOD);
    }

    function test_loweringPaidLimitPreservesTimeBlocksPaidAddsAndAllowsGrants() public {
        uint256 tokenId = tier.addPaidPeriods(member, 3);
        uint64 expiration = tier.expiresAt(tokenId);

        tier.setMaxPrepaidPeriods(2);
        assertEq(tier.expiresAt(tokenId), expiration);

        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        tier.addPaidPeriods(member, 1);

        tier.grantTime(member, 1);
        assertEq(tier.expiresAt(tokenId), expiration + _PERIOD);
    }

    function test_zeroPaidLimitIsUnlimited() public {
        tier.setMaxPrepaidPeriods(0);

        uint256 tokenId = tier.addPaidPeriods(member, 20);

        assertEq(tier.expiresAt(tokenId), _START + 20 * _PERIOD);
        assertTrue(tier.isRenewable(tokenId));
    }

    function test_paidHooksRequireWholeNonzeroPeriods() public {
        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        tier.addPaidPeriods(member, 0);

        vm.expectRevert(MembershipTier.InvalidPaidDuration.selector);
        tier.addPaidTime(member, 0);

        vm.expectRevert(MembershipTier.InvalidPaidDuration.selector);
        tier.addPaidTime(member, _PERIOD - 1);

        assertEq(tier.totalMinted(), 0);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_uint64ExpirationCeilingRevertsAtomically() public {
        vm.warp(type(uint64).max - _PERIOD + 1);

        vm.expectRevert(MembershipTier.DurationOverflow.selector);
        tier.addPaidPeriods(member, 1);

        assertEq(tier.totalMinted(), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.tokenOf(member), 0);
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        return MembershipTestConfig.defaultConfig(address(this));
    }
}
