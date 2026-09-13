// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ExpirationSchedule} from "../src/libraries/ExpirationSchedule.sol";
import {VestingLedger} from "../src/libraries/VestingLedger.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {VestingSchedulerHarness} from "./VestingScheduler.t.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {Test} from "forge-std/Test.sol";

contract AccountingPreviewHarness is VestingSchedulerHarness {
    ExpirationSchedule.State private expirations;
    constructor(uint64 start) VestingSchedulerHarness(start) {}

    function positionWeight(uint256 member, uint256 shares, bool eligible) external {
        VestingLedger.setWeight(ledger, member, shares, eligible);
        ExpirationSchedule.set(expirations, member, type(uint64).max);
    }

    function preview(uint256 member, address referrer, uint64 through, uint256 steps)
        external
        view
        returns (MembershipTypes.AccountingPreview memory)
    {
        return abi.decode(
            VestingLedger.encodedPreview(
                ledger, expirations, member, address(0), referrer, through, steps
            ),
            (MembershipTypes.AccountingPreview)
        );
    }

    function balances(uint256 member, address referrer, uint64 through)
        external
        view
        returns (MembershipTypes.EarnedBalances memory)
    {
        MembershipTypes.EarnedBalances memory result = abi.decode(
            VestingLedger.encodedBalances(ledger, member, referrer, through),
            (MembershipTypes.EarnedBalances)
        );
        result.status.scheduledExpirations = expirations.nodes.length;
        if (result.status.nextBoundary == 0 && expirations.nodes.length != 0) {
            result.status.nextBoundary = type(uint64).max;
            result.status.nextKind = MembershipTypes.BoundaryKind.Expiration;
        }
        return result;
    }
}

