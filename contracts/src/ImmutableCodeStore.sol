// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Immutable contract-code storage with a non-executable STOP prefix.
contract ImmutableCodeStore {
    constructor(bytes memory payload) {
        assembly ("memory-safe") {
            let length := mload(payload)
            let start := add(payload, 0x1f)
            mstore8(start, 0)
            return(start, add(length, 1))
        }
    }
}
