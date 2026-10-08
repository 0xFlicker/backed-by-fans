// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {AuthorizeERC721Airdrop} from "../script/AuthorizeERC721Airdrop.s.sol";
import {ERC721Airdrop} from "../src/ERC721Airdrop.sol";
import {
    IAirdropCreatorCollection,
    IAirdropTransferRegistry
} from "../src/interfaces/external/IAirdropTransferRegistry.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Test} from "forge-std/Test.sol";

contract AirdropTestNFT is ERC721 {
    constructor() ERC721("Test", "TEST") {}

    function mint(address recipient, uint256 id) external {
        _mint(recipient, id);
    }
}

contract RejectsAirdrop {}

contract AcceptsAirdrop is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract ERC721AirdropTest is Test {
    ERC721Airdrop internal helper;
    AirdropTestNFT internal nft;
    address internal sender;
    address internal alice;
    address internal bob;

    function setUp() public {
        helper = new ERC721Airdrop();
        nft = new AirdropTestNFT();
        sender = makeAddr("sender");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        nft.mint(sender, 1);
        nft.mint(sender, 2);
        vm.prank(sender);
        nft.setApprovalForAll(address(helper), true);
    }

    function rows(address second)
        internal
        view
        returns (address[] memory recipients, uint256[] memory ids)
    {
        recipients = new address[](2);
        ids = new uint256[](2);
        recipients[0] = alice;
        recipients[1] = second;
        ids[0] = 1;
        ids[1] = 2;
    }

    function test_atomicBatchAndReceiptCommitment() public {
        (address[] memory recipients, uint256[] memory ids) = rows(bob);
        vm.expectEmit(true, true, true, true, address(helper));
        emit ERC721Airdrop.Airdropped(
            sender, address(nft), keccak256(abi.encode(recipients, ids)), 2
        );
        vm.prank(sender);
        helper.airdropERC721(nft, recipients, ids);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(2), bob);
        assertEq(nft.balanceOf(address(helper)), 0);
    }

    function test_cannotUseAnotherWalletsApproval() public {
        (address[] memory recipients, uint256[] memory ids) = rows(bob);
        vm.expectRevert();
        vm.prank(bob);
        helper.airdropERC721(nft, recipients, ids);
        assertEq(nft.ownerOf(1), sender);
    }

    function test_rejectingReceiverRollsBackEntireBatch() public {
        (address[] memory recipients, uint256[] memory ids) = rows(address(new RejectsAirdrop()));
        vm.expectRevert();
        vm.prank(sender);
        helper.airdropERC721(nft, recipients, ids);
        assertEq(nft.ownerOf(1), sender);
        assertEq(nft.ownerOf(2), sender);
    }

    function test_acceptingContractReceiver() public {
        address receiver = address(new AcceptsAirdrop());
        (address[] memory recipients, uint256[] memory ids) = rows(receiver);
        vm.prank(sender);
        helper.airdropERC721(nft, recipients, ids);
        assertEq(nft.ownerOf(2), receiver);
    }

    function test_duplicateTokenRevertsAtomically() public {
        (address[] memory recipients, uint256[] memory ids) = rows(bob);
        ids[1] = ids[0];
        vm.expectRevert();
        vm.prank(sender);
        helper.airdropERC721(nft, recipients, ids);
        assertEq(nft.ownerOf(1), sender);
    }

    function test_selfZeroAndHelperRecipientsRejected() public {
        address[3] memory invalid = [sender, address(0), address(helper)];
        for (uint256 i; i < invalid.length; ++i) {
            (address[] memory recipients, uint256[] memory ids) = rows(invalid[i]);
            vm.expectRevert(abi.encodeWithSelector(ERC721Airdrop.InvalidRecipient.selector, 1));
            vm.prank(sender);
            helper.airdropERC721(nft, recipients, ids);
            assertEq(nft.ownerOf(1), sender);
        }
    }

    function test_emptyMismatchOversizeAndNoCodeRejected() public {
        address[] memory recipients = new address[](0);
        uint256[] memory ids = new uint256[](0);
        vm.expectRevert(ERC721Airdrop.InvalidBatch.selector);
        helper.airdropERC721(nft, recipients, ids);
        (recipients, ids) = rows(bob);
        vm.expectRevert(ERC721Airdrop.InvalidBatch.selector);
        helper.airdropERC721(nft, recipients, new uint256[](1));
        vm.expectRevert(ERC721Airdrop.InvalidBatch.selector);
        helper.airdropERC721(nft, new address[](201), new uint256[](201));
        vm.expectRevert(ERC721Airdrop.InvalidCollection.selector);
        helper.airdropERC721(IERC721(alice), recipients, ids);
    }

    function test_revokedApprovalBlocksTransfers() public {
        vm.prank(sender);
        nft.setApprovalForAll(address(helper), false);
        (address[] memory recipients, uint256[] memory ids) = rows(bob);
        vm.expectRevert();
        vm.prank(sender);
        helper.airdropERC721(nft, recipients, ids);
    }

    function test_fullBatchAtLimit() public {
        address[] memory recipients = new address[](200);
        uint256[] memory ids = new uint256[](200);
        for (uint256 i; i < 200; ++i) {
            ids[i] = i + 1;
            recipients[i] = alice;
            if (i >= 2) nft.mint(sender, i + 1);
        }
        vm.prank(sender);
        helper.airdropERC721(nft, recipients, ids);
        assertEq(nft.balanceOf(alice), 200);
        assertEq(nft.balanceOf(sender), 0);
    }

    function testFuzz_giftsOwnedToken(uint256 id, address recipient) public {
        vm.assume(
            id > 2 && recipient != address(0) && recipient != sender && recipient != address(helper)
        );
        vm.assume(recipient.code.length == 0);
        nft.mint(sender, id);
        address[] memory recipients = new address[](1);
        uint256[] memory ids = new uint256[](1);
        recipients[0] = recipient;
        ids[0] = id;
        vm.prank(sender);
        helper.airdropERC721(nft, recipients, ids);
        assertEq(nft.ownerOf(id), recipient);
    }
}

