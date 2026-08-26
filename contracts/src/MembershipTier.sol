// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {OnchainMetadataRenderer} from "./OnchainMetadataRenderer.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";
import {IERC5643} from "./interfaces/IERC5643.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice One immutable-economic creator membership tier with persistent credentials.
contract MembershipTier is ERC721, Ownable2Step, IMembershipTier {
    using SafeCast for uint256;

    uint16 public constant override protocolFeeBps = 100;
    uint256 public constant MAX_NAME_BYTES = 100;
    uint256 public constant MAX_SYMBOL_BYTES = 16;
    uint256 public constant MAX_DESCRIPTION_BYTES = 500;
    uint256 public constant MAX_URI_BYTES = 2048;

    uint16 private constant _BPS_DENOMINATOR = 10_000;

    address public immutable override factory;
    IERC20 public immutable override paymentToken;
    address public immutable override renderer;
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
    string public override imageURI;
    string public override externalURI;

    mapping(address recipient => uint256 tokenId) public override tokenOf;
    mapping(uint256 tokenId => MembershipTypes.MembershipState state) internal _membershipStates;

    error CapacityReached();
    error DurationOverflow();
    error InvalidAddress();
    error InvalidMetadata();
    error InvalidPaidDuration();
    error InvalidPeriodDuration();
    error InvalidPeriods();
    error InvalidRateTotal();
    error LifecycleUnavailable();
    error NativeValueRejected();
    error NoGrantTime();
    error OwnershipRenunciationDisabled();
    error PrepaymentLimitExceeded();
    error Soulbound();
    error SupplyCapBelowOccupancy();
    error TierPaused();
    error TimestampOverflow();

    constructor(
        address factory_,
        IERC20 paymentToken_,
        address renderer_,
        MembershipTypes.TierConfig memory config
    ) ERC721(config.name, config.symbol) Ownable(config.creator) {
        if (
            factory_ == address(0) || address(paymentToken_) == address(0)
                || renderer_ == address(0)
        ) {
            revert InvalidAddress();
        }
        if (config.periodDuration == 0) revert InvalidPeriodDuration();
        if (uint256(config.rewardBps) + config.referralBps + protocolFeeBps > _BPS_DENOMINATOR) {
            revert InvalidRateTotal();
        }
        _validateMetadata(config.name, config.symbol, config.metadata);

        factory = factory_;
        paymentToken = paymentToken_;
        renderer = renderer_;
        pricePerPeriod = config.pricePerPeriod;
        periodDuration = config.periodDuration;
        rewardBps = config.rewardBps;
        referralBps = config.referralBps;
        supplyCap = config.supplyCap;
        maxPrepaidPeriods = config.maxPrepaidPeriods;
        description = config.metadata.description;
        imageURI = config.metadata.imageURI;
        externalURI = config.metadata.externalURI;
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @inheritdoc IERC5643
    /// @dev Payment-dependent renewal is implemented in U4.
    function renewSubscription(uint256, uint64) external payable override {
        if (msg.value != 0) revert NativeValueRejected();
        revert LifecycleUnavailable();
    }

    /// @inheritdoc IERC5643
    /// @dev Gross-refund cancellation is implemented in U5.
    function cancelSubscription(uint256) external payable override {
        if (msg.value != 0) revert NativeValueRejected();
        revert LifecycleUnavailable();
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
        _requireOwned(tokenId);
        return _isActiveToken(tokenId);
    }

    /// @inheritdoc IMembershipTier
    function timeBalances(uint256 tokenId)
        external
        view
        override
        returns (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint)
    {
        _requireOwned(tokenId);
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
        _requireOwned(tokenId);
        return _membershipStates[tokenId].occupied;
    }

    /// @inheritdoc IMembershipTier
    function grantTime(address recipient, uint64 periods)
        external
        override
        onlyOwner
        returns (uint256 tokenId)
    {
        _requireNotPaused();
        uint64 duration = _durationForPeriods(periods);
        tokenId = _prepareTimeIncrease(recipient);

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
    }

    /// @inheritdoc IMembershipTier
    function synchronize(uint256 tokenId) external override returns (bool released) {
        address recipient = _requireOwned(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (_isActiveToken(tokenId) || !state.occupied) return false;

        _checkpointTime(tokenId);

        state.occupied = false;
        --occupiedSupply;
        emit MembershipSynchronized(tokenId, recipient);
        emit MetadataUpdate(tokenId);
        return true;
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
        imageURI = newMetadata.imageURI;
        externalURI = newMetadata.externalURI;

        emit TierMetadataUpdated(description, imageURI, externalURI);
        if (totalMinted != 0) emit BatchMetadataUpdate(1, totalMinted);
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return OnchainMetadataRenderer(renderer)
            .renderTokenURI(
                MembershipTypes.TokenRenderData({
                tierName: name(),
                description: description,
                imageURI: imageURI,
                externalURI: externalURI,
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

    /// @notice Adds paid time without implementing collection or allocation.
    /// @dev U4 calls this only after exact payment receipt and economic validation.
    function _addPaidTime(address recipient, uint64 duration) internal returns (uint256 tokenId) {
        _requireNotPaused();
        if (duration == 0 || duration % periodDuration != 0) revert InvalidPaidDuration();
        tokenId = _prepareTimeIncrease(recipient);

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

    function _addPaidPeriods(address recipient, uint64 periods) internal returns (uint256 tokenId) {
        tokenId = _addPaidTime(recipient, _durationForPeriods(periods));
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

    function _prepareTimeIncrease(address recipient) internal returns (uint256 tokenId) {
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
            return tokenId;
        }

        _checkpointTime(tokenId);
        MembershipTypes.MembershipState storage state = _membershipStates[tokenId];
        if (state.paidSeconds == 0 && state.grantSeconds == 0 && state.checkpoint < timestamp) {
            state.checkpoint = timestamp;
        }
        if (!state.occupied) {
            _requireCapacity();
            state.occupied = true;
            ++occupiedSupply;
        }
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
        _validateMutableMetadata(metadata);
    }

    function _validateMutableMetadata(MembershipTypes.TierMetadata memory metadata) internal pure {
        if (
            bytes(metadata.description).length > MAX_DESCRIPTION_BYTES
                || bytes(metadata.imageURI).length > MAX_URI_BYTES
                || bytes(metadata.externalURI).length > MAX_URI_BYTES
        ) {
            revert InvalidMetadata();
        }
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
