// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract PaymentsAndTimeTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    address private member;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        member = makeAddr("member");

        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            address(this), paymentToken, 1, address(renderer), address(renderer).codehash, _config()
        );
        paymentToken.mint(member, 1_000_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_paidTimeExtendsActiveExpirationAndRestartsExpiredTimeFromNow() public {
        uint256 tokenId = _purchase(1);
        uint64 firstExpiration = tier.expiresAt(tokenId);

        vm.warp(_START + 10 days);
        _purchase(2);
        assertEq(tier.expiresAt(tokenId), firstExpiration + 2 * _PERIOD);

        vm.warp(tier.expiresAt(tokenId));
        assertFalse(tier.isActive(member));
        _purchase(1);

        assertEq(tier.expiresAt(tokenId), block.timestamp + _PERIOD);
        assertTrue(tier.isActive(member));
    }

    function test_paidTimeInsertedAheadOfGrantTimeIsConsumedFirst() public {
        uint256 tokenId = tier.grantTime(member, 2);
        uint64 originalExpiration = tier.expiresAt(tokenId);
        vm.warp(_START + 15 days);

        _purchase(1);

        (uint64 paidSeconds, uint64 grantSeconds, uint64 checkpoint) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, _PERIOD);
        assertEq(grantSeconds, 45 days);
        assertEq(checkpoint, block.timestamp);
        assertEq(tier.expiresAt(tokenId), originalExpiration + _PERIOD);

        vm.warp(block.timestamp + _PERIOD);
        (paidSeconds, grantSeconds, checkpoint) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 45 days);
        assertEq(checkpoint, block.timestamp);
    }

    function test_activityChangesAtExactExpirationWithoutMutationOrSync() public {
        uint256 tokenId = _purchase(1);
        uint64 expiration = tier.expiresAt(tokenId);

        vm.warp(expiration - 1);
        assertTrue(tier.isActive(member));
        assertEq(tier.activeBalanceOf(member), 1);

        vm.warp(expiration);
        assertFalse(tier.isActive(member));
        assertFalse(tier.isActiveToken(tokenId));
        assertEq(tier.activeBalanceOf(member), 0);
        assertEq(tier.expiresAt(tokenId), expiration);

        (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint) =
            tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
        assertEq(effectiveCheckpoint, expiration);
    }

    function test_timeBalanceViewReturnsEffectiveCheckpointWithoutWriting() public {
        uint256 tokenId = _purchase(2);
        tier.grantTime(member, 1);
        vm.warp(_START + 15 days);

        (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint) =
            tier.timeBalances(tokenId);

        assertEq(paidSeconds, 45 days);
        assertEq(grantSeconds, _PERIOD);
        assertEq(effectiveCheckpoint, block.timestamp);
        assertEq(tier.expiresAt(tokenId), _START + 3 * _PERIOD);
    }

    function test_loweringPaidLimitPreservesTimeBlocksPaidAddsAndAllowsGrants() public {
        uint256 tokenId = _purchase(3);
        uint64 expiration = tier.expiresAt(tokenId);

        tier.setMaxPrepaidPeriods(2);
        assertEq(tier.expiresAt(tokenId), expiration);

        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        _purchase(1);

        tier.grantTime(member, 1);
        assertEq(tier.expiresAt(tokenId), expiration + _PERIOD);
    }

    function test_zeroPaidLimitIsUnlimited() public {
        tier.setMaxPrepaidPeriods(0);

        uint256 tokenId = _purchase(20);

        assertEq(tier.expiresAt(tokenId), _START + 20 * _PERIOD);
        assertTrue(tier.isRenewable(tokenId));
    }

    function test_purchaseAndStandardAdapterRequireWholeNonzeroPeriods() public {
        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        _purchase(0);

        uint256 tokenId = tier.grantTime(member, 1);
        vm.prank(member);
        vm.expectRevert(MembershipTier.InvalidPaidDuration.selector);
        tier.renewSubscription(tokenId, 0);

        vm.prank(member);
        vm.expectRevert(MembershipTier.InvalidPaidDuration.selector);
        tier.renewSubscription(tokenId, _PERIOD - 1);

        assertEq(tier.expiresAt(tokenId), _START + _PERIOD);
    }

    function test_uint64ExpirationCeilingRevertsAtomically() public {
        vm.warp(type(uint64).max - _PERIOD + 1);

        vm.expectRevert(MembershipTier.DurationOverflow.selector);
        _purchase(1);

        assertEq(tier.totalMinted(), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.tokenOf(member), 0);
    }

    function test_fixedPricePurchasePullsExactGrossAndAllocatesUnreferredSplit() public {
        uint256 memberBefore = paymentToken.balanceOf(member);

        uint256 tokenId = _purchase(2);

        uint256 gross = 20_000_000;
        assertEq(memberBefore - paymentToken.balanceOf(member), gross);
        assertEq(paymentToken.balanceOf(address(this)), 200_000);
        assertEq(paymentToken.balanceOf(address(tier)), 19_800_000);
        assertEq(tier.creatorProceeds(), 18_800_000);
        assertEq(tier.rewardReserve(), 1_000_000);
        assertEq(tier.totalReferralLiability(), 0);
        assertEq(tier.totalProtectedLiability(), 1_000_000);
        assertEq(tier.sharesOf(tokenId), gross);
        assertEq(tier.totalShares(), gross);
        assertEq(tier.expiresAt(tokenId), _START + 2 * _PERIOD);
    }

    function test_zeroPriceSelfActionAddsOnePeriodWithOrWithoutContribution() public {
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTier zeroTier = new MembershipTier(
            address(this), paymentToken, 1, address(renderer), address(renderer).codehash, config
        );
        vm.prank(member);
        paymentToken.approve(address(zeroTier), type(uint256).max);

        vm.prank(member);
        uint256 tokenId = zeroTier.contribute(0, makeAddr("ignored"));
        (MembershipTypes.ReferralStatus status,) = zeroTier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        assertEq(zeroTier.sharesOf(tokenId), 0);

        vm.prank(member);
        zeroTier.contribute(4_000_000, address(0));

        assertEq(zeroTier.expiresAt(tokenId), _START + 2 * _PERIOD);
        assertEq(zeroTier.sharesOf(tokenId), 4_000_000);
        assertEq(zeroTier.creatorProceeds(), 3_760_000);
        assertEq(zeroTier.rewardReserve(), 200_000);
        assertEq(paymentToken.balanceOf(address(this)), 40_000);

        vm.prank(member);
        vm.expectRevert(MembershipTier.IncorrectPricingMode.selector);
        zeroTier.purchase(1, address(0));

        vm.prank(makeAddr("thirdParty"));
        vm.expectRevert(MembershipTier.IncorrectPricingMode.selector);
        zeroTier.gift(member, 1, MembershipTypes.ReferralStatus.LockedNone, address(0));
    }

    function test_pauseBlocksCanonicalPurchasesGiftsAndStandardRenewal() public {
        uint256 tokenId = _purchase(1);
        tier.setPaused(true);

        vm.prank(member);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.purchase(1, address(0));

        address payer = makeAddr("payer");
        vm.prank(payer);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.gift(member, 1, MembershipTypes.ReferralStatus.LockedNone, address(0));

        vm.prank(member);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.renewSubscription(tokenId, _PERIOD);

        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTier zeroTier = new MembershipTier(
            address(this), paymentToken, 1, address(renderer), address(renderer).codehash, config
        );
        zeroTier.setPaused(true);
        vm.prank(member);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        zeroTier.contribute(0, address(0));
    }

    function test_fixedPriceMultiplicationOverflowFailsBeforeCustodyOrTime() public {
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = type(uint256).max;
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTier expensiveTier = new MembershipTier(
            address(this), paymentToken, 1, address(renderer), address(renderer).codehash, config
        );

        vm.prank(member);
        vm.expectRevert(MembershipTier.PaymentOverflow.selector);
        expensiveTier.purchase(2, address(0));

        assertEq(expensiveTier.totalMinted(), 0);
        assertEq(paymentToken.balanceOf(address(expensiveTier)), 0);
    }

    function testFuzz_paymentSplitConservesGrossAcrossValidRates(
        uint96 rawGross,
        uint16 rawRewardBps,
        uint16 rawReferralBps,
        bool referred
    ) public {
        uint256 gross = bound(rawGross, 1, 1e24);
        uint16 rewardRate = uint16(bound(rawRewardBps, 0, 9900));
        uint16 referralRate = uint16(bound(rawReferralBps, 0, 9900 - rewardRate));
        address chosenReferrer = referred ? makeAddr("fuzzReferrer") : address(0);

        MockUSDG fuzzToken = new MockUSDG();
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        config.rewardBps = rewardRate;
        config.referralBps = referralRate;
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTier fuzzTier = new MembershipTier(
            address(this), fuzzToken, 1, address(renderer), address(renderer).codehash, config
        );
        fuzzToken.mint(member, gross);
        vm.prank(member);
        fuzzToken.approve(address(fuzzTier), gross);

        vm.prank(member);
        uint256 tokenId = fuzzTier.contribute(gross, chosenReferrer);

        uint256 protocolAmount = Math.mulDiv(gross, 100, 10_000);
        uint256 rewardAmount = Math.mulDiv(gross, rewardRate, 10_000);
        uint256 referralAmount = referred ? Math.mulDiv(gross, referralRate, 10_000) : 0;
        uint256 creatorAmount = gross - protocolAmount - rewardAmount - referralAmount;
        assertEq(fuzzTier.creatorProceeds(), creatorAmount);
        assertEq(fuzzTier.rewardReserve(), rewardAmount);
        assertEq(fuzzTier.claimableReferral(chosenReferrer), referralAmount);
        assertEq(fuzzTier.sharesOf(tokenId), gross);
        assertEq(fuzzToken.balanceOf(address(this)), protocolAmount);
        assertEq(
            fuzzToken.balanceOf(address(fuzzTier)), creatorAmount + rewardAmount + referralAmount
        );
    }

    function _purchase(uint64 periods) private returns (uint256 tokenId) {
        vm.prank(member);
        tokenId = tier.purchase(periods, address(0));
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        return MembershipTestConfig.defaultConfig(address(this));
    }
}
