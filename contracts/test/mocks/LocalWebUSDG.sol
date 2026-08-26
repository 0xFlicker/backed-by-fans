// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MockUSDG} from "./MockUSDG.sol";

/// @notice Local-Anvil-only USDG stand-in with metadata encoded in runtime code.
/// @dev The browser integration harness installs this runtime at the canonical mainnet address.
contract LocalWebUSDG is MockUSDG {
    error RecipientBlocked(address recipient);

    mapping(address recipient => bool blocked) public blockedRecipients;

    function name() public pure override returns (string memory) {
        return "Local USDG";
    }

    function symbol() public pure override returns (string memory) {
        return "USDG";
    }

    function setBlocked(address recipient, bool blocked) external {
        blockedRecipients[recipient] = blocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (to != address(0) && blockedRecipients[to]) revert RecipientBlocked(to);
        super._update(from, to, value);
    }
}
