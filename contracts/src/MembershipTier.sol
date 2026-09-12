// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721Utils} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Utils.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {TierIdentity} from "./TierIdentity.sol";
import {IERC5643} from "./interfaces/IERC5643.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IOnchainMediaStoreFactory} from "./interfaces/IOnchainMediaStoreFactory.sol";
import {IProtocolBuybackVault} from "./interfaces/IProtocolBuybackVault.sol";
import {ExpirationSchedule} from "./libraries/ExpirationSchedule.sol";
import {VestingLedger} from "./libraries/VestingLedger.sol";
import {RendererPrimitives} from "./renderer/RendererPrimitives.sol";
import {TextValidation} from "./renderer/TextValidation.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice One immutable-economic creator membership tier with independent positions.
/// @dev Uses the existing Cancun target's transient guard: the lock is reset
/// after each call, with no persistent storage write or weaker callback protection.
contract MembershipTier is
    ERC721Enumerable,
    Ownable2Step,
    ReentrancyGuardTransient,
    IMembershipTier
{
    using SafeCast for uint256;
    using ExpirationSchedule for ExpirationSchedule.State;
    using SafeERC20 for IERC20;

    uint16 public immutable override protocolFeeBps;
    uint256 public constant MAX_NAME_BYTES = 100;
    uint256 public constant MAX_SYMBOL_BYTES = 16;
    uint256 public constant MAX_DESCRIPTION_BYTES = 500;
    uint256 public constant MAX_URI_BYTES = 2048;
    uint256 public constant MAX_RENDERABLE_MEDIA_BYTES =
        RendererPrimitives.MAX_RENDERABLE_MEDIA_BYTES;

    uint16 private constant _BPS_DENOMINATOR = 10_000;

    address public immutable override factory;
    address public immutable override buybackVault;
    IERC20 public immutable override paymentToken;
    address public override renderer;
    bytes32 public immutable override tierIdentity;
    uint112 public immutable override minimumPayment;
    uint256 public immutable override pricePerPeriod;
    uint64 public immutable override periodDuration;
    uint16 public immutable override rewardBps;
    uint16 public immutable override referralBps;
    uint32 public immutable override startingBoostBps;
    uint112 public immutable override earlySupportGross;
    uint256 public constant override MAX_LIFETIME_GROSS = type(uint112).max;
    uint256 public constant override ACCOUNTING_SCALE = 1 << 128;
    uint256 public constant override MAX_ACCOUNTING_STEPS = 25;

    uint32 public constant override NORMAL_BOOST_BPS = 10_000;
    uint32 public constant override MIN_ENABLED_BOOST_BPS = 10_100;
    uint32 public constant override MAX_BOOST_BPS = 100_000;
    uint32 public constant override BOOST_STEP_BPS = 100;

    VestingLedger.State private _vesting;
    ExpirationSchedule.State internal _expirations;

    uint64 public override supplyCap;
    uint64 public override maxPrepaidPeriods;
    uint64 public override occupiedSupply;
    uint256 public override totalMinted;
    bool public override paused;

    string public override description;
    string public override externalURI;

    MembershipTypes.ArtConfig private _art;
    MembershipTypes.MediaConfig private _media;

    mapping(uint256 tokenId => MembershipTypes.MembershipState state) internal _membershipStates;
    mapping(uint256 tokenId => MembershipTypes.ReferralState state) private _referralStates;
    error CapacityReached();
    error MembershipExpired(uint256 tokenId, uint64 expiration);
    error MembershipOwnerMismatch(uint256 tokenId, address expectedOwner, address actualOwner);
    error InvalidPositionPage();
    error InvalidAccountingSteps();
    error DurationOverflow();
    error InvalidAddress();
    error InvalidMetadata();
    error InvalidMediaConfig();
    error InvalidPaidDuration();
    error InvalidPeriodDuration();
    error InvalidPeriods();
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
    error AccountingBehind(uint64 accountedThrough, uint64 nextBoundary);
    error CurveCapacityExceeded();
    error PrepaymentLimitExceeded();
    error ReferralChoiceMismatch();
    error ReferralChoiceRequired();
    error ReferralStateMismatch();
    error SelfGiftNotAllowed();
    error SupplyCapBelowOccupancy();
    error TierPaused();
    error PaymentBelowMinimum(uint256 amount, uint256 minimum);
    error InvalidMinimumPayment();
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
        VestingLedger.validateCurve(
            config.startingBoostBps, config.earlySupportGross, config.pricePerPeriod
        );
        startingBoostBps = config.startingBoostBps;
        earlySupportGross = config.earlySupportGross;
        VestingLedger.initialize(_vesting, block.timestamp.toUint64());
        if (
            config.protocolFeeBps < 100 || config.protocolFeeBps > _BPS_DENOMINATOR
                || uint256(config.rewardBps) + config.referralBps + config.protocolFeeBps
                    > _BPS_DENOMINATOR
        ) {
            revert InvalidRateTotal();
        }
        _validateMetadata(config.name, config.symbol, config.metadata);
        _validateMedia(config.media);

        factory = factory_;
        buybackVault = IMembershipFactory(factory_).buybackVault();
        paymentToken = paymentToken_;
        renderer = config.renderer;
        tierIdentity = TierIdentity.derive(factory_, config.creator, config.tierSalt);
        uint112 minimum = IMembershipFactory(factory_).minimumPayment(address(paymentToken_));
        if (minimum == 0 || config.minimumPayment != minimum) revert InvalidMinimumPayment();
        if (config.pricePerPeriod != 0 && config.pricePerPeriod < minimum) {
            revert PaymentBelowMinimum(config.pricePerPeriod, minimum);
        }
        minimumPayment = minimum;
        pricePerPeriod = config.pricePerPeriod;
        periodDuration = config.periodDuration;
        protocolFeeBps = config.protocolFeeBps;
        rewardBps = config.rewardBps;
        referralBps = config.referralBps;
        supplyCap = config.supplyCap;
        maxPrepaidPeriods = config.maxPrepaidPeriods;
        description = config.metadata.description;
        externalURI = config.metadata.externalURI;
        _art = config.art;
        _media = config.media;
    }

    function previewShares(uint256 gross)
        external
        view
        override
        returns (MembershipTypes.ShareQuote memory quote)
    {
        quote.grossBefore = lifetimeGross();
        quote.sharesAdded = VestingLedger.quoteShares(
            quote.grossBefore, gross, startingBoostBps, earlySupportGross
        );
        quote.grossAfter = (uint256(quote.grossBefore) + gross).toUint112();
    }

    function lifetimeGross() public view override returns (uint112) {
        return _vesting.totalGross.toUint112();
    }

    function sharesOf(uint256 tokenId) public view override returns (uint256) {
        return _vesting.members[tokenId].shares;
    }

    function rewardEligible(uint256 tokenId) public view override returns (bool) {
        return _isActiveToken(tokenId) && _vesting.members[tokenId].eligible;
    }

    function totalRewardShares() public view override returns (uint256) {
        return _vesting.totalShares;
    }

    function rewardPerShare() external view override returns (uint256) {
        return _vesting.rewardPerShare;
    }

    function creatorProceeds() public view override returns (uint256) {
        return _vesting.earnedScaled[0] / ACCOUNTING_SCALE;
    }

    function protocolFeeEarnedHeld() public view override returns (uint256) {
        return _vesting.earnedScaled[3] / ACCOUNTING_SCALE;
    }

    function claimableReferral(address referrer) public view override returns (uint256) {
        return VestingLedger.referrerCredit(_vesting, referrer) / ACCOUNTING_SCALE;
    }

    function accountingStatus()
        public
        view
        override
        returns (MembershipTypes.AccountingStatus memory result)
    {
        result.accountedThrough = _vesting.accountedThrough;
        result.scheduledMembers = _vesting.heap.length;
        result.scheduledExpirations = _expirations.nodes.length;
        uint64 funding = _vesting.heap.length == 0 ? 0 : _vesting.heap[0].timestamp;
        MembershipTypes.ExpirationNode memory expiration = _expirations.peek();
        if (funding != 0 && (expiration.tokenId == 0 || funding <= expiration.timestamp)) {
            result.nextBoundary = funding;
            result.nextKind = MembershipTypes.BoundaryKind.Funding;
        } else if (expiration.tokenId != 0) {
            result.nextBoundary = expiration.timestamp;
            result.nextKind = MembershipTypes.BoundaryKind.Expiration;
        }
        uint64 now_ = _currentTimestamp();
        result.complete = result.accountedThrough == now_
            && (result.nextBoundary == 0 || result.nextBoundary > now_);
    }

    function processAccounting(uint256 maxSteps)
        external
        override
        nonReentrant
        returns (MembershipTypes.MaintenanceResult memory)
    {
        if (maxSteps == 0 || maxSteps > MAX_ACCOUNTING_STEPS) {
            revert InvalidAccountingSteps();
        }
        return _processAccounting(maxSteps);
    }

    function processExpirations(uint256 maxSteps)
        external
        override
        nonReentrant
        returns (MembershipTypes.MaintenanceResult memory)
    {
        if (maxSteps == 0 || maxSteps > MAX_ACCOUNTING_STEPS) {
            revert InvalidAccountingSteps();
        }
        return _processAccounting(maxSteps);
    }

    function _processAccounting(uint256 maxSteps)
        private
        returns (MembershipTypes.MaintenanceResult memory result)
    {
        if (maxSteps > MAX_ACCOUNTING_STEPS) revert InvalidAccountingSteps();
        uint64 now_ = _currentTimestamp();
        while (true) {
            MembershipTypes.ExpirationNode memory expiration = _expirations.peek();
            bool due = expiration.tokenId != 0 && expiration.timestamp <= now_;
            uint64 through = due ? expiration.timestamp : now_;
            VestingLedger.ProcessResult memory funding =
                VestingLedger.advanceTo(_vesting, through, maxSteps - result.processedSteps);
            result.processedSteps += funding.processed;
            result.earnedScaledDelta += funding.earnedScaled;
            if (!funding.complete || !due || result.processedSteps == maxSteps) break;
            _retire(expiration.tokenId, expiration.timestamp);
            ++result.processedSteps;
            ++result.retiredCount;
        }
        MembershipTypes.AccountingStatus memory status = accountingStatus();
        result.accountedThrough = status.accountedThrough;
        result.complete = status.complete;
        emit AccountingProgress(
            result.accountedThrough,
            result.processedSteps,
            result.complete,
            result.earnedScaledDelta,
            result.retiredCount
        );
    }

    function _catchUp() private {
        _catchUp(MAX_ACCOUNTING_STEPS);
    }

    function _catchUp(uint256 maxSteps) private returns (uint256 processedSteps) {
        MembershipTypes.MaintenanceResult memory result = _processAccounting(maxSteps);
        if (!result.complete) {
            revert AccountingBehind(result.accountedThrough, accountingStatus().nextBoundary);
        }
        return result.processedSteps;
    }

    function _retire(uint256 tokenId, uint64 effectiveAt) private {
        address beneficiary = _requireOwned(tokenId);
        uint256 shares = _vesting.members[tokenId].shares;
        uint256 credit = VestingLedger.retireMember(_vesting, tokenId, beneficiary);
        _expirations.remove(tokenId);
        if (_membershipStates[tokenId].occupied) --occupiedSupply;
        delete _membershipStates[tokenId];
        delete _referralStates[tokenId];
        super._update(address(0), tokenId, address(0));
        emit MembershipRetired(tokenId, beneficiary, effectiveAt, shares, credit);
    }

    function _requireLive(uint256 tokenId) private view returns (address beneficiary) {
        beneficiary = _requireOwned(tokenId);
        uint64 expiration = _storedExpiration(_membershipStates[tokenId]);
        if (_currentTimestamp() >= expiration) revert MembershipExpired(tokenId, expiration);
    }

    function _requireExpectedOwner(uint256 tokenId, address expectedOwner) private view {
        address actual = _requireLive(tokenId);
        if (actual != expectedOwner) {
            revert MembershipOwnerMismatch(tokenId, expectedOwner, actual);
        }
    }

    function previewAccounting(
        uint256 tokenId,
        address beneficiary,
        address referrer,
        uint256 maxSteps
    ) external view override returns (MembershipTypes.AccountingPreview memory) {
        if (tokenId != 0) _requireKnownToken(tokenId);
        bytes memory encoded = VestingLedger.encodedPreview(
            _vesting, _expirations, tokenId, beneficiary, referrer, _currentTimestamp(), maxSteps
        );
        // Forward compiler-encoded library output without a second tuple codec.
        assembly ("memory-safe") { return(add(encoded, 32), mload(encoded)) }
    }

    function allocationState(uint256 tokenId)
        external
        view
        override
        returns (MembershipTypes.AllocationState memory)
    {
        _requireKnownToken(tokenId);
        bytes memory encoded =
            VestingLedger.encodedAllocationState(_vesting, tokenId, _currentTimestamp());
        MembershipTypes.AllocationState memory result =
            abi.decode(encoded, (MembershipTypes.AllocationState));
        result.status = accountingStatus();
        return result;
    }

    function allocationLots(uint256 tokenId, uint256 generation, uint256 offset, uint256 limit)
        external
        view
        override
        returns (MembershipTypes.AllocationLot[] memory)
    {
        _requireKnownToken(tokenId);
        bytes memory encoded =
            VestingLedger.encodedLots(_vesting, tokenId, generation, offset, limit);
        assembly ("memory-safe") { return(add(encoded, 32), mload(encoded)) }
    }

    function reserveState() external view override returns (MembershipTypes.ReserveState memory) {
        bytes memory encoded = VestingLedger.encodedReserves(_vesting, _currentTimestamp());
        MembershipTypes.ReserveState memory result =
            abi.decode(encoded, (MembershipTypes.ReserveState));
        result.status = accountingStatus();
        return result;
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
        ) {
            revert InvalidRenderer();
        }
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

    /// @inheritdoc IERC5643
    function renewSubscription(uint256 tokenId, uint64 duration) external payable override {
        if (msg.value != 0) revert NativeValueRejected();
        _renewSubscription(tokenId, duration);
    }

    function _renewSubscription(uint256 tokenId, uint64 duration) private nonReentrant {
        address recipient = _requireLive(tokenId);
        if (recipient != msg.sender) revert TokenOwnerOnly();
        if (duration == 0 || duration % periodDuration != 0) revert InvalidPaidDuration();
        _requireNotPaused();

        uint64 periods = duration / periodDuration;
        if (pricePerPeriod == 0) {
            if (periods != 1) revert InvalidPeriods();
            _contribute(tokenId, msg.sender, 0, address(0));
            return;
        }

        MembershipTypes.ReferralState storage referralState = _referralStates[tokenId];
        if (referralState.status == MembershipTypes.ReferralStatus.Unset) {
            revert ReferralChoiceRequired();
        }
        _purchaseFixed(tokenId, msg.sender, msg.sender, periods, true, referralState.referrer);
    }

    /// @inheritdoc IERC5643
    /// @dev Creator-authorized ERC-5643 cancellation uses the same reserved-funding path
    ///      without a caller-selected gross ceiling.
    function cancelSubscription(uint256 tokenId) external payable override {
        if (msg.value != 0) revert NativeValueRejected();
        _cancelSubscription(tokenId);
    }

    function _cancelSubscription(uint256 tokenId) private nonReentrant {
        _checkOwner();
        _refund(tokenId, _requireLive(tokenId), type(uint256).max);
    }

    /// @inheritdoc IERC5643
    function expiresAt(uint256 tokenId) public view override returns (uint64) {
        _requireOwned(tokenId);
        return _storedExpiration(_membershipStates[tokenId]);
    }

    /// @inheritdoc IERC5643
    function isRenewable(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        if (paused || !_isActiveToken(tokenId)) return false;
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
    function tokensOfOwner(address recipient, uint256 offset, uint256 limit)
        external
        view
        override
        returns (MembershipTypes.PositionPage memory page)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (limit == 0 || limit > 100) revert InvalidPositionPage();
        page.balance = balanceOf(recipient);
        if (offset >= page.balance) {
            page.tokenIds = new uint256[](0);
            page.nextOffset = page.balance;
            page.complete = true;
            return page;
        }
        uint256 count = Math.min(limit, page.balance - offset);
        page.tokenIds = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            page.tokenIds[i] = tokenOfOwnerByIndex(recipient, offset + i);
        }
        page.nextOffset = offset + count;
        page.complete = page.nextOffset == page.balance;
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

    function createMembership(uint64 periods, address referralChoice)
        external
        override
        nonReentrant
        returns (uint256)
    {
        return _purchaseFixed(0, msg.sender, msg.sender, periods, true, referralChoice);
    }

    function renewMembership(uint256 tokenId, uint64 periods, address referralChoice)
        external
        override
        nonReentrant
    {
        if (_requireLive(tokenId) != msg.sender) revert TokenOwnerOnly();
        _purchaseFixed(tokenId, msg.sender, msg.sender, periods, true, referralChoice);
    }

    function giftMembership(address recipient, uint64 periods)
        external
        override
        nonReentrant
        returns (uint256)
    {
        if (recipient == msg.sender) revert SelfGiftNotAllowed();
        return _purchaseFixed(0, msg.sender, recipient, periods, false, address(0));
    }

    function giftRenewal(
        uint256 tokenId,
        address expectedOwner,
        uint64 periods,
        MembershipTypes.ReferralStatus expectedReferralStatus,
        address expectedReferrer
    ) external override nonReentrant {
        _requireExpectedOwner(tokenId, expectedOwner);
        if (expectedOwner == msg.sender) revert SelfGiftNotAllowed();
        _validateExpectedReferralState(tokenId, expectedReferralStatus, expectedReferrer);
        _purchaseFixed(tokenId, msg.sender, expectedOwner, periods, false, address(0));
    }

    function createContributionMembership(uint256 gross, address referralChoice)
        external
        override
        nonReentrant
        returns (uint256)
    {
        return _contribute(0, msg.sender, gross, referralChoice);
    }

    function renewContributionMembership(uint256 tokenId, uint256 gross, address referralChoice)
        external
        override
        nonReentrant
    {
        if (_requireLive(tokenId) != msg.sender) revert TokenOwnerOnly();
        _contribute(tokenId, msg.sender, gross, referralChoice);
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
        return Math.ceilDiv(VestingLedger.liabilityScaled(_vesting), ACCOUNTING_SCALE);
    }

    function releaseProtocolFees() external override nonReentrant returns (uint256 amount) {
        amount = VestingLedger.takeEarned(_vesting, 3, type(uint256).max);
        if (amount == 0) return 0;
        _pushExact(buybackVault, amount);
        IProtocolBuybackVault(buybackVault).recordEarnedFees(amount);
        emit ProtocolFeesReleased(buybackVault, address(paymentToken), amount);
    }

    /// @inheritdoc IMembershipTier
    function claimableReward(uint256 tokenId) public view override returns (uint256) {
        _requireKnownToken(tokenId);
        return VestingLedger.memberCredit(_vesting, tokenId) / ACCOUNTING_SCALE;
    }

    /// @inheritdoc IMembershipTier
    function withdrawCreatorProceeds()
        external
        override
        onlyOwner
        nonReentrant
        returns (uint256 amount)
    {
        amount = VestingLedger.takeEarned(_vesting, 0, type(uint256).max);
        if (amount == 0) return 0;
        address recipient = owner();
        _pushExact(recipient, amount);
        emit CreatorProceedsWithdrawn(recipient, amount);
    }

    /// @inheritdoc IMembershipTier
    function claimReward(uint256 tokenId) external override nonReentrant returns (uint256 amount) {
        address recipient = _requireOwned(tokenId);
        if (recipient != msg.sender) revert TokenOwnerOnly();
        _catchUp();
        if (_ownerOf(tokenId) == address(0)) return _claimRetired(recipient);
        if (_ownerOf(tokenId) != recipient) revert TokenOwnerOnly();
        amount = VestingLedger.takeMember(_vesting, tokenId);
        if (amount == 0) return 0;
        _pushExact(recipient, amount);
        emit RewardClaimed(tokenId, recipient, amount);
    }

    function claimableRetiredReward(address beneficiary)
        external
        view
        override
        returns (uint256 raw, uint256 fractionalScaled)
    {
        uint256 credit = _vesting.retiredCreditScaled[beneficiary];
        return (credit / ACCOUNTING_SCALE, credit % ACCOUNTING_SCALE);
    }

    function claimRetiredRewards() external override nonReentrant returns (uint256) {
        return _claimRetired(msg.sender);
    }

    function _claimRetired(address beneficiary) private returns (uint256 amount) {
        amount = VestingLedger.takeRetired(_vesting, beneficiary);
        if (amount != 0) {
            _pushExact(beneficiary, amount);
            emit RetiredRewardClaimed(beneficiary, amount);
        }
    }

    /// @inheritdoc IMembershipTier
    function claimReferral() external override nonReentrant returns (uint256 amount) {
        address recipient = msg.sender;
        amount = VestingLedger.takeReferrer(_vesting, recipient);
        if (amount == 0) return 0;
        _pushExact(recipient, amount);
        emit ReferralClaimed(recipient, amount);
    }

    /// @notice Includes active referral streams even before their first settlement.
    function hasClaimInterest(address beneficiary) external view override returns (bool) {
        return owner() == beneficiary || (beneficiary != address(0) && balanceOf(beneficiary) != 0)
            || _vesting.retiredCreditScaled[beneficiary] != 0
            || _vesting.referrers[beneficiary].rate != 0
            || VestingLedger.referrerCredit(_vesting, beneficiary) != 0;
    }

    function claimRewards(uint256[] calldata tokenIds, uint256 maxSteps)
        external
        override
        nonReentrant
        returns (MembershipTypes.ClaimResult memory)
    {
        return _claimRewards(msg.sender, tokenIds, maxSteps);
    }

    function claimRewardsFor(address beneficiary, uint256[] calldata tokenIds, uint256 maxSteps)
        external
        override
        nonReentrant
        returns (MembershipTypes.ClaimResult memory)
    {
        if (msg.sender != factory) revert ClaimFactoryOnly();
        return _claimRewards(beneficiary, tokenIds, maxSteps);
    }

    error ClaimFactoryOnly();
    error InvalidClaim();

    function previewClaimRewards(address beneficiary, uint256[] calldata tokenIds, uint256 maxSteps)
        external
        view
        override
        returns (MembershipTypes.ClaimPreview memory)
    {
        _validateClaimSelection(beneficiary, tokenIds);
        bytes memory encoded = VestingLedger.encodedClaimPreview(
            _vesting,
            _expirations,
            beneficiary,
            tokenIds,
            _currentTimestamp(),
            maxSteps,
            beneficiary == owner()
        );
        assembly ("memory-safe") { return(add(encoded, 32), mload(encoded)) }
    }

    function _validateClaimSelection(address beneficiary, uint256[] calldata tokenIds)
        private
        view
    {
        if (beneficiary == address(0) || tokenIds.length > 32) revert InvalidClaim();
        for (uint256 i; i < tokenIds.length; ++i) {
            if (_requireOwned(tokenIds[i]) != beneficiary) revert TokenOwnerOnly();
            for (uint256 j; j < i; ++j) {
                if (tokenIds[j] == tokenIds[i]) revert InvalidClaim();
            }
        }
    }

    function _claimRewards(address beneficiary, uint256[] calldata tokenIds, uint256 maxSteps)
        private
        returns (MembershipTypes.ClaimResult memory result)
    {
        if (maxSteps > MAX_ACCOUNTING_STEPS) revert InvalidClaim();
        _validateClaimSelection(beneficiary, tokenIds);
        uint256 processed = _catchUp(maxSteps);
        for (uint256 i; i < tokenIds.length; ++i) {
            address currentOwner = _ownerOf(tokenIds[i]);
            if (currentOwner != address(0) && currentOwner != beneficiary) revert TokenOwnerOnly();
        }
        result = VestingLedger.takeClaims(_vesting, tokenIds, beneficiary, beneficiary == owner());
        result.processedSteps = processed;
        uint256 amount = result.liveReward + result.retiredReward + result.referral + result.creator;
        if (amount != 0) _pushExact(beneficiary, amount);
    }

    /// @inheritdoc IMembershipTier
    function previewRefund(uint256 tokenId)
        external
        view
        override
        returns (MembershipTypes.RefundPreview memory)
    {
        address recipient = _requireOwned(tokenId);
        uint64 now_ = _currentTimestamp();
        (uint64 paidSeconds, uint64 grantSeconds,) =
            _timeBalancesAt(_membershipStates[tokenId], now_);
        bytes memory encoded = VestingLedger.encodedRefund(
            _vesting, tokenId, recipient, paidSeconds, grantSeconds, now_
        );
        MembershipTypes.RefundPreview memory result =
            abi.decode(encoded, (MembershipTypes.RefundPreview));
        MembershipTypes.AccountingStatus memory status = accountingStatus();
        result.complete = status.complete && _isActiveToken(tokenId);
        result.projected = result.projected && _isActiveToken(tokenId)
            && (status.nextBoundary == 0 || status.nextBoundary > now_);
        return result;
    }

    /// @inheritdoc IMembershipTier
    function refund(uint256 tokenId, address expectedOwner, uint256 maxGrossRefund)
        external
        override
        onlyOwner
        nonReentrant
        returns (uint256 grossRefund)
    {
        return _refund(tokenId, expectedOwner, maxGrossRefund);
    }

    function grantMembership(address recipient, uint64 periods)
        external
        override
        onlyOwner
        nonReentrant
        returns (uint256 tokenId)
    {
        _requireNotPaused();
        uint64 duration = _durationForPeriods(periods);
        _catchUp();
        tokenId = _prepareTimeIncrease(0, recipient, duration, false);
        _membershipStates[tokenId].grantSeconds += duration;
        _emitTimeUpdate(tokenId, _membershipStates[tokenId]);
        _safeMint(recipient, tokenId);
    }

    function addGrantTime(uint256 tokenId, address expectedOwner, uint64 periods)
        external
        override
        onlyOwner
        nonReentrant
    {
        _requireExpectedOwner(tokenId, expectedOwner);
        _requireNotPaused();
        uint64 duration = _durationForPeriods(periods);
        _catchUp();
        _prepareTimeIncrease(tokenId, expectedOwner, duration, false);
        _membershipStates[tokenId].grantSeconds += duration;
        _emitTimeUpdate(tokenId, _membershipStates[tokenId]);
    }

    /// @inheritdoc IMembershipTier
    function revokeGrantTime(uint256 tokenId, address expectedOwner)
        external
        override
        onlyOwner
        nonReentrant
        returns (uint64 revokedSeconds)
    {
        _requireExpectedOwner(tokenId, expectedOwner);
        _catchUp();
        _requireExpectedOwner(tokenId, expectedOwner);
        _checkpointTime(tokenId);

        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        revokedSeconds = state.grantSeconds;
        if (revokedSeconds == 0) revert NoGrantTime();
        state.grantSeconds = 0;
        _emitTimeUpdate(tokenId, state);
        if (state.paidSeconds == 0) _retire(tokenId, _currentTimestamp());
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
        override(ERC721Enumerable, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC5643).interfaceId || interfaceId == 0x49064906
            || interfaceId == type(IMembershipTier).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function _purchaseFixed(
        uint256 tokenId,
        address payer,
        address recipient,
        uint64 periods,
        bool selfPayment,
        address referralChoice
    ) internal returns (uint256) {
        _requireNotPaused();
        if (tokenId != 0) _requireExpectedOwner(tokenId, recipient);
        if (pricePerPeriod == 0) revert IncorrectPricingMode();
        uint64 duration = _durationForPeriods(periods);
        uint256 gross = pricePerPeriod * periods;
        _catchUp();
        _validateGross(gross);
        bool creating = tokenId == 0;
        tokenId = _prepareTimeIncrease(tokenId, recipient, duration, true);
        if (selfPayment) _validateReferralChoice(tokenId, referralChoice);
        _pullExact(payer, gross);
        _membershipStates[tokenId].paidSeconds += duration;
        _emitTimeUpdate(tokenId, _membershipStates[tokenId]);
        if (selfPayment) _lockReferralChoice(tokenId, referralChoice);
        _applyPayment(tokenId, payer, recipient, periods, gross);
        if (creating) _safeMint(recipient, tokenId);
        return tokenId;
    }

    function _refund(uint256 tokenId, address expectedOwner, uint256 maxGrossRefund)
        internal
        returns (uint256 grossRefund)
    {
        _requireExpectedOwner(tokenId, expectedOwner);
        _catchUp();
        _requireExpectedOwner(tokenId, expectedOwner);
        address recipient = expectedOwner;
        _checkpointTime(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        uint64 paidSeconds = state.paidSeconds;
        uint64 grantSeconds = state.grantSeconds;
        uint256 generation = _vesting.funding[tokenId].generation;
        uint256[4] memory funding;
        uint256[4] memory residues;
        (grossRefund, funding, residues) = VestingLedger.cancelFunding(_vesting, tokenId);
        if (grossRefund > maxGrossRefund) {
            revert GrossRefundLimitExceeded(grossRefund, maxGrossRefund);
        }
        state.paidSeconds = 0;
        state.grantSeconds = 0;
        _emitTimeUpdate(tokenId, state);
        _retire(tokenId, _currentTimestamp());
        if (grossRefund != 0) _pushExact(recipient, grossRefund);
        emit RefundFunded(tokenId, generation, grossRefund, funding);
        emit FundingGenerationCanceled(tokenId, generation, residues);
        emit MembershipRefunded(tokenId, recipient, grossRefund, paidSeconds, grantSeconds);
    }

    function _contribute(uint256 tokenId, address payer, uint256 gross, address referralChoice)
        internal
        returns (uint256)
    {
        _requireNotPaused();
        if (tokenId != 0) _requireExpectedOwner(tokenId, payer);
        if (pricePerPeriod != 0) revert IncorrectPricingMode();
        if (gross != 0 && gross < minimumPayment) {
            revert PaymentBelowMinimum(gross, minimumPayment);
        }
        _catchUp();
        if (gross != 0) _validateGross(gross);
        bool creating = tokenId == 0;
        tokenId = _prepareTimeIncrease(tokenId, payer, periodDuration, true);
        if (gross != 0) {
            _validateReferralChoice(tokenId, referralChoice);
            _pullExact(payer, gross);
        }
        _membershipStates[tokenId].paidSeconds += periodDuration;
        _emitTimeUpdate(tokenId, _membershipStates[tokenId]);
        if (gross != 0) {
            _lockReferralChoice(tokenId, referralChoice);
            _applyPayment(tokenId, payer, payer, 1, gross);
        } else {
            emit PaymentProcessed(payer, payer, tokenId, 0, 1);
        }
        if (creating) _safeMint(payer, tokenId);
        return tokenId;
    }

    function _applyPayment(
        uint256 tokenId,
        address payer,
        address recipient,
        uint64 periods,
        uint256 gross
    ) internal {
        uint256[4] memory allocations;
        address referrer;
        if (_referralStates[tokenId].status == MembershipTypes.ReferralStatus.LockedAddress) {
            referrer = _referralStates[tokenId].referrer;
        }
        // Gross is validated <= uint112.max before transfer. Constructor-validated
        // immutable BPS values sum to <= 10,000: products fit within 126 bits and
        // the sum of the three floored allocations cannot exceed gross. Both the
        // products and creator remainder are therefore safe without overflow checks.
        unchecked {
            allocations[3] = gross * protocolFeeBps / _BPS_DENOMINATOR;
            allocations[1] = gross * rewardBps / _BPS_DENOMINATOR;
            if (referrer != address(0)) allocations[2] = gross * referralBps / _BPS_DENOMINATOR;
            allocations[0] = gross - allocations[1] - allocations[2] - allocations[3];
        }
        bool wasEligible = rewardEligible(tokenId);
        (uint256 issued, uint256 shares) =
            VestingLedger.issueShares(_vesting, tokenId, gross, startingBoostBps, earlySupportGross);
        if (!wasEligible) {
            emit RewardEligibilityUpdated(tokenId, true, shares, totalRewardShares());
        }
        emit SharesIssued(tokenId, issued, shares, totalRewardShares());
        uint64 duration = (uint256(periods) * periodDuration).toUint64();
        uint64 start = (uint256(_currentTimestamp()) + _membershipStates[tokenId].paidSeconds
                - duration)
        .toUint64();
        VestingLedger.append(_vesting, tokenId, allocations, start, duration, referrer);
        emit PaymentProcessed(payer, recipient, tokenId, gross, periods);
        emit PaymentAllocated(
            tokenId, allocations[3], allocations[1], allocations[2], allocations[0]
        );
    }

    function _validateGross(uint256 gross) private view {
        if (gross > MAX_LIFETIME_GROSS - _vesting.totalGross) revert CurveCapacityExceeded();
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

    function _checkpointTime(uint256 tokenId) internal {
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        uint64 timestamp = _currentTimestamp();
        (uint64 paidSeconds, uint64 grantSeconds, bool changed) = _timeBalancesAt(state, timestamp);
        if (!changed) return;
        uint64 priorExpiration = _storedExpiration(state);
        state.paidSeconds = paidSeconds;
        state.grantSeconds = grantSeconds;
        state.checkpoint = paidSeconds == 0 && grantSeconds == 0 ? priorExpiration : timestamp;
    }

    function _prepareTimeIncrease(uint256 tokenId, address recipient, uint64 duration, bool paid)
        private
        returns (uint256)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (tokenId == 0) {
            _requireCapacity();
            tokenId = ++totalMinted;
            _membershipStates[tokenId].checkpoint = _currentTimestamp();
            _membershipStates[tokenId].occupied = true;
            ++occupiedSupply;
        } else {
            _requireExpectedOwner(tokenId, recipient);
            _checkpointTime(tokenId);
        }
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (
            paid && maxPrepaidPeriods != 0
                && uint256(state.paidSeconds) + duration
                    > uint256(maxPrepaidPeriods) * periodDuration
        ) {
            revert PrepaymentLimitExceeded();
        }
        _ensureExpirationCapacity(state, duration);
        return tokenId;
    }

    function _emitTimeUpdate(uint256 tokenId, MembershipTypes.MembershipState storage state)
        internal
    {
        uint64 expiration = _storedExpiration(state);
        _expirations.set(tokenId, expiration);
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

    /// @dev Ownership movement never changes the position's accounting or catches up.
    function transferFrom(address from, address to, uint256 tokenId)
        public
        override(ERC721, IERC721)
        nonReentrant
    {
        _transferLive(from, to, tokenId);
    }

    /// @dev The inherited no-data overload delegates here. Keep one guard active
    /// through the receiver, without re-entering the guarded public transferFrom.
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data)
        public
        override(ERC721, IERC721)
        nonReentrant
    {
        _transferLive(from, to, tokenId);
        ERC721Utils.checkOnERC721Received(_msgSender(), from, to, tokenId, data);
    }

    function _transferLive(address from, address to, uint256 tokenId) private {
        _requireLive(tokenId);
        super.transferFrom(from, to, tokenId);
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
