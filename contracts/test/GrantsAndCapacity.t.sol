// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract GrantsAndCapacityTest is Test {
    MembershipTier private tier;
    MockUSDG private paymentToken;
    address private member;
    address private stranger;

    uint64 private constant _PERIOD = 30 days;
    uint64 private constant _START = 1_000_000;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(_START);
        member = makeAddr("member");
        stranger = makeAddr("stranger");

        paymentToken = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)),
            paymentToken,
            _config(address(renderer))
        );
        paymentToken.mint(member, 100_000_000);
        vm.prank(member);
        paymentToken.approve(address(tier), type(uint256).max);
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
        uint256 tokenId = _purchase();
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
        assertTrue(tier.rewardEligible(tokenId));
    }

    function test_freeRenewalsPreserveEligibleWeightEvenAfterUnsynchronizedExpiry() public {
        MembershipTier target = _pwyw();
        vm.prank(member);
        uint256 id = target.contribute(10_000_000, address(0));
        vm.warp(_START + _PERIOD - 1);
        vm.prank(member);
        target.contribute(0, address(0));
        vm.prank(member);
        target.contribute(0, address(0));
        vm.warp(target.expiresAt(id) + 5);
        assertTrue(target.rewardEligible(id));
        assertFalse(target.isActive(member));
        vm.prank(member);
        target.contribute(0, address(0));
        assertTrue(target.isActive(member));
        assertTrue(target.rewardEligible(id));
        assertEq(target.sharesOf(id), 10_000_000);
        assertEq(target.lifetimeGross(), 10_000_000);
        assertEq(target.allocationState(id).lotCount, 1);
        target.processAccounting(25);
        assertEq(target.reserveState().unearnedScaled[1], 0);
    }

    function test_suspendedFreeAndGrantedAccessRequiresPositivePaymentToRestoreHistory() public {
        MembershipTier target = _pwyw();
        vm.prank(member);
        uint256 id = target.contribute(10_000_000, address(0));
        vm.warp(target.expiresAt(id));
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        target.synchronizeExpiredMemberships(ids);
        uint256 earned = target.claimableReward(id);
        vm.prank(member);
        assertEq(target.contribute(0, address(0)), id);
        assertTrue(target.isActive(member));
        assertFalse(target.rewardEligible(id));
        assertEq(target.totalRewardShares(), 0);
        target.grantTime(member, 1);
        assertFalse(target.rewardEligible(id));
        assertEq(target.claimableReward(id), earned);
        vm.prank(member);
        target.contribute(1, address(0));
        assertTrue(target.rewardEligible(id));
        assertEq(target.sharesOf(id), 10_000_001);
        assertEq(target.totalRewardShares(), 10_000_001);
        assertEq(target.claimableReward(id), earned);
        assertEq(target.lifetimeGross(), 10_000_001);
        MembershipTypes.AllocationLot[] memory lots = target.allocationLots(id, 0, 0, 10);
        assertEq(lots.length, 2);
        assertEq(lots[1].start, block.timestamp + _PERIOD);
        assertEq(lots[1].end, block.timestamp + 2 * _PERIOD);
    }

    function test_finalGrantOnlyRevocationSuspendsAndPositiveGiftRestoresHistory() public {
        uint256 id = _purchase();
        vm.warp(tier.expiresAt(id));
        tier.grantTime(member, 1);
        assertTrue(tier.rewardEligible(id));
        tier.revokeGrantTime(id);
        assertFalse(tier.rewardEligible(id));
        tier.grantTime(member, 1);
        assertFalse(tier.rewardEligible(id));
        paymentToken.mint(stranger, 10_000_000);
        vm.startPrank(stranger);
        paymentToken.approve(address(tier), 10_000_000);
        tier.gift(member, 1, MembershipTypes.ReferralStatus.LockedNone, address(0));
        vm.stopPrank();
        assertTrue(tier.rewardEligible(id));
        assertEq(tier.sharesOf(id), 20_000_000);
        tier.revokeGrantTime(id);
        assertTrue(tier.rewardEligible(id));
        assertTrue(tier.isActive(member));
    }

    function _pwyw() private returns (MembershipTier target) {
        MembershipTypes.TierConfig memory config = _config(tier.renderer());
        config.pricePerPeriod = 0;
        target = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        vm.prank(member);
        paymentToken.approve(address(target), type(uint256).max);
    }

    function test_revokingLastGrantMakesInactiveButRetainsSlotUntilSync() public {
        uint256 tokenId = tier.grantTime(member, 1);

        assertEq(tier.revokeGrantTime(tokenId), _PERIOD);

        assertFalse(tier.isActive(member));
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 1);
        assertEq(_sync(tokenId), 1);
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
        uint256 tokenId = _purchase();

        tier.grantTime(member, 20);

        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, _PERIOD);
        assertEq(grantSeconds, 20 * _PERIOD);

        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        _purchase();
    }

    function test_pauseStillAllowsGrantRevocationAndSynchronization() public {
        uint256 tokenId = tier.grantTime(member, 1);
        tier.setPaused(true);

        assertEq(tier.revokeGrantTime(tokenId), _PERIOD);
        assertFalse(tier.isActive(member));
        assertEq(_sync(tokenId), 1);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_revokeWithoutRemainingGrantRevertsWithoutTouchingPaidTime() public {
        uint256 tokenId = _purchase();
        uint64 expiration = tier.expiresAt(tokenId);

        vm.expectRevert(MembershipTier.NoGrantTime.selector);
        tier.revokeGrantTime(tokenId);

        assertEq(tier.expiresAt(tokenId), expiration);
        assertTrue(tier.isActive(member));
    }

    function _config(address renderer_) private view returns (MembershipTypes.TierConfig memory) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer_, address(paymentToken));
        config.supplyCap = 1;
        return config;
    }

    function _purchase() private returns (uint256 tokenId) {
        vm.prank(member);
        tokenId = tier.purchase(1, address(0));
    }

    function _sync(uint256 tokenId) private returns (uint256 burnedCount) {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        burnedCount = tier.synchronizeExpiredMemberships(tokenIds);
    }
}
