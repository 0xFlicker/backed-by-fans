// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {CreateRobinhoodSafe, ISafeL2, ISafeProxy} from "../../script/CreateSafe.s.sol";

contract CreateRobinhoodSafeHarness is CreateRobinhoodSafe {
    function createForTest(address owner, uint256 saltNonce) external returns (address safe) {
        validatePublicInputs(owner);
        validateMainnetConfirmation(0);

        address expectedSafe = predictSafeAddress(owner, saltNonce);
        if (expectedSafe.code.length != 0) {
            _validateCreatedSafe(expectedSafe, owner);
            return expectedSafe;
        }

        safe = _create(owner, saltNonce);
        if (safe != expectedSafe) revert SafeAddressMismatch(expectedSafe, safe);
        _validateCreatedSafe(safe, owner);
    }
}

/// @notice Opt-in integration gate against Safe's canonical Robinhood testnet contracts.
contract RobinhoodSafeForkTest is Test {
    function test_createsAndValidatesSafeV150L2WhenExplicitlyEnabled() public {
        if (!vm.envOr("RUN_ROBINHOOD_FORK_TESTS", false)) {
            vm.skip(true, "set RUN_ROBINHOOD_FORK_TESTS=true");
        }

        string memory rpcUrl = vm.envString("ROBINHOOD_TESTNET_RPC_URL");
        vm.createSelectFork(rpcUrl);

        CreateRobinhoodSafeHarness creation = new CreateRobinhoodSafeHarness();
        address deployer = creation.APPROVED_DEPLOYER();
        assertEq(
            creation.predictSafeAddress(deployer, uint256(creation.SAFE_SALT())),
            0xeAA4B38A99f766117C1D493a21012fec25f70505
        );

        uint256 l2EventSalt = uint256(keccak256("Backed By Fans L2 factory event test"));
        bytes memory initializer = creation.safeInitializer(deployer);
        vm.recordLogs();
        address l2EventSafe = creation.createForTest(deployer, l2EventSalt);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        _assertProxyCreationL2(
            logs,
            l2EventSafe,
            creation.SAFE_L2_SINGLETON(),
            initializer,
            l2EventSalt,
            creation.SAFE_PROXY_FACTORY()
        );

        uint256 saltNonce = uint256(creation.SAFE_SALT());
        address predicted = creation.predictSafeAddress(deployer, saltNonce);
        address safe =
            predicted.code.length == 0 ? creation.createForTest(deployer, saltNonce) : predicted;

        assertEq(block.chainid, creation.ROBINHOOD_TESTNET_CHAIN_ID());
        assertEq(safe, predicted);
        assertEq(ISafeProxy(safe).masterCopy(), creation.SAFE_L2_SINGLETON());
        assertEq(ISafeL2(safe).VERSION(), "1.5.0");
        assertEq(ISafeL2(safe).getOwners(), _oneAddress(deployer));
        assertEq(ISafeL2(safe).getThreshold(), 1);
        assertEq(ISafeL2(safe).nonce(), 0);
        assertEq(creation.run(), safe);
    }

    function _oneAddress(address value) private pure returns (address[] memory values) {
        values = new address[](1);
        values[0] = value;
    }

    function _assertProxyCreationL2(
        Vm.Log[] memory logs,
        address proxy,
        address singleton,
        bytes memory initializer,
        uint256 saltNonce,
        address factory
    ) private pure {
        bytes32 signature = keccak256("ProxyCreationL2(address,address,bytes,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == factory && logs[i].topics.length == 2
                    && logs[i].topics[0] == signature
                    && address(uint160(uint256(logs[i].topics[1]))) == proxy
            ) {
                (
                    address observedSingleton,
                    bytes memory observedInitializer,
                    uint256 observedSalt
                ) = abi.decode(logs[i].data, (address, bytes, uint256));
                assert(observedSingleton == singleton);
                assert(keccak256(observedInitializer) == keccak256(initializer));
                assert(observedSalt == saltNonce);
                return;
            }
        }
        revert("ProxyCreationL2 event missing");
    }
}
