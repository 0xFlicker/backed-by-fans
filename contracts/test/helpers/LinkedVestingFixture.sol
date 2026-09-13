// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {TierImplementationDeployment} from "../../script/TierImplementationDeployment.sol";
import {RobinhoodProtocolConfig} from "../../src/RobinhoodProtocolConfig.sol";
import {MembershipCloneFixture} from "./MembershipTestConfig.sol";

/// @dev Local-test deployment of the preserved leaf through the canonical CREATE2 runtime.
/// No production library runtime is mocked; the deployment guard checks its exact hash.
contract LinkedVestingFixture is TierImplementationDeployment {
    function install() external {
        vm.etch(
            RobinhoodProtocolConfig.CREATE2_DEPLOYER,
            hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
        );
        _ensureTierImplementation();
        vm.etch(address(0xBBF005), type(MembershipCloneFixture).runtimeCode);
    }
}
