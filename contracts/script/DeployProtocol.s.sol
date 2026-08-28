// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ImmutableCodeStore} from "../src/ImmutableCodeStore.sol";
import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTierDeployer} from "../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {RobinhoodProtocolConfig} from "../src/RobinhoodProtocolConfig.sol";
import {RobinhoodProtocolDeployment} from "../src/RobinhoodProtocolDeployment.sol";
import {
    RobinhoodProtocolDeploymentAuthority
} from "../src/RobinhoodProtocolDeploymentAuthority.sol";

interface IUSDGDeploymentTarget is IERC20Metadata {
    function paused() external view returns (bool);
}

interface IProtocolSafe {
    function VERSION() external view returns (string memory);

    function masterCopy() external view returns (address);
}

abstract contract ProtocolDeployment is Script {
    error DeploymentInvariantFailed();
    error InvalidOperationalAddress();
    error InvalidUSDGContract();

    function _validateInputs(address paymentToken, address protocolOwner, address feeRecipient)
        internal
        view
    {
        if (protocolOwner == address(0) || feeRecipient == address(0)) {
            revert InvalidOperationalAddress();
        }
        if (paymentToken.code.length == 0) revert InvalidUSDGContract();

        try IERC20Metadata(paymentToken).decimals() returns (uint8 decimals) {
            if (decimals != 6) revert InvalidUSDGContract();
        } catch {
            revert InvalidUSDGContract();
        }
        try IERC20Metadata(paymentToken).symbol() returns (string memory symbol) {
            if (keccak256(bytes(symbol)) != keccak256("USDG")) revert InvalidUSDGContract();
        } catch {
            revert InvalidUSDGContract();
        }
        try IERC20Metadata(paymentToken).name() returns (string memory name) {
            if (bytes(name).length == 0) revert InvalidUSDGContract();
        } catch {
            revert InvalidUSDGContract();
        }
    }

    function _deployLocal(address paymentToken, address protocolOwner, address feeRecipient)
        internal
        returns (OnchainMetadataRenderer renderer, MembershipFactory factory)
    {
        renderer = new OnchainMetadataRenderer();
        factory = new MembershipFactory(
            IERC20Metadata(paymentToken), address(renderer), protocolOwner, feeRecipient
        );
    }

    function _checkDeployment(
        OnchainMetadataRenderer renderer,
        MembershipFactory factory,
        address paymentToken,
        address protocolOwner,
        address feeRecipient
    ) internal view {
        address tierDeployer = factory.deployer();
        if (
            address(renderer).code.length == 0 || address(factory).code.length == 0
                || tierDeployer.code.length == 0 || address(factory.paymentToken()) != paymentToken
                || factory.renderer() != address(renderer) || factory.owner() != protocolOwner
                || factory.pendingOwner() != address(0) || factory.feeRecipient() != feeRecipient
                || MembershipTierDeployer(tierDeployer).factory() != address(factory)
                || MembershipTierDeployer(tierDeployer).renderer() != address(renderer)
        ) {
            revert DeploymentInvariantFailed();
        }
    }

    function _logDeployment(OnchainMetadataRenderer renderer, MembershipFactory factory)
        internal
        view
    {
        console2.log("Backed By Fans renderer", address(renderer));
        console2.log("Backed By Fans factory", address(factory));
        console2.log("Backed By Fans tier deployer", factory.deployer());
    }
}

