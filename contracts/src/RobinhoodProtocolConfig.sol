// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import {OnchainMetadataRenderer} from "./OnchainMetadataRenderer.sol";
import {RendererPreviewHarness} from "./RendererPreviewHarness.sol";
import {RobinhoodProtocolAuthority} from "./RobinhoodProtocolAuthority.sol";
import {OnchainMediaStoreFactory} from "./media/OnchainMediaStoreFactory.sol";

/// @notice Compile-time public deployment configuration shared by scripts and creation code.
library RobinhoodProtocolConfig {
    uint256 internal constant MAINNET_CHAIN_ID = 4663;
    uint256 internal constant TESTNET_CHAIN_ID = 46_630;
    address internal constant MAINNET_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant TESTNET_USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    address internal constant TESTNET_AMD = 0x71178BAc73cBeb415514eB542a8995b82669778d;
    address internal constant TESTNET_NFLX = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;
    address internal constant TESTNET_PLTR = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;
    address internal constant TESTNET_AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address internal constant TESTNET_TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 internal constant CREATE2_DEPLOYER_CODE_HASH =
        0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989;
    bytes32 internal constant MEDIA_STORE_FACTORY_SALT =
        keccak256("Backed By Fans media store factory v4");
    bytes32 internal constant INITIAL_RENDERER_SALT = keccak256("Backed By Fans renderer v4");
    bytes32 internal constant PREVIEW_HARNESS_SALT =
        keccak256("Backed By Fans renderer preview harness v1");
    bytes32 internal constant FACTORY_SALT = keccak256("Backed By Fans factory v6");
    address internal constant APPROVED_DEPLOYER = RobinhoodProtocolAuthority.APPROVED_DEPLOYER;
    address internal constant INITIAL_PROTOCOL_AUTHORITY =
        RobinhoodProtocolAuthority.INITIAL_PROTOCOL_AUTHORITY;
    address internal constant SAFE_L2_SINGLETON = 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e;

    error UnsupportedRobinhoodChain(uint256 chainId);

    function initialPaymentTokens() internal view returns (IERC20[] memory tokens) {
        if (block.chainid == MAINNET_CHAIN_ID) {
            tokens = new IERC20[](1);
            tokens[0] = IERC20(MAINNET_USDG);
            return tokens;
        }
        if (block.chainid == TESTNET_CHAIN_ID) {
            tokens = new IERC20[](6);
            tokens[0] = IERC20(TESTNET_USDG);
            tokens[1] = IERC20(TESTNET_AMD);
            tokens[2] = IERC20(TESTNET_NFLX);
            tokens[3] = IERC20(TESTNET_PLTR);
            tokens[4] = IERC20(TESTNET_AMZN);
            tokens[5] = IERC20(TESTNET_TSLA);
            return tokens;
        }
        revert UnsupportedRobinhoodChain(block.chainid);
    }

    function initialRenderer() internal pure returns (address) {
        return create2Address(
            INITIAL_RENDERER_SALT, keccak256(type(OnchainMetadataRenderer).creationCode)
        );
    }

    function mediaStoreFactory() internal pure returns (address) {
        return create2Address(
            MEDIA_STORE_FACTORY_SALT, keccak256(type(OnchainMediaStoreFactory).creationCode)
        );
    }

    function previewHarness() internal pure returns (address) {
        return
            create2Address(
                PREVIEW_HARNESS_SALT, keccak256(type(RendererPreviewHarness).creationCode)
            );
    }

    function create2Address(bytes32 salt, bytes32 initCodeHash) internal pure returns (address) {
        return Create2.computeAddress(salt, initCodeHash, CREATE2_DEPLOYER);
    }
}
