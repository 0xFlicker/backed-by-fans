// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract RewardsTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;
    address private firstMember;
    address private secondMember;
    address private payer;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;
    uint256 private constant Q = 1 << 128;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(_START);
        firstMember = makeAddr("firstMember");
        secondMember = makeAddr("secondMember");
        payer = makeAddr("payer");

        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)),
            paymentToken,
            MembershipTestConfig.defaultConfig(
                address(this), address(renderer), address(paymentToken)
            )
        );

        _fundAndApprove(firstMember, 1_000_000_000);
        _fundAndApprove(secondMember, 1_000_000_000);
        _fundAndApprove(payer, 1_000_000_000);
    }

    function test_firstPositivePaymentMintsSharesAndReservesRewardsUntilService() public {
        vm.prank(firstMember);
        uint256 id = tier.createMembership(1, address(0));
        assertEq(tier.sharesOf(id), 10_000_000);
        assertEq(tier.totalRewardShares(), 10_000_000);
        assertEq(tier.reserveState().unearnedScaled[1], 500_000 * Q);
        assertEq(tier.claimableReward(id), 0);
        vm.warp(_START + _PERIOD);
        tier.processAccounting(25);
        assertEq(
            _credit(tier, id, firstMember) + tier.reserveState().indexCarryScaled
                + tier.reserveState().distributionDustScaled,
            500_000 * Q
        );
    }

    function test_newSharesReceiveOnlyFundingConsumedAfterTheyJoin() public {
        vm.prank(firstMember);
        uint256 first = tier.createMembership(1, address(0));
        vm.warp(_START + _PERIOD / 2);
        vm.prank(secondMember);
        uint256 second = tier.createMembership(1, address(0));
        assertEq(tier.claimableReward(second), 0);
        assertApproxEqAbs(_credit(tier, first, firstMember), 250_000 * Q, 40_000_000);
        vm.warp(_START + _PERIOD);
        tier.processAccounting(25);
        // First stream: 375k/125k. Second stream: 125k/125k so far.
        assertApproxEqAbs(_credit(tier, first, firstMember), 500_000 * Q, 80_000_000);
        assertApproxEqAbs(_credit(tier, second, secondMember), 250_000 * Q, 80_000_000);
    }

    function test_grantOnlyCredentialGetsNoEarlierRewardBeforeFirstShares() public {
        vm.prank(firstMember);
        uint256 first = tier.createMembership(1, address(0));
        uint256 second = tier.grantMembership(secondMember, 1);
        vm.warp(_START + _PERIOD / 2);
        tier.processAccounting(25);
        assertEq(tier.sharesOf(second), 0);
        assertEq(tier.claimableReward(second), 0);
        uint256 earlier = _credit(tier, first, firstMember);
        vm.prank(secondMember);
        tier.renewMembership(second, 1, address(0));
        assertEq(_credit(tier, first, firstMember), earlier);
        assertEq(_credit(tier, second, secondMember), 0);
    }

    function test_giftAssignsSharesAndVestedRewardsToRecipientCredential() public {
        vm.prank(payer);
        uint256 id = tier.giftMembership(firstMember, 2);
        assertEq(tier.ownerOf(id), firstMember);
        assertEq(tier.sharesOf(id), 20_000_000);
        assertEq(tier.claimableReward(id), 0);
        assertEq(
            (tier.tokensOfOwner(payer, 0, 1).balance == 0
                    ? 0
                    : tier.tokensOfOwner(payer, 0, 1).tokenIds[0]),
            0
        );
        vm.warp(_START + 2 * _PERIOD);
        tier.processAccounting(25);
        assertEq(
            _credit(tier, id, firstMember) + tier.reserveState().indexCarryScaled
                + tier.reserveState().distributionDustScaled,
            1_000_000 * Q
        );
    }

    function test_retirementDestroysSharesAndPreservesEarnedOwnerCredit() public {
        vm.prank(firstMember);
        uint256 tokenId = tier.createMembership(1, address(0));
        tier.addGrantTime(tokenId, firstMember, 1);
        assertGt(tier.sharesOf(tokenId), 0);

        tier.revokeGrantTime(tokenId, tier.ownerOf(tokenId));
        vm.warp(tier.expiresAt(tokenId));
        assertEq(_sync(tier, tokenId), 1);

        assertEq(tier.sharesOf(tokenId), 0);
        assertEq(tier.totalRewardShares(), 0);
        assertFalse(tier.rewardEligible(tokenId));
        assertApproxEqAbs(_credit(tier, tokenId, firstMember), 500_000 * Q, 10_000_000);
    }

    function test_zeroContributionMintsNoSharesOrReward() public {
        MembershipTier zeroTier = _deployZeroTier();
        vm.prank(firstMember);
        uint256 tokenId = zeroTier.createContributionMembership(0, address(0));

        assertEq(zeroTier.sharesOf(tokenId), 0);
        assertEq(zeroTier.totalRewardShares(), 0);
        assertEq(zeroTier.reserveState().unearnedScaled[1], 0);
        assertEq(zeroTier.claimableReward(tokenId), 0);
    }

    function test_scaledDivisionCreditsWholeRemainderWithoutExceedingReserve() public {
        MembershipTier zeroTier = _deployZeroTier();
        uint256 gross = 2 * 1e27 + 1;
        paymentToken.mint(firstMember, gross);
        vm.prank(firstMember);
        paymentToken.approve(address(zeroTier), gross);

        vm.prank(firstMember);
        uint256 tokenId = zeroTier.createContributionMembership(gross, address(0));

        uint256 reward = gross * 500 / 10_000;
        assertEq(reward, 100_000_000_000_000_000_000_000_000);
        vm.warp(_START + _PERIOD);
        zeroTier.processAccounting(25);
        assertEq(zeroTier.allocationState(tokenId).earnedScaled[1], reward * Q);
        (uint256 retired,) = zeroTier.claimableRetiredReward(firstMember);
        assertEq(retired, reward - 1);

        vm.prank(firstMember);
        assertEq(zeroTier.claimRetiredRewards(), reward - 1);
        assertEq(
            _credit(zeroTier, tokenId, firstMember) + zeroTier.reserveState().indexCarryScaled
                + zeroTier.reserveState().distributionDustScaled,
            Q
        );
    }

    function test_maximumSupportedContributionSettlesRewardWithoutIntermediateOverflow() public {
        MockUSDG largeSupplyToken = new MockUSDG();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(largeSupplyToken)
        );
        config.pricePerPeriod = 0;
        MembershipTier largeTier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(largeSupplyToken)),
            largeSupplyToken,
            config
        );
        address largeHolder = makeAddr("largeHolder");
        uint256 gross = type(uint112).max;
        largeSupplyToken.mint(largeHolder, gross);
        vm.prank(largeHolder);
        largeSupplyToken.approve(address(largeTier), gross);

        vm.prank(largeHolder);
        uint256 tokenId = largeTier.createContributionMembership(gross, address(0));

        vm.warp(_START + _PERIOD);
        largeTier.processAccounting(25);
        uint256 allocatedReward = Math.mulDiv(gross, config.rewardBps, 10_000);
        assertEq(largeTier.sharesOf(tokenId), 0);
        (uint256 retired,) = largeTier.claimableRetiredReward(largeHolder);
        assertLe(retired, allocatedReward);
        assertGt(retired, 0);

        vm.prank(largeHolder);
        uint256 claimed = largeTier.claimRetiredRewards();
        assertEq(
            claimed * Q + _credit(largeTier, tokenId, largeHolder)
                + largeTier.reserveState().indexCarryScaled
                + largeTier.reserveState().distributionDustScaled,
            allocatedReward * Q
        );
        assertLe(allocatedReward - claimed, 1);
    }

    function testFuzz_cohortClaimsAndRemainingReserveConserveEveryRewardAllocation(
        uint96 firstGross,
        uint96 secondGross,
        uint96 thirdGross
    ) public {
        firstGross = uint96(bound(firstGross, 1, 1e18));
        secondGross = uint96(bound(secondGross, 1, 1e18));
        thirdGross = uint96(bound(thirdGross, 1, 1e18));
        MembershipTier zeroTier = _deployZeroTier();

        _fundAndApproveFor(firstMember, zeroTier, firstGross);
        _fundAndApproveFor(secondMember, zeroTier, secondGross);
        _fundAndApproveFor(payer, zeroTier, thirdGross);

        vm.prank(firstMember);
        uint256 firstToken = zeroTier.createContributionMembership(firstGross, address(0));
        vm.prank(secondMember);
        uint256 secondToken = zeroTier.createContributionMembership(secondGross, address(0));
        vm.prank(payer);
        uint256 thirdToken = zeroTier.createContributionMembership(thirdGross, address(0));

        uint256 allocated = uint256(firstGross) * 500 / 10_000 + uint256(secondGross) * 500 / 10_000
            + uint256(thirdGross) * 500 / 10_000;
        vm.warp(_START + _PERIOD);
        zeroTier.processAccounting(25);
        {
            (uint256 firstRaw,) = zeroTier.claimableRetiredReward(firstMember);
            (uint256 secondRaw,) = zeroTier.claimableRetiredReward(secondMember);
            (uint256 thirdRaw,) = zeroTier.claimableRetiredReward(payer);
            uint256 claimableBefore = firstRaw + secondRaw + thirdRaw;
            assertLe(claimableBefore, allocated);
        }

        vm.prank(firstMember);
        uint256 firstClaim = zeroTier.claimRetiredRewards();
        vm.prank(secondMember);
        uint256 secondClaim = zeroTier.claimRetiredRewards();
        vm.prank(payer);
        uint256 thirdClaim = zeroTier.claimRetiredRewards();

        MembershipTypes.ReserveState memory reserves = zeroTier.reserveState();
        assertEq(
            (firstClaim + secondClaim + thirdClaim) * Q + _credit(zeroTier, firstToken, firstMember)
                + _credit(zeroTier, secondToken, secondMember)
                + _credit(zeroTier, thirdToken, payer) + reserves.indexCarryScaled
                + reserves.distributionDustScaled,
            allocated * Q
        );
    }

    function _credit(MembershipTier target, uint256 id, address beneficiary)
        private
        view
        returns (uint256)
    {
        MembershipTypes.EarnedBalances memory balances =
        target.previewAccounting(id, address(0), address(0), 0).settled;
        (uint256 raw, uint256 fraction) = target.claimableRetiredReward(beneficiary);
        return balances.member * Q + balances.fractionalScaled[1] + raw * Q + fraction;
    }

    function test_trackedThirtyTokenStreamAttributes225And75PlusConcurrentFunding() public {
        MembershipTier target = _streamTier(30);
        uint256 first = _contribution(target, firstMember, 60_000_000);
        vm.warp(_START + 15);
        uint256 second = _contribution(target, secondMember, 60_000_000);
        assertEq(_credit(target, second, secondMember), 0);
        vm.warp(_START + 30);
        target.processAccounting(25);
        // The tracked first stream attributes 22.5/7.5. The second stream has
        // consumed 15 tokens of funding and adds 7.5/7.5, independently.
        assertApproxEqAbs(
            _credit(target, first, firstMember), (22_500_000 + 7_500_000) * Q, 240_000_000
        );
        assertApproxEqAbs(
            _credit(target, second, secondMember), (7_500_000 + 7_500_000) * Q, 240_000_000
        );
        assertEq(target.allocationState(first).earnedScaled[1], 30_000_000 * Q);
        assertEq(target.allocationState(second).earnedScaled[1], 15_000_000 * Q);
    }

    function test_returningPositionHasFreshWeightAndCannotReceiveHistoricalRewards() public {
        MembershipTier target = _streamTier(30);
        uint256 ended = _contribution(target, secondMember, 60);
        vm.warp(_START + 30);
        uint256 first = _contribution(target, firstMember, 60);
        uint256 preserved = _credit(target, ended, secondMember);
        assertEq(target.sharesOf(ended), 0);
        assertEq(target.totalRewardShares(), 60);
        vm.warp(_START + 50);
        uint256 fresh = _contribution(target, secondMember, 1);
        assertGt(fresh, first);
        assertEq(target.sharesOf(fresh), 1);
        assertEq(target.totalRewardShares(), 61);
        assertEq(_credit(target, ended, secondMember), preserved);
        vm.warp(_START + 60);
        target.processAccounting(25);
        // Twenty units vest before the return, ten after it, shared 60:1.
        assertApproxEqAbs(_credit(target, first, firstMember), 20 * Q + 10 * Q * 60 / 61, 1000);
        assertApproxEqAbs(_credit(target, fresh, secondMember) - preserved, 10 * Q / 61, 1000);
        assertEq(target.sharesOf(ended), 0);
        assertEq(target.sharesOf(fresh), 1);
    }

    function test_equalTotalDifferentMembersFlushesCarryWithoutReassigningIt() public {
        MembershipTier target = _streamTier(31);
        uint256 first = _contribution(target, firstMember, 7);
        _contribution(target, secondMember, 7);
        vm.warp(_START + 10);
        target.processAccounting(25);
        uint256 carry = target.reserveState().indexCarryScaled;
        uint256 originalCredit = _credit(target, first, firstMember);
        assertGt(carry, 0);
        target.refund(first, target.ownerOf(first), 7);
        _contribution(target, payer, 7);
        assertEq(target.totalRewardShares(), 14);
        assertEq(target.reserveState().indexCarryScaled, 0);
        assertGe(target.reserveState().distributionDustScaled, carry);
        vm.warp(_START + 41);
        target.processAccounting(25);
        assertEq(_credit(target, first, firstMember), originalCredit);
    }

    function test_denseProcessingAndRepeatedClaimsEqualSparsePayoutPlusFraction() public {
        MembershipTier dense = _streamTier(31);
        MembershipTier sparse = _streamTier(31);
        _contribution(dense, firstMember, 7);
        _contribution(dense, secondMember, 6);
        _contribution(sparse, firstMember, 7);
        _contribution(sparse, secondMember, 6);
        uint256 paidFirst;
        uint256 paidSecond;
        for (uint64 elapsed = 1; elapsed <= 42; ++elapsed) {
            vm.warp(_START + elapsed);
            dense.processAccounting(1);
            if (elapsed == 11) {
                _contribution(dense, payer, 5);
                _contribution(sparse, payer, 5);
            }
            if (elapsed % 2 == 0) {
                paidFirst += _claim(dense, 1, firstMember);
            }
            if (elapsed % 3 == 0) {
                paidSecond += _claim(dense, 2, secondMember);
            }
        }
        dense.processAccounting(25);
        sparse.processAccounting(25);
        assertEq(_credit(sparse, 1, firstMember), paidFirst * Q + _credit(dense, 1, firstMember));
        assertEq(_credit(sparse, 2, secondMember), paidSecond * Q + _credit(dense, 2, secondMember));
        assertEq(_credit(sparse, 3, payer), _credit(dense, 3, payer));
        assertEq(abi.encode(dense.reserveState()), abi.encode(sparse.reserveState()));
        MembershipTypes.ReserveState memory reserves = sparse.reserveState();
        assertEq(
            _credit(sparse, 1, firstMember) + _credit(sparse, 2, secondMember)
                + _credit(sparse, 3, payer) + reserves.indexCarryScaled
                + reserves.distributionDustScaled,
            8 * Q
        );
    }

    function _claim(MembershipTier target, uint256 id, address beneficiary)
        private
        returns (uint256)
    {
        bool live = target.balanceOf(beneficiary) != 0;
        vm.prank(beneficiary);
        return live ? target.claimReward(id) : target.claimRetiredRewards();
    }

    function _streamTier(uint64 duration) private returns (MembershipTier target) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(paymentToken)
        );
        config.pricePerPeriod = 0;
        config.periodDuration = duration;
        config.rewardBps = 5000;
        config.referralBps = 0;
        target = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
    }

    function _contribution(MembershipTier target, address account, uint256 gross)
        private
        returns (uint256 id)
    {
        _fundAndApproveFor(account, target, gross);
        vm.prank(account);
        id = target.createContributionMembership(gross, address(0));
    }

    function _deployZeroTier() private returns (MembershipTier zeroTier) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(renderer), address(paymentToken)
        );
        config.pricePerPeriod = 0;
        zeroTier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        vm.prank(firstMember);
        paymentToken.approve(address(zeroTier), type(uint256).max);
    }

    function _fundAndApprove(address account, uint256 amount) private {
        paymentToken.mint(account, amount);
        vm.prank(account);
        paymentToken.approve(address(tier), type(uint256).max);
    }

    function _fundAndApproveFor(address account, MembershipTier target, uint256 amount) private {
        paymentToken.mint(account, amount);
        vm.prank(account);
        paymentToken.approve(address(target), type(uint256).max);
    }

    function _sync(MembershipTier target, uint256 tokenId) private returns (uint256 burnedCount) {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        burnedCount = target.processExpirations(25).retiredCount;
    }
}
