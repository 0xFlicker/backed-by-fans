// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {
    DeployLocalProtocol,
    DeployProtocol,
    ProtocolDeployment,
    RobinhoodDeploymentGuard
} from "../../script/DeployProtocol.s.sol";
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTierDeployer} from "../../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {RobinhoodMembershipFactory} from "../../src/RobinhoodMembershipFactory.sol";
import {RobinhoodProtocolConfig} from "../../src/RobinhoodProtocolConfig.sol";
import {TestnetUSDG} from "../../src/TestnetUSDG.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

contract WrongDecimalsUSDG is ERC20 {
    constructor() ERC20("Wrong USDG", "USDG") {}
}

/// @dev Mainnet fork tests cover the exact Paxos code hashes. This harness isolates other guards.
contract DeployProtocolHarness is DeployProtocol {
    function _validateUSDGState(address) internal view override {}

    function validatedDeploymentState(address paymentToken) external view returns (address renderer, address factory) {
        (OnchainMetadataRenderer deployedRenderer, MembershipFactory deployedFactory) =
            _validatedDeploymentState(paymentToken);
        return (address(deployedRenderer), address(deployedFactory));
    }

    function validatedCompletedDeployment(address paymentToken)
        external
        view
        returns (address renderer, address factory)
    {
        (OnchainMetadataRenderer deployedRenderer, MembershipFactory deployedFactory) =
            _validatedCompletedDeployment(paymentToken);
        return (address(deployedRenderer), address(deployedFactory));
    }
}

