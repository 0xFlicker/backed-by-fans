// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./MembershipTestConfig.sol";

/// @notice Shared authored service clock and allocation examples for vesting tests.
library VestingFixtures {
    uint64 internal constant START = 1_000_000;
    uint64 internal constant PERIOD = 30 days;
    uint256 internal constant UNIT = 1_000_000;

    function fixedConfig(address creator, address renderer, address paymentToken)
        internal
        pure
        returns (MembershipTypes.TierConfig memory config)
    {
        config = MembershipTestConfig.defaultConfig(creator, renderer, paymentToken);
        config.pricePerPeriod = 10 * UNIT;
        config.periodDuration = PERIOD;
        config.protocolFeeBps = 500;
        config.rewardBps = 1000;
        config.referralBps = 500;
    }

    function contributionConfig(address creator, address renderer, address paymentToken)
        internal
        pure
        returns (MembershipTypes.TierConfig memory config)
    {
        config = fixedConfig(creator, renderer, paymentToken);
        config.pricePerPeriod = 0;
    }

    function allocations(uint256 unit) internal pure returns (uint256[4] memory) {
        return [96 * unit, 12 * unit, 6 * unit, 6 * unit];
    }
}
