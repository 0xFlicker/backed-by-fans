// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Shared constructor and rendering value types for the membership protocol.
library MembershipTypes {
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
        uint64 paidPrepaymentLimit;
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
