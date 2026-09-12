// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {VestingLedger} from "../src/libraries/VestingLedger.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {Test} from "forge-std/Test.sol";

contract VestingSchedulerHarness {
    VestingLedger.State internal ledger;

    constructor(uint64 start) {
        VestingLedger.initialize(ledger, start);
    }

    function fund(uint256 member, uint256 gross, uint64 start, uint64 duration) external {
        uint256[4] memory allocations;
        allocations[0] = gross;
        VestingLedger.append(ledger, member, allocations, start, duration, address(0));
    }

    function process(uint64 through, uint256 steps)
        external
        returns (VestingLedger.ProcessResult memory)
    {
        return VestingLedger.process(ledger, through, steps);
    }

    function advance(uint64 through, uint256 steps)
        external
        returns (VestingLedger.ProcessResult memory)
    {
        return VestingLedger.advanceTo(ledger, through, steps);
    }

    function retire(uint256 member, address beneficiary) external returns (uint256) {
        return VestingLedger.retireMember(ledger, member, beneficiary);
    }

    function advanceAndRetire(uint64 through, uint256 steps, uint256 member, address beneficiary)
        external
    {
        VestingLedger.advanceTo(ledger, through, steps);
        VestingLedger.retireMember(ledger, member, beneficiary);
    }

    function retired(address beneficiary) external view returns (uint256) {
        return ledger.retiredCreditScaled[beneficiary];
    }

    function totalShares() external view returns (uint256) {
        return ledger.totalShares;
    }

    function accountingFingerprint() external view returns (bytes32) {
        return keccak256(
            abi.encode(
                ledger.accountedThrough,
                ledger.heap,
                ledger.earnedScaled,
                ledger.unearnedScaled,
                ledger.activeRates,
                ledger.rewardPerShare,
                ledger.rewardCarry,
                ledger.distributionDust,
                ledger.unassigned,
                ledger.totalShares
            )
        );
    }

    function fundAllocations(
        uint256 member,
        uint256[4] memory amounts,
        uint64 start,
        uint64 duration,
        address referrer
    ) external {
        VestingLedger.append(ledger, member, amounts, start, duration, referrer);
    }

    function weight(uint256 member, uint256 shares, bool eligible) external {
        VestingLedger.setWeight(ledger, member, shares, eligible);
    }

    function credit(uint256 member) external view returns (uint256) {
        return VestingLedger.memberCredit(ledger, member);
    }

    function referral(address referrer) external view returns (uint256) {
        return VestingLedger.referrerCredit(ledger, referrer);
    }

    function claimMember(uint256 member) external returns (uint256) {
        return VestingLedger.takeMember(ledger, member);
    }

    function claimReferral(address referrer) external returns (uint256) {
        return VestingLedger.takeReferrer(ledger, referrer);
    }

    function carry() external view returns (uint256) {
        return ledger.rewardCarry;
    }

    function dust() external view returns (uint256) {
        return ledger.distributionDust;
    }

    function unassigned() external view returns (uint256) {
        return ledger.unassigned;
    }

    function generation(uint256 member) external view returns (uint256) {
        return ledger.funding[member].generation;
    }

    function liabilityScaled() external view returns (uint256 result) {
        result = ledger.rewardCarry + ledger.distributionDust + ledger.unassigned;
        for (uint256 i; i < 4; ++i) {
            result += ledger.earnedScaled[i] + ledger.unearnedScaled[i]
            + ledger.cancellationScaled[i];
        }
    }

    function previewCancel(uint256 member)
        external
        view
        returns (uint256, uint256[4] memory, uint256[4] memory)
    {
        return VestingLedger.previewCancellation(ledger, member);
    }

    function cancel(uint256 member) external returns (uint256) {
        (uint256 gross,,) = VestingLedger.cancelFunding(ledger, member);
        return gross;
    }

    function node(uint256 index) external view returns (VestingLedger.Node memory) {
        return ledger.heap[index];
    }

    function count() external view returns (uint256) {
        return ledger.heap.length;
    }

    function position(uint256 member) external view returns (uint256) {
        return ledger.heapPosition[member];
    }

    function earned() external view returns (uint256) {
        return ledger.earnedScaled[0];
    }

    function reserved() external view returns (uint256) {
        return ledger.unearnedScaled[0];
    }
}

