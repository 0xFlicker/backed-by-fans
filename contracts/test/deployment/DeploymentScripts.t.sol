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
import {ImmutableCodeStore} from "../../src/ImmutableCodeStore.sol";
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTierDeployer} from "../../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {RobinhoodProtocolConfig} from "../../src/RobinhoodProtocolConfig.sol";
import {RobinhoodProtocolDeployment} from "../../src/RobinhoodProtocolDeployment.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

contract WrongDecimalsUSDG is ERC20 {
    constructor() ERC20("Wrong USDG", "USDG") {}
}

/// @dev Fork tests cover the exact reviewed USDG code hashes. This harness isolates other guards.
contract DeployProtocolHarness is DeployProtocol {
    function _validateUSDGState(address) internal view override {}

    function validatedDeploymentState(address paymentToken)
        external
        view
        returns (address deployment, address renderer, address factory)
    {
        RobinhoodProtocolDeployment coordinator;
        OnchainMetadataRenderer deployedRenderer;
        MembershipFactory deployedFactory;
        (coordinator, deployedRenderer, deployedFactory) = _validatedDeploymentState(paymentToken);
        return (address(coordinator), address(deployedRenderer), address(deployedFactory));
    }

    function validatedCompletedDeployment(address paymentToken)
        external
        view
        returns (address deployment, address renderer, address factory)
    {
        RobinhoodProtocolDeployment coordinator;
        OnchainMetadataRenderer deployedRenderer;
        MembershipFactory deployedFactory;
        (coordinator, deployedRenderer, deployedFactory) =
            _validatedCompletedDeployment(paymentToken);
        return (address(coordinator), address(deployedRenderer), address(deployedFactory));
    }
}

