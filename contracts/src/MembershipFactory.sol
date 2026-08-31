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
    address[] private _tiers;
    mapping(address tier => bool registered) public override isRegisteredTier;
    mapping(address creator => mapping(bytes32 tierSalt => bool used)) private _usedTierSalts;
    mapping(bytes32 tierIdentity_ => address tier) public override tierForIdentity;

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
    error TierIdentityMismatch(bytes32 expected, bytes32 actual);
    error TierSaltAlreadyUsed(address creator, bytes32 tierSalt);

    constructor(
        IERC20 paymentToken_,
        address mediaStoreFactory_,
        address initialOwner,
        address initialFeeRecipient
    ) Ownable(initialOwner) {
        if (address(paymentToken_) == address(0) || mediaStoreFactory_ == address(0)) {
            revert InvalidAddress();
        }
        if (address(paymentToken_).code.length == 0 || mediaStoreFactory_.code.length == 0) {
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

        tier = MembershipTierDeployer(deployer).deploy(paymentToken, config);
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
        super.transferOwnership(newOwner);
    }

    /// @notice Protocol ownership cannot be discarded because fee routing must remain operable.
    function renounceOwnership() public pure override {
        revert OwnershipRenunciationDisabled();
    }
}
