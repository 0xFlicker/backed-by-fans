// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";

import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";

import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MembershipTierHarness} from "./mocks/MembershipTierHarness.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract CapacityAndPauseTest is Test {
    MembershipTierHarness private tier;
    address private member;
    address private competitor;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(_START);
        member = makeAddr("member");
        competitor = makeAddr("competitor");
        tier = _deployTier(1);
    }

    function test_expiredPositionReleasesSlotThroughPermissionlessIdempotentMaintenance() public {
        uint256 tokenId = tier.grantMembership(member, 1);
        vm.warp(tier.expiresAt(tokenId));

        assertFalse(tier.isActiveToken(tokenId));
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 1);

        vm.prank(competitor);
        assertEq(tier.processExpirations(25).retiredCount, 1);
        assertFalse(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 0);

        assertEq(tier.processExpirations(25).retiredCount, 0);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_maintenanceBeforeExpiryDoesNotMutateStoredMembershipTime() public {
        uint256 tokenId = tier.grantMembership(member, 2);
        MembershipTypes.MembershipState memory beforeState = tier.storedTimeState(tokenId);
        vm.warp(_START + 15 days);

        assertEq(tier.processExpirations(25).retiredCount, 0);

        MembershipTypes.MembershipState memory afterState = tier.storedTimeState(tokenId);
        assertEq(afterState.checkpoint, beforeState.checkpoint);
        assertEq(afterState.paidSeconds, beforeState.paidSeconds);
        assertEq(afterState.grantSeconds, beforeState.grantSeconds);
        assertEq(afterState.occupied, beforeState.occupied);
        assertEq(tier.occupiedSupply(), 1);
    }

    function test_creationRetiresExpiredPositionBeforeReusingCapacityWithNewId() public {
        uint256 tokenId = tier.grantMembership(member, 1);
        vm.warp(tier.expiresAt(tokenId));
        uint256 fresh = tier.grantMembership(member, 1);
        assertGt(fresh, tokenId);
        assertEq(tier.occupiedSupply(), 1);
        assertFalse(tier.isOccupied(tokenId));
        assertTrue(tier.isActiveToken(fresh));
        assertEq(tier.balanceOf(member), 1);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId)
        );
        tier.ownerOf(tokenId);
        vm.expectRevert(MembershipTier.CapacityReached.selector);
        tier.grantMembership(competitor, 1);
    }

    function test_returningWalletCanLoseReleasedCapacityRace() public {
        uint256 tokenId = tier.grantMembership(member, 1);
        vm.warp(tier.expiresAt(tokenId));
        vm.prank(competitor);
        assertEq(tier.processExpirations(25).retiredCount, 1);
        tier.grantMembership(competitor, 1);
        vm.expectRevert(MembershipTier.CapacityReached.selector);
        tier.grantMembership(member, 1);
        assertEq(tier.balanceOf(member), 0);
        assertFalse(tier.isOccupied(tokenId));
        assertEq(tier.totalMinted(), 2);
    }

    function test_activeOrHeldOccupancyConstrainsSupplyCapLowering() public {
        MembershipTierHarness uncappedTier = _deployTier(0);
        uncappedTier.grantMembership(member, 1);
        uncappedTier.grantMembership(competitor, 1);

        vm.expectRevert(MembershipTier.SupplyCapBelowOccupancy.selector);
        uncappedTier.setSupplyCap(1);

        uncappedTier.setSupplyCap(2);
        assertEq(uncappedTier.supplyCap(), 2);

        vm.warp(_START + _PERIOD);
        assertEq(uncappedTier.processExpirations(25).retiredCount, 2);
        assertEq(uncappedTier.occupiedSupply(), 0);
        uncappedTier.setSupplyCap(1);
        assertEq(uncappedTier.supplyCap(), 1);

        uncappedTier.setSupplyCap(0);
        assertEq(uncappedTier.supplyCap(), 0);
    }

    function test_pauseBlocksFixedPriceTimeIncreasesButNotPassiveAccess() public {
        uint256 tokenId = tier.grantMembership(member, 1);
        uint64 expiration = tier.expiresAt(tokenId);
        tier.setPaused(true);

        assertTrue(tier.paused());
        assertFalse(tier.isRenewable(tokenId));
        assertTrue(tier.isActiveToken(tokenId));

        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.grantMembership(member, 1);

        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.addGrantTime(tokenId, member, 1);

        vm.expectRevert(MembershipTier.TierPaused.selector);
        vm.prank(member);
        tier.createMembership(1, address(0));

        vm.expectRevert(MembershipTier.TierPaused.selector);
        vm.prank(member);
        tier.renewMembership(tokenId, 1, address(0));

        vm.expectRevert(MembershipTier.TierPaused.selector);
        vm.prank(competitor);
        tier.giftMembership(member, 1);

        vm.expectRevert(MembershipTier.TierPaused.selector);
        vm.prank(competitor);
        tier.giftRenewal(tokenId, member, 1, MembershipTypes.ReferralStatus.Unset, address(0));

        assertEq(tier.expiresAt(tokenId), expiration);
        vm.warp(expiration);
        assertFalse(tier.isActiveToken(tokenId));
        vm.prank(competitor);
        assertEq(tier.processExpirations(1).retiredCount, 1);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_multiplePositionsInOneWalletConsumeIndependentCapacity() public {
        MembershipTierHarness target = _deployTier(2);
        uint256 paid = _purchase(target, member);
        uint256 granted = target.grantMembership(member, 2);
        assertNotEq(paid, granted);
        assertEq(target.balanceOf(member), 2);
        assertEq(target.occupiedSupply(), 2);
        vm.expectRevert(MembershipTier.CapacityReached.selector);
        target.grantMembership(member, 1);
        target.revokeGrantTime(granted, member);
        assertEq(target.occupiedSupply(), 1);
        assertTrue(target.isActiveToken(paid));
        uint256 replacement = target.grantMembership(competitor, 1);
        assertGt(replacement, granted);
        assertEq(target.occupiedSupply(), 2);
        assertEq(target.lifetimeGross(), 10_000_000);
    }

    function test_unpauseRestoresTimeIncreases() public {
        tier.setPaused(true);
        tier.setPaused(false);

        uint256 tokenId = _purchase(tier, member);

        assertTrue(tier.isActiveToken(tokenId));
        assertEq(tier.expiresAt(tokenId), _START + _PERIOD);
    }

    function test_twoStepOwnershipTransferCompletesWhilePaused() public {
        address nextOwner = makeAddr("pausedNextOwner");
        tier.setPaused(true);

        tier.transferOwnership(nextOwner);
        vm.prank(nextOwner);
        tier.acceptOwnership();

        assertEq(tier.owner(), nextOwner);
        assertTrue(tier.paused());
        vm.prank(nextOwner);
        tier.setPaused(false);
        assertFalse(tier.paused());
    }

    function _deployTier(uint64 supplyCap) private returns (MembershipTierHarness deployedTier) {
        MockUSDG token = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config = _config(address(renderer), address(token));
        config.supplyCap = supplyCap;
        deployedTier = new MembershipTierHarness(
            SyntheticVaultBinding.bind(address(this), address(token)),
            token,
            address(renderer),
            config
        );
        _fundAndApprove(deployedTier, member);
        _fundAndApprove(deployedTier, competitor);
    }

    function _purchase(MembershipTier target, address buyer) private returns (uint256 tokenId) {
        vm.prank(buyer);
        tokenId = target.createMembership(1, address(0));
    }

    function _fundAndApprove(MembershipTier target, address buyer) private {
        MockUSDG token = MockUSDG(address(target.paymentToken()));
        token.mint(buyer, 100_000_000);
        vm.prank(buyer);
        token.approve(address(target), type(uint256).max);
    }

    function _config(address renderer_, address paymentToken_)
        private
        view
        returns (MembershipTypes.TierConfig memory)
    {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer_, paymentToken_);
        config.supplyCap = 1;
        return config;
    }
}
