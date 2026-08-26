// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MembershipTierHarness} from "./mocks/MembershipTierHarness.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract GrantsAndCapacityTest is Test {
    MembershipTierHarness private tier;
    address private member;
    address private stranger;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        vm.warp(_START);
        member = makeAddr("member");
        stranger = makeAddr("stranger");

        MockUSDG token = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTierHarness(address(this), token, address(renderer), _config());
    }

    function test_onlyCreatorCanGrantOrRevokeWholePeriods() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        tier.grantTime(member, 1);

        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        tier.grantTime(member, 0);

        uint256 tokenId = tier.grantTime(member, 2);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        tier.revokeGrantTime(tokenId);

        assertEq(tier.expiresAt(tokenId), _START + 2 * _PERIOD);
    }

    function test_revokeRemovesOnlyRemainingGrantTimeAndPreservesPaidTime() public {
        uint256 tokenId = tier.addPaidPeriods(member, 1);
        tier.grantTime(member, 2);
        vm.warp(_START + 15 days);

        uint64 revoked = tier.revokeGrantTime(tokenId);

        assertEq(revoked, 2 * _PERIOD);
        assertEq(tier.expiresAt(tokenId), block.timestamp + 15 days);
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 15 days);
        assertEq(grantSeconds, 0);
        assertTrue(tier.isActive(member));
        assertTrue(tier.isOccupied(tokenId));
    }

    function test_revokingLastGrantMakesInactiveButRetainsSlotUntilSync() public {
        uint256 tokenId = tier.grantTime(member, 1);

        assertEq(tier.revokeGrantTime(tokenId), _PERIOD);

        assertFalse(tier.isActive(member));
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 1);
        assertTrue(tier.synchronize(tokenId));
        assertFalse(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_regrantBeforeSyncReusesHeldSlotAndSameCredential() public {
        uint256 tokenId = tier.grantTime(member, 1);
        tier.revokeGrantTime(tokenId);

        uint256 regrantedToken = tier.grantTime(member, 2);

        assertEq(regrantedToken, tokenId);
        assertEq(tier.totalMinted(), 1);
        assertEq(tier.occupiedSupply(), 1);
        assertTrue(tier.isActive(member));
    }

    function test_grantsDoNotCountAgainstPaidPrepaymentLimit() public {
        tier.setMaxPrepaidPeriods(1);
        uint256 tokenId = tier.addPaidPeriods(member, 1);

        tier.grantTime(member, 20);

        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, _PERIOD);
        assertEq(grantSeconds, 20 * _PERIOD);

        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        tier.addPaidPeriods(member, 1);
    }

    function test_pauseStillAllowsGrantRevocationAndSynchronization() public {
        uint256 tokenId = tier.grantTime(member, 1);
        tier.setPaused(true);

        assertEq(tier.revokeGrantTime(tokenId), _PERIOD);
        assertFalse(tier.isActive(member));
        assertTrue(tier.synchronize(tokenId));
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_revokeWithoutRemainingGrantRevertsWithoutTouchingPaidTime() public {
        uint256 tokenId = tier.addPaidPeriods(member, 1);
        uint64 expiration = tier.expiresAt(tokenId);

        vm.expectRevert(MembershipTier.NoGrantTime.selector);
        tier.revokeGrantTime(tokenId);

        assertEq(tier.expiresAt(tokenId), expiration);
        assertTrue(tier.isActive(member));
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        config.supplyCap = 1;
        return config;
    }
}
