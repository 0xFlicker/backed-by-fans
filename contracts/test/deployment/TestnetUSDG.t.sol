// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

import {TestnetUSDG} from "../../src/TestnetUSDG.sol";

contract TestnetUSDGTest is Test {
    uint256 private constant _TESTNET_CHAIN_ID = 46_630;
    address private constant _DEPLOYER = 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027;

    function setUp() public {
        vm.chainId(_TESTNET_CHAIN_ID);
    }

    function test_metadataOwnerAndUnlimitedDeployerMinting() public {
        vm.prank(_DEPLOYER, _DEPLOYER);
        TestnetUSDG token = new TestnetUSDG();
        address recipient = makeAddr("recipient");

        assertEq(token.name(), "LOL Dollar");
        assertEq(token.symbol(), "USDG");
        assertEq(token.decimals(), 6);
        assertEq(token.owner(), _DEPLOYER);

        vm.prank(_DEPLOYER);
        token.mint(recipient, 100e6);
        vm.prank(_DEPLOYER);
        token.mint(recipient, type(uint128).max);
        assertEq(token.balanceOf(recipient), 100e6 + uint256(type(uint128).max));
    }

    function test_nonOwnerCannotMint() public {
        vm.prank(_DEPLOYER, _DEPLOYER);
        TestnetUSDG token = new TestnetUSDG();
        address unauthorized = makeAddr("unauthorized");

        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        token.mint(unauthorized, 1);
    }

    function test_deploymentRejectsWrongChainAndOrigin() public {
        vm.chainId(4663);
        vm.prank(_DEPLOYER, _DEPLOYER);
        vm.expectRevert(abi.encodeWithSelector(TestnetUSDG.UnsupportedChain.selector, 4663));
        new TestnetUSDG();

        vm.chainId(_TESTNET_CHAIN_ID);
        address unauthorized = makeAddr("unauthorized");
        vm.prank(unauthorized, unauthorized);
        vm.expectRevert(abi.encodeWithSelector(TestnetUSDG.UnauthorizedDeploymentOrigin.selector, unauthorized));
        new TestnetUSDG();
    }
}
