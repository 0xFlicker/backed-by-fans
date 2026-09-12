// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {ProtocolBurnRouterTest} from "./ProtocolBurnRouter.t.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {Vm} from "forge-std/Vm.sol";

contract ClaimEverythingTest is ProtocolBurnRouterTest {
    function test_claimEverythingSettlesAndPaysCurrentCreatorAcrossTiers() public {
        MembershipTier second = _secondTier();
        token.approve(address(second), 1000);
        uint256 ownId = second.createMembership(1, address(0));
        vm.warp(1150);
        MembershipTypes.TierClaimRequest[] memory targets = _requests(tier, second);
        uint256 beforeBalance = token.balanceOf(address(this));
        targets[1].tokenIds = _ids(ownId);
        MembershipTypes.ClaimResult[] memory results = factory.claimEverything(targets);
        assertEq(results.length, 2);
        assertGt(results[0].creator, 0);
        assertGt(results[1].creator, 0);
        assertEq(
            token.balanceOf(address(this)) - beforeBalance,
            results[0].creator + results[1].creator + results[1].liveReward
        );
        assertEq(tier.creatorProceeds(), 0);
        assertEq(second.creatorProceeds(), 0);
        assertEq(token.balanceOf(address(factory)), 0);
    }

    function test_claimRewardsCombinesMemberReferralAndCreator() public {
        MembershipTier second = _secondTier();
        token.approve(address(second), 1000);
        uint256 ownId = second.createMembership(1, address(0));
        address buyer = makeAddr("referred buyer");
        token.mint(buyer, 1000);
        vm.startPrank(buyer);
        token.approve(address(second), 1000);
        second.createMembership(1, address(this));
        vm.stopPrank();
        vm.warp(1150);
        MembershipTypes.AccountingPreview memory preview =
            second.previewAccounting(ownId, address(this), address(this), 256);
        uint256 beforeBalance = token.balanceOf(address(this));
        vm.recordLogs();
        MembershipTypes.ClaimResult memory result = second.claimRewards(_ids(ownId), 25);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(result.liveReward, preview.current.member);
        assertEq(result.referral, preview.current.referral);
        assertEq(result.creator, preview.current.creator);
        assertEq(result.processedSteps, preview.processedSteps);
        uint256 payoutEvents;
        uint256 progressEvents;
        for (uint256 i; i < logs.length; ++i) {
            bytes32 topic = logs[i].topics[0];
            if (topic == keccak256("AccountingProgress(uint64,uint256,bool,uint256,uint256)")) {
                assertEq(logs[i].emitter, address(second));
                ++progressEvents;
            }
            if (
                topic == keccak256("RewardClaimed(uint256,address,uint256)")
                    || topic == keccak256("ReferralClaimed(address,uint256)")
                    || topic == keccak256("CreatorProceedsWithdrawn(address,uint256)")
            ) {
                assertEq(logs[i].emitter, address(second));
                uint256 expected = topic == keccak256("RewardClaimed(uint256,address,uint256)")
                    ? result.liveReward
                    : topic == keccak256("ReferralClaimed(address,uint256)")
                        ? result.referral
                        : result.creator;
                assertEq(abi.decode(logs[i].data, (uint256)), expected);
                assertEq(
                    logs[i].topics[logs[i].topics.length - 1],
                    bytes32(uint256(uint160(address(this))))
                );
                ++payoutEvents;
            }
        }
        assertEq(progressEvents, 1);
        assertEq(payoutEvents, 3);
        assertGt(result.liveReward, 0);
        assertGt(result.referral, 0);
        assertGt(result.creator, 0);
        assertEq(
            token.balanceOf(address(this)) - beforeBalance,
            result.liveReward + result.referral + result.creator
        );
        assertEq(second.claimRewards(_ids(ownId), 25).creator, 0);
    }

    function test_onlyFactoryCanChooseBeneficiary() public {
        vm.expectRevert(MembershipTier.ClaimFactoryOnly.selector);
        tier.claimRewardsFor(address(this), new uint256[](0), 25);
    }

    function test_strangerCannotTakeCreatorOrMemberFunds() public {
        uint256 beforeBalance = token.balanceOf(address(this));
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        MembershipTypes.ClaimResult memory result = tier.claimRewards(new uint256[](0), 25);
        assertEq(result.liveReward + result.retiredReward + result.referral + result.creator, 0);
        assertEq(token.balanceOf(address(this)), beforeBalance);
        assertGt(tier.creatorProceeds(), 0);
    }

    function test_rejectsDuplicateAndUnregisteredTargets() public {
        MembershipTypes.TierClaimRequest[] memory targets = _requests(tier, tier);
        vm.expectRevert(MembershipFactory.InvalidClaimBatch.selector);
        factory.claimEverything(targets);
        targets[1].tier = address(123);
        vm.expectRevert(MembershipFactory.InvalidClaimBatch.selector);
        factory.claimEverything(targets);
    }

    function test_reportsBlockedTierAndRollsBackEarlierClaims() public {
        MembershipTier second = _secondTier();
        for (uint256 i; i < 26; ++i) {
            address buyer = makeAddr(vm.toString(i));
            token.mint(buyer, 1000);
            vm.startPrank(buyer);
            token.approve(address(second), 1000);
            second.createMembership(1, address(0));
            vm.stopPrank();
        }
        vm.warp(1200);
        MembershipTypes.TierClaimRequest[] memory targets = _requests(tier, second);
        uint256 balance = token.balanceOf(address(this));
        uint64 cursor = tier.accountingStatus().accountedThrough;
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.ClaimAccountingBehind.selector,
                1,
                address(second),
                uint64(1200),
                uint64(1200)
            )
        );
        factory.claimEverything(targets);
        assertEq(token.balanceOf(address(this)), balance);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        while (!second.accountingStatus().complete) second.processAccounting(25);
        factory.claimEverything(targets);
        assertGt(token.balanceOf(address(this)), balance);
    }

    function test_transferFailureIdentifiesTierAndRollsBackOtherCurrency() public {
        (MembershipTier second, AdversarialERC20 other) = _otherCurrency();
        MembershipTypes.TierClaimRequest[] memory targets = _requests(tier, second);
        uint256 beforeBalance = token.balanceOf(address(this));
        uint64 secondCursor = second.accountingStatus().accountedThrough;
        uint256 secondShares = second.totalRewardShares();
        other.setTransferBehavior(AdversarialERC20.Behavior.RevertTransfer);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.ClaimFailed.selector,
                1,
                address(second),
                abi.encodeWithSelector(AdversarialERC20.ForcedTransferRevert.selector)
            )
        );
        factory.claimEverything(targets);
        assertEq(token.balanceOf(address(this)), beforeBalance);
        assertEq(second.ownerOf(1), address(this), "failed payout restores retired NFT");
        assertEq(second.accountingStatus().accountedThrough, secondCursor);
        assertEq(second.totalRewardShares(), secondShares);
        (uint256 rolledBackRetired,) = second.claimableRetiredReward(address(this));
        assertEq(rolledBackRetired, 0);
        other.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        factory.claimEverything(targets);
        assertGt(token.balanceOf(address(this)), beforeBalance);
        assertGt(other.balanceOf(address(this)), 0);
    }

    function test_callbackCannotReenterClaimEverything() public {
        (MembershipTier second, AdversarialERC20 other) = _otherCurrency();
        MembershipTypes.TierClaimRequest[] memory targets =
            new MembershipTypes.TierClaimRequest[](1);
        targets[0] = MembershipTypes.TierClaimRequest(address(second), new uint256[](0));
        other.setCallback(address(factory), abi.encodeCall(factory.claimEverything, (targets)));
        other.setTransferBehavior(AdversarialERC20.Behavior.Callback);
        factory.claimEverything(targets);
        assertEq(other.callbackAttempts(), 1);
        assertFalse(other.lastCallbackSucceeded());
    }

    function test_depletedBudgetAllowsContinuousSettlementButNotAnotherCheckpoint() public {
        MembershipTier second = _secondTier();
        for (uint256 i; i < 25; ++i) {
            tier.grantMembership(address(this), 1);
        }
        uint256 secondId = second.grantMembership(address(this), 1);
        vm.warp(1200);
        MembershipTypes.TierClaimRequest[] memory targets = _requests(tier, second);
        uint256 occupiedBefore = tier.occupiedSupply();
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.ClaimAccountingBehind.selector,
                1,
                address(second),
                uint64(1200),
                uint64(1200)
            )
        );
        factory.claimEverything(targets);
        assertEq(tier.occupiedSupply(), occupiedBefore, "earlier retirements roll back");
        assertEq(second.ownerOf(secondId), address(this));
        second.processAccounting(1);
        MembershipTypes.ClaimResult[] memory results = factory.claimEverything(targets);
        assertEq(results[0].processedSteps, 25);
        assertEq(results[1].processedSteps, 0);
        assertEq(tier.occupiedSupply(), 1);
    }

    function test_directClaimsRejectDuplicateInvalidAndUnownedIdsBeforeAccounting() public {
        uint256 id = tier.grantMembership(address(this), 1);
        uint256[] memory ids = new uint256[](2);
        ids[0] = id;
        ids[1] = id;
        vm.warp(1150);
        uint64 cursor = tier.accountingStatus().accountedThrough;
        vm.expectRevert(MembershipTier.InvalidClaim.selector);
        tier.claimRewards(ids, 25);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        ids[1] = 9999;
        vm.expectRevert();
        tier.claimRewards(ids, 25);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        address stranger = makeAddr("not selected owner");
        vm.prank(stranger);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        tier.claimRewards(_ids(id), 25);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
    }

    function test_directClaimBoundAccepts32AndRejects33Selections() public {
        uint256[] memory ids = new uint256[](33);
        for (uint256 i; i < ids.length; ++i) {
            ids[i] = tier.grantMembership(address(this), 1);
        }
        vm.expectRevert(MembershipTier.InvalidClaim.selector);
        tier.claimRewards(ids, 25);
        assembly ("memory-safe") { mstore(ids, 32) }
        MembershipTypes.ClaimResult memory result = tier.claimRewards(ids, 25);
        assertEq(result.liveReward + result.retiredReward, 0);
        vm.expectRevert(MembershipTier.InvalidClaim.selector);
        tier.claimRewards(ids, 26);
    }

    function test_factoryEnforces32AggregateIdsAndEightUniqueTiers() public {
        MembershipTier second = _secondTier();
        MembershipTypes.TierClaimRequest[] memory targets = _requests(tier, second);
        targets[0].tokenIds = new uint256[](16);
        targets[1].tokenIds = new uint256[](17);
        for (uint256 i; i < 16; ++i) {
            targets[0].tokenIds[i] = tier.grantMembership(address(this), 1);
        }
        for (uint256 i; i < 17; ++i) {
            targets[1].tokenIds[i] = second.grantMembership(address(this), 1);
        }
        vm.expectRevert(MembershipFactory.InvalidClaimBatch.selector);
        factory.claimEverything(targets);
        uint256[] memory secondIds = targets[1].tokenIds;
        assembly ("memory-safe") { mstore(secondIds, 16) }
        assertEq(factory.claimEverything(targets).length, 2);

        targets = new MembershipTypes.TierClaimRequest[](9);
        for (uint256 i; i < 9; ++i) {
            MembershipTier created = _tierWithSalt(1000 + i);
            targets[i] = MembershipTypes.TierClaimRequest(address(created), new uint256[](0));
        }
        vm.expectRevert(MembershipFactory.InvalidClaimBatch.selector);
        factory.claimEverything(targets);
        assembly ("memory-safe") { mstore(targets, 8) }
        assertEq(factory.claimEverything(targets).length, 8);
    }

    function test_selectedPositionRetiringDuringClaimPaysRetiredCategoryOnceWhilePaused() public {
        MembershipTier second = _secondTier();
        token.approve(address(second), 1000);
        uint256 id = second.createMembership(1, address(0));
        second.setPaused(true);
        vm.warp(1200);
        uint256 beforeBalance = token.balanceOf(address(this));
        MembershipTypes.ClaimResult memory result = second.claimRewards(_ids(id), 25);
        assertEq(result.processedSteps, 2, "funding end and retirement are separate steps");
        assertEq(result.liveReward, 0);
        assertApproxEqAbs(result.retiredReward, 200, 1);
        assertEq(
            token.balanceOf(address(this)) - beforeBalance, result.retiredReward + result.creator
        );
        assertEq(second.sharesOf(id), 0);
        vm.expectRevert();
        second.ownerOf(id);
        vm.expectRevert();
        second.claimRewards(_ids(id), 25);
        result = second.claimRewards(new uint256[](0), 25);
        assertEq(result.liveReward + result.retiredReward + result.referral + result.creator, 0);
    }

    function test_multipleSelectedPositionsDoNotRepeatBeneficiaryCategories() public {
        MembershipTier second = _secondTier();
        token.mint(address(this), 3000);
        token.approve(address(second), 3000);
        second.createMembership(1, address(0));
        vm.warp(1200);
        second.processAccounting(25);
        (uint256 retired,) = second.claimableRetiredReward(address(this));
        assertGt(retired, 0);
        uint256[] memory ids = new uint256[](2);
        ids[0] = second.createMembership(1, address(0));
        ids[1] = second.createMembership(1, address(0));
        address buyer = makeAddr("multi-position referred buyer");
        token.mint(buyer, 1000);
        vm.startPrank(buyer);
        token.approve(address(second), 1000);
        second.createMembership(1, address(this));
        vm.stopPrank();
        vm.warp(1250);
        second.processAccounting(25);
        uint256 creator = second.creatorProceeds();
        uint256 referral = second.claimableReferral(address(this));
        uint256 rewards = second.claimableReward(ids[0]) + second.claimableReward(ids[1]);
        uint256 beforeBalance = token.balanceOf(address(this));
        MembershipTypes.ClaimResult memory result = second.claimRewards(ids, 25);
        assertEq(result.creator, creator);
        assertEq(result.referral, referral);
        assertEq(result.retiredReward, retired);
        assertEq(result.liveReward, rewards);
        assertEq(
            token.balanceOf(address(this)) - beforeBalance, creator + rewards + retired + referral
        );
        result = second.claimRewards(new uint256[](0), 25);
        assertEq(result.liveReward + result.retiredReward + result.referral + result.creator, 0);
    }

    function test_emptySelectionPaysRetiredReferralAndCreatorWithoutAnNft() public {
        MembershipTier second = _secondTier();
        token.approve(address(second), 1000);
        second.createMembership(1, address(0));
        address buyer = makeAddr("empty-selection referred buyer");
        token.mint(buyer, 1000);
        vm.startPrank(buyer);
        token.approve(address(second), 1000);
        second.createMembership(1, address(this));
        vm.stopPrank();
        vm.warp(1200);
        second.processAccounting(25);
        assertEq(second.balanceOf(address(this)), 0);
        assertTrue(second.hasClaimInterest(address(this)));
        (uint256 retired,) = second.claimableRetiredReward(address(this));
        uint256 referral = second.claimableReferral(address(this));
        uint256 creator = second.creatorProceeds();
        uint256 beforeBalance = token.balanceOf(address(this));
        MembershipTypes.ClaimResult memory result = second.claimRewards(new uint256[](0), 0);
        assertEq(result.processedSteps, 0);
        assertEq(result.liveReward, 0);
        assertEq(result.retiredReward, retired);
        assertEq(result.referral, referral);
        assertEq(result.creator, creator);
        assertEq(token.balanceOf(address(this)) - beforeBalance, retired + referral + creator);
    }

    function _ids(uint256 id) private pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    function _requests(MembershipTier first, MembershipTier second)
        private
        pure
        returns (MembershipTypes.TierClaimRequest[] memory targets)
    {
        targets = new MembershipTypes.TierClaimRequest[](2);
        targets[0] = MembershipTypes.TierClaimRequest(address(first), new uint256[](0));
        targets[1] = MembershipTypes.TierClaimRequest(address(second), new uint256[](0));
    }

    function _otherCurrency() private returns (MembershipTier second, AdversarialERC20 other) {
        other = new AdversarialERC20();
        factory.setMinimumPayment(address(other), 1);
        factory.setPaymentTokenEnabled(address(other), true);
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(other)
        );
        config.pricePerPeriod = 1000;
        config.periodDuration = 100;
        config.tierSalt = bytes32(uint256(123));
        second = MembershipTier(factory.createTier(config));
        other.mint(address(this), 1000);
        other.approve(address(second), 1000);
        second.createMembership(1, address(0));
        vm.warp(1200);
    }

    function test_101PositionsAcrossNineTiersPageAndClaimInBoundedBatches() public {
        MembershipTier[] memory tiers = new MembershipTier[](9);
        token.mint(address(this), 109_000);
        for (uint256 t; t < tiers.length; ++t) {
            tiers[t] = _tierWithSalt(1000 + t);
            token.approve(address(tiers[t]), type(uint256).max);
            uint256 count = t == 0 ? 101 : 1;
            for (uint256 j; j < count; ++j) {
                tiers[t].createMembership(1, address(this));
            }
        }
        MembershipTypes.PositionPage memory first = tiers[0].tokensOfOwner(address(this), 0, 100);
        MembershipTypes.PositionPage memory second =
            tiers[0].tokensOfOwner(address(this), first.nextOffset, 100);
        assertEq(first.balance, 101);
        assertEq(first.tokenIds.length, 100);
        assertFalse(first.complete);
        assertEq(second.tokenIds.length, 1);
        assertTrue(second.complete);
        assertEq(second.tokenIds[0], 101);
        MembershipTypes.TierClaimRequest[] memory oversized =
            new MembershipTypes.TierClaimRequest[](9);
        for (uint256 t; t < 9; ++t) {
            oversized[t] = MembershipTypes.TierClaimRequest(address(tiers[t]), new uint256[](0));
        }
        vm.expectRevert(MembershipFactory.InvalidClaimBatch.selector);
        factory.claimEverything(oversized);
        oversized = new MembershipTypes.TierClaimRequest[](1);
        oversized[0] = MembershipTypes.TierClaimRequest(address(tiers[0]), _range(1, 33));
        vm.expectRevert(MembershipFactory.InvalidClaimBatch.selector);
        factory.claimEverything(oversized);

        vm.warp(1150);
        uint256 paid;
        for (uint256 offset; offset < 101; offset += 32) {
            uint256 count = 101 - offset;
            if (count > 32) count = 32;
            MembershipTypes.TierClaimRequest[] memory batch =
                new MembershipTypes.TierClaimRequest[](1);
            batch[0] =
                MembershipTypes.TierClaimRequest(address(tiers[0]), _range(offset + 1, count));
            paid += _claimPreviewed(batch);
        }
        MembershipTypes.TierClaimRequest[] memory rest = new MembershipTypes.TierClaimRequest[](8);
        for (uint256 t; t < 8; ++t) {
            rest[t] = MembershipTypes.TierClaimRequest(address(tiers[t + 1]), _ids(1));
        }
        paid += _claimPreviewed(rest);
        vm.warp(1200);
        uint256 steps;
        for (uint256 t; t < 9; ++t) {
            while (!tiers[t].accountingStatus().complete) {
                MembershipTypes.MaintenanceResult memory progress = tiers[t].processAccounting(25);
                assertLe(progress.processedSteps, 25);
                assertGt(progress.processedSteps, 0);
                steps += progress.processedSteps;
            }
            assertEq(tiers[t].balanceOf(address(this)), 0);
            assertEq(tiers[t].totalRewardShares(), 0);
        }
        assertEq(steps, 218); // One funding END and one expiration for each position.
        for (uint256 t; t < 8; ++t) {
            rest[t] = MembershipTypes.TierClaimRequest(address(tiers[t]), new uint256[](0));
        }
        paid += _claimPreviewed(rest);
        MembershipTypes.TierClaimRequest[] memory last = new MembershipTypes.TierClaimRequest[](1);
        last[0] = MembershipTypes.TierClaimRequest(address(tiers[8]), new uint256[](0));
        paid += _claimPreviewed(last);
        uint256 held;
        for (uint256 t; t < 9; ++t) {
            held += token.balanceOf(address(tiers[t]));
            (uint256 remaining,) = tiers[t].claimableRetiredReward(address(this));
            assertEq(remaining, 0);
        }
        assertEq(paid + held, 109_000);
    }

    function test_selectionTransferredOrBurnedBeforeClaimRollsBackWholeFactoryBatch() public {
        MembershipTier second = _secondTier();
        token.mint(address(this), 2000);
        token.approve(address(second), 2000);
        uint256 first = second.createMembership(1, address(0));
        uint256 last = second.createMembership(1, address(0));
        MembershipTypes.TierClaimRequest[] memory batch = _requests(tier, second);
        batch[1].tokenIds = _range(first, 2);
        vm.warp(1150);
        second.transferFrom(address(this), address(0xBEEF), last);
        uint256 beforeBalance = token.balanceOf(address(this));
        uint64 cursor = tier.accountingStatus().accountedThrough;
        vm.expectRevert();
        factory.claimEverything(batch);
        assertEq(token.balanceOf(address(this)), beforeBalance);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
        second.refund(first, address(this), 1000);
        batch[1].tokenIds = _ids(first);
        vm.expectRevert();
        factory.claimEverything(batch);
        assertEq(token.balanceOf(address(this)), beforeBalance + 500);
        assertEq(tier.accountingStatus().accountedThrough, cursor);
    }

    function _range(uint256 start, uint256 count) private pure returns (uint256[] memory ids) {
        ids = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ids[i] = start + i;
        }
    }

    function _claimPreviewed(MembershipTypes.TierClaimRequest[] memory batch)
        private
        returns (uint256 total)
    {
        MembershipTypes.ClaimPreview[] memory previews =
            new MembershipTypes.ClaimPreview[](batch.length);
        uint256 remaining = 25;
        for (uint256 t; t < batch.length; ++t) {
            previews[t] = MembershipTier(batch[t].tier)
                .previewClaimRewards(address(this), batch[t].tokenIds, remaining);
            assertTrue(previews[t].complete);
            remaining -= previews[t].processedSteps;
        }
        uint256 beforeBalance = token.balanceOf(address(this));
        MembershipTypes.ClaimResult[] memory results = factory.claimEverything(batch);
        for (uint256 t; t < batch.length; ++t) {
            MembershipTypes.ClaimPreview memory preview = previews[t];
            uint256 live;
            for (uint256 j; j < preview.positions.length; ++j) {
                live += preview.positions[j].creditScaled / (1 << 128);
            }
            assertEq(results[t].processedSteps, preview.processedSteps);
            assertEq(results[t].liveReward, live);
            assertEq(results[t].retiredReward, preview.retiredCreditScaled / (1 << 128));
            assertEq(results[t].referral, preview.referralCreditScaled / (1 << 128));
            assertEq(results[t].creator, preview.creatorCreditScaled / (1 << 128));
            total += results[t].liveReward + results[t].retiredReward + results[t].referral
            + results[t].creator;
        }
        assertEq(token.balanceOf(address(this)) - beforeBalance, total);
    }

    function _secondTier() private returns (MembershipTier) {
        return _tierWithSalt(99);
    }

    function _tierWithSalt(uint256 salt) private returns (MembershipTier) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(token)
        );
        config.tierSalt = bytes32(salt);
        config.protocolFeeBps = 1000;
        config.rewardBps = 2000;
        config.referralBps = 1000;
        config.pricePerPeriod = 1000;
        config.periodDuration = 100;
        return MembershipTier(factory.createTier(config));
    }
}
