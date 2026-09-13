// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "../helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "../helpers/SyntheticPonsBinding.sol";

import {SyntheticVaultBinding} from "../helpers/SyntheticVaultBinding.sol";

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {AdversarialERC20} from "../mocks/AdversarialERC20.sol";
import {MembershipModel} from "../models/MembershipModel.sol";

contract MembershipHandler is Test {
    using MembershipModel for MembershipModel.PositionBook;
    using MembershipModel for MembershipModel.Lifecycle;
    using SafeCast for uint256;

    uint256 private constant Q = 1 << 128;
    AdversarialERC20 public immutable paymentToken;
    MembershipTier public immutable tier;
    address public immutable creator;
    address[4] private actors;
    MembershipModel.PositionBook private book;
    uint256 private protocolPaid;
    uint256 private creatorPaid;
    mapping(address => uint256) private referralPaid;

    constructor(
        AdversarialERC20 asset,
        MembershipFactory,
        MembershipTier target,
        address tierCreator,
        address[4] memory members
    ) {
        paymentToken = asset;
        tier = target;
        creator = tierCreator;
        actors = members;
        book.boostBps = target.startingBoostBps();
        book.horizon = target.earlySupportGross();
        book.protocolBps = target.protocolFeeBps();
        book.rewardBps = target.rewardBps();
        book.referralBps = target.referralBps();
        book.funding.accountedThrough = _now();
        for (uint256 i; i < actors.length; ++i) {
            vm.prank(actors[i]);
            asset.approve(address(target), type(uint256).max);
        }
    }

    function contribute(uint256 seed, uint256 raw, uint256 referralSeed) external {
        if (tier.paused()) return;
        _settle(25);
        if (book.occupied == tier.supplyCap()) return;
        address owner = _actor(seed);
        uint256 gross = raw % 100_000_001;
        address referral = referralSeed % 2 == 0 ? address(0) : _actor(referralSeed >> 1);
        paymentToken.mint(owner, gross);
        vm.prank(owner);
        uint256 id = tier.createContributionMembership(gross, referral, 25);
        assertEq(id, book.createPosition(owner, _now(), _paid(gross, referral)));
    }

    function renew(uint256 seed, uint256 raw) external {
        if (tier.paused()) return;
        uint256 id = _liveId(seed);
        if (id == 0) return;
        _settle(25);
        uint256 gross = raw % 100_000_001;
        MembershipModel.Position storage position = book.positions[id];
        paymentToken.mint(position.owner, gross);
        vm.prank(position.owner);
        tier.renewContributionMembership(id, gross, position.referrer, 25);
        book.increasePosition(id, _now(), _paid(gross, position.referrer));
    }

    function grant(uint256 seed, uint256 periodsSeed) external {
        if (tier.paused()) return;
        _settle(25);
        uint64 periods = (1 + periodsSeed % 2).toUint64();
        MembershipModel.PositionIncrease memory increase;
        increase.grantSeconds = periods * tier.periodDuration();
        uint256 id = _liveId(seed);
        if (id != 0 && periodsSeed % 2 == 0) {
            address owner = book.positions[id].owner;
            vm.prank(creator);
            tier.addGrantTime(id, owner, periods, 25);
            book.increasePosition(id, _now(), increase);
        } else if (book.occupied < tier.supplyCap()) {
            address owner = _actor(seed);
            vm.prank(creator);
            id = tier.grantMembership(owner, periods, 25);
            assertEq(id, book.createPosition(owner, _now(), increase));
        }
    }

    function revokeGrant(uint256 seed) external {
        uint256 id = _liveId(seed);
        if (id == 0) return;
        (, uint64 grantSeconds,) = book.positions[id].time.projected(_now());
        if (grantSeconds == 0) return;
        _settle(25);
        address owner = book.positions[id].owner;
        vm.prank(creator);
        tier.revokeGrantTime(id, owner, 25);
        book.revokePositionGrant(id, _now());
    }

    function refund(uint256 seed) external {
        uint256 id = _liveId(seed);
        if (id == 0) return;
        _settle(25);
        address owner = book.positions[id].owner;
        uint256 expected = book.refundPosition(id, _now());
        uint256 beforeBalance = paymentToken.balanceOf(owner);
        vm.prank(creator);
        assertEq(tier.refund(id, owner, type(uint256).max, 25), expected);
        assertEq(paymentToken.balanceOf(owner) - beforeBalance, expected);
    }

    function transfer(uint256 seed, uint256 toSeed) external {
        uint256 id = _liveId(seed);
        if (id == 0) return;
        address from = book.positions[id].owner;
        address to = _actor(toSeed);
        bytes32 accounting = keccak256(abi.encode(tier.accountingStatus(), tier.reserveState()));
        vm.prank(from);
        tier.transferFrom(from, to, id);
        book.transferPosition(id, from, to, _now());
        assertEq(keccak256(abi.encode(tier.accountingStatus(), tier.reserveState())), accounting);
    }

    function claim(uint256 seed) external {
        uint256 id = _liveId(seed);
        if (id == 0) return;
        _settle(25);
        address owner = book.positions[id].owner;
        uint256 expected = book.claimPositionCredit(id, owner, _now());
        vm.prank(owner);
        assertEq(tier.claimReward(id, 25), expected);
    }

    function claimRetired(uint256 seed) external {
        address owner = _actor(seed);
        uint256 expected = book.claimRetiredPositionCredit(owner);
        vm.prank(owner);
        assertEq(tier.claimRetiredRewards(), expected);
    }

    function claimReferral(uint256 seed) external {
        _settle(25);
        address owner = _actor(seed);
        uint256 expected = book.funding.referralEarnedScaled[owner] / Q - referralPaid[owner];
        vm.prank(owner);
        assertEq(tier.claimReferral(), expected);
        referralPaid[owner] += expected;
    }

    function release() external {
        uint256 expected = book.funding.earnedScaled[3] / Q - protocolPaid;
        assertEq(tier.releaseProtocolFees(), expected);
        protocolPaid += expected;
        expected = book.funding.earnedScaled[0] / Q - creatorPaid;
        vm.prank(creator);
        assertEq(tier.withdrawCreatorProceeds(), expected);
        creatorPaid += expected;
    }

    function advance(uint256 budgetSeed) external {
        _settle(1 + budgetSeed % 25);
    }

    function warp(uint256 seed) external {
        vm.warp(block.timestamp + seed % 31);
    }

    function setPaused(uint256 seed) external {
        vm.prank(creator);
        tier.setPaused(seed % 2 == 0);
    }

    function failedPausedContribution(uint256 seed) external {
        bool paused = tier.paused();
        vm.prank(creator);
        tier.setPaused(true);
        bytes32 beforeState = _fingerprint();
        vm.prank(_actor(seed));
        vm.expectRevert(MembershipTier.TierPaused.selector);
        tier.createContributionMembership(0, address(0), 25);
        assertEq(_fingerprint(), beforeState);
        vm.prank(creator);
        tier.setPaused(paused);
    }

    function failedInboundTransfer(uint256 seed, uint256 failureSeed) external {
        if (tier.paused()) return;
        _settle(25);
        if (book.occupied == tier.supplyCap()) return;
        address owner = _actor(seed);
        paymentToken.mint(owner, 100);
        paymentToken.setTransferFromBehavior(
            failureSeed % 2 == 0
                ? AdversarialERC20.Behavior.ReturnFalse
                : AdversarialERC20.Behavior.ShortTransfer
        );
        bytes32 beforeState = _fingerprint();
        uint256 balance = paymentToken.balanceOf(owner);
        vm.prank(owner);
        vm.expectRevert();
        tier.createContributionMembership(100, address(0), 25);
        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
        assertEq(_fingerprint(), beforeState);
        assertEq(paymentToken.balanceOf(owner), balance);
    }

    function assertModel() external view {
        assertEq(tier.totalMinted(), book.totalMinted);
        assertEq(tier.occupiedSupply(), book.occupied);
        assertEq(tier.accountingStatus().scheduledExpirations, book.occupied);
        assertEq(tier.totalRewardShares(), book.totalShares);
        assertEq(tier.lifetimeGross(), book.lifetimeGross);
        uint256 memberCredit;
        for (uint256 id = 1; id <= book.totalMinted; ++id) {
            MembershipModel.Position storage p = book.positions[id];
            assertEq(tier.sharesOf(id), p.shares);
            assertEq(tier.rewardEligible(id), p.eligible && p.time.active(_now()));
            assertEq(tier.isOccupied(id), p.owner != address(0));
            if (p.owner == address(0)) {
                assertEq(tier.claimableReward(id), 0);
                continue;
            }
            assertEq(tier.ownerOf(id), p.owner);
            assertEq(tier.expiresAt(id), p.time.expiration());
            assertEq(tier.isActiveToken(id), p.time.active(_now()));
            (uint64 paid, uint64 granted,) = p.time.projected(_now());
            (uint64 actualPaid, uint64 actualGrant,) = tier.timeBalances(id);
            assertEq(actualPaid, paid);
            assertEq(actualGrant, granted);
            (MembershipTypes.ReferralStatus status, address referral) = tier.referralOf(id);
            assertEq(referral, p.referrer);
            assertEq(uint256(status), p.referralLocked ? (p.referrer == address(0) ? 1 : 2) : 0);
            MembershipTypes.EarnedBalances memory earned =
            tier.previewAccounting(id, address(0), address(0), 0).settled;
            assertEq(earned.member * Q + earned.fractionalScaled[1], p.creditScaled);
            memberCredit += p.creditScaled;
        }
        for (uint256 i; i < actors.length; ++i) {
            address owner = actors[i];
            (uint256 raw, uint256 fraction) = tier.claimableRetiredReward(owner);
            assertEq(raw * Q + fraction, book.retiredCreditScaled[owner]);
            memberCredit += raw * Q + fraction;
            MembershipTypes.EarnedBalances memory earned =
            tier.previewAccounting(0, address(0), owner, 0).settled;
            assertEq(
                (earned.referral + referralPaid[owner]) * Q + earned.fractionalScaled[2],
                book.funding.referralEarnedScaled[owner]
            );
            MembershipTypes.PositionPage memory page = tier.tokensOfOwner(owner, 0, 100);
            uint256 count;
            for (uint256 id = 1; id <= book.totalMinted; ++id) {
                if (book.positions[id].owner == owner) ++count;
            }
            assertEq(page.balance, count);
            assertEq(page.tokenIds.length, count);
            for (uint256 j; j < page.tokenIds.length; ++j) {
                assertEq(book.positions[page.tokenIds[j]].owner, owner);
            }
        }
        MembershipTypes.ReserveState memory reserves = tier.reserveState();
        assertEq(reserves.indexCarryScaled, book.rewardCarry);
        assertEq(reserves.distributionDustScaled, book.distributionDust);
        assertEq(reserves.unassignedMemberScaled, book.unassigned);
        assertEq(
            memberCredit + book.paidMemberRaw * Q + book.rewardCarry + book.distributionDust
                + book.unassigned,
            book.funding.earnedScaled[1]
        );
        for (uint256 p; p < 4; ++p) {
            assertEq(reserves.unearnedScaled[p], book.funding.unearnedScaled[p]);
            assertEq(reserves.cancellationScaled[p], book.funding.cancellationScaled[p]);
        }
        MembershipTypes.EarnedBalances memory global =
        tier.previewAccounting(0, address(0), address(0), 0).settled;
        assertEq(
            (global.creator + creatorPaid) * Q + global.fractionalScaled[0],
            book.funding.earnedScaled[0]
        );
        assertEq(
            (global.protocol + protocolPaid) * Q + global.fractionalScaled[3],
            book.funding.earnedScaled[3]
        );
        assertEq(book.accountedCashScaled(), book.lifetimeGross * Q);
        assertEq(paymentToken.balanceOf(address(tier)), tier.totalProtectedLiability());
    }

    function _settle(uint256 budget) private {
        for (uint256 calls;; ++calls) {
            assertLt(calls, 1000);
            MembershipTypes.MaintenanceResult memory progress = tier.processAccounting(budget);
            assertLe(progress.processedSteps, budget);
            if (progress.complete) break;
            assertGt(progress.processedSteps, 0);
        }
        book.advancePositions(_now());
    }

    function _paid(uint256 gross, address referral)
        private
        view
        returns (MembershipModel.PositionIncrease memory result)
    {
        result.paidSeconds = tier.periodDuration();
        result.gross = gross;
        result.lockReferral = gross != 0;
        result.referrer = referral;
    }

    function _liveId(uint256 seed) private view returns (uint256 id) {
        if (book.totalMinted == 0) return 0;
        id = 1 + seed % book.totalMinted;
        if (book.positions[id].owner == address(0) || !book.positions[id].time.active(_now())) {
            return 0;
        }
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % 4];
    }

    function _now() private view returns (uint64) {
        return block.timestamp.toUint64();
    }

    function _fingerprint() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tier.totalMinted(),
                tier.occupiedSupply(),
                tier.lifetimeGross(),
                tier.reserveState(),
                tier.accountingStatus(),
                paymentToken.balanceOf(address(tier))
            )
        );
    }
}

