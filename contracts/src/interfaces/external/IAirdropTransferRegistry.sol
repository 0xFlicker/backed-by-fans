// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @dev Narrow interface for OpenSea's StrictAuthorizedTransferSecurityRegistry.
/// Reference: https://docs.opensea.io/docs/creator-fee-enforcement
interface IAirdropTransferRegistry {
    function isAccountWhitelistedByCollection(address collection, address account)
        external
        view
        returns (bool);
    function createList(string calldata name) external returns (uint120);
    function getWhitelistedAccountsByCollection(address collection)
        external
        view
        returns (address[] memory);
    function getBlacklistedAccountsByCollection(address collection)
        external
        view
        returns (address[] memory);
    function getAuthorizerAccountsByCollection(address collection)
        external
        view
        returns (address[] memory);
    function addAccountsToWhitelist(uint120 id, address[] calldata accounts) external;
    function addAccountsToBlacklist(uint120 id, address[] calldata accounts) external;
    function addAccountsToAuthorizers(uint120 id, address[] calldata accounts) external;
    function addAccountToWhitelist(uint120 id, address account) external;
    function applyListToCollection(address collection, uint120 id) external;
}

interface IAirdropCreatorCollection {
    function owner() external view returns (address);
    function getTransferValidator() external view returns (address);
}
