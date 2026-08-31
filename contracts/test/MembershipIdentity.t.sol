// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {IERC5643} from "../src/interfaces/IERC5643.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {NonReceiverWallet} from "./mocks/NonReceiverWallet.sol";

contract MembershipIdentityTest is Test {
    MembershipTier private tier;
    address private member;
    address private other;

    function setUp() public {
        vm.warp(1_000_000);
        member = makeAddr("member");
        other = makeAddr("other");

        MockUSDG token = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            address(this), token, 1, address(renderer), address(renderer).codehash, _config()
        );
    }

    function test_grantsMintOnePersistentSequentialCredentialPerRecipient() public {
        uint256 firstToken = tier.grantTime(member, 1);
        uint256 sameToken = tier.grantTime(member, 2);
        uint256 secondToken = tier.grantTime(other, 1);

        assertEq(firstToken, 1);
        assertEq(sameToken, firstToken);
        assertEq(secondToken, 2);
        assertEq(tier.totalMinted(), 2);
        assertEq(tier.tokenOf(member), firstToken);
        assertEq(tier.tokenOf(other), secondToken);
        assertEq(tier.ownerOf(firstToken), member);
        assertEq(tier.balanceOf(member), 1);
        assertEq(tier.expiresAt(firstToken), block.timestamp + 90 days);
        assertTrue(tier.locked(firstToken));
    }

    function test_nonSafeMintSupportsContractWalletWithoutReceiverCallback() public {
        NonReceiverWallet wallet = new NonReceiverWallet();

        uint256 tokenId = tier.grantTime(address(wallet), 1);

        assertEq(tier.ownerOf(tokenId), address(wallet));
        assertEq(tier.balanceOf(address(wallet)), 1);
        assertTrue(tier.isActive(address(wallet)));
    }

    function test_allApprovalAndTransferRoutesRemainSoulbound() public {
        uint256 tokenId = tier.grantTime(member, 1);

        vm.prank(member);
        vm.expectRevert(MembershipTier.Soulbound.selector);
        tier.approve(other, tokenId);

        vm.prank(member);
        vm.expectRevert(MembershipTier.Soulbound.selector);
        tier.setApprovalForAll(other, true);

        vm.prank(member);
        vm.expectRevert(MembershipTier.Soulbound.selector);
        tier.transferFrom(member, other, tokenId);

        vm.prank(member);
        vm.expectRevert(MembershipTier.Soulbound.selector);
        tier.safeTransferFrom(member, other, tokenId);

        vm.prank(member);
        vm.expectRevert(MembershipTier.Soulbound.selector);
        tier.safeTransferFrom(member, other, tokenId, hex"1234");

        assertEq(tier.ownerOf(tokenId), member);
        assertEq(tier.getApproved(tokenId), address(0));
        assertFalse(tier.isApprovedForAll(member, other));
    }

    function test_expirationDoesNotEraseHistoricalErc721Ownership() public {
        uint256 tokenId = tier.grantTime(member, 1);
        vm.warp(tier.expiresAt(tokenId));

        assertFalse(tier.isActive(member));
        assertEq(tier.activeBalanceOf(member), 0);
        assertEq(tier.ownerOf(tokenId), member);
        assertEq(tier.balanceOf(member), 1);
        assertEq(tier.tokenOf(member), tokenId);
    }

    function test_nativeEthIsRejectedByAdaptersAndFallback() public {
        uint256 tokenId = tier.grantTime(member, 1);
        vm.deal(member, 3 ether);

        vm.prank(member);
        vm.expectRevert(MembershipTier.NativeValueRejected.selector);
        tier.renewSubscription{value: 1 ether}(tokenId, 30 days);

        vm.prank(member);
        vm.expectRevert(MembershipTier.NativeValueRejected.selector);
        tier.cancelSubscription{value: 1 ether}(tokenId);

        vm.prank(member);
        (bool success,) = address(tier).call{value: 1 ether}("");

        assertFalse(success);
        assertEq(address(tier).balance, 0);
    }

    function test_supportsPublishedMembershipInterfaces() public view {
        assertTrue(tier.supportsInterface(type(IERC721).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC5643).interfaceId));
        assertTrue(tier.supportsInterface(0x49064906));
        assertFalse(tier.supportsInterface(0xffffffff));
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        return MembershipTestConfig.defaultConfig(address(this));
    }
}