contract DeploymentScriptsTest is Test {
    uint256 private constant _MAINNET_CHAIN_ID = 4663;
    uint256 private constant _TESTNET_CHAIN_ID = 46_630;
    uint256 private constant _ANVIL_CHAIN_ID = 31_337;

    DeployProtocolHarness private _publicDeployment;
    DeployProtocol private _strictDeployment;

    function setUp() public {
        vm.chainId(_MAINNET_CHAIN_ID);
        _publicDeployment = new DeployProtocolHarness();
        _strictDeployment = new DeployProtocol();
        _installCanonicalUSDG(_publicDeployment.ROBINHOOD_MAINNET_USDG());
        _installProtocolSafe();
    }

    function test_publicDeploymentUsesCanonicalCreate2AndChecksAllBindings() public {
        assertEq(_publicDeployment.validateInputs(), _publicDeployment.ROBINHOOD_MAINNET_USDG());

        RobinhoodProtocolDeployment deployment = _deployCoordinator();
        (OnchainMetadataRenderer renderer, MembershipFactory factory) =
            _deployChildren(deployment, _publicDeployment.ROBINHOOD_MAINNET_USDG());
        _assertExpectedDeployment(deployment, renderer, factory);
    }

    function test_authorizedOriginCanReserveCoordinatorOnBothChains() public {
        vm.prank(_publicDeployment.APPROVED_DEPLOYER(), _publicDeployment.APPROVED_DEPLOYER());
        RobinhoodProtocolDeployment mainnetDeployment = new RobinhoodProtocolDeployment();
        assertTrue(address(mainnetDeployment).code.length != 0);

        vm.chainId(_TESTNET_CHAIN_ID);
        vm.prank(_publicDeployment.APPROVED_DEPLOYER(), _publicDeployment.APPROVED_DEPLOYER());
        RobinhoodProtocolDeployment testnetDeployment = new RobinhoodProtocolDeployment();
        assertTrue(address(testnetDeployment).code.length != 0);
    }

    function test_unauthorizedOriginCannotReserveCoordinator() public {
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized, unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodProtocolDeployment.UnauthorizedDeploymentOrigin.selector, unauthorized
            )
        );
        new RobinhoodProtocolDeployment();
    }

    function test_unauthorizedCallerCannotDeployChildren() public {
        RobinhoodProtocolDeployment deployment = _deployCoordinator();
        address unauthorized = makeAddr("unauthorized");
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();

        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodProtocolDeployment.UnauthorizedDeploymentCaller.selector, unauthorized
            )
        );
        deployment.deploy(paymentToken);
    }

    function test_failedChildDeploymentRemainsResumableAndDuplicateFails() public {
        RobinhoodProtocolDeployment deployment = _deployCoordinator();
        address approvedDeployer = _publicDeployment.APPROVED_DEPLOYER();
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();

        vm.prank(approvedDeployer);
        vm.expectRevert(RobinhoodProtocolDeployment.InvalidDeploymentConfiguration.selector);
        deployment.deploy(makeAddr("missingToken"));
        assertEq(address(deployment.renderer()), address(0));
        assertEq(address(deployment.factory()), address(0));

        _deployChildren(deployment, paymentToken);

        vm.prank(approvedDeployer);
        vm.expectRevert(RobinhoodProtocolDeployment.AlreadyDeployed.selector);
        deployment.deploy(paymentToken);
    }

    function test_existingAuthenticCoordinatorIsValidatedBeforeAndAfterChildren() public {
        RobinhoodProtocolDeployment deployment = _deployCoordinator();
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();

        (address observedDeployment, address renderer, address factory) =
            _publicDeployment.validatedDeploymentState(paymentToken);
        assertEq(observedDeployment, address(deployment));
        assertEq(renderer, address(0));
        assertEq(factory, address(0));

        _deployChildren(deployment, paymentToken);
        (observedDeployment, renderer, factory) =
            _publicDeployment.validatedDeploymentState(paymentToken);
        assertEq(observedDeployment, address(deployment));
        assertEq(renderer, _publicDeployment.EXPECTED_RENDERER_ADDRESS());
        assertEq(factory, _publicDeployment.EXPECTED_FACTORY_ADDRESS());
    }

    function test_completedDeploymentGateRejectsPartialStateAndAcceptsCompleteState() public {
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();

        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment(paymentToken);

        _installFactoryCodeStores();
        RobinhoodProtocolDeployment deployment = _deployCoordinator();
        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment(paymentToken);

        _deployChildren(deployment, paymentToken);
        (address observedDeployment, address renderer, address factory) =
            _publicDeployment.validatedCompletedDeployment(paymentToken);
        assertEq(observedDeployment, address(deployment));
        assertEq(renderer, _publicDeployment.EXPECTED_RENDERER_ADDRESS());
        assertEq(factory, _publicDeployment.EXPECTED_FACTORY_ADDRESS());
    }

    function test_existingArbitraryRuntimeIsNeverAdopted() public {
        address paymentToken = _publicDeployment.ROBINHOOD_MAINNET_USDG();
        vm.etch(_publicDeployment.EXPECTED_DEPLOYMENT_ADDRESS(), hex"00");

        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodDeploymentGuard.ExistingDeploymentCodeMismatch.selector,
                keccak256(type(RobinhoodProtocolDeployment).runtimeCode),
                keccak256(hex"00")
            )
        );
        _publicDeployment.validatedDeploymentState(paymentToken);
    }

    function test_chainSpecificUSDGDoesNotChangeCoordinatorInitcodeOrAddresses() public {
        bytes32 mainnetInitcodeHash = keccak256(type(RobinhoodProtocolDeployment).creationCode);
        (address mainnetDeployment, address mainnetRenderer, address mainnetFactory) =
            _publicDeployment.predictedAddresses();

        vm.chainId(_TESTNET_CHAIN_ID);
        _installCanonicalUSDG(_publicDeployment.ROBINHOOD_TESTNET_USDG());
        bytes32 testnetInitcodeHash = keccak256(type(RobinhoodProtocolDeployment).creationCode);
        (address testnetDeployment, address testnetRenderer, address testnetFactory) =
            _publicDeployment.predictedAddresses();

        assertTrue(
            _publicDeployment.ROBINHOOD_MAINNET_USDG() != _publicDeployment.ROBINHOOD_TESTNET_USDG()
        );
        assertEq(testnetInitcodeHash, mainnetInitcodeHash);
        assertEq(testnetDeployment, mainnetDeployment);
        assertEq(testnetRenderer, mainnetRenderer);
        assertEq(testnetFactory, mainnetFactory);
    }

    function test_expectedNestedDeploymentAddressesMatchOnBothChains() public {
        _assertNestedAddresses(_MAINNET_CHAIN_ID, _publicDeployment.ROBINHOOD_MAINNET_USDG());
        _assertNestedAddresses(_TESTNET_CHAIN_ID, _publicDeployment.ROBINHOOD_TESTNET_USDG());
    }

    function test_publicDeploymentRejectsUnsupportedChains() public {
        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodProtocolConfig.UnsupportedRobinhoodChain.selector, 1)
        );
        _publicDeployment.validateInputs();
    }

    function test_mainnetRequiresExactExplicitConfirmation() public {
        vm.expectRevert(
            abi.encodeWithSelector(DeployProtocol.MainnetConfirmationRequired.selector, 0)
        );
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

        vm.mockCall(
            safe,
            abi.encodeWithSignature("masterCopy()"),
            abi.encode(_publicDeployment.SAFE_L2_SINGLETON())
        );
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

    function test_testnetRequiresReviewedProxyAndImplementationState() public {
        vm.chainId(_TESTNET_CHAIN_ID);
        _installCanonicalUSDG(_publicDeployment.ROBINHOOD_TESTNET_USDG());

        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
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
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployLocalProtocol.UnexpectedLocalChain.selector, _MAINNET_CHAIN_ID
            )
        );
        localDeployment.validateInputs(address(localUSDG), protocolOwner, feeRecipient);
    }

    function _assertNestedAddresses(uint256 chainId, address paymentToken) private {
        uint256 snapshot = vm.snapshotState();
        vm.chainId(chainId);
        _installCanonicalUSDG(paymentToken);

        RobinhoodProtocolDeployment deployment = _deployCoordinator();
        (OnchainMetadataRenderer renderer, MembershipFactory factory) =
            _deployChildren(deployment, paymentToken);
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());

        assertEq(address(deployment), _publicDeployment.EXPECTED_DEPLOYMENT_ADDRESS());
        assertEq(address(renderer), _publicDeployment.EXPECTED_RENDERER_ADDRESS());
        assertEq(address(factory), _publicDeployment.EXPECTED_FACTORY_ADDRESS());
        (address storeA, address storeB) = _publicDeployment.predictedFactoryCodeStores();
        assertEq(storeA, _publicDeployment.EXPECTED_FACTORY_CODE_STORE_A());
        assertEq(storeB, _publicDeployment.EXPECTED_FACTORY_CODE_STORE_B());
        assertTrue(storeA.code.length != 0);
        assertTrue(storeB.code.length != 0);
        assertEq(address(tierDeployer), vm.computeCreateAddress(address(factory), 1));
        assertEq(
            tierDeployer.creationCodeStoreA(), vm.computeCreateAddress(address(tierDeployer), 1)
        );
        assertEq(
            tierDeployer.creationCodeStoreB(), vm.computeCreateAddress(address(tierDeployer), 2)
        );

        vm.revertToState(snapshot);
    }

    function _deployCoordinator() private returns (RobinhoodProtocolDeployment deployment) {
        _installFactoryCodeStores();
        address approvedDeployer = _publicDeployment.APPROVED_DEPLOYER();
        bytes32 salt = _publicDeployment.DEPLOYMENT_SALT();
        vm.prank(approvedDeployer, approvedDeployer);
        deployment = new RobinhoodProtocolDeployment{salt: salt}();
    }

    function _installFactoryCodeStores() private {
        bytes memory creationCode = type(MembershipFactory).creationCode;
        uint256 firstLength = creationCode.length / 2;
        bytes memory firstChunk = new bytes(firstLength);
        bytes memory secondChunk = new bytes(creationCode.length - firstLength);
        assembly ("memory-safe") {
            mcopy(add(firstChunk, 0x20), add(creationCode, 0x20), firstLength)
            mcopy(
                add(secondChunk, 0x20),
                add(add(creationCode, 0x20), firstLength),
                sub(mload(creationCode), firstLength)
            )
        }

        if (_publicDeployment.EXPECTED_FACTORY_CODE_STORE_A().code.length == 0) {
            ImmutableCodeStore storeA = new ImmutableCodeStore{
                salt: _publicDeployment.FACTORY_CODE_STORE_A_SALT()
            }(
                firstChunk
            );
            assertEq(address(storeA), _publicDeployment.EXPECTED_FACTORY_CODE_STORE_A());
        }
        if (_publicDeployment.EXPECTED_FACTORY_CODE_STORE_B().code.length == 0) {
            ImmutableCodeStore storeB = new ImmutableCodeStore{
                salt: _publicDeployment.FACTORY_CODE_STORE_B_SALT()
            }(
                secondChunk
            );
            assertEq(address(storeB), _publicDeployment.EXPECTED_FACTORY_CODE_STORE_B());
        }
    }

    function _deployChildren(RobinhoodProtocolDeployment deployment, address paymentToken)
        private
        returns (OnchainMetadataRenderer renderer, MembershipFactory factory)
    {
        address approvedDeployer = _publicDeployment.APPROVED_DEPLOYER();
        assertEq(
            deployment.INITIAL_PROTOCOL_AUTHORITY(), _publicDeployment.INITIAL_PROTOCOL_AUTHORITY()
        );
        vm.prank(approvedDeployer);
        (renderer, factory) = deployment.deploy(paymentToken);
    }

    function _assertExpectedDeployment(
        RobinhoodProtocolDeployment deployment,
        OnchainMetadataRenderer renderer,
        MembershipFactory factory
    ) private view {
        assertEq(address(deployment), _publicDeployment.EXPECTED_DEPLOYMENT_ADDRESS());
        assertEq(address(renderer), _publicDeployment.EXPECTED_RENDERER_ADDRESS());
        assertEq(address(factory), _publicDeployment.EXPECTED_FACTORY_ADDRESS());
        assertEq(address(factory.paymentToken()), _publicDeployment.ROBINHOOD_MAINNET_USDG());
        assertEq(factory.renderer(), address(renderer));
        assertEq(factory.owner(), _publicDeployment.INITIAL_PROTOCOL_AUTHORITY());
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.feeRecipient(), _publicDeployment.INITIAL_PROTOCOL_AUTHORITY());

        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        assertTrue(address(tierDeployer).code.length != 0);
        assertEq(tierDeployer.factory(), address(factory));
        assertEq(tierDeployer.renderer(), address(renderer));
    }

    function _installCanonicalUSDG(address proxy) private {
        MockUSDG implementation = new MockUSDG();
        vm.etch(proxy, address(implementation).code);
        vm.mockCall(proxy, abi.encodeWithSignature("name()"), abi.encode("Global Dollar"));
        vm.mockCall(proxy, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(proxy, abi.encodeWithSignature("decimals()"), abi.encode(uint8(6)));
    }

    function _installProtocolSafe() private {
        address safe = _publicDeployment.INITIAL_PROTOCOL_AUTHORITY();
        vm.etch(safe, hex"00");
        vm.mockCall(
            safe,
            abi.encodeWithSignature("masterCopy()"),
            abi.encode(_publicDeployment.SAFE_L2_SINGLETON())
        );
        vm.mockCall(safe, abi.encodeWithSignature("VERSION()"), abi.encode("1.5.0"));
    }
}
