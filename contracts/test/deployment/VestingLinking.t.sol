// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {LinkedVestingDeployment} from "../../script/LinkedVestingDeployment.sol";
import {RobinhoodProtocolConfig} from "../../src/RobinhoodProtocolConfig.sol";
import {VestingLedger} from "../../src/libraries/VestingLedger.sol";
import {Test} from "forge-std/Test.sol";

contract VestingLinkDeploymentHarness is LinkedVestingDeployment {
    function ensure() external {
        _ensureVestingLedger();
    }

    function validate() external view {
        _checkVestingLedger();
    }

    function expected() external view returns (address, bytes32, bytes memory, bytes32) {
        return _vestingDeployment();
    }
}

contract VestingLinkingTest is Test {
    VestingLinkDeploymentHarness private deployer;

    function setUp() public {
        vm.etch(
            RobinhoodProtocolConfig.CREATE2_DEPLOYER,
            hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"
        );
        deployer = new VestingLinkDeploymentHarness();
    }

    function test_preservedLeafDerivesExactConsumerLinkAndRuntime() public {
        (address expected,, bytes memory initCode, bytes32 runtimeHash) = deployer.expected();
        assertEq(expected, address(VestingLedger));
        deployer.ensure();
        assertEq(expected.codehash, runtimeHash);
        assertLe(initCode.length + 32, 95_000);
        assertLe(initCode.length, 196_608);
        assertLe(expected.code.length, 98_304);
        emit log_named_uint("preserved leaf creation bytes", initCode.length);
        emit log_named_uint("preserved leaf runtime bytes", expected.code.length);
        deployer.validate();
    }

    function test_rejectsExistingWrongRuntime() public {
        (address expected,,,) = deployer.expected();
        vm.etch(expected, hex"00");
        vm.expectRevert(LinkedVestingDeployment.InvalidVestingLink.selector);
        deployer.ensure();
    }
}