/// @dev Run explicitly with --fork-url; no writes reach the upstream chain.
contract ERC721AirdropMainnetForkTest is Test {
    function test_actualCollectionRejectsUnlistedHelper() public {
        vm.skip(block.chainid != 4663);
        IERC721 collection = IERC721(0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747);
        ERC721Airdrop helper = new ERC721Airdrop();
        address holder = collection.ownerOf(1);
        address recipient = makeAddr("fork-recipient");
        address[] memory recipients = new address[](1);
        uint256[] memory ids = new uint256[](1);
        recipients[0] = recipient;
        ids[0] = 1;
        vm.startPrank(holder);
        collection.setApprovalForAll(address(helper), true);
        vm.expectRevert(
            bytes4(keccak256("StrictAuthorizedTransferSecurityRegistry__UnauthorizedTransfer()"))
        );
        helper.airdropERC721(collection, recipients, ids);
        vm.stopPrank();
        assertEq(collection.ownerOf(1), holder);
    }

    function test_creatorWhitelistPreservesListsAndEnablesTransfer() public {
        vm.skip(block.chainid != 4663);
        IERC721 collection = IERC721(0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747);
        IAirdropCreatorCollection creatorCollection = IAirdropCreatorCollection(address(collection));
        ERC721Airdrop helper = new ERC721Airdrop();
        IAirdropTransferRegistry registry =
            IAirdropTransferRegistry(creatorCollection.getTransferValidator());
        address[] memory whitelist =
            registry.getWhitelistedAccountsByCollection(address(collection));
        address[] memory blacklist =
            registry.getBlacklistedAccountsByCollection(address(collection));
        address[] memory authorizers =
            registry.getAuthorizerAccountsByCollection(address(collection));
        vm.setEnv("AIRDROP_HELPER", vm.toString(address(helper)));
        vm.setEnv("AIRDROP_CREATOR", vm.toString(creatorCollection.owner()));
        new AuthorizeERC721Airdrop().run();
        assertEq(registry.getBlacklistedAccountsByCollection(address(collection)), blacklist);
        assertEq(registry.getAuthorizerAccountsByCollection(address(collection)), authorizers);
        address[] memory copiedWhitelist =
            registry.getWhitelistedAccountsByCollection(address(collection));
        assertEq(copiedWhitelist.length, whitelist.length + 1);
        for (uint256 i; i < whitelist.length; ++i) {
            assertEq(copiedWhitelist[i], whitelist[i]);
        }

        address holder = collection.ownerOf(1);
        address recipient = makeAddr("fork-recipient");
        address[] memory recipients = new address[](1);
        uint256[] memory ids = new uint256[](1);
        recipients[0] = recipient;
        ids[0] = 1;
        vm.startPrank(holder);
        collection.setApprovalForAll(address(helper), true);
        helper.airdropERC721(collection, recipients, ids);
        vm.stopPrank();
        assertEq(collection.ownerOf(1), recipient);
    }
}
