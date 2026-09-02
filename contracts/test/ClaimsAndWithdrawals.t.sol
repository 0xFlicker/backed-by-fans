// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {MembershipTierHarness} from "./mocks/MembershipTierHarness.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract ClaimsAndWithdrawalsTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    address private member;
    address private referrer;
    address private stranger;
    address private nextOwner;

    function setUp() public {
        member = makeAddr("member");
        referrer = makeAddr("referrer");
        stranger = makeAddr("stranger");
        nextOwner = makeAddr("nextOwner");

        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            address(this),
            paymentToken,
            MembershipTestConfig.defaultConfig(
                address(this), address(renderer), address(paymentToken)
            )
        );
        paymentToken.mint(member, 100_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_fixedDestinationsClaimAllPaymentLiabilities() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, referrer);

        uint256 ownerBefore = paymentToken.balanceOf(address(this));
        assertEq(tier.withdrawCreatorProceeds(), 9_300_000);
        assertEq(paymentToken.balanceOf(address(this)) - ownerBefore, 9_300_000);

        vm.prank(stranger);
        assertEq(tier.claimReferral(), 0);
        assertEq(tier.claimableReferral(referrer), 100_000);

        vm.prank(referrer);
        assertEq(tier.claimReferral(), 100_000);
        assertEq(paymentToken.balanceOf(referrer), 100_000);

        vm.prank(stranger);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.claimReward(tokenId);

        vm.prank(member);
        assertEq(tier.claimReward(tokenId), 500_000);
        assertEq(paymentToken.balanceOf(address(tier)), 0);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.rewardReserve(), 0);
        assertEq(tier.totalReferralLiability(), 0);
        assertEq(tier.totalProtectedLiability(), 0);
    }

    function test_creatorWithdrawalCannotConsumeRewardOrReferralLiabilities() public {
        vm.prank(member);
        tier.purchase(2, referrer);

        assertEq(tier.withdrawCreatorProceeds(), 18_600_000);

        assertEq(paymentToken.balanceOf(address(tier)), 1_200_000);
        assertEq(tier.rewardReserve(), 1_000_000);
        assertEq(tier.totalReferralLiability(), 200_000);
        assertEq(tier.totalProtectedLiability(), 1_200_000);
    }

    function test_currentOwnerReceivesPreexistingCreatorProceedsAfterTwoStepTransfer() public {
        vm.prank(member);
        tier.purchase(1, address(0));

        tier.transferOwnership(nextOwner);
        vm.prank(nextOwner);
        tier.acceptOwnership();

        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this))
        );
        tier.withdrawCreatorProceeds();

        vm.prank(nextOwner);
        assertEq(tier.withdrawCreatorProceeds(), 9_400_000);
        assertEq(paymentToken.balanceOf(nextOwner), 9_400_000);
    }

    function test_claimsAndWithdrawalsRemainAvailableWhilePaused() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, referrer);
        tier.setPaused(true);

        assertEq(tier.withdrawCreatorProceeds(), 9_300_000);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), 100_000);
        vm.prank(member);
        assertEq(tier.claimReward(tokenId), 500_000);
        assertEq(paymentToken.balanceOf(address(tier)), 0);
    }

    function test_twoTokenClaimsAndRefundsRemainIndependent() public {
        MockUSDG secondToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory secondConfig = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(secondToken)
        );
        secondConfig.tierSalt = keccak256("second-claims-token");
        MembershipTier secondTier = new MembershipTier(address(this), secondToken, secondConfig);
        address secondMember = makeAddr("secondMember");
        address secondReferrer = makeAddr("secondReferrer");
        secondToken.mint(secondMember, secondConfig.pricePerPeriod);
        vm.prank(secondMember);
        secondToken.approve(address(secondTier), type(uint256).max);

        vm.prank(member);
        uint256 firstTokenId = tier.purchase(1, referrer);
        vm.prank(secondMember);
        uint256 secondTokenId = secondTier.purchase(1, secondReferrer);

        uint256 secondBalanceBefore = secondToken.balanceOf(address(secondTier));
        uint256 secondCreatorBefore = secondTier.creatorProceeds();
        uint256 secondRewardBefore = secondTier.rewardReserve();
        uint256 secondReferralBefore = secondTier.totalReferralLiability();

        tier.withdrawCreatorProceeds();
        vm.prank(referrer);
        tier.claimReferral();
        vm.prank(member);
        tier.claimReward(firstTokenId);

        assertEq(secondToken.balanceOf(address(secondTier)), secondBalanceBefore);
        assertEq(secondTier.creatorProceeds(), secondCreatorBefore);
        assertEq(secondTier.rewardReserve(), secondRewardBefore);
        assertEq(secondTier.totalReferralLiability(), secondReferralBefore);

        (uint256 refundAmount, uint256 ownerTopUp) = secondTier.previewRefund(secondTokenId);
        secondToken.mint(address(this), ownerTopUp);
        secondToken.approve(address(secondTier), ownerTopUp);
        uint256 firstTokenBalanceBefore = paymentToken.balanceOf(address(tier));
        secondTier.refund(secondTokenId, refundAmount, ownerTopUp);

        assertEq(paymentToken.balanceOf(address(tier)), firstTokenBalanceBefore);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.rewardReserve(), 0);
        assertEq(tier.totalReferralLiability(), 0);
        assertEq(secondTier.creatorProceeds(), 0);
        assertEq(secondTier.rewardReserve(), secondRewardBefore);
        assertEq(secondTier.totalReferralLiability(), secondReferralBefore);
    }
}

