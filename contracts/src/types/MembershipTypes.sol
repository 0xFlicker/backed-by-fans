// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Shared constructor and rendering value types for the membership protocol.
library MembershipTypes {
    enum ReferralStatus {
        Unset,
        LockedNone,
        LockedAddress
    }

    /// @notice Bounded creator-controlled presentation fields.
    struct TierMetadata {
        string description;
        string imageURI;
        string externalURI;
    }

    /// @notice Creator-selected values supplied when a tier is deployed.
    struct TierConfig {
        address creator;
        string name;
        string symbol;
        uint256 pricePerPeriod;
        uint64 periodDuration;
        uint16 rewardBps;
        uint16 referralBps;
        uint64 supplyCap;
        uint64 maxPrepaidPeriods;
        TierMetadata metadata;
    }

    /// @notice Lazy paid-first time checkpoint and separately cached occupancy.
    struct MembershipState {
        uint64 checkpoint;
        uint64 paidSeconds;
        uint64 grantSeconds;
        bool occupied;
    }

    /// @notice Permanent referral selection attached to one membership credential.
    struct ReferralState {
        ReferralStatus status;
        address referrer;
    }

    /// @notice Current refundable variable-price lot and consumed seconds within it.
    struct RefundCursor {
        uint256 lot;
        uint64 consumedSeconds;
    }

    /// @notice One-way presentation data passed from a tier to the stateless renderer.
    struct TokenRenderData {
        string tierName;
        string description;
        string imageURI;
        string externalURI;
        uint256 tokenId;
        uint64 expiration;
        bool active;
    }
}
