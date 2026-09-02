// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Shared constructor and rendering value types for the membership protocol.
library MembershipTypes {
    enum ImageFit {
        Cover,
        Contain,
        Tile
    }

    enum MediaMIME {
        None,
        JPEG,
        PNG
    }

    enum ReferralStatus {
        Unset,
        LockedNone,
        LockedAddress
    }

    /// @notice Mutable creator-controlled metadata that does not change the artwork.
    struct TierMetadata {
        string description;
        string externalURI;
    }

    /// @notice Bounded creator-controlled art direction shared by every token in a tier.
    /// @dev Engine-specific fields are interpreted by the selected engine and remain inert elsewhere.
    struct ArtConfig {
        uint16 engine;
        uint128 collectionSeed;
        uint8 palette;
        uint8 intensity;
        uint8 density;
        uint8 symmetry;
        uint8 typographyScale;
        uint8 typographyStyle;
        uint8 textVisibility;
        ImageFit imageFit;
        uint8 focalX;
        uint8 focalY;
        uint8 grain;
        uint8 mediaMix;
        uint8 primary;
        uint8 secondary;
        uint8 tertiary;
    }

    /// @notice Creator-controlled onchain media identity used by the tier artwork.
    /// @dev Every field is zero for generated-only artwork. Otherwise every field is required.
    struct MediaConfig {
        MediaMIME mime;
        address store;
        uint32 length;
        bytes32 digest;
        bytes32 runtimeCodehash;
    }

    /// @notice Public provenance and integrity record for one native media store.
    struct MediaRecord {
        address store;
        address creator;
        MediaMIME mime;
        uint32 length;
        bytes32 digest;
        bytes32 runtimeCodehash;
    }

    /// @notice Creator-selected values supplied when a tier is deployed.
    struct TierConfig {
        address creator;
        bytes32 tierSalt;
        address renderer;
        address paymentToken;
        string name;
        string symbol;
        uint256 pricePerPeriod;
        uint64 periodDuration;
        uint16 rewardBps;
        uint16 referralBps;
        uint64 supplyCap;
        uint64 maxPrepaidPeriods;
        TierMetadata metadata;
        ArtConfig art;
        MediaConfig media;
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
        string externalURI;
        bytes32 tierIdentity;
        ArtConfig art;
        MediaConfig media;
        uint256 tokenId;
        uint64 expiration;
        bool active;
    }

    /// @notice Complete deterministic renderer input used before tier publication.
    struct PreviewContext {
        TokenRenderData token;
        bytes nativeMedia;
    }
}
