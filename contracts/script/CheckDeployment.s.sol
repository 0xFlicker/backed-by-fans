// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {MembershipTierDeployer} from "../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {IERC5643} from "../src/interfaces/IERC5643.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {RobinhoodDeploymentGuard} from "./DeployProtocol.s.sol";

/// @notice Generates and independently checks one captured deployment manifest.
contract CheckDeployment is RobinhoodDeploymentGuard {
    using stdJson for string;
    using Strings for uint256;

    string internal constant _FOUNDRY_VERSION = "1.7.1";
    string internal constant _SOLC_VERSION = "0.8.36";
    string internal constant _EVM_VERSION = "cancun";
    string internal constant _BYTECODE_HASH = "ipfs";

    bytes32 private constant _EIP1967_IMPLEMENTATION_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    bytes32 private constant _EIP1967_ADMIN_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);
    bytes32 private constant _EIP1967_BEACON_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1);

    struct Manifest {
        uint256 schemaVersion;
        uint256 chainId;
        uint256 rendererCreationBlockNumber;
        uint256 factoryCreationBlockNumber;
        uint256 validationTierCreationBlockNumber;
        uint256 capturedBlockNumber;
        uint256 validationTierIndex;
        uint256 validationTierPricePerPeriod;
        uint256 validationTierPeriodDuration;
        uint256 validationTierSupplyCap;
        uint256 validationTierMaxPrepaidPeriods;
        uint256 validationTierRewardBps;
        uint256 validationTierReferralBps;
        uint256 paymentTokenDecimals;
        uint256 optimizerRuns;
        bytes32 capturedBlockHash;
        bytes32 factoryDeploymentTransactionHash;
        bytes32 validationTierCreationTransactionHash;
        bytes32 factoryDeploymentInputHash;
        bytes32 validationTierCreationInputHash;
        address paymentToken;
        address protocolOwner;
        address pendingProtocolOwner;
        address feeRecipient;
        address renderer;
        address factory;
        address deployer;
        address creationCodeStoreA;
        address creationCodeStoreB;
        address validationTier;
        address validationTierOwner;
        bytes32 paymentTokenRuntimeCodeHash;
        bytes32 rendererRuntimeCodeHash;
        bytes32 factoryRuntimeCodeHash;
        bytes32 deployerRuntimeCodeHash;
        bytes32 creationCodeStoreARuntimeCodeHash;
        bytes32 creationCodeStoreBRuntimeCodeHash;
        bytes32 validationTierRuntimeCodeHash;
        bytes32 rendererCreationCodeHash;
        bytes32 factoryCreationCodeHash;
        bytes32 tierCreationCodeHash;
        bytes32 validationTierConfigHash;
        bool optimizerEnabled;
        string schema;
        string status;
        string network;
        string paymentTokenName;
        string paymentTokenSymbol;
        string validationTierName;
        string validationTierSymbol;
        string validationTierDescription;
        string validationTierImageURI;
        string validationTierExternalURI;
        string foundryVersion;
        string solcVersion;
        string evmVersion;
        string bytecodeHash;
        string rendererVerificationUrl;
        string factoryVerificationUrl;
        string deployerVerificationUrl;
        string creationCodeStoreAVerificationUrl;
        string creationCodeStoreBVerificationUrl;
        string validationTierVerificationUrl;
    }

    struct VerificationUrls {
        string renderer;
        string factory;
        string deployer;
        string creationCodeStoreA;
        string creationCodeStoreB;
        string validationTier;
    }

    struct CreationBlocks {
        uint256 renderer;
        uint256 factory;
        uint256 validationTier;
    }

    struct TransactionHashes {
        bytes32 factoryDeployment;
        bytes32 validationTierCreation;
    }

    error CapturedBlockUnavailable();
    error DeploymentCheckFailed(string field);
    error ManifestNotDeployed();

    function run() external view {
        string memory path = vm.envString("DEPLOYMENT_MANIFEST_PATH");
        _check(_parseManifest(vm.readFile(path)), vm.envBytes32("OBSERVED_BLOCK_HASH"));
    }

    function writeManifest() external returns (string memory json) {
        string memory path = vm.envString("DEPLOYMENT_MANIFEST_PATH");
        VerificationUrls memory urls = VerificationUrls({
            renderer: vm.envString("RENDERER_VERIFICATION_URL"),
            factory: vm.envString("FACTORY_VERIFICATION_URL"),
            deployer: vm.envString("DEPLOYER_VERIFICATION_URL"),
            creationCodeStoreA: vm.envString("CREATION_CODE_STORE_A_VERIFICATION_URL"),
            creationCodeStoreB: vm.envString("CREATION_CODE_STORE_B_VERIFICATION_URL"),
            validationTier: vm.envString("VALIDATION_TIER_VERIFICATION_URL")
        });
        CreationBlocks memory creationBlocks = CreationBlocks({
            renderer: vm.envUint("RENDERER_CREATION_BLOCK"),
            factory: vm.envUint("FACTORY_CREATION_BLOCK"),
            validationTier: vm.envUint("VALIDATION_TIER_CREATION_BLOCK")
        });
        TransactionHashes memory transactionHashes = TransactionHashes({
            factoryDeployment: vm.envBytes32("FACTORY_DEPLOYMENT_TRANSACTION_HASH"),
            validationTierCreation: vm.envBytes32("VALIDATION_TIER_CREATION_TRANSACTION_HASH")
        });
        Manifest memory manifest = capture(
            creationBlocks,
            transactionHashes,
            vm.envBytes32("OBSERVED_BLOCK_HASH"),
            vm.envAddress("DEPLOYED_FACTORY"),
            vm.envAddress("VALIDATION_TIER_ADDRESS"),
            urls
        );
        json = serializeManifest(manifest);
        vm.writeJson(json, path);
    }

    function capture(
        CreationBlocks memory creationBlocks,
        TransactionHashes memory transactionHashes,
        bytes32 observedBlockHash,
        address factoryAddress,
        address validationTierAddress,
        VerificationUrls memory urls
    ) public view returns (Manifest memory manifest) {
        if (block.number == 0 || observedBlockHash == bytes32(0)) {
            revert CapturedBlockUnavailable();
        }

        MembershipFactory factory = MembershipFactory(factoryAddress);
        MembershipTier tier = MembershipTier(validationTierAddress);
        address paymentToken = address(factory.paymentToken());

        manifest.schemaVersion = 1;
        manifest.schema = "./schema-v1.json";
        manifest.status = "deployed";
        manifest.chainId = block.chainid;
        manifest.rendererCreationBlockNumber = creationBlocks.renderer;
        manifest.factoryCreationBlockNumber = creationBlocks.factory;
        manifest.validationTierCreationBlockNumber = creationBlocks.validationTier;
        manifest.capturedBlockNumber = block.number;
        manifest.capturedBlockHash = observedBlockHash;
        manifest.factoryDeploymentTransactionHash = transactionHashes.factoryDeployment;
        manifest.validationTierCreationTransactionHash = transactionHashes.validationTierCreation;
        manifest.paymentToken = paymentToken;
        manifest.protocolOwner = factory.owner();
        manifest.pendingProtocolOwner = factory.pendingOwner();
        manifest.feeRecipient = factory.feeRecipient();
        manifest.renderer = factory.renderer();
        manifest.factory = factoryAddress;
        manifest.deployer = factory.deployer();
        MembershipTierDeployer deployer = MembershipTierDeployer(manifest.deployer);
        manifest.creationCodeStoreA = deployer.creationCodeStoreA();
        manifest.creationCodeStoreB = deployer.creationCodeStoreB();
        manifest.validationTier = validationTierAddress;
        manifest.validationTierOwner = tier.owner();
        uint256 tierCount = factory.tierCount();
        if (tierCount == 0) revert DeploymentCheckFailed("validationTierIndex");
        manifest.validationTierIndex = tierCount - 1;
        manifest.paymentTokenRuntimeCodeHash = paymentToken.codehash;
        manifest.rendererRuntimeCodeHash = manifest.renderer.codehash;
        manifest.factoryRuntimeCodeHash = factoryAddress.codehash;
        manifest.deployerRuntimeCodeHash = manifest.deployer.codehash;
        manifest.creationCodeStoreARuntimeCodeHash = manifest.creationCodeStoreA.codehash;
        manifest.creationCodeStoreBRuntimeCodeHash = manifest.creationCodeStoreB.codehash;
        manifest.validationTierRuntimeCodeHash = validationTierAddress.codehash;
        manifest.rendererCreationCodeHash = keccak256(type(OnchainMetadataRenderer).creationCode);
        manifest.factoryCreationCodeHash = keccak256(type(MembershipFactory).creationCode);
        manifest.tierCreationCodeHash = keccak256(type(MembershipTier).creationCode);
        manifest.validationTierConfigHash = _tierConfigHash(tier);
        manifest.network = _networkName(block.chainid);
        manifest.paymentTokenName = IERC20Metadata(paymentToken).name();
        manifest.paymentTokenSymbol = IERC20Metadata(paymentToken).symbol();
        manifest.paymentTokenDecimals = IERC20Metadata(paymentToken).decimals();
        manifest.validationTierName = tier.name();
        manifest.validationTierSymbol = tier.symbol();
        manifest.validationTierDescription = tier.description();
        manifest.validationTierImageURI = tier.imageURI();
        manifest.validationTierExternalURI = tier.externalURI();
        manifest.validationTierPricePerPeriod = tier.pricePerPeriod();
        manifest.validationTierPeriodDuration = tier.periodDuration();
        manifest.validationTierRewardBps = tier.rewardBps();
        manifest.validationTierReferralBps = tier.referralBps();
        manifest.validationTierSupplyCap = tier.supplyCap();
        manifest.validationTierMaxPrepaidPeriods = tier.maxPrepaidPeriods();
        manifest.factoryDeploymentInputHash = _expectedFactoryDeploymentInputHash(manifest);
        manifest.validationTierCreationInputHash =
            _expectedValidationTierCreationInputHash(manifest);
        manifest.foundryVersion = _FOUNDRY_VERSION;
        manifest.solcVersion = _SOLC_VERSION;
        manifest.evmVersion = _EVM_VERSION;
        manifest.optimizerEnabled = true;
        manifest.optimizerRuns = 200;
        manifest.bytecodeHash = _BYTECODE_HASH;
        manifest.rendererVerificationUrl = urls.renderer;
        manifest.factoryVerificationUrl = urls.factory;
        manifest.deployerVerificationUrl = urls.deployer;
        manifest.creationCodeStoreAVerificationUrl = urls.creationCodeStoreA;
        manifest.creationCodeStoreBVerificationUrl = urls.creationCodeStoreB;
        manifest.validationTierVerificationUrl = urls.validationTier;

        _check(manifest, observedBlockHash);
    }

    function check(Manifest memory manifest, bytes32 observedBlockHash) external view {
        _check(manifest, observedBlockHash);
    }

    function parseManifest(string memory json) external pure returns (Manifest memory manifest) {
        manifest = _parseManifest(json);
    }

    function serializeManifest(Manifest memory manifest) public returns (string memory json) {
        string memory key = "deployment";
        vm.serializeString(key, "$schema", manifest.schema);
        vm.serializeUint(key, "schemaVersion", manifest.schemaVersion);
        vm.serializeString(key, "status", manifest.status);
        vm.serializeString(key, "network", manifest.network);
        vm.serializeUint(key, "chainId", manifest.chainId);
        vm.serializeUint(key, "rendererCreationBlockNumber", manifest.rendererCreationBlockNumber);
        vm.serializeUint(key, "factoryCreationBlockNumber", manifest.factoryCreationBlockNumber);
        vm.serializeUint(
            key, "validationTierCreationBlockNumber", manifest.validationTierCreationBlockNumber
        );
        vm.serializeUint(key, "capturedBlockNumber", manifest.capturedBlockNumber);
        vm.serializeBytes32(key, "capturedBlockHash", manifest.capturedBlockHash);
        vm.serializeBytes32(
            key, "factoryDeploymentTransactionHash", manifest.factoryDeploymentTransactionHash
        );
        vm.serializeBytes32(
            key,
            "validationTierCreationTransactionHash",
            manifest.validationTierCreationTransactionHash
        );
        vm.serializeBytes32(key, "factoryDeploymentInputHash", manifest.factoryDeploymentInputHash);
        vm.serializeBytes32(
            key, "validationTierCreationInputHash", manifest.validationTierCreationInputHash
        );
        vm.serializeAddress(key, "paymentToken", manifest.paymentToken);
        vm.serializeString(key, "paymentTokenName", manifest.paymentTokenName);
        vm.serializeString(key, "paymentTokenSymbol", manifest.paymentTokenSymbol);
        vm.serializeUint(key, "paymentTokenDecimals", manifest.paymentTokenDecimals);
        vm.serializeAddress(key, "protocolOwner", manifest.protocolOwner);
        vm.serializeAddress(key, "pendingProtocolOwner", manifest.pendingProtocolOwner);
        vm.serializeAddress(key, "feeRecipient", manifest.feeRecipient);
        vm.serializeAddress(key, "renderer", manifest.renderer);
        vm.serializeAddress(key, "factory", manifest.factory);
        vm.serializeAddress(key, "deployer", manifest.deployer);
        vm.serializeAddress(key, "creationCodeStoreA", manifest.creationCodeStoreA);
        vm.serializeAddress(key, "creationCodeStoreB", manifest.creationCodeStoreB);
        vm.serializeAddress(key, "validationTier", manifest.validationTier);
        vm.serializeAddress(key, "validationTierOwner", manifest.validationTierOwner);
        vm.serializeUint(key, "validationTierIndex", manifest.validationTierIndex);
        vm.serializeBytes32(
            key, "paymentTokenRuntimeCodeHash", manifest.paymentTokenRuntimeCodeHash
        );
        vm.serializeBytes32(key, "rendererRuntimeCodeHash", manifest.rendererRuntimeCodeHash);
        vm.serializeBytes32(key, "factoryRuntimeCodeHash", manifest.factoryRuntimeCodeHash);
        vm.serializeBytes32(key, "deployerRuntimeCodeHash", manifest.deployerRuntimeCodeHash);
        vm.serializeBytes32(
            key, "creationCodeStoreARuntimeCodeHash", manifest.creationCodeStoreARuntimeCodeHash
        );
        vm.serializeBytes32(
            key, "creationCodeStoreBRuntimeCodeHash", manifest.creationCodeStoreBRuntimeCodeHash
        );
        vm.serializeBytes32(
            key, "validationTierRuntimeCodeHash", manifest.validationTierRuntimeCodeHash
        );
        vm.serializeBytes32(key, "rendererCreationCodeHash", manifest.rendererCreationCodeHash);
        vm.serializeBytes32(key, "factoryCreationCodeHash", manifest.factoryCreationCodeHash);
        vm.serializeBytes32(key, "tierCreationCodeHash", manifest.tierCreationCodeHash);
        vm.serializeBytes32(key, "validationTierConfigHash", manifest.validationTierConfigHash);
        vm.serializeString(key, "validationTierName", manifest.validationTierName);
        vm.serializeString(key, "validationTierSymbol", manifest.validationTierSymbol);
        vm.serializeString(key, "validationTierDescription", manifest.validationTierDescription);
        vm.serializeString(key, "validationTierImageURI", manifest.validationTierImageURI);
        vm.serializeString(key, "validationTierExternalURI", manifest.validationTierExternalURI);
        vm.serializeUint(key, "validationTierPricePerPeriod", manifest.validationTierPricePerPeriod);
        vm.serializeUint(key, "validationTierPeriodDuration", manifest.validationTierPeriodDuration);
        vm.serializeUint(key, "validationTierRewardBps", manifest.validationTierRewardBps);
        vm.serializeUint(key, "validationTierReferralBps", manifest.validationTierReferralBps);
        vm.serializeUint(key, "validationTierSupplyCap", manifest.validationTierSupplyCap);
        vm.serializeUint(
            key, "validationTierMaxPrepaidPeriods", manifest.validationTierMaxPrepaidPeriods
        );
        vm.serializeString(key, "foundryVersion", manifest.foundryVersion);
        vm.serializeString(key, "solcVersion", manifest.solcVersion);
        vm.serializeString(key, "evmVersion", manifest.evmVersion);
        vm.serializeBool(key, "optimizerEnabled", manifest.optimizerEnabled);
        vm.serializeUint(key, "optimizerRuns", manifest.optimizerRuns);
        vm.serializeString(key, "bytecodeHash", manifest.bytecodeHash);
        vm.serializeString(key, "rendererVerificationUrl", manifest.rendererVerificationUrl);
        vm.serializeString(key, "factoryVerificationUrl", manifest.factoryVerificationUrl);
        vm.serializeString(key, "deployerVerificationUrl", manifest.deployerVerificationUrl);
        vm.serializeString(
            key, "creationCodeStoreAVerificationUrl", manifest.creationCodeStoreAVerificationUrl
        );
        vm.serializeString(
            key, "creationCodeStoreBVerificationUrl", manifest.creationCodeStoreBVerificationUrl
        );
        json = vm.serializeString(
            key, "validationTierVerificationUrl", manifest.validationTierVerificationUrl
        );
    }

    function _check(Manifest memory manifest, bytes32 observedBlockHash) private view {
        if (keccak256(bytes(manifest.schema)) != keccak256("./schema-v1.json")) {
            revert DeploymentCheckFailed("$schema");
        }
        if (manifest.schemaVersion != 1) revert DeploymentCheckFailed("schemaVersion");
        if (keccak256(bytes(manifest.status)) != keccak256("deployed")) {
            revert ManifestNotDeployed();
        }
        if (manifest.chainId != block.chainid) revert DeploymentCheckFailed("chainId");
        if (keccak256(bytes(manifest.network)) != keccak256(bytes(_networkName(block.chainid)))) {
            revert DeploymentCheckFailed("network");
        }
        if (
            manifest.rendererCreationBlockNumber > manifest.factoryCreationBlockNumber
                || manifest.factoryCreationBlockNumber > manifest.validationTierCreationBlockNumber
                || manifest.validationTierCreationBlockNumber > manifest.capturedBlockNumber
        ) {
            revert DeploymentCheckFailed("creationBlockNumbers");
        }
        if (block.number != manifest.capturedBlockNumber || observedBlockHash == bytes32(0)) {
            revert CapturedBlockUnavailable();
        }
        if (observedBlockHash != manifest.capturedBlockHash) {
            revert DeploymentCheckFailed("capturedBlockHash");
        }
        if (
            manifest.factoryDeploymentTransactionHash == bytes32(0)
                || manifest.validationTierCreationTransactionHash == bytes32(0)
        ) {
            revert DeploymentCheckFailed("deploymentTransactionHashes");
        }

        _validateDeploymentInputs(
            manifest.chainId, manifest.paymentToken, manifest.protocolOwner, manifest.feeRecipient
        );
        if (
            keccak256(bytes(manifest.paymentTokenName))
                    != keccak256(bytes(IERC20Metadata(manifest.paymentToken).name()))
                || keccak256(bytes(manifest.paymentTokenSymbol))
                    != keccak256(bytes(IERC20Metadata(manifest.paymentToken).symbol()))
                || manifest.paymentTokenDecimals != IERC20Metadata(manifest.paymentToken).decimals()
        ) {
            revert DeploymentCheckFailed("paymentTokenMetadata");
        }
        if (
            keccak256(bytes(manifest.foundryVersion)) != keccak256(bytes(_FOUNDRY_VERSION))
                || keccak256(bytes(manifest.solcVersion)) != keccak256(bytes(_SOLC_VERSION))
                || keccak256(bytes(manifest.evmVersion)) != keccak256(bytes(_EVM_VERSION))
                || !manifest.optimizerEnabled || manifest.optimizerRuns != 200
                || keccak256(bytes(manifest.bytecodeHash)) != keccak256(bytes(_BYTECODE_HASH))
        ) {
            revert DeploymentCheckFailed("compilerSettings");
        }

        MembershipFactory factory = MembershipFactory(manifest.factory);
        MembershipTierDeployer deployer = MembershipTierDeployer(manifest.deployer);
        MembershipTier tier = MembershipTier(manifest.validationTier);
        if (manifest.pendingProtocolOwner != address(0)) {
            revert DeploymentCheckFailed("pendingProtocolOwner");
        }
        if (factory.owner() != manifest.protocolOwner) {
            revert DeploymentCheckFailed("protocolOwner");
        }
        if (factory.pendingOwner() != manifest.pendingProtocolOwner) {
            revert DeploymentCheckFailed("pendingProtocolOwner");
        }
        if (factory.feeRecipient() != manifest.feeRecipient) {
            revert DeploymentCheckFailed("feeRecipient");
        }
        if (address(factory.paymentToken()) != manifest.paymentToken) {
            revert DeploymentCheckFailed("paymentToken");
        }
        if (factory.renderer() != manifest.renderer || factory.deployer() != manifest.deployer) {
            revert DeploymentCheckFailed("factoryBindings");
        }
        if (factory.protocolFeeBps() != 100) revert DeploymentCheckFailed("protocolFeeBps");
        if (deployer.factory() != manifest.factory || deployer.renderer() != manifest.renderer) {
            revert DeploymentCheckFailed("deployerBindings");
        }
        if (
            deployer.creationCodeStoreA() != manifest.creationCodeStoreA
                || deployer.creationCodeStoreB() != manifest.creationCodeStoreB
        ) {
            revert DeploymentCheckFailed("creationCodeStores");
        }
        if (!factory.isRegisteredTier(manifest.validationTier)) {
            revert DeploymentCheckFailed("validationTierRegistration");
        }
        address[] memory tierPage = factory.tiers(manifest.validationTierIndex, 1);
        if (tierPage.length != 1 || tierPage[0] != manifest.validationTier) {
            revert DeploymentCheckFailed("validationTierIndex");
        }
        if (
            tier.factory() != manifest.factory
                || address(tier.paymentToken()) != manifest.paymentToken
                || tier.renderer() != manifest.renderer
                || tier.owner() != manifest.validationTierOwner || tier.pendingOwner() != address(0)
                || tier.protocolFeeBps() != 100
        ) {
            revert DeploymentCheckFailed("validationTierBindings");
        }
        if (
            tier.totalMinted() != 0 || tier.occupiedSupply() != 0 || tier.paused()
                || tier.creatorProceeds() != 0 || tier.rewardReserve() != 0
                || tier.totalReferralLiability() != 0
        ) {
            revert DeploymentCheckFailed("validationTierMustRemainPristine");
        }
        if (
            !tier.supportsInterface(type(IERC165).interfaceId)
                || !tier.supportsInterface(type(IERC721).interfaceId)
                || !tier.supportsInterface(type(IERC5192).interfaceId)
                || !tier.supportsInterface(type(IERC5643).interfaceId)
                || !tier.supportsInterface(0x49064906)
        ) {
            revert DeploymentCheckFailed("validationTierInterfaces");
        }

        _checkHashes(manifest, deployer, tier);
        _checkTransactionInputHashes(manifest);
        _checkNoProxySlots(manifest.factory);
        _checkNoProxySlots(manifest.deployer);
        _checkNoProxySlots(manifest.renderer);
        _checkNoProxySlots(manifest.validationTier);
        _checkVerificationUrl(manifest.chainId, manifest.renderer, manifest.rendererVerificationUrl);
        _checkVerificationUrl(manifest.chainId, manifest.factory, manifest.factoryVerificationUrl);
        _checkVerificationUrl(manifest.chainId, manifest.deployer, manifest.deployerVerificationUrl);
        _checkVerificationUrl(
            manifest.chainId,
            manifest.creationCodeStoreA,
            manifest.creationCodeStoreAVerificationUrl
        );
        _checkVerificationUrl(
            manifest.chainId,
            manifest.creationCodeStoreB,
            manifest.creationCodeStoreBVerificationUrl
        );
        _checkVerificationUrl(
            manifest.chainId, manifest.validationTier, manifest.validationTierVerificationUrl
        );
    }

    function _checkHashes(
        Manifest memory manifest,
        MembershipTierDeployer deployer,
        MembershipTier tier
    ) private view {
        if (manifest.paymentToken.codehash != manifest.paymentTokenRuntimeCodeHash) {
            revert DeploymentCheckFailed("paymentTokenRuntimeCodeHash");
        }
        if (manifest.renderer.codehash != manifest.rendererRuntimeCodeHash) {
            revert DeploymentCheckFailed("rendererRuntimeCodeHash");
        }
        if (manifest.factory.codehash != manifest.factoryRuntimeCodeHash) {
            revert DeploymentCheckFailed("factoryRuntimeCodeHash");
        }
        if (manifest.deployer.codehash != manifest.deployerRuntimeCodeHash) {
            revert DeploymentCheckFailed("deployerRuntimeCodeHash");
        }
        if (manifest.creationCodeStoreA.codehash != manifest.creationCodeStoreARuntimeCodeHash) {
            revert DeploymentCheckFailed("creationCodeStoreARuntimeCodeHash");
        }
        if (manifest.creationCodeStoreB.codehash != manifest.creationCodeStoreBRuntimeCodeHash) {
            revert DeploymentCheckFailed("creationCodeStoreBRuntimeCodeHash");
        }
        if (manifest.validationTier.codehash != manifest.validationTierRuntimeCodeHash) {
            revert DeploymentCheckFailed("validationTierRuntimeCodeHash");
        }
        if (
            manifest.rendererRuntimeCodeHash != keccak256(type(OnchainMetadataRenderer).runtimeCode)
                || manifest.rendererCreationCodeHash
                    != keccak256(type(OnchainMetadataRenderer).creationCode)
                || manifest.factoryCreationCodeHash
                    != keccak256(type(MembershipFactory).creationCode)
                || manifest.tierCreationCodeHash != keccak256(type(MembershipTier).creationCode)
                || deployer.tierCreationCodeHash() != manifest.tierCreationCodeHash
                || _reconstructedTierCreationCodeHash(deployer) != manifest.tierCreationCodeHash
                || _tierConfigHash(tier) != manifest.validationTierConfigHash
                || _manifestTierConfigHash(manifest) != manifest.validationTierConfigHash
        ) {
            revert DeploymentCheckFailed("sourceArtifacts");
        }
    }

    function _checkTransactionInputHashes(Manifest memory manifest) private pure {
        if (manifest.factoryDeploymentInputHash != _expectedFactoryDeploymentInputHash(manifest)) {
            revert DeploymentCheckFailed("factoryDeploymentInputHash");
        }
        if (
            manifest.validationTierCreationInputHash
                != _expectedValidationTierCreationInputHash(manifest)
        ) {
            revert DeploymentCheckFailed("validationTierCreationInputHash");
        }
    }

    function _expectedFactoryDeploymentInputHash(Manifest memory manifest)
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                type(MembershipFactory).creationCode,
                abi.encode(
                    IERC20Metadata(manifest.paymentToken),
                    manifest.renderer,
                    manifest.protocolOwner,
                    manifest.feeRecipient
                )
            )
        );
    }

    function _expectedValidationTierCreationInputHash(Manifest memory manifest)
        private
        pure
        returns (bytes32)
    {
        MembershipTypes.TierConfig memory config = MembershipTypes.TierConfig({
            creator: manifest.validationTierOwner,
            name: manifest.validationTierName,
            symbol: manifest.validationTierSymbol,
            pricePerPeriod: manifest.validationTierPricePerPeriod,
            periodDuration: uint64(manifest.validationTierPeriodDuration),
            rewardBps: uint16(manifest.validationTierRewardBps),
            referralBps: uint16(manifest.validationTierReferralBps),
            supplyCap: uint64(manifest.validationTierSupplyCap),
            maxPrepaidPeriods: uint64(manifest.validationTierMaxPrepaidPeriods),
            metadata: MembershipTypes.TierMetadata({
                description: manifest.validationTierDescription,
                imageURI: manifest.validationTierImageURI,
                externalURI: manifest.validationTierExternalURI
            })
        });
        return keccak256(abi.encodeCall(MembershipFactory.createTier, (config)));
    }

    function _reconstructedTierCreationCodeHash(MembershipTierDeployer deployer)
        private
        view
        returns (bytes32 reconstructedHash)
    {
        uint256 codeLength = deployer.tierCreationCodeLength();
        uint256 expectedLength = type(MembershipTier).creationCode.length;
        if (codeLength != expectedLength) revert DeploymentCheckFailed("tierCreationCodeLength");

        uint256 firstLength = codeLength / 2;
        uint256 secondLength = codeLength - firstLength;
        address firstStore = deployer.creationCodeStoreA();
        address secondStore = deployer.creationCodeStoreB();
        if (
            firstStore.code.length != firstLength + 1 || secondStore.code.length != secondLength + 1
        ) {
            revert DeploymentCheckFailed("creationCodeStoreLength");
        }

        bytes memory creationCode = new bytes(codeLength);
        assembly ("memory-safe") {
            let data := add(creationCode, 0x20)
            extcodecopy(firstStore, data, 1, firstLength)
            extcodecopy(secondStore, add(data, firstLength), 1, secondLength)
            reconstructedHash := keccak256(data, codeLength)
        }
    }

    function _checkNoProxySlots(address target) private view {
        if (
            vm.load(target, _EIP1967_IMPLEMENTATION_SLOT) != bytes32(0)
                || vm.load(target, _EIP1967_ADMIN_SLOT) != bytes32(0)
                || vm.load(target, _EIP1967_BEACON_SLOT) != bytes32(0)
        ) {
            revert DeploymentCheckFailed("proxySlots");
        }
    }

    function _checkVerificationUrl(uint256 chainId, address target, string memory actual)
        private
        pure
    {
        string memory explorerBase = chainId == ROBINHOOD_TESTNET_CHAIN_ID
            ? "https://explorer.testnet.chain.robinhood.com/address/"
            : "https://robinhoodchain.blockscout.com/address/";
        string memory expected =
            string.concat(explorerBase, uint256(uint160(target)).toHexString(20), "?tab=contract");
        if (keccak256(bytes(actual)) != keccak256(bytes(expected))) {
            revert DeploymentCheckFailed("verificationUrls");
        }
    }

    function _tierConfigHash(MembershipTier tier) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tier.owner(),
                tier.name(),
                tier.symbol(),
                tier.description(),
                tier.imageURI(),
                tier.externalURI(),
                tier.pricePerPeriod(),
                tier.periodDuration(),
                tier.rewardBps(),
                tier.referralBps(),
                tier.supplyCap(),
                tier.maxPrepaidPeriods()
            )
        );
    }

    function _manifestTierConfigHash(Manifest memory manifest) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                manifest.validationTierOwner,
                manifest.validationTierName,
                manifest.validationTierSymbol,
                manifest.validationTierDescription,
                manifest.validationTierImageURI,
                manifest.validationTierExternalURI,
                manifest.validationTierPricePerPeriod,
                manifest.validationTierPeriodDuration,
                manifest.validationTierRewardBps,
                manifest.validationTierReferralBps,
                manifest.validationTierSupplyCap,
                manifest.validationTierMaxPrepaidPeriods
            )
        );
    }

    function _networkName(uint256 chainId) private pure returns (string memory) {
        if (chainId == ROBINHOOD_TESTNET_CHAIN_ID) return "robinhood-testnet";
        if (chainId == ROBINHOOD_MAINNET_CHAIN_ID) return "robinhood-mainnet";
        revert UnsupportedRobinhoodChain(chainId);
    }

    function _parseManifest(string memory json) private pure returns (Manifest memory manifest) {
        if (keccak256(bytes(json.readString(".status"))) != keccak256("deployed")) {
            revert ManifestNotDeployed();
        }
        manifest.schema = json.readString(".$schema");
        manifest.status = json.readString(".status");
        manifest.schemaVersion = json.readUint(".schemaVersion");
        manifest.chainId = json.readUint(".chainId");
        manifest.rendererCreationBlockNumber = json.readUint(".rendererCreationBlockNumber");
        manifest.factoryCreationBlockNumber = json.readUint(".factoryCreationBlockNumber");
        manifest.validationTierCreationBlockNumber =
            json.readUint(".validationTierCreationBlockNumber");
        manifest.capturedBlockNumber = json.readUint(".capturedBlockNumber");
        manifest.capturedBlockHash = json.readBytes32(".capturedBlockHash");
        manifest.factoryDeploymentTransactionHash =
            json.readBytes32(".factoryDeploymentTransactionHash");
        manifest.validationTierCreationTransactionHash =
            json.readBytes32(".validationTierCreationTransactionHash");
        manifest.factoryDeploymentInputHash = json.readBytes32(".factoryDeploymentInputHash");
        manifest.validationTierCreationInputHash =
            json.readBytes32(".validationTierCreationInputHash");
        manifest.paymentToken = json.readAddress(".paymentToken");
        manifest.protocolOwner = json.readAddress(".protocolOwner");
        manifest.pendingProtocolOwner = json.readAddress(".pendingProtocolOwner");
        manifest.feeRecipient = json.readAddress(".feeRecipient");
        manifest.renderer = json.readAddress(".renderer");
        manifest.factory = json.readAddress(".factory");
        manifest.deployer = json.readAddress(".deployer");
        manifest.creationCodeStoreA = json.readAddress(".creationCodeStoreA");
        manifest.creationCodeStoreB = json.readAddress(".creationCodeStoreB");
        manifest.validationTier = json.readAddress(".validationTier");
        manifest.validationTierOwner = json.readAddress(".validationTierOwner");
        manifest.validationTierIndex = json.readUint(".validationTierIndex");
        manifest.paymentTokenRuntimeCodeHash = json.readBytes32(".paymentTokenRuntimeCodeHash");
        manifest.rendererRuntimeCodeHash = json.readBytes32(".rendererRuntimeCodeHash");
        manifest.factoryRuntimeCodeHash = json.readBytes32(".factoryRuntimeCodeHash");
        manifest.deployerRuntimeCodeHash = json.readBytes32(".deployerRuntimeCodeHash");
        manifest.creationCodeStoreARuntimeCodeHash =
            json.readBytes32(".creationCodeStoreARuntimeCodeHash");
        manifest.creationCodeStoreBRuntimeCodeHash =
            json.readBytes32(".creationCodeStoreBRuntimeCodeHash");
        manifest.validationTierRuntimeCodeHash = json.readBytes32(".validationTierRuntimeCodeHash");
        manifest.rendererCreationCodeHash = json.readBytes32(".rendererCreationCodeHash");
        manifest.factoryCreationCodeHash = json.readBytes32(".factoryCreationCodeHash");
        manifest.tierCreationCodeHash = json.readBytes32(".tierCreationCodeHash");
        manifest.validationTierConfigHash = json.readBytes32(".validationTierConfigHash");
        manifest.network = json.readString(".network");
        manifest.paymentTokenName = json.readString(".paymentTokenName");
        manifest.paymentTokenSymbol = json.readString(".paymentTokenSymbol");
        manifest.paymentTokenDecimals = json.readUint(".paymentTokenDecimals");
        manifest.validationTierName = json.readString(".validationTierName");
        manifest.validationTierSymbol = json.readString(".validationTierSymbol");
        manifest.validationTierDescription = json.readString(".validationTierDescription");
        manifest.validationTierImageURI = json.readString(".validationTierImageURI");
        manifest.validationTierExternalURI = json.readString(".validationTierExternalURI");
        manifest.validationTierPricePerPeriod = json.readUint(".validationTierPricePerPeriod");
        manifest.validationTierPeriodDuration = json.readUint(".validationTierPeriodDuration");
        manifest.validationTierRewardBps = json.readUint(".validationTierRewardBps");
        manifest.validationTierReferralBps = json.readUint(".validationTierReferralBps");
        manifest.validationTierSupplyCap = json.readUint(".validationTierSupplyCap");
        manifest.validationTierMaxPrepaidPeriods = json.readUint(".validationTierMaxPrepaidPeriods");
        manifest.foundryVersion = json.readString(".foundryVersion");
        manifest.solcVersion = json.readString(".solcVersion");
        manifest.evmVersion = json.readString(".evmVersion");
        manifest.optimizerEnabled = json.readBool(".optimizerEnabled");
        manifest.optimizerRuns = json.readUint(".optimizerRuns");
        manifest.bytecodeHash = json.readString(".bytecodeHash");
        manifest.rendererVerificationUrl = json.readString(".rendererVerificationUrl");
        manifest.factoryVerificationUrl = json.readString(".factoryVerificationUrl");
        manifest.deployerVerificationUrl = json.readString(".deployerVerificationUrl");
        manifest.creationCodeStoreAVerificationUrl =
            json.readString(".creationCodeStoreAVerificationUrl");
        manifest.creationCodeStoreBVerificationUrl =
            json.readString(".creationCodeStoreBVerificationUrl");
        manifest.validationTierVerificationUrl = json.readString(".validationTierVerificationUrl");
    }
}
