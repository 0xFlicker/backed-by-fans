// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTierDeployer} from "../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";

interface IUSDGDeploymentTarget is IERC20Metadata {
    function paused() external view returns (bool);
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

    function _deploy(address paymentToken, address protocolOwner, address feeRecipient)
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
        address deployer = factory.deployer();
        if (
            address(renderer).code.length == 0 || address(factory).code.length == 0
                || deployer.code.length == 0 || address(factory.paymentToken()) != paymentToken
                || factory.renderer() != address(renderer) || factory.owner() != protocolOwner
                || factory.pendingOwner() != address(0) || factory.feeRecipient() != feeRecipient
                || MembershipTierDeployer(deployer).factory() != address(factory)
                || MembershipTierDeployer(deployer).renderer() != address(renderer)
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

/// @notice Exact public-chain and canonical-token validation for deployment tooling.
abstract contract RobinhoodDeploymentGuard is ProtocolDeployment {
    uint256 public constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    address public constant ROBINHOOD_MAINNET_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address public constant ROBINHOOD_TESTNET_USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    address public constant ROBINHOOD_TESTNET_USDG_IMPLEMENTATION =
        0xF0863D7A29a55d0c4263c11bFac754312ff078DF;
    bytes32 public constant ROBINHOOD_TESTNET_USDG_PROXY_RUNTIME_CODE_HASH =
        0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6;
    bytes32 public constant ROBINHOOD_TESTNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH =
        0x72f197ff5ab8dcedf1244113dd91f245af65ae2c3354456d8bbfb6a3939ecd18;
    bytes32 public constant EIP1967_IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    error UnsupportedRobinhoodChain(uint256 chainId);

    function _validatePublicInputs(address protocolOwner, address feeRecipient)
        internal
        view
        returns (address paymentToken)
    {
        paymentToken = _canonicalPaymentToken();
        _validateInputs(paymentToken, protocolOwner, feeRecipient);
        if (block.chainid == ROBINHOOD_TESTNET_CHAIN_ID) {
            _validateTestnetUSDGState(paymentToken);
        }
    }

    function _canonicalPaymentToken() internal view returns (address) {
        if (block.chainid == ROBINHOOD_MAINNET_CHAIN_ID) return ROBINHOOD_MAINNET_USDG;
        if (block.chainid == ROBINHOOD_TESTNET_CHAIN_ID) return ROBINHOOD_TESTNET_USDG;
        revert UnsupportedRobinhoodChain(block.chainid);
    }

    function _validateTestnetUSDGState(address paymentToken) private view {
        if (paymentToken.codehash != ROBINHOOD_TESTNET_USDG_PROXY_RUNTIME_CODE_HASH) {
            revert InvalidUSDGContract();
        }

        address implementation =
            address(uint160(uint256(vm.load(paymentToken, EIP1967_IMPLEMENTATION_SLOT))));
        if (
            implementation != ROBINHOOD_TESTNET_USDG_IMPLEMENTATION
                || implementation.codehash
                    != ROBINHOOD_TESTNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH
        ) {
            revert InvalidUSDGContract();
        }

        try IUSDGDeploymentTarget(paymentToken).paused() returns (bool isPaused) {
            if (isPaused) revert InvalidUSDGContract();
        } catch {
            revert InvalidUSDGContract();
        }
    }
}

/// @notice Public Robinhood deployment. The RPC chain selects the canonical USDG binding.
contract DeployProtocol is RobinhoodDeploymentGuard {
    error MainnetConfirmationRequired(uint256 provided);

    function run() external returns (OnchainMetadataRenderer renderer, MembershipFactory factory) {
        address protocolOwner = vm.envAddress("PROTOCOL_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        address paymentToken = _validatePublicInputs(protocolOwner, feeRecipient);
        validateMainnetConfirmation(vm.envOr("CONFIRM_MAINNET_DEPLOYMENT", uint256(0)));

        vm.startBroadcast();
        (renderer, factory) = _deploy(paymentToken, protocolOwner, feeRecipient);
        vm.stopBroadcast();

        _checkDeployment(renderer, factory, paymentToken, protocolOwner, feeRecipient);
        _logDeployment(renderer, factory);
    }

    /// @notice Test entrypoint that applies the public-chain guards without broadcasting.
    function deploy(address protocolOwner, address feeRecipient)
        external
        returns (OnchainMetadataRenderer renderer, MembershipFactory factory)
    {
        address paymentToken = _validatePublicInputs(protocolOwner, feeRecipient);
        (renderer, factory) = _deploy(paymentToken, protocolOwner, feeRecipient);
        _checkDeployment(renderer, factory, paymentToken, protocolOwner, feeRecipient);
    }

    function validateInputs(address protocolOwner, address feeRecipient)
        external
        view
        returns (address paymentToken)
    {
        return _validatePublicInputs(protocolOwner, feeRecipient);
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

    function run() external returns (OnchainMetadataRenderer renderer, MembershipFactory factory) {
        address paymentToken = vm.envAddress("LOCAL_USDG_ADDRESS");
        address protocolOwner = vm.envAddress("PROTOCOL_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        _validateLocalInputs(paymentToken, protocolOwner, feeRecipient);

        vm.startBroadcast();
        (renderer, factory) = _deploy(paymentToken, protocolOwner, feeRecipient);
        vm.stopBroadcast();

        _checkDeployment(renderer, factory, paymentToken, protocolOwner, feeRecipient);
        _logDeployment(renderer, factory);
    }

    function deploy(address paymentToken, address protocolOwner, address feeRecipient)
        external
        returns (OnchainMetadataRenderer renderer, MembershipFactory factory)
    {
        _validateLocalInputs(paymentToken, protocolOwner, feeRecipient);
        (renderer, factory) = _deploy(paymentToken, protocolOwner, feeRecipient);
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
