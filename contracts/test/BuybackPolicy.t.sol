// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackPolicyMath} from "../src/libraries/BuybackPolicyMath.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {BuybackModel} from "./models/BuybackModel.sol";
import {Test} from "forge-std/Test.sol";

contract BuybackPolicyTest is Test {
    function testFuzz_floorMatchesIndependentRemainderModel(
        uint128 input,
        uint128 numerator,
        uint128 denominator,
        uint16 tolerance
    ) public pure {
        if (numerator == 0 || denominator == 0) return;
        tolerance %= 101;
        assertEq(
            BuybackPolicyMath.minimum(input, BuybackTypes.Rate(numerator, denominator, tolerance)),
            BuybackModel.minimum(input, numerator, denominator, tolerance)
        );
    }

    function test_oneFinalUpwardRoundingAtMaximumOperands() public pure {
        uint128 maximum = type(uint128).max;
        assertEq(
            BuybackPolicyMath.minimum(maximum, BuybackTypes.Rate(maximum, 1, 0)),
            uint256(maximum) * maximum
        );
        assertEq(BuybackPolicyMath.minimum(1, BuybackTypes.Rate(1, maximum, 100)), 1);
        assertEq(BuybackPolicyMath.minimum(101, BuybackTypes.Rate(1, 100, 100)), 1);
        assertEq(BuybackPolicyMath.minimum(102, BuybackTypes.Rate(1, 100, 100)), 2);
    }

    function test_unitsDoNotAssumeDecimalsOrDisplayMultipliers() public pure {
        assertEq(BuybackPolicyMath.minimum(1e15, BuybackTypes.Rate(478_129, 1e15, 100)), 473_348);
        assertEq(
            BuybackPolicyMath.minimum(100_000, BuybackTypes.Rate(40_216_887_404_570, 100_000, 100)),
            39_814_718_530_525
        );
    }
}
