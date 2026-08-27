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
import {MockUSDG} from "../mocks/MockUSDG.sol";

contract WrongDecimalsUSDG is ERC20 {
    constructor() ERC20("Wrong USDG", "USDG") {}
}

contract DeploymentScriptsTest is Test {
    uint256 private constant _MAINNET_CHAIN_ID = 4663;
    uint256 private constant _TESTNET_CHAIN_ID = 46_630;
    uint256 private constant _ANVIL_CHAIN_ID = 31_337;

    DeployProtocol private _publicDeployment;
    address private _protocolOwner;
    address private _feeRecipient;

    function setUp() public {
        vm.chainId(_MAINNET_CHAIN_ID);
        _protocolOwner = makeAddr("deploymentProtocolOwner");
        _feeRecipient = makeAddr("deploymentFeeRecipient");
        _publicDeployment = new DeployProtocol();
        _installCanonicalUSDG(_publicDeployment.ROBINHOOD_MAINNET_USDG());
    }

    function test_publicDeploymentDerivesCanonicalTokenAndChecksAllBindings() public {
        (OnchainMetadataRenderer renderer, MembershipFactory factory) =
            _publicDeployment.deploy(_protocolOwner, _feeRecipient);

        assertEq(address(factory.paymentToken()), _publicDeployment.ROBINHOOD_MAINNET_USDG());
        assertEq(factory.renderer(), address(renderer));
        assertEq(factory.owner(), _protocolOwner);
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.feeRecipient(), _feeRecipient);

        MembershipTierDeployer tierDeployer = MembershipTierDeployer(factory.deployer());
        assertTrue(address(tierDeployer).code.length != 0);
        assertEq(tierDeployer.factory(), address(factory));
        assertEq(tierDeployer.renderer(), address(renderer));
    }

    function test_publicDeploymentRejectsUnsupportedChains() public {
        vm.chainId(1);

        vm.expectRevert(
            abi.encodeWithSelector(RobinhoodDeploymentGuard.UnsupportedRobinhoodChain.selector, 1)
        );
        _publicDeployment.validateInputs(_protocolOwner, _feeRecipient);
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

    function test_publicDeploymentRejectsMissingOperationalAddresses() public {
        vm.expectRevert(ProtocolDeployment.InvalidOperationalAddress.selector);
        _publicDeployment.validateInputs(address(0), _feeRecipient);

        vm.expectRevert(ProtocolDeployment.InvalidOperationalAddress.selector);
        _publicDeployment.validateInputs(_protocolOwner, address(0));
    }

    function test_publicDeploymentRejectsMissingOrWrongCanonicalTokenSurface() public {
        address canonicalUSDG = _publicDeployment.ROBINHOOD_MAINNET_USDG();
        vm.etch(canonicalUSDG, "");
        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        _publicDeployment.validateInputs(_protocolOwner, _feeRecipient);

        WrongDecimalsUSDG wrongDecimals = new WrongDecimalsUSDG();
        vm.etch(canonicalUSDG, address(wrongDecimals).code);
        vm.clearMockedCalls();
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("name()"), abi.encode("Wrong USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(canonicalUSDG, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        _publicDeployment.validateInputs(_protocolOwner, _feeRecipient);
    }

    function test_testnetRequiresReviewedProxyAndImplementationState() public {
        vm.chainId(_TESTNET_CHAIN_ID);
        address canonicalTestnetUSDG = _publicDeployment.ROBINHOOD_TESTNET_USDG();
        _installCanonicalUSDG(canonicalTestnetUSDG);

        vm.expectRevert(ProtocolDeployment.InvalidUSDGContract.selector);
        _publicDeployment.validateInputs(_protocolOwner, _feeRecipient);
    }

    function test_localDeploymentIsRestrictedToAnvilAndAcceptsItsMockToken() public {
        vm.chainId(_ANVIL_CHAIN_ID);
        DeployLocalProtocol localDeployment = new DeployLocalProtocol();
        MockUSDG localUSDG = new MockUSDG();

        (OnchainMetadataRenderer renderer, MembershipFactory factory) =
            localDeployment.deploy(address(localUSDG), _protocolOwner, _feeRecipient);

        assertEq(address(factory.paymentToken()), address(localUSDG));
        assertEq(factory.renderer(), address(renderer));

        vm.chainId(_MAINNET_CHAIN_ID);
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployLocalProtocol.UnexpectedLocalChain.selector, _MAINNET_CHAIN_ID
            )
        );
        localDeployment.validateInputs(address(localUSDG), _protocolOwner, _feeRecipient);
    }

    function _installCanonicalUSDG(address proxy) private {
        MockUSDG implementation = new MockUSDG();
        vm.etch(proxy, address(implementation).code);
        vm.mockCall(proxy, abi.encodeWithSignature("name()"), abi.encode("Global Dollar"));
        vm.mockCall(proxy, abi.encodeWithSignature("symbol()"), abi.encode("USDG"));
        vm.mockCall(proxy, abi.encodeWithSignature("decimals()"), abi.encode(uint8(6)));
    }
}
