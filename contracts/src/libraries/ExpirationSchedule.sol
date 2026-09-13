// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice One indexed expiration per extant membership, ordered by time then token ID.
library ExpirationSchedule {
    struct State {
        MembershipTypes.ExpirationNode[] nodes;
        mapping(uint256 => uint256) position;
    }

    error InvalidExpiration();

    function peek(State storage self)
        internal
        view
        returns (MembershipTypes.ExpirationNode memory node)
    {
        if (self.nodes.length != 0) node = self.nodes[0];
    }

    function set(State storage self, uint256 tokenId, uint64 timestamp) internal {
        if (tokenId == 0 || timestamp == 0) revert InvalidExpiration();
        MembershipTypes.ExpirationNode memory node =
            MembershipTypes.ExpirationNode(timestamp, tokenId);
        uint256 position = self.position[tokenId];
        if (position == 0) {
            self.nodes.push();
            _up(self, self.nodes.length - 1, node);
        } else {
            uint256 index = position - 1;
            if (index != 0 && _less(node, self.nodes[(index - 1) / 2])) _up(self, index, node);
            else _down(self, index, node);
        }
    }

    function remove(State storage self, uint256 tokenId) internal returns (bool) {
        uint256 position = self.position[tokenId];
        if (position == 0) return false;
        uint256 index = position - 1;
        MembershipTypes.ExpirationNode memory last = self.nodes[self.nodes.length - 1];
        self.nodes.pop();
        delete self.position[tokenId];
        if (index < self.nodes.length) {
            if (index != 0 && _less(last, self.nodes[(index - 1) / 2])) _up(self, index, last);
            else _down(self, index, last);
        }
        return true;
    }

    function _less(MembershipTypes.ExpirationNode memory a, MembershipTypes.ExpirationNode memory b)
        private
        pure
        returns (bool)
    {
        return a.timestamp < b.timestamp || (a.timestamp == b.timestamp && a.tokenId < b.tokenId);
    }

    function _place(State storage self, uint256 index, MembershipTypes.ExpirationNode memory node)
        private
    {
        self.nodes[index] = node;
        self.position[node.tokenId] = index + 1;
    }

    function _up(State storage self, uint256 index, MembershipTypes.ExpirationNode memory node)
        private
    {
        while (index != 0) {
            uint256 parent = (index - 1) / 2;
            if (!_less(node, self.nodes[parent])) break;
            _place(self, index, self.nodes[parent]);
            index = parent;
        }
        _place(self, index, node);
    }

    function _down(State storage self, uint256 index, MembershipTypes.ExpirationNode memory node)
        private
    {
        uint256 length = self.nodes.length;
        while (index * 2 + 1 < length) {
            uint256 child = index * 2 + 1;
            if (child + 1 < length && _less(self.nodes[child + 1], self.nodes[child])) ++child;
            if (!_less(self.nodes[child], node)) break;
            _place(self, index, self.nodes[child]);
            index = child;
        }
        _place(self, index, node);
    }
}
