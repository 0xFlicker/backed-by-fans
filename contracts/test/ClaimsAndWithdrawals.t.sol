// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";

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
        new LinkedVestingFixture().install();
        vm.warp(1000);
        member = makeAddr("member");
        referrer = makeAddr("referrer");
        stranger = makeAddr("stranger");
        nextOwner = makeAddr("nextOwner");

        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)),
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

        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(tokenId), 0);
        assertEq(tier.claimableReferral(referrer), 0);
        _vest(30 days);
        uint256 reward = tier.claimableReward(tokenId);
        assertApproxEqAbs(reward, 500_000, 1);

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
        assertEq(tier.claimReward(tokenId), reward);
        assertEq(paymentToken.balanceOf(address(tier)), 600_000 - reward);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(tokenId), 0);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(tier.totalProtectedLiability(), 600_000 - reward);
    }

    function test_creatorWithdrawalCannotConsumeRewardOrReferralLiabilities() public {
        vm.prank(member);
        tier.purchase(2, referrer);

        _vest(60 days);

        assertEq(tier.withdrawCreatorProceeds(), 18_600_000);

        assertEq(paymentToken.balanceOf(address(tier)), 1_400_000);
        assertApproxEqAbs(tier.claimableReward(1), 1_000_000, 1);
        assertEq(tier.claimableReferral(referrer), 200_000);
        assertEq(tier.totalProtectedLiability(), 1_400_000);
    }

    function test_currentOwnerReceivesPreexistingCreatorProceedsAfterTwoStepTransfer() public {
        vm.prank(member);
        tier.purchase(1, address(0));

        _vest(30 days);

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

        _vest(30 days);
        uint256 reward = tier.claimableReward(tokenId);

        assertEq(tier.withdrawCreatorProceeds(), 9_300_000);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), 100_000);
        vm.prank(member);
        assertEq(tier.claimReward(tokenId), reward);
        assertApproxEqAbs(reward, 500_000, 1);
        assertEq(paymentToken.balanceOf(address(tier)), 600_000 - reward);
    }

    function test_twoTokenClaimsAndRefundsRemainIndependent() public {
        MockUSDG secondToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory secondConfig = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(secondToken)
        );
        secondConfig.tierSalt = keccak256("second-claims-token");
        MembershipTier secondTier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(secondToken)),
            secondToken,
            secondConfig
        );
        address secondMember = makeAddr("secondMember");
        address secondReferrer = makeAddr("secondReferrer");
        secondToken.mint(secondMember, secondConfig.pricePerPeriod);
        vm.prank(secondMember);
        secondToken.approve(address(secondTier), type(uint256).max);

        vm.prank(member);
        uint256 firstTokenId = tier.purchase(1, referrer);
        vm.prank(secondMember);
        uint256 secondTokenId = secondTier.purchase(1, secondReferrer);

        _vest(15 days);
        secondTier.processAccounting(25);

        uint256 secondBalanceBefore = secondToken.balanceOf(address(secondTier));
        uint256 secondCreatorBefore = secondTier.creatorProceeds();
        uint256 secondRewardBefore = secondTier.claimableReward(secondTokenId);
        uint256 secondReferralBefore = secondTier.claimableReferral(secondReferrer);

        tier.withdrawCreatorProceeds();
        vm.prank(referrer);
        tier.claimReferral();
        vm.prank(member);
        tier.claimReward(firstTokenId);

        assertEq(secondToken.balanceOf(address(secondTier)), secondBalanceBefore);
        assertEq(secondTier.creatorProceeds(), secondCreatorBefore);
        assertEq(secondTier.claimableReward(secondTokenId), secondRewardBefore);
        assertEq(secondTier.claimableReferral(secondReferrer), secondReferralBefore);

        uint256 refundAmount = secondTier.previewRefund(secondTokenId).grossRefund;
        uint256 firstTokenBalanceBefore = paymentToken.balanceOf(address(tier));
        secondTier.refund(secondTokenId, refundAmount);

        assertEq(paymentToken.balanceOf(address(tier)), firstTokenBalanceBefore);
        assertEq(tier.creatorProceeds(), 0);
        assertApproxEqAbs(tier.reserveState().unearnedScaled[1] / (1 << 128), 250_000, 1);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(secondTier.creatorProceeds(), secondCreatorBefore);
        assertEq(secondTier.claimableReward(secondTokenId), secondRewardBefore);
        assertEq(secondTier.reserveState().unearnedScaled[1], 0);
        assertEq(secondTier.claimableReferral(secondReferrer), secondReferralBefore);
    }

    function _vest(uint256 elapsed) private {
        vm.warp(block.timestamp + elapsed);
        tier.processAccounting(25);
    }

    function test_fractionalCreditRemainsAfterClaimsAndLaterCashCanAccrue() public {
        vm.prank(member);
        uint256 id = tier.purchase(1, referrer);
        _vest(1 days);
        MembershipTypes.EarnedBalances memory before_ = tier.earnedBalances(id, referrer);
        assertGt(before_.fractionalScaled[0], 0);
        assertGt(before_.fractionalScaled[1], 0);
        assertEq(tier.withdrawCreatorProceeds(), before_.creator);
        vm.prank(member);
        assertEq(tier.claimReward(id), before_.member);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), before_.referral);
        assertEq(tier.releaseProtocolFees(), before_.protocol);
        MembershipTypes.EarnedBalances memory after_ = tier.earnedBalances(id, referrer);
        assertEq(after_.creator + after_.member + after_.referral + after_.protocol, 0);
        for (uint256 i; i < 4; ++i) {
            assertEq(after_.fractionalScaled[i], before_.fractionalScaled[i]);
        }
        _vest(1 days);
        after_ = tier.earnedBalances(id, referrer);
        assertGt(after_.creator, 0);
        assertGt(after_.member, 0);
        assertGt(after_.referral, 0);
        assertGt(after_.protocol, 0);
        assertEq(tier.sharesOf(id), 10_000_000);
        assertEq(tier.lifetimeGross(), 10_000_000);
        assertGe(paymentToken.balanceOf(address(tier)), tier.totalProtectedLiability());
    }

    function test_settledClaimsDoNotRequireFinishingPendingEqualTimeCheckpoints() public {
        vm.prank(member);
        uint256 id = tier.purchase(1, referrer);
        for (uint256 i; i < 100; ++i) {
            address other = address(SafeCast.toUint160(0x1000 + i));
            paymentToken.mint(other, 10_000_000);
            vm.startPrank(other);
            paymentToken.approve(address(tier), 10_000_000);
            tier.purchase(1, referrer);
            vm.stopPrank();
        }
        vm.warp(block.timestamp + 30 days);
        tier.processAccounting(1);
        tier.setPaused(true);
        assertFalse(tier.accountingStatus().complete);
        uint256 pending = tier.accountingStatus().scheduledMembers;
        MembershipTypes.EarnedBalances memory balances = tier.earnedBalances(id, referrer);
        assertGt(balances.member, 0);
        assertEq(tier.withdrawCreatorProceeds(), balances.creator);
        vm.prank(member);
        assertEq(tier.claimReward(id), balances.member);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), balances.referral);
        assertEq(tier.releaseProtocolFees(), balances.protocol);
        assertEq(tier.accountingStatus().scheduledMembers, pending);
        assertFalse(tier.accountingStatus().complete);
        assertGe(paymentToken.balanceOf(address(tier)), tier.totalProtectedLiability());
    }

    function test_burnedCredentialRetainsFixedWalletClaimAndZeroClaimsEmitNothing() public {
        vm.prank(member);
        uint256 id = tier.purchase(1, referrer);
        _vest(30 days);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        tier.synchronizeExpiredMemberships(ids);
        tier.setPaused(true);
        assertFalse(tier.rewardEligible(id));
        assertEq(tier.tokenOf(member), id);
        vm.expectRevert();
        tier.ownerOf(id);
        uint256 amount = tier.claimableReward(id);
        assertGt(amount, 0);
        vm.prank(stranger);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.claimReward(id);
        vm.prank(member);
        assertEq(tier.claimReward(id), amount);
        assertFalse(tier.rewardEligible(id));
        assertEq(tier.sharesOf(id), 10_000_000);
        vm.recordLogs();
        vm.prank(member);
        assertEq(tier.claimReward(id), 0);
        vm.prank(stranger);
        assertEq(tier.claimReferral(), 0);
        assertEq(vm.getRecordedLogs().length, 0);
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
        new LinkedVestingFixture().install();
        vm.warp(1000);
        feeVault = makeAddr("feeVault");
        member = makeAddr("member");
        referrer = makeAddr("referrer");
        paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTierHarness(
            SyntheticVaultBinding.bind(feeVault, address(paymentToken)),
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

    function test_zeroEarnedClaimsDoNotAttemptFrozenTokenDeliveryOrEmitPayouts() public {
        vm.prank(member);
        uint256 id = tier.purchase(1, referrer);
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.RevertTransfer);
        paymentToken.setFrozen(member, true);
        paymentToken.setFrozen(referrer, true);
        paymentToken.setFrozen(address(this), true);
        vm.recordLogs();
        assertEq(tier.withdrawCreatorProceeds(), 0);
        vm.prank(member);
        assertEq(tier.claimReward(id), 0);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), 0);
        assertEq(tier.releaseProtocolFees(), 0);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(tier.totalProtectedLiability(), 10_000_000);
    }

    function test_failedEarnedReleasePreservesAccountingWithoutBlockingPayment() public {
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.ReturnFalse);
        vm.prank(member);
        uint256 id = tier.purchase(1, referrer);
        vm.warp(block.timestamp + 30 days);
        assertEq(id, 1);
        tier.processAccounting(25);
        vm.expectRevert();
        tier.releaseProtocolFees();
        assertEq(tier.earnedBalances(id, referrer).protocol, 100_000);
        assertEq(paymentToken.balanceOf(address(tier)), 10_000_000);
        assertEq(paymentToken.balanceOf(tier.buybackVault()), 0);
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.TaxedTransfer);
        vm.expectRevert(MembershipTier.InexactTokenTransfer.selector);
        tier.releaseProtocolFees();
        assertEq(tier.earnedBalances(id, referrer).protocol, 100_000);
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        assertEq(tier.releaseProtocolFees(), 100_000);
        assertEq(paymentToken.balanceOf(tier.buybackVault()), 100_000);
    }

    function test_frozenFactoryAndVaultDoNotBlockMembershipPayments() public {
        paymentToken.setFrozen(feeVault, true);
        paymentToken.setFrozen(tier.buybackVault(), true);
        vm.prank(member);
        uint256 id = tier.purchase(1, address(0));
        assertEq(tier.sharesOf(id), 10_000_000);
        assertEq(tier.reserveState().unearnedScaled[3], 100_000 * (1 << 128));
        assertTrue(tier.isActive(member));
    }

    function test_reentrantInboundCallbackCannotDoublePurchase() public {
        paymentToken.setCallback(
            address(tier), abi.encodeCall(MembershipTier.purchase, (uint64(1), address(0)))
        );
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Callback);
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Callback);

        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));

        assertEq(paymentToken.callbackAttempts(), 1);
        assertFalse(paymentToken.lastCallbackSucceeded());
        assertEq(tier.sharesOf(tokenId), 10_000_000);
        assertEq(tier.expiresAt(tokenId), block.timestamp + 30 days);
        assertEq(tier.totalRewardShares(), 10_000_000);
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
        vm.warp(block.timestamp + 30 days);
        tier.processAccounting(25);
        uint256 reward = tier.claimableReward(tokenId);
        assertApproxEqAbs(reward, 500_000, 1);
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
        assertEq(tier.reserveState().unearnedScaled[1], 0);
        assertEq(tier.claimableReward(tokenId), reward);

        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        paymentToken.setFrozen(referrer, true);
        vm.prank(referrer);
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.claimReferral();
        assertEq(tier.claimableReferral(referrer), 100_000);
        assertEq(tier.earnedBalances(tokenId, referrer).referral, 100_000);
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

        vm.warp(block.timestamp + 30 days);
        tier.processAccounting(25);

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
        vm.warp(block.timestamp + 30 days);
        tier.processAccounting(25);
        uint256 reward = tier.claimableReward(tokenId);
        assertApproxEqAbs(reward, 500_000, 1);

        paymentToken.setCallback(
            address(claimant), abi.encodeCall(ReentrantRewardClaimant.reenterClaim, ())
        );
        paymentToken.setTransferBehavior(AdversarialERC20.Behavior.Callback);

        assertEq(claimant.claim(), reward);

        assertEq(claimant.callbackAttempts(), 1);
        assertFalse(claimant.reentrySucceeded());
        assertEq(paymentToken.balanceOf(address(claimant)), reward);
        assertEq(tier.claimableReward(tokenId), 0);
        assertEq(tier.totalProtectedLiability(), 10_000_000 - reward);
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
        assertEq(tier.totalRewardShares(), 0);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.reserveState().unearnedScaled[1], 0);
        assertEq(tier.claimableReferral(referrer), 0);
    }
}
