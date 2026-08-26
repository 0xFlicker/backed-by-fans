// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {MembershipTierDeployer} from "../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";

/// @notice Shared Robinhood chain and canonical-token validation for deployment tooling.
abstract contract RobinhoodDeploymentGuard is Script {
    uint256 public constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = 46_630;
    address public constant ROBINHOOD_MAINNET_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    error InvalidOperationalAddress();
    error InvalidUSDGContract();
    error MissingCanonicalTestnetUSDG();
    error UnexpectedChain(uint256 actual, uint256 expected);
    error UnexpectedUSDG(address actual, address expected);
    error UnsupportedRobinhoodChain(uint256 chainId);

    function _validateDeploymentInputs(
        uint256 expectedChainId,
        address paymentToken,
        address protocolOwner,
        address feeRecipient
    ) internal view {
        if (block.chainid != expectedChainId) {
            revert UnexpectedChain(block.chainid, expectedChainId);
        }
        if (
            expectedChainId != ROBINHOOD_MAINNET_CHAIN_ID
                && expectedChainId != ROBINHOOD_TESTNET_CHAIN_ID
        ) {
            revert UnsupportedRobinhoodChain(expectedChainId);
        }
        if (protocolOwner == address(0) || feeRecipient == address(0)) {
            revert InvalidOperationalAddress();
        }

        if (expectedChainId == ROBINHOOD_MAINNET_CHAIN_ID) {
            if (paymentToken != ROBINHOOD_MAINNET_USDG) {
                revert UnexpectedUSDG(paymentToken, ROBINHOOD_MAINNET_USDG);
            }
        } else if (paymentToken == address(0)) {
            // No canonical testnet USDG is currently published by an approved source.
            revert MissingCanonicalTestnetUSDG();
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
}

/// @notice Repeatable renderer and factory deployment with exact Robinhood guards.
contract DeployProtocol is RobinhoodDeploymentGuard {
    error DeploymentInvariantFailed();
    error ValidationTierTestnetOnly();

    function run() external returns (OnchainMetadataRenderer renderer, MembershipFactory factory) {
        uint256 expectedChainId = vm.envUint("ROBINHOOD_CHAIN_ID");
        address paymentToken = vm.envAddress("ROBINHOOD_USDG_ADDRESS");
        address protocolOwner = vm.envAddress("PROTOCOL_OWNER");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        _validateDeploymentInputs(expectedChainId, paymentToken, protocolOwner, feeRecipient);

        vm.startBroadcast();
        (renderer, factory) = _deploy(paymentToken, protocolOwner, feeRecipient);
        vm.stopBroadcast();

        _checkDeployment(renderer, factory, paymentToken, protocolOwner, feeRecipient);
        console2.log("Backed By Fans renderer", address(renderer));
        console2.log("Backed By Fans factory", address(factory));
        console2.log("Backed By Fans tier deployer", factory.deployer());
    }

    /// @notice Local/test entrypoint. It applies the same guards without broadcasting.
    function deploy(
        uint256 expectedChainId,
        address paymentToken,
        address protocolOwner,
        address feeRecipient
    ) external returns (OnchainMetadataRenderer renderer, MembershipFactory factory) {
        _validateDeploymentInputs(expectedChainId, paymentToken, protocolOwner, feeRecipient);
        (renderer, factory) = _deploy(paymentToken, protocolOwner, feeRecipient);
        _checkDeployment(renderer, factory, paymentToken, protocolOwner, feeRecipient);
    }

    function validateInputs(
        uint256 expectedChainId,
        address paymentToken,
        address protocolOwner,
        address feeRecipient
    ) external view {
        _validateDeploymentInputs(expectedChainId, paymentToken, protocolOwner, feeRecipient);
    }

    /// @notice Creates the pristine registered child used by the independent testnet checker.
    /// @dev Run immediately before manifest capture and never transact with this tier.
    function deployValidationTier() external returns (MembershipTier tier) {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert ValidationTierTestnetOnly();

        MembershipFactory factory = MembershipFactory(vm.envAddress("DEPLOYED_FACTORY"));
        address creator = vm.envAddress("VALIDATION_TIER_OWNER");
        _validateDeploymentInputs(
            ROBINHOOD_TESTNET_CHAIN_ID,
            address(factory.paymentToken()),
            factory.owner(),
            factory.feeRecipient()
        );

        MembershipTypes.TierConfig memory config = MembershipTypes.TierConfig({
            creator: creator,
            name: "Backed By Fans Deployment Check",
            symbol: "BBF-CHECK",
            metadata: MembershipTypes.TierMetadata({
                description: "Pristine testnet tier for deployment verification.",
                imageURI: "",
                externalURI: ""
            }),
            pricePerPeriod: 1_000_000,
            periodDuration: 30 days,
            rewardBps: 500,
            referralBps: 100,
            supplyCap: 0,
            maxPrepaidPeriods: 12
        });

        vm.startBroadcast();
        tier = MembershipTier(factory.createTier(config));
        vm.stopBroadcast();

        if (tier.owner() != creator || !factory.isRegisteredTier(address(tier))) {
            revert DeploymentInvariantFailed();
        }
        console2.log("Backed By Fans validation tier", address(tier));
    }

    function _deploy(address paymentToken, address protocolOwner, address feeRecipient)
        private
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
    ) private view {
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
}
