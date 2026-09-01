// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {RendererRegistry} from "../src/RendererRegistry.sol";
import {IRendererRegistry} from "../src/interfaces/IRendererRegistry.sol";

contract RegistryRenderer {
    function rendererSchema() external pure returns (bytes32) {
        return keccak256("BackedByFans.MembershipRenderer.v1");
    }
}

contract WrongRegistryRenderer {
    function rendererSchema() external pure returns (bytes32) {
        return keccak256("wrong");
    }
}

contract RevertingRegistryRenderer {
    constructor() {
        revert("no renderer");
    }
}

contract RendererRegistryTest is Test {
    RendererRegistry private _registry;
    address private _alice = makeAddr("alice");
    address private _bob = makeAddr("bob");

    function setUp() public {
        _registry = new RendererRegistry();
    }

    function testDeploysRegistersAndReturnsActualRenderer() public {
        bytes memory initCode = type(RegistryRenderer).creationCode;

        vm.prank(_alice);
        address renderer = _registry.deployAndRegister(initCode);

        assertGt(renderer.code.length, 0);
        assertEq(_registry.creatorOf(renderer), _alice);
        assertTrue(_registry.isCreator(_alice));
        assertEq(_registry.creatorCount(), 1);
        assertEq(_registry.createdRendererCount(_alice), 1);
        assertEq(_registry.savedRendererCount(_alice), 0);
        assertEq(
            uint8(_registry.registrationKind(_alice, renderer)),
            uint8(IRendererRegistry.RegistrationKind.Created)
        );
        assertEq(_registry.createdRenderers(_alice, 0, 100)[0], renderer);
        assertEq(_registry.creators(0, 100)[0], _alice);
    }

    function testAddsCreatorOnlyOnceAcrossMultipleDeployments() public {
        vm.startPrank(_alice);
        address first = _registry.deployAndRegister(type(RegistryRenderer).creationCode);
        address second = _registry.deployAndRegister(type(RegistryRenderer).creationCode);
        vm.stopPrank();

        assertNotEq(first, second);
        assertEq(_registry.creatorCount(), 1);
        assertEq(_registry.createdRendererCount(_alice), 2);
        address[] memory renderers = _registry.createdRenderers(_alice, 0, 100);
        assertEq(renderers[0], first);
        assertEq(renderers[1], second);
    }

    function testRegistersExistingRendererAsSaved() public {
        RegistryRenderer renderer = new RegistryRenderer();

        vm.prank(_alice);
        _registry.register(address(renderer));

        assertFalse(_registry.isCreator(_alice));
        assertEq(_registry.creatorCount(), 0);
        assertEq(_registry.createdRendererCount(_alice), 0);
        assertEq(_registry.savedRendererCount(_alice), 1);
        assertEq(_registry.savedRenderers(_alice, 0, 100)[0], address(renderer));
        assertEq(
            uint8(_registry.registrationKind(_alice, address(renderer))),
            uint8(IRendererRegistry.RegistrationKind.Saved)
        );
    }

    function testAnotherWalletSavesARegistryCreatedRenderer() public {
        vm.prank(_alice);
        address renderer = _registry.deployAndRegister(type(RegistryRenderer).creationCode);

        vm.prank(_bob);
        _registry.register(renderer);

        assertEq(_registry.createdRendererCount(_alice), 1);
        assertEq(_registry.savedRendererCount(_bob), 1);
        assertEq(_registry.savedRenderers(_bob, 0, 100)[0], renderer);
    }

    function testCreatedRendererReturnsToCreatedListAfterUnregistering() public {
        vm.startPrank(_alice);
        address renderer = _registry.deployAndRegister(type(RegistryRenderer).creationCode);
        _registry.unregister(renderer);
        assertEq(_registry.createdRendererCount(_alice), 0);
        _registry.register(renderer);
        vm.stopPrank();

        assertEq(_registry.createdRendererCount(_alice), 1);
        assertEq(_registry.savedRendererCount(_alice), 0);
    }

    function testUnregisterUsesSwapAndPopForCurrentLists() public {
        RegistryRenderer first = new RegistryRenderer();
        RegistryRenderer second = new RegistryRenderer();

        vm.startPrank(_alice);
        _registry.register(address(first));
        _registry.register(address(second));
        _registry.unregister(address(first));
        vm.stopPrank();

        assertEq(_registry.savedRendererCount(_alice), 1);
        assertEq(_registry.savedRenderers(_alice, 0, 100)[0], address(second));
        assertEq(
            uint8(_registry.registrationKind(_alice, address(first))),
            uint8(IRendererRegistry.RegistrationKind.None)
        );
    }

    function testPaginatesCreatorsAndRenderers() public {
        vm.prank(_alice);
        address first = _registry.deployAndRegister(type(RegistryRenderer).creationCode);
        vm.prank(_alice);
        address second = _registry.deployAndRegister(type(RegistryRenderer).creationCode);
        vm.prank(_bob);
        _registry.deployAndRegister(type(RegistryRenderer).creationCode);

        address[] memory creatorPage = _registry.creators(1, 1);
        address[] memory rendererPage = _registry.createdRenderers(_alice, 1, 1);
        assertEq(creatorPage.length, 1);
        assertEq(creatorPage[0], _bob);
        assertEq(rendererPage.length, 1);
        assertEq(rendererPage[0], second);
        assertNotEq(first, second);
        assertEq(_registry.createdRenderers(_alice, 99, 1).length, 0);
        assertEq(_registry.createdRenderers(_alice, 0, 0).length, 0);
    }

    function testRejectsInvalidRendererAndRollsBackDeployment() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                RendererRegistry.InvalidRendererSchema.selector,
                _registry.rendererSchema(),
                keccak256("wrong")
            )
        );
        vm.prank(_alice);
        _registry.deployAndRegister(type(WrongRegistryRenderer).creationCode);

        assertEq(_registry.creatorCount(), 0);
        assertEq(_registry.createdRendererCount(_alice), 0);
    }

    function testRejectsFailedEmptyOversizedAndDuplicateInputs() public {
        vm.expectRevert(RendererRegistry.EmptyInitCode.selector);
        vm.prank(_alice);
        _registry.deployAndRegister("");

        vm.expectRevert(RendererRegistry.DeploymentFailed.selector);
        vm.prank(_alice);
        _registry.deployAndRegister(type(RevertingRegistryRenderer).creationCode);

        bytes memory oversized = new bytes(_registry.maxInitCodeBytes() + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                RendererRegistry.InitCodeTooLarge.selector,
                _registry.maxInitCodeBytes(),
                oversized.length
            )
        );
        vm.prank(_alice);
        _registry.deployAndRegister(oversized);

        RegistryRenderer renderer = new RegistryRenderer();
        vm.startPrank(_alice);
        _registry.register(address(renderer));
        vm.expectRevert(
            abi.encodeWithSelector(
                RendererRegistry.DuplicateRegistration.selector, _alice, address(renderer)
            )
        );
        _registry.register(address(renderer));
        vm.stopPrank();
    }

    function testRejectsMissingWrongSchemaUnregisteredAndOversizedPage() public {
        vm.expectRevert(
            abi.encodeWithSelector(RendererRegistry.InvalidRenderer.selector, address(0x1234))
        );
        vm.prank(_alice);
        _registry.register(address(0x1234));

        WrongRegistryRenderer wrong = new WrongRegistryRenderer();
        vm.expectRevert(
            abi.encodeWithSelector(
                RendererRegistry.InvalidRendererSchema.selector,
                _registry.rendererSchema(),
                keccak256("wrong")
            )
        );
        vm.prank(_alice);
        _registry.register(address(wrong));

        vm.expectRevert(
            abi.encodeWithSelector(
                RendererRegistry.RendererNotRegistered.selector, _alice, address(wrong)
            )
        );
        vm.prank(_alice);
        _registry.unregister(address(wrong));

        uint256 invalidPageSize = _registry.maxPageSize() + 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                RendererRegistry.InvalidPageSize.selector, _registry.maxPageSize(), invalidPageSize
            )
        );
        _registry.creators(0, invalidPageSize);
    }
}
