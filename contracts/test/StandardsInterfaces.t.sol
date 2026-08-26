// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {IERC5643} from "../src/interfaces/IERC5643.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract StandardsInterfacesTest is Test {
    function test_erc5192InterfaceIdMatchesPublishedStandard() public pure {
        assertEq(type(IERC5192).interfaceId, bytes4(0xb45a3c0e));
    }

    function test_erc5643InterfaceIdMatchesPublishedStandard() public pure {
        assertEq(type(IERC5643).interfaceId, bytes4(0x8c65f84d));
    }

    function test_mockUSDGProvidesExpectedERC20Behavior() public {
        MockUSDG token = new MockUSDG();
        address supporter = makeAddr("supporter");

        token.mint(address(this), 12_000_000);
        assertTrue(token.transfer(supporter, 2_000_000));

        assertEq(token.name(), "Mock USDG");
        assertEq(token.symbol(), "USDG");
        assertEq(token.decimals(), 6);
        assertEq(token.balanceOf(address(this)), 10_000_000);
        assertEq(token.balanceOf(supporter), 2_000_000);
        assertEq(token.totalSupply(), 12_000_000);
    }
}
