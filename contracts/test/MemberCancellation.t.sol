// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Test} from "forge-std/Test.sol";

contract MemberCancellationTest is Test {
    MembershipTier internal tier;
    MockUSDG internal token;
    address internal creator = address(0xC);
    address internal member = address(0xA);
    address internal operator = address(0xB);

    function setUp() public {
        _deploy(3000);
    }

    function _deploy(uint16 retention) internal {
        new LinkedVestingFixture().install();
        vm.warp(1_000_000);
        token = new MockUSDG();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            creator, address(new OnchainMetadataRenderer()), address(token)
        );
        config.creatorRetentionBps = retention;
        tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(0xF), address(token)), token, config
        );
        token.mint(member, 10_000_000);
        vm.startPrank(member);
        token.approve(address(tier), type(uint256).max);
        tier.createMembership(1, address(0), 25);
        vm.stopPrank();
    }

    event SubscriptionUpdate(uint256 indexed tokenId, uint64 expiration);

    function test_adapterEmitsZeroExpiration() public {
        vm.expectEmit(true, false, false, true, address(tier));
        emit SubscriptionUpdate(1, 0);
        vm.prank(member);
        tier.cancelSubscription(1);
    }

    function test_nativeEmitsZeroExpiration() public {
        vm.expectEmit(true, false, false, true, address(tier));
        emit SubscriptionUpdate(1, 0);
        vm.prank(member);
        tier.cancelMembership(1, member, 0, uint64(block.timestamp + 120), 25);
    }

    function test_ownerAdapterPaysSevenAndCreditsThree() public {
        vm.prank(member);
        tier.cancelSubscription(1);
        assertEq(token.balanceOf(member), 7_000_000);
        assertEq(tier.creatorProceeds(), 3_000_000);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.totalRewardShares(), 0);
        assertEq(tier.lifetimeGross(), 10_000_000);
        assertEq(tier.totalProtectedLiability(), 3_000_000);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        tier.ownerOf(1);
        vm.prank(creator);
        assertEq(tier.withdrawCreatorProceeds(), 3_000_000);
        assertEq(token.balanceOf(address(tier)), 0);
    }

    function test_fullRetentionAllowsZeroPayoutExit() public {
        _deploy(10_000);
        MembershipTypes.CancellationPreview memory quote =
            tier.previewCancellation(1, uint64(block.timestamp + 120), 25);
        assertTrue(quote.quoteAvailable);
        assertEq(quote.ownerRefund, 0);
        assertEq(quote.minOwnerRefund, 0);
        vm.prank(member);
        (uint256 paid, uint256 retained) = tier.cancelMembership(1, member, 0, quote.deadline, 25);
        assertEq(paid, 0);
        assertEq(retained, 10_000_000);
        assertEq(tier.creatorProceeds(), retained);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.lifetimeGross(), 10_000_000);
    }

    function test_creatorAloneCannotCancel() public {
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, creator, 1)
        );
        tier.cancelSubscription(1);
        assertEq(tier.ownerOf(1), member);
    }

    function test_tokenOperatorPaysCurrentOwnerWhilePaused() public {
        vm.prank(member);
        tier.approve(operator, 1);
        vm.prank(creator);
        tier.setPaused(true);
        vm.prank(operator);
        tier.cancelSubscription(1);
        assertEq(token.balanceOf(member), 7_000_000);
        assertEq(token.balanceOf(operator), 0);
    }

    function test_ownerWideOperatorCanCancel() public {
        vm.prank(member);
        tier.setApprovalForAll(operator, true);
        vm.prank(operator);
        tier.cancelSubscription(1);
        assertEq(token.balanceOf(member), 7_000_000);
    }

    function test_revokedApprovalCannotCancel() public {
        vm.startPrank(member);
        tier.approve(operator, 1);
        tier.approve(address(0), 1);
        vm.stopPrank();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InsufficientApproval.selector, operator, 1)
        );
        tier.cancelSubscription(1);
    }

    function test_nativeMinimumRejectsAtomicallyAndEqualitySucceeds() public {
        uint64 deadline = uint64(block.timestamp + 120);
        uint256 minimum = 7_000_000;
        vm.warp(deadline);
        vm.prank(member);
        vm.expectRevert();
        tier.cancelMembership(1, member, minimum, deadline, 25);
        assertEq(tier.ownerOf(1), member);
        assertEq(tier.lifetimeGross(), 10_000_000);
        vm.prank(member);
        (uint256 paid, uint256 retained) = tier.cancelMembership(1, member, 0, deadline, 25);
        assertGt(paid, 0);
        assertGt(retained, 0);
        assertEq(token.balanceOf(member), paid);
    }

    function test_nativeLateDeadlineRejectsWithoutBurn() public {
        uint64 deadline = uint64(block.timestamp + 120);
        vm.warp(deadline + 1);
        vm.prank(member);
        vm.expectRevert(MembershipTier.InvalidCancellationDeadline.selector);
        tier.cancelMembership(1, member, 0, deadline, 25);
        assertEq(tier.ownerOf(1), member);
    }

    function test_nativeDeadlineMustPrecedeExpiration() public {
        uint64 expiry = tier.expiresAt(1);
        vm.prank(member);
        vm.expectRevert(MembershipTier.InvalidCancellationDeadline.selector);
        tier.cancelMembership(1, member, 0, expiry, 25);
    }

    function test_improvingRetentionAppliesToExistingPositionAcrossAdminTransfer() public {
        vm.prank(creator);
        tier.setCreatorRetentionBps(2000);
        vm.prank(creator);
        tier.transferOwnership(operator);
        vm.prank(operator);
        tier.acceptOwnership();
        vm.prank(operator);
        vm.expectRevert(MembershipTier.InvalidCreatorRetention.selector);
        tier.setCreatorRetentionBps(3000);
        vm.prank(member);
        tier.cancelSubscription(1);
        assertEq(token.balanceOf(member), 8_000_000);
        assertEq(tier.creatorProceeds(), 2_000_000);
    }

    function test_zeroRetentionReturnsAllUnusedFunding() public {
        vm.prank(creator);
        tier.setCreatorRetentionBps(0);
        vm.prank(member);
        tier.cancelSubscription(1);
        assertEq(token.balanceOf(member), 10_000_000);
        assertEq(tier.creatorProceeds(), 0);
    }

    function test_nativeExpectedOwnerRejectsAfterTransfer() public {
        vm.prank(member);
        tier.transferFrom(member, operator, 1);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.MembershipOwnerMismatch.selector, 1, member, operator
            )
        );
        tier.cancelMembership(1, member, 0, uint64(block.timestamp + 120), 25);
        assertEq(tier.ownerOf(1), operator);
    }

    function test_quoteProjectsFloorThroughDeadlineWithoutWrites() public {
        uint64 deadline = uint64(block.timestamp + 120);
        MembershipTypes.CancellationPreview memory quote = tier.previewCancellation(1, deadline, 25);
        assertTrue(quote.cancellationEligible);
        assertTrue(quote.complete);
        assertTrue(quote.quoteAvailable);
        assertEq(quote.ownerRefund, 7_000_000);
        assertLt(quote.minOwnerRefund, quote.ownerRefund);
        assertEq(tier.creatorProceeds(), 0);
        vm.warp(deadline);
        vm.prank(member);
        (uint256 paid,) = tier.cancelMembership(1, member, quote.minOwnerRefund, deadline, 25);
        assertEq(paid, quote.minOwnerRefund);
    }

    function test_nonLivePreviewResolvesLifecycleBeforeStaleDeadline() public {
        uint64 deadline = uint64(block.timestamp + 120);
        vm.warp(tier.expiresAt(1));
        MembershipTypes.CancellationPreview memory quote = tier.previewCancellation(1, deadline, 25);
        assertEq(
            uint256(quote.lifecycle), uint256(MembershipTypes.MembershipLifecycle.ExpiredPending)
        );
        assertFalse(quote.cancellationEligible);
        assertFalse(quote.quoteAvailable);
        tier.processAccounting(25);
        quote = tier.previewCancellation(1, deadline, 25);
        assertEq(uint256(quote.lifecycle), uint256(MembershipTypes.MembershipLifecycle.Retired));
        assertFalse(quote.quoteAvailable);
        assertEq(quote.owner, address(0));
        vm.expectRevert(abi.encodeWithSelector(MembershipTier.InvalidTokenId.selector, 2));
        tier.previewCancellation(2, deadline, 25);
    }

    function test_deadlineProjectionCrossesPaidLotBoundary() public {
        token.mint(member, 10_000_000);
        vm.prank(member);
        tier.renewMembership(1, 1, address(0), 25);
        vm.warp(1_000_000 + 30 days - 60);
        uint64 deadline = uint64(block.timestamp + 120);
        MembershipTypes.CancellationPreview memory quote = tier.previewCancellation(1, deadline, 25);
        assertTrue(quote.quoteAvailable);
        assertGt(quote.ownerRefund, quote.minOwnerRefund);
        vm.warp(deadline);
        vm.prank(member);
        (uint256 paid,) = tier.cancelMembership(1, member, quote.minOwnerRefund, deadline, 25);
        assertEq(paid, quote.minOwnerRefund);
    }

    function test_deadlineFloorTracksChangingContributionRate() public {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            creator, address(new OnchainMetadataRenderer()), address(token)
        );
        config.pricePerPeriod = 0;
        config.creatorRetentionBps = 3000;
        MembershipTier contribution = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(0xF), address(token)), token, config
        );
        token.mint(member, 50_000_000);
        vm.startPrank(member);
        token.approve(address(contribution), 50_000_000);
        contribution.createContributionMembership(10_000_000, address(0), 25);
        contribution.renewContributionMembership(1, 40_000_000, address(0), 25);
        vm.stopPrank();
        uint64 duration = contribution.periodDuration();
        vm.warp(1_000_000 + duration - 60);
        uint64 deadline = uint64(block.timestamp + 120);
        MembershipTypes.CancellationPreview memory quote =
            contribution.previewCancellation(1, deadline, 25);
        assertTrue(quote.quoteAvailable);
        uint256 futureGross = uint256(40_000_000) * (duration - 60) / duration;
        assertEq(quote.minOwnerRefund, futureGross * 7000 / 10_000);
        vm.warp(deadline);
        vm.prank(member);
        (uint256 paid,) =
            contribution.cancelMembership(1, member, quote.minOwnerRefund, deadline, 25);
        assertEq(paid, quote.minOwnerRefund);
    }

    function test_incompleteFutureProjectionCannotOfferMinimum() public {
        token.mint(member, 10_000_000);
        vm.prank(member);
        tier.renewMembership(1, 1, address(0), 25);
        vm.warp(1_000_000 + 30 days - 60);
        MembershipTypes.CancellationPreview memory quote =
            tier.previewCancellation(1, uint64(block.timestamp + 120), 0);
        assertTrue(quote.complete);
        assertFalse(quote.quoteAvailable);
        assertEq(quote.minOwnerRefund, 0);
        assertEq(
            uint256(quote.unavailableReason),
            uint256(MembershipTypes.CancellationUnavailableReason.AccountingBehind)
        );
    }
}
