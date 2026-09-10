// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";

import {VestingLedger} from "../src/libraries/VestingLedger.sol";
import {VestingFixtures} from "./helpers/VestingFixtures.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {VestingLedgerHarness} from "./mocks/VestingLedgerHarness.sol";
import {Test} from "forge-std/Test.sol";

contract VestingLedgerTest is Test {
    uint256 private constant Q = 1 << 128;
    MockUSDG private token;
    VestingLedgerHarness private harness;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(VestingFixtures.START);
        token = new MockUSDG();
        harness = new VestingLedgerHarness(token);
        token.mint(address(this), 1_000_000_000);
        token.approve(address(harness), type(uint256).max);
    }

    function test_allAllocationsZeroAtPurchaseAndExactAtEnd() public {
        harness.fund(VestingFixtures.allocations(VestingFixtures.UNIT), 12 * VestingFixtures.PERIOD);
        for (uint256 i; i < 4; i++) {
            assertEq(harness.earned(i), 0);
        }
        assertEq(token.balanceOf(address(harness)), 120 * VestingFixtures.UNIT);
        vm.warp(VestingFixtures.START + 12 * VestingFixtures.PERIOD);
        harness.advance();
        uint256[4] memory allocations = VestingFixtures.allocations(VestingFixtures.UNIT);
        for (uint256 i; i < 4; i++) {
            assertEq(harness.earned(i), allocations[i] * Q);
            assertEq(harness.reserved(i), 0);
        }
    }

    function test_threePeriodsThenClaimsThenNinetyTokenRefund() public {
        harness.fund(VestingFixtures.allocations(VestingFixtures.UNIT), 12 * VestingFixtures.PERIOD);
        vm.warp(VestingFixtures.START + 3 * VestingFixtures.PERIOD);
        harness.advance();
        uint256[4] memory expected = [uint256(24_000_000), 3_000_000, 1_500_000, 1_500_000];
        for (uint256 i; i < 4; i++) {
            // Scaled per-second rates defer less than one raw unit until END.
            assertLe(harness.earned(i), expected[i] * Q);
            assertLt(expected[i] * Q - harness.earned(i), 12 * VestingFixtures.PERIOD);
            harness.claim(i);
        }
        uint256 before = token.balanceOf(address(this));
        assertEq(harness.refund(), 90_000_000);
        assertEq(token.balanceOf(address(this)) - before, 90_000_000);
        uint256 liabilities;
        for (uint256 i; i < 4; i++) {
            assertEq(harness.reserved(i), 0);
            liabilities += harness.earned(i) + harness.cancellationRounding(i);
        }
        assertEq(token.balanceOf(address(harness)) * Q, liabilities);
        vm.warp(VestingFixtures.START + 20 * VestingFixtures.PERIOD);
        harness.advance();
        assertEq(harness.refund(), 0);
        assertEq(token.balanceOf(address(harness)) * Q, liabilities);
    }

    function test_claimKeepsFractionAndFrequencyDoesNotChangeEarnings() public {
        harness.fund([uint256(3), 3, 3, 3], 7);
        vm.warp(VestingFixtures.START + 3);
        harness.advance();
        uint256 accrued = harness.earned(0);
        assertEq(harness.claim(0), 1);
        assertEq(harness.earned(0), accrued - Q);
        assertEq(harness.claim(0), 0);
        vm.warp(VestingFixtures.START + 7);
        harness.advance();
        assertEq(harness.claim(0), 2);
        assertEq(harness.earned(0), 0);
        for (uint256 i = 1; i < 4; i++) {
            assertEq(harness.claim(i), 3);
        }
        assertEq(token.balanceOf(address(harness)), 0);
    }

    function testFuzz_partialCancellationConservesEveryScaledUnit(
        uint32 gross,
        uint32 duration,
        uint32 elapsed
    ) public {
        gross = uint32(bound(gross, 1, 1_000_000_000));
        duration = uint32(bound(duration, 1, type(uint32).max));
        elapsed = uint32(bound(elapsed, 0, duration));
        uint256 quarter = gross / 4;
        harness.fund([uint256(gross) - 3 * quarter, quarter, quarter, quarter], duration);
        vm.warp(VestingFixtures.START + elapsed);
        harness.advance();
        uint256 refunded = harness.refund();
        assertEq(refunded, uint256(gross) * (duration - elapsed) / duration);
        uint256 liabilities;
        uint256 residue;
        for (uint256 i; i < 4; i++) {
            assertEq(harness.reserved(i), 0);
            liabilities += harness.earned(i) + harness.cancellationRounding(i);
            residue += harness.cancellationRounding(i);
        }
        assertEq(liabilities + refunded * Q, uint256(gross) * Q);
        assertLt(residue, Q + 4 * uint256(duration));
    }
}
