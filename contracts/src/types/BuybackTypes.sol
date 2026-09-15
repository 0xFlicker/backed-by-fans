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
        NoLimits,
        BelowMinimum,
        Cooldown,
        LaunchPenalty,
        GraduationPending,
        TokenNotLaunched,
        OperatorOnly,
        NoPolicy,
        PolicyExpired,
        BudgetExhausted,
        StalePolicy
    }

    enum ExecutionMode {
        OperatorGuarded,
        PermissionlessGuarded
    }

    /// @notice Raw output units per raw offered input unit, rounded upward.
    struct OutputRate {
        uint256 numerator;
        uint256 denominator;
    }

    struct PermissionlessPolicy {
        Lifecycle lifecycle;
        uint64 revision;
        uint64 expiresAt;
        bool budgetLimited;
        uint256 remainingBudget;
        OutputRate[] rates;
    }

    struct ProcessingState {
        Status status;
        uint64 revision;
        uint256 available;
        uint256 maxInput;
        uint256 minInput;
        uint256 nextEligibleAt;
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

    struct ExecutionLimits {
        uint128 minInput;
        uint128 maxInput;
        uint64 minInterval;
    }
}
