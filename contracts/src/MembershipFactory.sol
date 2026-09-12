// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {MembershipTierDeployer} from "./MembershipTierDeployer.sol";
import {ProtocolBurnRouter} from "./ProtocolBurnRouter.sol";
import {ProtocolBuybackVault} from "./ProtocolBuybackVault.sol";
import {TierIdentity} from "./TierIdentity.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IOnchainMediaStoreFactory} from "./interfaces/IOnchainMediaStoreFactory.sol";
import {ProtocolSafeValidation} from "./libraries/ProtocolSafeValidation.sol";
import {VestingLedger} from "./libraries/VestingLedger.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Permissionless official-tier registry with a permanent vault and one-time token binding.
/// @dev Uses the existing Cancun target's transient guard: the lock is reset
/// after each call, with no persistent storage write or weaker callback protection.
contract MembershipFactory is Ownable2Step, ReentrancyGuardTransient, IMembershipFactory {
    uint256 public constant override maxPageSize = 100;
    bytes32 public constant override rendererSchema =
        0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4;
    uint16 private constant _BPS_DENOMINATOR = 10_000;

    address public immutable override mediaStoreFactory;
    bytes32 public immutable override mediaStoreFactoryRuntimeCodehash;
    address public immutable override deployer;

    address public immutable override buybackVault;
    address public immutable override burnRouter;
    address[] private _paymentTokens;
    address[] private _tiers;
    mapping(address token => bool listed) public override isPaymentTokenListed;
    mapping(address token => bool enabled) public override isPaymentTokenEnabled;
    mapping(address tier => bool registered) public override isRegisteredTier;
    mapping(address creator => mapping(bytes32 tierSalt => bool used)) private _usedTierSalts;
    mapping(bytes32 tierIdentity_ => address tier) public override tierForIdentity;

    error CreatorMustBeCaller();
    error DuplicatePaymentToken(address token);
    error EmptyPaymentTokenList();
    error InvalidAddress();
    mapping(address => uint112) public override minimumPayment;
    error InvalidMinimumPayment();
    error MinimumPaymentChanged(uint112 expected, uint112 actual);
    error PaymentBelowMinimum(uint256 amount, uint256 minimum);
    error InvalidContract();
    error InvalidPageSize();
    error InvalidPeriodDuration();
    error InvalidRateTotal();
    error InvalidRenderer();
    error InvalidRendererSchema(bytes32 expected, bytes32 actual);
    error InvalidTierSalt();
    error MediaStoreFactoryCodeChanged(bytes32 expected, bytes32 actual);
    error OwnershipRenunciationDisabled();
    error InvalidPaymentToken(address token);
    error PaymentTokenNotEnabled(address token);
    error PaymentTokenNotListed(address token);
    error TierIdentityMismatch(bytes32 expected, bytes32 actual);
    error TierSaltAlreadyUsed(address creator, bytes32 tierSalt);

    constructor(
        IERC20[] memory initialPaymentTokens,
        address mediaStoreFactory_,
        address initialOwner,
        address protocolToken_,
        MembershipTypes.TierCodeConfig memory tierCode,
        uint112[] memory initialMinimumPayments
    ) Ownable(initialOwner) {
        if (initialPaymentTokens.length == 0) {
            revert EmptyPaymentTokenList();
        }
        if (initialMinimumPayments.length != initialPaymentTokens.length) {
            revert InvalidMinimumPayment();
        }
        if (mediaStoreFactory_ == address(0)) {
            revert InvalidAddress();
        }
        if (mediaStoreFactory_.code.length == 0) {
            revert InvalidContract();
        }
        if (protocolToken_ != address(0) && protocolToken_.code.length == 0) {
            revert InvalidContract();
        }

        mediaStoreFactory = mediaStoreFactory_;
        mediaStoreFactoryRuntimeCodehash = mediaStoreFactory_.codehash;
        buybackVault = address(new ProtocolBuybackVault(address(this), protocolToken_));
        burnRouter = address(new ProtocolBurnRouter(address(this), buybackVault));
        deployer = address(new MembershipTierDeployer(address(this), tierCode));

        for (uint256 i; i < initialPaymentTokens.length; ++i) {
            address token = address(initialPaymentTokens[i]);
            _validatePaymentToken(token);
            if (isPaymentTokenListed[token]) revert DuplicatePaymentToken(token);
            _setMinimumPayment(token, initialMinimumPayments[i]);
            _paymentTokens.push(token);
            isPaymentTokenListed[token] = true;
            isPaymentTokenEnabled[token] = true;
            emit PaymentTokenListed(token, i);
            emit PaymentTokenEnabled(token);
        }
    }

    uint256 public constant MAX_CLAIM_TIERS = 8;
    uint256 public constant MAX_CLAIM_STEPS = 25;
    error InvalidClaimBatch();
    error ClaimAccountingBehind(
        uint256 batchIndex, address tier, uint64 accountedThrough, uint64 nextCheckpoint
    );
    error ClaimFailed(uint256 batchIndex, address tier, bytes reason);
    event EverythingClaimed(address indexed beneficiary, uint256 tierCount);

    /// @notice Atomically settle and pay the caller across an explicit bounded set of official tiers.
    function claimEverything(MembershipTypes.TierClaimRequest[] calldata requests)
        external
        override
        nonReentrant
        returns (MembershipTypes.ClaimResult[] memory results)
    {
        if (requests.length == 0 || requests.length > MAX_CLAIM_TIERS) {
            revert InvalidClaimBatch();
        }
        uint256 selectedCount;
        for (uint256 i; i < requests.length; ++i) {
            selectedCount += requests[i].tokenIds.length;
            if (selectedCount > 32) revert InvalidClaimBatch();
            if (!isRegisteredTier[requests[i].tier]) revert InvalidClaimBatch();
            for (uint256 j; j < i; ++j) {
                if (requests[i].tier == requests[j].tier) revert InvalidClaimBatch();
            }
        }
        results = new MembershipTypes.ClaimResult[](requests.length);
        uint256 remaining = MAX_CLAIM_STEPS;
        for (uint256 i; i < requests.length; ++i) {
            try IMembershipTier(requests[i].tier)
                .claimRewardsFor(msg.sender, requests[i].tokenIds, remaining) returns (
                MembershipTypes.ClaimResult memory result
            ) {
                remaining -= result.processedSteps;
                results[i] = result;
            } catch (bytes memory reason) {
                // Intentionally retain only the four-byte Solidity error selector.
                // forge-lint: disable-next-line(unsafe-typecast)
                bytes4 failureSelector = bytes4(reason);
                if (
                    reason.length == 68
                        && failureSelector == bytes4(keccak256("AccountingBehind(uint64,uint64)"))
                ) {
                    uint64 cursor;
                    uint64 next;
                    assembly ("memory-safe") {
                        cursor := mload(add(reason, 36))
                        next := mload(add(reason, 68))
                    }
                    revert ClaimAccountingBehind(i, requests[i].tier, cursor, next);
                }
                revert ClaimFailed(i, requests[i].tier, reason);
            }
        }
        emit EverythingClaimed(msg.sender, requests.length);
    }

    /// @inheritdoc IMembershipFactory
    function protocolToken() external view override returns (address) {
        return ProtocolBuybackVault(payable(buybackVault)).protocolToken();
    }

    /// @inheritdoc IMembershipFactory
    function bindProtocolToken(address token) external override onlyOwner {
        ProtocolBuybackVault(payable(buybackVault)).bindProtocolToken(token);
    }

    /// @inheritdoc IMembershipFactory
    function owner() public view override(Ownable, IMembershipFactory) returns (address) {
        return super.owner();
    }

    /// @inheritdoc IMembershipFactory
    function createTier(MembershipTypes.TierConfig calldata config)
        external
        override
        returns (address tier)
    {
        if (config.creator == address(0)) revert InvalidAddress();
        if (config.creator != msg.sender) revert CreatorMustBeCaller();
        if (config.tierSalt == bytes32(0)) revert InvalidTierSalt();
        if (_usedTierSalts[msg.sender][config.tierSalt]) {
            revert TierSaltAlreadyUsed(msg.sender, config.tierSalt);
        }
        if (config.periodDuration == 0) revert InvalidPeriodDuration();
        VestingLedger.validateCurve(
            config.startingBoostBps, config.earlySupportGross, config.pricePerPeriod
        );
        if (
            config.protocolFeeBps < 100 || config.protocolFeeBps > _BPS_DENOMINATOR
                || uint256(config.rewardBps) + config.referralBps + config.protocolFeeBps
                    > _BPS_DENOMINATOR
        ) {
            revert InvalidRateTotal();
        }
        if (!isPaymentTokenEnabled[config.paymentToken]) {
            revert PaymentTokenNotEnabled(config.paymentToken);
        }
        uint112 minimum = minimumPayment[config.paymentToken];
        if (config.minimumPayment != minimum) {
            revert MinimumPaymentChanged(config.minimumPayment, minimum);
        }
        if (config.pricePerPeriod != 0 && config.pricePerPeriod < minimum) {
            revert PaymentBelowMinimum(config.pricePerPeriod, minimum);
        }
        _validateRenderer(config.renderer, config.art, config.media);
        if (config.media.store != address(0)) {
            bytes32 actualMediaFactoryCodehash = mediaStoreFactory.codehash;
            if (actualMediaFactoryCodehash != mediaStoreFactoryRuntimeCodehash) {
                revert MediaStoreFactoryCodeChanged(
                    mediaStoreFactoryRuntimeCodehash, actualMediaFactoryCodehash
                );
            }
            IOnchainMediaStoreFactory(mediaStoreFactory)
                .validateOnchainMedia(msg.sender, config.media);
        }

        bytes32 identity = TierIdentity.derive(address(this), msg.sender, config.tierSalt);
        _usedTierSalts[msg.sender][config.tierSalt] = true;

        tier = MembershipTierDeployer(deployer).deploy(config);
        bytes32 deployedIdentity = IMembershipTier(tier).tierIdentity();
        if (deployedIdentity != identity) revert TierIdentityMismatch(identity, deployedIdentity);

        uint256 tierIndex = _tiers.length;
        _tiers.push(tier);
        isRegisteredTier[tier] = true;
        tierForIdentity[identity] = tier;

        emit TierCreated(tier, msg.sender, identity, tierIndex, config.name, config.symbol);
        emit TierTermsConfigured(
            tier,
            config.paymentToken,
            config.pricePerPeriod,
            config.periodDuration,
            config.protocolFeeBps,
            config.rewardBps,
            config.referralBps,
            config.supplyCap,
            config.maxPrepaidPeriods
        );
        emit TierMetadataConfigured(tier, config.metadata.description, config.metadata.externalURI);
        emit TierMinimumPaymentConfigured(tier, minimum);
        emit TierRewardCurveConfigured(tier, config.startingBoostBps, config.earlySupportGross);
        emit TierRendererConfigured(tier, config.renderer);
        emit TierArtConfigured(
            tier,
            config.art.engine,
            config.art.collectionSeed,
            keccak256(abi.encode(config.art)),
            config.media.store,
            config.media.digest
        );
    }

    /// @inheritdoc IMembershipFactory
    function predictTierIdentity(address creator, bytes32 tierSalt)
        external
        view
        override
        returns (bytes32)
    {
        if (creator == address(0)) revert InvalidAddress();
        if (tierSalt == bytes32(0)) revert InvalidTierSalt();
        return TierIdentity.derive(address(this), creator, tierSalt);
    }

    /// @inheritdoc IMembershipFactory
    function isTierSaltUsed(address creator, bytes32 tierSalt)
        external
        view
        override
        returns (bool)
    {
        return _usedTierSalts[creator][tierSalt];
    }

    /// @inheritdoc IMembershipFactory
    function tierCount() external view override returns (uint256) {
        return _tiers.length;
    }

    /// @inheritdoc IMembershipFactory
    function tiers(uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory page)
    {
        if (limit > maxPageSize) revert InvalidPageSize();
        uint256 length = _tiers.length;
        if (offset >= length || limit == 0) return new address[](0);

        uint256 end = offset + limit;
        if (end > length) end = length;

        page = new address[](end - offset);
        for (uint256 i; i < page.length; ++i) {
            page[i] = _tiers[offset + i];
        }
    }

    /// @inheritdoc IMembershipFactory
    function paymentTokenCount() external view override returns (uint256) {
        return _paymentTokens.length;
    }

    /// @inheritdoc IMembershipFactory
    function paymentTokens(uint256 offset, uint256 limit)
        external
        view
        override
        returns (address[] memory page)
    {
        if (limit > maxPageSize) revert InvalidPageSize();
        uint256 length = _paymentTokens.length;
        if (offset >= length || limit == 0) return new address[](0);

        uint256 end = offset + limit;
        if (end > length) end = length;

        page = new address[](end - offset);
        for (uint256 i; i < page.length; ++i) {
            page[i] = _paymentTokens[offset + i];
        }
    }

    /// @inheritdoc IMembershipFactory
    function setPaymentTokenEnabled(address token, bool enabled) external override onlyOwner {
        bool listed = isPaymentTokenListed[token];
        if (enabled) {
            if (minimumPayment[token] == 0) revert InvalidMinimumPayment();
            if (!listed) {
                _validatePaymentToken(token);
                uint256 tokenIndex = _paymentTokens.length;
                _paymentTokens.push(token);
                isPaymentTokenListed[token] = true;
                emit PaymentTokenListed(token, tokenIndex);
            }
            if (isPaymentTokenEnabled[token]) return;
            isPaymentTokenEnabled[token] = true;
            emit PaymentTokenEnabled(token);
            return;
        }

        if (!listed) revert PaymentTokenNotListed(token);
        if (!isPaymentTokenEnabled[token]) return;
        isPaymentTokenEnabled[token] = false;
        emit PaymentTokenDisabled(token);
    }

    function setMinimumPayment(address token, uint112 minimum) external override onlyOwner {
        _validatePaymentToken(token);
        _setMinimumPayment(token, minimum);
    }

    function _setMinimumPayment(address token, uint112 minimum) private {
        if (minimum == 0) revert InvalidMinimumPayment();
        minimumPayment[token] = minimum;
        emit PaymentTokenMinimumUpdated(token, minimum);
    }

    function _validatePaymentToken(address token) private view {
        if (token == address(0) || token.code.length == 0) {
            revert InvalidPaymentToken(token);
        }
    }

    function _validateRenderer(
        address renderer_,
        MembershipTypes.ArtConfig calldata art,
        MembershipTypes.MediaConfig calldata media
    ) private view {
        if (renderer_ == address(0)) {
            revert InvalidRenderer();
        }
        if (renderer_.code.length == 0) revert InvalidRenderer();

        bytes32 observedSchema;
        try IMembershipRenderer(renderer_).rendererSchema() returns (bytes32 schema) {
            observedSchema = schema;
        } catch {
            revert InvalidRenderer();
        }
        if (observedSchema != rendererSchema) {
            revert InvalidRendererSchema(rendererSchema, observedSchema);
        }
        try IMembershipRenderer(renderer_).validateConfiguration(art, media) {
            return;
        } catch (bytes memory reason) {
            if (reason.length != 0) {
                assembly ("memory-safe") {
                    revert(add(reason, 0x20), mload(reason))
                }
            }
            revert InvalidRenderer();
        }
    }

    /// @notice Starts a two-step transfer and rejects zero-address cancellation.
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        ProtocolSafeValidation.validate(newOwner);
        super.transferOwnership(newOwner);
    }

    function acceptOwnership() public override {
        // Recheck in case the nominated Safe's configuration changed while pending.
        ProtocolSafeValidation.validate(msg.sender);
        super.acceptOwnership();
    }

    /// @notice Protocol ownership cannot be discarded because fee routing must remain operable.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
