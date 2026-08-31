// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {MembershipTierDeployer} from "./MembershipTierDeployer.sol";
import {TierIdentity} from "./TierIdentity.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IOnchainMediaStoreFactory} from "./interfaces/IOnchainMediaStoreFactory.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Permissionless official-tier registry and fixed protocol-fee vault.
contract MembershipFactory is Ownable2Step, ReentrancyGuard, IMembershipFactory {
    using SafeERC20 for IERC20;

    uint16 public constant override protocolFeeBps = 100;
    uint256 public constant override maxPageSize = 100;
    bytes32 public constant override rendererSchema =
        0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4;
    uint16 private constant _BPS_DENOMINATOR = 10_000;

    IERC20 public immutable override paymentToken;
    address public immutable override mediaStoreFactory;
    bytes32 public immutable override mediaStoreFactoryRuntimeCodehash;
    address public immutable override deployer;

    address public override feeRecipient;
    uint32 public override rendererCount;

    address[] private _tiers;
    mapping(address tier => bool registered) public override isRegisteredTier;
    mapping(address creator => mapping(bytes32 tierSalt => bool used)) private _usedTierSalts;
    mapping(bytes32 tierIdentity_ => address tier) public override tierForIdentity;
    mapping(uint32 rendererVersion => MembershipTypes.RendererRecord record) private _renderers;
    mapping(address renderer_ => uint32 rendererVersion) public override rendererVersionOf;

    error CreatorMustBeCaller();
    error InexactTokenTransfer();
    error InvalidAddress();
    error InvalidContract();
    error InvalidPageSize();
    error InvalidPeriodDuration();
    error InvalidRateTotal();
    error InvalidRenderer();
    error InvalidRendererSchema(bytes32 expected, bytes32 actual);
    error InvalidTierSalt();
    error MediaStoreFactoryCodeChanged(bytes32 expected, bytes32 actual);
    error OnlyFeeRecipient();
    error OwnershipRenunciationDisabled();
    error RendererAlreadyRegistered(address renderer, uint32 rendererVersion);
    error RendererCodeChanged(address renderer, bytes32 expected, bytes32 actual);
    error RendererNotEnabled(uint32 rendererVersion);
    error RendererStatusUnchanged(uint32 rendererVersion, bool enabled);
    error UnknownRendererVersion(uint32 rendererVersion);
    error TierIdentityMismatch(bytes32 expected, bytes32 actual);
    error TierSaltAlreadyUsed(address creator, bytes32 tierSalt);

    constructor(
        IERC20 paymentToken_,
        address renderer_,
        address mediaStoreFactory_,
        address initialOwner,
        address initialFeeRecipient
    ) Ownable(initialOwner) {
        if (
            address(paymentToken_) == address(0) || renderer_ == address(0)
                || mediaStoreFactory_ == address(0)
        ) {
            revert InvalidAddress();
        }
        if (
            address(paymentToken_).code.length == 0 || renderer_.code.length == 0
                || mediaStoreFactory_.code.length == 0
        ) {
            revert InvalidContract();
        }
        if (initialFeeRecipient == address(0) || initialFeeRecipient == address(this)) {
            revert InvalidAddress();
        }

        paymentToken = paymentToken_;
        mediaStoreFactory = mediaStoreFactory_;
        mediaStoreFactoryRuntimeCodehash = mediaStoreFactory_.codehash;
        feeRecipient = initialFeeRecipient;
        deployer = address(new MembershipTierDeployer(address(this)));

        _registerRenderer(renderer_, true);
        emit FeeRecipientUpdated(address(0), initialFeeRecipient);
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
        if (uint256(config.rewardBps) + config.referralBps + protocolFeeBps > _BPS_DENOMINATOR) {
            revert InvalidRateTotal();
        }
        MembershipTypes.RendererRecord memory rendererRecord_ =
            _requireRenderer(config.rendererVersion, true);
        IMembershipRenderer(rendererRecord_.implementation)
            .validateConfiguration(config.art, config.media);
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

        tier = MembershipTierDeployer(deployer)
            .deploy(
                paymentToken,
                config.rendererVersion,
                rendererRecord_.implementation,
                rendererRecord_.runtimeCodehash,
                config
            );
        bytes32 deployedIdentity = IMembershipTier(tier).tierIdentity();
        if (deployedIdentity != identity) revert TierIdentityMismatch(identity, deployedIdentity);

        uint256 tierIndex = _tiers.length;
        _tiers.push(tier);
        isRegisteredTier[tier] = true;
        tierForIdentity[identity] = tier;

        emit TierCreated(tier, msg.sender, identity, tierIndex, config.name, config.symbol);
        emit TierTermsConfigured(
            tier,
            config.pricePerPeriod,
            config.periodDuration,
            config.rewardBps,
            config.referralBps,
            config.supplyCap,
            config.maxPrepaidPeriods
        );
        emit TierMetadataConfigured(tier, config.metadata.description, config.metadata.externalURI);
        emit TierRendererConfigured(
            tier,
            config.rendererVersion,
            rendererRecord_.implementation,
            rendererRecord_.runtimeCodehash
        );
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
    function rendererRecord(uint32 rendererVersion)
        external
        view
        override
        returns (MembershipTypes.RendererRecord memory)
    {
        return _requireRenderer(rendererVersion, false);
    }

    /// @inheritdoc IMembershipFactory
    function registerRenderer(address renderer_)
        external
        override
        onlyOwner
        returns (uint32 rendererVersion)
    {
        rendererVersion = _registerRenderer(renderer_, false);
    }

    /// @inheritdoc IMembershipFactory
    function setRendererEnabled(uint32 rendererVersion, bool enabled) external override onlyOwner {
        MembershipTypes.RendererRecord storage record = _renderers[rendererVersion];
        if (record.implementation == address(0)) revert UnknownRendererVersion(rendererVersion);
        if (record.enabled == enabled) revert RendererStatusUnchanged(rendererVersion, enabled);
        if (enabled) _requireRendererCode(record.implementation, record.runtimeCodehash);

        record.enabled = enabled;
        emit RendererEnabled(rendererVersion, enabled);
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
    function setFeeRecipient(address newRecipient) external override onlyOwner {
        if (newRecipient == address(0) || newRecipient == address(this)) {
            revert InvalidAddress();
        }

        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previousRecipient, newRecipient);
    }

    /// @inheritdoc IMembershipFactory
    function withdrawProtocolFees() external override nonReentrant returns (uint256 amount) {
        address recipient = feeRecipient;
        if (msg.sender != recipient) revert OnlyFeeRecipient();

        uint256 factoryBalanceBefore = paymentToken.balanceOf(address(this));
        if (factoryBalanceBefore == 0) return 0;
        uint256 recipientBalanceBefore = paymentToken.balanceOf(recipient);

        amount = factoryBalanceBefore;
        paymentToken.safeTransfer(recipient, amount);

        uint256 factoryBalanceAfter = paymentToken.balanceOf(address(this));
        uint256 recipientBalanceAfter = paymentToken.balanceOf(recipient);
        if (
            factoryBalanceAfter > factoryBalanceBefore
                || factoryBalanceBefore - factoryBalanceAfter != amount
                || recipientBalanceAfter < recipientBalanceBefore
                || recipientBalanceAfter - recipientBalanceBefore != amount
        ) {
            revert InexactTokenTransfer();
        }

        emit ProtocolFeesWithdrawn(recipient, amount);
    }

    function _registerRenderer(address renderer_, bool enabled)
        private
        returns (uint32 rendererVersion)
    {
        if (renderer_ == address(0)) revert InvalidAddress();
        if (renderer_.code.length == 0) revert InvalidRenderer();
        uint32 existingVersion = rendererVersionOf[renderer_];
        if (existingVersion != 0) {
            revert RendererAlreadyRegistered(renderer_, existingVersion);
        }

        bytes32 observedSchema;
        uint16 engines;
        try IMembershipRenderer(renderer_).rendererSchema() returns (bytes32 schema) {
            observedSchema = schema;
        } catch {
            revert InvalidRenderer();
        }
        if (observedSchema != rendererSchema) {
            revert InvalidRendererSchema(rendererSchema, observedSchema);
        }
        try IMembershipRenderer(renderer_).engineCount() returns (uint16 engineTotal) {
            engines = engineTotal;
        } catch {
            revert InvalidRenderer();
        }
        if (engines == 0) revert InvalidRenderer();

        bytes32 runtimeCodehash = renderer_.codehash;
        rendererVersion = rendererCount + 1;
        rendererCount = rendererVersion;
        _renderers[rendererVersion] = MembershipTypes.RendererRecord({
            implementation: renderer_, runtimeCodehash: runtimeCodehash, enabled: enabled
        });
        rendererVersionOf[renderer_] = rendererVersion;

        emit RendererRegistered(rendererVersion, renderer_, runtimeCodehash);
        if (enabled) emit RendererEnabled(rendererVersion, true);
    }

    function _requireRenderer(uint32 rendererVersion, bool requireEnabled)
        private
        view
        returns (MembershipTypes.RendererRecord memory record)
    {
        record = _renderers[rendererVersion];
        if (record.implementation == address(0)) revert UnknownRendererVersion(rendererVersion);
        if (requireEnabled) {
            if (!record.enabled) revert RendererNotEnabled(rendererVersion);
            _requireRendererCode(record.implementation, record.runtimeCodehash);
        }
    }

    function _requireRendererCode(address renderer_, bytes32 expectedCodehash) private view {
        bytes32 actualCodehash = renderer_.codehash;
        if (actualCodehash != expectedCodehash) {
            revert RendererCodeChanged(renderer_, expectedCodehash, actualCodehash);
        }
    }

    /// @notice Starts a two-step transfer and rejects zero-address cancellation.
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        super.transferOwnership(newOwner);
    }

    /// @notice Protocol ownership cannot be discarded because fee routing must remain operable.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
