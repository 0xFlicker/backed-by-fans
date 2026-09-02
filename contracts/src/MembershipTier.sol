// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {TierIdentity} from "./TierIdentity.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";
import {IERC5643} from "./interfaces/IERC5643.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IOnchainMediaStoreFactory} from "./interfaces/IOnchainMediaStoreFactory.sol";
import {RendererPrimitives} from "./renderer/RendererPrimitives.sol";
import {TextValidation} from "./renderer/TextValidation.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice One immutable-economic creator membership tier with persistent credentials.
contract MembershipTier is ERC721, Ownable2Step, ReentrancyGuard, IMembershipTier {
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    uint16 public constant override protocolFeeBps = 100;
    uint256 public constant MAX_NAME_BYTES = 100;
    uint256 public constant MAX_SYMBOL_BYTES = 16;
    uint256 public constant MAX_DESCRIPTION_BYTES = 500;
    uint256 public constant MAX_URI_BYTES = 2048;
    uint256 public constant MAX_SYNC_BATCH_SIZE = 100;
    uint256 public constant MAX_RENDERABLE_MEDIA_BYTES =
        RendererPrimitives.MAX_RENDERABLE_MEDIA_BYTES;

    uint16 private constant _BPS_DENOMINATOR = 10_000;
    uint256 private constant _REWARD_SCALE = 1e27;

    address public immutable override factory;
    IERC20 public immutable override paymentToken;
    address public override renderer;
    bytes32 public immutable override tierIdentity;
    uint256 public immutable override pricePerPeriod;
    uint64 public immutable override periodDuration;
    uint16 public immutable override rewardBps;
    uint16 public immutable override referralBps;

    uint64 public override supplyCap;
    uint64 public override maxPrepaidPeriods;
    uint64 public override occupiedSupply;
    uint256 public override totalMinted;
    bool public override paused;

    string public override description;
    string public override externalURI;

    MembershipTypes.ArtConfig private _art;
    MembershipTypes.MediaConfig private _media;

    mapping(address recipient => uint256 tokenId) public override tokenOf;
    mapping(uint256 tokenId => MembershipTypes.MembershipState state) internal _membershipStates;
    mapping(uint256 tokenId => MembershipTypes.ReferralState state) private _referralStates;
    mapping(uint256 tokenId => uint256 shares) public override sharesOf;
    mapping(uint256 tokenId => bool eligible) public override rewardEligible;
    mapping(uint256 tokenId => uint256 index) private _tokenRewardIndex;
    mapping(uint256 tokenId => uint256 credit) private _rewardCredit;
    mapping(uint256 tokenId => uint256 scaledRemainder) private _rewardRemainder;
    mapping(uint256 tokenId => uint256[] cumulativeGross) private _zeroGrossPrefixes;
    mapping(uint256 tokenId => MembershipTypes.RefundCursor cursor) private _refundCursors;
    mapping(address referrer => uint256 amount) public override claimableReferral;

    uint256 public override totalRewardShares;
    uint256 public override rewardPerShare;
    uint256 public override creatorProceeds;
    uint256 public override rewardReserve;
    uint256 public override totalReferralLiability;

    error CapacityReached();
    error DurationOverflow();
    error InvalidAddress();
    error InvalidMetadata();
    error InvalidMediaConfig();
    error InvalidPaidDuration();
    error InvalidPeriodDuration();
    error InvalidPeriods();
    error InvalidSyncBatchSize(uint256 provided, uint256 maximum);
    error InvalidTokenId(uint256 tokenId);
    error InvalidRateTotal();
    error InvalidRenderer();
    error InvalidTierSalt();
    error InexactTokenTransfer();
    error IncorrectPricingMode();
    error NativeValueRejected();
    error NoGrantTime();
    error GrossRefundLimitExceeded(uint256 required, uint256 maximum);
    error OwnershipRenunciationDisabled();
    error OwnerTopUpLimitExceeded(uint256 required, uint256 maximum);
    error PaymentOverflow();
    error PrepaymentLimitExceeded();
    error ReferralChoiceMismatch();
    error ReferralChoiceRequired();
    error ReferralStateMismatch();
    error SelfGiftNotAllowed();
    error Soulbound();
    error SupplyCapBelowOccupancy();
    error TierPaused();
    error TimestampOverflow();
    error TokenOwnerOnly();

    constructor(address factory_, IERC20 paymentToken_, MembershipTypes.TierConfig memory config)
        ERC721(config.name, config.symbol)
        Ownable(config.creator)
    {
        if (
            factory_ == address(0) || address(paymentToken_) == address(0)
                || config.renderer == address(0)
        ) {
            revert InvalidAddress();
        }
        if (config.renderer.code.length == 0) revert InvalidAddress();
        if (config.tierSalt == bytes32(0)) revert InvalidTierSalt();
        if (config.periodDuration == 0) revert InvalidPeriodDuration();
        if (uint256(config.rewardBps) + config.referralBps + protocolFeeBps > _BPS_DENOMINATOR) {
            revert InvalidRateTotal();
        }
        _validateMetadata(config.name, config.symbol, config.metadata);
        _validateMedia(config.media);

        factory = factory_;
        paymentToken = paymentToken_;
        renderer = config.renderer;
        tierIdentity = TierIdentity.derive(factory_, config.creator, config.tierSalt);
        pricePerPeriod = config.pricePerPeriod;
        periodDuration = config.periodDuration;
        rewardBps = config.rewardBps;
        referralBps = config.referralBps;
        supplyCap = config.supplyCap;
        maxPrepaidPeriods = config.maxPrepaidPeriods;
        description = config.metadata.description;
        externalURI = config.metadata.externalURI;
        _art = config.art;
        _media = config.media;
    }

    /// @inheritdoc IMembershipTier
    function artConfig() external view override returns (MembershipTypes.ArtConfig memory) {
        return _art;
    }

    /// @inheritdoc IMembershipTier
    function mediaConfig() external view override returns (MembershipTypes.MediaConfig memory) {
        return _media;
    }

    /// @inheritdoc IMembershipTier
    function setPresentation(
        address newRenderer,
        MembershipTypes.ArtConfig calldata newArt,
        MembershipTypes.MediaConfig calldata newMedia
    ) external override onlyOwner {
        bytes32 previousArtHash = keccak256(abi.encode(_art));
        bytes32 newArtHash = keccak256(abi.encode(newArt));
        bytes32 previousMediaHash = keccak256(abi.encode(_media));
        bytes32 newMediaHash = keccak256(abi.encode(newMedia));
        if (
            newRenderer == renderer && newArtHash == previousArtHash
                && newMediaHash == previousMediaHash
        ) return;
        if (newRenderer.code.length == 0) revert InvalidRenderer();
        _validateMedia(newMedia);
        if (newMediaHash != previousMediaHash && newMedia.store != address(0)) {
            IMembershipFactory tierFactory = IMembershipFactory(factory);
            address mediaFactory = tierFactory.mediaStoreFactory();
            if (mediaFactory.codehash != tierFactory.mediaStoreFactoryRuntimeCodehash()) {
                revert InvalidMediaConfig();
            }
            IOnchainMediaStoreFactory(mediaFactory).validateOnchainMedia(msg.sender, newMedia);
        }

        if (
            IMembershipRenderer(newRenderer).rendererSchema()
                != IMembershipFactory(factory).rendererSchema()
        ) revert InvalidRenderer();
        IMembershipRenderer(newRenderer).validateConfiguration(newArt, newMedia);

        address previousRenderer = renderer;
        renderer = newRenderer;
        _art = newArt;
        _media = newMedia;
        emit PresentationUpdated(
            previousRenderer,
            newRenderer,
            previousArtHash,
            newArtHash,
            previousMediaHash,
            newMediaHash
        );
        if (totalMinted != 0) emit BatchMetadataUpdate(1, totalMinted);
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @inheritdoc IERC5643
    function renewSubscription(uint256 tokenId, uint64 duration) external payable override {
        if (msg.value != 0) revert NativeValueRejected();
        _renewSubscription(tokenId, duration);
    }

    function _renewSubscription(uint256 tokenId, uint64 duration) private nonReentrant {
        address recipient = _requireOwned(tokenId);
        if (recipient != msg.sender) revert TokenOwnerOnly();
        if (duration == 0 || duration % periodDuration != 0) revert InvalidPaidDuration();
        _requireNotPaused();

        uint64 periods = duration / periodDuration;
        if (pricePerPeriod == 0) {
            if (periods != 1) revert InvalidPeriods();
            _contribute(msg.sender, 0, address(0));
            return;
        }

        MembershipTypes.ReferralState storage referralState = _referralStates[tokenId];
        if (referralState.status == MembershipTypes.ReferralStatus.Unset) {
            revert ReferralChoiceRequired();
        }
        _purchaseFixed(msg.sender, msg.sender, periods, true, referralState.referrer);
    }

    /// @inheritdoc IERC5643
    /// @dev ERC-5643 cannot carry refund ceilings. This compatibility adapter therefore
    ///      authorizes any gross refund and owner top-up required at execution; operators should
    ///      use `refund` when they need slippage protection.
    function cancelSubscription(uint256 tokenId) external payable override {
        if (msg.value != 0) revert NativeValueRejected();
        _cancelSubscription(tokenId);
    }

    function _cancelSubscription(uint256 tokenId) private nonReentrant {
        _checkOwner();
        _refund(tokenId, type(uint256).max, type(uint256).max);
    }

    /// @inheritdoc IERC5643
    function expiresAt(uint256 tokenId) public view override returns (uint64) {
        _requireOwned(tokenId);
        return _storedExpiration(_membershipStates[tokenId]);
    }

    /// @inheritdoc IERC5643
    function isRenewable(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        if (paused) return false;
        if (
            pricePerPeriod != 0
                && _referralStates[tokenId].status == MembershipTypes.ReferralStatus.Unset
        ) {
            return false;
        }

        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (!state.occupied && supplyCap != 0 && occupiedSupply >= supplyCap) return false;

        uint64 timestamp = _currentTimestamp();
        (uint64 paidSeconds,,) = _timeBalancesAt(state, timestamp);
        if (
            maxPrepaidPeriods != 0
                && uint256(paidSeconds) + periodDuration
                    > uint256(maxPrepaidPeriods) * periodDuration
        ) {
            return false;
        }

        uint256 base = _storedExpiration(state);
        if (base < timestamp) base = timestamp;
        return base + periodDuration <= type(uint64).max;
    }

    /// @inheritdoc IMembershipTier
    function activeBalanceOf(address recipient) external view override returns (uint256) {
        if (recipient == address(0)) revert InvalidAddress();
        return isActive(recipient) ? 1 : 0;
    }

    /// @inheritdoc IMembershipTier
    function isActive(address recipient) public view override returns (bool) {
        uint256 tokenId = tokenOf[recipient];
        return tokenId != 0 && _isActiveToken(tokenId);
    }

    /// @inheritdoc IMembershipTier
    function isActiveToken(uint256 tokenId) external view override returns (bool) {
        _requireKnownToken(tokenId);
        return _isActiveToken(tokenId);
    }

    /// @inheritdoc IMembershipTier
    function timeBalances(uint256 tokenId)
        external
        view
        override
        returns (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint)
    {
        _requireKnownToken(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        uint64 timestamp = _currentTimestamp();
        bool changed;
        (paidSeconds, grantSeconds, changed) = _timeBalancesAt(state, timestamp);
        effectiveCheckpoint = state.checkpoint;
        if (changed) {
            effectiveCheckpoint =
                paidSeconds == 0 && grantSeconds == 0 ? _storedExpiration(state) : timestamp;
        }
    }

    /// @inheritdoc IMembershipTier
    function isOccupied(uint256 tokenId) external view override returns (bool) {
        _requireKnownToken(tokenId);
        return _membershipStates[tokenId].occupied;
    }

    /// @inheritdoc IMembershipTier
    function purchase(uint64 periods, address referralChoice)
        external
        override
        nonReentrant
        returns (uint256 tokenId)
    {
        tokenId = _purchaseFixed(msg.sender, msg.sender, periods, true, referralChoice);
    }

    /// @inheritdoc IMembershipTier
    function gift(
        address recipient,
        uint64 periods,
        MembershipTypes.ReferralStatus expectedReferralStatus,
        address expectedReferrer
    ) external override nonReentrant returns (uint256 tokenId) {
        if (recipient == msg.sender) revert SelfGiftNotAllowed();
        _validateExpectedReferralState(tokenOf[recipient], expectedReferralStatus, expectedReferrer);
        tokenId = _purchaseFixed(msg.sender, recipient, periods, false, address(0));
    }

    /// @inheritdoc IMembershipTier
    function contribute(uint256 gross, address referralChoice)
        external
        override
        nonReentrant
        returns (uint256 tokenId)
    {
        tokenId = _contribute(msg.sender, gross, referralChoice);
    }

    /// @inheritdoc IMembershipTier
    function referralOf(uint256 tokenId)
        external
        view
        override
        returns (MembershipTypes.ReferralStatus status, address referrer)
    {
        _requireKnownToken(tokenId);
        MembershipTypes.ReferralState storage state = _referralStates[tokenId];
        return (state.status, state.referrer);
    }

    /// @inheritdoc IMembershipTier
    function totalProtectedLiability() external view override returns (uint256) {
        return rewardReserve + totalReferralLiability;
    }

    /// @inheritdoc IMembershipTier
    function claimableReward(uint256 tokenId) public view override returns (uint256) {
        _requireKnownToken(tokenId);
        if (!rewardEligible[tokenId]) return _rewardCredit[tokenId];
        uint256 indexDelta = rewardPerShare - _tokenRewardIndex[tokenId];
        uint256 wholeCredit = _rewardCredit[tokenId];
        if (indexDelta == 0) return wholeCredit;

        uint256 scaledRemainder =
            _rewardRemainder[tokenId] + mulmod(sharesOf[tokenId], indexDelta, _REWARD_SCALE);
        return wholeCredit + Math.mulDiv(sharesOf[tokenId], indexDelta, _REWARD_SCALE)
            + scaledRemainder / _REWARD_SCALE;
    }

    /// @inheritdoc IMembershipTier
    function withdrawCreatorProceeds()
        external
        override
        onlyOwner
        nonReentrant
        returns (uint256 amount)
    {
        address recipient = owner();
        amount = creatorProceeds;
        if (amount == 0) return 0;

        creatorProceeds = 0;
        _pushExact(recipient, amount);
        emit CreatorProceedsWithdrawn(recipient, amount);
    }

    /// @inheritdoc IMembershipTier
    function claimReward(uint256 tokenId) external override nonReentrant returns (uint256 amount) {
        _requireKnownToken(tokenId);
        address recipient = msg.sender;
        if (tokenOf[recipient] != tokenId) revert TokenOwnerOnly();

        _settleReward(tokenId);
        amount = _rewardCredit[tokenId];
        if (amount == 0) return 0;

        _rewardCredit[tokenId] = 0;
        rewardReserve -= amount;
        _pushExact(recipient, amount);
        emit RewardClaimed(tokenId, recipient, amount);
    }

    /// @inheritdoc IMembershipTier
    function claimReferral() external override nonReentrant returns (uint256 amount) {
        address recipient = msg.sender;
        amount = claimableReferral[recipient];
        if (amount == 0) return 0;

        claimableReferral[recipient] = 0;
        totalReferralLiability -= amount;
        _pushExact(recipient, amount);
        emit ReferralClaimed(recipient, amount);
    }

    /// @inheritdoc IMembershipTier
    function previewRefund(uint256 tokenId)
        public
        view
        override
        returns (uint256 grossRefund, uint256 ownerTopUp)
    {
        _requireOwned(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        (uint64 paidSeconds,,) = _timeBalancesAt(state, _currentTimestamp());
        if (pricePerPeriod == 0) {
            grossRefund = _previewZeroTierRefund(tokenId, state.paidSeconds - paidSeconds);
        } else {
            grossRefund = _fixedPriceRefund(paidSeconds);
        }
        if (grossRefund > creatorProceeds) ownerTopUp = grossRefund - creatorProceeds;
    }

    /// @inheritdoc IMembershipTier
    function refund(uint256 tokenId, uint256 maxGrossRefund, uint256 maxOwnerTopUp)
        external
        override
        onlyOwner
        nonReentrant
        returns (uint256 grossRefund, uint256 ownerTopUp)
    {
        return _refund(tokenId, maxGrossRefund, maxOwnerTopUp);
    }

    /// @inheritdoc IMembershipTier
    function grantTime(address recipient, uint64 periods)
        external
        override
        onlyOwner
        nonReentrant
        returns (uint256 tokenId)
    {
        _requireNotPaused();
        uint64 duration = _durationForPeriods(periods);
        tokenId = _prepareTimeIncrease(recipient, true);

        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        _ensureExpirationCapacity(state, duration);
        state.grantSeconds += duration;
        _emitTimeUpdate(tokenId, state);
    }

    /// @inheritdoc IMembershipTier
    function revokeGrantTime(uint256 tokenId)
        external
        override
        onlyOwner
        returns (uint64 revokedSeconds)
    {
        _requireOwned(tokenId);
        _checkpointTime(tokenId);

        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        revokedSeconds = state.grantSeconds;
        if (revokedSeconds == 0) revert NoGrantTime();
        state.grantSeconds = 0;
        _emitTimeUpdate(tokenId, state);
        if (state.paidSeconds == 0) _deactivateRewardEligibility(tokenId);
    }

    /// @inheritdoc IMembershipTier
    function synchronizeExpiredMemberships(uint256[] calldata tokenIds)
        external
        override
        onlyOwner
        returns (uint256 burnedCount)
    {
        uint256 length = tokenIds.length;
        if (length == 0 || length > MAX_SYNC_BATCH_SIZE) {
            revert InvalidSyncBatchSize(length, MAX_SYNC_BATCH_SIZE);
        }

        for (uint256 i; i < length; ++i) {
            uint256 tokenId = tokenIds[i];
            _requireKnownToken(tokenId);

            address recipient = _ownerOf(tokenId);
            if (recipient == address(0) || _isActiveToken(tokenId)) continue;

            _checkpointTime(tokenId);
            MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
            uint256 suspendedShares = _deactivateRewardEligibility(tokenId);

            if (state.occupied) {
                state.occupied = false;
                --occupiedSupply;
            }

            super._update(address(0), tokenId, address(0));
            emit ExpiredMembershipSynchronized(tokenId, recipient, suspendedShares);
            ++burnedCount;
        }
    }

    /// @inheritdoc IMembershipTier
    function setPaused(bool newPaused) external override onlyOwner {
        if (paused == newPaused) return;
        paused = newPaused;
        emit PauseUpdated(newPaused);
    }

    /// @inheritdoc IMembershipTier
    function setSupplyCap(uint64 newSupplyCap) external override onlyOwner {
        if (newSupplyCap != 0 && newSupplyCap < occupiedSupply) {
            revert SupplyCapBelowOccupancy();
        }
        uint64 previousCap = supplyCap;
        supplyCap = newSupplyCap;
        emit SupplyCapUpdated(previousCap, newSupplyCap);
    }

    /// @inheritdoc IMembershipTier
    function setMaxPrepaidPeriods(uint64 newMaximum) external override onlyOwner {
        uint64 previousMaximum = maxPrepaidPeriods;
        maxPrepaidPeriods = newMaximum;
        emit MaxPrepaidPeriodsUpdated(previousMaximum, newMaximum);
    }

    /// @inheritdoc IMembershipTier
    function setTierMetadata(MembershipTypes.TierMetadata calldata newMetadata)
        external
        override
        onlyOwner
    {
        _validateMutableMetadata(newMetadata);
        description = newMetadata.description;
        externalURI = newMetadata.externalURI;

        emit TierMetadataUpdated(description, externalURI);
        if (totalMinted != 0) emit BatchMetadataUpdate(1, totalMinted);
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return IMembershipRenderer(renderer)
            .renderTokenURI(
                MembershipTypes.TokenRenderData({
                tierName: name(),
                description: description,
                externalURI: externalURI,
                tierIdentity: tierIdentity,
                art: _art,
                media: _media,
                tokenId: tokenId,
                expiration: _storedExpiration(_membershipStates[tokenId]),
                active: _isActiveToken(tokenId)
            })
            );
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC5192).interfaceId
            || interfaceId == type(IERC5643).interfaceId || interfaceId == 0x49064906
            || interfaceId == type(IMembershipTier).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function _purchaseFixed(
        address payer,
        address recipient,
        uint64 periods,
        bool selfPayment,
        address referralChoice
    ) internal returns (uint256 tokenId) {
        if (pricePerPeriod == 0) revert IncorrectPricingMode();
        uint64 duration = _durationForPeriods(periods);
        (bool multiplicationSucceeded, uint256 gross) = Math.tryMul(pricePerPeriod, periods);
        if (!multiplicationSucceeded) revert PaymentOverflow();

        _checkpointAndValidatePaidTimeIncrease(recipient, duration);
        if (selfPayment) _validateReferralChoice(tokenOf[recipient], referralChoice);
        _pullExact(payer, gross);

        tokenId = _addPaidTime(recipient, duration, false);
        if (selfPayment) _lockReferralChoice(tokenId, referralChoice);
        _applyPayment(tokenId, payer, recipient, periods, gross);
    }

    function _refund(uint256 tokenId, uint256 maxGrossRefund, uint256 maxOwnerTopUp)
        internal
        returns (uint256 grossRefund, uint256 ownerTopUp)
    {
        address recipient = _requireOwned(tokenId);
        address tierOwner = owner();
        (grossRefund, ownerTopUp) = previewRefund(tokenId);
        if (grossRefund > maxGrossRefund) {
            revert GrossRefundLimitExceeded(grossRefund, maxGrossRefund);
        }
        if (ownerTopUp > maxOwnerTopUp) {
            revert OwnerTopUpLimitExceeded(ownerTopUp, maxOwnerTopUp);
        }

        _checkpointTime(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (pricePerPeriod == 0) {
            MembershipTypes.RefundCursor storage cursor = _refundCursors[tokenId];
            cursor.lot = _zeroGrossPrefixes[tokenId].length;
            cursor.consumedSeconds = 0;
        }
        uint256 creatorContribution = grossRefund - ownerTopUp;
        creatorProceeds -= creatorContribution;

        state.paidSeconds = 0;
        state.grantSeconds = 0;
        _emitTimeUpdate(tokenId, state);
        _deactivateRewardEligibility(tokenId);

        if (ownerTopUp != 0) _pullExact(tierOwner, ownerTopUp);
        if (grossRefund != 0) _pushExact(recipient, grossRefund);
        emit MembershipRefunded(tokenId, recipient, tierOwner, grossRefund, ownerTopUp);
    }

    function _contribute(address payer, uint256 gross, address referralChoice)
        internal
        returns (uint256 tokenId)
    {
        if (pricePerPeriod != 0) revert IncorrectPricingMode();

        _checkpointAndValidatePaidTimeIncrease(payer, periodDuration);
        if (gross != 0) {
            _validateReferralChoice(tokenOf[payer], referralChoice);
            _pullExact(payer, gross);
        }

        tokenId = _addPaidTime(payer, periodDuration, false);
        _appendZeroRefundLot(tokenId, gross);
        if (gross != 0) {
            _lockReferralChoice(tokenId, referralChoice);
            _applyPayment(tokenId, payer, payer, 1, gross);
        } else {
            emit PaymentProcessed(payer, payer, tokenId, 0, 1);
        }
    }

    function _applyPayment(
        uint256 tokenId,
        address payer,
        address recipient,
        uint64 periods,
        uint256 gross
    ) internal {
        uint256 protocolFee = Math.mulDiv(gross, protocolFeeBps, _BPS_DENOMINATOR);
        uint256 reward = Math.mulDiv(gross, rewardBps, _BPS_DENOMINATOR);
        uint256 referral = Math.mulDiv(gross, referralBps, _BPS_DENOMINATOR);
        if (_referralStates[tokenId].status != MembershipTypes.ReferralStatus.LockedAddress) {
            referral = 0;
        }
        uint256 creator = gross - protocolFee - reward - referral;

        _activateRewardEligibility(tokenId);
        _settleReward(tokenId);
        sharesOf[tokenId] += gross;
        totalRewardShares += gross;
        emit SharesIssued(tokenId, gross, sharesOf[tokenId], totalRewardShares);

        creatorProceeds += creator;
        if (referral != 0) {
            address referrer = _referralStates[tokenId].referrer;
            claimableReferral[referrer] += referral;
            totalReferralLiability += referral;
        }
        _allocateReward(tokenId, reward);

        if (protocolFee != 0) _pushExact(factory, protocolFee);

        emit PaymentProcessed(payer, recipient, tokenId, gross, periods);
        emit PaymentAllocated(tokenId, protocolFee, reward, referral, creator);
    }

    function _allocateReward(uint256 tokenId, uint256 reward) internal {
        if (reward == 0) return;

        rewardReserve += reward;
        uint256 indexIncrease = Math.mulDiv(reward, _REWARD_SCALE, totalRewardShares);
        rewardPerShare += indexIncrease;

        uint256 directRemainder = mulmod(reward, _REWARD_SCALE, totalRewardShares) / _REWARD_SCALE;
        if (directRemainder != 0) _rewardCredit[tokenId] += directRemainder;
        emit RewardPerShareUpdated(tokenId, reward, rewardPerShare, directRemainder);
    }

    function _settleReward(uint256 tokenId) internal {
        if (!rewardEligible[tokenId]) return;
        uint256 currentIndex = rewardPerShare;
        uint256 indexDelta = currentIndex - _tokenRewardIndex[tokenId];
        if (indexDelta != 0) {
            uint256 scaledRemainder =
                _rewardRemainder[tokenId] + mulmod(sharesOf[tokenId], indexDelta, _REWARD_SCALE);
            _rewardCredit[tokenId] += Math.mulDiv(sharesOf[tokenId], indexDelta, _REWARD_SCALE)
            + scaledRemainder / _REWARD_SCALE;
            _rewardRemainder[tokenId] = scaledRemainder % _REWARD_SCALE;
            _tokenRewardIndex[tokenId] = currentIndex;
        }
    }

    function _appendZeroRefundLot(uint256 tokenId, uint256 gross) internal {
        uint256[] storage prefixes = _zeroGrossPrefixes[tokenId];
        MembershipTypes.RefundCursor storage cursor = _refundCursors[tokenId];
        if (prefixes.length != 0 && cursor.lot == prefixes.length && cursor.consumedSeconds == 0) {
            delete _zeroGrossPrefixes[tokenId];
            cursor.lot = 0;
            prefixes = _zeroGrossPrefixes[tokenId];
        }

        uint256 cumulativeGross = gross;
        if (prefixes.length != 0) cumulativeGross += prefixes[prefixes.length - 1];
        prefixes.push(cumulativeGross);
    }

    function _fixedPriceRefund(uint64 paidSeconds) internal view returns (uint256) {
        return Math.mulDiv(paidSeconds, pricePerPeriod, periodDuration);
    }

    function _previewZeroTierRefund(uint256 tokenId, uint64 newlyConsumed)
        internal
        view
        returns (uint256)
    {
        MembershipTypes.RefundCursor storage cursor = _refundCursors[tokenId];
        uint256 totalConsumed = uint256(cursor.consumedSeconds) + newlyConsumed;
        return _zeroTierRefundAt(
            tokenId,
            cursor.lot + totalConsumed / periodDuration,
            (totalConsumed % periodDuration).toUint64()
        );
    }

    function _zeroTierRefundAt(uint256 tokenId, uint256 lot, uint64 consumedSeconds)
        internal
        view
        returns (uint256 grossRefund)
    {
        uint256[] storage prefixes = _zeroGrossPrefixes[tokenId];
        uint256 tail = prefixes.length;
        if (lot >= tail) return 0;

        uint256 priorGross = lot == 0 ? 0 : prefixes[lot - 1];
        uint256 currentGross = prefixes[lot] - priorGross;
        uint256 laterGross = prefixes[tail - 1] - prefixes[lot];
        grossRefund = Math.mulDiv(currentGross, periodDuration - consumedSeconds, periodDuration)
            + laterGross;
    }

    function _advanceZeroRefundCursor(uint256 tokenId, uint64 consumedSeconds) internal {
        MembershipTypes.RefundCursor storage cursor = _refundCursors[tokenId];
        uint256 totalConsumed = uint256(cursor.consumedSeconds) + consumedSeconds;
        cursor.lot += totalConsumed / periodDuration;
        cursor.consumedSeconds = (totalConsumed % periodDuration).toUint64();
    }

    function _validateReferralChoice(uint256 tokenId, address referralChoice) internal view {
        if (tokenId == 0) return;
        MembershipTypes.ReferralState storage state = _referralStates[tokenId];
        if (state.status == MembershipTypes.ReferralStatus.Unset) return;
        if (state.status == MembershipTypes.ReferralStatus.LockedNone
                ? referralChoice != address(0)
                : referralChoice != state.referrer) {
            revert ReferralChoiceMismatch();
        }
    }

    function _validateExpectedReferralState(
        uint256 tokenId,
        MembershipTypes.ReferralStatus expectedStatus,
        address expectedReferrer
    ) internal view {
        MembershipTypes.ReferralState storage state = _referralStates[tokenId];
        if (state.status != expectedStatus || state.referrer != expectedReferrer) {
            revert ReferralStateMismatch();
        }
    }

    function _lockReferralChoice(uint256 tokenId, address referralChoice) internal {
        MembershipTypes.ReferralState storage state = _referralStates[tokenId];
        if (state.status != MembershipTypes.ReferralStatus.Unset) return;

        if (referralChoice == address(0)) {
            state.status = MembershipTypes.ReferralStatus.LockedNone;
        } else {
            state.status = MembershipTypes.ReferralStatus.LockedAddress;
            state.referrer = referralChoice;
        }
        emit ReferralLocked(tokenId, state.status, state.referrer);
    }

    function _checkpointAndValidatePaidTimeIncrease(address recipient, uint64 duration) internal {
        _requireNotPaused();
        if (recipient == address(0)) revert InvalidAddress();
        if (duration == 0 || duration % periodDuration != 0) revert InvalidPaidDuration();

        uint64 timestamp = _currentTimestamp();
        uint256 tokenId = tokenOf[recipient];
        if (tokenId == 0) {
            _requireCapacity();
            if (uint256(timestamp) + duration > type(uint64).max) revert DurationOverflow();
            return;
        }

        _checkpointTime(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (!state.occupied) _requireCapacity();
        if (
            maxPrepaidPeriods != 0
                && uint256(state.paidSeconds) + duration
                    > uint256(maxPrepaidPeriods) * periodDuration
        ) {
            revert PrepaymentLimitExceeded();
        }
        if (
            uint256(timestamp) + state.paidSeconds + state.grantSeconds + duration
                > type(uint64).max
        ) {
            revert DurationOverflow();
        }
    }

    function _pullExact(address payer, uint256 amount) internal {
        uint256 payerBalanceBefore = paymentToken.balanceOf(payer);
        uint256 tierBalanceBefore = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(payer, address(this), amount);
        uint256 payerBalanceAfter = paymentToken.balanceOf(payer);
        uint256 tierBalanceAfter = paymentToken.balanceOf(address(this));

        if (
            payerBalanceAfter > payerBalanceBefore
                || payerBalanceBefore - payerBalanceAfter != amount
                || tierBalanceAfter < tierBalanceBefore
                || tierBalanceAfter - tierBalanceBefore != amount
        ) {
            revert InexactTokenTransfer();
        }
    }

    function _pushExact(address recipient, uint256 amount) internal {
        uint256 tierBalanceBefore = paymentToken.balanceOf(address(this));
        uint256 recipientBalanceBefore = paymentToken.balanceOf(recipient);
        paymentToken.safeTransfer(recipient, amount);
        uint256 tierBalanceAfter = paymentToken.balanceOf(address(this));
        uint256 recipientBalanceAfter = paymentToken.balanceOf(recipient);

        if (
            tierBalanceAfter > tierBalanceBefore || tierBalanceBefore - tierBalanceAfter != amount
                || recipientBalanceAfter < recipientBalanceBefore
                || recipientBalanceAfter - recipientBalanceBefore != amount
        ) {
            revert InexactTokenTransfer();
        }
    }

    function _addPaidTime(address recipient, uint64 duration, bool checkpointRequired)
        private
        returns (uint256 tokenId)
    {
        _requireNotPaused();
        if (duration == 0 || duration % periodDuration != 0) revert InvalidPaidDuration();
        tokenId = _prepareTimeIncrease(recipient, checkpointRequired);

        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (
            maxPrepaidPeriods != 0
                && uint256(state.paidSeconds) + duration
                    > uint256(maxPrepaidPeriods) * periodDuration
        ) {
            revert PrepaymentLimitExceeded();
        }
        _ensureExpirationCapacity(state, duration);
        state.paidSeconds += duration;
        _emitTimeUpdate(tokenId, state);
    }

    function _checkpointTime(uint256 tokenId) internal {
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        uint64 previousPaidSeconds = state.paidSeconds;
        uint64 timestamp = _currentTimestamp();
        (uint64 paidSeconds, uint64 grantSeconds, bool changed) = _timeBalancesAt(state, timestamp);
        if (!changed) return;

        if (pricePerPeriod == 0 && paidSeconds < previousPaidSeconds) {
            _advanceZeroRefundCursor(tokenId, previousPaidSeconds - paidSeconds);
        }
        uint64 priorExpiration = _storedExpiration(state);
        state.paidSeconds = paidSeconds;
        state.grantSeconds = grantSeconds;
        state.checkpoint = paidSeconds == 0 && grantSeconds == 0 ? priorExpiration : timestamp;
    }

    function _prepareTimeIncrease(address recipient, bool checkpointRequired)
        internal
        returns (uint256 tokenId)
    {
        if (recipient == address(0)) revert InvalidAddress();
        uint64 timestamp = _currentTimestamp();
        tokenId = tokenOf[recipient];

        if (tokenId == 0) {
            _requireCapacity();
            tokenId = ++totalMinted;
            tokenOf[recipient] = tokenId;

            MembershipTypes.MembershipState storage newState = _membershipStates[tokenId];
            newState.checkpoint = timestamp;
            newState.occupied = true;
            ++occupiedSupply;

            _mint(recipient, tokenId);
            emit Locked(tokenId);
            _activateRewardEligibility(tokenId);
            return tokenId;
        }

        if (checkpointRequired) _checkpointTime(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (state.paidSeconds == 0 && state.grantSeconds == 0 && state.checkpoint < timestamp) {
            state.checkpoint = timestamp;
        }
        if (!state.occupied) {
            _requireCapacity();
            state.occupied = true;
            ++occupiedSupply;
        }
        if (_ownerOf(tokenId) == address(0)) {
            _mint(recipient, tokenId);
            emit Locked(tokenId);
        }
        _activateRewardEligibility(tokenId);
    }

    function _activateRewardEligibility(uint256 tokenId) internal {
        if (rewardEligible[tokenId]) return;

        _tokenRewardIndex[tokenId] = rewardPerShare;
        rewardEligible[tokenId] = true;
        uint256 eligibleShares = sharesOf[tokenId];
        totalRewardShares += eligibleShares;
        emit RewardEligibilityUpdated(tokenId, true, eligibleShares, totalRewardShares);
    }

    function _deactivateRewardEligibility(uint256 tokenId)
        internal
        returns (uint256 suspendedShares)
    {
        if (!rewardEligible[tokenId]) return 0;

        _settleReward(tokenId);
        rewardEligible[tokenId] = false;
        suspendedShares = sharesOf[tokenId];
        totalRewardShares -= suspendedShares;
        emit RewardEligibilityUpdated(tokenId, false, suspendedShares, totalRewardShares);
    }

    function _emitTimeUpdate(uint256 tokenId, MembershipTypes.MembershipState storage state)
        internal
    {
        uint64 expiration = _storedExpiration(state);
        emit SubscriptionUpdate(tokenId, expiration);
        emit MembershipTimeUpdated(tokenId, state.paidSeconds, state.grantSeconds, expiration);
        emit MetadataUpdate(tokenId);
    }

    function _timeBalancesAt(MembershipTypes.MembershipState storage state, uint256 timestamp)
        internal
        view
        returns (uint64 paidSeconds, uint64 grantSeconds, bool changed)
    {
        paidSeconds = state.paidSeconds;
        grantSeconds = state.grantSeconds;
        if (timestamp <= state.checkpoint || paidSeconds == 0 && grantSeconds == 0) {
            return (paidSeconds, grantSeconds, false);
        }

        uint256 elapsed = timestamp - state.checkpoint;
        uint256 totalSeconds = uint256(paidSeconds) + grantSeconds;
        if (elapsed >= totalSeconds) return (0, 0, true);

        if (elapsed < paidSeconds) {
            return (paidSeconds - elapsed.toUint64(), grantSeconds, true);
        }

        return (0, grantSeconds - (elapsed - paidSeconds).toUint64(), true);
    }

    function _storedExpiration(MembershipTypes.MembershipState storage state)
        internal
        view
        returns (uint64)
    {
        return uint64(uint256(state.checkpoint) + state.paidSeconds + state.grantSeconds);
    }

    function _isActiveToken(uint256 tokenId) internal view returns (bool) {
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        return _currentTimestamp() < _storedExpiration(state);
    }

    function _durationForPeriods(uint64 periods) internal view returns (uint64 duration) {
        if (periods == 0) revert InvalidPeriods();
        uint256 calculatedDuration = uint256(periods) * periodDuration;
        if (calculatedDuration > type(uint64).max) revert DurationOverflow();
        duration = calculatedDuration.toUint64();
    }

    function _ensureExpirationCapacity(
        MembershipTypes.MembershipState storage state,
        uint64 duration
    ) internal view {
        if (uint256(_storedExpiration(state)) + duration > type(uint64).max) {
            revert DurationOverflow();
        }
    }

    function _requireCapacity() internal view {
        if (supplyCap != 0 && occupiedSupply >= supplyCap) revert CapacityReached();
        if (occupiedSupply == type(uint64).max) revert CapacityReached();
    }

    function _requireNotPaused() internal view {
        if (paused) revert TierPaused();
    }

    function _requireKnownToken(uint256 tokenId) internal view {
        if (tokenId == 0 || tokenId > totalMinted) revert InvalidTokenId(tokenId);
    }

    function _currentTimestamp() internal view returns (uint64 timestamp) {
        uint256 currentTimestamp = block.timestamp;
        if (currentTimestamp > type(uint64).max) revert TimestampOverflow();
        timestamp = currentTimestamp.toUint64();
    }

    function _validateMetadata(
        string memory tierName,
        string memory tierSymbol,
        MembershipTypes.TierMetadata memory metadata
    ) internal pure {
        if (
            bytes(tierName).length == 0 || bytes(tierName).length > MAX_NAME_BYTES
                || bytes(tierSymbol).length == 0 || bytes(tierSymbol).length > MAX_SYMBOL_BYTES
        ) {
            revert InvalidMetadata();
        }
        TextValidation.validate(tierName);
        TextValidation.validate(tierSymbol);
        _validateMutableMetadata(metadata);
    }

    function _validateMutableMetadata(MembershipTypes.TierMetadata memory metadata) internal pure {
        if (
            bytes(metadata.description).length > MAX_DESCRIPTION_BYTES
                || bytes(metadata.externalURI).length > MAX_URI_BYTES
        ) {
            revert InvalidMetadata();
        }
        TextValidation.validate(metadata.description);
        TextValidation.validate(metadata.externalURI);
    }

    function _validateMedia(MembershipTypes.MediaConfig memory media) private pure {
        bool hasOnchainFields = media.mime != MembershipTypes.MediaMIME.None
            || media.store != address(0) || media.length != 0 || media.digest != bytes32(0)
            || media.runtimeCodehash != bytes32(0);
        if (!hasOnchainFields) {
            return;
        }
        if (
            media.store == address(0) || media.length == 0
                || media.length > MAX_RENDERABLE_MEDIA_BYTES || media.digest == bytes32(0)
                || media.runtimeCodehash == bytes32(0)
                || (media.mime != MembershipTypes.MediaMIME.JPEG
                    && media.mime != MembershipTypes.MediaMIME.PNG)
        ) revert InvalidMediaConfig();
    }

    /// @dev Existing credentials cannot move or burn. A future mint still uses the ERC-721 path.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    /// @notice Starts a two-step transfer and rejects zero-address cancellation.
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        super.transferOwnership(newOwner);
    }

    /// @notice Tier ownership cannot be discarded because creator controls must remain operable.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
