// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Exact reads and integrity checks for STOP-prefixed immutable code stores.
library CodeStoreReader {
    error CodeStoreDigestMismatch(address store, bytes32 expected, bytes32 actual);
    error CodeStoreHashMismatch(address store, bytes32 expected, bytes32 actual);
    error CodeStoreLengthMismatch(address store, uint256 expected, uint256 actual);
    error CodeStorePrefixMismatch(address store, bytes1 actual);
    error InvalidCodeStore(address store);

    /// @notice Reads a snapshotted store after checking its runtime size and code hash.
    /// @dev The trusted hash covers the STOP prefix. Full digest validation belongs at admission.
    function read(address store, uint32 payloadLength, bytes32 expectedCodehash)
        internal
        view
        returns (bytes memory payload)
    {
        if (store == address(0)) revert InvalidCodeStore(store);

        uint256 actualCodeSize;
        bytes32 actualCodehash;
        assembly ("memory-safe") {
            actualCodeSize := extcodesize(store)
            actualCodehash := extcodehash(store)
        }
        if (actualCodeSize == 0) revert InvalidCodeStore(store);

        uint256 expectedCodeSize = uint256(payloadLength) + 1;
        if (actualCodeSize != expectedCodeSize) {
            revert CodeStoreLengthMismatch(store, expectedCodeSize, actualCodeSize);
        }
        if (actualCodehash != expectedCodehash) {
            revert CodeStoreHashMismatch(store, expectedCodehash, actualCodehash);
        }

        payload = new bytes(payloadLength);
        bytes memory prefix = new bytes(1);
        assembly ("memory-safe") {
            extcodecopy(store, add(prefix, 0x20), 0, 1)
            extcodecopy(store, add(payload, 0x20), 1, payloadLength)
        }
        if (prefix[0] != 0) revert CodeStorePrefixMismatch(store, prefix[0]);
    }

    /// @notice Performs the full runtime, prefix, and payload validation used at trust boundaries.
    function readAndValidate(
        address store,
        uint32 payloadLength,
        bytes32 expectedDigest,
        bytes32 expectedCodehash
    ) internal view returns (bytes memory payload) {
        payload = read(store, payloadLength, expectedCodehash);
        bytes32 actualDigest = keccak256(payload);
        if (actualDigest != expectedDigest) {
            revert CodeStoreDigestMismatch(store, expectedDigest, actualDigest);
        }
    }
}
