// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC721Airdrop} from "../src/ERC721Airdrop.sol";
import {Script} from "forge-std/Script.sol";

contract DeployERC721Airdrop is Script {
    function run() external returns (ERC721Airdrop helper) {
        require(block.chainid == 4663, "Robinhood mainnet only");
        vm.startBroadcast();
        helper = new ERC721Airdrop();
        vm.stopBroadcast();
    }
}
