// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Test} from "forge-std/Test.sol";

import {DeployProtocol} from "../../script/DeployProtocol.s.sol";

/// @notice Opt-in live fork gate. It stays dormant until an official testnet USDG is published.
contract RobinhoodUSDGForkTest is Test {
    function test_currentCanonicalTestnetUSDGProxyWhenExplicitlyEnabled() public {
        if (!vm.envOr("RUN_ROBINHOOD_FORK_TESTS", false)) return;

        string memory rpcUrl = vm.envString("ROBINHOOD_TESTNET_RPC_URL");
        address paymentToken = vm.envAddress("ROBINHOOD_USDG_ADDRESS");
        vm.createSelectFork(rpcUrl);

        DeployProtocol deployment = new DeployProtocol();
        deployment.validateInputs(
            deployment.ROBINHOOD_TESTNET_CHAIN_ID(),
            paymentToken,
            makeAddr("forkProtocolOwner"),
            makeAddr("forkFeeRecipient")
        );

        assertEq(block.chainid, deployment.ROBINHOOD_TESTNET_CHAIN_ID());
        assertTrue(paymentToken.code.length != 0);
        assertEq(IERC20Metadata(paymentToken).symbol(), "USDG");
        assertEq(IERC20Metadata(paymentToken).decimals(), 6);
        assertTrue(bytes(IERC20Metadata(paymentToken).name()).length != 0);
        IERC20Metadata(paymentToken).totalSupply();
        IERC20Metadata(paymentToken).balanceOf(address(this));
    }
}
