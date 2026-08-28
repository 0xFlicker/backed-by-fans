// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {CreateRobinhoodSafe, ISafeL2} from "../../script/CreateSafe.s.sol";

contract CreateSafeScriptTest is Test {
    uint256 private constant _MAINNET_CHAIN_ID = 4663;
    uint256 private constant _TESTNET_CHAIN_ID = 46_630;

    CreateRobinhoodSafe private _creation;

    function setUp() public {
        vm.chainId(_MAINNET_CHAIN_ID);
        _creation = new CreateRobinhoodSafe();
    }

    function test_usesReleasedSafeV150L2Deployments() public view {
        assertEq(_creation.SAFE_L2_SINGLETON(), 0xEdd160fEBBD92E350D4D398fb636302fccd67C7e);
        assertEq(_creation.SAFE_PROXY_FACTORY(), 0x14F2982D601c9458F93bd70B218933A6f8165e7b);
        assertEq(
            _creation.COMPATIBILITY_FALLBACK_HANDLER(), 0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4
        );
        assertEq(_creation.SAFE_SALT(), keccak256("Backed By Fans protocol Safe v1"));
        assertEq(_creation.EXPECTED_SAFE_ADDRESS(), 0xeAA4B38A99f766117C1D493a21012fec25f70505);
    }

    function test_initializerConfiguresOnlyTheDeployer() public view {
        address owner = _creation.APPROVED_DEPLOYER();
        address[] memory owners = new address[](1);
        owners[0] = owner;

        bytes memory expected = abi.encodeCall(
            ISafeL2.setup,
            (
                owners,
                1,
                address(0),
                bytes(""),
                _creation.COMPATIBILITY_FALLBACK_HANDLER(),
                address(0),
                0,
                payable(address(0))
            )
        );

        assertEq(_creation.safeInitializer(owner), expected);
    }

    function test_initializerRejectsUnapprovedOwner() public {
        vm.expectRevert(
            abi.encodeWithSelector(CreateRobinhoodSafe.InvalidSafeOwner.selector, address(0))
        );
        _creation.safeInitializer(address(0));
    }

    function test_rejectsUnapprovedSafeOwner() public {
        address unapproved = makeAddr("unapproved");
        vm.expectRevert(
            abi.encodeWithSelector(CreateRobinhoodSafe.InvalidSafeOwner.selector, unapproved)
        );
        _creation.validatePublicInputs(unapproved);
    }

    function test_rejectsUnsupportedChainsBeforeInspectingContracts() public {
        address approvedDeployer = _creation.APPROVED_DEPLOYER();
        vm.chainId(1);
        vm.expectRevert(
            abi.encodeWithSelector(CreateRobinhoodSafe.UnsupportedRobinhoodChain.selector, 1)
        );
        _creation.validatePublicInputs(approvedDeployer);
    }

    function test_mainnetRequiresExactExplicitConfirmation() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateRobinhoodSafe.MainnetConfirmationRequired.selector, uint256(0)
            )
        );
        _creation.validateMainnetConfirmation(0);

        _creation.validateMainnetConfirmation(_MAINNET_CHAIN_ID);

        vm.chainId(_TESTNET_CHAIN_ID);
        _creation.validateMainnetConfirmation(0);
    }

    function test_runEnforcesMainnetConfirmationBeforeCanonicalContractChecks() public {
        vm.setEnv("CONFIRM_MAINNET_SAFE_CREATION", "0");
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateRobinhoodSafe.MainnetConfirmationRequired.selector, uint256(0)
            )
        );
        _creation.run();

        vm.setEnv("CONFIRM_MAINNET_SAFE_CREATION", "4663");
        vm.expectRevert(
            abi.encodeWithSelector(
                CreateRobinhoodSafe.CanonicalSafeContractMismatch.selector,
                _creation.SAFE_L2_SINGLETON(),
                _creation.SAFE_L2_SINGLETON_CODE_HASH(),
                bytes32(0)
            )
        );
        _creation.run();
    }
}
