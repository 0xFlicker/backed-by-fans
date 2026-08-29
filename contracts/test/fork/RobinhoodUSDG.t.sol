// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {DeployProtocol} from "../../script/DeployProtocol.s.sol";
import {TestnetUSDG} from "../../src/TestnetUSDG.sol";

/// @notice Opt-in live fork gate for the deployed LOL Dollar testnet USDG.
contract RobinhoodUSDGForkTest is Test {
    function test_deployedTestnetUSDGMatchesProtocolConfigurationWhenExplicitlyEnabled() public {
        if (!vm.envOr("RUN_ROBINHOOD_FORK_TESTS", false)) return;

        vm.createSelectFork(vm.envString("ROBINHOOD_TESTNET_RPC_URL"));
        DeployProtocol deployment = new DeployProtocol();
        TestnetUSDG token = TestnetUSDG(deployment.ROBINHOOD_TESTNET_USDG());

        assertEq(block.chainid, deployment.ROBINHOOD_TESTNET_CHAIN_ID());
        assertEq(address(token).codehash, keccak256(type(TestnetUSDG).runtimeCode));
        assertEq(token.name(), "LOL Dollar");
        assertEq(token.symbol(), "USDG");
        assertEq(token.decimals(), 6);
        assertEq(token.owner(), deployment.APPROVED_DEPLOYER());
        assertEq(deployment.validateInputs(), address(token));
    }

    function test_deployerCanMintTestnetUSDGWhenExplicitlyEnabled() public {
        if (!vm.envOr("RUN_ROBINHOOD_FORK_TESTS", false)) return;

        vm.createSelectFork(vm.envString("ROBINHOOD_TESTNET_RPC_URL"));
        DeployProtocol deployment = new DeployProtocol();
        TestnetUSDG token = TestnetUSDG(deployment.ROBINHOOD_TESTNET_USDG());
        address recipient = makeAddr("forkRecipient");

        vm.prank(deployment.APPROVED_DEPLOYER());
        token.mint(recipient, 100e6);
        assertEq(token.balanceOf(recipient), 100e6);
    }
}
