// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTierDeployer} from "../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {RobinhoodMembershipFactory} from "../src/RobinhoodMembershipFactory.sol";
import {RobinhoodProtocolConfig} from "../src/RobinhoodProtocolConfig.sol";
import {TestnetUSDG} from "../src/TestnetUSDG.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";

interface IMainnetUSDGDeploymentTarget {
    function paused() external view returns (bool);
}

interface IProtocolSafe {
    function VERSION() external view returns (string memory);

    function masterCopy() external view returns (address);

    function getOwners() external view returns (address[] memory);

    function getThreshold() external view returns (uint256);

    function getModulesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory modules, address next);

    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
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
        returns (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        mediaStoreFactory = new OnchainMediaStoreFactory();
        renderer = new OnchainMetadataRenderer();
        factory = new MembershipFactory(
            IERC20Metadata(paymentToken),
            address(renderer),
            address(mediaStoreFactory),
            protocolOwner,
            feeRecipient
        );
    }

    function _checkDeployment(
        OnchainMediaStoreFactory mediaStoreFactory,
        OnchainMetadataRenderer renderer,
        MembershipFactory factory,
        address paymentToken,
        address protocolOwner,
        address feeRecipient
    ) internal view {
        address tierDeployer = factory.deployer();
        MembershipTypes.RendererRecord memory initialRenderer = factory.rendererRecord(1);
        if (
            address(mediaStoreFactory).code.length == 0 || address(renderer).code.length == 0
                || address(factory).code.length == 0 || tierDeployer.code.length == 0
                || address(factory.paymentToken()) != paymentToken
                || factory.owner() != protocolOwner || factory.rendererCount() != 1
                || factory.rendererVersionOf(address(renderer)) != 1
                || initialRenderer.implementation != address(renderer) || !initialRenderer.enabled
                || initialRenderer.runtimeCodehash != address(renderer).codehash
                || factory.rendererSchema() != renderer.rendererSchema()
                || factory.mediaStoreFactory() != address(mediaStoreFactory)
                || factory.mediaStoreFactoryRuntimeCodehash() != address(mediaStoreFactory).codehash
                || factory.pendingOwner() != address(0) || factory.feeRecipient() != feeRecipient
                || MembershipTierDeployer(tierDeployer).factory() != address(factory)
        ) {
            revert DeploymentInvariantFailed();
        }
    }

    function _logDeployment(
        OnchainMediaStoreFactory mediaStoreFactory,
        OnchainMetadataRenderer renderer,
        MembershipFactory factory
    ) internal view {
        console2.log("Backed By Fans media store factory", address(mediaStoreFactory));
        console2.log("Backed By Fans renderer", address(renderer));
        console2.log("Backed By Fans factory", address(factory));
        console2.log("Backed By Fans tier deployer", factory.deployer());
    }
}

