// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "../helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "../helpers/SyntheticPonsBinding.sol";

import {SyntheticVaultBinding} from "../helpers/SyntheticVaultBinding.sol";

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
    using MembershipModel for MembershipModel.Lifecycle;
    using MembershipModel for MembershipModel.FundingBook;

    uint256 private constant _MAX_GROSS = 100_000_000;

    AdversarialERC20 public immutable paymentToken;
    MembershipFactory public immutable factory;
    MembershipTier public immutable tier;
    address public immutable creator;

    address[4] private _actors;

    mapping(uint256 tokenId => uint256 minimumShares) public ghostShareFloor;
    mapping(uint256 tokenId => MembershipTypes.ReferralStatus status) public ghostReferralStatus;
    mapping(uint256 tokenId => address referrer) public ghostReferrer;
    mapping(uint256 tokenId => MembershipModel.Lifecycle state) private _modelLifecycle;
    MembershipModel.FundingBook private _funding;
    uint256 private constant Q = 1 << 128;
    uint256 private _protocolPaid;
    mapping(uint256 => bool) public ghostRewardEligible;

    constructor(
        AdversarialERC20 paymentToken_,
        MembershipFactory factory_,
        MembershipTier tier_,
        address creator_,
        address[4] memory actors_
    ) {
        paymentToken = paymentToken_;
        factory = factory_;
        tier = tier_;
        creator = creator_;
        _actors = actors_;
        _funding.accountedThrough = uint64(block.timestamp);

        for (uint256 i; i < actors_.length; ++i) {
            vm.prank(actors_[i]);
            paymentToken_.approve(address(tier_), type(uint256).max);
        }
        vm.prank(creator_);
        paymentToken_.approve(address(tier_), type(uint256).max);
    }

    function contribute(uint256 actorSeed, uint256 grossSeed, uint256 referralSeed) external {
        if (tier.paused()) return;
        address actor = _actor(actorSeed);
        if (!_canIncreaseTime(actor)) return;

        uint256 gross = grossSeed % (_MAX_GROSS + 1);
        if (gross != 0) paymentToken.mint(actor, gross);
        address choice = _referralChoice(actor, referralSeed);
        _settle();
        vm.prank(actor);
        uint256 tokenId = tier.contribute(gross, choice);
        _modelContribution(tokenId, gross);
        _recordMonotonicState(tokenId);
    }

    function grant(uint256 actorSeed, uint256 periodSeed) external {
        if (tier.paused()) return;
        address actor = _actor(actorSeed);
        if (!_canIncreaseTime(actor)) return;

        uint64 periods = 1;
        if (periodSeed % 2 != 0) periods = 2;
        _settle();
        vm.prank(creator);
        uint256 tokenId = tier.grantTime(actor, periods);
        _modelLifecycle[tokenId].addGrantTime(
            _timestamp(), uint64(uint256(periods) * tier.periodDuration())
        );
        _recordMonotonicState(tokenId);
    }

    function revokeGrant(uint256 actorSeed) external {
        uint256 tokenId = tier.tokenOf(_actor(actorSeed));
        if (tokenId == 0) return;
        (, uint64 grantSeconds,) = tier.timeBalances(tokenId);
        if (grantSeconds == 0) return;

        _settle();
        vm.prank(creator);
        tier.revokeGrantTime(tokenId);
        _modelLifecycle[tokenId].revokeGrantTime(_timestamp());
        if (_modelLifecycle[tokenId].paidSeconds == 0) ghostRewardEligible[tokenId] = false;
        _recordMonotonicState(tokenId);
    }

    function refund(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0 || tier.balanceOf(actor) == 0) return;
        _settle();

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max);
        _funding.cancel(tokenId);
        ghostRewardEligible[tokenId] = false;
        _modelLifecycle[tokenId].refundTime(_timestamp());
        assertEq(_grossRefund(tokenId), 0);
        _recordMonotonicState(tokenId);
    }

    function refundAndRejoin(uint256 actorSeed, uint256 grossSeed) external {
        if (tier.paused()) return;
        address actor = _actor(actorSeed);
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0) return;
        if (!_canIncreaseTime(actor)) return;
        if (tier.balanceOf(actor) != 0) {
            _settle();

            vm.prank(creator);
            tier.refund(tokenId, type(uint256).max);
            _funding.cancel(tokenId);
            ghostRewardEligible[tokenId] = false;
            _modelLifecycle[tokenId].refundTime(_timestamp());
            assertEq(_grossRefund(tokenId), 0);
        }

        uint256 newGross = grossSeed % (_MAX_GROSS + 1);
        if (newGross != 0) paymentToken.mint(actor, newGross);
        address referralChoice = _referralChoice(actor, grossSeed >> 1);
        _settle();
        vm.prank(actor);
        tier.contribute(newGross, referralChoice);
        _modelContribution(tokenId, newGross);
        assertEq(_grossRefund(tokenId), newGross);
        _recordMonotonicState(tokenId);
    }

    function synchronizeTwice(uint256 actorSeed) external {
        uint256 tokenId = tier.tokenOf(_actor(actorSeed));
        if (tokenId == 0) return;
        _settle();
        bool expectedRelease = _modelLifecycle[tokenId].synchronize(_timestamp());
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        vm.prank(creator);
        uint256 released = tier.synchronizeExpiredMemberships(tokenIds);
        assertEq(released, expectedRelease ? 1 : 0);
        if (expectedRelease) ghostRewardEligible[tokenId] = false;
        vm.prank(creator);
        assertEq(tier.synchronizeExpiredMemberships(tokenIds), 0);
        assertFalse(_modelLifecycle[tokenId].synchronize(_timestamp()));
        _recordMonotonicState(tokenId);
    }

    function setPaused(uint256 pausedSeed) external {
        vm.prank(creator);
        tier.setPaused(pausedSeed % 2 == 0);
    }

    function advance(uint256) external {
        _settle();
    }

    function release() external {
        uint256 expected = _funding.earnedScaled[3] / Q - _protocolPaid;
        assertEq(tier.releaseProtocolFees(), expected);
        _protocolPaid += expected;
    }

    function _settle() private {
        for (uint256 calls;; ++calls) {
            assertLt(calls, 500);
            (uint256 steps,, bool complete,) = tier.processAccounting(25);
            if (complete) break;
            assertGt(steps, 0);
        }
        _funding.recognize(_timestamp());
    }

    function _modelContribution(uint256 id, uint256 gross) private {
        (uint64 remaining,,) = _modelLifecycle[id].projected(_timestamp());
        (, address referrer) = tier.referralOf(id);
        _funding.fund(
            id,
            gross,
            _timestamp() + remaining,
            tier.periodDuration(),
            tier.protocolFeeBps(),
            tier.rewardBps(),
            tier.referralBps(),
            referrer
        );
        _modelLifecycle[id].addPaidTime(_timestamp(), tier.periodDuration());
        if (gross != 0) {
            ghostShareFloor[id] += gross;
            ghostRewardEligible[id] = true;
        }
    }

    function assertFundingConservation() external view {
        MembershipTypes.ReserveState memory reserves = tier.reserveState();
        uint256 memberCredit;
        uint256 referralCredit;
        for (uint256 i; i < _actors.length; ++i) {
            uint256 id = tier.tokenOf(_actors[i]);
            MembershipTypes.EarnedBalances memory balances =
            tier.previewAccounting(id, _actors[i], 0).settled;
            memberCredit += balances.member * Q + balances.fractionalScaled[1];
            referralCredit += balances.referral * Q + balances.fractionalScaled[2];
            if (id != 0) assertEq(tier.allocationState(id).generation, _funding.generation[id]);
        }
        MembershipTypes.EarnedBalances memory global =
        tier.previewAccounting(0, address(0), 0).settled;
        uint256[4] memory earned = [
            global.creator * Q + global.fractionalScaled[0],
            memberCredit + reserves.indexCarryScaled + reserves.distributionDustScaled,
            referralCredit,
            (global.protocol + _protocolPaid) * Q + global.fractionalScaled[3]
        ];
        for (uint256 p; p < 4; ++p) {
            assertEq(earned[p], _funding.earnedScaled[p]);
            assertEq(reserves.unearnedScaled[p], _funding.unearnedScaled[p]);
            assertEq(reserves.cancellationScaled[p], _funding.cancellationScaled[p]);
            assertEq(
                _funding.allocatedScaled[p],
                earned[p] + _funding.unearnedScaled[p] + _funding.cancellationScaled[p]
                    + _funding.refundedScaled[p]
            );
        }
        assertEq(reserves.unassignedMemberScaled, 0);
        assertEq(paymentToken.balanceOf(address(tier)), tier.totalProtectedLiability());
    }

    function warp(uint256 elapsedSeed) external {
        vm.warp(block.timestamp + elapsedSeed % (90 days + 1));
    }

    function failedPausedContribution(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        bool wasPaused = tier.paused();
        if (!wasPaused) {
            vm.prank(creator);
            tier.setPaused(true);
        }
        bytes32 beforeState = _stateFingerprint(actor);
        address referralChoice = _referralChoice(actor, actorSeed);

        vm.prank(actor);
        (bool succeeded,) =
            address(tier).call(abi.encodeCall(MembershipTier.contribute, (0, referralChoice)));
        assertFalse(succeeded);
        assertEq(_stateFingerprint(actor), beforeState);

        if (!wasPaused) {
            vm.prank(creator);
            tier.setPaused(false);
        }
    }

    function failedInboundTransfer(uint256 actorSeed, uint256 failureSeed) external {
        if (tier.paused()) return;
        address actor = _actor(actorSeed);
        if (!_canIncreaseTime(actor)) return;

        uint256 gross = 1_000_000;
        paymentToken.mint(actor, gross);
        uint256 failure = failureSeed % 4;
        if (failure == 0) {
            paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.ReturnFalse);
        } else if (failure == 1) {
            paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.ShortTransfer);
        } else if (failure == 2) {
            paymentToken.setFrozen(address(tier), true);
        } else {
            paymentToken.setFrozen(actor, true);
        }
        bytes32 beforeState = _stateFingerprint(actor);
        address referralChoice = _referralChoice(actor, failureSeed >> 2);

        vm.prank(actor);
        (bool succeeded,) =
            address(tier).call(abi.encodeCall(MembershipTier.contribute, (gross, referralChoice)));
        assertFalse(succeeded);

        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
        paymentToken.setFrozen(address(tier), false);
        paymentToken.setFrozen(actor, false);
        assertEq(_stateFingerprint(actor), beforeState);
    }

    function modelState(uint256 tokenId)
        external
        view
        returns (
            uint64 paidSeconds,
            uint64 grantSeconds,
            uint64 checkpoint,
            uint64 expiration,
            bool active,
            bool occupied,
            bool initialized
        )
    {
        MembershipModel.Lifecycle storage state = _modelLifecycle[tokenId];
        (paidSeconds, grantSeconds, checkpoint) = state.projected(_timestamp());
        expiration = state.expiration();
        active = state.active(_timestamp());
        occupied = state.occupied;
        initialized = state.initialized;
    }

    function recipientFor(uint256 tokenId) external view returns (address) {
        for (uint256 i; i < _actors.length; ++i) {
            if (tier.tokenOf(_actors[i]) == tokenId) return _actors[i];
        }
        return address(0);
    }

    function _grossRefund(uint256 tokenId) private view returns (uint256) {
        return tier.previewRefund(tokenId).grossRefund;
    }

    function _canIncreaseTime(address actor) private view returns (bool) {
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId != 0 && tier.isOccupied(tokenId)) return true;
        uint64 cap = tier.supplyCap();
        return cap == 0 || tier.occupiedSupply() < cap;
    }

    function _recordMonotonicState(uint256 tokenId) private {
        uint256 shares = tier.sharesOf(tokenId);
        assertEq(shares, ghostShareFloor[tokenId]);
        assertEq(tier.rewardEligible(tokenId), ghostRewardEligible[tokenId]);

        (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(tokenId);
        MembershipTypes.ReferralStatus priorStatus = ghostReferralStatus[tokenId];
        if (priorStatus == MembershipTypes.ReferralStatus.Unset) {
            if (status != MembershipTypes.ReferralStatus.Unset) {
                ghostReferralStatus[tokenId] = status;
                ghostReferrer[tokenId] = referrer;
            }
            return;
        }
        assertEq(uint256(status), uint256(priorStatus));
        assertEq(referrer, ghostReferrer[tokenId]);
    }

    function _stateFingerprint(address actor) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                _memberFingerprint(actor),
                _aggregateFingerprint(),
                paymentToken.balanceOf(actor),
                paymentToken.balanceOf(address(tier)),
                paymentToken.balanceOf(address(factory))
            )
        );
    }

    function _memberFingerprint(address actor) private view returns (bytes32) {
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0) return keccak256(abi.encode(tokenId));

        uint64 paidSeconds;
        uint64 grantSeconds;
        uint64 checkpoint;
        (paidSeconds, grantSeconds, checkpoint) = tier.timeBalances(tokenId);
        uint256 refundPreview;
        if (tier.balanceOf(actor) != 0) refundPreview = tier.previewRefund(tokenId).grossRefund;
        bytes32 timeState =
            keccak256(abi.encode(paidSeconds, grantSeconds, checkpoint, refundPreview));
        return keccak256(abi.encode(tokenId, timeState, _economicFingerprint(tokenId, actor)));
    }

    function _economicFingerprint(uint256 tokenId, address actor) private view returns (bytes32) {
        (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(tokenId);
        return keccak256(
            abi.encode(
                status,
                referrer,
                tier.sharesOf(tokenId),
                tier.claimableReward(tokenId),
                tier.claimableReferral(actor),
                tier.isOccupied(tokenId),
                tier.rewardEligible(tokenId)
            )
        );
    }

    function _aggregateFingerprint() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tier.totalMinted(),
                tier.occupiedSupply(),
                tier.totalRewardShares(),
                tier.creatorProceeds(),
                tier.reserveState(),
                tier.previewAccounting(0, address(0), 0).settled
            )
        );
    }

    function _actor(uint256 seed) private view returns (address) {
        return _actors[seed % _actors.length];
    }

    function _referralChoice(address actor, uint256 seed) private view returns (address choice) {
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0) return seed % 2 == 0 ? address(0) : _actor(seed >> 1);

        (MembershipTypes.ReferralStatus status, address referrer) = tier.referralOf(tokenId);
        if (status == MembershipTypes.ReferralStatus.LockedAddress) return referrer;
        if (status == MembershipTypes.ReferralStatus.LockedNone) return address(0);
        return seed % 2 == 0 ? address(0) : _actor(seed >> 1);
    }

    function _timestamp() private view returns (uint64) {
        return uint64(block.timestamp);
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
            MembershipTestConfig.tierCode(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(_paymentToken))
        );

        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(_paymentToken));
        config.pricePerPeriod = 0;
        config.supplyCap = 2;
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

        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = MembershipHandler.contribute.selector;
        selectors[1] = MembershipHandler.grant.selector;
        selectors[2] = MembershipHandler.revokeGrant.selector;
        selectors[3] = MembershipHandler.refund.selector;
        selectors[4] = MembershipHandler.refundAndRejoin.selector;
        selectors[5] = MembershipHandler.synchronizeTwice.selector;
        selectors[6] = MembershipHandler.setPaused.selector;
        selectors[7] = MembershipHandler.warp.selector;
        selectors[8] = MembershipHandler.failedPausedContribution.selector;
        selectors[9] = MembershipHandler.failedInboundTransfer.selector;
        selectors[10] = MembershipHandler.advance.selector;
        selectors[11] = MembershipHandler.release.selector;
        targetContract(address(_handler));
        targetSelector(FuzzSelector({addr: address(_handler), selectors: selectors}));
    }

    function invariant_identityLocksSharesAndOccupancyRemainConsistent() public view {
        _handler.assertFundingConservation();
        assertEq(address(_tier.paymentToken()), address(_paymentToken));
        assertTrue(_factory.isPaymentTokenListed(address(_paymentToken)));
        uint256 totalMinted = _tier.totalMinted();
        uint256 countedOccupancy;
        uint256 countedRewardShares;
        for (uint256 tokenId = 1; tokenId <= totalMinted; ++tokenId) {
            address recipient = _handler.recipientFor(tokenId);
            assertTrue(recipient != address(0));
            assertEq(_tier.tokenOf(recipient), tokenId);
            if (_tier.balanceOf(recipient) != 0) assertEq(_tier.ownerOf(tokenId), recipient);
            assertGe(_tier.sharesOf(tokenId), _handler.ghostShareFloor(tokenId));
            if (_tier.isOccupied(tokenId)) ++countedOccupancy;
            if (_tier.rewardEligible(tokenId)) countedRewardShares += _tier.sharesOf(tokenId);

            _assertLifecycleMatchesModel(tokenId, recipient);

            MembershipTypes.ReferralStatus ghostStatus = _handler.ghostReferralStatus(tokenId);
            if (ghostStatus != MembershipTypes.ReferralStatus.Unset) {
                (MembershipTypes.ReferralStatus status, address referrer) =
                    _tier.referralOf(tokenId);
                assertEq(uint256(status), uint256(ghostStatus));
                assertEq(referrer, _handler.ghostReferrer(tokenId));
            }
        }

        assertEq(countedOccupancy, _tier.occupiedSupply());
        assertLe(countedOccupancy, _tier.supplyCap());
        assertEq(countedRewardShares, _tier.totalRewardShares());
    }

    function _assertLifecycleMatchesModel(uint256 tokenId, address recipient) private view {
        (
            uint64 modelPaid,
            uint64 modelGrant,
            uint64 modelCheckpoint,
            uint64 modelExpiration,
            bool modelActive,
            bool modelOccupied,
            bool modelInitialized
        ) = _handler.modelState(tokenId);
        (uint64 paidSeconds, uint64 grantSeconds, uint64 checkpoint) = _tier.timeBalances(tokenId);
        assertTrue(modelInitialized);
        assertEq(paidSeconds, modelPaid);
        assertEq(grantSeconds, modelGrant);
        assertEq(checkpoint, modelCheckpoint);
        if (_tier.balanceOf(recipient) != 0) {
            assertEq(_tier.expiresAt(tokenId), modelExpiration);
        }
        assertEq(_tier.isActiveToken(tokenId), modelActive);
        assertEq(_tier.isActive(recipient), modelActive);
        assertEq(_tier.isOccupied(tokenId), modelOccupied);
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
        MembershipTier frequent = new MembershipTier(
            SyntheticVaultBinding.bind(makeAddr("frequentFactory"), address(token)), token, config
        );
        MembershipTier deferred = new MembershipTier(
            SyntheticVaultBinding.bind(makeAddr("deferredFactory"), address(token)), token, config
        );
        address first = makeAddr("settlementFirst");
        address second = makeAddr("settlementSecond");

        token.mint(first, 1_000_000);
        token.mint(second, 1_000_000);
        vm.startPrank(first);
        token.approve(address(frequent), type(uint256).max);
        token.approve(address(deferred), type(uint256).max);
        frequent.contribute(100_000, address(0));
        deferred.contribute(100_000, address(0));
        vm.stopPrank();
        vm.warp(block.timestamp + config.periodDuration / 2);
        frequent.processAccounting(25);
        vm.startPrank(first);
        uint256 earlyClaim = frequent.claimReward(frequent.tokenOf(first));
        vm.stopPrank();

        vm.startPrank(second);
        token.approve(address(frequent), type(uint256).max);
        token.approve(address(deferred), type(uint256).max);
        uint256 frequentSecond = frequent.contribute(100_000, address(0));
        uint256 deferredSecond = deferred.contribute(100_000, address(0));
        vm.stopPrank();
        assertEq(frequent.claimableReward(frequentSecond), deferred.claimableReward(deferredSecond));
        assertLe(frequent.claimableReward(frequentSecond), 5000);

        vm.startPrank(first);
        frequent.contribute(37_000, address(0));
        deferred.contribute(37_000, address(0));
        vm.stopPrank();
        vm.warp(block.timestamp + 2 * config.periodDuration);
        frequent.processAccounting(25);
        deferred.processAccounting(25);
        vm.startPrank(first);
        uint256 frequentFirstFinal = frequent.claimReward(frequent.tokenOf(first));
        uint256 deferredFirstFinal = deferred.claimReward(deferred.tokenOf(first));
        vm.stopPrank();

        vm.prank(second);
        uint256 frequentSecondFinal = frequent.claimReward(frequentSecond);
        vm.prank(second);
        uint256 deferredSecondFinal = deferred.claimReward(deferredSecond);

        assertEq(earlyClaim + frequentFirstFinal, deferredFirstFinal);
        assertEq(frequentSecondFinal, deferredSecondFinal);
        assertEq(abi.encode(frequent.reserveState()), abi.encode(deferred.reserveState()));
        assertEq(
            frequent.previewAccounting(1, address(0), 0).settled.fractionalScaled[1],
            deferred.previewAccounting(1, address(0), 0).settled.fractionalScaled[1]
        );
    }
}

