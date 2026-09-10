// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RewardCurve} from "../src/libraries/RewardCurve.sol";
import {Test} from "forge-std/Test.sol";

contract RewardCurveHarness {
    function validate(uint32 boost, uint112 horizon, uint256 price) external pure {
        RewardCurve.validate(boost, horizon, price);
    }

    function quote(uint112 cursor, uint256 gross, uint32 boost, uint112 horizon)
        external
        pure
        returns (uint256)
    {
        return RewardCurve.quote(cursor, gross, boost, horizon);
    }
}

contract RewardCurveTest is Test {
    RewardCurveHarness private harness = new RewardCurveHarness();
    uint112 private constant C = type(uint112).max;

    function test_noneIsExactlyGrossAtBothBounds() public view {
        assertEq(harness.quote(0, C, 10_000, 0), C);
        assertEq(harness.quote(C, 0, 10_000, 0), 0);
        assertEq(harness.quote(C - 1, 1, 10_000, 0), 1);
    }

    function test_integratesWholeWindowInsteadOfStartingMultiplier() public view {
        assertEq(harness.quote(0, 100, 15_000, 100), 125);
        assertEq(harness.quote(0, 200, 15_000, 100), 225);
        assertEq(harness.quote(50, 100, 30_000, 100), 125);
        assertEq(harness.quote(100, 50, 30_000, 100), 50);
    }

    function test_maximumNumericProductAndHorizon() public view {
        uint256 expected = uint256(C) + uint256(C) * 9 / 2;
        assertEq(harness.quote(0, C, 100_000, C), expected);
        assertEq(harness.quote(C - 1, 1, 100_000, C), 1);
    }

    function test_invalidBoostAndHorizonFail() public {
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(10_000, 1, 0);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(10_100, 0, 0);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(15_001, 100, 0);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(100_100, 100, 0);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(9900, 0, 0);
    }

    function test_fixedHorizonMustBeWholeSupportedPeriods() public {
        harness.validate(15_000, 120, 10);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(15_000, 121, 10);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(15_000, uint112(type(uint64).max) + 1, 1);
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        harness.validate(10_000, 0, uint256(C) + 1);
    }

    function test_capacityFailsBeforeAdditionCanOverflow() public {
        vm.expectRevert(RewardCurve.CurveCapacityExceeded.selector);
        harness.quote(C, 1, 10_000, 0);
        vm.expectRevert(RewardCurve.CurveCapacityExceeded.selector);
        harness.quote(1, type(uint256).max, 15_000, 10);
    }

    function testFuzz_partitionTelescopesAndMatchesIndependentIntegral(
        uint112 cursor,
        uint112 gross,
        uint112 horizon,
        uint16 boostSteps,
        uint112 split
    ) public view {
        horizon = uint112(bound(horizon, 1, C));
        gross = uint112(bound(gross, 0, uint256(C) - cursor));
        split = uint112(bound(split, 0, gross));
        uint32 boost = uint32(bound(boostSteps, 1, 900)) * 100 + 10_000;
        uint256 all = harness.quote(cursor, gross, boost, horizon);
        uint256 parts = harness.quote(cursor, split, boost, horizon)
            + harness.quote(cursor + split, gross - split, boost, horizon);
        assertEq(all, parts);
        // Independent polynomial expression using the unconsumed triangle area.
        uint256 before = _integral(cursor, horizon, boost);
        uint256 after_ = _integral(uint256(cursor) + gross, horizon, boost);
        assertEq(all, after_ - before);
        assertGe(all, gross);
    }

    function _integral(uint256 x, uint256 horizon, uint256 boost) private pure returns (uint256) {
        uint256 remaining = x >= horizon ? 0 : horizon - x;
        return
            x + (boost - 10_000) * (horizon * horizon - remaining * remaining) / (20_000 * horizon);
    }
}
