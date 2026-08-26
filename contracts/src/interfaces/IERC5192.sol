// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Minimal soulbound-token interface defined by ERC-5192.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    /// @notice Returns whether an existing token is locked against transfer.
    function locked(uint256 tokenId) external view returns (bool);
}
