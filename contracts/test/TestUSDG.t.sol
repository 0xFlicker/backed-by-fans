// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {TestUSDG} from "../src/TestUSDG.sol";
import {Test} from "forge-std/Test.sol";

contract TestUSDGTest is Test {
    TestUSDG token;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        vm.chainId(31_337);
        token = new TestUSDG();
    }

    function testMetadataAndInitialSupply() public view {
        assertEq(token.name(), "TestUSDG");
        assertEq(token.symbol(), "bUSD");
        assertEq(token.decimals(), 6);
        assertEq(token.totalSupply(), 0);
    }

    function testClaimAndExactCooldownBoundary() public {
        vm.prank(alice);
        token.claim();
        uint256 next = token.nextClaimAt(alice);
        assertEq(token.balanceOf(alice), 100e6);
        assertEq(next, block.timestamp + 1 days);
        vm.warp(next - 1);
        vm.expectRevert(abi.encodeWithSelector(TestUSDG.CooldownActive.selector, next));
        vm.prank(alice);
        token.claim();
        vm.warp(next);
        vm.prank(alice);
        token.claim();
        assertEq(token.balanceOf(alice), 200e6);
    }

    function testTransferDoesNotResetCooldownAndWalletsClaimIndependently() public {
        vm.startPrank(alice);
        token.claim();
        assertTrue(token.transfer(bob, 100e6));
        vm.expectRevert();
        token.claim();
        vm.stopPrank();
        vm.prank(bob);
        token.claim();
        assertEq(token.balanceOf(bob), 200e6);
        assertEq(token.totalSupply(), 200e6);
    }

    function testFuzzClaimAmount(address account) public {
        vm.assume(account != address(0));
        vm.prank(account);
        token.claim();
        assertEq(token.balanceOf(account), 100e6);
    }

    function testRejectsMainnetDeployment() public {
        vm.chainId(4663);
        vm.expectRevert(abi.encodeWithSelector(TestUSDG.UnsupportedChain.selector, 4663));
        new TestUSDG();
    }
}
