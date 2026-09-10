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
