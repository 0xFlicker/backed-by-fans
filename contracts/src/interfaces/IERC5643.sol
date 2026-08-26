// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Subscription-NFT compatibility interface defined by ERC-5643.
interface IERC5643 {
    event SubscriptionUpdate(uint256 indexed tokenId, uint64 expiration);

    function renewSubscription(uint256 tokenId, uint64 duration) external payable;

    function cancelSubscription(uint256 tokenId) external payable;

    function expiresAt(uint256 tokenId) external view returns (uint64);

    function isRenewable(uint256 tokenId) external view returns (bool);
}
