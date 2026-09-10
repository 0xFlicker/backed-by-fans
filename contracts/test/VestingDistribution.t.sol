// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {VestingSchedulerHarness} from "./VestingScheduler.t.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {Test} from "forge-std/Test.sol";

contract VestingDistributionTest is Test {
    uint64 private constant START = 1000;
    uint256 private constant Q = 1 << 128;
    VestingSchedulerHarness private ledger;

    function setUp() public {
        new LinkedVestingFixture().install();
        ledger = new VestingSchedulerHarness(START);
    }

    function test_lateJoinProduces225And75WithoutBackfill() public {
        ledger.weight(1, 1, true);
        ledger.fundAllocations(1, [uint256(0), 30, 0, 0], START, 30, address(0));
        ledger.process(START + 15, 25);
        ledger.weight(2, 1, true);
        ledger.process(START + 30, 25);
        assertEq(ledger.credit(1), 45 * Q / 2);
        assertEq(ledger.credit(2), 15 * Q / 2);
        assertEq(ledger.claimMember(1), 22);
        assertEq(ledger.credit(1), Q / 2);
    }

    function test_suspensionAndRestorationExcludeOnlySuspendedInterval() public {
        ledger.weight(1, 1, true);
        ledger.weight(2, 1, true);
        ledger.fundAllocations(1, [uint256(0), 30, 0, 0], START, 30, address(0));
        ledger.process(START + 10, 25);
        ledger.weight(2, 1, false);
        ledger.process(START + 20, 25);
        ledger.weight(2, 1, true);
        ledger.process(START + 30, 25);
        assertEq(ledger.credit(1), 20 * Q);
        assertEq(ledger.credit(2), 10 * Q);
    }

    function test_processingAndClaimsPreserveUnchangedVectorCarryExactly() public {
        VestingSchedulerHarness frequent = new VestingSchedulerHarness(START);
        ledger.weight(1, 7, true);
        ledger.weight(2, 6, true);
        frequent.weight(1, 7, true);
        frequent.weight(2, 6, true);
        ledger.fundAllocations(1, [uint256(0), 19, 0, 0], START, 31, address(0));
        frequent.fundAllocations(1, [uint256(0), 19, 0, 0], START, 31, address(0));
        uint256 paid1;
        uint256 paid2;
        for (uint64 t = 1; t <= 31; ++t) {
            frequent.process(START + t, 1);
            paid1 += frequent.claimMember(1);
            paid2 += frequent.claimMember(2);
            frequent.weight(1, 7, true); // unchanged vector is not a new epoch
        }
        ledger.process(START + 31, 1);
        assertEq(ledger.credit(1), frequent.credit(1) + paid1 * Q);
        assertEq(ledger.credit(2), frequent.credit(2) + paid2 * Q);
        assertEq(ledger.carry(), frequent.carry());
        assertEq(frequent.dust(), 0);
        assertEq(ledger.credit(1) + ledger.credit(2) + ledger.carry(), 19 * Q);
    }

    function test_emptyVectorAndRealVectorChangeProtectTheirOwnRemainders() public {
        ledger.fundAllocations(1, [uint256(0), 3, 0, 0], START, 3, address(0));
        ledger.process(START + 1, 1);
        assertEq(ledger.unassigned(), Q);
        ledger.weight(1, 7, true);
        ledger.process(START + 2, 1);
        uint256 previousCarry = ledger.carry();
        assertGt(previousCarry, 0);
        ledger.weight(1, 7, false);
        ledger.weight(2, 7, true); // unchanged total, different identity
        assertEq(ledger.carry(), 0);
        assertEq(ledger.dust(), previousCarry);
        ledger.process(START + 3, 1);
        assertEq(ledger.credit(1), Q / 7 * 7);
        assertEq(ledger.credit(2), Q / 7 * 7);
        assertEq(
            ledger.credit(1) + ledger.credit(2) + ledger.carry() + ledger.dust()
                + ledger.unassigned(),
            3 * Q
        );
    }

    function test_originalReferrersAccrueAtEffectiveBoundaryTimes() public {
        address original = address(0xA);
        address other = address(0xB);
        ledger.fundAllocations(1, [uint256(0), 0, 10, 0], START, 10, original);
        ledger.fundAllocations(1, [uint256(0), 0, 14, 0], START + 20, 7, other);
        ledger.fundAllocations(2, [uint256(0), 0, 15, 0], START + 5, 15, original);
        ledger.process(START + 27, 25);
        assertEq(ledger.referral(original), 25 * Q);
        assertEq(ledger.referral(other), 14 * Q);
        assertEq(ledger.claimReferral(original), 25);
        assertEq(ledger.referral(original), 0);
        assertEq(ledger.referral(other), 14 * Q);
    }

    function test_cancelUsesGenerationPrefixesAndKeepsAllEarnedBeneficiaries() public {
        ledger.weight(1, 1, true);
        ledger.fundAllocations(1, [uint256(96), 12, 6, 6], START, 12, address(0xA));
        ledger.fundAllocations(1, [uint256(80), 30, 5, 5], START + 20, 12, address(0xB));
        ledger.process(START + 3, 25);
        uint256 earnedMember = ledger.credit(1);
        uint256 earnedReferral = ledger.referral(address(0xA));
        (uint256 gross, uint256[4] memory funded, uint256[4] memory residue) =
            ledger.previewCancel(1);
        assertEq(gross, 210);
        assertEq(funded[0] + funded[1] + funded[2] + funded[3], 210 * Q);
        assertLt(
            residue[0] + residue[1] + residue[2] + residue[3], Q + 4 * uint256(type(uint64).max)
        );
        assertEq(ledger.cancel(1), gross);
        ledger.weight(1, 1, false);
        assertEq(ledger.generation(1), 1);
        ledger.process(START + 100, 25);
        assertEq(ledger.credit(1), earnedMember);
        assertEq(ledger.referral(address(0xA)), earnedReferral);
        assertEq(ledger.referral(address(0xB)), 0);
        assertEq(ledger.count(), 0);
    }

    function test_cancelGasDoesNotGrowWithFutureQueueLength() public {
        VestingSchedulerHarness shortQueue = new VestingSchedulerHarness(START);
        shortQueue.fund(1, 10, START + 10, 10);
        for (uint64 i; i < 64; ++i) {
            ledger.fund(1, 10, START + 10 + 10 * i, 10);
        }
        uint256 before = gasleft();
        assertEq(shortQueue.cancel(1), 10);
        uint256 shortGas = before - gasleft();
        before = gasleft();
        assertEq(ledger.cancel(1), 640);
        uint256 longGas = before - gasleft();
        assertLe(longGas, shortGas + 30_000);
        assertEq(ledger.count(), 0);
    }

    function test_incompleteEqualTimePreviewKeepsUnprocessedEndpointTailReserved() public {
        ledger.fund(1, 1, START, 7);
        ledger.fund(2, 1, START, 7);
        ledger.process(START + 7, 1);
        (uint256 gross,, uint256[4] memory residue) = ledger.previewCancel(2);
        assertEq(gross, 0);
        assertEq(residue[0], Q % 7);
        assertEq(ledger.reserved(), residue[0]);
        ledger.process(START + 7, 1);
        (gross,, residue) = ledger.previewCancel(2);
        assertEq(gross, 0);
        assertEq(residue[0], 0);
    }

    function test_maximumGrossAndTimeWithLargeWeightConserveEveryScaledUnit() public {
        VestingSchedulerHarness maximum = new VestingSchedulerHarness(0);
        uint256 gross = type(uint112).max;
        uint64 duration = type(uint64).max;
        uint256 quarter = gross / 4;
        maximum.weight(1, 10 * gross - 1, true);
        maximum.fundAllocations(
            1, [gross - 3 * quarter, quarter, quarter, quarter], 0, duration, address(0xA)
        );
        maximum.process(duration / 2, 1);
        uint256 memberPaid = maximum.claimMember(1);
        uint256 referralPaid = maximum.claimReferral(address(0xA));
        uint256 refunded = maximum.cancel(1);
        assertEq(refunded, gross * (duration - duration / 2) / duration);
        assertEq(maximum.liabilityScaled() + (memberPaid + referralPaid + refunded) * Q, gross * Q);
    }
}
