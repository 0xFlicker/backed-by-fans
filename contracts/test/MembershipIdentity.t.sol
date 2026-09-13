// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IERC5643} from "../src/interfaces/IERC5643.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {NonReceiverWallet} from "./mocks/NonReceiverWallet.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {
    IERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";
import {Test} from "forge-std/Test.sol";

contract MembershipIdentityTest is Test {
    uint64 private constant PERIOD = 30 days;
    uint256 private constant PRICE = 10_000_000;
    MembershipTier private tier;
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private renderer;
    address private member;
    address private other;
    address private referrer;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1_000_000);
        member = makeAddr("member");
        other = makeAddr("other");
        referrer = makeAddr("referrer");
        paymentToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        tier = _deploy(_config());
        _fundAndApprove(member, tier);
        _fundAndApprove(other, tier);
    }

    function test_eachCreationMintsIndependentSequentialPositionForSameOwner() public {
        uint256 first = tier.grantMembership(member, 1, 25);
        uint256 second = tier.grantMembership(member, 2, 25);
        uint256 third = tier.grantMembership(other, 1, 25);
        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(third, 3);
        assertEq(tier.totalMinted(), 3);
        assertEq(tier.balanceOf(member), 2);
        assertEq(tier.occupiedSupply(), 3);
        assertEq(tier.expiresAt(first), block.timestamp + PERIOD);
        assertEq(tier.expiresAt(second), block.timestamp + 2 * PERIOD);
        assertEq(tier.ownerOf(first), member);
        assertEq(tier.ownerOf(second), member);
    }

    function test_explicitPurchaseCreatesAndRenewalOnlyExtendsSelectedPosition() public {
        uint256 first = _create(member, 1, referrer);
        uint256 second = _create(member, 2, address(0));
        uint64 firstEnd = tier.expiresAt(first);
        uint64 secondEnd = tier.expiresAt(second);
        vm.prank(member);
        tier.renewMembership(first, 1, referrer, 25);
        assertEq(tier.totalMinted(), 2);
        assertEq(tier.balanceOf(member), 2);
        assertEq(tier.expiresAt(first), firstEnd + PERIOD);
        assertEq(tier.expiresAt(second), secondEnd);
        assertEq(tier.sharesOf(first), 2 * PRICE);
        assertEq(tier.sharesOf(second), 2 * PRICE);
        (MembershipTypes.ReferralStatus status, address locked) = tier.referralOf(first);
        assertEq(uint256(status), uint256(MembershipTypes.ReferralStatus.LockedAddress));
        assertEq(locked, referrer);
        (, locked) = tier.referralOf(second);
        assertEq(locked, address(0));
    }

    function test_renewOneSecondBeforeExpiryPreservesIdentity() public {
        uint256 id = _create(member, 1, address(0));
        uint64 end = tier.expiresAt(id);
        vm.warp(end - 1);
        assertTrue(tier.isRenewable(id));
        vm.prank(member);
        tier.renewMembership(id, 1, address(0), 25);
        assertEq(tier.totalMinted(), 1);
        assertEq(tier.expiresAt(id), end + PERIOD);
        assertEq(tier.sharesOf(id), 2 * PRICE);
        assertEq(tier.ownerOf(id), member);
    }

    function test_renewAtAndAfterExpiryRejectsBeforeMaintenanceBurn() public {
        uint256 id = _create(member, 1, address(0));
        uint64 end = tier.expiresAt(id);
        for (uint64 offset; offset < 2; ++offset) {
            vm.warp(end + offset);
            assertFalse(tier.isRenewable(id));
            vm.expectRevert(
                abi.encodeWithSelector(MembershipTier.MembershipExpired.selector, id, end)
            );
            vm.prank(member);
            tier.renewMembership(id, 1, address(0), 25);
            vm.expectRevert(
                abi.encodeWithSelector(MembershipTier.MembershipExpired.selector, id, end)
            );
            vm.prank(member);
            tier.renewSubscription(id, PERIOD);
            assertEq(tier.ownerOf(id), member);
            assertEq(tier.sharesOf(id), PRICE);
            assertEq(tier.totalMinted(), 1);
        }
    }

    function test_returnAfterExpiryHasFreshCurveWeightIdentityAndReferral() public {
        MembershipTypes.TierConfig memory config = _config();
        config.startingBoostBps = 30_000;
        config.earlySupportGross = 20_000_000;
        MembershipTier curved = _deploy(config);
        _fundAndApprove(member, curved);
        vm.prank(member);
        uint256 first = curved.createMembership(2, referrer, 25);
        assertEq(curved.sharesOf(first), 4 * PRICE);
        uint64 end = curved.expiresAt(first);
        vm.warp(end);
        vm.prank(member);
        uint256 second = curved.createMembership(1, other, 25);
        assertGt(second, first);
        assertEq(curved.totalMinted(), 2);
        assertEq(curved.sharesOf(first), 0);
        assertEq(curved.sharesOf(second), PRICE);
        assertEq(curved.lifetimeGross(), 3 * PRICE);
        assertEq(curved.occupiedSupply(), 1);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, first)
        );
        curved.ownerOf(first);
        (, address locked) = curved.referralOf(second);
        assertEq(locked, other);
        assertEq(curved.allocationLots(first, 0, 0, 100)[0].referrer, referrer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, first)
        );
        vm.prank(member);
        curved.renewMembership(first, 1, referrer, 25);
    }

    function test_selectedRenewalRequiresOwnerAndKeepsLockedReferral() public {
        uint256 id = _create(member, 1, referrer);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        vm.prank(other);
        tier.renewMembership(id, 1, referrer, 25);
        vm.expectRevert(MembershipTier.ReferralChoiceMismatch.selector);
        vm.prank(member);
        tier.renewMembership(id, 1, other, 25);
        assertEq(tier.sharesOf(id), PRICE);
        assertEq(tier.lifetimeGross(), PRICE);
    }

    function test_grantExtensionTargetsOnlySelectedIdAndExpectedOwner() public {
        uint256 first = tier.grantMembership(member, 1, 25);
        uint256 second = tier.grantMembership(member, 1, 25);
        uint64 end = tier.expiresAt(first);
        tier.addGrantTime(first, member, 2, 25);
        assertEq(tier.expiresAt(first), end + 2 * PERIOD);
        assertEq(tier.expiresAt(second), end);
        vm.expectRevert();
        tier.addGrantTime(first, other, 1, 25);
        assertEq(tier.expiresAt(first), end + 2 * PERIOD);
        assertEq(tier.sharesOf(first), 0);
        assertEq(tier.lifetimeGross(), 0);
    }

    function test_safeMintRejectsNonReceiverAndRollsBackIdentityAndCapacity() public {
        NonReceiverWallet wallet = new NonReceiverWallet();
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(wallet))
        );
        tier.grantMembership(address(wallet), 1, 25);
        assertEq(tier.totalMinted(), 0);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.balanceOf(address(wallet)), 0);
        assertEq(tier.grantMembership(member, 1, 25), 1);
    }

    function test_ownerPagesBoundedAt100AndIncludeEveryIndependentPosition() public {
        for (uint256 i; i < 101; ++i) {
            tier.grantMembership(member, 1, 25);
        }
        MembershipTypes.PositionPage memory first = tier.tokensOfOwner(member, 0, 100);
        assertEq(first.tokenIds.length, 100);
        assertEq(first.nextOffset, 100);
        assertEq(first.balance, 101);
        assertFalse(first.complete);
        for (uint256 i; i < first.tokenIds.length; ++i) {
            assertEq(first.tokenIds[i], i + 1);
            assertEq(tier.ownerOf(first.tokenIds[i]), member);
        }
        MembershipTypes.PositionPage memory last = tier.tokensOfOwner(member, first.nextOffset, 100);
        assertEq(last.tokenIds.length, 1);
        assertEq(last.tokenIds[0], 101);
        assertEq(last.nextOffset, 101);
        assertTrue(last.complete);
        MembershipTypes.PositionPage memory empty = tier.tokensOfOwner(member, 101, 100);
        assertEq(empty.tokenIds.length, 0);
        assertEq(empty.balance, 101);
        assertTrue(empty.complete);
    }

    function test_ownerPageRejectsZeroOwnerAndInvalidPageSize() public {
        vm.expectRevert();
        tier.tokensOfOwner(address(0), 0, 1);
        vm.expectRevert();
        tier.tokensOfOwner(member, 0, 0);
        tier.tokensOfOwner(member, 0, 101);
        MembershipTypes.PositionPage memory empty = tier.tokensOfOwner(member, 10, 100);
        assertEq(empty.tokenIds.length, 0);
        assertEq(empty.balance, 0);
        assertTrue(empty.complete);
    }

    function test_ownerEnumerationDropsBurnedPositionWithoutLosingSurvivor() public {
        uint256 first = tier.grantMembership(member, 1, 25);
        uint256 second = tier.grantMembership(member, 2, 25);
        vm.warp(tier.expiresAt(first));
        tier.processExpirations(1);
        MembershipTypes.PositionPage memory page = tier.tokensOfOwner(member, 0, 100);
        assertEq(page.tokenIds.length, 1);
        assertEq(page.tokenIds[0], second);
        assertEq(page.balance, 1);
        assertTrue(page.complete);
        assertEq(tier.balanceOf(member), 1);
        assertEq(tier.totalMinted(), 2);
    }

    function test_capacityCountsPositionsAndCreationCatchesUpExpiredCapacity() public {
        tier.setSupplyCap(2);
        uint256 first = tier.grantMembership(member, 1, 25);
        uint256 second = tier.grantMembership(member, 2, 25);
        vm.expectRevert(MembershipTier.CapacityReached.selector);
        tier.grantMembership(member, 1, 25);
        vm.warp(tier.expiresAt(first));
        uint256 third = tier.grantMembership(member, 1, 25);
        assertGt(third, second);
        assertEq(tier.occupiedSupply(), 2);
        assertEq(tier.balanceOf(member), 2);
        assertEq(tier.ownerOf(second), member);
    }

    function test_prepaymentLimitAppliesPerPositionAndCreationDoesNotRenew() public {
        tier.setMaxPrepaidPeriods(2);
        uint256 first = _create(member, 2, address(0));
        uint256 second = _create(member, 2, address(0));
        vm.expectRevert(MembershipTier.PrepaymentLimitExceeded.selector);
        vm.prank(member);
        tier.renewMembership(first, 1, address(0), 25);
        assertEq(tier.sharesOf(first), 2 * PRICE);
        assertEq(tier.sharesOf(second), 2 * PRICE);
        assertEq(tier.lifetimeGross(), 4 * PRICE);
        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        vm.prank(member);
        tier.createMembership(0, address(0), 25);
    }

    function test_contributionsCreateIndependentIdsAndRenewExplicitTarget() public {
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        MembershipTier contributionTier = _deploy(config);
        _fundAndApprove(member, contributionTier);
        vm.startPrank(member);
        uint256 first = contributionTier.createContributionMembership(0, referrer, 25);
        uint256 second = contributionTier.createContributionMembership(PRICE, referrer, 25);
        contributionTier.renewContributionMembership(first, PRICE, other, 25);
        vm.stopPrank();
        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(contributionTier.sharesOf(first), PRICE);
        assertEq(contributionTier.sharesOf(second), PRICE);
        assertEq(contributionTier.expiresAt(first), block.timestamp + 2 * PERIOD);
        assertEq(contributionTier.expiresAt(second), block.timestamp + PERIOD);
        (, address locked) = contributionTier.referralOf(first);
        assertEq(locked, other);
        vm.expectRevert(MembershipTier.IncorrectPricingMode.selector);
        vm.prank(member);
        contributionTier.createMembership(1, address(0), 25);
        vm.expectRevert(MembershipTier.IncorrectPricingMode.selector);
        vm.prank(member);
        tier.createContributionMembership(0, address(0), 25);
    }

    function test_erc5643RequiresOwnerIntegralDurationAndLockedPricedReferral() public {
        uint256 granted = tier.grantMembership(member, 1, 25);
        assertFalse(tier.isRenewable(granted));
        vm.expectRevert(MembershipTier.ReferralChoiceRequired.selector);
        vm.prank(member);
        tier.renewSubscription(granted, PERIOD);
        uint256 purchased = _create(member, 1, referrer);
        vm.expectRevert(MembershipTier.TokenOwnerOnly.selector);
        vm.prank(other);
        tier.renewSubscription(purchased, PERIOD);
        vm.expectRevert(MembershipTier.InvalidPaidDuration.selector);
        vm.prank(member);
        tier.renewSubscription(purchased, PERIOD - 1);
        vm.expectRevert(MembershipTier.InvalidPaidDuration.selector);
        vm.prank(member);
        tier.renewSubscription(purchased, 0);
        vm.prank(member);
        tier.renewSubscription(purchased, PERIOD);
        assertEq(tier.expiresAt(purchased), block.timestamp + 2 * PERIOD);
        assertEq(tier.expiresAt(granted), block.timestamp + PERIOD);
        assertEq(tier.totalMinted(), 2);
    }

    function test_erc5643ContributionRenewalAddsOneFreePeriodToSelectedId() public {
        MembershipTypes.TierConfig memory config = _config();
        config.pricePerPeriod = 0;
        MembershipTier contributionTier = _deploy(config);
        vm.startPrank(member);
        uint256 first = contributionTier.createContributionMembership(0, address(0), 25);
        uint256 second = contributionTier.createContributionMembership(0, address(0), 25);
        vm.expectRevert(MembershipTier.InvalidPeriods.selector);
        contributionTier.renewSubscription(first, 2 * PERIOD);
        contributionTier.renewSubscription(first, PERIOD);
        vm.stopPrank();
        assertEq(contributionTier.totalMinted(), 2);
        assertEq(contributionTier.expiresAt(first), block.timestamp + 2 * PERIOD);
        assertEq(contributionTier.expiresAt(second), block.timestamp + PERIOD);
        assertEq(contributionTier.lifetimeGross(), 0);
    }

    function test_nativeEthIsRejectedByAdaptersAndFallback() public {
        uint256 id = tier.grantMembership(member, 1, 25);
        vm.deal(member, 3 ether);
        vm.expectRevert(MembershipTier.NativeValueRejected.selector);
        vm.prank(member);
        tier.renewSubscription{value: 1 ether}(id, PERIOD);
        vm.expectRevert(MembershipTier.NativeValueRejected.selector);
        vm.prank(member);
        tier.cancelSubscription{value: 1 ether}(id);
        vm.prank(member);
        (bool success,) = address(tier).call{value: 1 ether}("");
        assertFalse(success);
        assertEq(address(tier).balance, 0);
    }

    function test_supportsTransferableEnumerableMembershipInterfaces() public view {
        assertTrue(tier.supportsInterface(type(IERC721).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC721Enumerable).interfaceId));
        assertTrue(tier.supportsInterface(type(IERC5643).interfaceId));
        assertTrue(tier.supportsInterface(0x49064906));
        assertFalse(tier.supportsInterface(bytes4(keccak256("locked(uint256)"))));
        assertFalse(tier.supportsInterface(0xffffffff));
    }

    function _create(address owner, uint64 periods, address referralChoice)
        private
        returns (uint256 id)
    {
        vm.prank(owner);
        id = tier.createMembership(periods, referralChoice, 25);
    }

    function _fundAndApprove(address owner, MembershipTier target) private {
        paymentToken.mint(owner, 100 * PRICE);
        vm.prank(owner);
        paymentToken.approve(address(target), type(uint256).max);
    }

    function _config() private view returns (MembershipTypes.TierConfig memory) {
        return
            MembershipTestConfig.defaultConfig(
                address(this), address(renderer), address(paymentToken)
            );
    }

    function _deploy(MembershipTypes.TierConfig memory config) private returns (MembershipTier) {
        return MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(this), address(paymentToken)), paymentToken, config
        );
    }
}
