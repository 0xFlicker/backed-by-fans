// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ExpirationSchedule} from "../src/libraries/ExpirationSchedule.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {Test} from "forge-std/Test.sol";

contract ExpirationScheduleTest is Test {
    using ExpirationSchedule for ExpirationSchedule.State;
    ExpirationSchedule.State private schedule;

    function test_equalTimeOrderedByTokenAndRemovalPreservesIndex() public {
        schedule.set(9, 100);
        schedule.set(2, 100);
        schedule.set(4, 99);
        assertEq(schedule.peek().tokenId, 4);
        assertTrue(schedule.remove(4));
        assertEq(schedule.peek().tokenId, 2);
        assertTrue(schedule.remove(2));
        assertEq(schedule.peek().tokenId, 9);
        assertTrue(schedule.remove(9));
        assertEq(schedule.peek().tokenId, 0);
        assertFalse(schedule.remove(9));
        assertEq(schedule.nodes.length, 0);
    }

    function test_reschedulingReplacesOneNodeInBothDirections() public {
        schedule.set(1, 100);
        schedule.set(2, 200);
        schedule.set(3, 300);
        schedule.set(3, 50);
        assertEq(schedule.peek().tokenId, 3);
        schedule.set(3, 400);
        assertEq(schedule.peek().tokenId, 1);
        for (uint64 i = 1; i <= 100; ++i) {
            schedule.set(2, i);
        }
        assertEq(schedule.nodes.length, 3);
        assertEq(schedule.peek().tokenId, 1);
        _assertHeap();
    }

    function test_invalidIdentityOrTimestampRejected() public {
        vm.expectRevert(ExpirationSchedule.InvalidExpiration.selector);
        this.set(0, 1);
        vm.expectRevert(ExpirationSchedule.InvalidExpiration.selector);
        this.set(1, 0);
    }

    function set(uint256 id, uint64 timestamp) external {
        schedule.set(id, timestamp);
    }

    function testFuzz_indexedHeapMatchesScan(uint256 seed) public {
        uint64[33] memory expected;
        for (uint256 step; step < 128; ++step) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 id = 1 + seed % 32;
            if ((seed >> 16) % 3 == 0) {
                assertEq(schedule.remove(id), expected[id] != 0);
                expected[id] = 0;
            } else {
                uint64 timestamp = uint64(1 + (seed >> 32) % 1000);
                expected[id] = timestamp;
                schedule.set(id, timestamp);
            }
            uint256 minimum;
            uint256 count;
            for (uint256 i = 1; i <= 32; ++i) {
                if (expected[i] == 0) continue;
                ++count;
                if (minimum == 0 || expected[i] < expected[minimum]) minimum = i;
            }
            assertEq(schedule.peek().tokenId, minimum);
            assertEq(schedule.nodes.length, count);
            _assertHeap();
        }
    }

    function _assertHeap() private view {
        for (uint256 i; i < schedule.nodes.length; ++i) {
            MembershipTypes.ExpirationNode memory node = schedule.nodes[i];
            assertEq(schedule.position[node.tokenId], i + 1);
            if (i == 0) continue;
            MembershipTypes.ExpirationNode memory parent = schedule.nodes[(i - 1) / 2];
            assertTrue(
                parent.timestamp < node.timestamp
                    || (parent.timestamp == node.timestamp && parent.tokenId < node.tokenId)
            );
        }
    }
}
