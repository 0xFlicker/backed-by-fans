// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Slow reference arithmetic for membership time and refund tests.
library MembershipModel {
    function variableRefund(
        uint256[] memory grossLots,
        uint64 periodDuration,
        uint256 paidSecondsConsumed
    ) internal pure returns (uint256 refund) {
        uint256 remainingConsumption = paidSecondsConsumed;
        for (uint256 i; i < grossLots.length; ++i) {
            if (remainingConsumption >= periodDuration) {
                remainingConsumption -= periodDuration;
                continue;
            }

            uint256 remainingSeconds = periodDuration - remainingConsumption;
            refund += Math.mulDiv(grossLots[i], remainingSeconds, periodDuration);
            remainingConsumption = 0;
        }
    }

    function fixedRefund(uint256 paidSeconds, uint256 pricePerPeriod, uint64 periodDuration)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(paidSeconds, pricePerPeriod, periodDuration);
    }
}
