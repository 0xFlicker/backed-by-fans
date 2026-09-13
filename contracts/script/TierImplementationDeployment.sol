// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {RobinhoodProtocolConfig} from "../src/RobinhoodProtocolConfig.sol";
import {LinkedVestingDeployment} from "./LinkedVestingDeployment.sol";

/// @dev Build-time deployment inputs; never embedded in the membership factory.
library TierImplementationBuild {
    function salt() internal pure returns (bytes32) {
        return keccak256("Backed By Fans tier implementation v1");
    }

    function initCode() internal pure returns (bytes memory) {
        return type(MembershipTier).creationCode;
    }

    function implementation() internal pure returns (address) {
        return RobinhoodProtocolConfig.create2Address(salt(), keccak256(initCode()));
    }
}

abstract contract TierImplementationDeployment is LinkedVestingDeployment {
    error InvalidTierImplementationDeployment();

    function tierImplementation() public pure returns (address) {
        return TierImplementationBuild.implementation();
    }

    function tierImplementationInitCode() public pure returns (bytes memory) {
        return TierImplementationBuild.initCode();
    }

    function tierImplementationSalt() public pure returns (bytes32) {
        return TierImplementationBuild.salt();
    }

    function _ensureTierImplementation() internal returns (address target) {
        _ensureVestingLedger();
        target = tierImplementation();
        if (target.code.length == 0) {
            if (
                RobinhoodProtocolConfig.CREATE2_DEPLOYER.codehash
                    != RobinhoodProtocolConfig.CREATE2_DEPLOYER_CODE_HASH
            ) {
                revert InvalidTierImplementationDeployment();
            }
            (bool success,) = RobinhoodProtocolConfig.CREATE2_DEPLOYER
                .call(
                    abi.encodePacked(
                        TierImplementationBuild.salt(), TierImplementationBuild.initCode()
                    )
                );
            if (!success) revert InvalidTierImplementationDeployment();
        }
        _checkTierImplementation();
    }

    function _checkTierImplementation() internal view {
        if (tierImplementation().codehash != keccak256(type(MembershipTier).runtimeCode)) {
            revert InvalidTierImplementationDeployment();
        }
    }
}
