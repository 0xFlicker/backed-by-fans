// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";

import {RewardCurve} from "../src/libraries/RewardCurve.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract PaymentsAndTimeTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;
    address private member;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;
    uint256 private constant Q = 1 << 128;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(_START);
        member = makeAddr("member");

        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)),
            paymentToken,
            _config()
        );
        paymentToken.mint(member, 1_000_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function test_liveRenewalExtendsExpirationAndExpiredReturnCreatesFreshIdentity() public {
        uint256 tokenId = _purchase(1);
        uint64 firstExpiration = tier.expiresAt(tokenId);

        vm.warp(_START + 10 days);
        _renew(tokenId, 2);
        assertEq(tier.expiresAt(tokenId), firstExpiration + 2 * _PERIOD);

        vm.warp(tier.expiresAt(tokenId));
        assertFalse(
            (tier.tokensOfOwner(member, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
        );
        uint256 returnedId = _purchase(1);
        assertGt(returnedId, tokenId);
        assertEq(tier.sharesOf(tokenId), 0);
        assertEq(tier.expiresAt(returnedId), block.timestamp + _PERIOD);
        assertTrue(
            (tier.tokensOfOwner(member, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
        );
    }

    function test_paidTimeInsertedAheadOfGrantTimeIsConsumedFirst() public {
        uint256 tokenId = tier.grantMembership(member, 2);
        uint64 originalExpiration = tier.expiresAt(tokenId);
        vm.warp(_START + 15 days);

        _renew(tokenId, 1);

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
        assertTrue(
            (tier.tokensOfOwner(member, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
        );
        assertEq(
            ((tier.tokensOfOwner(member, 0, 1).balance != 0
                        && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
                    ? 1
                    : 0),
            1
        );

        vm.warp(expiration);
        assertFalse(
            (tier.tokensOfOwner(member, 0, 1).balance != 0
                    && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
        );
        assertFalse(tier.isActiveToken(tokenId));
        assertEq(
            ((tier.tokensOfOwner(member, 0, 1).balance != 0
                        && tier.isActiveToken(tier.tokensOfOwner(member, 0, 1).tokenIds[0]))
                    ? 1
                    : 0),
            0
        );
        assertEq(tier.expiresAt(tokenId), expiration);

        (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint) =
            tier.timeBalances(tokenId);
        assertEq(paidSeconds, 0);
        assertEq(grantSeconds, 0);
        assertEq(effectiveCheckpoint, expiration);
    }

    function test_timeBalanceViewReturnsEffectiveCheckpointWithoutWriting() public {
        uint256 tokenId = _purchase(2);
        tier.addGrantTime(tokenId, member, 1);
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
        _renew(tokenId, 1);

        tier.addGrantTime(tokenId, member, 1);
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

        uint256 tokenId = tier.grantMembership(member, 1);
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
        assertEq(
            (tier.tokensOfOwner(member, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(member, 0, 1).tokenIds[0]),
            0
        );
    }

    function test_fixedPricePurchasePullsExactGrossAndAllocatesUnreferredSplit() public {
        uint256 memberBefore = paymentToken.balanceOf(member);

        uint256 tokenId = _purchase(2);

        uint256 gross = 20_000_000;
        assertEq(memberBefore - paymentToken.balanceOf(member), gross);
        assertEq(paymentToken.balanceOf(address(this)), 0);
        assertEq(paymentToken.balanceOf(address(tier)), 20_000_000);
        assertEq(tier.creatorProceeds(), 0);
        assertEq(tier.claimableReward(tokenId), 0);
        assertEq(tier.claimableReferral(address(0)), 0);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
        MembershipTypes.AllocationState memory allocation = tier.allocationState(tokenId);
        assertEq(allocation.unearnedScaled[0], 18_800_000 * Q);
        assertEq(allocation.unearnedScaled[1], 1_000_000 * Q);
        assertEq(allocation.unearnedScaled[2], 0);
        assertEq(allocation.unearnedScaled[3], 200_000 * Q);
        assertEq(tier.totalProtectedLiability(), gross);
        assertEq(tier.sharesOf(tokenId), gross);
        assertEq(tier.totalRewardShares(), gross);
        assertEq(tier.expiresAt(tokenId), _START + 2 * _PERIOD);
    }

    function test_twoFactorySelectedTokensTransferAndAccountInTheirOwnRawUnits() public {
        MockUSDG secondToken = new MockUSDG();
        OnchainMediaStoreFactory mediaStoreFactory = new OnchainMediaStoreFactory();
        SyntheticPonsBinding.bind(address(paymentToken));
        MembershipFactory factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(paymentToken, secondToken),
            address(mediaStoreFactory),
            address(this),
            address(paymentToken),
            MembershipTestConfig.tierCode(),
            MembershipTestConfig.minimumPayments(
                MembershipTestConfig.paymentTokens(paymentToken, secondToken)
            )
        );

        MembershipTypes.TierConfig memory firstConfig = _config();
        firstConfig.tierSalt = keccak256("first-payment-token");
        MembershipTier firstTier = MembershipTier(factory.createTier(firstConfig));

        MembershipTypes.TierConfig memory secondConfig = _config();
        secondConfig.tierSalt = keccak256("second-payment-token");
        secondConfig.paymentToken = address(secondToken);
        secondConfig.pricePerPeriod = 25_000_000;
        MembershipTier secondTier = MembershipTier(factory.createTier(secondConfig));

        paymentToken.mint(member, firstConfig.pricePerPeriod);
        secondToken.mint(member, secondConfig.pricePerPeriod);
        vm.startPrank(member);
        paymentToken.approve(address(firstTier), type(uint256).max);
        secondToken.approve(address(secondTier), type(uint256).max);
        firstTier.createMembership(1, address(0));
        secondTier.createMembership(1, address(0));
        vm.stopPrank();

        assertEq(address(firstTier.paymentToken()), address(paymentToken));
        assertEq(address(secondTier.paymentToken()), address(secondToken));
        assertEq(paymentToken.balanceOf(address(factory)), 0);
        assertEq(secondToken.balanceOf(address(factory)), 0);
        assertEq(paymentToken.balanceOf(address(firstTier)), 10_000_000);
        assertEq(secondToken.balanceOf(address(secondTier)), 25_000_000);
        assertEq(paymentToken.balanceOf(address(secondTier)), 0);
        assertEq(secondToken.balanceOf(address(firstTier)), 0);
        assertEq(
            paymentToken.balanceOf(address(factory)) + paymentToken.balanceOf(address(firstTier)),
            firstConfig.pricePerPeriod
        );
        assertEq(
            secondToken.balanceOf(address(factory)) + secondToken.balanceOf(address(secondTier)),
            secondConfig.pricePerPeriod
        );
    }

    function test_zeroPriceSelfActionAddsOnePeriodWithOrWithoutContribution() public {
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        MembershipTier zeroTier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        vm.prank(member);
        paymentToken.approve(address(zeroTier), type(uint256).max);

        vm.prank(member);
        uint256 tokenId = zeroTier.createContributionMembership(0, makeAddr("ignored"));
        (MembershipTypes.ReferralStatus status,) = zeroTier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        assertEq(zeroTier.sharesOf(tokenId), 0);

        vm.prank(member);
        zeroTier.renewContributionMembership(tokenId, 4_000_000, address(0));

        assertEq(zeroTier.expiresAt(tokenId), _START + 2 * _PERIOD);
        assertEq(zeroTier.sharesOf(tokenId), 4_000_000);
        assertEq(zeroTier.creatorProceeds(), 0);
        assertEq(zeroTier.claimableReward(tokenId), 0);
        assertEq(zeroTier.protocolFeeEarnedHeld(), 0);
        MembershipTypes.AllocationLot[] memory lots = zeroTier.allocationLots(tokenId, 0, 0, 100);
        assertEq(lots.length, 1);
        assertEq(lots[0].start, _START + _PERIOD);
        assertEq(lots[0].end, _START + 2 * _PERIOD);
        assertEq(lots[0].gross, 4_000_000);
        vm.warp(_START + _PERIOD);
        zeroTier.processAccounting(25);
        assertEq(zeroTier.creatorProceeds(), 0);
        vm.warp(_START + 2 * _PERIOD);
        zeroTier.processAccounting(25);
        assertEq(zeroTier.creatorProceeds(), 3_760_000);
        assertEq(zeroTier.allocationState(tokenId).earnedScaled[1], 200_000 * Q);
        assertEq(zeroTier.protocolFeeEarnedHeld(), 40_000);

        vm.prank(member);
        vm.expectRevert(MembershipTier.IncorrectPricingMode.selector);
        zeroTier.createMembership(1, address(0));

        vm.prank(makeAddr("thirdParty"));
        vm.expectRevert(MembershipTier.IncorrectPricingMode.selector);
        zeroTier.giftMembership(member, 1);
    }

    function test_pauseBlocksCanonicalPurchasesGiftsAndStandardRenewal() public {
        uint256 tokenId = _purchase(1);
        tier.setPaused(true);

        vm.prank(member);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.createMembership(1, address(0));

        address payer = makeAddr("payer");
        vm.prank(payer);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.giftMembership(member, 1);

        vm.prank(member);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.renewSubscription(tokenId, _PERIOD);

        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        MembershipTier zeroTier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        zeroTier.setPaused(true);
        vm.prank(member);
        vm.expectRevert(MembershipTier.TierPaused.selector);
        zeroTier.createContributionMembership(0, address(0));
    }

    function test_priceAndLifetimeCapacityBoundsFailBeforeCustodyOrTime() public {
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = uint256(type(uint112).max) + 1;
        address binding = SyntheticVaultBinding.bind(address(this), address(paymentToken));
        vm.expectRevert(RewardCurve.InvalidCurveSettings.selector);
        new MembershipTier(binding, paymentToken, config);
        config.pricePerPeriod = type(uint112).max;
        MembershipTier expensiveTier = new MembershipTier(binding, paymentToken, config);

        vm.prank(member);
        vm.expectRevert(RewardCurve.CurveCapacityExceeded.selector);
        expensiveTier.createMembership(2, address(0));

        assertEq(expensiveTier.totalMinted(), 0);
        assertEq(paymentToken.balanceOf(address(expensiveTier)), 0);
        assertEq(expensiveTier.lifetimeGross(), 0);
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
        MembershipTier fuzzTier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(fuzzToken)), fuzzToken, config
        );
        fuzzToken.mint(member, gross);
        vm.prank(member);
        fuzzToken.approve(address(fuzzTier), gross);

        vm.prank(member);
        uint256 tokenId = fuzzTier.createContributionMembership(gross, chosenReferrer);

        uint256 protocolAmount = Math.mulDiv(gross, 100, 10_000);
        uint256 rewardAmount = Math.mulDiv(gross, rewardRate, 10_000);
        uint256 referralAmount = referred ? Math.mulDiv(gross, referralRate, 10_000) : 0;
        uint256 creatorAmount = gross - protocolAmount - rewardAmount - referralAmount;
        assertEq(fuzzTier.creatorProceeds(), 0);
        assertEq(fuzzTier.claimableReward(tokenId), 0);
        assertEq(fuzzTier.claimableReferral(chosenReferrer), 0);
        assertEq(fuzzTier.sharesOf(tokenId), gross);
        assertEq(fuzzTier.protocolFeeEarnedHeld(), 0);
        MembershipTypes.AllocationState memory allocation = fuzzTier.allocationState(tokenId);
        uint256[4] memory amounts = [creatorAmount, rewardAmount, referralAmount, protocolAmount];
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(allocation.unearnedScaled[purpose], amounts[purpose] * Q);
            assertEq(allocation.earnedScaled[purpose], 0);
        }
        assertEq(
            fuzzToken.balanceOf(address(fuzzTier)),
            creatorAmount + rewardAmount + referralAmount + protocolAmount
        );
        vm.warp(_START + _PERIOD);
        fuzzTier.processAccounting(25);
        allocation = fuzzTier.allocationState(tokenId);
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(allocation.earnedScaled[purpose], amounts[purpose] * Q);
            assertEq(allocation.unearnedScaled[purpose], 0);
        }
        assertEq(fuzzTier.creatorProceeds(), creatorAmount);
        assertEq(fuzzTier.claimableReferral(chosenReferrer), referralAmount);
        assertEq(fuzzTier.protocolFeeEarnedHeld(), protocolAmount);
    }

    function _renew(uint256 id, uint64 periods) private {
        vm.prank(member);
        tier.renewMembership(id, periods, address(0));
    }

    function _purchase(uint64 periods) private returns (uint256 tokenId) {
        vm.prank(member);
        tokenId = tier.createMembership(periods, address(0));
    }

    function test_badPaymentRollsBackCatchUpFundingSharesAndCustody() public {
        AdversarialERC20 token = new AdversarialERC20();
        MembershipTypes.TierConfig memory config = _config();
        config.paymentToken = address(token);
        MembershipTier target = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(token)), token, config
        );
        token.mint(member, 100_000_000);
        vm.startPrank(member);
        token.approve(address(target), type(uint256).max);
        target.createMembership(1, address(0));
        vm.stopPrank();
        vm.warp(_START + _PERIOD / 2);
        bytes32 beforeState = keccak256(
            abi.encode(
                target.allocationState(1),
                target.reserveState(),
                target.previewAccounting(1, address(0), address(0), 0).settled,
                target.sharesOf(1),
                target.lifetimeGross(),
                target.expiresAt(1)
            )
        );
        for (uint8 behavior = 1; behavior <= 4; ++behavior) {
            token.setTransferFromBehavior(AdversarialERC20.Behavior(behavior));
            vm.prank(member);
            vm.expectRevert();
            target.createMembership(1, address(0));
            assertEq(
                keccak256(
                    abi.encode(
                        target.allocationState(1),
                        target.reserveState(),
                        target.previewAccounting(1, address(0), address(0), 0).settled,
                        target.sharesOf(1),
                        target.lifetimeGross(),
                        target.expiresAt(1)
                    )
                ),
                beforeState
            );
            assertEq(token.balanceOf(member), 90_000_000);
            assertEq(token.balanceOf(address(target)), 10_000_000);
            assertEq(token.allowance(member, address(target)), type(uint256).max);
        }
    }

    function test_paymentEventsDistinguishFundingFromCashAndFreeAccess() public {
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        config.startingBoostBps = 30_000;
        config.earlySupportGross = 1000;
        MembershipTier target = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        vm.prank(member);
        paymentToken.approve(address(target), type(uint256).max);
        vm.recordLogs();
        vm.startPrank(member);
        target.createContributionMembership(0, address(0));
        target.renewContributionMembership(1, 100, address(0));
        vm.stopPrank();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 processed;
        uint256 allocated;
        uint256 issued;
        for (uint256 i; i < logs.length; ++i) {
            Vm.Log memory entry = logs[i];
            if (entry.emitter != address(target)) continue;
            if (
                entry.topics[0]
                    == keccak256("PaymentProcessed(address,address,uint256,uint256,uint64)")
            ) {
                assertEq(address(uint160(uint256(entry.topics[1]))), member);
                assertEq(address(uint160(uint256(entry.topics[2]))), member);
                assertEq(uint256(entry.topics[3]), 1);
                (uint256 gross, uint64 periods) = abi.decode(entry.data, (uint256, uint64));
                assertEq(gross, processed == 0 ? 0 : 100);
                assertEq(periods, 1);
                ++processed;
            } else if (
                entry.topics[0]
                    == keccak256("PaymentAllocated(uint256,uint256,uint256,uint256,uint256)")
            ) {
                (uint256 protocol, uint256 reward, uint256 referral, uint256 creatorAmount) =
                    abi.decode(entry.data, (uint256, uint256, uint256, uint256));
                assertEq(uint256(entry.topics[1]), 1);
                assertEq(protocol, 1);
                assertEq(reward, 5);
                assertEq(referral, 0);
                assertEq(creatorAmount, 94);
                ++allocated;
            } else if (
                entry.topics[0] == keccak256("SharesIssued(uint256,uint256,uint256,uint256)")
            ) {
                (uint256 amount, uint256 shares, uint256 aggregate) =
                    abi.decode(entry.data, (uint256, uint256, uint256));
                assertEq(uint256(entry.topics[1]), 1);
                // Integral of the 3x to 1x taper over its first 100 of 1,000 raw units.
                assertEq(amount, 290);
                assertEq(shares, 290);
                assertEq(aggregate, 290);
                ++issued;
            }
        }
        assertEq(processed, 2);
        assertEq(allocated, 1);
        assertEq(issued, 1);
        assertEq(target.creatorProceeds(), 0);
        assertEq(target.claimableReward(1), 0);
        assertEq(target.protocolFeeEarnedHeld(), 0);
        assertEq(target.totalProtectedLiability(), 100);
    }

    function test_allFourAllocationsVestOverServiceAndQueuedRenewalAfterGrant() public {
        MembershipTypes.TierConfig memory config = _config();
        config.periodDuration = 10;
        config.protocolFeeBps = 500;
        config.rewardBps = 1000;
        config.referralBps = 500;
        config.maxPrepaidPeriods = 0;
        MembershipTier vested = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        address referrer = makeAddr("original referrer");
        uint256 tokenId = vested.grantMembership(member, 5);
        vm.startPrank(member);
        paymentToken.approve(address(vested), type(uint256).max);
        vested.renewMembership(tokenId, 12, referrer);
        vm.stopPrank();
        MembershipTypes.AllocationLot[] memory lots = vested.allocationLots(tokenId, 0, 0, 100);
        assertEq(lots.length, 1);
        assertEq(lots[0].start, _START);
        assertEq(lots[0].end, _START + 120);
        assertEq(vested.expiresAt(tokenId), _START + 170);
        MembershipTypes.EarnedBalances memory balances =
        vested.previewAccounting(tokenId, address(0), referrer, 0).settled;
        assertEq(balances.creator + balances.member + balances.referral + balances.protocol, 0);

        vm.warp(_START + 30);
        vested.processAccounting(25);
        MembershipTypes.AllocationState memory allocation = vested.allocationState(tokenId);
        uint256[4] memory firstPartial = [uint256(24_000_000), 3_000_000, 1_500_000, 1_500_000];
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(allocation.earnedScaled[purpose], firstPartial[purpose] * Q);
            assertEq(allocation.unearnedScaled[purpose], firstPartial[purpose] * 3 * Q);
        }
        vm.prank(member);
        vested.renewMembership(tokenId, 3, referrer);
        lots = vested.allocationLots(tokenId, 0, 0, 100);
        assertEq(lots.length, 2);
        assertEq(lots[1].start, _START + 120);
        assertEq(lots[1].end, _START + 150);
        assertEq(lots[1].referrer, referrer);
        assertEq(vested.expiresAt(tokenId), _START + 200);
        vm.warp(_START + 120);
        vested.processAccounting(25);
        allocation = vested.allocationState(tokenId);
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(allocation.earnedScaled[purpose], firstPartial[purpose] * 4 * Q);
            assertEq(allocation.unearnedScaled[purpose], firstPartial[purpose] * Q);
        }
        vm.warp(_START + 150);
        vested.processAccounting(25);
        allocation = vested.allocationState(tokenId);
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(allocation.earnedScaled[purpose], firstPartial[purpose] * 5 * Q);
            assertEq(allocation.unearnedScaled[purpose], 0);
        }
        assertEq(vested.creatorProceeds(), 120_000_000);
        assertEq(vested.claimableReferral(referrer), 7_500_000);
        assertEq(vested.protocolFeeEarnedHeld(), 7_500_000);
        assertEq(paymentToken.balanceOf(address(vested)), 150_000_000);
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        return
            MembershipTestConfig.defaultConfig(
                address(this), address(renderer), address(paymentToken)
            );
    }
}