contract FrozenGiftLifecycleTest is Test {
    function test_frozenPrepaidGiftRetainsIdentitySharesAndCapacityUntilNaturalExpiryAndSync()
        public
    {
        new LinkedVestingFixture().install();
        AdversarialERC20 token = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), address(renderer), address(token));
        config.supplyCap = 1;
        MembershipTier tier = new MembershipTier(
            SyntheticVaultBinding.bind(makeAddr("giftFactory"), address(token)), token, config
        );
        address payer = makeAddr("giftPayer");
        address recipient = makeAddr("frozenGiftRecipient");
        address competitor = makeAddr("giftCompetitor");

        token.mint(payer, config.pricePerPeriod);
        vm.startPrank(payer);
        token.approve(address(tier), type(uint256).max);
        uint256 tokenId = tier.gift(recipient, 1, MembershipTypes.ReferralStatus.Unset, address(0));
        vm.stopPrank();

        _assertFrozenRefundIsAtomic(token, tier, recipient, tokenId);

        vm.warp(tier.expiresAt(tokenId));
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        assertEq(tier.synchronizeExpiredMemberships(tokenIds), 1);
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.balanceOf(recipient), 0);
        vm.expectRevert();
        tier.ownerOf(tokenId);
        assertEq(tier.sharesOf(tokenId), config.pricePerPeriod);
        assertFalse(tier.rewardEligible(tokenId));

        token.mint(competitor, config.pricePerPeriod);
        vm.startPrank(competitor);
        token.approve(address(tier), type(uint256).max);
        uint256 competitorTokenId = tier.purchase(1, address(0));
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
        tier.refund(tokenId, type(uint256).max);

        assertEq(abi.encode(tier.previewRefund(tokenId)), abi.encode(quote));
        assertEq(token.balanceOf(address(tier)), tierBalance);
        assertEq(tier.creatorProceeds(), creatorProceeds);
        assertEq(keccak256(abi.encode(tier.reserveState())), reserves);
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 1);
    }
}
