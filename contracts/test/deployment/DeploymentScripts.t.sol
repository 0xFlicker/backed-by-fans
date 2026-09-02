// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {
    DeployLocalProtocol,
    DeployProtocol,
    ProtocolDeployment,
    RobinhoodDeploymentGuard
} from "../../script/DeployDirectProtocol.s.sol";
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTierDeployer} from "../../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {RendererPreviewHarness} from "../../src/RendererPreviewHarness.sol";
import {RobinhoodProtocolConfig} from "../../src/RobinhoodProtocolConfig.sol";
import {ERC8056InterfaceIds} from "../../src/interfaces/IERC8056.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {MockScaledToken} from "../mocks/MockScaledToken.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

contract WrongDecimalsUSDG is ERC20 {
    constructor() ERC20("Wrong USDG", "USDG") {}
}

/// @dev Mainnet fork tests cover the exact Paxos code hashes. This harness isolates other guards.
contract DeployProtocolHarness is DeployProtocol {
    function _validateMainnetUSDGState(address) internal view override {}

    function validatedDeploymentState()
        external
        view
        returns (
            address mediaStoreFactory,
            address renderer,
            address previewHarness,
            address factory
        )
    {
        (
            OnchainMediaStoreFactory deployedMediaStoreFactory,
            OnchainMetadataRenderer deployedRenderer,
            RendererPreviewHarness deployedPreviewHarness,
            MembershipFactory deployedFactory
        ) = _validatedDeploymentState();
        return (
            address(deployedMediaStoreFactory),
            address(deployedRenderer),
            address(deployedPreviewHarness),
            address(deployedFactory)
        );
    }

    function validatedCompletedDeployment()
        external
        view
        returns (
            address mediaStoreFactory,
            address renderer,
            address previewHarness,
            address factory
        )
    {
        (
            OnchainMediaStoreFactory deployedMediaStoreFactory,
            OnchainMetadataRenderer deployedRenderer,
            RendererPreviewHarness deployedPreviewHarness,
            MembershipFactory deployedFactory
        ) = _validatedCompletedDeployment();
        return (
            address(deployedMediaStoreFactory),
            address(deployedRenderer),
            address(deployedPreviewHarness),
            address(deployedFactory)
        );
    }
}

