// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackTypes} from "../types/BuybackTypes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

library BuybackPolicyMath {
    /// @dev Rate operands are uint128; multiplying either by 10,000 fits uint256.
    /// Math.mulDiv retains the full input product and rounds upward exactly once.
    function minimum(uint256 actualInput, BuybackTypes.Rate memory rate)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(
            actualInput,
            uint256(rate.numerator) * (10_000 - rate.toleranceBps),
            uint256(rate.denominator) * 10_000,
            Math.Rounding.Ceil
        );
    }
}
