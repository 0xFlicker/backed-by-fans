// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {RendererPreviewHarness} from "../src/RendererPreviewHarness.sol";

contract PreviewCandidate {
    uint256 public calls;

    function render(bytes calldata input) external returns (bytes memory) {
        ++calls;
        return input;
    }

    function failWithLargeReason() external pure {
        bytes memory reason = new bytes(4096);
        assembly ("memory-safe") {
            revert(add(reason, 0x20), mload(reason))
        }
    }
}

contract RendererPreviewHarnessTest is Test {
    RendererPreviewHarness private harness;

    function setUp() public {
        harness = new RendererPreviewHarness();
    }

    function test_createAndCallReturnsRawCandidateResult() public {
        bytes memory callData = abi.encodeCall(PreviewCandidate.render, (hex"c0ffee"));
        bytes memory result = harness.preview(type(PreviewCandidate).creationCode, callData);

        assertEq(abi.decode(result, (bytes)), hex"c0ffee");
    }

    function test_emptyCreationCodeIsRejected() public {
        vm.expectRevert(RendererPreviewHarness.EmptyCreationCode.selector);
        harness.preview("", hex"01");
    }

    function test_emptyCallDataIsRejected() public {
        vm.expectRevert(RendererPreviewHarness.EmptyCallData.selector);
        harness.preview(type(PreviewCandidate).creationCode, "");
    }

    function test_creationFailureIsReported() public {
        vm.expectRevert(RendererPreviewHarness.CandidateDeploymentFailed.selector);
        harness.preview(hex"60006000fd", hex"01");
    }

    function test_callFailureReasonIsBounded() public {
        bytes memory callData = abi.encodeCall(PreviewCandidate.failWithLargeReason, ());

        try harness.preview(type(PreviewCandidate).creationCode, callData) {
            fail("expected preview to revert");
        } catch (bytes memory reason) {
            assertLe(reason.length, harness.MAX_FAILURE_REASON_BYTES() + 100);
            bytes4 selector;
            assembly ("memory-safe") {
                selector := mload(add(reason, 0x20))
            }
            assertEq(selector, RendererPreviewHarness.CandidateCallFailed.selector);
        }
    }

    function test_ethCallRehearsalStateCanBeDiscarded() public {
        uint256 snapshot = vm.snapshotState();
        bytes memory callData = abi.encodeCall(PreviewCandidate.render, (hex"01"));
        assertEq(
            abi.decode(harness.preview(type(PreviewCandidate).creationCode, callData), (bytes)),
            hex"01"
        );
        assertTrue(vm.revertToState(snapshot));

        assertEq(
            abi.decode(harness.preview(type(PreviewCandidate).creationCode, callData), (bytes)),
            hex"01"
        );
    }
}
