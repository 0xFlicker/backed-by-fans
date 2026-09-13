// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

function retiredCreditScaled(MembershipTier tier, address beneficiary) view returns (uint256) {
    (uint256 raw, uint256 fractional) = tier.claimableRetiredReward(beneficiary);
    return raw * (1 << 128) + fractional;
}

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
        tier = MembershipTestConfig.deployTier(
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
        tier.grantMembership(member, 1, 25);

        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        tier.grantMembership(member, 0, 25);

        uint256 tokenId = tier.grantMembership(member, 2, 25);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        tier.revokeGrantTime(tokenId, member, 25);

        assertEq(tier.expiresAt(tokenId), _START + 2 * _PERIOD);
    }

    function test_revokeRemovesOnlyRemainingGrantTimeAndPreservesPaidTime() public {
        uint256 tokenId = _purchase();
        tier.addGrantTime(tokenId, member, 2, 25);
        vm.warp(_START + 15 days);

        uint64 revoked = tier.revokeGrantTime(tokenId, member, 25);

        assertEq(revoked, 2 * _PERIOD);
        assertEq(tier.expiresAt(tokenId), block.timestamp + 15 days);
        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, 15 days);
        assertEq(grantSeconds, 0);
        assertTrue(tier.isActiveToken(tokenId));
        assertTrue(tier.isOccupied(tokenId));
        assertTrue(tier.rewardEligible(tokenId));
        assertEq(tier.accountingStatus().scheduledExpirations, 1);
        vm.warp(_START + _PERIOD);
        assertEq(tier.processExpirations(25).retiredCount, 1);
        assertEq(tier.accountingStatus().scheduledExpirations, 0);
        assertEq(tier.lifetimeGross(), 10_000_000);
    }

    function test_zeroRenewalsExtendOnlyTheLivePositionAndExpiredReturnStartsFresh() public {
        MembershipTier target = _pwyw();
        vm.prank(member);
        uint256 id = target.createContributionMembership(10_000_000, address(0), 25);
        vm.warp(_START + _PERIOD - 1);
        vm.startPrank(member);
        target.renewContributionMembership(id, 0, address(0), 25);
        target.renewContributionMembership(id, 0, address(0), 25);
        vm.stopPrank();
        assertEq(target.expiresAt(id), _START + 3 * _PERIOD);
        assertEq(target.sharesOf(id), 10_000_000);
        uint64 expiration = target.expiresAt(id);
        vm.warp(expiration);
        assertFalse(target.rewardEligible(id));
        vm.prank(member);
        vm.expectRevert(
            abi.encodeWithSelector(MembershipTier.MembershipExpired.selector, id, expiration)
        );
        target.renewContributionMembership(id, 0, address(0), 25);
        vm.prank(member);
        uint256 fresh = target.createContributionMembership(0, address(0), 25);
        assertGt(fresh, id);
        _assertBurned(target, id);
        assertTrue(target.isActiveToken(fresh));
        assertEq(target.sharesOf(fresh), 0);
        assertEq(target.sharesOf(id), 0);
        assertEq(target.lifetimeGross(), 10_000_000);
        assertEq(target.allocationState(id).lotCount, 1);
        assertEq(target.accountingStatus().scheduledExpirations, 1);
        vm.warp(target.expiresAt(fresh));
        assertEq(target.processExpirations(25).retiredCount, 1);
        _assertBurned(target, fresh);
    }

    function test_returningFreeAndGrantedPositionEarnsOnlyNewPaymentWeight() public {
        MembershipTier target = _pwyw();
        vm.prank(member);
        uint256 oldId = target.createContributionMembership(10_000_000, address(0), 25);
        vm.warp(target.expiresAt(oldId));
        target.processExpirations(25);
        uint256 earned = retiredCreditScaled(target, member);
        vm.prank(member);
        uint256 fresh = target.createContributionMembership(0, address(0), 25);
        target.addGrantTime(fresh, member, 1, 25);
        assertEq(target.sharesOf(fresh), 0);
        assertEq(target.totalRewardShares(), 0);
        assertEq(retiredCreditScaled(target, member), earned);
        vm.prank(member);
        target.renewContributionMembership(fresh, 1, address(0), 25);
        assertTrue(target.rewardEligible(fresh));
        assertEq(target.sharesOf(fresh), 1);
        assertEq(target.totalRewardShares(), 1);
        assertEq(target.sharesOf(oldId), 0);
        assertEq(retiredCreditScaled(target, member), earned);
        assertEq(target.lifetimeGross(), 10_000_001);
        MembershipTypes.AllocationLot[] memory lots = target.allocationLots(fresh, 0, 0, 10);
        assertEq(lots.length, 1);
        assertEq(lots[0].start, block.timestamp + _PERIOD);
        assertEq(lots[0].end, block.timestamp + 2 * _PERIOD);
    }

    function test_finalGrantRevocationBurnsAndGiftCreatesIndependentWeight() public {
        uint256 oldId = _purchase();
        vm.warp(tier.expiresAt(oldId));
        uint256 grantId = tier.grantMembership(member, 1, 25);
        _assertBurned(tier, oldId);
        assertEq(tier.revokeGrantTime(grantId, member, 25), _PERIOD);
        _assertBurned(tier, grantId);
        paymentToken.mint(stranger, 10_000_000);
        vm.startPrank(stranger);
        paymentToken.approve(address(tier), 10_000_000);
        uint256 giftId = tier.giftMembership(member, 1, 25);
        vm.stopPrank();
        assertGt(giftId, grantId);
        assertEq(tier.sharesOf(giftId), 10_000_000);
        assertEq(tier.sharesOf(oldId), 0);
        assertEq(tier.lifetimeGross(), 20_000_000);
        tier.addGrantTime(giftId, member, 1, 25);
        tier.revokeGrantTime(giftId, member, 25);
        assertTrue(tier.isActiveToken(giftId));
        assertEq(tier.sharesOf(giftId), 10_000_000);
    }

    function _pwyw() private returns (MembershipTier target) {
        MembershipTypes.TierConfig memory config = _config(tier.renderer());
        config.pricePerPeriod = 0;
        target = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
        vm.prank(member);
        paymentToken.approve(address(target), type(uint256).max);
    }

    function test_revokingPartiallyConsumedLastGrantBurnsAndReleasesCapacityImmediately() public {
        uint256 tokenId = tier.grantMembership(member, 1, 25);
        vm.warp(_START + 15 days);
        assertEq(tier.revokeGrantTime(tokenId, member, 25), 15 days);
        _assertBurned(tier, tokenId);
        assertFalse(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.accountingStatus().scheduledExpirations, 0);
        assertEq(tier.processExpirations(25).retiredCount, 0);
        tier.grantMembership(stranger, 1, 25);
        assertEq(tier.occupiedSupply(), 1);
    }

    function test_regrantAfterRevocationAlwaysCreatesANewCredential() public {
        uint256 tokenId = tier.grantMembership(member, 1, 25);
        tier.revokeGrantTime(tokenId, member, 25);
        uint256 regrantedToken = tier.grantMembership(member, 2, 25);
        assertGt(regrantedToken, tokenId);
        assertEq(tier.totalMinted(), 2);
        assertEq(tier.occupiedSupply(), 1);
        assertTrue(tier.isActiveToken(regrantedToken));
        _assertBurned(tier, tokenId);
    }

    function test_grantsDoNotCountAgainstPaidPrepaymentLimit() public {
        tier.setMaxPrepaidPeriods(1);
        uint256 tokenId = _purchase();

        tier.addGrantTime(tokenId, member, 20, 25);

        (uint64 paidSeconds, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        assertEq(paidSeconds, _PERIOD);
        assertEq(grantSeconds, 20 * _PERIOD);

        vm.prank(member);
        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        tier.renewMembership(tokenId, 1, address(0), 25);
    }

    function test_pauseStillAllowsGrantRevocationAndPermissionlessMaintenance() public {
        uint256 tokenId = tier.grantMembership(member, 1, 25);
        tier.setPaused(true);
        assertEq(tier.revokeGrantTime(tokenId, member, 25), _PERIOD);
        _assertBurned(tier, tokenId);
        vm.prank(stranger);
        assertTrue(tier.processExpirations(25).complete);
        assertEq(tier.occupiedSupply(), 0);
    }

    function test_revokeWithoutRemainingGrantRevertsWithoutTouchingPaidTime() public {
        uint256 tokenId = _purchase();
        uint64 expiration = tier.expiresAt(tokenId);

        vm.expectRevert(MembershipTier.NoGrantTime.selector);
        tier.revokeGrantTime(tokenId, member, 25);

        assertEq(tier.expiresAt(tokenId), expiration);
        assertTrue(tier.isActiveToken(tokenId));
    }

    function test_grantAndRevocationRejectStaleExpectedOwnerWithoutChangingSchedule() public {
        uint256 tokenId = _purchase();
        tier.addGrantTime(tokenId, member, 1, 25);
        bytes32 before = keccak256(abi.encode(tier.expiresAt(tokenId), tier.accountingStatus()));
        bytes memory mismatch = abi.encodeWithSelector(
            MembershipTier.MembershipOwnerMismatch.selector, tokenId, stranger, member
        );
        vm.expectRevert(mismatch);
        tier.addGrantTime(tokenId, stranger, 1, 25);
        vm.expectRevert(mismatch);
        tier.revokeGrantTime(tokenId, stranger, 25);
        assertEq(keccak256(abi.encode(tier.expiresAt(tokenId), tier.accountingStatus())), before);
        assertEq(tier.lifetimeGross(), 10_000_000);
    }

    function test_giftRenewalRejectsOwnerAndReferralMismatchBeforePayment() public {
        uint256 tokenId = tier.grantMembership(member, 1, 25);
        paymentToken.mint(stranger, 20_000_000);
        vm.prank(stranger);
        paymentToken.approve(address(tier), type(uint256).max);
        uint64 expiration = tier.expiresAt(tokenId);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.MembershipOwnerMismatch.selector, tokenId, stranger, member
            )
        );
        tier.giftRenewal(tokenId, stranger, 1, MembershipTypes.ReferralStatus.Unset, address(0), 25);
        vm.prank(stranger);
        vm.expectRevert(MembershipTier.ReferralStateMismatch.selector);
        tier.giftRenewal(
            tokenId, member, 1, MembershipTypes.ReferralStatus.LockedNone, address(0), 25
        );
        assertEq(paymentToken.balanceOf(stranger), 20_000_000);
        assertEq(tier.lifetimeGross(), 0);
        assertEq(tier.expiresAt(tokenId), expiration);

        vm.prank(stranger);
        tier.giftRenewal(tokenId, member, 1, MembershipTypes.ReferralStatus.Unset, address(0), 25);
        assertEq(tier.expiresAt(tokenId), expiration + _PERIOD);
        (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(tokenId);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.Unset));
        assertEq(referrer, address(0));
        assertEq(tier.sharesOf(tokenId), 10_000_000);
        assertEq(tier.accountingStatus().scheduledExpirations, 1);

        vm.prank(member);
        tier.renewMembership(tokenId, 1, stranger, 25);
        uint64 lockedExpiration = tier.expiresAt(tokenId);
        vm.prank(stranger);
        vm.expectRevert(MembershipTier.ReferralStateMismatch.selector);
        tier.giftRenewal(
            tokenId, member, 1, MembershipTypes.ReferralStatus.LockedAddress, address(0), 25
        );
        assertEq(tier.expiresAt(tokenId), lockedExpiration);
        assertEq(paymentToken.balanceOf(stranger), 10_000_000);
        assertEq(tier.lifetimeGross(), 20_000_000);
    }

    function _config(address renderer_) private view returns (MembershipTypes.TierConfig memory) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer_, address(paymentToken));
        config.supplyCap = 1;
        return config;
    }

    function _purchase() private returns (uint256 tokenId) {
        vm.prank(member);
        tokenId = tier.createMembership(1, address(0), 25);
    }

    function _assertBurned(MembershipTier target, uint256 tokenId) private {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId)
        );
        target.ownerOf(tokenId);
    }
}
