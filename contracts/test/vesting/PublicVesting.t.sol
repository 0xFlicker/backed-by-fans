// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {ProtocolBurnRouter} from "../../src/ProtocolBurnRouter.sol";
import {VestingLedger} from "../../src/libraries/VestingLedger.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "../helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Real factory/tier/router/vault on the local EVM; only the payment token is a mock.
/// The protocol token is deliberately unbound, so these tests prove no market integration.
contract PublicVestingTest is Test {
    using SafeCast for uint256;
    uint256 private constant UNIT = 1e6;
    uint256 private constant Q = 1 << 128;
    uint64 private constant START = 1000;
    address private creator = address(0xC0FFEE);
    address private alice = address(0xA11CE);
    address private bob = address(0xB0B);
    address private referrer = address(0xAFF1);
    MockUSDG private token;
    MembershipFactory private factory;
    OnchainMetadataRenderer private renderer;
    uint256 private salt;

    function setUp() public {
        vm.warp(START);
        new LinkedVestingFixture().install();
        token = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(token),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(0),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(token))
        );
    }

    function _tier(bool variablePrice, uint32 boost) private returns (MembershipTier result) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(token));
        config.tierSalt = keccak256(abi.encode(++salt));
        config.pricePerPeriod = variablePrice ? 0 : 10 * UNIT;
        config.periodDuration = 10;
        config.protocolFeeBps = 500;
        config.rewardBps = 1000;
        config.referralBps = 500;
        config.maxPrepaidPeriods = 128;
        config.startingBoostBps = boost;
        config.earlySupportGross = boost == 10_000 ? 0 : (10_000 * UNIT).toUint112();
        vm.prank(creator);
        result = MembershipTier(factory.createTier(config));
    }

    function _pay(MembershipTier tier, address member, uint64 periods, address referral)
        private
        returns (uint256 id)
    {
        token.mint(member, periods * tier.pricePerPeriod());
        vm.startPrank(member);
        token.approve(address(tier), type(uint256).max);
        id = tier.createMembership(periods, referral, 25);
        vm.stopPrank();
    }

    function _contribute(MembershipTier tier, address member, uint256 gross, address referral)
        private
        returns (uint256 id)
    {
        token.mint(member, gross);
        vm.startPrank(member);
        token.approve(address(tier), type(uint256).max);
        id = tier.createContributionMembership(gross, referral, 25);
        vm.stopPrank();
    }

    function test_120TokenPurchaseClaimsAndReservedRefund() public {
        MembershipTier tier = _tier(false, 10_000);
        uint256 id = _pay(tier, alice, 12, referrer);
        MembershipTypes.EarnedBalances memory earned =
        tier.previewAccounting(id, address(0), referrer, 0).settled;
        assertEq(earned.creator + earned.member + earned.referral + earned.protocol, 0);
        assertEq(tier.sharesOf(id), 120 * UNIT);
        assertEq(tier.lifetimeGross(), 120 * UNIT);
        assertTrue(
            (tier.tokensOfOwner(alice, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(alice, 0, 1).tokenIds[0]))
        );
        assertEq(tier.totalProtectedLiability(), 120 * UNIT);
        vm.warp(START + 30);
        tier.processAccounting(25);
        earned = tier.previewAccounting(id, address(0), referrer, 0).settled;
        assertEq(earned.creator, 24 * UNIT);
        assertEq(
            earned.member * Q + earned.fractionalScaled[1] + tier.reserveState().indexCarryScaled,
            3 * UNIT * Q
        );
        assertLe(3 * UNIT - earned.member, 1);
        uint256 memberClaim = earned.member;
        assertEq(earned.referral, 15 * UNIT / 10);
        assertEq(earned.protocol, 15 * UNIT / 10);
        vm.prank(creator);
        assertEq(tier.withdrawCreatorProceeds(), 24 * UNIT);
        vm.prank(alice);
        assertEq(tier.claimReward(id, 25), memberClaim);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), 15 * UNIT / 10);
        assertEq(tier.releaseProtocolFees(), 15 * UNIT / 10);
        MembershipTypes.RefundPreview memory preview = tier.previewRefund(id);
        assertTrue(preview.complete);
        assertEq(preview.grossRefund, 90 * UNIT);
        assertEq(preview.paidSeconds, 90);
        assertEq(
            preview.fundingScaled[0] + preview.fundingScaled[1] + preview.fundingScaled[2]
                + preview.fundingScaled[3],
            90 * UNIT * Q
        );
        assertEq(token.allowance(creator, address(tier)), 0);
        vm.prank(creator);
        assertEq(tier.refund(id, alice, 90 * UNIT, 25), 90 * UNIT);
        assertEq(tier.sharesOf(id), 0);
        assertEq(tier.lifetimeGross(), 120 * UNIT);
        assertFalse(tier.rewardEligible(id));
        assertEq(token.balanceOf(address(tier)), 3 * UNIT - memberClaim);
        assertEq(tier.totalProtectedLiability(), 3 * UNIT - memberClaim);
        assertTrue(tier.allocationLots(id, 0, 0, 100)[0].canceled);
    }

    function test_finalVestingIsExactAndOwnershipReceivesUnclaimedCreatorCredit() public {
        MembershipTier tier = _tier(false, 10_000);
        uint256 id = _pay(tier, alice, 12, referrer);
        vm.warp(START + 60);
        vm.prank(creator);
        tier.transferOwnership(bob);
        vm.prank(bob);
        tier.acceptOwnership();
        vm.warp(START + 120);
        tier.processAccounting(25);
        MembershipTypes.EarnedBalances memory earned =
        tier.previewAccounting(id, address(0), referrer, 0).settled;
        assertEq(earned.creator, 96 * UNIT);
        (uint256 retired, uint256 fraction) = tier.claimableRetiredReward(alice);
        assertEq(retired * Q + fraction + tier.reserveState().distributionDustScaled, 12 * UNIT * Q);
        assertEq(tier.allocationState(id).earnedScaled[1], 12 * UNIT * Q);
        assertEq(earned.referral, 6 * UNIT);
        assertEq(earned.protocol, 6 * UNIT);
        vm.prank(bob);
        assertEq(tier.withdrawCreatorProceeds(), 96 * UNIT);
        assertEq(token.balanceOf(bob), 96 * UNIT);
        vm.expectRevert();
        vm.prank(creator);
        tier.withdrawCreatorProceeds();
    }

    function test_freeReturnAndGrantHaveNoHistoricalWeight() public {
        MembershipTier tier = _tier(true, 10_000);
        uint256 id = _contribute(tier, alice, 120 * UNIT, referrer);
        vm.warp(START + 11);
        assertEq(tier.processExpirations(25).retiredCount, 1);
        assertEq(tier.sharesOf(id), 0);
        assertEq(tier.balanceOf(alice), 0);
        (uint256 available, uint256 fraction) = tier.claimableRetiredReward(alice);
        assertLe(12 * UNIT - available, 1);
        assertEq(
            available * Q + fraction + tier.reserveState().distributionDustScaled, 12 * UNIT * Q
        );
        vm.prank(alice);
        assertEq(tier.claimRetiredRewards(), available);
        vm.warp(START + 12);
        uint256 fresh = _contribute(tier, alice, 0, address(0));
        assertGt(fresh, id);
        assertTrue(tier.isActiveToken(fresh));
        assertFalse(tier.rewardEligible(fresh));
        vm.prank(creator);
        tier.addGrantTime(fresh, alice, 1, 25);
        vm.warp(START + 13);
        token.mint(alice, 1);
        vm.prank(alice);
        tier.renewContributionMembership(fresh, 1, referrer, 25);
        assertTrue(tier.rewardEligible(fresh));
        assertEq(tier.sharesOf(fresh), 1);
        assertEq(tier.sharesOf(id), 0);
        assertEq(tier.lifetimeGross(), 120 * UNIT + 1);
        MembershipTypes.AllocationLot[] memory lots = tier.allocationLots(fresh, 0, 0, 100);
        assertEq(lots.length, 1);
        assertEq(lots[0].start, START + 22);
        assertEq(lots[0].end, START + 32);
    }

    function test_freeExtensionPreservesEligibleWeightAndNoFundingNode() public {
        MembershipTier tier = _tier(true, 10_000);
        uint256 id = _contribute(tier, alice, 100 * UNIT, address(0));
        vm.warp(START + 5);
        vm.prank(alice);
        tier.renewContributionMembership(id, 0, address(0), 25);
        assertTrue(tier.rewardEligible(id));
        assertEq(tier.sharesOf(id), 100 * UNIT);
        assertEq(tier.allocationLots(id, 0, 0, 100).length, 1);
        vm.warp(START + 10);
        tier.processAccounting(25);
        assertEq(tier.accountingStatus().scheduledMembers, 0);
        assertTrue(
            (tier.tokensOfOwner(alice, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(alice, 0, 1).tokenIds[0]))
        );
    }

    function test_curveUsesExecutionCursorAndAdjacentPurchasesTelescope() public {
        MembershipTier tier = _tier(false, 15_000);
        uint256 first = _pay(tier, alice, 1, address(0));
        uint256 second = _pay(tier, bob, 1, address(0));
        uint256 gross = 20 * UNIT;
        uint256 horizon = 10_000 * UNIT;
        uint256 cumulative = gross + 5000 * gross * (2 * horizon - gross) / (20_000 * horizon);
        assertEq(tier.sharesOf(first) + tier.sharesOf(second), cumulative);
        assertGt(tier.sharesOf(first), tier.sharesOf(second));
        vm.prank(creator);
        tier.refund(first, alice, type(uint256).max, 25);
        assertEq(tier.lifetimeGross(), gross);
        assertEq(tier.sharesOf(first), 0);
        assertLt(tier.sharesOf(second), cumulative);
    }

    function test_incompleteMutationRevertsAtomicallyAndPermissionlessProgressPersists() public {
        MembershipTier tier = _tier(false, 10_000);
        for (uint256 i = 1; i <= 26; ++i) {
            _pay(tier, address((0x10000 + i).toUint160()), 1, address(0));
        }
        vm.warp(START + 10);
        token.mint(alice, 10 * UNIT);
        vm.prank(alice);
        token.approve(address(tier), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(MembershipTier.AccountingBehind.selector, START + 10, START + 10)
        );
        vm.prank(alice);
        tier.createMembership(1, address(0), 25);
        assertEq(tier.accountingStatus().accountedThrough, START);
        assertEq(tier.accountingStatus().scheduledMembers, 26);
        assertEq(token.balanceOf(alice), 10 * UNIT);
        assertEq(
            (tier.tokensOfOwner(alice, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(alice, 0, 1).tokenIds[0]),
            0
        );
        MembershipTypes.MaintenanceResult memory progress = tier.processAccounting(25);
        uint256 processed = progress.processedSteps;
        uint64 cursor = progress.accountedThrough;
        bool complete = progress.complete;
        assertEq(processed, 25);
        assertEq(cursor, START + 10);
        assertFalse(complete);
        assertGt(tier.creatorProceeds(), 0);
        vm.prank(creator);
        tier.setPaused(true);
        vm.prank(creator);
        assertGt(tier.withdrawCreatorProceeds(), 0); // settled claims remain available while behind and paused
        vm.prank(creator);
        tier.setPaused(false);
        assertEq(tier.processAccounting(25).processedSteps, 25);
        vm.prank(alice);
        tier.createMembership(1, address(0), 25);
        assertTrue(tier.accountingStatus().complete);
        assertEq(tier.lifetimeGross(), 270 * UNIT);
        assertEq(tier.accountingStatus().scheduledMembers, 1);
    }

    function test_combinedAdvanceSucceedsOnFractionalEarningThenRejectsIdleRepeat() public {
        MembershipTier tier = _tier(true, 10_000);
        _contribute(tier, alice, 1, address(0));
        vm.warp(START + 1);
        ProtocolBurnRouter router = ProtocolBurnRouter(factory.burnRouter());
        ProtocolBurnRouter.AdvanceTier[] memory tiers = new ProtocolBurnRouter.AdvanceTier[](1);
        tiers[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 1);
        ProtocolBurnRouter.Purchase[] memory purchases = new ProtocolBurnRouter.Purchase[](0);
        (uint256 steps, uint256 releases, uint256 buys, uint256 burned) =
            router.advance(tiers, purchases, START + 10);
        assertEq(steps + releases + buys + burned, 0);
        assertEq(tier.accountingStatus().accountedThrough, START + 1);
        assertGt(
            tier.previewAccounting(1, address(0), address(0), 0).settled.fractionalScaled[0], 0
        );
        vm.expectRevert(ProtocolBurnRouter.NothingToDo.selector);
        router.advance(tiers, purchases, START + 10);
    }

    function test_standardCancellationUsesSameReservedRefund() public {
        MembershipTier tier = _tier(false, 10_000);
        uint256 id = _pay(tier, alice, 1, referrer);
        vm.warp(START + 5);
        vm.prank(creator);
        tier.cancelSubscription(id);
        assertEq(token.balanceOf(alice), 5 * UNIT);
        assertEq(tier.lifetimeGross(), 10 * UNIT);
        assertFalse(tier.rewardEligible(id));
    }

    function test_refundQuoteTracksClockBeforeNextBoundaryWithoutSettlingCash() public {
        MembershipTier tier = _tier(false, 10_000);
        uint256 id = _pay(tier, alice, 12, referrer);
        vm.warp(START + 1);
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(id);
        assertEq(quote.accessAsOf, START + 1);
        assertEq(quote.accountingAsOf, START);
        assertFalse(quote.complete);
        assertEq(quote.grossRefund, 119 * UNIT);
        assertTrue(quote.projected);
        assertEq(quote.fundingAsOf, START + 1);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(id), 0);
        assertEq(tier.reserveState().unearnedScaled[0], 96 * UNIT * Q);
        uint256 gross = quote.grossRefund;
        uint256[4] memory funded = quote.fundingScaled;
        tier.processAccounting(25);
        quote = tier.previewRefund(id);
        assertTrue(quote.complete);
        assertFalse(quote.projected);
        assertEq(quote.grossRefund, gross);
        for (uint256 i; i < 4; ++i) {
            assertEq(quote.fundingScaled[i], funded[i]);
        }
    }

    function test_refundProjectionStopsAtAnyPendingGlobalBoundary() public {
        MembershipTier tier = _tier(false, 10_000);
        uint256 id = _pay(tier, alice, 2, referrer);
        _pay(tier, bob, 1, address(0));
        vm.warp(START + 5);
        tier.processAccounting(25);
        vm.warp(START + 10);
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(id);
        assertFalse(quote.complete);
        assertFalse(quote.projected);
        assertEq(quote.fundingAsOf, START + 5);
        assertEq(quote.grossRefund, 15 * UNIT);
        tier.processAccounting(25);
        quote = tier.previewRefund(id);
        assertTrue(quote.complete);
        assertEq(quote.grossRefund, 10 * UNIT);
    }

    function testFuzz_refundProjectionMatchesProcessedFundingAndResidues(
        uint112 gross,
        uint8 elapsed
    ) public {
        gross = uint112(bound(gross, 1, type(uint112).max));
        elapsed = uint8(bound(elapsed, 1, 9));
        MembershipTier tier = _tier(true, 30_000);
        uint256 id = _contribute(tier, alice, gross, referrer);
        vm.warp(START + elapsed);
        MembershipTypes.RefundPreview memory projected = tier.previewRefund(id);
        assertTrue(projected.projected);
        assertFalse(projected.complete);
        tier.processAccounting(25);
        MembershipTypes.RefundPreview memory settled = tier.previewRefund(id);
        assertTrue(settled.complete);
        assertFalse(settled.projected);
        assertEq(projected.grossRefund, settled.grossRefund);
        assertEq(projected.fundingAsOf, settled.accountingAsOf);
        for (uint256 i; i < 4; ++i) {
            assertEq(projected.fundingScaled[i], settled.fundingScaled[i]);
            assertEq(projected.cancellationScaled[i], settled.cancellationScaled[i]);
        }
    }

    function test_waitingFundedHeadProjectsNoEarningAcrossFreeAccess() public {
        MembershipTier tier = _tier(true, 10_000);
        uint256 id = _contribute(tier, alice, 0, address(0));
        token.mint(alice, 10 * UNIT);
        vm.prank(alice);
        tier.renewContributionMembership(id, 10 * UNIT, address(0), 25);
        vm.warp(START + 2);
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(id);
        assertTrue(quote.projected);
        assertEq(quote.grossRefund, 10 * UNIT);
        vm.warp(START + 10);
        assertFalse(tier.previewRefund(id).projected);
        tier.processAccounting(25);
        vm.warp(START + 11);
        quote = tier.previewRefund(id);
        assertTrue(quote.projected);
        assertEq(quote.grossRefund, 9 * UNIT);
        assertEq(tier.creatorProceeds(), 0);
    }

    function test_readPagesAreBoundedAndAccessTimestampCanBeNewerThanAccounting() public {
        MembershipTier tier = _tier(true, 10_000);
        uint256 id = _contribute(tier, alice, 10 * UNIT, address(0));
        vm.warp(START + 2);
        vm.prank(alice);
        tier.renewContributionMembership(id, 0, address(0), 25);
        MembershipTypes.RefundPreview memory preview = tier.previewRefund(id);
        assertEq(preview.accessAsOf, START + 2);
        assertEq(preview.accountingAsOf, START + 2);
        assertTrue(preview.complete);
        assertEq(preview.paidSeconds, 18);
        assertFalse(preview.projected);
        assertEq(preview.fundingAsOf, START + 2);
        assertEq(preview.grossRefund, 8 * UNIT);
        vm.expectRevert(VestingLedger.InvalidAllocationPageSize.selector);
        tier.allocationLots(id, 0, 0, 0);
        tier.allocationLots(id, 0, 0, 101);
        assertEq(tier.allocationLots(id, 0, type(uint256).max, 100).length, 0);
    }
}
