// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract ReferralsTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    address private member;
    address private payer;
    address private referrer;
    address private replacement;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        member = makeAddr("member");
        payer = makeAddr("payer");
        referrer = makeAddr("referrer");
        replacement = makeAddr("replacement");

        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            address(this),
            paymentToken,
            address(renderer),
            MembershipTestConfig.defaultConfig(address(this))
        );

        paymentToken.mint(member, 1_000_000_000);
        paymentToken.mint(payer, 1_000_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
        vm.prank(payer);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_firstPositiveSelfPaymentLocksAndUsesReferrerImmediately() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, referrer);

        (MembershipTypes.ReferralStatus status, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(lockedReferrer, referrer);
        assertEq(tier.claimableReferral(referrer), 100_000);
        assertEq(tier.totalReferralLiability(), 100_000);
        assertEq(tier.creatorProceeds(), 9_300_000);
        assertEq(tier.rewardReserve(), 500_000);
    }

    function test_explicitNoneLocksAndLaterReplacementFailsAtomically() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, address(0));
        uint64 expiration = tier.expiresAt(tokenId);
        uint256 balance = paymentToken.balanceOf(member);

        (MembershipTypes.ReferralStatus status, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedNone));
        assertEq(lockedReferrer, address(0));

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceMismatch.selector);
        tier.purchase(1, referrer);

        assertEq(paymentToken.balanceOf(member), balance);
        assertEq(tier.expiresAt(tokenId), expiration);
        assertEq(tier.claimableReferral(referrer), 0);
    }

    function test_lockedAddressAllowsSameChoiceButRejectsReplacement() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, referrer);

        vm.prank(member);
        tier.purchase(1, referrer);

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceMismatch.selector);
        tier.purchase(1, replacement);

        assertEq(tier.expiresAt(tokenId), _START + 2 * _PERIOD);
        assertEq(tier.claimableReferral(referrer), 200_000);
        assertEq(tier.claimableReferral(replacement), 0);
    }

    function test_selfReferralIsAllowed() public {
        vm.prank(member);
        uint256 tokenId = tier.purchase(1, member);

        (, address lockedReferrer) = tier.referralOf(tokenId);
        assertEq(lockedReferrer, member);
        assertEq(tier.claimableReferral(member), 100_000);
    }

    function test_giftsNeverLockButUseAnExistingRecipientChoice() public {
        vm.prank(payer);
        uint256 tokenId = tier.gift(member, 1);

        (MembershipTypes.ReferralStatus status,) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        assertEq(tier.creatorProceeds(), 9_400_000);
        assertEq(tier.ownerOf(tokenId), member);
        assertEq(tier.sharesOf(tokenId), 10_000_000);
        assertEq(tier.tokenOf(payer), 0);

        vm.prank(member);
        tier.purchase(1, referrer);
        vm.prank(payer);
        tier.gift(member, 1);

        assertEq(tier.claimableReferral(referrer), 200_000);
        assertEq(tier.creatorProceeds(), 28_000_000);
        assertEq(tier.sharesOf(tokenId), 30_000_000);
        assertEq(tier.expiresAt(tokenId), _START + 3 * _PERIOD);
    }

    function test_selfGiftCannotBypassSelfPaymentAttribution() public {
        vm.prank(member);
        vm.expectRevert(MembershipTier.SelfGiftNotAllowed.selector);
        tier.gift(member, 1);

        assertEq(tier.tokenOf(member), 0);
        assertEq(paymentToken.balanceOf(address(tier)), 0);
    }

    function test_standardRenewalRequiresExistingChoiceOnPositivePriceTier() public {
        uint256 tokenId = tier.grantTime(member, 1);

        vm.prank(member);
        vm.expectRevert(MembershipTier.ReferralChoiceRequired.selector);
        tier.renewSubscription(tokenId, _PERIOD);

        vm.prank(member);
        tier.purchase(1, referrer);
        vm.prank(member);
        tier.renewSubscription(tokenId, 2 * _PERIOD);

        assertEq(tier.expiresAt(tokenId), _START + 4 * _PERIOD);
        assertEq(tier.claimableReferral(referrer), 300_000);
    }

    function test_zeroPriceStandardRenewalDoesNotInventAttribution() public {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        config.pricePerPeriod = 0;
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTier zeroTier =
            new MembershipTier(address(this), paymentToken, address(renderer), config);
        uint256 tokenId = zeroTier.grantTime(member, 1);

        vm.prank(member);
        zeroTier.renewSubscription(tokenId, _PERIOD);

        (MembershipTypes.ReferralStatus status,) = zeroTier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        assertEq(zeroTier.expiresAt(tokenId), _START + 2 * _PERIOD);

        vm.prank(member);
        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        zeroTier.renewSubscription(tokenId, 2 * _PERIOD);
    }
}