/// @notice Exact public-chain, canonical-token, Safe, and CREATE2 validation.
abstract contract RobinhoodDeploymentGuard is ProtocolDeployment {
    uint256 public constant ROBINHOOD_MAINNET_CHAIN_ID = RobinhoodProtocolConfig.MAINNET_CHAIN_ID;
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = RobinhoodProtocolConfig.TESTNET_CHAIN_ID;
    address public constant ROBINHOOD_MAINNET_USDG = RobinhoodProtocolConfig.MAINNET_USDG;
    address public constant ROBINHOOD_TESTNET_USDG = RobinhoodProtocolConfig.TESTNET_USDG;
    address public constant INITIAL_PROTOCOL_AUTHORITY =
        RobinhoodProtocolConfig.INITIAL_PROTOCOL_AUTHORITY;
    address public constant SAFE_L2_SINGLETON = RobinhoodProtocolConfig.SAFE_L2_SINGLETON;
    address public constant APPROVED_DEPLOYER =
        RobinhoodProtocolDeploymentAuthority.APPROVED_DEPLOYER;

    address public constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 public constant CREATE2_DEPLOYER_CODE_HASH =
        0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989;
    bytes32 public constant DEPLOYMENT_SALT = keccak256("Backed By Fans protocol deployment v1");
    bytes32 public constant FACTORY_CODE_STORE_A_SALT =
        keccak256("Backed By Fans MembershipFactory creation code A v1");
    bytes32 public constant FACTORY_CODE_STORE_B_SALT =
        keccak256("Backed By Fans MembershipFactory creation code B v1");

    address public constant ROBINHOOD_TESTNET_USDG_IMPLEMENTATION =
        0xF0863D7A29a55d0c4263c11bFac754312ff078DF;
    address public constant ROBINHOOD_MAINNET_USDG_IMPLEMENTATION =
        0x68184C449E1a8f34fA18d289737129FD27B66f8F;
    bytes32 public constant ROBINHOOD_TESTNET_USDG_PROXY_RUNTIME_CODE_HASH =
        0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6;
    bytes32 public constant ROBINHOOD_MAINNET_USDG_PROXY_RUNTIME_CODE_HASH =
        0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6;
    bytes32 public constant ROBINHOOD_TESTNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH =
        0x72f197ff5ab8dcedf1244113dd91f245af65ae2c3354456d8bbfb6a3939ecd18;
    bytes32 public constant ROBINHOOD_MAINNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH =
        0x3a551ac5c744af57e68a1d1431ac403c0f516ffd7d224a75746aee11fc4f3baf;
    bytes32 public constant EIP1967_IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 private constant _SAFE_VERSION_HASH = keccak256("1.5.0");

    address public constant EXPECTED_DEPLOYMENT_ADDRESS =
        0x04eb0710aA46246C64558BF518077952601f4c61;
    address public constant EXPECTED_RENDERER_ADDRESS = 0xce0A548907689becd13bb322f0B73Bc645c7cB2C;
    address public constant EXPECTED_FACTORY_ADDRESS = 0xA4CD42B116086B9E0f192B9274626FF180063562;
    address public constant EXPECTED_FACTORY_CODE_STORE_A =
        0xeCA48C751f78fC33a13f181A682E6C27b739D935;
    address public constant EXPECTED_FACTORY_CODE_STORE_B =
        0xF600B03145798bAf8A455491910252c95a0488E6;

    error CanonicalCreate2DeployerMismatch(bytes32 expected, bytes32 observed);
    error DeploymentStateMismatch();
    error DeterministicAddressMismatch();
    error ExistingDeploymentCodeMismatch(bytes32 expected, bytes32 observed);
    error FactoryCodeStoreMismatch(address store, bytes32 expected, bytes32 observed);
    error InvalidProtocolSafe();
    error ProtocolDeploymentIncomplete();

    function _validatePublicInputs() internal view returns (address paymentToken) {
        paymentToken = address(RobinhoodProtocolConfig.canonicalPaymentToken());
        _validateInputs(paymentToken, INITIAL_PROTOCOL_AUTHORITY, INITIAL_PROTOCOL_AUTHORITY);
        _validateProtocolSafe();

        bytes32 observedCreate2DeployerHash = CREATE2_DEPLOYER.codehash;
        if (observedCreate2DeployerHash != CREATE2_DEPLOYER_CODE_HASH) {
            revert CanonicalCreate2DeployerMismatch(
                CREATE2_DEPLOYER_CODE_HASH, observedCreate2DeployerHash
            );
        }

        _validateUSDGState(paymentToken);
    }

    function _validateProtocolSafe() private view {
        address authority = INITIAL_PROTOCOL_AUTHORITY;
        if (authority.code.length == 0) revert InvalidProtocolSafe();

        try IProtocolSafe(authority).masterCopy() returns (address singleton) {
            if (singleton != SAFE_L2_SINGLETON) revert InvalidProtocolSafe();
        } catch {
            revert InvalidProtocolSafe();
        }

        try IProtocolSafe(authority).VERSION() returns (string memory version) {
            if (keccak256(bytes(version)) != _SAFE_VERSION_HASH) revert InvalidProtocolSafe();
        } catch {
            revert InvalidProtocolSafe();
        }
    }

    function _validateUSDGState(address paymentToken) internal view virtual {
        address expectedImplementation;
        bytes32 expectedProxyCodeHash;
        bytes32 expectedImplementationCodeHash;
        if (block.chainid == ROBINHOOD_MAINNET_CHAIN_ID) {
            expectedImplementation = ROBINHOOD_MAINNET_USDG_IMPLEMENTATION;
            expectedProxyCodeHash = ROBINHOOD_MAINNET_USDG_PROXY_RUNTIME_CODE_HASH;
            expectedImplementationCodeHash = ROBINHOOD_MAINNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH;
        } else {
            expectedImplementation = ROBINHOOD_TESTNET_USDG_IMPLEMENTATION;
            expectedProxyCodeHash = ROBINHOOD_TESTNET_USDG_PROXY_RUNTIME_CODE_HASH;
            expectedImplementationCodeHash = ROBINHOOD_TESTNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH;
        }

        if (paymentToken.codehash != expectedProxyCodeHash) {
            revert InvalidUSDGContract();
        }

        address implementation =
            address(uint160(uint256(vm.load(paymentToken, EIP1967_IMPLEMENTATION_SLOT))));
        if (
            implementation != expectedImplementation
                || implementation.codehash != expectedImplementationCodeHash
        ) {
            revert InvalidUSDGContract();
        }

        try IUSDGDeploymentTarget(paymentToken).paused() returns (bool isPaused) {
            if (isPaused) revert InvalidUSDGContract();
        } catch {
            revert InvalidUSDGContract();
        }
    }

    function predictedAddresses()
        public
        pure
        returns (address deployment, address renderer, address factory)
    {
        deployment = vm.computeCreate2Address(
            DEPLOYMENT_SALT,
            keccak256(type(RobinhoodProtocolDeployment).creationCode),
            CREATE2_DEPLOYER
        );
        renderer = vm.computeCreateAddress(deployment, 1);
        factory = vm.computeCreateAddress(deployment, 2);
    }

    function predictedFactoryCodeStores() public pure returns (address storeA, address storeB) {
        (bytes memory firstChunk, bytes memory secondChunk) = _factoryCreationCodeChunks();
        storeA = vm.computeCreate2Address(
            FACTORY_CODE_STORE_A_SALT,
            keccak256(
                abi.encodePacked(type(ImmutableCodeStore).creationCode, abi.encode(firstChunk))
            ),
            CREATE2_DEPLOYER
        );
        storeB = vm.computeCreate2Address(
            FACTORY_CODE_STORE_B_SALT,
            keccak256(
                abi.encodePacked(type(ImmutableCodeStore).creationCode, abi.encode(secondChunk))
            ),
            CREATE2_DEPLOYER
        );
    }

    function _factoryCreationCodeChunks()
        internal
        pure
        returns (bytes memory firstChunk, bytes memory secondChunk)
    {
        bytes memory creationCode = type(MembershipFactory).creationCode;
        uint256 firstLength = creationCode.length / 2;
        uint256 secondLength = creationCode.length - firstLength;
        firstChunk = new bytes(firstLength);
        secondChunk = new bytes(secondLength);
        assembly ("memory-safe") {
            mcopy(add(firstChunk, 0x20), add(creationCode, 0x20), firstLength)
            mcopy(add(secondChunk, 0x20), add(add(creationCode, 0x20), firstLength), secondLength)
        }
    }

    function _validateFactoryCodeStores()
        internal
        view
        returns (bool storeAExists, bool storeBExists)
    {
        (address predictedStoreA, address predictedStoreB) = predictedFactoryCodeStores();
        if (
            predictedStoreA != EXPECTED_FACTORY_CODE_STORE_A
                || predictedStoreB != EXPECTED_FACTORY_CODE_STORE_B
        ) revert DeterministicAddressMismatch();

        (bytes memory firstChunk, bytes memory secondChunk) = _factoryCreationCodeChunks();
        storeAExists = _validateFactoryCodeStore(predictedStoreA, firstChunk);
        storeBExists = _validateFactoryCodeStore(predictedStoreB, secondChunk);
    }

    function _validateFactoryCodeStore(address store, bytes memory chunk)
        private
        view
        returns (bool exists)
    {
        if (store.code.length == 0) return false;
        bytes32 expectedCodeHash = keccak256(abi.encodePacked(hex"00", chunk));
        bytes32 observedCodeHash = store.codehash;
        if (store.code.length != chunk.length + 1 || observedCodeHash != expectedCodeHash) {
            revert FactoryCodeStoreMismatch(store, expectedCodeHash, observedCodeHash);
        }
        return true;
    }

    function _validatedDeploymentState(address paymentToken)
        internal
        view
        returns (
            RobinhoodProtocolDeployment deployment,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        (address expectedDeployment, address expectedRenderer, address expectedFactory) =
            predictedAddresses();
        if (
            expectedDeployment != EXPECTED_DEPLOYMENT_ADDRESS
                || expectedRenderer != EXPECTED_RENDERER_ADDRESS
                || expectedFactory != EXPECTED_FACTORY_ADDRESS
        ) {
            revert DeterministicAddressMismatch();
        }
        if (expectedDeployment.code.length == 0) return (deployment, renderer, factory);

        bytes32 expectedRuntimeCodeHash = keccak256(type(RobinhoodProtocolDeployment).runtimeCode);
        bytes32 observedRuntimeCodeHash = expectedDeployment.codehash;
        if (observedRuntimeCodeHash != expectedRuntimeCodeHash) {
            revert ExistingDeploymentCodeMismatch(expectedRuntimeCodeHash, observedRuntimeCodeHash);
        }

        deployment = RobinhoodProtocolDeployment(expectedDeployment);
        renderer = deployment.renderer();
        factory = deployment.factory();
        if (address(renderer) == address(0) && address(factory) == address(0)) {
            return (deployment, renderer, factory);
        }
        if (
            address(renderer) != expectedRenderer || address(factory) != expectedFactory
                || address(renderer) == address(0) || address(factory) == address(0)
        ) {
            revert DeploymentStateMismatch();
        }
        _checkDeployment(
            renderer, factory, paymentToken, INITIAL_PROTOCOL_AUTHORITY, INITIAL_PROTOCOL_AUTHORITY
        );
    }

    function _validatedCompletedDeployment(address paymentToken)
        internal
        view
        returns (
            RobinhoodProtocolDeployment deployment,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        (bool storeAExists, bool storeBExists) = _validateFactoryCodeStores();
        (deployment, renderer, factory) = _validatedDeploymentState(paymentToken);
        if (
            !storeAExists || !storeBExists || address(deployment) == address(0)
                || address(renderer) == address(0) || address(factory) == address(0)
        ) revert ProtocolDeploymentIncomplete();
    }
}

