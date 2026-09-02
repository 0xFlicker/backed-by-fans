// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IMembershipTier} from "../src/interfaces/IMembershipTier.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract ExpiredMembershipSyncTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;

    address private member;
    address private secondMember;
    address private payer;
    address private referrer;

    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        member = makeAddr("syncMember");
        secondMember = makeAddr("syncSecondMember");
        payer = makeAddr("syncPayer");
        referrer = makeAddr("syncReferrer");

        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = _deployTier(false);
        _fundAndApprove(tier, member, 1_000_000_000);
        _fundAndApprove(tier, secondMember, 1_000_000_000);
        _fundAndApprove(tier, payer, 1_000_000_000);
    }

    function test_onlyOwnerCanSyncAndBatchBoundsAndIdsFailFast() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));

        uint256[] memory empty = new uint256[](0);
        vm.expectRevert(
            abi.encodeWithSelector(MembershipTier.InvalidSyncBatchSize.selector, 0, 100)
        );
        tier.synchronizeExpiredMemberships(empty);

        uint256[] memory oversized = new uint256[](101);
        vm.expectRevert(
            abi.encodeWithSelector(MembershipTier.InvalidSyncBatchSize.selector, 101, 100)
        );
        tier.synchronizeExpiredMemberships(oversized);

        uint256[] memory one = _singleton(tokenId);
        vm.prank(member);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, member));
        tier.synchronizeExpiredMemberships(one);

        uint256[] memory unknown = _singleton(tokenId + 1);
        vm.expectRevert(abi.encodeWithSelector(MembershipTier.InvalidTokenId.selector, tokenId + 1));
        tier.synchronizeExpiredMemberships(unknown);
    }

    function test_mixedBatchBurnsOnlyStillExpiredAndSkipsDuplicatesAndBurnedTokens() public {
        vm.prank(member);
        uint256 expiredToken = tier.purchase(1, referrer);
        vm.prank(secondMember);
        uint256 renewedToken = tier.purchase(1, address(0));
        vm.warp(tier.expiresAt(expiredToken));

        vm.prank(secondMember);
        tier.purchase(1, address(0));

        uint256[] memory mixed = new uint256[](4);
        mixed[0] = expiredToken;
        mixed[1] = renewedToken;
        mixed[2] = expiredToken;
        mixed[3] = renewedToken;

        assertEq(tier.synchronizeExpiredMemberships(mixed), 1);
        assertEq(tier.synchronizeExpiredMemberships(_singleton(expiredToken)), 0);
        assertEq(tier.balanceOf(member), 0);
        assertEq(tier.ownerOf(renewedToken), secondMember);
        assertTrue(tier.isActive(secondMember));
        assertEq(tier.occupiedSupply(), 1);
    }

    function test_unknownIdRollsBackEarlierExpiredTokenInSameBatch() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));
        vm.warp(tier.expiresAt(tokenId));

        uint256 occupiedBefore = tier.occupiedSupply();
        uint256 eligibleSharesBefore = tier.totalRewardShares();
        uint256 rewardBefore = tier.claimableReward(tokenId);
        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = tokenId;
        tokenIds[1] = tokenId + 1;

        vm.expectRevert(abi.encodeWithSelector(MembershipTier.InvalidTokenId.selector, tokenId + 1));
        tier.synchronizeExpiredMemberships(tokenIds);

        assertEq(tier.ownerOf(tokenId), member);
        assertTrue(tier.rewardEligible(tokenId));
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), occupiedBefore);
        assertEq(tier.totalRewardShares(), eligibleSharesBefore);
        assertEq(tier.claimableReward(tokenId), rewardBefore);
    }

    function test_exactExpirationSyncsWhilePausedAndEmitsBurnAndDomainEvents() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));
        uint256 shares = tier.sharesOf(tokenId);
        vm.warp(tier.expiresAt(tokenId));
        tier.setPaused(true);

        vm.expectEmit(true, false, false, true, address(tier));
        emit IMembershipTier.RewardEligibilityUpdated(tokenId, false, shares, 0);
        vm.expectEmit(true, true, true, true, address(tier));
        emit IERC721.Transfer(member, address(0), tokenId);
        vm.expectEmit(true, true, false, true, address(tier));
        emit IMembershipTier.ExpiredMembershipSynchronized(tokenId, member, shares);

        assertEq(tier.synchronizeExpiredMemberships(_singleton(tokenId)), 1);
        assertEq(tier.tokenOf(member), tokenId);
        assertEq(tier.sharesOf(tokenId), shares);
        assertEq(tier.totalMinted(), tokenId);
        assertFalse(tier.rewardEligible(tokenId));
        assertFalse(tier.isOccupied(tokenId));
    }

    function test_burnedMemberKeepsAccruedRewardAndMissesInactiveAllocations() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, referrer);
        vm.prank(secondMember);
        tier.purchase(1, address(0));
        vm.warp(tier.expiresAt(tokenId));

        uint256 accrued = tier.claimableReward(tokenId);
        assertGt(accrued, 0);
        assertEq(tier.synchronizeExpiredMemberships(_singleton(tokenId)), 1);
        assertEq(tier.claimableReward(tokenId), accrued);

        vm.prank(secondMember);
        tier.purchase(1, address(0));
        assertEq(tier.claimableReward(tokenId), accrued);

        uint256 beforeClaim = paymentToken.balanceOf(member);
        vm.prank(member);
        assertEq(tier.claimReward(tokenId), accrued);
        assertEq(paymentToken.balanceOf(member), beforeClaim + accrued);
        assertEq(tier.claimableReward(tokenId), 0);
    }

    function test_burnedClaimAuthoritySurvivesTierOwnershipTransfer() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));
        vm.warp(tier.expiresAt(tokenId));
        assertEq(tier.synchronizeExpiredMemberships(_singleton(tokenId)), 1);

        address newOwner = makeAddr("replacementCreator");
        tier.transferOwnership(newOwner);
        vm.prank(newOwner);
        tier.acceptOwnership();

        vm.prank(newOwner);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.claimReward(tokenId);

        uint256 claimable = tier.claimableReward(tokenId);
        vm.prank(member);
        assertEq(tier.claimReward(tokenId), claimable);
    }

    function test_refundAndCompleteGrantRevocationSuspendFutureRewardsUntilReactivation() public {
        vm.prank(member);
        uint256 refundedToken = tier.purchase(1, address(0));
        vm.prank(secondMember);
        uint256 activeToken = tier.purchase(1, address(0));

        tier.setPaused(true);
        (uint256 grossRefund, uint256 ownerTopUp) = tier.previewRefund(refundedToken);
        tier.refund(refundedToken, grossRefund, ownerTopUp);
        uint256 refundedCredit = tier.claimableReward(refundedToken);
        assertFalse(tier.rewardEligible(refundedToken));

        tier.setPaused(false);
        vm.prank(secondMember);
        tier.purchase(1, address(0));
        assertEq(tier.claimableReward(refundedToken), refundedCredit);

        vm.prank(member);
        assertEq(tier.purchase(1, address(0)), refundedToken);
        uint256 reactivatedCredit = tier.claimableReward(refundedToken);
        vm.prank(secondMember);
        tier.purchase(1, address(0));
        assertGt(tier.claimableReward(refundedToken), reactivatedCredit);

        vm.warp(tier.expiresAt(refundedToken));
        tier.grantTime(member, 1);
        tier.revokeGrantTime(refundedToken);
        uint256 revokedCredit = tier.claimableReward(refundedToken);
        assertFalse(tier.rewardEligible(refundedToken));

        vm.prank(secondMember);
        tier.purchase(1, address(0));
        assertEq(tier.claimableReward(refundedToken), revokedCredit);
        assertTrue(tier.rewardEligible(activeToken));

        tier.grantTime(member, 1);
        assertTrue(tier.rewardEligible(refundedToken));
        uint256 grantReactivatedCredit = tier.claimableReward(refundedToken);
        vm.prank(secondMember);
        tier.purchase(1, address(0));
        assertGt(tier.claimableReward(refundedToken), grantReactivatedCredit);
    }

    function test_roundingAndCustodyConserveAcrossBurnClaimInactiveIntervalAndReactivation()
        public
    {
        MembershipTier zeroTier = _deployTier(true);
        uint256 firstGross = 2 * 1e27 + 1;
        uint256 secondGross = 3 * 1e27 + 7;
        _fundAndApprove(zeroTier, member, firstGross * 3);
        _fundAndApprove(zeroTier, secondMember, secondGross * 5);

        vm.prank(member);
        uint256 tokenId = zeroTier.contribute(firstGross, address(0));
        uint256 firstReward = firstGross * 500 / 10_000;
        assertEq(zeroTier.claimableReward(tokenId), firstReward - 1);

        vm.prank(secondMember);
        uint256 otherToken = zeroTier.contribute(secondGross, address(0));
        vm.warp(zeroTier.expiresAt(tokenId) - 1);
        vm.prank(secondMember);
        zeroTier.contribute(secondGross, address(0));
        vm.warp(zeroTier.expiresAt(tokenId));

        assertEq(zeroTier.synchronizeExpiredMemberships(_singleton(tokenId)), 1);
        uint256 burnedClaim = zeroTier.claimableReward(tokenId);
        vm.prank(member);
        assertEq(zeroTier.claimReward(tokenId), burnedClaim);
        assertEq(zeroTier.claimableReward(tokenId), 0);

        vm.prank(secondMember);
        zeroTier.contribute(secondGross, address(0));
        assertEq(zeroTier.claimableReward(tokenId), 0);

        vm.prank(member);
        assertEq(zeroTier.contribute(firstGross, address(0)), tokenId);
        assertEq(zeroTier.ownerOf(tokenId), member);
        uint256 afterRejoinPayment = zeroTier.claimableReward(tokenId);
        vm.prank(secondMember);
        zeroTier.contribute(secondGross, address(0));
        assertGt(zeroTier.claimableReward(tokenId), afterRejoinPayment);

        uint256 reserveBeforeClaims = zeroTier.rewardReserve();
        vm.prank(member);
        uint256 firstClaim = zeroTier.claimReward(tokenId);
        vm.prank(secondMember);
        uint256 secondClaim = zeroTier.claimReward(otherToken);
        assertEq(firstClaim + secondClaim + zeroTier.rewardReserve(), reserveBeforeClaims);
        assertGt(zeroTier.rewardReserve(), 0);
    }

    function test_purchaseRemintsSameIdReactivatesLifetimeSharesAndPreservesReferral() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, referrer);
        uint256 oldShares = tier.sharesOf(tokenId);
        vm.warp(tier.expiresAt(tokenId));
        assertEq(tier.synchronizeExpiredMemberships(_singleton(tokenId)), 1);

        vm.prank(member);
        uint256 reminted = tier.purchase(1, referrer);

        assertEq(reminted, tokenId);
        assertEq(tier.ownerOf(tokenId), member);
        assertTrue(tier.rewardEligible(tokenId));
        assertEq(tier.sharesOf(tokenId), oldShares + tier.pricePerPeriod());
        assertEq(tier.totalRewardShares(), tier.sharesOf(tokenId));
        (MembershipTypes.ReferralStatus status, address storedReferrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(storedReferrer, referrer);
    }

    function test_giftGrantAndContributionEachRestoreBurnedCredential() public {
        vm.prank(member);
        uint256 giftToken = tier.purchase(1, address(0));
        vm.warp(tier.expiresAt(giftToken));
        assertEq(tier.synchronizeExpiredMemberships(_singleton(giftToken)), 1);

        vm.prank(payer);
        assertEq(
            tier.gift(member, 1, MembershipTypes.ReferralStatus.LockedNone, address(0)), giftToken
        );
        assertEq(tier.ownerOf(giftToken), member);

        vm.warp(tier.expiresAt(giftToken));
        assertEq(tier.synchronizeExpiredMemberships(_singleton(giftToken)), 1);
        assertEq(tier.grantTime(member, 1), giftToken);
        assertEq(tier.ownerOf(giftToken), member);

        MembershipTier zeroTier = _deployTier(true);
        _fundAndApprove(zeroTier, secondMember, 1_000_000_000);
        vm.prank(secondMember);
        uint256 contributionToken = zeroTier.contribute(10_000_000, address(0));
        vm.warp(zeroTier.expiresAt(contributionToken));
        assertEq(zeroTier.synchronizeExpiredMemberships(_singleton(contributionToken)), 1);
        vm.prank(secondMember);
        assertEq(zeroTier.contribute(1, address(0)), contributionToken);
        assertEq(zeroTier.ownerOf(contributionToken), secondMember);
    }

    function test_erc721AndErc5643ReadsRevertWhileBurnedButCustomReadsRemain() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));
        vm.warp(tier.expiresAt(tokenId));
        assertEq(tier.synchronizeExpiredMemberships(_singleton(tokenId)), 1);

        vm.expectRevert();
        tier.ownerOf(tokenId);
        vm.expectRevert();
        tier.expiresAt(tokenId);
        vm.expectRevert();
        tier.isRenewable(tokenId);

        assertEq(tier.tokenOf(member), tokenId);
        assertFalse(tier.isActiveToken(tokenId));
        assertFalse(tier.isOccupied(tokenId));
        assertGt(tier.sharesOf(tokenId), 0);
        tier.timeBalances(tokenId);
        tier.referralOf(tokenId);
    }

    function test_maximumBatchBurnsOneHundredMembershipsWithinBlockGasBudget() public {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(paymentToken)
        );
        config.pricePerPeriod = 0;
        config.maxPrepaidPeriods = 0;
        MembershipTier batchTier = new MembershipTier(address(this), paymentToken, config);
        uint256[] memory tokenIds = new uint256[](100);
        for (uint256 i; i < tokenIds.length; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast)
            tokenIds[i] = batchTier.grantTime(address(uint160(i + 10_000)), 1);
        }
        vm.warp(batchTier.expiresAt(tokenIds[0]));

        uint256 gasBefore = gasleft();
        assertEq(batchTier.synchronizeExpiredMemberships(tokenIds), 100);
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 15_000_000);
        assertEq(batchTier.occupiedSupply(), 0);
        assertEq(batchTier.totalMinted(), 100);
    }

    function _deployTier(bool zeroPrice) private returns (MembershipTier deployed) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(paymentToken)
        );
        if (zeroPrice) config.pricePerPeriod = 0;
        deployed = new MembershipTier(address(this), paymentToken, config);
    }

    function _fundAndApprove(MembershipTier target, address account, uint256 amount) private {
        paymentToken.mint(account, amount);
        vm.prank(account);
        paymentToken.approve(address(target), amount);
    }

    function _singleton(uint256 tokenId) private pure returns (uint256[] memory tokenIds) {
        tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
    }
}
