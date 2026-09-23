// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {PeriodicRefillFixture} from "./helpers/PeriodicRefillFixture.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";

contract PeriodicRefillIsolationTest is PeriodicRefillFixture {
    function test_lastLiveSecondCanRefillButExpirationCannot() public {
        _target(D);
        uint64 expiry = tier.expiresAt(1);
        vm.warp(expiry - 1);
        uint256 snap = vm.snapshotState();
        assertEq(_run(1).periods, 1);
        assertEq(tier.expiresAt(1), expiry + D);
        vm.revertToState(snap);
        vm.warp(expiry);
        vm.expectRevert();
        refill.refillMembership(1, 1, 25);
        vm.warp(expiry + 1);
        vm.expectRevert();
        refill.refillMembership(1, 1, 25);
        tier.processAccounting(25);
        vm.expectRevert();
        refill.refillMembership(1, 1, 25);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_noWorkDoesNotAttemptCatchupButPositiveRefillMustCompleteIt() public {
        _target(2 * D);
        for (uint256 i; i < 30; ++i) {
            vm.prank(CREATOR);
            tier.grantMembership(address(SafeCast.toUint160(0x1000 + i)), 1, 25);
        }
        vm.prank(MEMBER);
        tier.renewMembership(1, 1, address(0), 25);
        vm.warp(block.timestamp + D);
        uint64 cursor = tier.accountingStatus().accountedThrough;
        _target(1);
        assertEq(uint256(_run(1).reason), uint256(MembershipTypes.RefillReason.AtTarget));
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        _target(2 * D);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.AccountingBehind.selector,
                uint64(block.timestamp),
                uint64(block.timestamp)
            )
        );
        refill.refillMembership(1, 1, 1);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        MembershipTypes.MaintenanceResult memory progress = tier.processAccounting(1);
        assertEq(progress.processedSteps, 1);
        tier.processAccounting(100);
        assertTrue(tier.accountingStatus().complete);
        assertEq(_run(1).periods, 1);
    }

    function test_failedTokenDeliveryRollsBackCatchupAndDoesNotBlockMaintenanceOrClaims() public {
        _target(2 * D);
        vm.warp(block.timestamp + 7 days);
        uint64 cursor = tier.accountingStatus().accountedThrough;
        uint64 expiry = tier.expiresAt(1);
        uint256 balance = token.balanceOf(MEMBER);
        token.setTransferFromBehavior(AdversarialERC20.Behavior.RevertTransfer);
        vm.expectRevert();
        refill.refillMembership(1, 1, 25);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        assertEq(tier.expiresAt(1), expiry);
        assertEq(token.balanceOf(MEMBER), balance);
        assertEq(refill.refillEnrollment(1).targetSeconds, 2 * D);
        assertTrue(tier.processAccounting(25).complete);
        vm.prank(CREATOR);
        assertGt(tier.withdrawCreatorProceeds(), 0);
        vm.prank(MEMBER);
        assertGt(tier.claimReward(1, 25), 0);
        token.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
        assertEq(_run(1).periods, 1);
    }

    function test_inexactAndFalseTokenPaymentsCannotCommitRefill() public {
        _target(2 * D);
        AdversarialERC20.Behavior[3] memory bad = [
            AdversarialERC20.Behavior.ShortTransfer,
            AdversarialERC20.Behavior.TaxedTransfer,
            AdversarialERC20.Behavior.ReturnFalse
        ];
        uint64 expiry = tier.expiresAt(1);
        for (uint256 i; i < bad.length; ++i) {
            token.setTransferFromBehavior(bad[i]);
            vm.expectRevert();
            refill.refillMembership(1, 1, 25);
            assertEq(tier.expiresAt(1), expiry);
            assertEq(tier.lifetimeGross(), P);
        }
    }

    function test_insufficientAllowanceDoesNotAdvanceAccounting() public {
        _target(2 * D);
        vm.warp(block.timestamp + 1 days);
        vm.prank(MEMBER);
        token.approve(address(tier), P - 1);
        uint64 cursor = tier.accountingStatus().accountedThrough;
        assertEq(
            uint256(_run(10).reason), uint256(MembershipTypes.RefillReason.InsufficientAllowance)
        );
        assertEq(tier.accountingStatus().accountedThrough, cursor);
    }
}
