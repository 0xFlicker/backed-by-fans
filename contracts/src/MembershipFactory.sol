// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTierDeployer} from "./MembershipTierDeployer.sol";
import {ProtocolBurnRouter} from "./ProtocolBurnRouter.sol";
import {ProtocolBuybackVault} from "./ProtocolBuybackVault.sol";
import {TierIdentity} from "./TierIdentity.sol";
import {IMembershipFactory} from "./interfaces/IMembershipFactory.sol";
import {IMembershipRenderer} from "./interfaces/IMembershipRenderer.sol";
import {IMembershipTier} from "./interfaces/IMembershipTier.sol";
import {IOnchainMediaStoreFactory} from "./interfaces/IOnchainMediaStoreFactory.sol";
import {ProtocolSafeValidation} from "./libraries/ProtocolSafeValidation.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Permissionless official-tier registry with immutable protocol-token and vault identity.
contract MembershipFactory is Ownable2Step, IMembershipFactory {
    uint256 public constant override maxPageSize = 100;
    bytes32 public constant override rendererSchema =
        0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4;
    uint16 private constant _BPS_DENOMINATOR = 10_000;

    address public immutable override mediaStoreFactory;
    bytes32 public immutable override mediaStoreFactoryRuntimeCodehash;
    address public immutable override deployer;

    address public immutable override protocolToken;
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
        address protocolToken_
    ) Ownable(initialOwner) {
        if (initialPaymentTokens.length == 0) {
            revert EmptyPaymentTokenList();
        }
        if (mediaStoreFactory_ == address(0)) {
            revert InvalidAddress();
        }
        if (mediaStoreFactory_.code.length == 0) {
            revert InvalidContract();
        }
        if (protocolToken_ == address(0)) {
            revert InvalidAddress();
        }
        if (protocolToken_.code.length == 0) revert InvalidContract();

        mediaStoreFactory = mediaStoreFactory_;
        mediaStoreFactoryRuntimeCodehash = mediaStoreFactory_.codehash;
        protocolToken = protocolToken_;
        buybackVault = address(new ProtocolBuybackVault(address(this), protocolToken_));
        burnRouter = address(new ProtocolBurnRouter(address(this), buybackVault));
        deployer = address(new MembershipTierDeployer(address(this)));

        for (uint256 i; i < initialPaymentTokens.length; ++i) {
            address token = address(initialPaymentTokens[i]);
            _validatePaymentToken(token);
            if (isPaymentTokenListed[token]) revert DuplicatePaymentToken(token);
            _paymentTokens.push(token);
            isPaymentTokenListed[token] = true;
            isPaymentTokenEnabled[token] = true;
            emit PaymentTokenListed(token, i);
            emit PaymentTokenEnabled(token);
        }
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