contract MembershipInvariantTest is StdInvariant, Test {
    AdversarialERC20 private _paymentToken;
    MembershipFactory private _factory;
    MembershipTier private _tier;
    MembershipHandler private _handler;

    function setUp() public {
        new LinkedVestingFixture().install();
        _paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        OnchainMediaStoreFactory mediaStoreFactory = new OnchainMediaStoreFactory();
        address creator = makeAddr("membershipInvariantCreator");
        SyntheticPonsBinding.bind(address(_paymentToken));
        _factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(_paymentToken),
            address(mediaStoreFactory),
            address(this),
            address(_paymentToken),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(_paymentToken))
        );

        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(_paymentToken));
        config.pricePerPeriod = 0;
        config.supplyCap = 8;
        config.periodDuration = 10;
        config.startingBoostBps = 30_000;
        config.earlySupportGross = 1_000_000_000;
        config.maxPrepaidPeriods = 0;
        vm.prank(creator);
        _tier = MembershipTier(_factory.createTier(config));

        address[4] memory actors = [
            makeAddr("membershipActor0"),
            makeAddr("membershipActor1"),
            makeAddr("membershipActor2"),
            makeAddr("membershipActor3")
        ];
        _handler = new MembershipHandler(_paymentToken, _factory, _tier, creator, actors);

        bytes4[] memory selectors = new bytes4[](15);
        selectors[0] = MembershipHandler.contribute.selector;
        selectors[1] = MembershipHandler.renew.selector;
        selectors[2] = MembershipHandler.grant.selector;
        selectors[3] = MembershipHandler.revokeGrant.selector;
        selectors[4] = MembershipHandler.refund.selector;
        selectors[5] = MembershipHandler.transfer.selector;
        selectors[6] = MembershipHandler.claim.selector;
        selectors[7] = MembershipHandler.claimRetired.selector;
        selectors[8] = MembershipHandler.claimReferral.selector;
        selectors[9] = MembershipHandler.advance.selector;
        selectors[10] = MembershipHandler.warp.selector;
        selectors[11] = MembershipHandler.setPaused.selector;
        selectors[12] = MembershipHandler.release.selector;
        selectors[13] = MembershipHandler.failedPausedContribution.selector;
        selectors[14] = MembershipHandler.failedInboundTransfer.selector;
        targetContract(address(_handler));
        targetSelector(FuzzSelector({addr: address(_handler), selectors: selectors}));
    }

    function invariant_positionsAndScaledCashMatchIndependentModel() public view {
        _handler.assertModel();
        assertEq(address(_tier.paymentToken()), address(_paymentToken));
        assertTrue(_factory.isPaymentTokenListed(address(_paymentToken)));
        assertLe(_tier.occupiedSupply(), _tier.supplyCap());
    }
}

