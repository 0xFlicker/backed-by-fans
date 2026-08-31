// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Executes undeployed renderer initcode and one exact call for RPC-only visual previews.
/// @dev The function is intentionally non-view because CREATE is allowed during eth_call. Nodes
///      discard the candidate and all state after simulation.
contract RendererPreviewHarness {
    uint256 public constant MAX_FAILURE_REASON_BYTES = 2048;

    error CandidateDeploymentFailed();
    error CandidateCallFailed(bytes reason);
    error EmptyCreationCode();
    error EmptyCallData();

    function preview(bytes calldata creationCode, bytes calldata rendererCallData)
        external
        returns (bytes memory rendererResult)
    {
        if (creationCode.length == 0) revert EmptyCreationCode();
        if (rendererCallData.length == 0) revert EmptyCallData();

        address candidate;
        bytes memory initCode = creationCode;
        assembly ("memory-safe") {
            candidate := create(0, add(initCode, 0x20), mload(initCode))
        }
        if (candidate == address(0)) revert CandidateDeploymentFailed();

        (bool success, bytes memory result) = candidate.call(rendererCallData);
        if (!success) revert CandidateCallFailed(_bounded(result));
        return result;
    }

    function _bounded(bytes memory input) private pure returns (bytes memory output) {
        uint256 length = input.length;
        if (length <= MAX_FAILURE_REASON_BYTES) return input;

        output = new bytes(MAX_FAILURE_REASON_BYTES);
        assembly ("memory-safe") {
            mcopy(add(output, 0x20), add(input, 0x20), 2048)
        }
    }
}