contract AccountingPreviewTest is Test {
    uint64 constant START = 1000;
    address constant REF = address(0xCAFE);
    AccountingPreviewHarness h;

    function setUp() public {
        new LinkedVestingFixture().install();
        h = new AccountingPreviewHarness(START);
    }

    function _compare(uint256 member, address referrer, uint64 through, uint256 budget) private {
        bytes32 before_ = keccak256(abi.encode(h.balances(member, referrer, through)));
        vm.record();
        MembershipTypes.AccountingPreview memory p = h.preview(member, referrer, through, budget);
        (, bytes32[] memory writes) = vm.accesses(address(h));
        assertEq(writes.length, 0, "preview must be STATICCALL-safe");
        assertEq(keccak256(abi.encode(p.settled)), before_, "stored baseline");
        assertEq(
            keccak256(abi.encode(h.balances(member, referrer, through))), before_, "no mutations"
        );
        uint256 done;
        uint256 delta;
        // A zero-budget view may integrate continuous time but never consume a due node.
        if (budget == 0) {
            if (h.count() == 0 || h.node(0).timestamp > through) {
                VestingLedger.ProcessResult memory r = h.process(through, 1);
                delta = r.earnedScaled;
            }
        } else {
            uint256 left = budget;
            while (left != 0) {
                uint256 step = left > 25 ? 25 : left;
                VestingLedger.ProcessResult memory r = h.process(through, step);
                done += r.processed;
                delta += r.earnedScaled;
                left -= step;
                if (r.complete) break;
            }
        }
        assertEq(done, p.processedSteps, "checkpoint count");
        assertEq(
            delta,
            p.earnedDeltaScaled[0] + p.earnedDeltaScaled[1] + p.earnedDeltaScaled[2]
                + p.earnedDeltaScaled[3],
            "allocation delta"
        );
        assertEq(
            keccak256(abi.encode(p.current)),
            keccak256(abi.encode(h.balances(member, referrer, through))),
            "exact projected state"
        );
    }

    function test_continuous120TokenExample() public {
        h.positionWeight(1, 7, true);
        h.fundAllocations(1, [uint256(60), 30, 6, 24], START, 120, REF);
        MembershipTypes.AccountingPreview memory p = h.preview(1, REF, START + 60, 25);
        assertEq(p.current.creator, 30);
        assertEq(p.current.protocol, 11); // The scaled rate rounds down until the final tail.
        // Floors include exact fixed-point rate and reward carry, just as the write path.
        assertEq(p.settled.creator, 0);
        _compare(1, REF, START + 60, 25);
        _compare(1, REF, START + 120, 25);
    }

    function test_ratesMatchLaterPreviewAndStopAtBoundary() public {
        h.positionWeight(1, 17, true);
        h.positionWeight(2, 13, true);
        h.fundAllocations(1, [uint256(120), 60, 30, 90], START, 120, REF);
        MembershipTypes.AccountingPreview memory a = h.preview(1, REF, START + 10, 25);
        MembershipTypes.AccountingPreview memory b = h.preview(1, REF, START + 20, 25);
        uint256[4] memory av =
            [a.current.creator, a.current.member, a.current.referral, a.current.protocol];
        uint256[4] memory bv =
            [b.current.creator, b.current.member, b.current.referral, b.current.protocol];
        for (uint256 i; i < 4; ++i) {
            uint256 estimated =
                av[i] * (1 << 128) + a.current.fractionalScaled[i] + a.ratesScaled[i] * 10;
            uint256 actual = bv[i] * (1 << 128) + b.current.fractionalScaled[i];
            assertApproxEqAbs(estimated, actual, 100, "scaled velocity rounding");
        }
        assertEq(a.current.status.nextBoundary, START + 120);
        assertEq(h.preview(1, REF, START + 120, 25).ratesScaled[0], 0);
        assertEq(h.preview(0, REF, START + 10, 25).ratesScaled[1], 0);
        assertEq(h.preview(1, address(0), START + 10, 25).ratesScaled[2], 0);
        assertEq(h.preview(1, REF, START + 120, 0).ratesScaled[0], 0);
    }

    function test_zeroBudgetAndEmptyHeap() public {
        _compare(0, REF, START + 50, 0);
    }

    function test_zeroBudgetDoesNotCrossBoundary() public {
        h.fund(1, 7, START, 3);
        _compare(1, REF, START + 3, 0);
    }

    function test_largeHeapReadIsBoundedByBudget() public {
        for (uint256 i = 1; i <= 1000; ++i) {
            h.fund(i, 11, START, 10);
        }
        vm.record();
        MembershipTypes.AccountingPreview memory p = h.preview(0, REF, START + 10, 1);
        (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(h));
        assertLt(reads.length, 150, "must not copy the complete heap");
        assertEq(writes.length, 0);
        assertEq(p.processedSteps, 1);
        assertFalse(p.current.status.complete);
        assertEq(p.current.status.nextBoundary, START + 10);
    }

    function test_previewAcceptsCallerBudgetAboveFormerCap() public view {
        h.preview(0, REF, START, 257);
    }

    function test_referralRestartCancellationAndSuspension() public {
        h.positionWeight(1, 17, true);
        h.fundAllocations(1, [uint256(17), 13, 11, 7], START, 3, REF);
        _compare(1, REF, START + 1, 25);
        h.claimMember(1);
        h.claimReferral(REF);
        h.cancel(1);
        h.positionWeight(1, 17, false);
        h.fundAllocations(1, [uint256(19), 13, 11, 7], START + 4, 7, REF);
        _compare(1, REF, START + 20, 25);
    }

    // forge-lint: disable-start(unsafe-typecast)
    // Each narrowing cast below follows an explicit small modulo bound.
    function testFuzz_frontierMatchesExecution(uint256 seed, uint16 stepSeed, uint16 timeSeed)
        public
    {
        uint256 count = 1 + seed % 32;
        for (uint256 member = 1; member <= count; ++member) {
            seed = uint256(keccak256(abi.encode(seed, member)));
            h.positionWeight(member, 1 + seed % 127, seed % 5 != 0);
            uint64 cursor = START + uint64(seed % 5);
            for (uint256 lot; lot < 5; ++lot) {
                seed = uint256(keccak256(abi.encode(seed, lot)));
                uint64 duration = 1 + uint64(seed % 17);
                h.fundAllocations(
                    member,
                    [uint256(1 + seed % 97), 31, 13, 7],
                    cursor,
                    duration,
                    seed % 2 == 0 ? REF : address(0xBEEF)
                );
                cursor += duration + uint64(seed % 3);
            }
        }
        _compare(1, REF, START + uint64(timeSeed % 130), uint256(stepSeed) % 257);
    }
}
