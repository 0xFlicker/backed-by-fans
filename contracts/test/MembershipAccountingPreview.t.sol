// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";

contract MembershipAccountingPreviewTest is Test {
    MembershipTier private tier;
    MockUSDG private token;
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);

    function setUp() public {
        vm.warp(1_000_000);
        new LinkedVestingFixture().install();
        token = new MockUSDG();
        address renderer = address(new OnchainMetadataRenderer());
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer, address(token));
        config.periodDuration = 100;
        tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(this), address(token)), token, config
        );
        token.mint(ALICE, 1_000_000_000);
        vm.prank(ALICE);
        token.approve(address(tier), type(uint256).max);
    }

    function _assertConservation(MembershipTypes.PaymentTotals memory p) private pure {
        uint256 accounted = p.refunded * (1 << 128) + p.unassignedMemberScaled
            + p.distributionDustScaled + p.indexCarryScaled;
        for (uint256 i; i < 4; ++i) {
            accounted += p.paidRaw[i] * (1 << 128) + p.earnedScaled[i] + p.unearnedScaled[i]
            + p.cancellationScaled[i];
        }
        assertEq(accounted, p.grossReceived * (1 << 128), "every unit accounted for");
    }

    function testFuzz_paymentTotalsMatchWrites(uint8 a, uint8 b, uint16 elapsed) public {
        vm.startPrank(ALICE);
        tier.createMembership(uint64(bound(a, 1, 12)), BOB, 25);
        tier.createMembership(uint64(bound(b, 1, 12)), BOB, 25);
        vm.stopPrank();
        vm.warp(1_000_000 + bound(elapsed, 0, 1500));
        MembershipTypes.PaymentTotals memory projected = tier.previewPaymentTotals(256);
        assertTrue(projected.status.complete);
        _assertConservation(projected);
        tier.processAccounting(256);
        MembershipTypes.PaymentTotals memory settled = tier.previewPaymentTotals(0);
        projected.processedSteps = 0;
        assertEq(abi.encode(projected), abi.encode(settled));
    }

    function test_paymentRatesFollowFundingAndExpiryBoundariesWhilePaused() public {
        vm.startPrank(ALICE);
        tier.createMembership(1, BOB, 25);
        tier.createMembership(2, BOB, 25);
        vm.stopPrank();
        tier.setPaused(true);
        vm.warp(1_000_050);
        MembershipTypes.PaymentTotals memory first = tier.previewPaymentTotals(25);
        assertTrue(first.hasEligibleMembers);
        assertEq(first.status.nextBoundary, 1_000_100);
        vm.warp(1_000_150);
        MembershipTypes.PaymentTotals memory next = tier.previewPaymentTotals(25);
        assertTrue(next.hasEligibleMembers);
        assertEq(next.status.nextBoundary, 1_000_200);
        for (uint256 i; i < 4; ++i) {
            assertGt(next.allocationRatesScaled[i], 0);
            assertEq(first.allocationRatesScaled[i], next.allocationRatesScaled[i] * 2);
        }
        MembershipTypes.PaymentTotals memory incomplete = tier.previewPaymentTotals(0);
        assertFalse(incomplete.status.complete);
        for (uint256 i; i < 4; ++i) {
            assertEq(incomplete.allocationRatesScaled[i], 0);
        }
        vm.warp(1_000_200);
        MembershipTypes.PaymentTotals memory ended = tier.previewPaymentTotals(25);
        assertTrue(ended.status.complete);
        assertFalse(ended.hasEligibleMembers);
        for (uint256 i; i < 4; ++i) {
            assertEq(ended.allocationRatesScaled[i], 0);
        }
    }

    function test_paymentTotalsProjectAllBeneficiariesAndMatchMaintenance() public {
        vm.startPrank(ALICE);
        tier.createMembership(1, BOB, 25);
        tier.createMembership(2, BOB, 25);
        vm.stopPrank();
        vm.warp(1_000_150);
        MembershipTypes.PaymentTotals memory before = tier.previewPaymentTotals(25);
        assertTrue(before.status.complete);
        assertGt(before.earnedScaled[0], 0);
        assertGt(before.earnedScaled[1], 0);
        assertGt(before.earnedScaled[2], 0);
        _assertConservation(before);
        tier.processAccounting(25);
        MembershipTypes.PaymentTotals memory after_ = tier.previewPaymentTotals(0);
        assertEq(abi.encode(before.earnedScaled), abi.encode(after_.earnedScaled));
        assertEq(abi.encode(before.unearnedScaled), abi.encode(after_.unearnedScaled));
        assertEq(before.distributionDustScaled, after_.distributionDustScaled);
        assertEq(before.indexCarryScaled, after_.indexCarryScaled);
        assertEq(before.unassignedMemberScaled, after_.unassignedMemberScaled);
        _assertConservation(after_);
        vm.prank(ALICE);
        uint256 retired = tier.claimRetiredRewards();
        uint256 creator = tier.withdrawCreatorProceeds();
        vm.prank(BOB);
        uint256 referral = tier.claimReferral();
        after_ = tier.previewPaymentTotals(25);
        assertEq(after_.paidRaw[0], creator);
        assertEq(after_.paidRaw[1], retired);
        assertEq(after_.paidRaw[2], referral);
        assertEq(after_.grossReceived, 30_000_000);
        _assertConservation(after_);
    }

    function test_paymentTotalsBoundedPausedAndRefunded() public {
        vm.prank(ALICE);
        uint256 id = tier.createMembership(2, BOB, 25);
        vm.warp(1_000_050);
        MembershipTypes.PaymentTotals memory before = tier.previewPaymentTotals(0);
        _assertConservation(before);
        uint256 refunded = tier.refund(id, ALICE, type(uint256).max, 25);
        MembershipTypes.PaymentTotals memory after_ = tier.previewPaymentTotals(25);
        assertEq(after_.grossReceived, 20_000_000);
        assertEq(after_.refunded, refunded);
        assertGt(refunded, 0);
        _assertConservation(after_);
        tier.grantMembership(ALICE, 1, 25);
        tier.grantMembership(ALICE, 1, 25);
        tier.setPaused(true);
        vm.warp(1_000_250);
        before = tier.previewPaymentTotals(1);
        assertFalse(before.status.complete);
        assertLe(before.processedSteps, 1);
        _assertConservation(before);
        tier.processAccounting(25);
        after_ = tier.previewPaymentTotals(0);
        assertTrue(after_.status.complete);
        _assertConservation(after_);
    }

    function test_previewRetirementPreservesHistoricalEligibilityAndCredit() public {
        vm.prank(ALICE);
        uint256 id = tier.createMembership(1, address(0), 25);
        vm.warp(1_000_200);
        MembershipTypes.AccountingPreview memory before =
            tier.previewAccounting(id, ALICE, address(0), 25);
        assertTrue(before.current.status.complete);
        assertEq(uint256(before.lifecycle), uint256(MembershipTypes.MembershipLifecycle.Retired));
        assertGt(before.current.retired, 0);
        assertEq(tier.ownerOf(id), ALICE);
        tier.processAccounting(25);
        (uint256 raw, uint256 fraction) = tier.claimableRetiredReward(ALICE);
        assertEq(raw, before.current.retired);
        assertEq(fraction, before.current.retiredFractionalScaled);
        assertEq(tier.totalRewardShares(), 0);
    }

    function test_batchPreviewCountsRetiredOwnerCreditOnceAndMatchesPayout() public {
        vm.startPrank(ALICE);
        uint256[] memory ids = new uint256[](2);
        ids[0] = tier.createMembership(1, address(0), 25);
        ids[1] = tier.createMembership(2, address(0), 25);
        vm.stopPrank();
        vm.warp(1_000_100);
        MembershipTypes.ClaimPreview memory preview = tier.previewClaimRewards(ALICE, ids, 25);
        assertTrue(preview.complete);
        assertEq(
            uint256(preview.positions[0].lifecycle),
            uint256(MembershipTypes.MembershipLifecycle.Retired)
        );
        assertEq(preview.positions[0].creditScaled, 0);
        assertGt(preview.retiredCreditScaled, 0);
        uint256 beforeBalance = token.balanceOf(ALICE);
        vm.prank(ALICE);
        MembershipTypes.ClaimResult memory result = tier.claimRewards(ids, 25);
        assertEq(result.processedSteps, preview.processedSteps);
        assertEq(result.liveReward, preview.positions[1].creditScaled / (1 << 128));
        assertEq(result.retiredReward, preview.retiredCreditScaled / (1 << 128));
        assertEq(token.balanceOf(ALICE) - beforeBalance, result.liveReward + result.retiredReward);
    }

    function test_batchPreviewUsesOneBudgetAndRejectsInvalidSelection() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = tier.grantMembership(ALICE, 1, 25);
        ids[1] = tier.grantMembership(ALICE, 1, 25);
        vm.warp(1_000_100);
        MembershipTypes.ClaimPreview memory preview = tier.previewClaimRewards(ALICE, ids, 1);
        assertFalse(preview.complete);
        assertEq(preview.processedSteps, 1);
        assertEq(
            uint256(preview.positions[1].lifecycle),
            uint256(MembershipTypes.MembershipLifecycle.ExpiredPending)
        );
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.previewClaimRewards(BOB, ids, 25);
        ids[1] = ids[0];
        vm.expectRevert(MembershipTier.InvalidClaim.selector);
        tier.previewClaimRewards(ALICE, ids, 25);
    }

    function test_freeExpiryUsesPreviewBudgetAndShowsIncompletePhase() public {
        tier.grantMembership(ALICE, 1, 25);
        tier.grantMembership(BOB, 1, 25);
        vm.warp(1_000_100);
        MembershipTypes.AccountingPreview memory preview =
            tier.previewAccounting(0, ALICE, address(0), 1);
        assertEq(preview.processedSteps, 1);
        assertFalse(preview.current.status.complete);
        MembershipTypes.MaintenanceResult memory result = tier.processExpirations(1);
        assertEq(result.processedSteps, preview.processedSteps);
        assertEq(result.accountedThrough, preview.current.status.accountedThrough);
        assertEq(result.complete, preview.current.status.complete);
        assertEq(tier.occupiedSupply(), 1);
        preview = tier.previewAccounting(0, ALICE, address(0), 1);
        assertTrue(preview.current.status.complete);
        result = tier.processExpirations(1);
        assertTrue(result.complete);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_zeroBudgetDoesNotSkipDueExpiration() public {
        uint256 id = tier.grantMembership(ALICE, 1, 25);
        vm.warp(1_000_100);
        MembershipTypes.AccountingPreview memory preview =
            tier.previewAccounting(id, ALICE, address(0), 0);
        assertFalse(preview.current.status.complete);
        assertEq(preview.processedSteps, 0);
        assertEq(tier.ownerOf(id), ALICE);
    }

    function test_variableDenominatorPreviewMatchesEveryBatchSplit() public {
        vm.prank(ALICE);
        uint256 first = tier.createMembership(1, address(0), 25);
        token.mint(BOB, 1_000_000_000);
        vm.startPrank(BOB);
        token.approve(address(tier), type(uint256).max);
        uint256 second = tier.createMembership(2, address(0), 25);
        vm.stopPrank();
        tier.processAccounting(25);
        vm.warp(1_000_200);
        uint256 initial = vm.snapshotState();
        for (uint256 budget = 1; budget <= 25; ++budget) {
            assertTrue(vm.revertToState(initial));
            initial = vm.snapshotState();
            for (uint256 batch; batch < 8; ++batch) {
                MembershipTypes.AccountingPreview memory preview =
                    tier.previewAccounting(second, ALICE, address(0), budget);
                MembershipTypes.MaintenanceResult memory result = tier.processAccounting(budget);
                (uint256 raw, uint256 fraction) = tier.claimableRetiredReward(ALICE);
                assertEq(raw, preview.current.retired);
                assertEq(fraction, preview.current.retiredFractionalScaled);
                assertEq(result.complete, preview.current.status.complete);
                assertEq(result.processedSteps, preview.processedSteps);
                assertEq(
                    keccak256(abi.encode(tier.accountingStatus())),
                    keccak256(abi.encode(preview.current.status))
                );
                MembershipTypes.AccountingPreview memory settled =
                    tier.previewAccounting(second, ALICE, address(0), 0);
                assertEq(preview.current.member, settled.settled.member);
                assertEq(preview.current.fractionalScaled[1], settled.settled.fractionalScaled[1]);
                if (result.complete) break;
            }
            assertTrue(tier.accountingStatus().complete);
            assertEq(tier.sharesOf(first), 0);
            assertEq(tier.sharesOf(second), 0);
        }
    }
}
