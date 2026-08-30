// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {RobinhoodProtocolConfig} from "../src/RobinhoodProtocolConfig.sol";
import {TestnetUSDG} from "../src/TestnetUSDG.sol";

abstract contract TestnetUSDGGuard is Script {
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = RobinhoodProtocolConfig.TESTNET_CHAIN_ID;
    address public constant APPROVED_DEPLOYER = RobinhoodProtocolConfig.APPROVED_DEPLOYER;
    address public constant CREATE2_DEPLOYER = RobinhoodProtocolConfig.CREATE2_DEPLOYER;
    bytes32 public constant TESTNET_USDG_SALT = RobinhoodProtocolConfig.TESTNET_USDG_SALT;
    bytes32 public constant CREATE2_DEPLOYER_CODE_HASH =
        RobinhoodProtocolConfig.CREATE2_DEPLOYER_CODE_HASH;

    error CanonicalCreate2DeployerMismatch(bytes32 expected, bytes32 observed);
    error ExistingTokenCodeMismatch(bytes32 expected, bytes32 observed);
    error InvalidMintAmount();
    error InvalidRecipient();
    error TokenInvariantFailed();
    error UnexpectedChain(uint256 chainId);

    function expectedToken() public pure returns (address) {
        return RobinhoodProtocolConfig.testnetPaymentToken();
    }

    function _validateChain() internal view {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert UnexpectedChain(block.chainid);
    }

    function _validateCreate2Deployer() internal view {
        bytes32 observed = CREATE2_DEPLOYER.codehash;
        if (observed != CREATE2_DEPLOYER_CODE_HASH) {
            revert CanonicalCreate2DeployerMismatch(CREATE2_DEPLOYER_CODE_HASH, observed);
        }
    }

    function _validateToken(TestnetUSDG token, address expected) internal view {
        bytes32 expectedRuntimeCodeHash = keccak256(type(TestnetUSDG).runtimeCode);
        bytes32 observedRuntimeCodeHash = address(token).codehash;
        if (observedRuntimeCodeHash != expectedRuntimeCodeHash) {
            revert ExistingTokenCodeMismatch(expectedRuntimeCodeHash, observedRuntimeCodeHash);
        }
        if (
            address(token) != expected || token.owner() != APPROVED_DEPLOYER
                || token.decimals() != 6
                || keccak256(bytes(token.name())) != keccak256("LOL Dollar")
                || keccak256(bytes(token.symbol())) != keccak256("USDG")
        ) revert TokenInvariantFailed();
    }
}

/// @notice Direct CREATE2 deployment of the testnet-only USDG stand-in.
contract DeployTestnetUSDG is TestnetUSDGGuard {
    function run() external returns (TestnetUSDG token) {
        _validateChain();
        _validateCreate2Deployer();

        address expected = expectedToken();
        if (expected.code.length != 0) {
            token = TestnetUSDG(expected);
            _validateToken(token, expected);
            console2.log("Backed By Fans testnet USDG already deployed", expected);
            return token;
        }

        vm.startBroadcast();
        token = new TestnetUSDG{salt: TESTNET_USDG_SALT}();
        vm.stopBroadcast();

        _validateToken(token, expected);
        console2.log("Backed By Fans testnet USDG", address(token));
    }
}

/// @notice Read-only testnet USDG deployment status.
contract ValidateTestnetUSDG is TestnetUSDGGuard {
    function run() external view returns (TestnetUSDG token) {
        _validateChain();
        _validateCreate2Deployer();
        address expected = expectedToken();
        token = TestnetUSDG(expected);
        _validateToken(token, expected);
        console2.log("Backed By Fans testnet USDG", address(token));
        console2.log("LOL Dollar total supply", token.totalSupply());
    }
}
