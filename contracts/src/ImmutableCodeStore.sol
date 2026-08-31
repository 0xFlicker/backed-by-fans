// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Immutable contract-code storage with a non-executable STOP prefix.
contract ImmutableCodeStore {
    uint256 internal constant MAX_PAYLOAD_BYTES = 98_303;

    error PayloadTooLarge(uint256 length, uint256 maximum);

    constructor(bytes memory payload) {
        if (payload.length > MAX_PAYLOAD_BYTES) {
            revert PayloadTooLarge(payload.length, MAX_PAYLOAD_BYTES);
        }
        assembly ("memory-safe") {
            let length := mload(payload)
            let start := add(payload, 0x1f)
            mstore8(start, 0)
            return(start, add(length, 1))
        }
    }
}