contract RewardSettlementIndependenceTest is Test {
    function test_settlementFrequencyDoesNotChangePayoutsOrAssignPriorRewardsToNewShares() public {
        new LinkedVestingFixture().install();
        AdversarialERC20 token = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), address(renderer), address(token));
        config.pricePerPeriod = 0;
        MembershipTier frequent = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(makeAddr("frequentFactory"), address(token)), token, config
        );
        MembershipTier deferred = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(makeAddr("deferredFactory"), address(token)), token, config
        );
        address first = makeAddr("settlementFirst");
        address second = makeAddr("settlementSecond");

        token.mint(first, 1_000_000);
        token.mint(second, 1_000_000);
        vm.startPrank(first);
        token.approve(address(frequent), type(uint256).max);
        token.approve(address(deferred), type(uint256).max);
        frequent.createContributionMembership(100_000, address(0), 25);
        deferred.createContributionMembership(100_000, address(0), 25);
        vm.stopPrank();
        vm.warp(block.timestamp + config.periodDuration / 2);
        frequent.processAccounting(25);
        vm.startPrank(first);
        uint256 earlyClaim = frequent.claimReward(1, 25);
        vm.stopPrank();

        vm.startPrank(second);
        token.approve(address(frequent), type(uint256).max);
        token.approve(address(deferred), type(uint256).max);
        uint256 frequentSecond = frequent.createContributionMembership(100_000, address(0), 25);
        uint256 deferredSecond = deferred.createContributionMembership(100_000, address(0), 25);
        vm.stopPrank();
        assertEq(frequent.claimableReward(frequentSecond), deferred.claimableReward(deferredSecond));
        assertLe(frequent.claimableReward(frequentSecond), 5000);

        vm.startPrank(first);
        frequent.renewContributionMembership(1, 37_000, address(0), 25);
        deferred.renewContributionMembership(1, 37_000, address(0), 25);
        vm.stopPrank();
        vm.warp(block.timestamp + 2 * config.periodDuration);
        frequent.processAccounting(25);
        deferred.processAccounting(25);
        vm.startPrank(first);
        uint256 frequentFirstFinal = frequent.claimRetiredRewards();
        uint256 deferredFirstFinal = deferred.claimRetiredRewards();
        vm.stopPrank();

        vm.prank(second);
        uint256 frequentSecondFinal = frequent.claimRetiredRewards();
        vm.prank(second);
        uint256 deferredSecondFinal = deferred.claimRetiredRewards();

        assertEq(earlyClaim + frequentFirstFinal, deferredFirstFinal);
        assertEq(frequentSecondFinal, deferredSecondFinal);
        assertEq(abi.encode(frequent.reserveState()), abi.encode(deferred.reserveState()));
        assertEq(
            frequent.previewAccounting(1, address(0), address(0), 0).settled.fractionalScaled[1],
            deferred.previewAccounting(1, address(0), address(0), 0).settled.fractionalScaled[1]
        );
    }
}

