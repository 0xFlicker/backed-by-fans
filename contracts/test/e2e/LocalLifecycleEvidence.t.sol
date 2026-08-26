// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

/// @notice Local-only lifecycle evidence. This is neither a public-testnet pilot nor an audit.
contract LocalLifecycleEvidenceTest is Test {
    uint64 private constant _START = 1_000_000;

    MockUSDG private paymentToken;
    MembershipFactory private factory;
    MembershipTier private tier;

    address private creator;
    address private nextCreator;
    address private member;
    address private giftPayer;
    address private giftRecipient;
    address private grantRecipient;
    address private referrer;
    address private feeRecipient;
    address private nextFeeRecipient;
    address private nextProtocolOwner;

    function setUp() public {
        vm.warp(_START);
        creator = makeAddr("creator");
        nextCreator = makeAddr("nextCreator");
        member = makeAddr("member");
        giftPayer = makeAddr("giftPayer");
        giftRecipient = makeAddr("giftRecipient");
        grantRecipient = makeAddr("grantRecipient");
        referrer = makeAddr("referrer");
        feeRecipient = makeAddr("feeRecipient");
        nextFeeRecipient = makeAddr("nextFeeRecipient");
        nextProtocolOwner = makeAddr("nextProtocolOwner");

        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        factory = new MembershipFactory(
            IERC20(address(paymentToken)), address(renderer), address(this), feeRecipient
        );

        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(creator);
        vm.prank(creator);
        tier = MembershipTier(factory.createTier(config));

        _fundAndApprove(member, 100_000_000);
        _fundAndApprove(giftPayer, 100_000_000);
    }

    function test_localCreatorToSupporterLifecycleConservesEveryCustodyBucket() public {
        assertTrue(factory.isRegisteredTier(address(tier)));
        assertEq(factory.tierCount(), 1);
        address[] memory page = factory.tiers(0, 1);
        assertEq(page.length, 1);
        assertEq(page[0], address(tier));
        assertEq(tier.owner(), creator);
        assertFalse(tier.isActive(member));

        vm.prank(member);
        uint256 memberToken = tier.purchase(1, referrer);
        vm.prank(giftPayer);
        uint256 giftToken =
            tier.gift(giftRecipient, 1, MembershipTypes.ReferralStatus.Unset, address(0));
        vm.prank(member);
        assertEq(tier.purchase(1, referrer), memberToken);

        assertEq(tier.tokenOf(member), memberToken);
        assertEq(tier.tokenOf(giftRecipient), giftToken);
        assertEq(tier.activeBalanceOf(member), 1);
        assertEq(tier.activeBalanceOf(giftRecipient), 1);
        assertTrue(tier.isActiveToken(memberToken));
        assertTrue(tier.isActiveToken(giftToken));
        assertEq(tier.sharesOf(memberToken), 20_000_000);
        assertEq(tier.sharesOf(giftToken), 10_000_000);

        (MembershipTypes.ReferralStatus memberStatus, address lockedReferrer) =
            tier.referralOf(memberToken);
        (MembershipTypes.ReferralStatus giftStatus,) = tier.referralOf(giftToken);
        assertEq(uint256(memberStatus), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(lockedReferrer, referrer);
        assertEq(uint256(giftStatus), uint256(MembershipTypes.ReferralStatus.Unset));

        assertEq(paymentToken.balanceOf(address(factory)), 300_000);
        assertEq(tier.creatorProceeds(), 28_000_000);
        assertEq(tier.rewardReserve(), 1_500_000);
        assertEq(tier.totalReferralLiability(), 200_000);
        _assertTierCustody(0);

        vm.prank(creator);
        uint256 grantToken = tier.grantTime(grantRecipient, 1);
        assertTrue(tier.isActive(grantRecipient));
        vm.prank(creator);
        assertEq(tier.revokeGrantTime(grantToken), 30 days);
        assertFalse(tier.isActive(grantRecipient));
        assertTrue(tier.isOccupied(grantToken));
        assertTrue(tier.synchronize(grantToken));
        assertFalse(tier.isOccupied(grantToken));
        _assertTierCustody(0);

        vm.prank(creator);
        tier.transferOwnership(nextCreator);
        vm.prank(nextCreator);
        tier.acceptOwnership();
        assertEq(tier.owner(), nextCreator);

        vm.warp(_START + 15 days);
        (uint256 refundPreview, uint256 topUpPreview) = tier.previewRefund(memberToken);
        assertEq(refundPreview, 15_000_000);
        assertEq(topUpPreview, 0);
        vm.prank(nextCreator);
        (uint256 refundPaid, uint256 topUpPaid) =
            tier.refund(memberToken, refundPreview, topUpPreview);
        assertEq(refundPaid, refundPreview);
        assertEq(topUpPaid, topUpPreview);
        assertFalse(tier.isActive(member));
        assertEq(tier.ownerOf(memberToken), member);
        assertEq(tier.balanceOf(member), 1);
        assertTrue(tier.isOccupied(memberToken));
        assertTrue(tier.synchronize(memberToken));
        _assertTierCustody(0);

        vm.warp(_START + 31 days);
        assertFalse(tier.isActive(giftRecipient));
        assertEq(tier.activeBalanceOf(giftRecipient), 0);
        assertTrue(tier.isOccupied(giftToken));
        assertTrue(tier.synchronize(giftToken));
        assertEq(tier.occupiedSupply(), 0);

        assertEq(tier.claimableReward(memberToken), 1_083_333);
        assertEq(tier.claimableReward(giftToken), 416_666);
        vm.prank(member);
        assertEq(tier.claimReward(memberToken), 1_083_333);
        vm.prank(giftRecipient);
        assertEq(tier.claimReward(giftToken), 416_666);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), 200_000);
        vm.prank(nextCreator);
        assertEq(tier.withdrawCreatorProceeds(), 13_000_000);
        _assertTierCustody(0);

        factory.transferOwnership(nextProtocolOwner);
        vm.prank(nextProtocolOwner);
        factory.acceptOwnership();
        vm.prank(nextProtocolOwner);
        factory.setFeeRecipient(nextFeeRecipient);
        vm.prank(nextFeeRecipient);
        assertEq(factory.withdrawProtocolFees(), 300_000);

        assertEq(factory.owner(), nextProtocolOwner);
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.feeRecipient(), nextFeeRecipient);
        // One base unit remains protected as reward-index rounding dust.
        assertEq(paymentToken.balanceOf(address(tier)), 1);
        assertEq(paymentToken.balanceOf(address(factory)), 0);
        assertEq(tier.rewardReserve(), 1);
        assertEq(tier.totalReferralLiability(), 0);
        assertEq(tier.creatorProceeds(), 0);

        uint256 observedSupply = paymentToken.balanceOf(member) + paymentToken.balanceOf(giftPayer)
            + paymentToken.balanceOf(giftRecipient) + paymentToken.balanceOf(referrer)
            + paymentToken.balanceOf(nextCreator) + paymentToken.balanceOf(nextFeeRecipient)
            + paymentToken.balanceOf(address(tier));
        assertEq(observedSupply, paymentToken.totalSupply());
        assertEq(observedSupply, 200_000_000);
    }

    function _fundAndApprove(address account, uint256 amount) private {
        paymentToken.mint(account, amount);
        vm.prank(account);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function _assertTierCustody(uint256 expectedSurplus) private view {
        uint256 liabilities =
            tier.creatorProceeds() + tier.rewardReserve() + tier.totalReferralLiability();
        assertEq(paymentToken.balanceOf(address(tier)), liabilities + expectedSurplus);
    }
}