contract ReentrantRewardClaimant {
    AdversarialERC20 private immutable _token;
    MembershipTier private immutable _tier;

    uint256 public tokenId;
    uint256 public callbackAttempts;
    bool public reentrySucceeded;

    constructor(AdversarialERC20 token, MembershipTier tier) {
        _token = token;
        _tier = tier;
    }

    function purchase() external {
        _token.approve(address(_tier), type(uint256).max);
        tokenId = _tier.purchase(1, address(0));
    }

    function claim() external returns (uint256 amount) {
        amount = _tier.claimReward(tokenId);
    }

    function reenterClaim() external {
        ++callbackAttempts;
        (reentrySucceeded,) =
            address(_tier).call(abi.encodeCall(MembershipTier.claimReward, (tokenId)));
    }
}

contract AdversarialPaymentsAndExitsTest is Test {
    AdversarialERC20 private paymentToken;
    MembershipTierHarness private tier;
    address private feeVault;
    address private member;
    address private referrer;
    uint64 private observedPaidSeconds;
    uint64 private observedCheckpoint;

    function setUp() public {
        feeVault = makeAddr("feeVault");
        member = makeAddr("member");
        referrer = makeAddr("referrer");
        paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTierHarness(
            feeVault,
            paymentToken,
            address(renderer),
            MembershipTestConfig.defaultConfig(
                address(this), address(renderer), address(paymentToken)
            )
        );
        paymentToken.mint(member, 100_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_falseRevertingShortTaxedAndFrozenInboundTransfersLeaveNoState() public {
        _expectFailedInbound(
            AdversarialERC20.Behavior.ReturnFalse,
            abi.encodeWithSelector(
                bytes4(keccak256("SafeERC20FailedOperation(address)")), address(paymentToken)
            )
        );
        _expectFailedInbound(
            AdversarialERC20.Behavior.RevertTransfer,
            abi.encodeWithSelector(AdversarialERC20.ForcedTransferRevert.selector)
        );
        _expectFailedInbound(
            AdversarialERC20.Behavior.ShortTransfer,
            abi.encodeWithSelector(MembershipTier.InexactTokenTransfer.selector)
        );
        _expectFailedInbound(
            AdversarialERC20.Behavior.TaxedTransfer,
            abi.encodeWithSelector(MembershipTier.InexactTokenTransfer.selector)
        );

        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
        paymentToken.setFrozen(member, true);
        vm.prank(member);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.purchase(1, address(0));
        _assertNoPaymentState();
    }

    function test_failedProtocolDeliveryRevertsInboundTimeAndEconomics() public {
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.ReturnFalse);

        vm.prank(member);
        vm.expectRevert();
        tier.purchase(1, referrer);

        _assertNoPaymentState();
        assertEq(paymentToken.balanceOf(member), 100_000_000);
        assertEq(paymentToken.balanceOf(address(tier)), 0);
        assertEq(paymentToken.balanceOf(feeVault), 0);

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.TaxedTransfer);
        vm.prank(member);
        vm.expectRevert(MembershipTier.InexactTokenTransfer.selector);
        tier.purchase(1, referrer);
        _assertNoPaymentState();
    }

    function test_reentrantInboundAndProtocolCallbacksCannotDoublePurchase() public {
        paymentToken.setCallback(
            address(tier), abi.encodeCall(MembershipTier.purchase, (uint64(1), address(0)))
        );
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Callback);
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Callback);

        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));

        assertEq(paymentToken.callbackAttempts(), 2);
        assertFalse(paymentToken.lastCallbackSucceeded());
        assertEq(tier.sharesOf(tokenId), 10_000_000);
        assertEq(tier.expiresAt(tokenId), block.timestamp + 30 days);
        assertEq(tier.totalShares(), 10_000_000);
    }

    function test_existingMemberTimeIsCheckpointedBeforeInboundTokenCallback() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));
        vm.warp(block.timestamp + 10 days);

        paymentToken.setCallback(address(this), abi.encodeCall(this.observeStoredTime, (tokenId)));
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Callback);

        vm.prank(member);
        tier.purchase(1, address(0));

        assertEq(observedPaidSeconds, 20 days);
        assertEq(observedCheckpoint, block.timestamp);
        assertEq(tier.expiresAt(tokenId), block.timestamp + 50 days);
    }

    function observeStoredTime(uint256 tokenId) external {
        assertEq(msg.sender, address(paymentToken));
        MembershipTypes.MembershipState memory state = tier.storedTimeState(tokenId);
        observedPaidSeconds = state.paidSeconds;
        observedCheckpoint = state.checkpoint;
    }

    function test_failedCreatorRewardAndReferralExitsRestoreLiabilities() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, referrer);
        uint256 tierBalance = paymentToken.balanceOf(address(tier));

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.ReturnFalse);
        vm.expectRevert();
        tier.withdrawCreatorProceeds();
        assertEq(tier.creatorProceeds(), 9_300_000);

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.RevertTransfer);
        vm.expectRevert(AdversarialERC20.ForcedTransferRevert.selector);
        tier.withdrawCreatorProceeds();
        assertEq(tier.creatorProceeds(), 9_300_000);

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.ShortTransfer);
        vm.prank(member);
        vm.expectRevert(MembershipTier.InexactTokenTransfer.selector);
        tier.claimReward(tokenId);
        assertEq(tier.rewardReserve(), 500_000);
        assertEq(tier.claimableReward(tokenId), 500_000);

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        paymentToken.setFrozen(referrer, true);
        vm.prank(referrer);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.claimReferral();
        assertEq(tier.claimableReferral(referrer), 100_000);
        assertEq(tier.totalReferralLiability(), 100_000);
        assertEq(paymentToken.balanceOf(address(tier)), tierBalance);
    }

    function test_failedRewardAndReferralClaimsDoNotAffectAnotherClaimant() public {
        address secondMember = makeAddr("secondMember");
        address secondReferrer = makeAddr("secondReferrer");
        paymentToken.mint(secondMember, 10_000_000);
        vm.prank(secondMember);
        paymentToken.approve(address(tier), type(uint256).max);

        vm.prank(member);
        uint256 firstTokenId = tier.purchase(1, referrer);
        vm.prank(secondMember);
        uint256 secondTokenId = tier.purchase(1, secondReferrer);

        uint256 firstReward = tier.claimableReward(firstTokenId);
        uint256 secondReward = tier.claimableReward(secondTokenId);
        paymentToken.setFrozen(member, true);
        vm.prank(member);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.claimReward(firstTokenId);
        assertEq(tier.claimableReward(firstTokenId), firstReward);
        assertEq(tier.claimableReward(secondTokenId), secondReward);

        vm.prank(secondMember);
        assertEq(tier.claimReward(secondTokenId), secondReward);
        assertEq(tier.claimableReward(firstTokenId), firstReward);

        uint256 firstReferral = tier.claimableReferral(referrer);
        uint256 secondReferral = tier.claimableReferral(secondReferrer);
        paymentToken.setFrozen(referrer, true);
        vm.prank(referrer);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.claimReferral();
        assertEq(tier.claimableReferral(referrer), firstReferral);
        assertEq(tier.claimableReferral(secondReferrer), secondReferral);

        vm.prank(secondReferrer);
        assertEq(tier.claimReferral(), secondReferral);
        assertEq(tier.claimableReferral(referrer), firstReferral);
    }

    function test_outgoingCallbackCannotRecursivelyClaimAndOuterClaimPaysOnce() public {
        ReentrantRewardClaimant claimant = new ReentrantRewardClaimant(paymentToken, tier);
        paymentToken.mint(address(claimant), 10_000_000);
        claimant.purchase();
        uint256 tokenId = claimant.tokenId();
        assertEq(tier.claimableReward(tokenId), 500_000);

        paymentToken.setCallback(
            address(claimant), abi.encodeCall(ReentrantRewardClaimant.reenterClaim, ())
        );
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Callback);

        assertEq(claimant.claim(), 500_000);

        assertEq(claimant.callbackAttempts(), 1);
        assertFalse(claimant.reentrySucceeded());
        assertEq(paymentToken.balanceOf(address(claimant)), 500_000);
        assertEq(tier.claimableReward(tokenId), 0);
        assertEq(tier.rewardReserve(), 0);
    }

    function _expectFailedInbound(AdversarialERC20.Behavior behavior, bytes memory revertData)
        private
    {
        paymentToken.setTransferFromBehavior(behavior);
        vm.prank(member);
        vm.expectRevert(revertData);
        tier.purchase(1, address(0));
        _assertNoPaymentState();
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
    }

    function _assertNoPaymentState() private view {
        assertEq(tier.tokenOf(member), 0);
        assertEq(tier.totalMinted(), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.totalShares(), 0);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.rewardReserve(), 0);
        assertEq(tier.totalReferralLiability(), 0);
    }
}
