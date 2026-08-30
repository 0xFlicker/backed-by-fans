// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {console2} from "forge-std/console2.sol";

import {TestnetUSDG} from "../src/TestnetUSDG.sol";
import {TestnetUSDGGuard} from "./TestnetUSDG.s.sol";

/// @notice Mints exact base units of testnet USDG to an address using the encrypted deployer.
/// @dev Kept in a separate script so mint broadcasts cannot replace the deployment
///      run-latest.json consumed by Wagmi CLI's Foundry plugin.
contract MintTestnetUSDG is TestnetUSDGGuard {
    function run() external returns (uint256 mintedAmount) {
        _validateChain();
        address expected = expectedToken();
        TestnetUSDG token = TestnetUSDG(expected);
        _validateToken(token, expected);

        address recipient = vm.envAddress("USDG_RECIPIENT");
        mintedAmount = vm.envUint("USDG_AMOUNT");
        if (recipient == address(0)) revert InvalidRecipient();
        if (mintedAmount == 0) revert InvalidMintAmount();

        uint256 balanceBefore = token.balanceOf(recipient);
        vm.startBroadcast();
        token.mint(recipient, mintedAmount);
        vm.stopBroadcast();
        uint256 balanceAfter = token.balanceOf(recipient);
        if (balanceAfter != balanceBefore + mintedAmount) {
            revert TokenInvariantFailed();
        }

        console2.log("USDG recipient", recipient);
        console2.log("USDG minted base units", mintedAmount);
        console2.log("USDG recipient balance", balanceAfter);
    }
}
