// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";

import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract ReferralsTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;
    address private member;
    address private payer;
    address private referrer;
    address private replacement;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(_START);
        member = makeAddr("member");
        payer = makeAddr("payer");
        referrer = makeAddr("referrer");
        replacement = makeAddr("replacement");

        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)),
            paymentToken,
            MembershipTestConfig.defaultConfig(
                address(this), address(renderer), address(paymentToken)
            )
        );

        paymentToken.mint(member, 1_000_000_000);
        paymentToken.mint(payer, 1_000_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
        vm.prank(payer);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_firstPositiveSelfPaymentLocksReferrerAndReservesBeforeEarning() public {
        vm.prank(member);
        uint256 tokenId = tier.createMembership(1, referrer);

        (MembershipTypes.ReferralStatus status, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(lockedReferrer, referrer);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.reserveState().unearnedScaled[2], 100_000 * (1 << 128));
        assertEq(
            (tier.tokensOfOwner(referrer, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(referrer, 0, 1).tokenIds[0]),
            0
        );
        _vest(_PERIOD / 2);
        assertApproxEqAbs(tier.claimableReferral(referrer), 50_000, 1);
        _vest(_PERIOD / 2);
        assertEq(tier.claimableReferral(referrer), 100_000);
        assertEq(tier.creatorProceeds(), 9_300_000);
        (uint256 earned,) = tier.claimableRetiredReward(member);
        assertApproxEqAbs(earned, 500_000, 1);
    }

    function test_explicitNoneLocksAndLaterReplacementFailsAtomically() public {
        vm.prank(member);
        uint256 tokenId = tier.createMembership(1, address(0));
        uint64 expiration = tier.expiresAt(tokenId);
        uint256 balance = paymentToken.balanceOf(member);

        (MembershipTypes.ReferralStatus status, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedNone));
        assertEq(lockedReferrer, address(0));

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceMismatch.selector);
        tier.renewMembership(tokenId, 1, referrer);

        assertEq(paymentToken.balanceOf(member), balance);
        assertEq(tier.expiresAt(tokenId), expiration);
        assertEq(tier.claimableReferral(referrer), 0);
    }

    function test_lockedAddressAllowsSameChoiceButRejectsReplacement() public {
        vm.prank(member);
        uint256 tokenId = tier.createMembership(1, referrer);

        vm.prank(member);
        tier.renewMembership(tokenId, 1, referrer);

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceMismatch.selector);
        tier.renewMembership(tokenId, 1, replacement);

        assertEq(tier.expiresAt(tokenId), _START + 2 * _PERIOD);
        _vest(2 * _PERIOD);
        assertEq(tier.claimableReferral(referrer), 200_000);
        assertEq(tier.claimableReferral(replacement), 0);
    }

    function test_selfReferralIsAllowed() public {
        vm.prank(member);
        uint256 tokenId = tier.createMembership(1, member);

        (, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(lockedReferrer, member);
        _vest(_PERIOD);
        assertEq(tier.claimableReferral(member), 100_000);
    }

    function test_giftsNeverLockButUseAnExistingRecipientChoice() public {
        vm.prank(payer);
        uint256 tokenId = tier.giftMembership(member, 1);

        (MembershipTypes.ReferralStatus status,) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.ownerOf(tokenId), member);
        assertEq(tier.sharesOf(tokenId), 10_000_000);
        assertEq(
            (tier.tokensOfOwner(payer, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(payer, 0, 1).tokenIds[0]),
            0
        );

        vm.prank(member);
        tier.renewMembership(tokenId, 1, referrer);
        vm.prank(payer);
        tier.giftRenewal(tokenId, member, 1, MembershipTypes.ReferralStatus.LockedAddress, referrer);

        // The earlier unattributed gift never acquires the later locked
        // referrer. Only its own subsequent service intervals can earn referral cash.
        _vest(_PERIOD);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(tier.creatorProceeds(), 9_400_000);
        _vest(_PERIOD);
        assertEq(tier.claimableReferral(referrer), 100_000);
        _vest(_PERIOD);
        assertEq(tier.claimableReferral(referrer), 200_000);
        assertEq(tier.creatorProceeds(), 28_000_000);
        assertEq(tier.sharesOf(tokenId), 0);
        assertEq(tier.balanceOf(member), 0);
    }

    function test_giftRejectsReferralStateChangedAfterPreviewWithoutChargingPayer() public {
        uint256 payerBalance = paymentToken.balanceOf(payer);

        vm.prank(member);
        uint256 tokenId = tier.createMembership(1, referrer);
        uint64 expiration = tier.expiresAt(tokenId);

        vm.prank(payer);
        vm.expectRevert(MembershipTier.ReferralStateMismatch.selector);
        tier.giftRenewal(tokenId, member, 1, MembershipTypes.ReferralStatus.Unset, address(0));

        assertEq(paymentToken.balanceOf(payer), payerBalance);
        assertEq(tier.expiresAt(tokenId), expiration);
        assertEq(tier.claimableReferral(referrer), 0);

        vm.prank(payer);
        tier.giftRenewal(tokenId, member, 1, MembershipTypes.ReferralStatus.LockedAddress, referrer);
        _vest(2 * _PERIOD);
        assertEq(tier.claimableReferral(referrer), 200_000);
    }

    function test_selfGiftCannotBypassSelfPaymentAttribution() public {
        vm.prank(member);
        vm.expectRevert(MembershipTier.SelfGiftNotAllowed.selector);
        tier.giftMembership(member, 1);

        assertEq(
            (tier.tokensOfOwner(member, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(member, 0, 1).tokenIds[0]),
            0
        );
        assertEq(paymentToken.balanceOf(address(tier)), 0);
    }

    function test_standardRenewalRequiresExistingChoiceOnPositivePriceTier() public {
        uint256 tokenId = tier.grantMembership(member, 1);

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceRequired.selector);
        tier.renewSubscription(tokenId, _PERIOD);

        vm.prank(member);
        tier.renewMembership(tokenId, 1, referrer);
        vm.prank(member);
        tier.renewSubscription(tokenId, 2 * _PERIOD);

        assertEq(tier.expiresAt(tokenId), _START + 4 * _PERIOD);
        _vest(3 * _PERIOD);
        assertEq(tier.claimableReferral(referrer), 300_000);
    }

    function test_zeroPriceStandardRenewalDoesNotInventAttribution() public {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(paymentToken)
        );
        config.pricePerPeriod = 0;
        MembershipTier zeroTier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        uint256 tokenId = zeroTier.grantMembership(member, 1);

        assertTrue(zeroTier.isRenewable(tokenId));

        vm.prank(member);
        zeroTier.renewSubscription(tokenId, _PERIOD);

        (MembershipTypes.ReferralStatus status,) = zeroTier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        assertEq(zeroTier.expiresAt(tokenId), _START + 2 * _PERIOD);

        vm.prank(member);
        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        zeroTier.renewSubscription(tokenId, 2 * _PERIOD);
    }

    function test_oneReferrerClaimsIndependentStreamsAtRateAndSuspensionBoundaries() public {
        vm.prank(member);
        uint256 first = tier.createMembership(1, referrer);
        _vest(_PERIOD / 2);
        uint256 paid = tier.claimableReferral(referrer);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), paid);
        vm.prank(payer);
        uint256 second = tier.createMembership(2, referrer);
        _vest(_PERIOD / 2);
        assertApproxEqAbs(tier.claimableReferral(referrer) + paid, 150_000, 1);
        uint256[] memory ids = new uint256[](1);
        ids[0] = first;
        tier.processExpirations(25).retiredCount;
        assertFalse(tier.rewardEligible(first));
        assertEq(
            (tier.tokensOfOwner(referrer, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(referrer, 0, 1).tokenIds[0]),
            0
        );
        _vest(_PERIOD);
        uint256 next = tier.claimableReferral(referrer);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), next);
        paid += next;
        _vest(_PERIOD / 2);
        vm.prank(referrer);
        paid += tier.claimReferral();
        assertEq(paid, 300_000);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(tier.allocationLots(first, 0, 0, 1)[0].referrer, referrer);
        assertEq(tier.allocationLots(second, 0, 0, 1)[0].referrer, referrer);
        assertGe(paymentToken.balanceOf(address(tier)), tier.totalProtectedLiability());
    }

    function _vest(uint64 elapsed) private {
        vm.warp(block.timestamp + elapsed);
        tier.processAccounting(25);
    }
}
