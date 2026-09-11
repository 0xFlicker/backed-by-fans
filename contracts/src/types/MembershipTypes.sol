// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Shared constructor and rendering value types for the membership protocol.
library MembershipTypes {
    struct ClaimResult {
        uint256 processedSteps;
        uint256 reward;
        uint256 referral;
        uint256 creator;
    }

    /// @notice Independently deployed STOP-prefixed chunks of the exact linked tier initcode.
    struct TierCodeConfig {
        address storeA;
        address storeB;
        uint256 creationCodeLength;
        bytes32 creationCodeHash;
    }

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
        uint112 minimumPayment;
        uint64 periodDuration;
        uint16 protocolFeeBps;
        uint16 rewardBps;
        uint16 referralBps;
        uint32 startingBoostBps;
        uint112 earlySupportGross;
        uint64 supplyCap;
        uint64 maxPrepaidPeriods;
        TierMetadata metadata;
        ArtConfig art;
        MediaConfig media;
    }

    /// @notice Exact issuance for one observed cursor, not a reservation of curve position.
    struct ShareQuote {
        uint112 grossBefore;
        uint112 grossAfter;
        uint256 sharesAdded;
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

    struct AccountingStatus {
        uint64 accountedThrough;
        uint64 nextBoundary;
        uint256 scheduledMembers;
        bool complete;
    }

    /// @notice Settled raw balances; fractional values use ACCOUNTING_SCALE.
    struct EarnedBalances {
        uint256 creator;
        uint256 member;
        uint256 referral;
        uint256 protocol;
        uint256[4] fractionalScaled;
        AccountingStatus status;
    }

    /// @notice Read-only projection through asOf, or through current.status.accountedThrough
    /// when the checkpoint budget is exhausted. Deltas are newly vested allocations,
    /// in creator/member/referral/protocol order, before member distribution rounding.
    struct AccountingPreview {
        uint64 asOf;
        uint256 processedSteps;
        uint256[4] earnedDeltaScaled;
        EarnedBalances settled;
        EarnedBalances current;
    }

    struct AllocationState {
        uint256 generation;
        uint256 lotCursor;
        uint256 lotCount;
        uint256[4] allocatedScaled;
        uint256[4] earnedScaled;
        uint256[4] unearnedScaled;
        uint256 refundableGross;
        AccountingStatus status;
    }

    struct AllocationLot {
        uint64 start;
        uint64 end;
        uint256 gross;
        uint256[4] allocations;
        address referrer;
        bool canceled;
    }

    struct ReserveState {
        uint256[4] unearnedScaled;
        uint256[4] cancellationScaled;
        uint256 unassignedMemberScaled;
        uint256 distributionDustScaled;
        uint256 indexCarryScaled;
        AccountingStatus status;
    }

    struct RefundPreview {
        address recipient;
        uint64 paidSeconds;
        uint64 grantSeconds;
        uint64 accessAsOf;
        uint64 accountingAsOf;
        uint256 grossRefund;
        uint256[4] fundingScaled;
        uint256[4] cancellationScaled;
        uint256 generation;
        bool complete;
        uint64 fundingAsOf;
        bool projected;
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
