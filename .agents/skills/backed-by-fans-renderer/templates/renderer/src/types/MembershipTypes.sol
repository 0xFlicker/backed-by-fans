// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Canonical Backed By Fans renderer-facing value types.
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

    /// @notice Immutable, bounded art direction shared by every token in a tier.
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

    /// @notice Immutable onchain media identity approved with the tier artwork.
    /// @dev Every field is zero for generated-only artwork. Otherwise every field is required.
    struct MediaConfig {
        MediaMIME mime;
        address store;
        uint32 length;
        bytes32 digest;
        bytes32 runtimeCodehash;
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
