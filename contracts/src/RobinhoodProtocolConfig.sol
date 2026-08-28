// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {RobinhoodProtocolDeploymentAuthority} from "./RobinhoodProtocolDeploymentAuthority.sol";

/// @notice Compile-time public deployment configuration shared by scripts and creation code.
library RobinhoodProtocolConfig {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint256 internal constant TESTNET_CHAIN_ID = 46_630;
    address internal constant MAINNET_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant TESTNET_USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    address internal constant INITIAL_PROTOCOL_AUTHORITY =
        RobinhoodProtocolDeploymentAuthority.INITIAL_PROTOCOL_AUTHORITY;
    address internal constant SAFE_L2_SINGLETON = 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e;

    error UnsupportedRobinhoodChain(uint256 chainId);

    function canonicalPaymentToken() internal view returns (IERC20) {
        if (block.chainid == MAINNET_CHAIN_ID) return IERC20(MAINNET_USDG);
        if (block.chainid == TESTNET_CHAIN_ID) return IERC20(TESTNET_USDG);
        revert UnsupportedRobinhoodChain(block.chainid);
    }
}
