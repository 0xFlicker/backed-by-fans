// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {RendererRegistry} from "../src/RendererRegistry.sol";
import {RobinhoodProtocolConfig} from "../src/RobinhoodProtocolConfig.sol";

abstract contract RendererRegistryGuard is Script {
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = RobinhoodProtocolConfig.TESTNET_CHAIN_ID;
    bytes32 public constant RENDERER_SCHEMA =
        0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4;

    error InvalidRegistry(address registry);
    error RegistryInvariantFailed(address registry);
    error UnexpectedChain(uint256 chainId);

    function _validateChain() internal view {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert UnexpectedChain(block.chainid);
    }

    function _validateRegistry(RendererRegistry registry) internal view {
        if (address(registry) == address(0) || address(registry).code.length == 0) {
            revert InvalidRegistry(address(registry));
        }
        if (
            registry.rendererSchema() != RENDERER_SCHEMA || registry.maxPageSize() != 100
                || registry.maxInitCodeBytes() != 94_656
        ) revert RegistryInvariantFailed(address(registry));
    }
}

/// @notice Deploys the permissionless renderer registry on Robinhood Chain Testnet.
contract DeployRendererRegistry is RendererRegistryGuard {
    function run() external returns (RendererRegistry registry) {
        _validateChain();

        vm.startBroadcast();
        registry = new RendererRegistry();
        vm.stopBroadcast();

        _validateRegistry(registry);
        console2.log("Backed By Fans renderer registry", address(registry));
    }
}

/// @notice Read-only validation for an already deployed renderer registry.
contract ValidateRendererRegistry is RendererRegistryGuard {
    function run() external view returns (RendererRegistry registry) {
        _validateChain();
        registry = RendererRegistry(vm.envAddress("RENDERER_REGISTRY_ADDRESS"));
        _validateRegistry(registry);
        console2.log("Backed By Fans renderer registry", address(registry));
        console2.log("Registered renderer creators", registry.creatorCount());
    }
}
