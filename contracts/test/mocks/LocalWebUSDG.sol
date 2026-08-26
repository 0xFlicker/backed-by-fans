// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MockUSDG} from "./MockUSDG.sol";

/// @notice Local-Anvil-only USDG stand-in with metadata encoded in runtime code.
/// @dev The browser integration harness installs this runtime at the canonical mainnet address.
contract LocalWebUSDG is MockUSDG {
    function name() public pure override returns (string memory) {
        return "Local USDG";
    }

    function symbol() public pure override returns (string memory) {
        return "USDG";
    }
}
