// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {TestUSDG} from "../src/TestUSDG.sol";
import {Script} from "forge-std/Script.sol";

contract DeployTestUSDG is Script {
    function run() external returns (TestUSDG token) {
        require(block.chainid == 46_630, "Robinhood testnet only");
        vm.startBroadcast();
        token = new TestUSDG();
        vm.stopBroadcast();
    }
}
