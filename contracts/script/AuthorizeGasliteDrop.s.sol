// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {GasliteDrop} from "../src/GasliteDrop.sol";
import {
    IAirdropCreatorCollection,
    IAirdropTransferRegistry
} from "../src/interfaces/external/IAirdropTransferRegistry.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Creator-signed setup: copy all current registry lists and add only this helper.
/// @dev Does not disable the validator or change the collection's security level.
contract AuthorizeGasliteDrop is Script {
    address internal constant COLLECTION = 0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747;
    address internal constant REGISTRY = 0xA000027A9B2802E1ddf7000061001e5c005A0000;

    function run() external returns (uint120 listId) {
        require(block.chainid == 4663, "Robinhood mainnet only");
        address helper = vm.envAddress("AIRDROP_HELPER");
        require(
            keccak256(helper.code) == keccak256(type(GasliteDrop).runtimeCode),
            "Unexpected helper runtime"
        );
        IAirdropCreatorCollection collection = IAirdropCreatorCollection(COLLECTION);
        address creator = vm.envAddress("AIRDROP_CREATOR");
        require(collection.owner() == creator, "Sender must be the current collection owner");
        require(
            collection.getTransferValidator() == REGISTRY,
            "Transfer validator changed; review setup"
        );
        IAirdropTransferRegistry registry = IAirdropTransferRegistry(REGISTRY);
        address[] memory whitelist = registry.getWhitelistedAccountsByCollection(COLLECTION);
        address[] memory blacklist = registry.getBlacklistedAccountsByCollection(COLLECTION);
        address[] memory authorizers = registry.getAuthorizerAccountsByCollection(COLLECTION);

        vm.startBroadcast(creator);
        listId = registry.createList("Gentlemen Prefer Blondes - airdrop");
        if (whitelist.length > 0) registry.addAccountsToWhitelist(listId, whitelist);
        if (blacklist.length > 0) registry.addAccountsToBlacklist(listId, blacklist);
        if (authorizers.length > 0) registry.addAccountsToAuthorizers(listId, authorizers);
        registry.addAccountToWhitelist(listId, helper);
        registry.applyListToCollection(COLLECTION, listId);
        vm.stopBroadcast();
        console2.log("Creator-owned registry list", uint256(listId));
    }
}
