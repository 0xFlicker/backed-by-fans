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
        uint256 id = tier.purchase(1, address(0));
        assertEq(tier.sharesOf(id), 10_000_000);
        assertEq(tier.totalRewardShares(), 10_000_000);
        assertEq(tier.reserveState().unearnedScaled[1], 500_000 * Q);
        assertEq(tier.claimableReward(id), 0);
        vm.warp(_START + _PERIOD);
        tier.processAccounting(25);
        assertEq(_credit(tier, id) + tier.reserveState().indexCarryScaled, 500_000 * Q);
    }

    function test_newSharesReceiveOnlyFundingConsumedAfterTheyJoin() public {
        vm.prank(firstMember);
        uint256 first = tier.purchase(1, address(0));
        vm.warp(_START + _PERIOD / 2);
        vm.prank(secondMember);
        uint256 second = tier.purchase(1, address(0));
        assertEq(tier.claimableReward(second), 0);
        assertApproxEqAbs(_credit(tier, first), 250_000 * Q, 40_000_000);
        vm.warp(_START + _PERIOD);
        tier.processAccounting(25);
        // First stream: 375k/125k. Second stream: 125k/125k so far.
        assertApproxEqAbs(_credit(tier, first), 500_000 * Q, 80_000_000);
        assertApproxEqAbs(_credit(tier, second), 250_000 * Q, 80_000_000);
    }

    function test_grantOnlyCredentialGetsNoEarlierRewardBeforeFirstShares() public {
        vm.prank(firstMember);
        uint256 first = tier.purchase(1, address(0));
        uint256 second = tier.grantTime(secondMember, 1);
        vm.warp(_START + _PERIOD / 2);
        tier.processAccounting(25);
        assertEq(tier.sharesOf(second), 0);
        assertEq(tier.claimableReward(second), 0);
        uint256 earlier = _credit(tier, first);
        vm.prank(secondMember);
        tier.purchase(1, address(0));
        assertEq(_credit(tier, first), earlier);
        assertEq(_credit(tier, second), 0);
    }

    function test_giftAssignsSharesAndVestedRewardsToRecipientCredential() public {
        vm.prank(payer);
        uint256 id = tier.gift(firstMember, 2, MembershipTypes.ReferralStatus.Unset, address(0));
        assertEq(tier.ownerOf(id), firstMember);
        assertEq(tier.sharesOf(id), 20_000_000);
        assertEq(tier.claimableReward(id), 0);
        assertEq(tier.tokenOf(payer), 0);
        vm.warp(_START + 2 * _PERIOD);
        tier.processAccounting(25);
        assertEq(_credit(tier, id) + tier.reserveState().indexCarryScaled, 1_000_000 * Q);
    }

    function test_sharesSurviveButBecomeIneligibleAfterExpirationSynchronization() public {
        vm.prank(firstMember);
        uint256 tokenId = tier.purchase(1, address(0));
        tier.grantTime(firstMember, 1);
        uint256 shares = tier.sharesOf(tokenId);

        tier.revokeGrantTime(tokenId);
        vm.warp(tier.expiresAt(tokenId));
        assertEq(_sync(tier, tokenId), 1);

        assertEq(tier.sharesOf(tokenId), shares);
        assertEq(tier.totalRewardShares(), 0);
        assertFalse(tier.rewardEligible(tokenId));
        assertApproxEqAbs(_credit(tier, tokenId), 500_000 * Q, 10_000_000);
    }

    function test_zeroContributionMintsNoSharesOrReward() public {
        MembershipTier zeroTier = _deployZeroTier();
        vm.prank(firstMember);
        uint256 tokenId = zeroTier.contribute(0, address(0));

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
        uint256 tokenId = zeroTier.contribute(gross, address(0));

        uint256 reward = gross * 500 / 10_000;
        assertEq(reward, 100_000_000_000_000_000_000_000_000);
        vm.warp(_START + _PERIOD);
        zeroTier.processAccounting(25);
        assertEq(zeroTier.allocationState(tokenId).earnedScaled[1], reward * Q);
        assertEq(zeroTier.claimableReward(tokenId), reward - 1);

        vm.prank(firstMember);
        assertEq(zeroTier.claimReward(tokenId), reward - 1);
        assertEq(_credit(zeroTier, tokenId) + zeroTier.reserveState().indexCarryScaled, Q);
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
        uint256 tokenId = largeTier.contribute(gross, address(0));

        vm.warp(_START + _PERIOD);
        largeTier.processAccounting(25);
        uint256 allocatedReward = Math.mulDiv(gross, config.rewardBps, 10_000);
        assertEq(largeTier.sharesOf(tokenId), gross);
        assertLe(largeTier.claimableReward(tokenId), allocatedReward);
        assertGt(largeTier.claimableReward(tokenId), 0);

        vm.prank(largeHolder);
        uint256 claimed = largeTier.claimReward(tokenId);
        assertEq(
            claimed * Q + _credit(largeTier, tokenId) + largeTier.reserveState().indexCarryScaled,
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
        uint256 firstToken = zeroTier.contribute(firstGross, address(0));
        vm.prank(secondMember);
        uint256 secondToken = zeroTier.contribute(secondGross, address(0));
        vm.prank(payer);
        uint256 thirdToken = zeroTier.contribute(thirdGross, address(0));

        uint256 allocated = uint256(firstGross) * 500 / 10_000 + uint256(secondGross) * 500 / 10_000
            + uint256(thirdGross) * 500 / 10_000;
        vm.warp(_START + _PERIOD);
        zeroTier.processAccounting(25);
        uint256 claimableBefore = zeroTier.claimableReward(firstToken)
            + zeroTier.claimableReward(secondToken) + zeroTier.claimableReward(thirdToken);
        assertLe(claimableBefore, allocated);

        vm.prank(firstMember);
        uint256 firstClaim = zeroTier.claimReward(firstToken);
        vm.prank(secondMember);
        uint256 secondClaim = zeroTier.claimReward(secondToken);
        vm.prank(payer);
        uint256 thirdClaim = zeroTier.claimReward(thirdToken);

        MembershipTypes.ReserveState memory reserves = zeroTier.reserveState();
        assertEq(
            (firstClaim + secondClaim + thirdClaim) * Q + _credit(zeroTier, firstToken)
                + _credit(zeroTier, secondToken) + _credit(zeroTier, thirdToken)
                + reserves.indexCarryScaled + reserves.distributionDustScaled,
            allocated * Q
        );
    }

    function _credit(MembershipTier target, uint256 id) private view returns (uint256) {
        MembershipTypes.EarnedBalances memory balances =
        target.previewAccounting(id, address(0), 0).settled;
        return balances.member * Q + balances.fractionalScaled[1];
    }

    function test_trackedThirtyTokenStreamAttributes225And75PlusConcurrentFunding() public {
        MembershipTier target = _streamTier(30);
        uint256 first = _contribution(target, firstMember, 60_000_000);
        vm.warp(_START + 15);
        uint256 second = _contribution(target, secondMember, 60_000_000);
        assertEq(_credit(target, second), 0);
        vm.warp(_START + 30);
        target.processAccounting(25);
        // The tracked first stream attributes 22.5/7.5. The second stream has
        // consumed 15 tokens of funding and adds 7.5/7.5, independently.
        assertApproxEqAbs(_credit(target, first), (22_500_000 + 7_500_000) * Q, 240_000_000);
        assertApproxEqAbs(_credit(target, second), (7_500_000 + 7_500_000) * Q, 240_000_000);
        assertEq(target.allocationState(first).earnedScaled[1], 30_000_000 * Q);
        assertEq(target.allocationState(second).earnedScaled[1], 15_000_000 * Q);
    }

    function test_trackedStreamSuspensionRestorationAttributesTwentyAndTen() public {
        MembershipTier target = _streamTier(30);
        uint256 second = _contribution(target, secondMember, 60);
        vm.warp(_START + 30);
        uint256 first = _contribution(target, firstMember, 60);
        uint256 secondEarlier = _credit(target, second);
        vm.warp(_START + 40);
        assertEq(_sync(target, second), 1);
        assertEq(target.totalRewardShares(), 60);
        vm.warp(_START + 50);
        _contribution(target, secondMember, 1);
        _contribution(target, firstMember, 1);
        assertEq(target.totalRewardShares(), 122);
        vm.warp(_START + 60);
        target.processAccounting(25);
        // Each minimum payment rounds its member allocation to zero. Both
        // weights become 61 at the same timestamp, preserving equal weighting.
        assertApproxEqAbs(_credit(target, first), 20 * Q, 1000);
        assertApproxEqAbs(_credit(target, second) - secondEarlier, 10 * Q, 1000);
        assertEq(target.allocationState(first).earnedScaled[1], 30 * Q);
        assertEq(target.sharesOf(second), 61);
    }

    function test_equalTotalDifferentMembersFlushesCarryWithoutReassigningIt() public {
        MembershipTier target = _streamTier(31);
        uint256 first = _contribution(target, firstMember, 7);
        _contribution(target, secondMember, 7);
        vm.warp(_START + 10);
        target.processAccounting(25);
        uint256 carry = target.reserveState().indexCarryScaled;
        uint256 originalCredit = _credit(target, first);
        assertGt(carry, 0);
        target.refund(first, 7);
        _contribution(target, payer, 7);
        assertEq(target.totalRewardShares(), 14);
        assertEq(target.reserveState().indexCarryScaled, 0);
        assertGe(target.reserveState().distributionDustScaled, carry);
        vm.warp(_START + 41);
        target.processAccounting(25);
        assertEq(_credit(target, first), originalCredit);
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
                vm.prank(firstMember);
                paidFirst += dense.claimReward(1);
            }
            if (elapsed % 3 == 0) {
                vm.prank(secondMember);
                paidSecond += dense.claimReward(2);
            }
        }
        dense.processAccounting(25);
        sparse.processAccounting(25);
        assertEq(_credit(sparse, 1), paidFirst * Q + _credit(dense, 1));
        assertEq(_credit(sparse, 2), paidSecond * Q + _credit(dense, 2));
        assertEq(_credit(sparse, 3), _credit(dense, 3));
        assertEq(abi.encode(dense.reserveState()), abi.encode(sparse.reserveState()));
        MembershipTypes.ReserveState memory reserves = sparse.reserveState();
        assertEq(
            _credit(sparse, 1) + _credit(sparse, 2) + _credit(sparse, 3) + reserves.indexCarryScaled
                + reserves.distributionDustScaled,
            8 * Q
        );
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
        id = target.contribute(gross, address(0));
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
        burnedCount = target.synchronizeExpiredMemberships(tokenIds);
    }
}