/// @notice Exact public-chain, chain-selected USDG, Safe, and CREATE2 validation.
abstract contract RobinhoodDeploymentGuard is ProtocolDeployment {
    uint256 public constant ROBINHOOD_MAINNET_CHAIN_ID = RobinhoodProtocolConfig.MAINNET_CHAIN_ID;
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = RobinhoodProtocolConfig.TESTNET_CHAIN_ID;
    address public constant ROBINHOOD_MAINNET_USDG = RobinhoodProtocolConfig.MAINNET_USDG;
    address public constant INITIAL_PROTOCOL_AUTHORITY =
        RobinhoodProtocolConfig.INITIAL_PROTOCOL_AUTHORITY;
    address public constant SAFE_L2_SINGLETON = RobinhoodProtocolConfig.SAFE_L2_SINGLETON;
    address public constant APPROVED_DEPLOYER = RobinhoodProtocolConfig.APPROVED_DEPLOYER;
    address public constant CREATE2_DEPLOYER = RobinhoodProtocolConfig.CREATE2_DEPLOYER;
    bytes32 public constant TESTNET_USDG_SALT = RobinhoodProtocolConfig.TESTNET_USDG_SALT;
    bytes32 public constant MEDIA_STORE_FACTORY_SALT =
        RobinhoodProtocolConfig.MEDIA_STORE_FACTORY_SALT;
    bytes32 public constant INITIAL_RENDERER_SALT = RobinhoodProtocolConfig.INITIAL_RENDERER_SALT;
    bytes32 public constant FACTORY_SALT = RobinhoodProtocolConfig.FACTORY_SALT;

    bytes32 public constant CREATE2_DEPLOYER_CODE_HASH =
        RobinhoodProtocolConfig.CREATE2_DEPLOYER_CODE_HASH;
    address public constant ROBINHOOD_MAINNET_USDG_IMPLEMENTATION =
        0x68184C449E1a8f34fA18d289737129FD27B66f8F;
    bytes32 public constant ROBINHOOD_MAINNET_USDG_PROXY_RUNTIME_CODE_HASH =
        0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6;
    bytes32 public constant ROBINHOOD_MAINNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH =
        0x3a551ac5c744af57e68a1d1431ac403c0f516ffd7d224a75746aee11fc4f3baf;
    bytes32 public constant EIP1967_IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    address public constant COMPATIBILITY_FALLBACK_HANDLER =
        0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4;
    bytes32 private constant _SAFE_VERSION_HASH = keccak256("1.5.0");
    address private constant _SENTINEL_MODULES = address(0x1);
    bytes32 private constant _FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;
    bytes32 private constant _GUARD_STORAGE_SLOT =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    error CanonicalCreate2DeployerMismatch(bytes32 expected, bytes32 observed);
    error DeploymentStateMismatch();
    error ExistingDeploymentCodeMismatch(address target, bytes32 expected, bytes32 observed);
    error InvalidProtocolSafe();
    error ProtocolDeploymentIncomplete();

    function ROBINHOOD_TESTNET_USDG() public pure returns (address) {
        return RobinhoodProtocolConfig.testnetPaymentToken();
    }

    function predictedAddresses()
        public
        pure
        returns (address mediaStoreFactory, address renderer, address factory)
    {
        mediaStoreFactory = RobinhoodProtocolConfig.mediaStoreFactory();
        renderer = RobinhoodProtocolConfig.initialRenderer();
        factory = RobinhoodProtocolConfig.create2Address(
            FACTORY_SALT, keccak256(type(RobinhoodMembershipFactory).creationCode)
        );
    }

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
        IProtocolSafe account = IProtocolSafe(authority);

        try account.masterCopy() returns (address singleton) {
            if (singleton != SAFE_L2_SINGLETON) revert InvalidProtocolSafe();
        } catch {
            revert InvalidProtocolSafe();
        }

        try account.VERSION() returns (string memory version) {
            if (keccak256(bytes(version)) != _SAFE_VERSION_HASH) revert InvalidProtocolSafe();
        } catch {
            revert InvalidProtocolSafe();
        }

        address[] memory owners = account.getOwners();
        (address[] memory modules, address nextModule) =
            account.getModulesPaginated(_SENTINEL_MODULES, 1);
        if (
            owners.length != 1 || owners[0] != APPROVED_DEPLOYER || account.getThreshold() != 1
                || modules.length != 0 || nextModule != _SENTINEL_MODULES
                || _readSafeAddressSlot(account, _FALLBACK_HANDLER_STORAGE_SLOT)
                    != COMPATIBILITY_FALLBACK_HANDLER
                || _readSafeAddressSlot(account, _GUARD_STORAGE_SLOT) != address(0)
        ) revert InvalidProtocolSafe();
    }

    function _readSafeAddressSlot(IProtocolSafe safe, bytes32 slot)
        private
        view
        returns (address value)
    {
        bytes memory stored = safe.getStorageAt(uint256(slot), 1);
        if (stored.length != 32) revert InvalidProtocolSafe();
        assembly ("memory-safe") {
            value := mload(add(stored, 0x20))
        }
    }

    function _validateUSDGState(address paymentToken) internal view virtual {
        if (block.chainid == ROBINHOOD_TESTNET_CHAIN_ID) {
            if (
                paymentToken != ROBINHOOD_TESTNET_USDG()
                    || paymentToken.codehash != keccak256(type(TestnetUSDG).runtimeCode)
            ) revert InvalidUSDGContract();
            try TestnetUSDG(paymentToken).owner() returns (address owner) {
                if (owner != APPROVED_DEPLOYER) revert InvalidUSDGContract();
            } catch {
                revert InvalidUSDGContract();
            }
            return;
        }

        if (paymentToken.codehash != ROBINHOOD_MAINNET_USDG_PROXY_RUNTIME_CODE_HASH) {
            revert InvalidUSDGContract();
        }

        address implementation =
            address(uint160(uint256(vm.load(paymentToken, EIP1967_IMPLEMENTATION_SLOT))));
        if (
            implementation != ROBINHOOD_MAINNET_USDG_IMPLEMENTATION
                || implementation.codehash
                    != ROBINHOOD_MAINNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH
        ) {
            revert InvalidUSDGContract();
        }

        try IMainnetUSDGDeploymentTarget(paymentToken).paused() returns (bool isPaused) {
            if (isPaused) revert InvalidUSDGContract();
        } catch {
            revert InvalidUSDGContract();
        }
    }

    function _validatedDeploymentState(address paymentToken)
        internal
        view
        returns (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        (address expectedMediaStoreFactory, address expectedRenderer, address expectedFactory) =
            predictedAddresses();

        if (expectedMediaStoreFactory.code.length != 0) {
            bytes32 expectedMediaStoreFactoryCodeHash =
                keccak256(type(OnchainMediaStoreFactory).runtimeCode);
            bytes32 observedMediaStoreFactoryCodeHash = expectedMediaStoreFactory.codehash;
            if (observedMediaStoreFactoryCodeHash != expectedMediaStoreFactoryCodeHash) {
                revert ExistingDeploymentCodeMismatch(
                    expectedMediaStoreFactory,
                    expectedMediaStoreFactoryCodeHash,
                    observedMediaStoreFactoryCodeHash
                );
            }
            mediaStoreFactory = OnchainMediaStoreFactory(expectedMediaStoreFactory);
        }

        if (expectedRenderer.code.length != 0) {
            if (address(mediaStoreFactory) == address(0)) revert DeploymentStateMismatch();
            bytes32 expectedRendererCodeHash = keccak256(type(OnchainMetadataRenderer).runtimeCode);
            bytes32 observedRendererCodeHash = expectedRenderer.codehash;
            if (observedRendererCodeHash != expectedRendererCodeHash) {
                revert ExistingDeploymentCodeMismatch(
                    expectedRenderer, expectedRendererCodeHash, observedRendererCodeHash
                );
            }
            renderer = OnchainMetadataRenderer(expectedRenderer);
        }

        if (expectedFactory.code.length != 0) {
            if (address(mediaStoreFactory) == address(0) || address(renderer) == address(0)) {
                revert DeploymentStateMismatch();
            }
            factory = MembershipFactory(expectedFactory);
            _checkDeployment(
                mediaStoreFactory,
                renderer,
                factory,
                paymentToken,
                INITIAL_PROTOCOL_AUTHORITY,
                INITIAL_PROTOCOL_AUTHORITY
            );
        }
    }

    function _validatedCompletedDeployment(address paymentToken)
        internal
        view
        returns (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        (mediaStoreFactory, renderer, factory) = _validatedDeploymentState(paymentToken);
        if (
            address(mediaStoreFactory) == address(0) || address(renderer) == address(0)
                || address(factory) == address(0)
        ) {
            revert ProtocolDeploymentIncomplete();
        }
    }
}

