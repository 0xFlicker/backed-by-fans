// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @dev Narrow interface for OpenSea's StrictAuthorizedTransferSecurityRegistry.
/// Reference: https://docs.opensea.io/docs/creator-fee-enforcement
interface IAirdropTransferRegistry {
    // OpenSea StrictAuthorizedTransferSecurityRegistry's public interface.
    // https://robinhoodchain.blockscout.com/address/0xA000027A9B2802E1ddf7000061001e5c005A0000
    event CreatedList(uint256 indexed id, string name);
    event AppliedListToCollection(address indexed collection, uint120 indexed id);
    error StrictAuthorizedTransferSecurityRegistry__UnauthorizedTransfer();
    error StrictAuthorizedTransferSecurityRegistry__CallerMustBeWhitelistedOperator();

    struct CollectionSecurityPolicy {
        uint8 transferSecurityLevel;
        uint120 operatorWhitelistId;
        uint120 permittedContractReceiversId;
    }
    function getCollectionSecurityPolicy(address collection)
        external
        view
        returns (CollectionSecurityPolicy memory);
    function createListCopy(string calldata name, uint120 sourceListId) external returns (uint120);
    function listOwners(uint120 id) external view returns (address);
    function getWhitelistedAccounts(uint120 id) external view returns (address[] memory);
    function getBlacklistedAccounts(uint120 id) external view returns (address[] memory);
    function getAuthorizerAccounts(uint120 id) external view returns (address[] memory);
    function validateTransfer(address caller, address from, address to) external view;
    function validateTransfer(address caller, address from, address to, uint256 tokenId)
        external
        view;
    function applyCollectionTransferPolicy(address caller, address from, address to) external view;
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
    function getTransferValidationFunction()
        external
        view
        returns (bytes4 functionSignature, bool isViewFunction);
}
