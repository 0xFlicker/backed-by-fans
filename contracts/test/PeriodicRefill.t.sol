// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {PeriodicRefillFixture} from "./helpers/PeriodicRefillFixture.sol";

contract PeriodicRefillTest is PeriodicRefillFixture {
    function test_manualOnePeriodCapAllowsFractionalOverhangButNotExactTwoPeriods() public {
        _deploy(1, true, P);
        _buy(1);
        vm.prank(MEMBER);
        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        tier.renewMembership(1, 1, address(0), 25);
        vm.warp(block.timestamp + 1);
        vm.prank(MEMBER);
        tier.renewMembership(1, 1, address(0), 25);
        (uint64 paid,,) = tier.timeBalances(1);
        assertEq(paid, 2 * D - 1);
    }

    function test_largerCapUsesSameExclusiveBoundary() public {
        _deploy(3, true, P);
        _buy(3);
        vm.prank(MEMBER);
        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        tier.renewMembership(1, 1, address(0), 25);
        vm.warp(block.timestamp + 1);
        vm.prank(MEMBER);
        tier.renewMembership(1, 1, address(0), 25);
        (uint64 paid,,) = tier.timeBalances(1);
        assertEq(paid, 4 * D - 1);
    }

    function test_contributionAndSponsorshipSharePaidCap() public {
        _deploy(1, false, 0);
        vm.prank(MEMBER);
        tier.createContributionMembership(0, address(0), 25);
        vm.warp(block.timestamp + 1);
        vm.prank(MEMBER);
        tier.renewContributionMembership(1, 0, address(0), 25);
        (uint64 paid,,) = tier.timeBalances(1);
        assertEq(paid, 2 * D - 1);
        _deploy(1, true, P);
        _buy(1);
        vm.warp(block.timestamp + 1);
        token.mint(EXECUTOR, P);
        vm.startPrank(EXECUTOR);
        token.approve(address(tier), P);
        tier.giftRenewal(1, MEMBER, 1, MembershipTypes.ReferralStatus.LockedNone, address(0), 25);
        vm.stopPrank();
        (paid,,) = tier.timeBalances(1);
        assertEq(paid, 2 * D - 1);
    }

    function test_approvalAloneIsNotEnrollmentAndOperatorCannotEnroll() public {
        assertEq(
            uint256(refill.previewRefill(1, 10).reason),
            uint256(MembershipTypes.RefillReason.NotEnrolled)
        );
        vm.prank(MEMBER);
        tier.approve(EXECUTOR, 1);
        vm.prank(EXECUTOR);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        refill.setRefillTarget(1, D, address(0));
        vm.prank(CREATOR);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        refill.setRefillTarget(1, D, address(0));
    }

    function test_creatorEnablesLaterWhilePausedWithoutEnrollmentOrCharge() public {
        _deploy(0, false, P);
        _buy(1);
        vm.prank(CREATOR);
        tier.setPaused(true);
        uint256 balance = token.balanceOf(MEMBER);
        vm.prank(CREATOR);
        refill.enablePeriodicRefill();
        assertTrue(tier.periodicEnabled());
        assertEq(refill.refillEnrollment(1).targetSeconds, 0);
        assertEq(token.balanceOf(MEMBER), balance);
        _target(D);
        assertEq(refill.refillEnrollment(1).authorizingOwner, MEMBER);
    }

    function test_fixedPositivePriceIsRequired() public {
        _deploy(0, false, 0);
        vm.prank(CREATOR);
        vm.expectRevert(MembershipTier.IncorrectPricingMode.selector);
        refill.enablePeriodicRefill();
    }

    function test_targetSevenRemainingSixBuysOneWholePeriod() public {
        _target(7 days);
        _remaining(6 days);
        uint256 before = token.balanceOf(MEMBER);
        uint64 expiry = tier.expiresAt(1);
        MembershipTypes.RefillPreview memory quote = refill.previewRefill(1, 10);
        assertEq(quote.desiredPeriods, 1);
        assertEq(quote.periods, 1);
        assertEq(quote.owner, MEMBER);
        assertEq(_run(10).periods, 1);
        assertEq(tier.expiresAt(1), expiry + D);
        assertEq(before - token.balanceOf(MEMBER), P);
        assertEq(token.balanceOf(EXECUTOR), 0);
    }

    function test_targetFortyFiveRemainingTenBuysTwo() public {
        _target(45 days);
        _remaining(10 days);
        assertEq(refill.previewRefill(1, 10).periods, 2);
        assertEq(_run(10).gross, 2 * P);
        (uint64 paid,,) = tier.timeBalances(1);
        assertEq(paid, 70 days);
    }

    function test_equalTargetBuysNothing() public {
        vm.prank(MEMBER);
        tier.renewMembership(1, 1, address(0), 25);
        _target(60 days);
        uint256 gross = tier.lifetimeGross();
        assertEq(uint256(_run(10).reason), uint256(MembershipTypes.RefillReason.AtTarget));
        assertEq(tier.lifetimeGross(), gross);
    }

    function test_partialWholePeriodAffordabilityAndCallerBound() public {
        _target(120 days);
        _remaining(10 days);
        vm.startPrank(MEMBER);
        assertTrue(token.transfer(address(0xD), token.balanceOf(MEMBER) - 55_000_000));
        token.approve(address(tier), 40_000_000);
        vm.stopPrank();
        MembershipTypes.RefillPreview memory quote = refill.previewRefill(1, 10);
        assertEq(quote.balance, 55_000_000);
        assertEq(quote.allowance, 40_000_000);
        assertEq(quote.periods, 2);
        assertEq(refill.previewRefill(1, 1).periods, 1);
        assertEq(_run(10).periods, 2);
        assertEq(token.balanceOf(MEMBER), 15_000_000);
        assertEq(_run(10).periods, 0);
    }

    function test_onePeriodRefillCanReachAlmostTwoPeriods() public {
        vm.prank(CREATOR);
        tier.setMaxPrepaidPeriods(1);
        _target(D);
        _remaining(D - 1);
        assertEq(_run(10).periods, 1);
        (uint64 paid,,) = tier.timeBalances(1);
        assertEq(paid, 2 * D - 1);
    }

    function test_reducedCapPreservesTargetAndLaterIncreaseResumes() public {
        _target(5 * D);
        vm.prank(CREATOR);
        tier.setMaxPrepaidPeriods(1);
        assertEq(refill.refillEnrollment(1).targetSeconds, 5 * D);
        assertEq(uint256(_run(10).reason), uint256(MembershipTypes.RefillReason.PaidTimeLimit));
        _remaining(D - 1);
        assertEq(_run(10).periods, 1);
        vm.prank(CREATOR);
        tier.setMaxPrepaidPeriods(5);
        assertEq(_run(10).periods, 4);
        assertEq(refill.refillEnrollment(1).targetSeconds, 5 * D);
    }

    function test_targetAdmissionAndExistingTimeAboveReducedCap() public {
        vm.prank(MEMBER);
        tier.renewMembership(1, 4, address(0), 25);
        _target(6 * D);
        vm.prank(CREATOR);
        tier.setMaxPrepaidPeriods(1);
        assertEq(uint256(_run(10).reason), uint256(MembershipTypes.RefillReason.PaidTimeLimit));
        vm.prank(MEMBER);
        vm.expectRevert(bytes4(keccak256("InvalidRefillTarget()")));
        refill.setRefillTarget(1, D + 1, address(0));
        assertEq(refill.refillEnrollment(1).targetSeconds, 6 * D);
        vm.prank(MEMBER);
        vm.expectRevert(bytes4(keccak256("InvalidRefillTarget()")));
        refill.setRefillTarget(1, 0, address(0));
    }

    function test_grantsCountTowardTargetButNotPaidCap() public {
        vm.prank(CREATOR);
        tier.addGrantTime(1, MEMBER, 3, 25);
        _target(4 * D);
        assertEq(uint256(_run(10).reason), uint256(MembershipTypes.RefillReason.AtTarget));
        vm.prank(CREATOR);
        tier.setMaxPrepaidPeriods(1);
        vm.warp(block.timestamp + 1);
        vm.prank(MEMBER);
        tier.renewMembership(1, 1, address(0), 25);
        (uint64 paid, uint64 granted,) = tier.timeBalances(1);
        assertEq(paid, 2 * D - 1);
        assertEq(granted, 3 * D);
    }

    function test_pendingReferralLocksOnlyOnFirstPaidRefill() public {
        vm.prank(CREATOR);
        uint256 id = tier.grantMembership(MEMBER, 1, 25);
        vm.prank(MEMBER);
        refill.setRefillTarget(id, 45 days, EXECUTOR);
        (MembershipTypes.ReferralStatus status,) = tier.referralOf(id);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        vm.prank(address(0xD));
        assertEq(refill.refillMembership(id, 1, 25).periods, 1);
        address chosen;
        (status, chosen) = tier.referralOf(id);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(chosen, EXECUTOR);
    }

    function test_interveningManualReferralLockWins() public {
        vm.prank(CREATOR);
        uint256 id = tier.grantMembership(MEMBER, 1, 25);
        vm.prank(MEMBER);
        refill.setRefillTarget(id, 90 days, EXECUTOR);
        vm.prank(MEMBER);
        tier.renewMembership(id, 1, address(0xD), 25);
        assertEq(refill.previewRefill(id, 1).effectiveReferral, address(0xD));
        vm.prank(EXECUTOR);
        refill.refillMembership(id, 1, 25);
        (, address chosen) = tier.referralOf(id);
        assertEq(chosen, address(0xD));
    }

    function test_grossCapacityProducesNumericNoWorkWithoutOverflow() public {
        uint256 price = type(uint112).max / 2 + 1;
        _deploy(0, true, price);
        token.mint(MEMBER, 3 * price);
        _buy(1);
        _target(2 * D);
        assertEq(
            uint256(_run(type(uint256).max).reason),
            uint256(MembershipTypes.RefillReason.NumericLimit)
        );
        assertEq(tier.lifetimeGross(), price);
    }

    function test_timestampHeadroomClampsWholePeriods() public {
        vm.warp(type(uint64).max - 2 * D + 1);
        _deploy(0, true, P);
        _buy(1);
        _target(2 * D - 1);
        assertEq(
            uint256(_run(type(uint256).max).reason),
            uint256(MembershipTypes.RefillReason.NumericLimit)
        );
    }

    function test_zeroBoundsAreRejectedEvenWithoutWork() public {
        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        refill.previewRefill(1, 0);
        vm.expectRevert(MembershipTier.InvalidAccountingSteps.selector);
        refill.refillMembership(1, 1, 0);
    }

    function test_pendingSelfReferralRejectedAndLockedChoiceMustMatch() public {
        vm.prank(CREATOR);
        uint256 id = tier.grantMembership(MEMBER, 1, 25);
        vm.prank(MEMBER);
        vm.expectRevert(MembershipTier.SelfReferralNotAllowed.selector);
        refill.setRefillTarget(id, D, MEMBER);
        vm.prank(MEMBER);
        vm.expectRevert(MembershipTier.ReferralChoiceMismatch.selector);
        refill.setRefillTarget(1, D, EXECUTOR);
        assertEq(refill.refillEnrollment(id).authorizingOwner, address(0));
    }

    function test_stopAndTargetUpdateDoNotCatchUpOrCharge() public {
        vm.warp(block.timestamp + 1 days);
        uint64 cursor = tier.accountingStatus().accountedThrough;
        uint256 balance = token.balanceOf(MEMBER);
        _target(2 * D);
        _target(3 * D);
        vm.prank(MEMBER);
        refill.stopRefill(1);
        assertEq(refill.refillEnrollment(1).authorizingOwner, address(0));
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        assertEq(token.balanceOf(MEMBER), balance);
        vm.expectRevert(MembershipTier.RefillNotEnrolled.selector);
        _run(1);
    }

    function test_selfTransferAndCancellationClearAllIntent() public {
        _target(2 * D);
        vm.prank(MEMBER);
        tier.transferFrom(MEMBER, MEMBER, 1);
        assertEq(refill.refillEnrollment(1).targetSeconds, 0);
        _target(2 * D);
        uint256 gross = tier.lifetimeGross();
        vm.prank(MEMBER);
        tier.cancelMembership(1, MEMBER, 0, uint64(block.timestamp), 25);
        assertEq(refill.refillEnrollment(1).authorizingOwner, address(0));
        assertEq(refill.refillEnrollment(1).pendingReferralChoice, address(0));
        assertEq(tier.lifetimeGross(), gross);
    }

    function test_grantRevocationClearsOnlyWhenTimeActuallyRemoved() public {
        _target(2 * D);
        vm.prank(CREATOR);
        vm.expectRevert(MembershipTier.NoGrantTime.selector);
        tier.revokeGrantTime(1, MEMBER, 25);
        assertEq(refill.refillEnrollment(1).targetSeconds, 2 * D);
        vm.prank(CREATOR);
        tier.addGrantTime(1, MEMBER, 1, 25);
        vm.prank(CREATOR);
        tier.revokeGrantTime(1, MEMBER, 25);
        assertEq(refill.refillEnrollment(1).targetSeconds, 0);
        assertTrue(tier.isActiveToken(1));
        vm.prank(CREATOR);
        uint256 id = tier.grantMembership(MEMBER, 1, 25);
        vm.prank(MEMBER);
        refill.setRefillTarget(id, 2 * D, EXECUTOR);
        vm.prank(CREATOR);
        tier.revokeGrantTime(id, MEMBER, 25);
        assertEq(refill.refillEnrollment(id).pendingReferralChoice, address(0));
        assertFalse(tier.isOccupied(id));
    }
}