contract DeploymentScriptsTest is Test {
    struct PredictedDeployment {
        address mediaStoreFactory;
        address renderer;
        address previewHarness;
        address factory;
    }

    uint256 private constant _MAINNET_CHAIN_ID = 4663;
    uint256 private constant _TESTNET_CHAIN_ID = 46_630;
    uint256 private constant _ANVIL_CHAIN_ID = 31_337;
    uint256 private constant _ROBINHOOD_INITCODE_LIMIT = 196_608;
    uint256 private constant _NITRO_SEQUENCER_TX_DATA_LIMIT = 95_000;
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
        IERC20[] memory paymentTokens = _publicDeployment.validateInputs();
        assertEq(paymentTokens.length, 1);
        assertEq(address(paymentTokens[0]), _publicDeployment.ROBINHOOD_MAINNET_USDG());

        (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            RendererPreviewHarness previewHarness,
            MembershipFactory factory
        ) = _deployProtocol();
        _assertExpectedDeployment(mediaStoreFactory, renderer, previewHarness, factory);
    }

    function test_directFactoryInitcodePinsExactChainSpecificPaymentTokenLists() public {
        bytes32 mainnetInitcodeHash = keccak256(_publicDeployment.factoryInitCode());
        PredictedDeployment memory mainnet = _predictedDeployment();
        assertTrue(mainnet.mediaStoreFactory != address(0));
        assertTrue(mainnet.renderer != address(0));
        assertTrue(mainnet.previewHarness != address(0));
        assertTrue(mainnet.factory != address(0));

        uint256 snapshot = vm.snapshotState();
        _deployAndAssertPredicted(mainnet);
        vm.revertToState(snapshot);

        vm.chainId(_TESTNET_CHAIN_ID);
        _installTestnetPaymentTokens();
        bytes32 testnetInitcodeHash = keccak256(_publicDeployment.factoryInitCode());
        PredictedDeployment memory testnet = _predictedDeployment();

        assertNotEq(testnetInitcodeHash, mainnetInitcodeHash);
        assertEq(testnet.mediaStoreFactory, mainnet.mediaStoreFactory);
        assertEq(testnet.renderer, mainnet.renderer);
        assertEq(testnet.previewHarness, mainnet.previewHarness);
        assertNotEq(testnet.factory, mainnet.factory);
        _deployAndAssertPredicted(testnet);

        IERC20[] memory testnetTokens = _publicDeployment.configuredPaymentTokens();
        assertEq(testnetTokens.length, 6);
        assertEq(address(testnetTokens[0]), _publicDeployment.ROBINHOOD_TESTNET_USDG());
        assertEq(address(testnetTokens[1]), _publicDeployment.ROBINHOOD_TESTNET_AMD());
        assertEq(address(testnetTokens[2]), _publicDeployment.ROBINHOOD_TESTNET_NFLX());
        assertEq(address(testnetTokens[3]), _publicDeployment.ROBINHOOD_TESTNET_PLTR());
        assertEq(address(testnetTokens[4]), _publicDeployment.ROBINHOOD_TESTNET_AMZN());
        assertEq(address(testnetTokens[5]), _publicDeployment.ROBINHOOD_TESTNET_TSLA());
    }

    function test_directFactoryInitcodeFitsRobinhoodProtocolLimit() public view {
        assertLt(_publicDeployment.factoryInitCode().length, _ROBINHOOD_INITCODE_LIMIT);
    }

    function test_directFactoryTransactionFitsNitroSequencerLimit() public view {
        bytes memory rawCreate2Data =
            abi.encodePacked(_publicDeployment.FACTORY_SALT(), _publicDeployment.factoryInitCode());
        assertLe(rawCreate2Data.length, _NITRO_SEQUENCER_TX_DATA_LIMIT);
    }

    function test_releaseWrapperPlanMatchesSolidityConfig() public {
        uint256 releaseChainId = vm.envOr("BBF_RELEASE_CHAIN_ID", uint256(0));
        if (releaseChainId == 0) return;
        if (releaseChainId == _TESTNET_CHAIN_ID) {
            vm.chainId(_TESTNET_CHAIN_ID);
            _installTestnetPaymentTokens();
        } else {
            assertEq(releaseChainId, _MAINNET_CHAIN_ID);
        }

        assertEq(
            vm.envBytes32("BBF_RELEASE_MEDIA_SALT"), _publicDeployment.MEDIA_STORE_FACTORY_SALT()
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_RENDERER_SALT"), _publicDeployment.INITIAL_RENDERER_SALT()
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_PREVIEW_HARNESS_SALT"),
            _publicDeployment.PREVIEW_HARNESS_SALT()
        );
        assertEq(vm.envBytes32("BBF_RELEASE_FACTORY_SALT"), _publicDeployment.FACTORY_SALT());
        assertEq(
            vm.envBytes32("BBF_RELEASE_MEDIA_INIT_HASH"),
            keccak256(type(OnchainMediaStoreFactory).creationCode)
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_RENDERER_INIT_HASH"),
            keccak256(type(OnchainMetadataRenderer).creationCode)
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_PREVIEW_HARNESS_INIT_HASH"),
            keccak256(type(RendererPreviewHarness).creationCode)
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_FACTORY_INIT_HASH"),
            keccak256(_publicDeployment.factoryInitCode())
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_MEDIA_RUNTIME_HASH"),
            keccak256(type(OnchainMediaStoreFactory).runtimeCode)
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_RENDERER_RUNTIME_HASH"),
            keccak256(type(OnchainMetadataRenderer).runtimeCode)
        );
        assertEq(
            vm.envBytes32("BBF_RELEASE_PREVIEW_HARNESS_RUNTIME_HASH"),
            keccak256(type(RendererPreviewHarness).runtimeCode)
        );

        PredictedDeployment memory predicted = _predictedDeployment();
        assertEq(vm.envAddress("BBF_RELEASE_MEDIA_ADDRESS"), predicted.mediaStoreFactory);
        assertEq(vm.envAddress("BBF_RELEASE_RENDERER_ADDRESS"), predicted.renderer);
        assertEq(vm.envAddress("BBF_RELEASE_PREVIEW_HARNESS_ADDRESS"), predicted.previewHarness);
        assertEq(vm.envAddress("BBF_RELEASE_FACTORY_ADDRESS"), predicted.factory);

        (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            RendererPreviewHarness previewHarness,
            MembershipFactory factory
        ) = _deployProtocol();
        _assertExpectedDeployment(mediaStoreFactory, renderer, previewHarness, factory);
        emit log_named_bytes32("BBF_RELEASE_FACTORY_RUNTIME_HASH", address(factory).codehash);
    }

    function test_arbitraryOriginCanOnlyPredeployExactSafeOwnedFactory() public {
        OnchainMediaStoreFactory mediaStoreFactory = _deployMediaStoreFactory();
        OnchainMetadataRenderer renderer = _deployRenderer();
        RendererPreviewHarness previewHarness = _deployPreviewHarness();
        address arbitraryOrigin = makeAddr("arbitrary-origin");
        bytes32 salt = _publicDeployment.FACTORY_SALT();
        (bool success, bytes memory result) =
            _rawCreate2(salt, _publicDeployment.factoryInitCode(), arbitraryOrigin);
        assertTrue(success);
        assertEq(result.length, 20);
        (,,, address expectedFactory) = _publicDeployment.predictedAddresses();
        _assertExpectedDeployment(
            mediaStoreFactory, renderer, previewHarness, MembershipFactory(expectedFactory)
        );
    }

    function test_existingDeploymentIsValidatedAtEachDirectStep() public {
        (address mediaStoreFactory, address renderer, address previewHarness, address factory) =
            _publicDeployment.validatedDeploymentState();
        assertEq(mediaStoreFactory, address(0));
        assertEq(renderer, address(0));
        assertEq(previewHarness, address(0));
        assertEq(factory, address(0));

        OnchainMediaStoreFactory deployedMediaStoreFactory = _deployMediaStoreFactory();
        (mediaStoreFactory, renderer, previewHarness, factory) =
            _publicDeployment.validatedDeploymentState();
        assertEq(mediaStoreFactory, address(deployedMediaStoreFactory));
        assertEq(renderer, address(0));
        assertEq(previewHarness, address(0));
        assertEq(factory, address(0));

        OnchainMetadataRenderer deployedRenderer = _deployRenderer();
        (mediaStoreFactory, renderer, previewHarness, factory) =
            _publicDeployment.validatedDeploymentState();
        assertEq(mediaStoreFactory, address(deployedMediaStoreFactory));
        assertEq(renderer, address(deployedRenderer));
        assertEq(previewHarness, address(0));
        assertEq(factory, address(0));

        RendererPreviewHarness deployedPreviewHarness = _deployPreviewHarness();
        (mediaStoreFactory, renderer, previewHarness, factory) =
            _publicDeployment.validatedDeploymentState();
        assertEq(previewHarness, address(deployedPreviewHarness));
        assertEq(factory, address(0));

        MembershipFactory deployedFactory = _deployFactory();
        (mediaStoreFactory, renderer, previewHarness, factory) =
            _publicDeployment.validatedDeploymentState();
        assertEq(mediaStoreFactory, address(deployedMediaStoreFactory));
        assertEq(renderer, address(deployedRenderer));
        assertEq(factory, address(deployedFactory));
    }

    function test_completedDeploymentGateRejectsPartialStateAndAcceptsCompleteState() public {
        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment();

        _deployMediaStoreFactory();
        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment();

        _deployRenderer();
        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment();

        _deployPreviewHarness();
        vm.expectRevert(RobinhoodDeploymentGuard.ProtocolDeploymentIncomplete.selector);
        _publicDeployment.validatedCompletedDeployment();

        _deployFactory();
        (address mediaStoreFactory, address renderer, address previewHarness, address factory) =
            _publicDeployment.validatedCompletedDeployment();
        (
            address expectedMediaStoreFactory,
            address expectedRenderer,
            address expectedPreviewHarness,
            address expectedFactory
        ) = _publicDeployment.predictedAddresses();
        assertEq(mediaStoreFactory, expectedMediaStoreFactory);
        assertEq(renderer, expectedRenderer);
        assertEq(previewHarness, expectedPreviewHarness);
        assertEq(factory, expectedFactory);
    }

    function test_existingArbitraryRendererRuntimeIsNeverAdopted() public {
        _deployMediaStoreFactory();
        (, address expectedRenderer,,) = _publicDeployment.predictedAddresses();
        vm.etch(expectedRenderer, hex"00");

        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodDeploymentGuard.ExistingDeploymentCodeMismatch.selector,
                expectedRenderer,
                keccak256(type(OnchainMetadataRenderer).runtimeCode),
                keccak256(hex"00")
            )
        );
        _publicDeployment.validatedDeploymentState();
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

    function test_publicDeploymentRequiresExpectedSafeAuthorityConfiguration() public {
        address safe = _publicDeployment.INITIAL_PROTOCOL_AUTHORITY();
        address[] memory wrongOwners = new address[](1);
        wrongOwners[0] = makeAddr("wrong-owner");
        vm.mockCall(safe, abi.encodeWithSignature("getOwners()"), abi.encode(wrongOwners));
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidProtocolSafe.selector);
        _publicDeployment.validateInputs();

        _installProtocolSafe();
        vm.mockCall(safe, abi.encodeWithSignature("getThreshold()"), abi.encode(uint256(2)));
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidProtocolSafe.selector);
        _publicDeployment.validateInputs();

        _installProtocolSafe();
        address[] memory modules = new address[](1);
        modules[0] = makeAddr("module");
        vm.mockCall(
            safe,
            abi.encodeWithSignature("getModulesPaginated(address,uint256)", address(0x1), 1),
            abi.encode(modules, address(0x1))
        );
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidProtocolSafe.selector);
        _publicDeployment.validateInputs();
    }

    function test_publicDeploymentRejectsMissingOrWrongCanonicalTokenSurface() public {
        address canonicalUSDG = _publicDeployment.ROBINHOOD_MAINNET_USDG();
        vm.etch(canonicalUSDG, "");
        vm.expectRevert(
            abi.encodeWithSelector(ProtocolDeployment.InvalidPaymentToken.selector, canonicalUSDG)
        );
        _publicDeployment.validateInputs();

        WrongDecimalsUSDG wrongDecimals = new WrongDecimalsUSDG();
        vm.etch(canonicalUSDG, address(wrongDecimals).code);
        vm.clearMockedCalls();
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("name()"), abi.encode("Wrong USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
        vm.expectRevert(
            abi.encodeWithSelector(ProtocolDeployment.InvalidPaymentToken.selector, canonicalUSDG)
        );
        _publicDeployment.validateInputs();
    }

    function test_mainnetRequiresReviewedProxyAndImplementationState() public {
        address canonicalUSDG = _strictDeployment.ROBINHOOD_MAINNET_USDG();
        vm.expectRevert(
            abi.encodeWithSelector(ProtocolDeployment.InvalidPaymentToken.selector, canonicalUSDG)
        );
        _strictDeployment.validateInputs();
    }

    function test_testnetAcceptsOnlyTheExactExternalSixTokenManifest() public {
        vm.chainId(_TESTNET_CHAIN_ID);
        _installTestnetPaymentTokens();
        IERC20[] memory tokens = _strictDeployment.validateInputs();
        assertEq(tokens.length, 6);
        assertEq(address(tokens[0]), _strictDeployment.ROBINHOOD_TESTNET_USDG());
        assertEq(address(tokens[5]), _strictDeployment.ROBINHOOD_TESTNET_TSLA());

        address missingToken = _strictDeployment.ROBINHOOD_TESTNET_AMD();
        vm.etch(missingToken, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(ProtocolDeployment.InvalidPaymentToken.selector, missingToken)
        );
        _strictDeployment.validateInputs();
    }

    function test_localDeploymentIsRestrictedToAnvilAndAcceptsItsMockToken() public {
        vm.chainId(_ANVIL_CHAIN_ID);
        DeployLocalProtocol localDeployment = new DeployLocalProtocol();
        MockUSDG localUSDG = new MockUSDG();
        address protocolOwner = makeAddr("deploymentProtocolOwner");
        address feeRecipient = makeAddr("deploymentFeeRecipient");

        (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            RendererPreviewHarness previewHarness,
            MembershipFactory factory
        ) = localDeployment.deploy(address(localUSDG), protocolOwner, feeRecipient);

        assertEq(factory.paymentTokenCount(), 1);
        assertTrue(factory.isPaymentTokenListed(address(localUSDG)));
        assertTrue(factory.isPaymentTokenEnabled(address(localUSDG)));
        assertTrue(address(renderer).code.length != 0);
        assertTrue(address(previewHarness).code.length != 0);
        assertEq(factory.mediaStoreFactory(), address(mediaStoreFactory));

        vm.chainId(_MAINNET_CHAIN_ID);
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployLocalProtocol.UnexpectedLocalChain.selector, _MAINNET_CHAIN_ID
            )
        );
        localDeployment.validateInputs(address(localUSDG), protocolOwner, feeRecipient);
    }

    function _deployProtocol()
        private
        returns (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            RendererPreviewHarness previewHarness,
            MembershipFactory factory
        )
    {
        mediaStoreFactory = _deployMediaStoreFactory();
        renderer = _deployRenderer();
        previewHarness = _deployPreviewHarness();
        factory = _deployFactory();
    }

    function _predictedDeployment() private view returns (PredictedDeployment memory predicted) {
        (
            predicted.mediaStoreFactory,
            predicted.renderer,
            predicted.previewHarness,
            predicted.factory
        ) = _publicDeployment.predictedAddresses();
    }

    function _deployAndAssertPredicted(PredictedDeployment memory predicted) private {
        (
            OnchainMediaStoreFactory mediaStoreFactory,
            OnchainMetadataRenderer renderer,
            RendererPreviewHarness previewHarness,
            MembershipFactory factory
        ) = _deployProtocol();
        assertEq(address(mediaStoreFactory), predicted.mediaStoreFactory);
        assertEq(address(renderer), predicted.renderer);
        assertEq(address(previewHarness), predicted.previewHarness);
        assertEq(address(factory), predicted.factory);
        _assertFactoryPaymentTokens(factory);
    }

    function _deployMediaStoreFactory()
        private
        returns (OnchainMediaStoreFactory mediaStoreFactory)
    {
        (address expectedMediaStoreFactory,,,) = _publicDeployment.predictedAddresses();
        if (expectedMediaStoreFactory.code.length == 0) {
            _callCreate2(
                _publicDeployment.MEDIA_STORE_FACTORY_SALT(),
                type(OnchainMediaStoreFactory).creationCode
            );
        }
        mediaStoreFactory = OnchainMediaStoreFactory(expectedMediaStoreFactory);
    }

    function _deployRenderer() private returns (OnchainMetadataRenderer renderer) {
        (, address expectedRenderer,,) = _publicDeployment.predictedAddresses();
        if (expectedRenderer.code.length == 0) {
            _callCreate2(
                _publicDeployment.INITIAL_RENDERER_SALT(),
                type(OnchainMetadataRenderer).creationCode
            );
        }
        renderer = OnchainMetadataRenderer(expectedRenderer);
    }

    function _deployPreviewHarness() private returns (RendererPreviewHarness previewHarness) {
        (,, address expectedPreviewHarness,) = _publicDeployment.predictedAddresses();
        if (expectedPreviewHarness.code.length == 0) {
            _callCreate2(
                _publicDeployment.PREVIEW_HARNESS_SALT(), type(RendererPreviewHarness).creationCode
            );
        }
        previewHarness = RendererPreviewHarness(expectedPreviewHarness);
    }

    function _deployFactory() private returns (MembershipFactory factory) {
        (,,, address expectedFactory) = _publicDeployment.predictedAddresses();
        if (expectedFactory.code.length == 0) {
            _callCreate2(_publicDeployment.FACTORY_SALT(), _publicDeployment.factoryInitCode());
        }
        factory = MembershipFactory(expectedFactory);
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
        OnchainMediaStoreFactory mediaStoreFactory,
        OnchainMetadataRenderer renderer,
        RendererPreviewHarness previewHarness,
        MembershipFactory factory
    ) private view {
        (
            address expectedMediaStoreFactory,
            address expectedRenderer,
            address expectedPreviewHarness,
            address expectedFactory
        ) = _publicDeployment.predictedAddresses();
        assertEq(address(mediaStoreFactory), expectedMediaStoreFactory);
        assertEq(address(renderer), expectedRenderer);
        assertEq(address(previewHarness), expectedPreviewHarness);
        assertEq(address(factory), expectedFactory);
        _assertFactoryPaymentTokens(factory);
        assertEq(factory.rendererSchema(), renderer.rendererSchema());
        assertEq(factory.mediaStoreFactory(), address(mediaStoreFactory));
        assertEq(factory.mediaStoreFactoryRuntimeCodehash(), address(mediaStoreFactory).codehash);
        assertEq(factory.owner(), _publicDeployment.INITIAL_PROTOCOL_AUTHORITY());
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.feeRecipient(), _publicDeployment.INITIAL_PROTOCOL_AUTHORITY());

        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        assertTrue(address(tierDeployer).code.length != 0);
        assertEq(tierDeployer.factory(), address(factory));
    }

    function _assertFactoryPaymentTokens(MembershipFactory factory) private view {
        IERC20[] memory expectedTokens = _publicDeployment.configuredPaymentTokens();
        assertEq(factory.paymentTokenCount(), expectedTokens.length);
        address[] memory observedTokens = factory.paymentTokens(0, expectedTokens.length);
        assertEq(observedTokens.length, expectedTokens.length);
        for (uint256 i; i < expectedTokens.length; ++i) {
            address expectedToken = address(expectedTokens[i]);
            assertEq(observedTokens[i], expectedToken);
            assertTrue(factory.isPaymentTokenListed(expectedToken));
            assertTrue(factory.isPaymentTokenEnabled(expectedToken));
        }
    }

    function _installCanonicalUSDG(address token) private {
        MockUSDG implementation = new MockUSDG();
        vm.etch(token, address(implementation).code);
        vm.mockCall(token, abi.encodeWithSignature("name()"), abi.encode("Global Dollar"));
        vm.mockCall(token, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(token, abi.encodeWithSignature("decimals()"), abi.encode(uint8(6)));
    }

    function _installTestnetPaymentTokens() private {
        _installCanonicalUSDG(_publicDeployment.ROBINHOOD_TESTNET_USDG());
        MockScaledToken implementation = new MockScaledToken("Stock Token", "STOCK");
        _installScaledToken(
            _publicDeployment.ROBINHOOD_TESTNET_AMD(), "AMD Stock Token", "AMD", implementation
        );
        _installScaledToken(
            _publicDeployment.ROBINHOOD_TESTNET_NFLX(), "NFLX Stock Token", "NFLX", implementation
        );
        _installScaledToken(
            _publicDeployment.ROBINHOOD_TESTNET_PLTR(), "PLTR Stock Token", "PLTR", implementation
        );
        _installScaledToken(
            _publicDeployment.ROBINHOOD_TESTNET_AMZN(), "AMZN Stock Token", "AMZN", implementation
        );
        _installScaledToken(
            _publicDeployment.ROBINHOOD_TESTNET_TSLA(), "TSLA Stock Token", "TSLA", implementation
        );
    }

    function _installScaledToken(
        address token,
        string memory name,
        string memory symbol,
        MockScaledToken implementation
    ) private {
        vm.etch(token, address(implementation).code);
        vm.mockCall(token, abi.encodeWithSignature("name()"), abi.encode(name));
        vm.mockCall(token, abi.encodeWithSignature("symbol()"), abi.encode(symbol));
        vm.mockCall(token, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
        vm.mockCall(
            token,
            abi.encodeWithSignature(
                "supportsInterface(bytes4)", ERC8056InterfaceIds.SCALED_UI_AMOUNT
            ),
            abi.encode(true)
        );
        vm.mockCall(
            token,
            abi.encodeWithSignature(
                "supportsInterface(bytes4)", ERC8056InterfaceIds.PENDING_UI_MULTIPLIER
            ),
            abi.encode(true)
        );
        vm.mockCall(token, abi.encodeWithSignature("uiMultiplier()"), abi.encode(1e18));
        vm.mockCall(token, abi.encodeWithSignature("newUIMultiplier()"), abi.encode(1e18));
        vm.mockCall(token, abi.encodeWithSignature("effectiveAt()"), abi.encode(uint256(0)));
    }

    function _installProtocolSafe() private {
        address safe = _publicDeployment.INITIAL_PROTOCOL_AUTHORITY();
        address[] memory owners = new address[](1);
        owners[0] = _publicDeployment.APPROVED_DEPLOYER();
        address[] memory modules = new address[](0);
        vm.etch(safe, hex"00");
        vm.mockCall(
            safe,
            abi.encodeWithSignature("masterCopy()"),
            abi.encode(_publicDeployment.SAFE_L2_SINGLETON())
        );
        vm.mockCall(safe, abi.encodeWithSignature("VERSION()"), abi.encode("1.5.0"));
        vm.mockCall(safe, abi.encodeWithSignature("getOwners()"), abi.encode(owners));
        vm.mockCall(safe, abi.encodeWithSignature("getThreshold()"), abi.encode(uint256(1)));
        vm.mockCall(
            safe,
            abi.encodeWithSignature("getModulesPaginated(address,uint256)", address(0x1), 1),
            abi.encode(modules, address(0x1))
        );
        vm.mockCall(
            safe,
            abi.encodeWithSignature(
                "getStorageAt(uint256,uint256)",
                uint256(0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5),
                1
            ),
            abi.encode(
                abi.encodePacked(
                    bytes32(uint256(uint160(_publicDeployment.COMPATIBILITY_FALLBACK_HANDLER())))
                )
            )
        );
        vm.mockCall(
            safe,
            abi.encodeWithSignature(
                "getStorageAt(uint256,uint256)",
                uint256(0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8),
                1
            ),
            abi.encode(abi.encodePacked(bytes32(0)))
        );
    }
}