/// @notice Resumable deterministic public deployment for Robinhood mainnet and testnet.
contract DeployProtocol is RobinhoodDeploymentGuard {
    error MainnetConfirmationRequired(uint256 provided);

    function run() external returns (OnchainMetadataRenderer renderer, MembershipFactory factory) {
        address paymentToken = _validatePublicInputs();
        validateMainnetConfirmation(vm.envOr("CONFIRM_MAINNET_DEPLOYMENT", uint256(0)));
        _ensureFactoryCodeStores();

        RobinhoodProtocolDeployment deployment;
        (deployment, renderer, factory) = _validatedDeploymentState(paymentToken);

        if (address(deployment) == address(0)) {
            vm.startBroadcast();
            deployment = new RobinhoodProtocolDeployment{salt: DEPLOYMENT_SALT}();
            vm.stopBroadcast();
            if (address(deployment) != EXPECTED_DEPLOYMENT_ADDRESS) {
                revert DeterministicAddressMismatch();
            }
        }

        if (address(renderer) == address(0)) {
            vm.startBroadcast();
            (renderer, factory) = deployment.deploy(paymentToken);
            vm.stopBroadcast();
        }

        if (
            address(renderer) != EXPECTED_RENDERER_ADDRESS
                || address(factory) != EXPECTED_FACTORY_ADDRESS
        ) revert DeterministicAddressMismatch();
        _checkDeployment(
            renderer, factory, paymentToken, INITIAL_PROTOCOL_AUTHORITY, INITIAL_PROTOCOL_AUTHORITY
        );
        console2.log("Backed By Fans CREATE2 deployment", address(deployment));
        _logDeployment(renderer, factory);
    }

    function _ensureFactoryCodeStores() private {
        (bool storeAExists, bool storeBExists) = _validateFactoryCodeStores();
        (bytes memory firstChunk, bytes memory secondChunk) = _factoryCreationCodeChunks();

        if (!storeAExists) {
            vm.startBroadcast();
            ImmutableCodeStore storeA =
                new ImmutableCodeStore{salt: FACTORY_CODE_STORE_A_SALT}(firstChunk);
            vm.stopBroadcast();
            if (address(storeA) != EXPECTED_FACTORY_CODE_STORE_A) {
                revert DeterministicAddressMismatch();
            }
        }
        if (!storeBExists) {
            vm.startBroadcast();
            ImmutableCodeStore storeB =
                new ImmutableCodeStore{salt: FACTORY_CODE_STORE_B_SALT}(secondChunk);
            vm.stopBroadcast();
            if (address(storeB) != EXPECTED_FACTORY_CODE_STORE_B) {
                revert DeterministicAddressMismatch();
            }
        }

        (storeAExists, storeBExists) = _validateFactoryCodeStores();
        if (!storeAExists || !storeBExists) revert DeploymentStateMismatch();
    }

    function validateInputs() external view returns (address paymentToken) {
        return _validatePublicInputs();
    }

    function validateMainnetConfirmation(uint256 confirmation) public view {
        if (block.chainid == ROBINHOOD_MAINNET_CHAIN_ID && confirmation != block.chainid) {
            revert MainnetConfirmationRequired(confirmation);
        }
    }
}