contract FrozenGiftLifecycleTest is Test {
    function test_frozenPrepaidGiftRetiresWithoutPaymentTransferAtNaturalExpiry() public {
        new LinkedVestingFixture().install();
        AdversarialERC20 token = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), address(renderer), address(token));
        config.supplyCap = 1;
        MembershipTier tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(makeAddr("giftFactory"), address(token)), token, config
        );
        address payer = makeAddr("giftPayer");
        address recipient = makeAddr("frozenGiftRecipient");
        address competitor = makeAddr("giftCompetitor");

        token.mint(payer, config.pricePerPeriod);
        vm.startPrank(payer);
        token.approve(address(tier), type(uint256).max);
        uint256 tokenId = tier.giftMembership(recipient, 1, 25);
        vm.stopPrank();

        _assertFrozenRefundIsAtomic(token, tier, recipient, tokenId);

        vm.warp(tier.expiresAt(tokenId));
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        assertEq(tier.processExpirations(25).retiredCount, 1);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.balanceOf(recipient), 0);
        vm.expectRevert();
        tier.ownerOf(tokenId);
        assertEq(tier.sharesOf(tokenId), 0);
        assertFalse(tier.rewardEligible(tokenId));

        token.mint(competitor, config.pricePerPeriod);
        vm.startPrank(competitor);
        token.approve(address(tier), type(uint256).max);
        uint256 competitorTokenId = tier.createMembership(1, address(0), 25);
        vm.stopPrank();
        assertEq(competitorTokenId, 2);
        assertEq(tier.occupiedSupply(), 1);
    }

    function _assertFrozenRefundIsAtomic(
        AdversarialERC20 token,
        MembershipTier tier,
        address recipient,
        uint256 tokenId
    ) private {
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(tokenId);
        token.setFrozen(recipient, true);

        uint256 tierBalance = token.balanceOf(address(tier));
        uint256 creatorProceeds = tier.creatorProceeds();
        bytes32 reserves = keccak256(abi.encode(tier.reserveState()));
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.refund(tokenId, recipient, type(uint256).max, 25);

        assertEq(abi.encode(tier.previewRefund(tokenId)), abi.encode(quote));
        assertEq(token.balanceOf(address(tier)), tierBalance);
        assertEq(tier.creatorProceeds(), creatorProceeds);
        assertEq(keccak256(abi.encode(tier.reserveState())), reserves);
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 1);
    }
}
