// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Native wrapping surface from the verified aeWETH implementation.
/// @dev Provenance: external/verification/4663/sources.json, weth-implementation.
interface IWrappedNative {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