/// @notice Read-only public deployment preflight and status validation.
contract ValidateProtocol is RobinhoodDeploymentGuard {
    function run()
        external
        view
        returns (
            RobinhoodProtocolDeployment deployment,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        address paymentToken = _validatePublicInputs();
        (bool storeAExists, bool storeBExists) = _validateFactoryCodeStores();
        (deployment, renderer, factory) = _validatedDeploymentState(paymentToken);

        console2.log("Backed By Fans expected CREATE2 deployment", EXPECTED_DEPLOYMENT_ADDRESS);
        console2.log("Backed By Fans factory code store A ready", storeAExists);
        console2.log("Backed By Fans factory code store B ready", storeBExists);
        if (address(deployment) == address(0)) {
            console2.log("Backed By Fans deployment status: coordinator not deployed");
        } else if (address(renderer) == address(0)) {
            console2.log("Backed By Fans deployment status: coordinator ready for children");
        } else {
            console2.log("Backed By Fans deployment status: complete");
            _logDeployment(renderer, factory);
        }
    }
}

/// @notice Signer-free gate proving no deployment transaction remains before verification resume.
contract ValidateCompletedProtocol is RobinhoodDeploymentGuard {
    function run()
        external
        view
        returns (
            RobinhoodProtocolDeployment deployment,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        address paymentToken = _validatePublicInputs();
        (deployment, renderer, factory) = _validatedCompletedDeployment(paymentToken);
        console2.log("Backed By Fans deployment status: complete");
        _logDeployment(renderer, factory);
    }
}

