// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "../helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "../helpers/SyntheticPonsBinding.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {RealImageFixtures} from "../helpers/RealImageFixtures.sol";
import {MockScaledToken} from "../mocks/MockScaledToken.sol";
import {MockUSDG} from "../mocks/MockUSDG.sol";

/// @notice Local-only lifecycle evidence. This is neither a public-testnet pilot nor an audit.
contract LocalLifecycleEvidenceTest is Test {
    uint64 private constant _START = 1_000_000;
    uint256 private constant Q = 1 << 128;

    MockUSDG private paymentToken;
    MockScaledToken private scaledPaymentToken;
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
        new LinkedVestingFixture().install();
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
        scaledPaymentToken = new MockScaledToken("AMD", "AMD");
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        OnchainMediaStoreFactory mediaStoreFactory = new OnchainMediaStoreFactory();
        IERC20[] memory paymentTokens = new IERC20[](2);
        paymentTokens[0] = paymentToken;
        paymentTokens[1] = scaledPaymentToken;
        SyntheticPonsBinding.bind(address(paymentToken));
        factory = new MembershipFactory(
            paymentTokens,
            address(mediaStoreFactory),
            address(this),
            address(paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(paymentTokens)
        );

        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(paymentToken));
        bytes memory nativeJPEG = RealImageFixtures.jpeg(0x42);
        vm.prank(creator);
        address mediaStore = mediaStoreFactory.store(nativeJPEG, MembershipTypes.MediaMIME.JPEG);
        MembershipTypes.MediaRecord memory mediaRecord = mediaStoreFactory.mediaRecord(mediaStore);
        config.media = MembershipTypes.MediaConfig({
            mime: mediaRecord.mime,
            store: mediaRecord.store,
            length: mediaRecord.length,
            digest: mediaRecord.digest,
            runtimeCodehash: mediaRecord.runtimeCodehash
        });
        vm.prank(creator);
        tier = MembershipTier(factory.createTier(config));

        _fundAndApprove(member, 100_000_000);
        _fundAndApprove(giftPayer, 100_000_000);
    }

    function test_localFixtureExposesUnscaledAndScaledPaymentTokens() public view {
        address[] memory tokens = factory.paymentTokens(0, 2);
        assertEq(tokens.length, 2);
        assertEq(tokens[0], address(paymentToken));
        assertEq(tokens[1], address(scaledPaymentToken));
        assertEq(scaledPaymentToken.uiMultiplier(), 1e18);
    }

    function test_localCreatorToSupporterLifecycleConservesEveryCustodyBucket() public {
        assertTrue(factory.isRegisteredTier(address(tier)));
        assertEq(factory.tierCount(), 1);
        address[] memory page = factory.tiers(0, 1);
        assertEq(page.length, 1);
        assertEq(page[0], address(tier));
        assertEq(tier.owner(), creator);
        assertFalse(
            (tier.tokensOfOwner(member, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
        );

        vm.prank(member);
        uint256 memberToken = tier.createMembership(1, referrer, 25);
        string memory activeTokenURI = tier.tokenURI(memberToken);
        assertGt(bytes(activeTokenURI).length, 0);
        vm.prank(giftPayer);
        uint256 giftToken = tier.giftMembership(giftRecipient, 1, 25);
        vm.prank(member);
        tier.renewMembership(memberToken, 1, referrer, 25);

        assertEq(
            (tier.tokensOfOwner(member, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(member, 0, 1).tokenIds[0]),
            memberToken
        );
        assertEq(
            (tier.tokensOfOwner(giftRecipient, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(giftRecipient, 0, 1).tokenIds[0]),
            giftToken
        );
        assertEq(
            ((tier.tokensOfOwner(member, 0, 1).balance != 0
                        && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
                    ? 1
                    : 0),
            1
        );
        assertEq(
            ((tier.tokensOfOwner(giftRecipient, 0, 1).balance != 0
                        && tier.isActiveToken(tier.tokensOfOwner(giftRecipient, 0, 1).tokenIds[0]))
                    ? 1
                    : 0),
            1
        );
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

        assertEq(paymentToken.balanceOf(address(factory)), 0);
        MembershipTypes.ReserveState memory reserves = tier.reserveState();
        assertEq(reserves.unearnedScaled[0], 28_000_000 * Q);
        assertEq(reserves.unearnedScaled[1], 1_500_000 * Q);
        assertEq(reserves.unearnedScaled[2], 200_000 * Q);
        assertEq(reserves.unearnedScaled[3], 300_000 * Q);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(memberToken), 0);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
        _assertTierCustody(0);

        vm.prank(creator);
        uint256 grantToken = tier.grantMembership(grantRecipient, 1, 25);
        assertTrue(
            (tier.tokensOfOwner(grantRecipient, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(grantRecipient, 0, 1).tokenIds[0]))
        );
        vm.prank(creator);
        assertEq(tier.revokeGrantTime(grantToken, grantRecipient, 25), 30 days);
        assertFalse(
            (tier.tokensOfOwner(grantRecipient, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(grantRecipient, 0, 1).tokenIds[0]))
        );
        assertFalse(tier.isOccupied(grantToken));
        assertEq(_syncAs(tier, grantToken, creator), 0);
        assertFalse(tier.isOccupied(grantToken));
        _assertTierCustody(0);

        vm.prank(creator);
        tier.transferOwnership(nextCreator);
        vm.prank(nextCreator);
        tier.acceptOwnership();
        assertEq(tier.owner(), nextCreator);

        vm.warp(_START + 15 days);
        tier.processAccounting(25);
        MembershipTypes.RefundPreview memory refundPreview = tier.previewRefund(memberToken);
        assertTrue(refundPreview.complete);
        assertEq(refundPreview.grossRefund, 15_000_000);
        vm.prank(nextCreator);
        uint256 refundPaid = tier.refund(memberToken, member, refundPreview.grossRefund, 25);
        assertEq(refundPaid, refundPreview.grossRefund);
        assertFalse(
            (tier.tokensOfOwner(member, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
        );
        vm.expectRevert();
        tier.ownerOf(memberToken);
        assertEq(tier.balanceOf(member), 0);
        assertFalse(tier.isOccupied(memberToken));
        assertEq(_syncAs(tier, memberToken, nextCreator), 0);
        _assertTierCustody(0);

        vm.warp(_START + 31 days);
        vm.expectRevert();
        tier.tokenURI(memberToken);
        assertFalse(
            (tier.tokensOfOwner(giftRecipient, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(giftRecipient, 0, 1).tokenIds[0]))
        );
        assertEq(
            ((tier.tokensOfOwner(giftRecipient, 0, 1).balance != 0
                        && tier.isActiveToken(tier.tokensOfOwner(giftRecipient, 0, 1).tokenIds[0]))
                    ? 1
                    : 0),
            0
        );
        assertTrue(tier.isOccupied(giftToken));
        assertEq(_syncAs(tier, giftToken, nextCreator), 1);
        assertEq(tier.occupiedSupply(), 0);

        (uint256 memberCredit,) = tier.claimableRetiredReward(member);
        (uint256 giftCredit,) = tier.claimableRetiredReward(giftRecipient);
        assertEq(memberCredit, 333_333);
        assertEq(giftCredit, 416_666);
        vm.prank(member);
        assertEq(tier.claimRetiredRewards(), 333_333);
        vm.prank(giftRecipient);
        assertEq(tier.claimRetiredRewards(), 416_666);
        vm.prank(referrer);
        assertEq(tier.claimReferral(), 49_999);
        vm.prank(nextCreator);
        assertEq(tier.withdrawCreatorProceeds(), 14_049_999);
        _assertTierCustody(0);

        // This synthetic lifecycle cannot nominate an EOA as protocol authority.
        // Actual signed Safe succession is covered by RobinhoodSafe.t.sol.
        vm.expectRevert();
        factory.transferOwnership(nextProtocolOwner);
        vm.prank(nextFeeRecipient);
        (bool feeWithdrawal,) = address(factory)
            .call(abi.encodeWithSignature("withdrawProtocolFees(address)", address(paymentToken)));
        assertFalse(feeWithdrawal);

        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.protocolToken(), address(paymentToken));
        // Expired credentials have earned the remaining allocation. Release is public.
        assertEq(tier.releaseProtocolFees(), 149_999);
        // Every fractional beneficiary credit and cancellation residue stays protected.
        assertEq(paymentToken.balanceOf(address(tier)), 4);
        assertEq(paymentToken.balanceOf(address(factory)), 0);
        assertEq(paymentToken.balanceOf(factory.buybackVault()), 149_999);
        assertEq(tier.totalProtectedLiability(), 4);
        assertEq(tier.claimableReferral(referrer), 0);
        assertEq(tier.creatorProceeds(), 0);

        uint256 observedSupply = paymentToken.balanceOf(member) + paymentToken.balanceOf(giftPayer)
            + paymentToken.balanceOf(giftRecipient) + paymentToken.balanceOf(referrer)
            + paymentToken.balanceOf(nextCreator) + paymentToken.balanceOf(nextFeeRecipient)
            + paymentToken.balanceOf(address(tier)) + paymentToken.balanceOf(address(factory))
            + paymentToken.balanceOf(factory.buybackVault());
        assertEq(observedSupply, paymentToken.totalSupply());
        assertEq(observedSupply, 200_000_000);
    }

    function _fundAndApprove(address account, uint256 amount) private {
        paymentToken.mint(account, amount);
        vm.prank(account);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_local120TokenTraceClaimsThenRefundsReservedNinety() public {
        MembershipTier target = _traceTier(false);
        paymentToken.mint(member, 120_000_000);
        vm.startPrank(member);
        paymentToken.approve(address(target), type(uint256).max);
        uint256 id = target.createMembership(12, referrer, 25);
        vm.stopPrank();
        MembershipTypes.EarnedBalances memory cash =
        target.previewAccounting(id, address(0), referrer, 0).settled;
        assertEq(cash.creator + cash.member + cash.referral + cash.protocol, 0);
        assertEq(target.totalProtectedLiability(), 120_000_000);
        assertEq(target.sharesOf(id), 120_000_000);
        vm.warp(_START + 30);
        target.processAccounting(25);
        cash = target.previewAccounting(id, address(0), referrer, 0).settled;
        assertEq(cash.creator, 24_000_000);
        assertLe(3_000_000 - cash.member, 1);
        assertEq(cash.referral, 1_500_000);
        assertEq(cash.protocol, 1_500_000);
        vm.prank(creator);
        uint256 creatorCash = target.withdrawCreatorProceeds();
        vm.prank(member);
        uint256 memberCash = target.claimReward(id, 25);
        vm.prank(referrer);
        uint256 referralCash = target.claimReferral();
        uint256 protocolCash = target.releaseProtocolFees();
        assertEq(creatorCash, cash.creator);
        assertEq(memberCash, cash.member);
        assertEq(referralCash, cash.referral);
        assertEq(protocolCash, cash.protocol);
        vm.prank(creator);
        uint256 refunded = target.refund(id, member, 90_000_000, 25);
        assertEq(refunded, 90_000_000);
        uint256 remainder = paymentToken.balanceOf(address(target));
        assertEq(
            creatorCash + memberCash + referralCash + protocolCash + refunded + remainder,
            120_000_000
        );
        assertEq(target.totalProtectedLiability(), remainder);
        assertEq(target.lifetimeGross(), 120_000_000);
        vm.warp(_START + 120);
        target.processAccounting(25);
        assertEq(target.creatorProceeds(), 0);
        assertEq(target.protocolFeeEarnedHeld(), 0);
        emit log_named_uint("purchase reserved", 120_000_000);
        emit log_named_uint("creator claimed at three periods", creatorCash);
        emit log_named_uint("member claimed at three periods", memberCash);
        emit log_named_uint("referral claimed at three periods", referralCash);
        emit log_named_uint("protocol released at three periods", protocolCash);
        emit log_named_uint("unused gross refunded", refunded);
        emit log_named_uint("remaining protected fraction rounded up", remainder);
    }

    function test_localFreeGapAndLargeSinglePeriodContributionTrace() public {
        MembershipTier target = _traceTier(true);
        paymentToken.mint(member, 120_000_000);
        vm.startPrank(member);
        paymentToken.approve(address(target), type(uint256).max);
        uint256 id = target.createContributionMembership(0, address(0), 25);
        target.renewContributionMembership(id, 120_000_000, referrer, 25);
        vm.stopPrank();
        MembershipTypes.AllocationLot[] memory lots = target.allocationLots(id, 0, 0, 100);
        assertEq(lots.length, 1);
        assertEq(lots[0].start, _START + 10);
        assertEq(lots[0].end, _START + 20);
        assertEq(target.sharesOf(id), 120_000_000);
        vm.warp(_START + 10);
        target.processAccounting(25);
        assertEq(target.creatorProceeds(), 0);
        vm.warp(_START + 15);
        target.processAccounting(25);
        assertEq(target.creatorProceeds(), 48_000_000);
        assertEq(target.allocationState(id).earnedScaled[1], 6_000_000 * Q);
        vm.warp(_START + 20);
        target.processAccounting(25);
        MembershipTypes.AllocationState memory state = target.allocationState(id);
        uint256 total;
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(state.unearnedScaled[purpose], 0);
            total += state.earnedScaled[purpose];
        }
        assertEq(total, 120_000_000 * Q);
        emit log_named_uint("free purchased gap seconds", 10);
        emit log_named_uint("funded service seconds", 10);
        emit log_named_uint("all four allocations fully earned", total / Q);
    }

    function _traceTier(bool variablePrice) private returns (MembershipTier target) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, tier.renderer(), address(paymentToken));
        config.tierSalt = keccak256(abi.encode("vesting trace", variablePrice));
        config.pricePerPeriod = variablePrice ? 0 : 10_000_000;
        config.periodDuration = 10;
        config.protocolFeeBps = 500;
        config.rewardBps = 1000;
        config.referralBps = 500;
        vm.prank(creator);
        target = MembershipTier(factory.createTier(config));
    }

    function _assertTierCustody(uint256 expectedSurplus) private view {
        uint256 liabilities = tier.totalProtectedLiability();
        assertEq(paymentToken.balanceOf(address(tier)), liabilities + expectedSurplus);
    }

    function _syncAs(MembershipTier target, uint256 tokenId, address tierOwner)
        private
        returns (uint256 burnedCount)
    {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        vm.prank(tierOwner);
        burnedCount = target.processExpirations(25).retiredCount;
    }
}
