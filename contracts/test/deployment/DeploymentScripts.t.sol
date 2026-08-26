// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Test} from "forge-std/Test.sol";

import {CheckDeployment} from "../../script/CheckDeployment.s.sol";
import {DeployProtocol, RobinhoodDeploymentGuard} from "../../script/DeployProtocol.s.sol";
import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {MembershipTierDeployer} from "../../src/MembershipTierDeployer.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

contract WrongDecimalsUSDG is ERC20 {
    constructor() ERC20("Wrong USDG", "USDG") {}
}

contract DeploymentScriptsTest is Test {
    using Strings for uint256;

    uint256 private constant _MAINNET_CHAIN_ID = 4663;
    uint256 private constant _TESTNET_CHAIN_ID = 46_630;
    bytes32 private constant _CAPTURED_BLOCK_HASH = keccak256("captured block");

    DeployProtocol private _deployerScript;
    CheckDeployment private _checker;
    MockUSDG private _paymentToken;
    MembershipFactory private _factory;
    MembershipTier private _validationTier;
    address private _protocolOwner;
    address private _feeRecipient;
    address private _tierOwner;

    function setUp() public {
        vm.chainId(_MAINNET_CHAIN_ID);
        vm.roll(500);
        _protocolOwner = makeAddr("deploymentProtocolOwner");
        _feeRecipient = makeAddr("deploymentFeeRecipient");
        _tierOwner = makeAddr("deploymentTierOwner");
        _deployerScript = new DeployProtocol();
        _checker = new CheckDeployment();
        address canonicalUSDG = _deployerScript.ROBINHOOD_MAINNET_USDG();
        _paymentToken = _installCanonicalUSDG(canonicalUSDG);

        (OnchainMetadataRenderer renderer, MembershipFactory factory) = _deployerScript.deploy(
            _MAINNET_CHAIN_ID, address(_paymentToken), _protocolOwner, _feeRecipient
        );
        _factory = factory;
        assertEq(factory.renderer(), address(renderer));

        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(_tierOwner);
        vm.prank(_tierOwner);
        _validationTier = MembershipTier(factory.createTier(config));
    }

    function test_deploysProtocolWithExactTokenOwnerRecipientAndDeployerBindings() public view {
        assertEq(address(_factory.paymentToken()), address(_paymentToken));
        assertEq(_factory.owner(), _protocolOwner);
        assertEq(_factory.pendingOwner(), address(0));
        assertEq(_factory.feeRecipient(), _feeRecipient);
        assertTrue(_factory.deployer().code.length != 0);
        assertTrue(_factory.isRegisteredTier(address(_validationTier)));
    }

    function test_wrongChainAndUnsupportedChainAbortBeforeDeployment() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodDeploymentGuard.UnexpectedChain.selector, _MAINNET_CHAIN_ID, uint256(1)
            )
        );
        _deployerScript.validateInputs(1, address(_paymentToken), _protocolOwner, _feeRecipient);

        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentGuard.UnsupportedRobinhoodChain.selector, 1)
        );
        _deployerScript.validateInputs(1, address(_paymentToken), _protocolOwner, _feeRecipient);
    }

    function test_eachChainRequiresItsExactOfficialProxyAndTestnetStateCommitments() public {
        vm.chainId(_TESTNET_CHAIN_ID);
        address canonicalTestnetUSDG = _deployerScript.ROBINHOOD_TESTNET_USDG();
        _installCanonicalUSDG(canonicalTestnetUSDG);

        vm.expectRevert(RobinhoodDeploymentGuard.InvalidUSDGContract.selector);
        _deployerScript.validateInputs(
            _TESTNET_CHAIN_ID, canonicalTestnetUSDG, _protocolOwner, _feeRecipient
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodDeploymentGuard.UnexpectedUSDG.selector,
                address(_paymentToken),
                canonicalTestnetUSDG
            )
        );
        _deployerScript.validateInputs(
            _TESTNET_CHAIN_ID, address(_paymentToken), _protocolOwner, _feeRecipient
        );

        vm.chainId(_MAINNET_CHAIN_ID);
        address noncanonicalToken = address(new MockUSDG());
        vm.expectRevert(
            abi.encodeWithSelector(
                RobinhoodDeploymentGuard.UnexpectedUSDG.selector,
                noncanonicalToken,
                _deployerScript.ROBINHOOD_MAINNET_USDG()
            )
        );
        _deployerScript.validateInputs(
            _MAINNET_CHAIN_ID, noncanonicalToken, _protocolOwner, _feeRecipient
        );
    }

    function test_tokenMustHaveCodeAndExactUSDGMetadataSurface() public {
        address canonicalUSDG = _deployerScript.ROBINHOOD_MAINNET_USDG();
        vm.etch(canonicalUSDG, "");
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidUSDGContract.selector);
        _deployerScript.validateInputs(
            _MAINNET_CHAIN_ID, canonicalUSDG, _protocolOwner, _feeRecipient
        );

        WrongDecimalsUSDG wrongDecimals = new WrongDecimalsUSDG();
        vm.etch(canonicalUSDG, address(wrongDecimals).code);
        vm.clearMockedCalls();
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("name()"), abi.encode("Wrong USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
        vm.expectRevert(RobinhoodDeploymentGuard.InvalidUSDGContract.selector);
        _deployerScript.validateInputs(
            _MAINNET_CHAIN_ID, canonicalUSDG, _protocolOwner, _feeRecipient
        );
    }

    function test_manifestRoundTripChecksExactBlockArtifactsBindingsAndCompilerSettings() public {
        CheckDeployment.Manifest memory manifest = _capture();
        string memory json = _checker.serializeManifest(manifest);
        CheckDeployment.Manifest memory parsed = _checker.parseManifest(json);

        _checker.check(parsed, _CAPTURED_BLOCK_HASH);
        assertEq(parsed.capturedBlockNumber, block.number);
        assertEq(parsed.capturedBlockHash, _CAPTURED_BLOCK_HASH);
        assertEq(parsed.validationTierIndex, 0);
        assertEq(parsed.paymentTokenDecimals, 6);
        assertEq(parsed.solcVersion, "0.8.36");
        assertEq(parsed.optimizerRuns, 200);
        assertEq(parsed.validationTier, address(_validationTier));
        assertEq(parsed.factoryDeploymentTransactionHash, keccak256("factory transaction"));
        assertEq(
            parsed.validationTierCreationTransactionHash, keccak256("validation tier transaction")
        );
    }

    function test_manifestRejectsWrongBlockHashRuntimeHashAndCompilerSettings() public {
        CheckDeployment.Manifest memory manifest = _capture();

        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "capturedBlockHash"
            )
        );
        _checker.check(manifest, keccak256("wrong block"));

        manifest.factoryRuntimeCodeHash = bytes32(uint256(1));
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "factoryRuntimeCodeHash"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);

        manifest = _capture();
        manifest.optimizerRuns = 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "compilerSettings"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);

        vm.roll(501);
        vm.expectRevert(CheckDeployment.CapturedBlockUnavailable.selector);
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);
    }

    function test_manifestRejectsMissingTransactionsAndInputsNotBoundToCurrentArtifacts() public {
        CheckDeployment.Manifest memory manifest = _capture();
        manifest.factoryDeploymentTransactionHash = bytes32(0);
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "deploymentTransactionHashes"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);

        manifest = _capture();
        manifest.factoryDeploymentInputHash = keccak256("counterfeit factory input");
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "factoryDeploymentInputHash"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);

        manifest = _capture();
        manifest.validationTierCreationInputHash = keccak256("wrong createTier call");
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "validationTierCreationInputHash"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);
    }

    function test_manifestRejectsSchemaTokenMetadataAndExplicitConstructorTermChanges() public {
        CheckDeployment.Manifest memory manifest = _capture();
        manifest.schema = "./wrong-schema.json";
        vm.expectRevert(
            abi.encodeWithSelector(CheckDeployment.DeploymentCheckFailed.selector, "$schema")
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);

        manifest = _capture();
        manifest.paymentTokenName = "Not the observed token";
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "paymentTokenMetadata"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);

        manifest = _capture();
        manifest.validationTierName = "Different constructor terms";
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "sourceArtifacts"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);
    }

    function test_checkerReconstructsTierCreationCodeFromBothImmutableStores() public {
        CheckDeployment.Manifest memory manifest = _capture();
        bytes memory corruptedRuntime = manifest.creationCodeStoreA.code;
        corruptedRuntime[1] = bytes1(uint8(corruptedRuntime[1]) ^ 1);
        vm.etch(manifest.creationCodeStoreA, corruptedRuntime);
        manifest.creationCodeStoreARuntimeCodeHash = manifest.creationCodeStoreA.codehash;

        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "sourceArtifacts"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);
    }

    function test_manifestRejectsWrongNetworkVerificationHostOrContractAddress() public {
        CheckDeployment.Manifest memory manifest = _capture();
        manifest.factoryVerificationUrl =
            "https://explorer.chain.robinhood.com/address/0x0000000000000000000000000000000000000000";
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "verificationUrls"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);

        manifest = _capture();
        manifest.factoryVerificationUrl =
            string.concat(manifest.factoryVerificationUrl, "&unverified-suffix=1");
        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "verificationUrls"
            )
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);
    }

    function test_mainnetManifestRequiresOfficialBlockscoutHost() public view {
        CheckDeployment.VerificationUrls memory urls =
            _verificationUrls(_factory, address(_validationTier), true);

        CheckDeployment.Manifest memory manifest = _checker.capture(
            _creationBlocks(),
            _transactionHashes(),
            _CAPTURED_BLOCK_HASH,
            address(_factory),
            address(_validationTier),
            urls
        );
        _checker.check(manifest, _CAPTURED_BLOCK_HASH);
    }

    function test_validationTierMustRemainPristineUntilManifestCapture() public {
        vm.prank(_tierOwner);
        _validationTier.grantTime(makeAddr("grantRecipient"), 1);

        CheckDeployment.VerificationUrls memory urls =
            _verificationUrls(_factory, address(_validationTier), true);

        vm.expectRevert(
            abi.encodeWithSelector(
                CheckDeployment.DeploymentCheckFailed.selector, "validationTierMustRemainPristine"
            )
        );
        _checker.capture(
            _creationBlocks(),
            _transactionHashes(),
            _CAPTURED_BLOCK_HASH,
            address(_factory),
            address(_validationTier),
            urls
        );
    }

    function test_checkedInTestnetManifestIsExplicitlyBlockedNotFakeDeployment() public {
        string memory json = vm.readFile("deployments/robinhood-testnet.json");
        assertEq(vm.parseJsonString(json, ".status"), "blocked");
        assertEq(vm.parseJsonUint(json, ".chainId"), _TESTNET_CHAIN_ID);
        assertEq(
            vm.parseJsonAddress(json, ".paymentToken"), _deployerScript.ROBINHOOD_TESTNET_USDG()
        );
        assertTrue(bytes(vm.parseJsonString(json, ".blocker")).length != 0);

        vm.expectRevert(CheckDeployment.ManifestNotDeployed.selector);
        _checker.parseManifest(json);
    }

    function _capture() private view returns (CheckDeployment.Manifest memory manifest) {
        CheckDeployment.VerificationUrls memory urls =
            _verificationUrls(_factory, address(_validationTier), true);
        manifest = _checker.capture(
            _creationBlocks(),
            _transactionHashes(),
            _CAPTURED_BLOCK_HASH,
            address(_factory),
            address(_validationTier),
            urls
        );
    }

    function _creationBlocks()
        private
        pure
        returns (CheckDeployment.CreationBlocks memory blocks_)
    {
        blocks_ = CheckDeployment.CreationBlocks({renderer: 450, factory: 460, validationTier: 475});
    }

    function _transactionHashes()
        private
        pure
        returns (CheckDeployment.TransactionHashes memory transactionHashes)
    {
        transactionHashes = CheckDeployment.TransactionHashes({
            factoryDeployment: keccak256("factory transaction"),
            validationTierCreation: keccak256("validation tier transaction")
        });
    }

    function _verificationUrls(MembershipFactory factory, address tier, bool mainnet)
        private
        view
        returns (CheckDeployment.VerificationUrls memory urls)
    {
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        urls.renderer = _networkVerificationUrl(factory.renderer(), mainnet);
        urls.factory = _networkVerificationUrl(address(factory), mainnet);
        urls.deployer = _networkVerificationUrl(address(tierDeployer), mainnet);
        urls.creationCodeStoreA =
            _networkVerificationUrl(tierDeployer.creationCodeStoreA(), mainnet);
        urls.creationCodeStoreB =
            _networkVerificationUrl(tierDeployer.creationCodeStoreB(), mainnet);
        urls.validationTier = _networkVerificationUrl(tier, mainnet);
    }

    function _networkVerificationUrl(address target, bool mainnet)
        private
        pure
        returns (string memory)
    {
        string memory base = mainnet
            ? "https://robinhoodchain.blockscout.com/address/"
            : "https://explorer.testnet.chain.robinhood.com/address/";
        return string.concat(base, uint256(uint160(target)).toHexString(20), "?tab=contract");
    }

    function _installCanonicalUSDG(address proxy) private returns (MockUSDG token) {
        MockUSDG implementation = new MockUSDG();
        vm.etch(proxy, address(implementation).code);
        vm.mockCall(proxy, abi.encodeWithSignature("name()"), abi.encode("Global Dollar"));
        vm.mockCall(proxy, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(proxy, abi.encodeWithSignature("decimals()"), abi.encode(uint8(6)));
        token = MockUSDG(proxy);
    }
}
