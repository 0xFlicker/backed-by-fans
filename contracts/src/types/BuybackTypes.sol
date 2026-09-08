// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @notice Accounting values shared by the tier release and dedicated burn inventory.
library BuybackTypes {
    enum SourceBucket {
        Membership,
        Donation
    }

    struct Inventory {
        uint256 available;
        uint256 totalReceived;
        uint256 totalConvertedIn;
        uint256 totalSpent;
        uint256 totalBurned;
    }

    enum Lifecycle {
        Bonding,
        GraduationPending,
        Pool
    }
    enum Status {
        Ready,
        NoInventory,
        Paused,
        NoRoute,
        NoPolicy,
        NotYetValid,
        Expired,
        BudgetExhausted,
        LaunchPenalty,
        GraduationPending
    }

    struct ProcessingState {
        Status status;
        uint64 revision;
        uint256 available;
        uint256 maxInput;
    }

    struct Leg {
        address input;
        address output;
        uint256 spent;
        uint256 received;
    }

    struct Execution {
        Lifecycle lifecycle;
        Leg[] legs;
        uint256 acquired;
    }

    struct TypedRoute {
        PoolKey[] pools;
    }

    struct Rate {
        uint128 numerator;
        uint128 denominator;
        uint16 toleranceBps;
    }

    struct ExecutionPolicy {
        uint64 validAfter;
        uint64 validUntil;
        uint128 batchCap;
        uint128 totalBudget;
        Rate[] rates;
        bytes32 evidenceHash;
    }

    struct PolicyState {
        ExecutionPolicy terms;
        uint128 spent;
    }
}
