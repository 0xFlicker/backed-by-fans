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
        second.purchase(1, address(0));
        vm.warp(1150);
        address[] memory targets = new address[](2);
        targets[0] = address(tier);
        targets[1] = address(second);
        uint256 beforeBalance = token.balanceOf(address(this));
        MembershipTypes.ClaimResult[] memory results = factory.claimEverything(targets);
        assertEq(results.length, 2);
        assertGt(results[0].creator, 0);
        assertGt(results[1].creator, 0);
        assertEq(
            token.balanceOf(address(this)) - beforeBalance,
            results[0].creator + results[1].creator + results[1].reward
        );
        assertEq(tier.creatorProceeds(), 0);
        assertEq(second.creatorProceeds(), 0);
        assertEq(token.balanceOf(address(factory)), 0);
    }

    function test_claimAllCombinesMemberReferralAndCreator() public {
        MembershipTier second = _secondTier();
        token.approve(address(second), 1000);
        second.purchase(1, address(0));
        address buyer = makeAddr("referred buyer");
        token.mint(buyer, 1000);
        vm.startPrank(buyer);
        token.approve(address(second), 1000);
        second.purchase(1, address(this));
        vm.stopPrank();
        vm.warp(1200);
        MembershipTypes.AccountingPreview memory preview =
            second.previewAccounting(second.tokenOf(address(this)), address(this), 256);
        uint256 beforeBalance = token.balanceOf(address(this));
        vm.recordLogs();
        MembershipTypes.ClaimResult memory result = second.claimAll();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(result.reward, preview.current.member);
        assertEq(result.referral, preview.current.referral);
        assertEq(result.creator, preview.current.creator);
        assertEq(result.processedSteps, preview.processedSteps);
        uint256 payoutEvents;
        uint256 progressEvents;
        for (uint256 i; i < logs.length; ++i) {
            bytes32 topic = logs[i].topics[0];
            if (topic == keccak256("AccountingProgress(uint64,uint256,bool,uint256)")) {
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
                    ? result.reward
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
        assertGt(result.reward, 0);
        assertGt(result.referral, 0);
        assertGt(result.creator, 0);
        assertEq(
            token.balanceOf(address(this)) - beforeBalance,
            result.reward + result.referral + result.creator
        );
        assertEq(second.claimAll().creator, 0);
    }

    function test_onlyFactoryCanChooseBeneficiary() public {
        vm.expectRevert(MembershipTier.ClaimFactoryOnly.selector);
        tier.claimAllFor(address(this), 25);
    }

    function test_strangerCannotTakeCreatorOrMemberFunds() public {
        uint256 beforeBalance = token.balanceOf(address(this));
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        MembershipTypes.ClaimResult memory result = tier.claimAll();
        assertEq(result.reward + result.referral + result.creator, 0);
        assertEq(token.balanceOf(address(this)), beforeBalance);
        assertGt(tier.creatorProceeds(), 0);
    }

    function test_rejectsDuplicateAndUnregisteredTargets() public {
        address[] memory targets = new address[](2);
        targets[0] = address(tier);
        targets[1] = address(tier);
        vm.expectRevert(MembershipFactory.InvalidClaimBatch.selector);
        factory.claimEverything(targets);
        targets[1] = address(123);
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
            second.purchase(1, address(0));
            vm.stopPrank();
        }
        vm.warp(1200);
        address[] memory targets = new address[](2);
        targets[0] = address(tier);
        targets[1] = address(second);
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
        second.processAccounting(25);
        factory.claimEverything(targets);
        assertGt(token.balanceOf(address(this)), balance);
    }

    function test_transferFailureIdentifiesTierAndRollsBackOtherCurrency() public {
        (MembershipTier second, AdversarialERC20 other) = _otherCurrency();
        address[] memory targets = new address[](2);
        targets[0] = address(tier);
        targets[1] = address(second);
        uint256 beforeBalance = token.balanceOf(address(this));
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
        other.setTransferBehavior(AdversarialERC20.Behavior.Normal);
        factory.claimEverything(targets);
        assertGt(token.balanceOf(address(this)), beforeBalance);
        assertGt(other.balanceOf(address(this)), 0);
    }

    function test_callbackCannotReenterClaimEverything() public {
        (MembershipTier second, AdversarialERC20 other) = _otherCurrency();
        address[] memory targets = new address[](1);
        targets[0] = address(second);
        other.setCallback(address(factory), abi.encodeCall(factory.claimEverything, (targets)));
        other.setTransferBehavior(AdversarialERC20.Behavior.Callback);
        factory.claimEverything(targets);
        assertEq(other.callbackAttempts(), 1);
        assertFalse(other.lastCallbackSucceeded());
    }

    function test_depletedBudgetAllowsContinuousSettlementButNotAnotherCheckpoint() public {
        MembershipTier second = _secondTier();
        for (uint256 i; i < 26; ++i) {
            MembershipTier target = i < 25 ? tier : second;
            address buyer = makeAddr(vm.toString(i));
            token.mint(buyer, 1000);
            vm.startPrank(buyer);
            token.approve(address(target), 1000);
            target.purchase(1, address(0));
            vm.stopPrank();
        }
        vm.warp(1200);
        address[] memory targets = new address[](2);
        targets[0] = address(tier);
        targets[1] = address(second);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipFactory.ClaimAccountingBehind.selector,
                1,
                address(second),
                uint64(1100),
                uint64(1200)
            )
        );
        factory.claimEverything(targets);
        second.processAccounting(1);
        MembershipTypes.ClaimResult[] memory results = factory.claimEverything(targets);
        assertEq(results[0].processedSteps, 25);
        assertEq(results[1].processedSteps, 0);
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
        second.purchase(1, address(0));
        vm.warp(1200);
    }

    function _secondTier() private returns (MembershipTier) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(token)
        );
        config.tierSalt = bytes32(uint256(99));
        config.protocolFeeBps = 1000;
        config.rewardBps = 2000;
        config.referralBps = 1000;
        config.pricePerPeriod = 1000;
        config.periodDuration = 100;
        return MembershipTier(factory.createTier(config));
    }
}
