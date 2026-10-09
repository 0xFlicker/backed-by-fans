// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {AuthorizeGasliteDrop} from "../script/AuthorizeGasliteDrop.s.sol";
import {GasliteDrop} from "../src/GasliteDrop.sol";
import {
    IAirdropCreatorCollection,
    IAirdropTransferRegistry
} from "../src/interfaces/external/IAirdropTransferRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Test} from "forge-std/Test.sol";

contract AirdropTestNFT is ERC721 {
    constructor() ERC721("Test", "TEST") {}

    function mint(address recipient, uint256 id) external {
        _mint(recipient, id);
    }
}

contract AirdropTestToken is ERC20 {
    constructor() ERC20("Test", "TEST") {}

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}

contract NonReceivingContract {}

contract RejectsETH {
    receive() external payable {
        revert("Rejected");
    }
}

contract GasliteDropTest is Test {
    GasliteDrop internal helper;
    AirdropTestNFT internal nft;
    address internal sender;
    address internal alice;
    address internal bob;

    function setUp() public {
        helper = new GasliteDrop();
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

    function test_atomicBatch() public {
        (address[] memory r, uint256[] memory ids) = rows(bob);
        vm.prank(sender);
        helper.airdropERC721(address(nft), r, ids);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(2), bob);
        assertEq(nft.balanceOf(address(helper)), 0);
    }

    function test_cannotUseAnotherWalletsApproval() public {
        (address[] memory r, uint256[] memory ids) = rows(bob);
        vm.prank(bob);
        vm.expectRevert();
        helper.airdropERC721(address(nft), r, ids);
        assertEq(nft.ownerOf(1), sender);
    }

    function test_standardTransferDoesNotRequireReceiverHook() public {
        address recipient = address(new NonReceivingContract());
        (address[] memory r, uint256[] memory ids) = rows(recipient);
        vm.prank(sender);
        helper.airdropERC721(address(nft), r, ids);
        assertEq(nft.ownerOf(2), recipient);
    }

    function test_duplicateTokenRevertsAtomically() public {
        (address[] memory r, uint256[] memory ids) = rows(bob);
        ids[1] = ids[0];
        vm.prank(sender);
        vm.expectRevert();
        helper.airdropERC721(address(nft), r, ids);
        assertEq(nft.ownerOf(1), sender);
    }

    function test_zeroRecipientRevertsAtomically() public {
        (address[] memory r, uint256[] memory ids) = rows(address(0));
        vm.prank(sender);
        vm.expectRevert();
        helper.airdropERC721(address(nft), r, ids);
        assertEq(nft.ownerOf(1), sender);
    }

    function test_mismatchedArraysRejected() public {
        (address[] memory r,) = rows(bob);
        vm.expectRevert();
        helper.airdropERC721(address(nft), r, new uint256[](1));
    }

    function test_noCodeCollectionProducesNoDeliveryProof() public {
        (address[] memory r, uint256[] memory ids) = rows(bob);
        vm.recordLogs();
        vm.prank(sender);
        helper.airdropERC721(alice, r, ids);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(nft.ownerOf(1), sender);
    }

    function test_revokedApprovalBlocksTransfers() public {
        vm.prank(sender);
        nft.setApprovalForAll(address(helper), false);
        (address[] memory r, uint256[] memory ids) = rows(bob);
        vm.prank(sender);
        vm.expectRevert();
        helper.airdropERC721(address(nft), r, ids);
    }

    function test_fullPageBatch() public {
        address[] memory r = new address[](200);
        uint256[] memory ids = new uint256[](200);
        for (uint256 i; i < 200; ++i) {
            ids[i] = i + 1;
            r[i] = alice;
            if (i >= 2) nft.mint(sender, i + 1);
        }
        vm.prank(sender);
        helper.airdropERC721(address(nft), r, ids);
        assertEq(nft.balanceOf(alice), 200);
        assertEq(nft.balanceOf(sender), 0);
    }

    function testFuzz_giftsOwnedToken(uint256 id, address recipient) public {
        vm.assume(
            id > 2 && recipient != address(0) && recipient != sender && recipient != address(helper)
        );
        vm.assume(recipient.code.length == 0);
        nft.mint(sender, id);
        address[] memory r = new address[](1);
        uint256[] memory ids = new uint256[](1);
        r[0] = recipient;
        ids[0] = id;
        vm.prank(sender);
        helper.airdropERC721(address(nft), r, ids);
        assertEq(nft.ownerOf(id), recipient);
    }

    function test_ERC20Distribution() public {
        AirdropTestToken token = new AirdropTestToken();
        token.mint(sender, 100);
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 40;
        amounts[1] = 60;
        vm.startPrank(sender);
        token.approve(address(helper), 100);
        helper.airdropERC20(address(token), r, amounts, 100);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 40);
        assertEq(token.balanceOf(bob), 60);
        assertEq(token.balanceOf(address(helper)), 0);
    }

    function test_ETHDistributionAndAtomicFailure() public {
        vm.deal(sender, 2 ether);
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = address(new RejectsETH());
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0.4 ether;
        amounts[1] = 0.6 ether;
        vm.prank(sender);
        vm.expectRevert();
        helper.airdropETH{value: 1 ether}(r, amounts);
        assertEq(alice.balance, 0);
        r[1] = bob;
        vm.prank(sender);
        helper.airdropETH{value: 1 ether}(r, amounts);
        assertEq(alice.balance, 0.4 ether);
        assertEq(bob.balance, 0.6 ether);
    }
}

/// @dev Run explicitly with --fork-url; no writes reach the upstream chain.
contract GasliteDropMainnetForkTest is Test {
    function test_actualCollectionRejectsUnlistedHelper() public {
        vm.skip(block.chainid != 4663);
        IERC721 collection = IERC721(0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747);
        GasliteDrop helper = new GasliteDrop();
        address holder = collection.ownerOf(1);
        address recipient = makeAddr("fork-recipient");
        address[] memory recipients = new address[](1);
        uint256[] memory ids = new uint256[](1);
        recipients[0] = recipient;
        ids[0] = 1;
        vm.startPrank(holder);
        collection.setApprovalForAll(address(helper), true);
        // Gaslite deliberately discards the validator's revert data.
        vm.expectRevert();
        helper.airdropERC721(address(collection), recipients, ids);
        vm.stopPrank();
        assertEq(collection.ownerOf(1), holder);
    }

    function test_creatorWhitelistPreservesListsAndEnablesTransfer() public {
        vm.skip(block.chainid != 4663);
        IERC721 collection = IERC721(0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747);
        IAirdropCreatorCollection creatorCollection = IAirdropCreatorCollection(address(collection));
        GasliteDrop helper = new GasliteDrop();
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
        new AuthorizeGasliteDrop().run();
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
        helper.airdropERC721(address(collection), recipients, ids);
        vm.stopPrank();
        assertEq(collection.ownerOf(1), recipient);
    }
}