contract DeploymentScriptsTest is Test {
    uint256 private constant _MAINNET_CHAIN_ID = 4663;
    uint256 private constant _TESTNET_CHAIN_ID = 46_630;
    uint256 private constant _ANVIL_CHAIN_ID = 31_337;
    bytes private constant _CREATE2_DEPLOYER_RUNTIME =
        hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

    DeployProtocolHarness private _publicDeployment;
    DeployProtocol private _strictDeployment;

    function setUp() public {
        vm.chainId(_MAINNET_CHAIN_ID);
        _publicDeployment = new DeployProtocolHarness();
        _strictDeployment = new DeployProtocol();
        vm.etch(_publicDeployment.CREATE2_DEPLOYER(), _CREATE2_DEPLOYER_RUNTIME);
        _installCanonicalUSDG(_publicDeployment.ROBINHOOD_MAINNET_USDG());
        _installProtocolSafe();
    }

    function test_publicDeploymentUsesDirectCreate2AndChecksAllBindings() public {
        assertEq(_publicDeployment.validateInputs(), _publicDeployment.ROBINHOOD_MAINNET_USDG());

        (OnchainMetadataRenderer renderer, MembershipFactory factory) = _deployProtocol();
        _assertExpectedDeployment(renderer, factory, _publicDeployment.ROBINHOOD_MAINNET_USDG());
    }

    function test_directFactoryInitcodeAndAddressesMatchAcrossChains() public {
        bytes32 mainnetInitcodeHash = keccak256(type(RobinhoodMembershipFactory).creationCode);
        (address mainnetRenderer, address mainnetFactory) = _publicDeployment.predictedAddresses();

        uint256 snapshot = vm.snapshotState();
        (OnchainMetadataRenderer deployedMainnetRenderer, MembershipFactory deployedMainnetFactory) = _deployProtocol();
        assertEq(address(deployedMainnetRenderer), mainnetRenderer);
        assertEq(address(deployedMainnetFactory), mainnetFactory);
        assertEq(address(deployedMainnetFactory.paymentToken()), _publicDeployment.ROBINHOOD_MAINNET_USDG());
        vm.revertToState(snapshot);

        vm.chainId(_TESTNET_CHAIN_ID);
        _deployTestnetUSDG();
        bytes32 testnetInitcodeHash = keccak256(type(RobinhoodMembershipFactory).creationCode);
        (address testnetRenderer, address testnetFactory) = _publicDeployment.predictedAddresses();
        (OnchainMetadataRenderer deployedTestnetRenderer, MembershipFactory deployedTestnetFactory) = _deployProtocol();

        assertEq(testnetInitcodeHash, mainnetInitcodeHash);
        assertEq(testnetRenderer, mainnetRenderer);
        assertEq(testnetFactory, mainnetFactory);
        assertEq(address(deployedTestnetRenderer), mainnetRenderer);
        assertEq(address(deployedTestnetFactory), mainnetFactory);
        assertEq(address(deployedTestnetFactory.paymentToken()), _publicDeployment.ROBINHOOD_TESTNET_USDG());
        assertTrue(address(deployedTestnetFactory.paymentToken()) != _publicDeployment.ROBINHOOD_MAINNET_USDG());
    }

    function test_directFactoryInitcodeFitsTheCreate2ProtocolLimit() public pure {
        assertLt(type(RobinhoodMembershipFactory).creationCode.length, 49_152);
    }

    function test_unauthorizedOriginCannotReserveFactoryAddress() public {
        _deployRenderer();
        address unauthorized = makeAddr("unauthorized");
        bytes32 salt = _publicDeployment.FACTORY_SALT();
        (bool success, bytes memory result) =
            _rawCreate2(salt, type(RobinhoodMembershipFactory).creationCode, unauthorized);
        assertFalse(success);
        assertEq(result.length, 0);
        (, address expectedFactory) = _publicDeployment.predictedAddresses();
        assertEq(expectedFactory.code.length, 0);
    }

    function test_existingDeploymentIsValidatedAtEachDirectStep() public {
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();
        (address renderer, address factory) = _publicDeployment.validatedDeploymentState(paymentToken);
        assertEq(renderer, address(0));
        assertEq(factory, address(0));

        OnchainMetadataRenderer deployedRenderer = _deployRenderer();
        (renderer, factory) = _publicDeployment.validatedDeploymentState(paymentToken);
        assertEq(renderer, address(deployedRenderer));
        assertEq(factory, address(0));

        MembershipFactory deployedFactory = _deployFactory();
        (renderer, factory) = _publicDeployment.validatedDeploymentState(paymentToken);
        assertEq(renderer, address(deployedRenderer));
        assertEq(factory, address(deployedFactory));
    }

    function test_completedDeploymentGateRejectsPartialStateAndAcceptsCompleteState() public {
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();

        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment(paymentToken);

        _deployRenderer();
        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment(paymentToken);

        _deployFactory();
        (address renderer, address factory) = _publicDeployment.validatedCompletedDeployment(paymentToken);
        (address expectedRenderer, address expectedFactory) = _publicDeployment.predictedAddresses();
        assertEq(renderer, expectedRenderer);
        assertEq(factory, expectedFactory);
    }

    function test_existingArbitraryRendererRuntimeIsNeverAdopted() public {
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();
        (address expectedRenderer,) = _publicDeployment.predictedAddresses();
        vm.etch(expectedRenderer, hex"00");

        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodDeploymentGuard.ExistingDeploymentCodeMismatch.selector,
                expectedRenderer,
                keccak256(type(OnchainMetadataRenderer).runtimeCode),
                keccak256(hex"00")
            )
        );
        _publicDeployment.validatedDeploymentState(paymentToken);
    }

    function test_publicDeploymentRejectsUnsupportedChains() public {
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(RobinhoodProtocolConfig.UnsupportedRobinhoodChain.selector, 1));
        _publicDeployment.validateInputs();
    }

    function test_mainnetRequiresExactExplicitConfirmation() public {
        vm.expectRevert(abi.encodeWithSelector(DeployProtocol.MainnetConfirmationRequired.selector, 0));
        _publicDeployment.validateMainnetConfirmation(0);
        _publicDeployment.validateMainnetConfirmation(_MAINNET_CHAIN_ID);

        vm.chainId(_TESTNET_CHAIN_ID);
        _publicDeployment.validateMainnetConfirmation(0);
    }

    function test_publicDeploymentRequiresExpectedSafeSingletonAndVersion() public {
        address safe = _publicDeployment.INITIAL_PROTOCOL_AUTHORITY();
        vm.etch(safe, "");
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidProtocolSafe.selector);
        _publicDeployment.validateInputs();

        _installProtocolSafe();
        vm.mockCall(safe, abi.encodeWithSignature("masterCopy()"), abi.encode(makeAddr("wrong")));
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidProtocolSafe.selector);
        _publicDeployment.validateInputs();

        vm.mockCall(safe, abi.encodeWithSignature("masterCopy()"), abi.encode(_publicDeployment.SAFE_L2_SINGLETON()));
        vm.mockCall(safe, abi.encodeWithSignature("VERSION()"), abi.encode("1.4.1"));
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidProtocolSafe.selector);
        _publicDeployment.validateInputs();
    }

    function test_publicDeploymentRejectsMissingOrWrongCanonicalTokenSurface() public {
        address canonicalUSDG = _publicDeployment.ROBINHOOD_MAINNET_USDG();
        vm.etch(canonicalUSDG, "");
        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        _publicDeployment.validateInputs();

        WrongDecimalsUSDG wrongDecimals = new WrongDecimalsUSDG();
        vm.etch(canonicalUSDG, address(wrongDecimals).code);
        vm.clearMockedCalls();
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("name()"), abi.encode("Wrong USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        _publicDeployment.validateInputs();
    }

    function test_mainnetRequiresReviewedProxyAndImplementationState() public {
        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        _strictDeployment.validateInputs();
    }

    function test_testnetAcceptsOnlyTheDeterministicLolDollar() public {
        vm.chainId(_TESTNET_CHAIN_ID);
        _deployTestnetUSDG();
        assertEq(_strictDeployment.validateInputs(), _strictDeployment.ROBINHOOD_TESTNET_USDG());

        vm.etch(_strictDeployment.ROBINHOOD_TESTNET_USDG(), hex"00");
        vm.expectRevert();
        _strictDeployment.validateInputs();
    }

    function test_localDeploymentIsRestrictedToAnvilAndAcceptsItsMockToken() public {
        vm.chainId(_ANVIL_CHAIN_ID);
        DeployLocalProtocol localDeployment = new DeployLocalProtocol();
        MockUSDG localUSDG = new MockUSDG();
        address protocolOwner = makeAddr("deploymentProtocolOwner");
        address feeRecipient = makeAddr("deploymentFeeRecipient");

        (OnchainMetadataRenderer renderer, MembershipFactory factory) =
            localDeployment.deploy(address(localUSDG), protocolOwner, feeRecipient);

        assertEq(address(factory.paymentToken()), address(localUSDG));
        assertEq(factory.renderer(), address(renderer));

        vm.chainId(_MAINNET_CHAIN_ID);
        vm.expectRevert(abi.encodeWithSelector(DeployLocalProtocol.UnexpectedLocalChain.selector, _MAINNET_CHAIN_ID));
        localDeployment.validateInputs(address(localUSDG), protocolOwner, feeRecipient);
    }

    function _deployProtocol() private returns (OnchainMetadataRenderer renderer, MembershipFactory factory) {
        renderer = _deployRenderer();
        factory = _deployFactory();
    }

    function _deployRenderer() private returns (OnchainMetadataRenderer renderer) {
        (address expectedRenderer,) = _publicDeployment.predictedAddresses();
        if (expectedRenderer.code.length == 0) {
            _callCreate2(_publicDeployment.RENDERER_SALT(), type(OnchainMetadataRenderer).creationCode);
        }
        renderer = OnchainMetadataRenderer(expectedRenderer);
    }

    function _deployFactory() private returns (MembershipFactory factory) {
        (, address expectedFactory) = _publicDeployment.predictedAddresses();
        if (expectedFactory.code.length == 0) {
            _callCreate2(_publicDeployment.FACTORY_SALT(), type(RobinhoodMembershipFactory).creationCode);
        }
        factory = MembershipFactory(expectedFactory);
    }

    function _deployTestnetUSDG() private returns (TestnetUSDG token) {
        address expected = _publicDeployment.ROBINHOOD_TESTNET_USDG();
        if (expected.code.length == 0) {
            _callCreate2(_publicDeployment.TESTNET_USDG_SALT(), type(TestnetUSDG).creationCode);
        }
        token = TestnetUSDG(expected);
    }

    function _callCreate2(bytes32 salt, bytes memory initCode) private returns (address deployed) {
        address create2Deployer = _publicDeployment.CREATE2_DEPLOYER();
        address expected = vm.computeCreate2Address(salt, keccak256(initCode), create2Deployer);
        address approvedDeployer = _publicDeployment.APPROVED_DEPLOYER();
        (bool success, bytes memory result) = _rawCreate2(salt, initCode, approvedDeployer);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(result, 0x20), mload(result))
            }
        }
        assertEq(result.length, 20);
        assembly ("memory-safe") {
            deployed := shr(96, mload(add(result, 0x20)))
        }
        assertEq(deployed, expected);
    }

    function _rawCreate2(bytes32 salt, bytes memory initCode, address origin)
        private
        returns (bool success, bytes memory result)
    {
        address create2Deployer = _publicDeployment.CREATE2_DEPLOYER();
        vm.prank(origin, origin);
        return create2Deployer.call(abi.encodePacked(salt, initCode));
    }

    function _assertExpectedDeployment(
        OnchainMetadataRenderer renderer,
        MembershipFactory factory,
        address paymentToken
    ) private view {
        (address expectedRenderer, address expectedFactory) = _publicDeployment.predictedAddresses();
        assertEq(address(renderer), expectedRenderer);
        assertEq(address(factory), expectedFactory);
        assertEq(address(factory.paymentToken()), paymentToken);
        assertEq(factory.renderer(), address(renderer));
        assertEq(factory.owner(), _publicDeployment.INITIAL_PROTOCOL_AUTHORITY());
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.feeRecipient(), _publicDeployment.INITIAL_PROTOCOL_AUTHORITY());

        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        assertTrue(address(tierDeployer).code.length != 0);
        assertEq(tierDeployer.factory(), address(factory));
        assertEq(tierDeployer.renderer(), address(renderer));
    }

    function _installCanonicalUSDG(address token) private {
        MockUSDG implementation = new MockUSDG();
        vm.etch(token, address(implementation).code);
        vm.mockCall(token, abi.encodeWithSignature("name()"), abi.encode("Global Dollar"));
        vm.mockCall(token, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(token, abi.encodeWithSignature("decimals()"), abi.encode(uint8(6)));
    }

    function _installProtocolSafe() private {
        address safe = _publicDeployment.INITIAL_PROTOCOL_AUTHORITY();
        vm.etch(safe, hex"00");
        vm.mockCall(safe, abi.encodeWithSignature("masterCopy()"), abi.encode(_publicDeployment.SAFE_L2_SINGLETON()));
        vm.mockCall(safe, abi.encodeWithSignature("VERSION()"), abi.encode("1.5.0"));
    }
}
