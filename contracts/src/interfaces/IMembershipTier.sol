// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {MembershipTypes} from "../types/MembershipTypes.sol";
import {IERC5643} from "./IERC5643.sol";

/// @notice Immutable economic terms and public-standard surface of one membership tier.
interface IMembershipTier is IERC165, IERC721, IERC5643 {
    function previewClaimRewards(address beneficiary, uint256[] calldata tokenIds, uint256 maxSteps)
        external
        view
        returns (MembershipTypes.ClaimPreview memory);
    event MetadataUpdate(uint256 tokenId);
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);
    event MembershipTimeUpdated(
        uint256 indexed tokenId, uint64 paidSeconds, uint64 grantSeconds, uint64 expiration
    );
    event MembershipRetired(
        uint256 indexed tokenId,
        address indexed owner,
        uint64 effectiveAt,
        uint256 removedShares,
        uint256 creditScaled
    );
    event RetiredRewardClaimed(address indexed owner, uint256 amount);
    event RewardEligibilityUpdated(
        uint256 indexed tokenId, bool eligible, uint256 eligibleShares, uint256 totalRewardShares
    );
    event PauseUpdated(bool paused);
    event SupplyCapUpdated(uint64 previousCap, uint64 newCap);
    event MaxPrepaidPeriodsUpdated(uint64 previousMaximum, uint64 newMaximum);
    event TierMetadataUpdated(string description, string externalURI);
    event PresentationUpdated(
        address indexed previousRenderer,
        address indexed newRenderer,
        bytes32 previousArtHash,
        bytes32 newArtHash,
        bytes32 previousMediaHash,
        bytes32 newMediaHash
    );
    event PaymentProcessed(
        address indexed payer,
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 gross,
        uint64 periods
    );
    event PaymentAllocated(
        uint256 indexed tokenId,
        uint256 protocolFee,
        uint256 reward,
        uint256 referral,
        uint256 creator
    );
    event ReferralLocked(
        uint256 indexed tokenId, MembershipTypes.ReferralStatus status, address indexed referrer
    );
    event SharesIssued(
        uint256 indexed tokenId, uint256 amount, uint256 tokenShares, uint256 aggregateShares
    );
    event CreatorProceedsWithdrawn(address indexed owner, uint256 amount);
    event RewardClaimed(uint256 indexed tokenId, address indexed owner, uint256 amount);
    event ReferralClaimed(address indexed referrer, uint256 amount);
    event MembershipRefunded(
        uint256 indexed tokenId,
        address indexed recipient,
        uint256 grossRefund,
        uint64 canceledPaidSeconds,
        uint64 canceledGrantSeconds
    );

    function minimumPayment() external view returns (uint112);
    function factory() external view returns (address);

    function paymentToken() external view returns (IERC20);

    function buybackVault() external view returns (address);

    function renderer() external view returns (address);

    function tierIdentity() external view returns (bytes32);

    function artConfig() external view returns (MembershipTypes.ArtConfig memory);

    function mediaConfig() external view returns (MembershipTypes.MediaConfig memory);

    function pricePerPeriod() external view returns (uint256);

    function periodDuration() external view returns (uint64);

    function rewardBps() external view returns (uint16);

    function referralBps() external view returns (uint16);

    function protocolFeeBps() external view returns (uint16);

    /// @notice Immutable 1.00x–10.00x starting weight multiplier in 100-BPS steps.
    function startingBoostBps() external view returns (uint32);
    /// @notice Immutable horizon in raw payment units; zero only for the linear curve.
    function earlySupportGross() external view returns (uint112);
    /// @notice Permanent cumulative gross accepted, including later-refunded payments.
    function lifetimeGross() external view returns (uint112);
    /// @notice C = 2^112-1 raw units of lifetime payment volume, independent of token supply.
    /// @dev Exceeding C reverts the payment atomically; refunds do not restore capacity.
    function MAX_LIFETIME_GROSS() external view returns (uint256);
    /// @notice Q = 2^128 scaled units per raw token unit; claims retain fractional credits.
    function ACCOUNTING_SCALE() external view returns (uint256);
    function MAX_ACCOUNTING_STEPS() external view returns (uint256);
    function previewShares(uint256 gross) external view returns (MembershipTypes.ShareQuote memory);

    event ProtocolFeesReleased(address indexed vault, address indexed asset, uint256 amount);
    event RefundFunded(
        uint256 indexed tokenId,
        uint256 indexed generation,
        uint256 grossRefund,
        uint256[4] fundingScaled
    );
    event FundingGenerationCanceled(
        uint256 indexed tokenId, uint256 indexed generation, uint256[4] cancellationScaled
    );
    event AccountingProgress(
        uint64 accountedThrough,
        uint256 processedSteps,
        bool complete,
        uint256 earnedScaledDelta,
        uint256 retiredCount
    );
    event FundingLotScheduled(
        uint256 indexed tokenId,
        uint256 indexed generation,
        uint256 lotIndex,
        uint64 start,
        uint64 end,
        uint256 gross,
        uint256 creatorAmount,
        uint256 memberAmount,
        uint256 referralAmount,
        uint256 protocolAmount,
        address referrer
    );
    event FundingLotCompleted(
        uint256 indexed tokenId, uint256 indexed generation, uint256 lotIndex, uint64 end
    );

    function protocolFeeEarnedHeld() external view returns (uint256);
    function releaseProtocolFees() external returns (uint256 amount);

    function NORMAL_BOOST_BPS() external view returns (uint32);
    function MIN_ENABLED_BOOST_BPS() external view returns (uint32);
    function MAX_BOOST_BPS() external view returns (uint32);
    function BOOST_STEP_BPS() external view returns (uint32);
    /// @notice Anyone may process 1–25 START/END checkpoints, including while paused.
    /// @dev Returns actual work, not the requested maximum. An incomplete successful call
    /// saves progress; an AccountingBehind mutation reverts all of its attempted progress.
    /// No token transfer, beneficiary change or worker payment is implied by processing.
    function processAccounting(uint256 maxSteps)
        external
        returns (MembershipTypes.MaintenanceResult memory);
    function processExpirations(uint256 maxSteps)
        external
        returns (MembershipTypes.MaintenanceResult memory);
    function claimRetiredRewards() external returns (uint256 amount);
    function claimableRetiredReward(address beneficiary)
        external
        view
        returns (uint256 raw, uint256 fractionalScaled);
    function accountingStatus() external view returns (MembershipTypes.AccountingStatus memory);
    /// @notice Project balances without writes, transfers or transaction simulation.
    /// @dev Reads at most 256 checkpoints. Zero reads only continuous time if no
    /// checkpoint is due. Inspect current.status.complete before treating it as current.
    function previewAccounting(
        uint256 tokenId,
        address beneficiary,
        address referrer,
        uint256 maxSteps
    ) external view returns (MembershipTypes.AccountingPreview memory);
    function allocationState(uint256 tokenId)
        external
        view
        returns (MembershipTypes.AllocationState memory);
    function allocationLots(uint256 tokenId, uint256 generation, uint256 offset, uint256 limit)
        external
        view
        returns (MembershipTypes.AllocationLot[] memory);
    function reserveState() external view returns (MembershipTypes.ReserveState memory);

    function supplyCap() external view returns (uint64);

    function maxPrepaidPeriods() external view returns (uint64);

    function description() external view returns (string memory);

    function externalURI() external view returns (string memory);

    function paused() external view returns (bool);

    function occupiedSupply() external view returns (uint64);

    function totalMinted() external view returns (uint256);

    function tokensOfOwner(address recipient, uint256 offset, uint256 limit)
        external
        view
        returns (MembershipTypes.PositionPage memory);

    function isActiveToken(uint256 tokenId) external view returns (bool);

    function timeBalances(uint256 tokenId)
        external
        view
        returns (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint);

    function isOccupied(uint256 tokenId) external view returns (bool);

    function createMembership(uint64 periods, address referralChoice)
        external
        returns (uint256 tokenId);
    function renewMembership(uint256 tokenId, uint64 periods, address referralChoice) external;
    function createContributionMembership(uint256 gross, address referralChoice)
        external
        returns (uint256 tokenId);
    function renewContributionMembership(uint256 tokenId, uint256 gross, address referralChoice)
        external;
    function giftMembership(address recipient, uint64 periods) external returns (uint256 tokenId);
    function giftRenewal(
        uint256 tokenId,
        address expectedOwner,
        uint64 periods,
        MembershipTypes.ReferralStatus expectedReferralStatus,
        address expectedReferrer
    ) external;

    function referralOf(uint256 tokenId)
        external
        view
        returns (MembershipTypes.ReferralStatus status, address referrer);

    function sharesOf(uint256 tokenId) external view returns (uint256);

    function rewardEligible(uint256 tokenId) external view returns (bool);

    function totalRewardShares() external view returns (uint256);

    function rewardPerShare() external view returns (uint256);

    function creatorProceeds() external view returns (uint256);

    function claimableReferral(address referrer) external view returns (uint256);

    function totalProtectedLiability() external view returns (uint256);

    function claimableReward(uint256 tokenId) external view returns (uint256);

    function withdrawCreatorProceeds() external returns (uint256 amount);

    function claimReward(uint256 tokenId) external returns (uint256 amount);

    function claimReferral() external returns (uint256 amount);

    /// @notice Discover extant positions and settled beneficiary reward interests.
    function hasClaimInterest(address beneficiary) external view returns (bool);

    function claimRewards(uint256[] calldata tokenIds, uint256 maxSteps)
        external
        returns (MembershipTypes.ClaimResult memory);

    /// @notice Factory-only batch entry; payouts always go to the supplied beneficiary.
    function claimRewardsFor(address beneficiary, uint256[] calldata tokenIds, uint256 maxSteps)
        external
        returns (MembershipTypes.ClaimResult memory);

    function previewRefund(uint256 tokenId)
        external
        view
        returns (MembershipTypes.RefundPreview memory);

    function refund(uint256 tokenId, address expectedOwner, uint256 maxGrossRefund)
        external
        returns (uint256 grossRefund);

    function grantMembership(address recipient, uint64 periods) external returns (uint256 tokenId);

    function addGrantTime(uint256 tokenId, address expectedOwner, uint64 periods) external;

    function revokeGrantTime(uint256 tokenId, address expectedOwner)
        external
        returns (uint64 revokedSeconds);

    function setPaused(bool newPaused) external;

    function setSupplyCap(uint64 newSupplyCap) external;

    function setMaxPrepaidPeriods(uint64 newMaximum) external;

    function setTierMetadata(MembershipTypes.TierMetadata calldata newMetadata) external;

    function setPresentation(
        address newRenderer,
        MembershipTypes.ArtConfig calldata newArt,
        MembershipTypes.MediaConfig calldata newMedia
    ) external;
}
