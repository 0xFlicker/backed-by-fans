// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ExecuteHolderAirdrop} from "../script/HolderAirdrop.s.sol";
import {HolderAirdrop} from "../src/HolderAirdrop.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";

contract RejectsETH {
    receive() external payable {
        revert("No ETH");
    }
}

contract RejectsMembership {
    receive() external payable {}
}

contract ImportCheckHarness is ExecuteHolderAirdrop {
    function check(
        HolderAirdrop helper,
        address[] memory recipients,
        uint256 start,
        uint256 end,
        address[] memory eth,
        address[] memory memberships
    ) external view {
        _checkImports(helper, recipients, start, end, eth, memberships);
    }
}

contract HolderAirdropTest is Test {
    HolderAirdrop private helper;
    MembershipTier private tier;
    MockUSDG private token;
    address private alice;
    address private bob;
    uint256 private constant PRICE = 1000e6;

    receive() external payable {}

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1_000_000);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        token = new MockUSDG();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(token)
        );
        config.pricePerPeriod = PRICE;
        tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(this), address(token)), token, config
        );
        helper = new HolderAirdrop(address(this), tier, PRICE, 30 days, 0.01 ether);
        token.mint(address(this), 100 * PRICE);
        token.approve(address(helper), 100 * PRICE);
        vm.deal(address(this), 10 ether);
        helper.fund{value: 1 ether}(100 * PRICE);
    }

    function test_giftsOnePaidPeriodAndFullETHBelowThreshold() public {
        vm.deal(alice, 0.005 ether);
        helper.distribute(_one(alice));
        assertEq(alice.balance, 0.015 ether);
        assertEq(tier.balanceOf(alice), 1);
        uint256 id = tier.tokensOfOwner(alice, 0, 1).tokenIds[0];
        assertEq(tier.expiresAt(id), block.timestamp + 30 days);
        (uint64 paid, uint64 granted,) = tier.timeBalances(id);
        assertEq(paid, 30 days);
        assertEq(granted, 0);
        assertEq(tier.lifetimeGross(), PRICE);
        assertEq(token.balanceOf(address(tier)), PRICE);
        assertEq(token.allowance(address(helper), address(tier)), 0);
        assertTrue(helper.ethCompleted(alice));
        assertTrue(helper.membershipCompleted(alice));
    }

    function test_retryCannotRepayAfterSpendingETHAndTransferringMembership() public {
        helper.distribute(_one(alice));
        uint256 id = tier.tokensOfOwner(alice, 0, 1).tokenIds[0];
        vm.prank(alice);
        tier.transferFrom(alice, bob, id);
        vm.deal(alice, 0);
        uint256 funding = token.balanceOf(address(helper));
        helper.distribute(_one(alice));
        assertEq(alice.balance, 0);
        assertEq(tier.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(helper)), funding);
    }

    function test_importedCompletionPreventsDuplicateAfterOldScript() public {
        helper.recordCompleted(_one(alice), true, true);
        helper.distribute(_one(alice));
        assertEq(alice.balance, 0);
        assertEq(tier.balanceOf(alice), 0);
        helper.recordCompleted(_one(alice), true, true);
        assertTrue(helper.membershipCompleted(alice));
    }

    function test_existingMemberStillGetsETHWithoutAnotherMembership() public {
        token.mint(address(this), PRICE);
        token.approve(address(tier), PRICE);
        tier.giftMembership(alice, 1, 256);
        helper.distribute(_one(alice));
        assertEq(alice.balance, 0.01 ether);
        assertEq(tier.balanceOf(alice), 1);
        assertFalse(helper.membershipCompleted(alice));
        assertEq(tier.lifetimeGross(), PRICE);
    }

    function test_ETHAtThresholdIsSkippedWhileMembershipIsGifted() public {
        vm.deal(alice, 0.01 ether);
        helper.distribute(_one(alice));
        assertEq(alice.balance, 0.01 ether);
        assertFalse(helper.ethCompleted(alice));
        assertTrue(helper.membershipCompleted(alice));
    }

    function test_duplicateRecipientsPayOnlyOnce() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = alice;
        helper.distribute(recipients);
        assertEq(alice.balance, 0.01 ether);
        assertEq(tier.balanceOf(alice), 1);
        assertEq(tier.lifetimeGross(), PRICE);
    }

    function test_rejectedETHRollsBackEarlierRecipientAndCompletion() public {
        address rejector = address(new RejectsETH());
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = rejector;
        vm.expectRevert(abi.encodeWithSelector(HolderAirdrop.ETHTransferFailed.selector, rejector));
        helper.distribute(recipients);
        assertEq(alice.balance, 0);
        assertEq(tier.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(helper)), 100 * PRICE);
        assertFalse(helper.ethCompleted(alice));
        assertFalse(helper.membershipCompleted(alice));
        assertEq(token.allowance(address(helper), address(tier)), 0);
        // Isolate the rejecting wallet and continue with a smaller batch.
        helper.distribute(_one(alice));
        assertTrue(helper.membershipCompleted(alice));
    }

    function test_rejectedNFTRollsBackETHAndPaidMembership() public {
        address rejector = address(new RejectsMembership());
        vm.expectRevert();
        helper.distribute(_one(rejector));
        assertEq(rejector.balance, 0);
        assertEq(tier.lifetimeGross(), 0);
        assertFalse(helper.ethCompleted(rejector));
        assertFalse(helper.membershipCompleted(rejector));
        assertEq(token.balanceOf(address(helper)), 100 * PRICE);
    }

    function test_insufficientFundsRollBackETHAndCanRetryAfterFunding() public {
        helper.withdraw(token, token.balanceOf(address(helper)), 0);
        vm.expectRevert();
        helper.distribute(_one(alice));
        assertEq(alice.balance, 0);
        assertFalse(helper.membershipCompleted(alice));
        token.approve(address(helper), PRICE);
        helper.fund(PRICE);
        helper.distribute(_one(alice));
        assertEq(tier.balanceOf(alice), 1);
    }

    function test_operatorCanRecoverUnusedFunds() public {
        vm.prank(alice);
        vm.expectRevert(HolderAirdrop.OperatorOnly.selector);
        helper.withdraw(token, PRICE, 0.01 ether);
        uint256 beforeTokens = token.balanceOf(address(this));
        uint256 beforeETH = address(this).balance;
        helper.withdraw(token, PRICE, 0.01 ether);
        assertEq(token.balanceOf(address(this)), beforeTokens + PRICE);
        assertEq(address(this).balance, beforeETH + 0.01 ether);
    }

    function test_operatorEOACanReceiveGiftFromHelper() public {
        HolderAirdrop other = new HolderAirdrop(alice, tier, PRICE, 30 days, 0.01 ether);
        token.mint(alice, PRICE);
        vm.deal(alice, 0.02 ether);
        vm.startPrank(alice);
        token.approve(address(other), PRICE);
        other.fund{value: 0.02 ether}(PRICE);
        other.distribute(_one(alice));
        vm.stopPrank();
        assertEq(alice.balance, 0.01 ether);
        assertEq(tier.balanceOf(alice), 1);
        assertEq(tier.lifetimeGross(), PRICE);
    }

    function test_nonOperatorCannotDistributeImportOrFund() public {
        vm.startPrank(alice);
        vm.expectRevert(HolderAirdrop.OperatorOnly.selector);
        helper.distribute(_one(alice));
        vm.expectRevert(HolderAirdrop.OperatorOnly.selector);
        helper.recordCompleted(_one(alice), true, true);
        vm.expectRevert(HolderAirdrop.OperatorOnly.selector);
        helper.fund(0);
        vm.stopPrank();
    }

    function test_invalidAndOversizedBatchesRevert() public {
        vm.expectRevert(HolderAirdrop.InvalidBatch.selector);
        helper.distribute(new address[](0));
        vm.expectRevert(HolderAirdrop.InvalidBatch.selector);
        helper.distribute(new address[](26));
        vm.expectRevert(abi.encodeWithSelector(HolderAirdrop.InvalidRecipient.selector, address(0)));
        helper.distribute(_one(address(0)));
        vm.expectRevert(
            abi.encodeWithSelector(HolderAirdrop.InvalidRecipient.selector, address(helper))
        );
        helper.distribute(_one(address(helper)));
    }

    function test_wrongEconomicTermsRejectDeployment() public {
        vm.expectRevert(HolderAirdrop.InvalidConfiguration.selector);
        new HolderAirdrop(address(this), tier, PRICE + 1, 30 days, 0.01 ether);
        vm.expectRevert(HolderAirdrop.InvalidConfiguration.selector);
        new HolderAirdrop(address(this), tier, PRICE, 1 days, 0.01 ether);
    }

    function test_executorDoesNotRequireImportsOutsideSelectedRange() public {
        ImportCheckHarness executor = new ImportCheckHarness();
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = bob;
        // Alice's old deliveries are not imported, but only Bob is being sent to.
        executor.check(helper, recipients, 1, 2, _one(alice), _one(alice));
    }

    function test_executorRequiresETHImportForSelectedLegacyRecipient() public {
        ImportCheckHarness executor = new ImportCheckHarness();
        vm.expectRevert(bytes("Import old ETH progress first"));
        executor.check(helper, _one(alice), 0, 1, _one(alice), new address[](0));
        helper.recordCompleted(_one(alice), true, false);
        executor.check(helper, _one(alice), 0, 1, _one(alice), new address[](0));
    }

    function test_executorRequiresMembershipImportForSelectedLegacyRecipient() public {
        ImportCheckHarness executor = new ImportCheckHarness();
        vm.expectRevert(bytes("Import old membership progress first"));
        executor.check(helper, _one(alice), 0, 1, new address[](0), _one(alice));
        helper.recordCompleted(_one(alice), false, true);
        executor.check(helper, _one(alice), 0, 1, new address[](0), _one(alice));
    }

    function test_fullBatchIsWithinRobinhoodBlockGasBudget() public {
        address[] memory recipients = new address[](25);
        for (uint256 i; i < 25; ++i) {
            recipients[i] = address(uint160(10_000 + i));
        }
        uint256 beforeGas = gasleft();
        helper.distribute(recipients);
        uint256 used = beforeGas - gasleft();
        emit log_named_uint("25-recipient gas", used);
        assertLt(used, 80_000_000);
        assertEq(tier.lifetimeGross(), 25 * PRICE);
    }

    function _one(address recipient) private pure returns (address[] memory result) {
        result = new address[](1);
        result[0] = recipient;
    }
}
