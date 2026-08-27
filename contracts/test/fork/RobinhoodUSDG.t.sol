// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Test} from "forge-std/Test.sol";

import {
    DeployProtocol,
    IUSDGDeploymentTarget,
    ProtocolDeployment,
    RobinhoodDeploymentGuard
} from "../../script/DeployProtocol.s.sol";
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";

/// @notice Opt-in live fork gate for the exact officially published testnet USDG proxy.
contract RobinhoodUSDGForkTest is Test {
    function test_observedCanonicalTestnetUSDGSupportsProtocolWhenExplicitlyEnabled() public {
        if (!vm.envOr("RUN_ROBINHOOD_FORK_TESTS", false)) return;

        string memory rpcUrl = vm.envString("ROBINHOOD_TESTNET_RPC_URL");
        uint256 observationBlock = vm.envUint("USDG_OBSERVATION_BLOCK_NUMBER");
        vm.createSelectFork(rpcUrl, observationBlock);

        DeployProtocol deployment = new DeployProtocol();
        address paymentToken = deployment.ROBINHOOD_TESTNET_USDG();
        address protocolOwner = makeAddr("forkProtocolOwner");
        address feeRecipient = makeAddr("forkFeeRecipient");
        _assertCanonicalTokenState(deployment, paymentToken);
        deployment.validateInputs(protocolOwner, feeRecipient);

        (OnchainMetadataRenderer renderer, MembershipFactory factory) =
            deployment.deploy(protocolOwner, feeRecipient);

        assertEq(block.chainid, deployment.ROBINHOOD_TESTNET_CHAIN_ID());
        assertTrue(paymentToken.code.length != 0);
        assertTrue(address(renderer).code.length != 0);
        assertTrue(address(factory).code.length != 0);
        assertEq(address(factory.paymentToken()), paymentToken);
        assertEq(factory.owner(), protocolOwner);
        assertEq(factory.feeRecipient(), feeRecipient);
    }

    function test_observedGuardRejectsImplementationAndPauseDriftWhenExplicitlyEnabled() public {
        if (!vm.envOr("RUN_ROBINHOOD_FORK_TESTS", false)) return;

        string memory rpcUrl = vm.envString("ROBINHOOD_TESTNET_RPC_URL");
        uint256 observationBlock = vm.envUint("USDG_OBSERVATION_BLOCK_NUMBER");
        vm.createSelectFork(rpcUrl, observationBlock);

        DeployProtocol deployment = new DeployProtocol();
        address paymentToken = deployment.ROBINHOOD_TESTNET_USDG();
        address protocolOwner = makeAddr("driftProtocolOwner");
        address feeRecipient = makeAddr("driftFeeRecipient");
        bytes32 implementationSlot = deployment.EIP1967_IMPLEMENTATION_SLOT();
        bytes32 originalImplementation = vm.load(paymentToken, implementationSlot);
        address unreviewedImplementation = makeAddr("unreviewedImplementation");
        vm.etch(unreviewedImplementation, address(uint160(uint256(originalImplementation))).code);

        vm.store(
            paymentToken, implementationSlot, bytes32(uint256(uint160(unreviewedImplementation)))
        );
        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        deployment.validateInputs(protocolOwner, feeRecipient);

        vm.store(paymentToken, implementationSlot, originalImplementation);
        vm.mockCall(
            paymentToken,
            abi.encodeWithSelector(IUSDGDeploymentTarget.paused.selector),
            abi.encode(true)
        );
        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        deployment.validateInputs(protocolOwner, feeRecipient);
    }

    function _assertCanonicalTokenState(DeployProtocol deployment, address paymentToken)
        private
        view
    {
        assertEq(block.chainid, deployment.ROBINHOOD_TESTNET_CHAIN_ID());
        assertTrue(paymentToken.code.length != 0);
        assertEq(paymentToken.codehash, deployment.ROBINHOOD_TESTNET_USDG_PROXY_RUNTIME_CODE_HASH());
        assertEq(IERC20Metadata(paymentToken).symbol(), "USDG");
        assertEq(IERC20Metadata(paymentToken).decimals(), 6);
        assertTrue(bytes(IERC20Metadata(paymentToken).name()).length != 0);
        assertFalse(IUSDGDeploymentTarget(paymentToken).paused());
        IERC20Metadata(paymentToken).totalSupply();
        IERC20Metadata(paymentToken).balanceOf(address(this));

        address implementation = address(
            uint160(uint256(vm.load(paymentToken, deployment.EIP1967_IMPLEMENTATION_SLOT())))
        );
        assertEq(implementation, deployment.ROBINHOOD_TESTNET_USDG_IMPLEMENTATION());
        assertEq(
            implementation.codehash,
            deployment.ROBINHOOD_TESTNET_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH()
        );
    }
}
