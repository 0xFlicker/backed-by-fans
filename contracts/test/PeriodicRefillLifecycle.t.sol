// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {PeriodicRefillFixture} from "./helpers/PeriodicRefillFixture.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {MembershipReceiver} from "./mocks/MembershipReceiver.sol";

contract PeriodicRefillLifecycleTest is PeriodicRefillFixture {
    function test_stopPreservesTimeAndRestartRequiresOwner() public {
        _target(2 * D);
        uint64 expiration = tier.expiresAt(1);
        vm.prank(MEMBER);
        tier.setApprovalForAll(EXECUTOR, true);
        vm.prank(EXECUTOR);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.stopRefill(1);
        vm.prank(MEMBER);
        tier.stopRefill(1);
        assertEq(tier.expiresAt(1), expiration);
        vm.expectRevert(MembershipTier.RefillNotEnrolled.selector);
        tier.refillMembership(1, 1, 25);
        _target(2 * D);
        assertEq(_run(1).periods, 1);
    }

    function test_pausePreservesIntentAndAllowsUpdateAndStop() public {
        _target(2 * D);
        vm.prank(CREATOR);
        tier.setPaused(true);
        _target(3 * D);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.refillMembership(1, 1, 25);
        vm.prank(CREATOR);
        tier.setPaused(false);
        assertEq(_run(1).periods, 1);
        vm.prank(CREATOR);
        tier.setPaused(true);
        vm.prank(MEMBER);
        tier.stopRefill(1);
        vm.prank(CREATOR);
        tier.setPaused(false);
        vm.expectRevert(MembershipTier.RefillNotEnrolled.selector);
        tier.refillMembership(1, 1, 25);
    }

    function test_allowanceRestorationResumesLiveEnrollmentButNeverExpired() public {
        _target(3 * D);
        vm.prank(CREATOR);
        tier.setPaused(true);
        vm.prank(MEMBER);
        token.approve(address(tier), 0);
        vm.prank(CREATOR);
        tier.setPaused(false);
        assertEq(_run(1).periods, 0);
        assertEq(tier.refillEnrollment(1).targetSeconds, 3 * D);
        vm.prank(MEMBER);
        token.approve(address(tier), P);
        assertEq(_run(1).periods, 1);
        vm.warp(tier.expiresAt(1));
        vm.prank(MEMBER);
        token.approve(address(tier), P);
        vm.expectRevert();
        tier.refillMembership(1, 1, 25);
        tier.processAccounting(25);
        assertEq(tier.refillEnrollment(1).targetSeconds, 0);
    }

    function test_refillThenCancelIncludesNewUnusedFunding() public {
        _target(2 * D);
        assertEq(_run(1).gross, P);
        uint256 before = token.balanceOf(MEMBER);
        vm.prank(MEMBER);
        (uint256 payout, uint256 retained) =
            tier.cancelMembership(1, MEMBER, 0, uint64(block.timestamp), 25);
        assertEq(payout, 2 * P * 7000 / 10_000);
        assertEq(retained + payout, 2 * P);
        assertEq(token.balanceOf(MEMBER) - before, payout);
        assertEq(tier.refillEnrollment(1).targetSeconds, 0);
        assertEq(tier.lifetimeGross(), 2 * P);
    }

    function test_cancelThenRefillCannotChargeOrRevive() public {
        _target(2 * D);
        vm.prank(MEMBER);
        tier.cancelMembership(1, MEMBER, 0, uint64(block.timestamp), 25);
        uint256 balance = token.balanceOf(MEMBER);
        vm.expectRevert();
        tier.refillMembership(1, 1, 25);
        assertEq(token.balanceOf(MEMBER), balance);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.lifetimeGross(), P);
    }

    function test_failedCancellationKeepsEnrollmentAndCanRefill() public {
        _target(2 * D);
        token.setTransferBehavior(AdversarialERC20.Behavior.RevertTransfer);
        vm.prank(MEMBER);
        vm.expectRevert();
        tier.cancelMembership(1, MEMBER, 0, uint64(block.timestamp), 25);
        assertEq(tier.refillEnrollment(1).targetSeconds, 2 * D);
        assertEq(_run(1).periods, 1);
    }

    function test_transferClearsWithoutCatchupAndNewOwnerMustOptIn() public {
        _target(2 * D);
        vm.warp(block.timestamp + 1 days);
        uint64 cursor = tier.accountingStatus().accountedThrough;
        vm.prank(MEMBER);
        tier.transferFrom(MEMBER, EXECUTOR, 1);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        assertEq(tier.refillEnrollment(1).authorizingOwner, address(0));
        vm.prank(MEMBER);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.setRefillTarget(1, D, address(0));
        vm.expectRevert(MembershipTier.RefillNotEnrolled.selector);
        tier.refillMembership(1, 1, 25);
        token.mint(EXECUTOR, P);
        vm.startPrank(EXECUTOR);
        token.approve(address(tier), P);
        tier.setRefillTarget(1, 2 * D, address(0));
        vm.stopPrank();
        uint256 oldBalance = token.balanceOf(MEMBER);
        assertEq(_run(1).periods, 1);
        assertEq(token.balanceOf(MEMBER), oldBalance);
        assertEq(token.balanceOf(EXECUTOR), 0);
    }

    function test_safeReceiverSeesNoIntentAndCannotRefillDuringCallback() public {
        _target(2 * D);
        MembershipReceiver receiver = new MembershipReceiver(tier);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(tier.refillEnrollment, (1));
        calls[1] = abi.encodeCall(tier.refillMembership, (1, 1, 25));
        receiver.configure(MembershipReceiver.Response.Accept, calls, false);
        vm.prank(MEMBER);
        tier.safeTransferFrom(MEMBER, address(receiver), 1);
        MembershipTypes.RefillEnrollment memory observed =
            abi.decode(receiver.result(0), (MembershipTypes.RefillEnrollment));
        assertEq(observed.authorizingOwner, address(0));
        assertFalse(receiver.succeeded(1));
    }

    function test_rejectedSafeTransferRestoresOriginalIntent() public {
        _target(2 * D);
        MembershipReceiver receiver = new MembershipReceiver(tier);
        receiver.configure(MembershipReceiver.Response.RevertCallback, new bytes[](0), false);
        vm.prank(MEMBER);
        vm.expectRevert(MembershipReceiver.ReceiverRejected.selector);
        tier.safeTransferFrom(MEMBER, address(receiver), 1);
        assertEq(tier.ownerOf(1), MEMBER);
        assertEq(tier.refillEnrollment(1).targetSeconds, 2 * D);
    }

    function test_failedGrantRevocationPreservesIntentThenSuccessfulRemovalRequiresRestart()
        public
    {
        vm.prank(CREATOR);
        tier.addGrantTime(1, MEMBER, 1, 25);
        _target(3 * D);
        vm.prank(CREATOR);
        vm.expectRevert();
        tier.revokeGrantTime(1, EXECUTOR, 25);
        assertEq(tier.refillEnrollment(1).targetSeconds, 3 * D);
        vm.prank(CREATOR);
        tier.revokeGrantTime(1, MEMBER, 25);
        assertEq(tier.refillEnrollment(1).targetSeconds, 0);
        vm.expectRevert(MembershipTier.RefillNotEnrolled.selector);
        tier.refillMembership(1, 1, 25);
        _target(3 * D);
        assertEq(_run(1).periods, 1);
    }

    function test_competingPositionsShareAllowanceWithoutReservation() public {
        uint256 second = _buy(1);
        _target(2 * D);
        vm.startPrank(MEMBER);
        tier.setRefillTarget(second, 2 * D, address(0));
        token.approve(address(tier), P);
        vm.stopPrank();
        assertEq(tier.previewRefill(1, 1).periods, 1);
        assertEq(tier.previewRefill(second, 1).periods, 1);
        assertEq(_run(1).periods, 1);
        assertEq(tier.refillMembership(second, 1, 25).periods, 0);
        assertEq(tier.lifetimeGross(), 3 * P);
    }

    function test_paymentTokenCallbackCannotReenterRefill() public {
        _target(3 * D);
        token.setCallback(address(tier), abi.encodeCall(tier.refillMembership, (1, 1, 25)));
        token.setTransferFromBehavior(AdversarialERC20.Behavior.Callback);
        assertEq(_run(1).periods, 1);
        assertEq(token.callbackAttempts(), 1);
        assertFalse(token.lastCallbackSucceeded());
        assertEq(tier.lifetimeGross(), 2 * P);
    }
}
