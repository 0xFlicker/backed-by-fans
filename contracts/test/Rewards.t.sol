// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

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
    address private firstMember;
    address private secondMember;
    address private payer;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        firstMember = makeAddr("firstMember");
        secondMember = makeAddr("secondMember");
        payer = makeAddr("payer");

        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            address(this),
            paymentToken,
            1,
            address(renderer),
            address(renderer).codehash,
            MembershipTestConfig.defaultConfig(address(this))
        );

        _fundAndApprove(firstMember, 1_000_000_000);
        _fundAndApprove(secondMember, 1_000_000_000);
        _fundAndApprove(payer, 1_000_000_000);
    }

    function test_firstPositivePaymentMintsGrossSharesAndCurrentReward() public {
        vm.prank(firstMember);
        uint256 tokenId = tier.purchase(1, address(0));

        assertEq(tier.sharesOf(tokenId), 10_000_000);
        assertEq(tier.totalShares(), 10_000_000);
        assertEq(tier.rewardReserve(), 500_000);
        assertEq(tier.claimableReward(tokenId), 500_000);
    }

    function test_newSharesReceiveCurrentButNoEarlierRewards() public {
        vm.prank(firstMember);
        uint256 firstToken = tier.purchase(1, address(0));
        assertEq(tier.claimableReward(firstToken), 500_000);

        vm.prank(secondMember);
        uint256 secondToken = tier.purchase(1, address(0));

        assertEq(tier.claimableReward(firstToken), 750_000);
        assertEq(tier.claimableReward(secondToken), 250_000);
        assertEq(tier.claimableReward(firstToken) + tier.claimableReward(secondToken), 1_000_000);
        assertEq(tier.rewardReserve(), 1_000_000);
    }

    function test_grantOnlyCredentialGetsNoEarlierRewardBeforeFirstShares() public {
        vm.prank(firstMember);
        uint256 firstToken = tier.purchase(1, address(0));
        uint256 secondToken = tier.grantTime(secondMember, 1);

        assertEq(tier.sharesOf(secondToken), 0);
        assertEq(tier.claimableReward(secondToken), 0);

        vm.prank(secondMember);
        tier.purchase(1, address(0));

        assertEq(tier.claimableReward(firstToken), 750_000);
        assertEq(tier.claimableReward(secondToken), 250_000);
    }

    function test_giftAssignsSharesAndRewardToRecipientCredential() public {
        vm.prank(payer);
        uint256 tokenId =
            tier.gift(firstMember, 2, MembershipTypes.ReferralStatus.Unset, address(0));

        assertEq(tier.ownerOf(tokenId), firstMember);
        assertEq(tier.sharesOf(tokenId), 20_000_000);
        assertEq(tier.claimableReward(tokenId), 1_000_000);
        assertEq(tier.tokenOf(payer), 0);
    }

    function test_sharesSurviveExpirationSynchronizationAndGrantRevocation() public {
        vm.prank(firstMember);
        uint256 tokenId = tier.purchase(1, address(0));
        tier.grantTime(firstMember, 1);
        uint256 shares = tier.sharesOf(tokenId);

        tier.revokeGrantTime(tokenId);
        vm.warp(tier.expiresAt(tokenId));
        assertTrue(tier.synchronize(tokenId));

        assertEq(tier.sharesOf(tokenId), shares);
        assertEq(tier.totalShares(), shares);
        assertEq(tier.claimableReward(tokenId), 500_000);
    }

    function test_zeroContributionMintsNoSharesOrReward() public {
        MembershipTier zeroTier = _deployZeroTier();
        vm.prank(firstMember);
        uint256 tokenId = zeroTier.contribute(0, address(0));

        assertEq(zeroTier.sharesOf(tokenId), 0);
        assertEq(zeroTier.totalShares(), 0);
        assertEq(zeroTier.rewardReserve(), 0);
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
        assertEq(zeroTier.rewardReserve(), reward);
        assertEq(zeroTier.claimableReward(tokenId), reward - 1);

        vm.prank(firstMember);
        assertEq(zeroTier.claimReward(tokenId), reward - 1);
        assertEq(zeroTier.rewardReserve(), 1);
    }

    function test_nearUintRangeContributionSettlesRewardWithoutIntermediateOverflow() public {
        MockUSDG largeSupplyToken = new MockUSDG();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        config.pricePerPeriod = 0;
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTier largeTier = new MembershipTier(
            address(this),
            largeSupplyToken,
            1,
            address(renderer),
            address(renderer).codehash,
            config
        );
        address largeHolder = makeAddr("largeHolder");
        uint256 gross = type(uint256).max;
        largeSupplyToken.mint(largeHolder, gross);
        vm.prank(largeHolder);
        largeSupplyToken.approve(address(largeTier), gross);

        vm.prank(largeHolder);
        uint256 tokenId = largeTier.contribute(gross, address(0));

        uint256 allocatedReward = Math.mulDiv(gross, config.rewardBps, 10_000);
        assertEq(largeTier.sharesOf(tokenId), gross);
        assertLe(largeTier.claimableReward(tokenId), allocatedReward);
        assertGt(largeTier.claimableReward(tokenId), 0);

        vm.prank(largeHolder);
        uint256 claimed = largeTier.claimReward(tokenId);
        assertEq(claimed + largeTier.rewardReserve(), allocatedReward);
        assertLe(largeTier.rewardReserve(), 1);
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
        uint256 claimableBefore = zeroTier.claimableReward(firstToken)
            + zeroTier.claimableReward(secondToken) + zeroTier.claimableReward(thirdToken);
        assertLe(claimableBefore, zeroTier.rewardReserve());

        vm.prank(firstMember);
        uint256 firstClaim = zeroTier.claimReward(firstToken);
        vm.prank(secondMember);
        uint256 secondClaim = zeroTier.claimReward(secondToken);
        vm.prank(payer);
        uint256 thirdClaim = zeroTier.claimReward(thirdToken);

        assertEq(firstClaim + secondClaim + thirdClaim + zeroTier.rewardReserve(), allocated);
    }

    function _deployZeroTier() private returns (MembershipTier zeroTier) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        config.pricePerPeriod = 0;
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        zeroTier = new MembershipTier(
            address(this), paymentToken, 1, address(renderer), address(renderer).codehash, config
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
}
