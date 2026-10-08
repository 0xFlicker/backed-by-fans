// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {GasliteDrop} from "../src/GasliteDrop.sol";
import {Script} from "forge-std/Script.sol";

contract DeployGasliteDrop is Script {
    function run() external returns (GasliteDrop helper) {
        require(block.chainid == 4663, "Robinhood mainnet only");
        vm.startBroadcast();
        helper = new GasliteDrop();
        vm.stopBroadcast();
    }
}
