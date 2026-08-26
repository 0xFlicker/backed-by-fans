// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

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
        vm.warp(_START);
        member = makeAddr("member");
        competitor = makeAddr("competitor");
        tier = _deployTier(1);
    }

    function test_expiredMemberKeepsSlotUntilPermissionlessIdempotentSync() public {
        uint256 tokenId = tier.grantTime(member, 1);
        vm.warp(tier.expiresAt(tokenId));

        assertFalse(tier.isActive(member));
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 1);

        vm.prank(competitor);
        assertTrue(tier.synchronize(tokenId));
        assertFalse(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 0);

        assertFalse(tier.synchronize(tokenId));
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_synchronizeActiveMemberIsAStateNoOp() public {
        uint256 tokenId = tier.grantTime(member, 2);
        MembershipTypes.MembershipState memory beforeState = tier.storedTimeState(tokenId);
        vm.warp(_START + 15 days);

        assertFalse(tier.synchronize(tokenId));

        MembershipTypes.MembershipState memory afterState = tier.storedTimeState(tokenId);
        assertEq(afterState.checkpoint, beforeState.checkpoint);
        assertEq(afterState.paidSeconds, beforeState.paidSeconds);
        assertEq(afterState.grantSeconds, beforeState.grantSeconds);
        assertEq(afterState.occupied, beforeState.occupied);
        assertEq(tier.occupiedSupply(), 1);
    }

    function test_expiredUnsynchronizedMemberReactivatesThroughHeldSlot() public {
        uint256 tokenId = tier.grantTime(member, 1);
        vm.warp(tier.expiresAt(tokenId));

        uint256 reusedToken = tier.grantTime(member, 1);

        assertEq(reusedToken, tokenId);
        assertEq(tier.occupiedSupply(), 1);
        assertTrue(tier.isOccupied(tokenId));
        assertTrue(tier.isActive(member));

        vm.expectRevert(MembershipTier.CapacityReached.selector);
        tier.grantTime(competitor, 1);
    }

    function test_synchronizedMemberCanLoseCapacityRace() public {
        uint256 tokenId = tier.grantTime(member, 1);
        vm.warp(tier.expiresAt(tokenId));
        assertTrue(tier.synchronize(tokenId));

        tier.grantTime(competitor, 1);

        vm.expectRevert(MembershipTier.CapacityReached.selector);
        tier.grantTime(member, 1);

        assertEq(tier.tokenOf(member), tokenId);
        assertFalse(tier.isOccupied(tokenId));
        assertFalse(tier.isActive(member));
    }

    function test_activeOrHeldOccupancyConstrainsSupplyCapLowering() public {
        MembershipTierHarness uncappedTier = _deployTier(0);
        uncappedTier.grantTime(member, 1);
        uncappedTier.grantTime(competitor, 1);

        vm.expectRevert(MembershipTier.SupplyCapBelowOccupancy.selector);
        uncappedTier.setSupplyCap(1);

        uncappedTier.setSupplyCap(2);
        assertEq(uncappedTier.supplyCap(), 2);

        vm.warp(_START + _PERIOD);
        assertTrue(uncappedTier.synchronize(uncappedTier.tokenOf(member)));
        uncappedTier.setSupplyCap(1);
        assertEq(uncappedTier.supplyCap(), 1);

        uncappedTier.setSupplyCap(0);
        assertEq(uncappedTier.supplyCap(), 0);
    }

    function test_pauseBlocksEveryU3TimeIncreaseButNotPassiveAccess() public {
        uint256 tokenId = tier.grantTime(member, 1);
        uint64 expiration = tier.expiresAt(tokenId);
        tier.setPaused(true);

        assertTrue(tier.paused());
        assertFalse(tier.isRenewable(tokenId));
        assertTrue(tier.isActive(member));

        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.grantTime(member, 1);

        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.addPaidPeriods(member, 1);

        assertEq(tier.expiresAt(tokenId), expiration);
        vm.warp(expiration);
        assertFalse(tier.isActive(member));
    }

    function test_unpauseRestoresTimeIncreases() public {
        tier.setPaused(true);
        tier.setPaused(false);

        uint256 tokenId = tier.addPaidPeriods(member, 1);

        assertTrue(tier.isActive(member));
        assertEq(tier.expiresAt(tokenId), _START + _PERIOD);
    }

    function _deployTier(uint64 supplyCap) private returns (MembershipTierHarness deployedTier) {
        MockUSDG token = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config = _config();
        config.supplyCap = supplyCap;
        deployedTier = new MembershipTierHarness(address(this), token, address(renderer), config);
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        config.supplyCap = 1;
        return config;
    }
}
