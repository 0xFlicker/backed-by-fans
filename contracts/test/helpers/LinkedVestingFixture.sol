// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {TierCodeDeployment} from "../../script/TierCodeDeployment.sol";
import {RobinhoodProtocolConfig} from "../../src/RobinhoodProtocolConfig.sol";

/// @dev Local-test deployment of the preserved leaf through the canonical CREATE2 runtime.
/// No production library runtime is mocked; the deployment guard checks its exact hash.
contract LinkedVestingFixture is TierCodeDeployment {
    function install() external {
        vm.etch(
            RobinhoodProtocolConfig.CREATE2_DEPLOYER,
            hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
        );
        _ensureTierCodeStores();
    }
}
