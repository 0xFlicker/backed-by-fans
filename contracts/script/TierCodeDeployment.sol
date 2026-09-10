// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ImmutableCodeStore} from "../src/ImmutableCodeStore.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {RobinhoodProtocolConfig} from "../src/RobinhoodProtocolConfig.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingDeployment} from "./LinkedVestingDeployment.sol";

/// @dev Build-time only: never imported by the factory or tier deployer.
library TierCodeBuild {
    function salt(bool second) internal pure returns (bytes32) {
        return keccak256(
            bytes(second ? "Backed By Fans tier code B v1" : "Backed By Fans tier code A v1")
        );
    }

    function chunk(bool second) internal pure returns (bytes memory result) {
        bytes memory code = type(MembershipTier).creationCode;
        uint256 firstLength = code.length / 2;
        uint256 offset = second ? firstLength : 0;
        uint256 length = second ? code.length - firstLength : firstLength;
        result = new bytes(length);
        assembly ("memory-safe") { mcopy(add(result, 32), add(add(code, 32), offset), length) }
    }

    function initCode(bool second) internal pure returns (bytes memory) {
        return abi.encodePacked(type(ImmutableCodeStore).creationCode, abi.encode(chunk(second)));
    }

    function configuration() internal pure returns (MembershipTypes.TierCodeConfig memory) {
        return MembershipTypes.TierCodeConfig(
            RobinhoodProtocolConfig.create2Address(salt(false), keccak256(initCode(false))),
            RobinhoodProtocolConfig.create2Address(salt(true), keccak256(initCode(true))),
            type(MembershipTier).creationCode.length,
            keccak256(type(MembershipTier).creationCode)
        );
    }
}

abstract contract TierCodeDeployment is LinkedVestingDeployment {
    error InvalidTierCodeDeployment();

    function tierCodeConfiguration() public pure returns (MembershipTypes.TierCodeConfig memory) {
        return TierCodeBuild.configuration();
    }

    function tierCodeInitCode(bool second) public pure returns (bytes memory) {
        return TierCodeBuild.initCode(second);
    }

    function tierCodeSalt(bool second) public pure returns (bytes32) {
        return TierCodeBuild.salt(second);
    }

    function _ensureTierCodeStores()
        internal
        returns (MembershipTypes.TierCodeConfig memory config)
    {
        _ensureVestingLedger();
        config = tierCodeConfiguration();
        for (uint256 i; i < 2; ++i) {
            address target = i == 0 ? config.storeA : config.storeB;
            if (target.code.length == 0) {
                if (
                    RobinhoodProtocolConfig.CREATE2_DEPLOYER.codehash
                        != RobinhoodProtocolConfig.CREATE2_DEPLOYER_CODE_HASH
                ) {
                    revert InvalidTierCodeDeployment();
                }
                (bool success,) = RobinhoodProtocolConfig.CREATE2_DEPLOYER
                    .call(
                        abi.encodePacked(TierCodeBuild.salt(i != 0), TierCodeBuild.initCode(i != 0))
                    );
                if (!success) revert InvalidTierCodeDeployment();
            }
        }
        _checkTierCodeStores();
    }

    function _checkTierCodeStores() internal view {
        MembershipTypes.TierCodeConfig memory config = tierCodeConfiguration();
        if (
            config.storeA.codehash
                    != keccak256(abi.encodePacked(hex"00", TierCodeBuild.chunk(false)))
                || config.storeB.codehash
                    != keccak256(abi.encodePacked(hex"00", TierCodeBuild.chunk(true)))
        ) {
            revert InvalidTierCodeDeployment();
        }
    }
}
