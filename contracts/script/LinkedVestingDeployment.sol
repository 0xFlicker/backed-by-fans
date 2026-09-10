// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {RobinhoodProtocolConfig} from "../src/RobinhoodProtocolConfig.sol";
import {VestingLedger} from "../src/libraries/VestingLedger.sol";
import {Script} from "forge-std/Script.sol";

/// @notice Deployment-only checks for the independently built immutable library.
abstract contract LinkedVestingDeployment is Script {
    error InvalidVestingLink();

    function _vestingDeployment()
        internal
        view
        returns (address expected, bytes32 salt, bytes memory initCode, bytes32 runtimeHash)
    {
        // Read only the bytecode. Copying the full compiler JSON into script EVM
        // memory repeatedly makes verification consume the deployment gas budget.
        string memory artifact = "out/vesting-leaf/VestingLedger.sol/VestingLedger.json";
        initCode = vm.getCode(artifact);
        bytes memory runtime = vm.getDeployedCode(artifact);
        salt = keccak256("Backed By Fans vesting ledger v1");
        expected = RobinhoodProtocolConfig.create2Address(salt, keccak256(initCode));
        if (expected != address(VestingLedger) || runtime.length < 21 || runtime[0] != 0x73) {
            revert InvalidVestingLink();
        }
        for (uint256 i; i < 20; ++i) {
            if (runtime[i + 1] != 0) revert InvalidVestingLink();
            runtime[i + 1] = bytes20(expected)[i];
        }
        runtimeHash = keccak256(runtime);
    }

    function _ensureVestingLedger() internal {
        (address expected, bytes32 salt, bytes memory initCode, bytes32 runtimeHash) =
            _vestingDeployment();
        if (expected.code.length == 0) {
            if (
                RobinhoodProtocolConfig.CREATE2_DEPLOYER.codehash
                    != RobinhoodProtocolConfig.CREATE2_DEPLOYER_CODE_HASH
            ) {
                revert InvalidVestingLink();
            }
            (bool success,) =
                RobinhoodProtocolConfig.CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
            if (!success) revert InvalidVestingLink();
        }
        if (expected.codehash != runtimeHash) revert InvalidVestingLink();
    }

    function _checkVestingLedger() internal view {
        (address expected,,, bytes32 runtimeHash) = _vestingDeployment();
        if (expected.codehash != runtimeHash) revert InvalidVestingLink();
    }
}