contract VestingSchedulerTest is Test {
    uint64 private constant START = 1000;
    uint256 private constant Q = 1 << 128;
    VestingSchedulerHarness private scheduler;

    function setUp() public {
        new LinkedVestingFixture().install();
        scheduler = new VestingSchedulerHarness(START);
    }

    function test_oneNodePerMemberAcrossAdjacentAndGappedLots() public {
        scheduler.fund(1, 10, START, 10);
        scheduler.fund(1, 20, START + 10, 10);
        scheduler.fund(1, 30, START + 30, 10);
        assertEq(scheduler.count(), 1);
        assertEq(scheduler.node(0).timestamp, START + 10);
        assertFalse(scheduler.node(0).isStart);

        VestingLedger.ProcessResult memory first = scheduler.process(START + 20, 1);
        assertEq(first.processed, 1);
        assertEq(first.accountedThrough, START + 10);
        assertFalse(first.complete);
        assertEq(scheduler.earned(), 10 * Q);
        assertEq(scheduler.count(), 1);
        assertEq(scheduler.node(0).timestamp, START + 20);
        assertFalse(scheduler.node(0).isStart);

        VestingLedger.ProcessResult memory second = scheduler.process(START + 25, 1);
        assertTrue(second.complete);
        assertEq(second.accountedThrough, START + 25);
        assertEq(scheduler.earned(), 30 * Q);
        assertTrue(scheduler.node(0).isStart);
        assertEq(scheduler.node(0).timestamp, START + 30);
        VestingLedger.ProcessResult memory gap = scheduler.process(START + 29, 1);
        assertEq(gap.processed, 0);
        assertEq(gap.earnedScaled, 0);
        scheduler.process(START + 40, 2);
        assertEq(scheduler.earned(), 60 * Q);
        assertEq(scheduler.reserved(), 0);
        assertEq(scheduler.count(), 0);
        assertEq(scheduler.position(1), 0);
    }

    function test_equalTimeUsesTokenIdAndCursorAloneDoesNotMeanComplete() public {
        scheduler.fund(9, 10, START, 10);
        scheduler.fund(2, 10, START, 10);
        scheduler.fund(5, 10, START, 10);
        assertEq(scheduler.node(0).tokenId, 2);
        VestingLedger.ProcessResult memory result = scheduler.process(START + 10, 1);
        assertEq(result.accountedThrough, START + 10);
        assertFalse(result.complete);
        assertEq(scheduler.node(0).tokenId, 5);
        result = scheduler.process(START + 10, 1);
        assertFalse(result.complete);
        assertEq(scheduler.node(0).tokenId, 9);
        result = scheduler.process(START + 10, 1);
        assertTrue(result.complete);
        assertEq(scheduler.count(), 0);
        assertEq(scheduler.earned(), 30 * Q);
        result = scheduler.process(START + 100, 25);
        assertEq(result.processed, 0);
        assertEq(result.earnedScaled, 0);
        assertTrue(result.complete);
    }

    function test_futureStartEarnsNothingAndCostsItsOwnStep() public {
        scheduler.fund(1, 120, START + 10, 12);
        assertTrue(scheduler.node(0).isStart);
        VestingLedger.ProcessResult memory result = scheduler.process(START + 9, 1);
        assertEq(result.processed, 0);
        assertEq(result.earnedScaled, 0);
        result = scheduler.process(START + 22, 1);
        assertEq(result.processed, 1);
        assertEq(result.accountedThrough, START + 10);
        assertFalse(result.complete);
        assertEq(scheduler.earned(), 0);
        assertFalse(scheduler.node(0).isStart);
        result = scheduler.process(START + 22, 1);
        assertTrue(result.complete);
        assertEq(scheduler.earned(), 120 * Q);
    }

    function test_freeTimeCannotCreateFundingAndIdleProgressHasNoEarnedValue() public {
        vm.expectRevert(VestingLedger.InvalidFunding.selector);
        scheduler.fund(1, 0, START, 10);
        assertEq(scheduler.count(), 0);
        VestingLedger.ProcessResult memory result = scheduler.process(START + 10, 1);
        assertEq(result.processed, 0);
        assertEq(result.earnedScaled, 0);
        assertEq(result.accountedThrough, START + 10);
        assertTrue(result.complete);
    }

    function test_indexedRemovalInvalidatesOnlyCanceledMember() public {
        scheduler.fund(1, 20, START + 10, 20);
        scheduler.fund(2, 30, START + 20, 30);
        scheduler.fund(3, 40, START + 30, 40);
        scheduler.fund(2, 50, START + 50, 10);
        assertEq(scheduler.cancel(2), 80);
        assertEq(scheduler.count(), 2);
        assertEq(scheduler.position(2), 0);
        scheduler.fund(2, 7, START + 5, 7);
        assertEq(scheduler.count(), 3);
        assertEq(scheduler.node(0).tokenId, 2);
        scheduler.process(START + 100, 25);
        assertEq(scheduler.count(), 0);
        assertEq(scheduler.earned(), 67 * Q);
        assertEq(scheduler.reserved(), 0);
    }

    function test_zeroReferralClaimBeforeAndBetweenStreamsDoesNotBackdateNewEarnings() public {
        address referrer = address(123);
        scheduler.process(START + 10, 1);
        assertEq(scheduler.claimReferral(referrer), 0);
        scheduler.fundAllocations(1, [uint256(0), 0, 100, 0], START + 10, 10, referrer);
        scheduler.process(START + 15, 1);
        assertEq(scheduler.claimReferral(referrer), 50);
        scheduler.process(START + 20, 1);
        assertEq(scheduler.claimReferral(referrer), 50);
        scheduler.process(START + 30, 1);
        assertEq(scheduler.claimReferral(referrer), 0);
        scheduler.fundAllocations(1, [uint256(0), 0, 100, 0], START + 30, 10, referrer);
        scheduler.process(START + 35, 1);
        assertEq(scheduler.claimReferral(referrer), 50);
        scheduler.process(START + 40, 1);
        assertEq(scheduler.claimReferral(referrer), 50);
        assertEq(scheduler.liabilityScaled(), 0);
    }

    function test_cancelAfterRootReplacementCannotReviveOldGeneration() public {
        scheduler.fund(1, 100, START, 10);
        scheduler.fund(1, 200, START + 10, 20);
        scheduler.fund(2, 300, START, 20);
        scheduler.process(START + 11, 1);
        assertEq(scheduler.cancel(1), 190);
        assertEq(scheduler.position(1), 0);
        assertEq(scheduler.generation(1), 1);
        scheduler.fund(1, 90, START + 15, 10);
        scheduler.process(START + 100, 25);
        assertEq(scheduler.count(), 0);
        assertEq(scheduler.earned() / Q, 100 + 10 + 300 + 90);
        assertEq(scheduler.reserved(), 0);
    }

    function testFuzz_replacementOrderingAcrossAdjacentLotsAndGaps(uint256 seed, uint8 size)
        public
    {
        uint256 count = bound(size, 1, 16);
        uint64[] memory first = new uint64[](count);
        uint64[] memory second = new uint64[](count);
        uint8[] memory step = new uint8[](count);
        for (uint256 i; i < count; ++i) {
            // Each bounded duration is 1..10, so narrowing cannot discard bits.
            first[i] = uint64(1 + uint256(keccak256(abi.encode(seed, i))) % 10);
            second[i] = uint64(1 + uint256(keccak256(abi.encode(i, seed))) % 10);
            scheduler.fund(i + 1, 100, START, first[i]);
            scheduler.fund(i + 1, 200, START + first[i], second[i]);
            scheduler.fund(i + 1, 300, START + first[i] + second[i] + 5, 10);
        }
        for (uint256 processed; processed < count * 4; ++processed) {
            uint256 expected;
            uint64 earliest = type(uint64).max;
            for (uint256 i; i < count; ++i) {
                if (step[i] == 4) continue;
                uint64 time = START + first[i];
                if (step[i] >= 1) time += second[i];
                if (step[i] >= 2) time += 5;
                if (step[i] == 3) time += 10;
                if (time < earliest) {
                    earliest = time;
                    expected = i;
                }
            }
            VestingLedger.Node memory next = scheduler.node(0);
            assertEq(next.tokenId, expected + 1);
            assertEq(next.timestamp, earliest);
            assertEq(next.isStart, step[expected] == 2);
            ++step[expected];
            assertEq(scheduler.process(START + 100, 1).processed, 1);
            for (uint256 i; i < scheduler.count(); ++i) {
                assertEq(scheduler.position(scheduler.node(i).tokenId), i + 1);
            }
        }
        assertEq(scheduler.count(), 0);
        assertEq(scheduler.earned(), count * 600 * Q);
        assertEq(scheduler.reserved(), 0);
    }

    function test_invalidBudgetAndChronologyFailBeforeProgress() public {
        scheduler.fund(1, 10, START, 10);
        vm.expectRevert(VestingLedger.InvalidAccountingSteps.selector);
        scheduler.process(START + 10, 0);
        vm.expectRevert(VestingLedger.InvalidAccountingSteps.selector);
        scheduler.process(START + 10, 101);
        vm.expectRevert(VestingLedger.AccountingInvariant.selector);
        scheduler.process(START - 1, 1);
        assertEq(scheduler.earned(), 0);
        assertEq(scheduler.count(), 1);
    }

    function test_allEqualTimeFundingTailsSettleBeforeRetirement() public {
        scheduler.weight(1, 1, true);
        scheduler.weight(2, 2, true);
        scheduler.fundAllocations(9, [uint256(0), 1, 0, 0], START, 3, address(0));
        scheduler.fundAllocations(2, [uint256(0), 1, 0, 0], START, 3, address(0));
        scheduler.fundAllocations(5, [uint256(0), 1, 0, 0], START, 3, address(0));

        VestingLedger.ProcessResult memory first = scheduler.advance(START + 3, 1);
        assertEq(first.processed, 1);
        assertEq(first.accountedThrough, START + 3);
        assertFalse(first.complete);
        assertEq(scheduler.node(0).tokenId, 5);
        // Each duration-three stream leaves one scaled unit at its END.
        assertEq(first.earnedScaled, 3 * Q - 2);
        assertEq(scheduler.credit(1), Q - 1);
        assertEq(scheduler.carry(), 1);
        vm.expectRevert(VestingLedger.AccountingInvariant.selector);
        scheduler.retire(1, address(11));
        assertEq(scheduler.totalShares(), 3);
        assertEq(scheduler.retired(address(11)), 0);

        VestingLedger.ProcessResult memory second = scheduler.advance(START + 3, 1);
        assertFalse(second.complete);
        assertEq(second.earnedScaled, 1);
        assertEq(scheduler.node(0).tokenId, 9);
        assertEq(scheduler.carry(), 2);
        VestingLedger.ProcessResult memory last = scheduler.advance(START + 3, 1);
        assertEq(last.processed, 1);
        assertTrue(last.complete, "final permitted END must complete the funding phase");
        assertEq(last.earnedScaled, 1);
        assertEq(scheduler.retire(1, address(11)), Q);
        assertEq(scheduler.credit(1), 0);
        assertEq(scheduler.retired(address(11)), Q);
        assertEq(scheduler.credit(2), 2 * Q);
        assertEq(scheduler.totalShares(), 2);
        assertEq(scheduler.carry(), 0);
        assertEq(scheduler.dust(), 0);
    }

    function test_equalTimeFutureStartMustFinishBeforeRetirementAndEarnsOnlyAfterIt() public {
        scheduler.weight(1, 1, true);
        scheduler.weight(2, 1, true);
        scheduler.fundAllocations(1, [uint256(0), 2, 0, 0], START, 3, address(0));
        scheduler.fundAllocations(9, [uint256(0), 6, 0, 0], START + 3, 3, address(0));

        VestingLedger.ProcessResult memory first = scheduler.advance(START + 3, 1);
        assertFalse(first.complete);
        assertEq(scheduler.node(0).tokenId, 9);
        assertTrue(scheduler.node(0).isStart);
        vm.expectRevert(VestingLedger.AccountingInvariant.selector);
        scheduler.retire(1, address(11));
        VestingLedger.ProcessResult memory start = scheduler.advance(START + 3, 1);
        assertTrue(start.complete);
        assertEq(start.earnedScaled, 0, "starting funding has no immediate earnings");
        assertEq(scheduler.retire(1, address(11)), Q);

        vm.warp(START + 100);
        assertTrue(scheduler.advance(START + 6, 1).complete);
        assertEq(scheduler.retired(address(11)), Q);
        assertEq(scheduler.credit(2), 7 * Q);
        assertEq(scheduler.liabilityScaled(), 8 * Q);
    }

    function test_retirementFailureRollsBackAttemptedFundingProgress() public {
        scheduler.weight(1, 1, true);
        scheduler.fundAllocations(1, [uint256(0), 1, 0, 0], START, 3, address(0));
        scheduler.fundAllocations(2, [uint256(0), 1, 0, 0], START, 3, address(0));
        bytes32 before = scheduler.accountingFingerprint();

        vm.expectRevert(VestingLedger.AccountingInvariant.selector);
        scheduler.advanceAndRetire(START + 3, 1, 1, address(11));
        assertEq(scheduler.accountingFingerprint(), before);
        assertEq(scheduler.node(0).tokenId, 1);
        assertEq(scheduler.credit(1), 0);
        assertEq(scheduler.retired(address(11)), 0);
        assertEq(scheduler.position(1), 1);

        scheduler.advanceAndRetire(START + 3, 2, 1, address(11));
        assertEq(scheduler.retired(address(11)), 2 * Q);
        assertEq(scheduler.totalShares(), 0);
        assertEq(scheduler.count(), 0);
    }

    function test_zeroRemainingBudgetIntegratesOnlyBeforeNextFundingBoundary() public {
        scheduler.weight(1, 1, true);
        scheduler.fundAllocations(1, [uint256(0), 1, 0, 0], START, 3, address(0));
        VestingLedger.ProcessResult memory before = scheduler.advance(START + 2, 0);
        assertEq(before.processed, 0);
        assertTrue(before.complete);
        assertEq(before.accountedThrough, START + 2);
        assertEq(before.earnedScaled, 2 * (Q / 3));
        bytes32 fingerprint = scheduler.accountingFingerprint();

        VestingLedger.ProcessResult memory blocked = scheduler.advance(START + 4, 0);
        assertFalse(blocked.complete);
        assertEq(blocked.processed, 0);
        assertEq(blocked.earnedScaled, 0);
        assertEq(blocked.accountedThrough, START + 2);
        assertEq(scheduler.accountingFingerprint(), fingerprint);

        assertTrue(scheduler.advance(START + 3, 1).complete);
        assertEq(scheduler.retire(1, address(11)), Q);
        VestingLedger.ProcessResult memory idle = scheduler.advance(START + 4, 0);
        assertTrue(idle.complete);
        assertEq(idle.processed, 0);
        assertEq(idle.accountedThrough, START + 4);
        assertEq(idle.earnedScaled, 0);
    }

    function testFuzz_retirementCreditAndDustAreIdenticalAcrossDelaysAndBatchSplits(uint8 steps)
        public
    {
        uint256 budget = bound(steps, 1, 25);
        VestingSchedulerHarness punctual = _retirementHistory();
        VestingSchedulerHarness delayed = _retirementHistory();
        for (uint64 time = START + 1; time <= START + 9; ++time) {
            vm.warp(time);
            _advanceFully(punctual, time, 1);
            if (time == START + 3) punctual.retire(1, address(11));
            if (time == START + 6) punctual.retire(2, address(22));
        }

        // The caller supplies historical expiration boundaries even though the
        // actual clock has advanced beyond both. No wall-clock eligibility filter
        // may discard the index earnings accumulated through those boundaries.
        vm.warp(START + 100);
        _advanceFully(delayed, START + 3, budget);
        delayed.retire(1, address(11));
        _advanceFully(delayed, START + 6, budget);
        delayed.retire(2, address(22));
        _advanceFully(delayed, START + 9, budget);

        uint256 firstIndex = 10 * Q / 7;
        uint256 secondIndex = 12 * Q / 5;
        uint256 expectedDust = 10 * Q % 7 + 12 * Q % 5;
        assertEq(delayed.retired(address(11)), 2 * firstIndex);
        assertEq(delayed.retired(address(22)), 5 * firstIndex + 5 * secondIndex);
        assertEq(delayed.dust(), expectedDust);
        assertEq(delayed.unassigned(), 6 * Q);
        assertEq(delayed.liabilityScaled(), 28 * Q);
        assertEq(delayed.totalShares(), 0);
        assertEq(delayed.count(), 0);
        assertEq(delayed.credit(1), 0);
        assertEq(delayed.credit(2), 0);
        assertEq(delayed.accountingFingerprint(), punctual.accountingFingerprint());
        assertEq(delayed.retired(address(11)), punctual.retired(address(11)));
        assertEq(delayed.retired(address(22)), punctual.retired(address(22)));
    }

    function _retirementHistory() private returns (VestingSchedulerHarness result) {
        result = new VestingSchedulerHarness(START);
        result.weight(1, 2, true);
        result.weight(2, 5, true);
        result.fundAllocations(10, [uint256(0), 2, 0, 0], START, 3, address(0));
        result.fundAllocations(20, [uint256(0), 3, 0, 0], START, 3, address(0));
        result.fundAllocations(30, [uint256(0), 5, 0, 0], START, 3, address(0));
        result.fundAllocations(30, [uint256(0), 12, 0, 0], START + 3, 6, address(0));
        result.fundAllocations(7, [uint256(0), 6, 0, 0], START + 3, 3, address(0));
    }

    function _advanceFully(VestingSchedulerHarness target, uint64 through, uint256 budget) private {
        for (uint256 i; i < 8; ++i) {
            if (target.advance(through, budget).complete) return;
        }
        fail("bounded funding history must finish");
    }

    function testFuzz_heapOrderingAndPositionsSurviveEveryPop(uint256 seed, uint8 size) public {
        uint256 count = bound(size, 1, 32);
        uint256 total;
        for (uint256 member = 1; member <= count; ++member) {
            uint64 duration = uint64(1 + uint256(keccak256(abi.encode(seed, member))) % 100);
            scheduler.fund(member, member, START, duration);
            total += member;
        }
        uint64 previousTime;
        uint256 previousMember;
        for (uint256 processed; processed < count; ++processed) {
            VestingLedger.Node memory current = scheduler.node(0);
            assertTrue(
                current.timestamp > previousTime
                    || (current.timestamp == previousTime && current.tokenId > previousMember)
            );
            previousTime = current.timestamp;
            previousMember = current.tokenId;
            VestingLedger.ProcessResult memory result = scheduler.process(START + 100, 1);
            assertEq(result.processed, 1);
            assertEq(scheduler.position(current.tokenId), 0);
            for (uint256 index; index < scheduler.count(); ++index) {
                assertEq(scheduler.position(scheduler.node(index).tokenId), index + 1);
            }
        }
        assertEq(scheduler.count(), 0);
        assertEq(scheduler.earned(), total * Q);
        assertEq(scheduler.reserved(), 0);
    }
}