/// @notice Disposable Anvil deployment kept distinct from public Robinhood deployments.
contract DeployLocalProtocol is ProtocolDeployment {
    uint256 public constant ANVIL_CHAIN_ID = 31_337;

    error UnexpectedLocalChain(uint256 chainId);

    function run() external returns (OnchainMetadataRenderer renderer, MembershipFactory factory) {
        address paymentToken = vm.envAddress("LOCAL_USDG_ADDRESS");
        address protocolOwner = vm.envAddress("PROTOCOL_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        _validateLocalInputs(paymentToken, protocolOwner, feeRecipient);

        vm.startBroadcast();
        (renderer, factory) = _deployLocal(paymentToken, protocolOwner, feeRecipient);
        vm.stopBroadcast();

        _checkDeployment(renderer, factory, paymentToken, protocolOwner, feeRecipient);
        _logDeployment(renderer, factory);
    }

    function deploy(address paymentToken, address protocolOwner, address feeRecipient)
        external
        returns (OnchainMetadataRenderer renderer, MembershipFactory factory)
    {
        _validateLocalInputs(paymentToken, protocolOwner, feeRecipient);
        (renderer, factory) = _deployLocal(paymentToken, protocolOwner, feeRecipient);
        _checkDeployment(renderer, factory, paymentToken, protocolOwner, feeRecipient);
    }

    function validateInputs(address paymentToken, address protocolOwner, address feeRecipient)
        external
        view
    {
        _validateLocalInputs(paymentToken, protocolOwner, feeRecipient);
    }

    function _validateLocalInputs(address paymentToken, address protocolOwner, address feeRecipient)
        private
        view
    {
        if (block.chainid != ANVIL_CHAIN_ID) revert UnexpectedLocalChain(block.chainid);
        _validateInputs(paymentToken, protocolOwner, feeRecipient);
    }
}