/// @notice Public deployment-input validation used by the raw CREATE2 release wrapper.
/// @dev The release wrapper deliberately submits canonical CREATE2 calldata with Cast. Keeping
///      transaction construction out of Forge's script executor avoids its Ethereum initcode cap,
///      which is lower than Robinhood Chain's reviewed deployment envelope.
contract DeployProtocol is RobinhoodDeploymentGuard {
    error MainnetConfirmationRequired(uint256 provided);

    function validateInputs() external view returns (address paymentToken) {
        return _validatePublicInputs();
    }

    function validateMainnetConfirmation(uint256 confirmation) public view {
        if (block.chainid == ROBINHOOD_MAINNET_CHAIN_ID && confirmation != block.chainid) {
            revert MainnetConfirmationRequired(confirmation);
        }
    }
}

/// @notice Disposable Anvil deployment kept distinct from public Robinhood deployments.
contract DeployLocalProtocol is ProtocolDeployment {
    uint256 public constant ANVIL_CHAIN_ID = 31_337;

    error UnexpectedLocalChain(uint256 chainId);

    function run()
        external
        returns (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        address paymentToken = vm.envAddress("LOCAL_USDG_ADDRESS");
        address protocolOwner = vm.envAddress("PROTOCOL_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        _validateLocalInputs(paymentToken, protocolOwner, feeRecipient);

        vm.startBroadcast();
        (mediaStoreFactory, renderer, factory) =
            _deployLocal(paymentToken, protocolOwner, feeRecipient);
        vm.stopBroadcast();

        _checkDeployment(
            mediaStoreFactory, renderer, factory, paymentToken, protocolOwner, feeRecipient
        );
        _logDeployment(mediaStoreFactory, renderer, factory);
    }

    function deploy(address paymentToken, address protocolOwner, address feeRecipient)
        external
        returns (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            MembershipFactory factory
        )
    {
        _validateLocalInputs(paymentToken, protocolOwner, feeRecipient);
        (mediaStoreFactory, renderer, factory) =
            _deployLocal(paymentToken, protocolOwner, feeRecipient);
        _checkDeployment(
            mediaStoreFactory, renderer, factory, paymentToken, protocolOwner, feeRecipient
        );
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
