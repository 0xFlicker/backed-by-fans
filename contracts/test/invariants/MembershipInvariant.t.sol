// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {AdversarialERC20} from "../mocks/AdversarialERC20.sol";
import {MembershipModel} from "../models/MembershipModel.sol";

contract MembershipHandler is Test {
    using MembershipModel for MembershipModel.Lifecycle;

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
        vm.prank(actor);
        uint256 tokenId = tier.contribute(gross, choice);
        _modelLifecycle[tokenId].addPaidTime(_timestamp(), tier.periodDuration());
        _recordMonotonicState(tokenId);
    }

    function grant(uint256 actorSeed, uint256 periodSeed) external {
        if (tier.paused()) return;
        address actor = _actor(actorSeed);
        if (!_canIncreaseTime(actor)) return;

        uint64 periods = 1;
        if (periodSeed % 2 != 0) periods = 2;
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

        vm.prank(creator);
        tier.revokeGrantTime(tokenId);
        _modelLifecycle[tokenId].revokeGrantTime(_timestamp());
        _recordMonotonicState(tokenId);
    }

    function refund(uint256 actorSeed) external {
        uint256 tokenId = tier.tokenOf(_actor(actorSeed));
        if (tokenId == 0) return;
        _fundTopUp(tokenId);

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);
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
        _fundTopUp(tokenId);

        vm.prank(creator);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);
        _modelLifecycle[tokenId].refundTime(_timestamp());
        assertEq(_grossRefund(tokenId), 0);

        uint256 newGross = grossSeed % (_MAX_GROSS + 1);
        if (newGross != 0) paymentToken.mint(actor, newGross);
        address referralChoice = _referralChoice(actor, grossSeed >> 1);
        vm.prank(actor);
        tier.contribute(newGross, referralChoice);
        _modelLifecycle[tokenId].addPaidTime(_timestamp(), tier.periodDuration());
        assertEq(_grossRefund(tokenId), newGross);
        _recordMonotonicState(tokenId);
    }

    function synchronizeTwice(uint256 actorSeed) external {
        uint256 tokenId = tier.tokenOf(_actor(actorSeed));
        if (tokenId == 0) return;
        bool released = tier.synchronize(tokenId);
        assertEq(released, _modelLifecycle[tokenId].synchronize(_timestamp()));
        assertFalse(tier.synchronize(tokenId));
        assertFalse(_modelLifecycle[tokenId].synchronize(_timestamp()));
        _recordMonotonicState(tokenId);
    }

    function setPaused(uint256 pausedSeed) external {
        vm.prank(creator);
        tier.setPaused(pausedSeed % 2 == 0);
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
            paymentToken.setFrozen(address(factory), true);
        }
        bytes32 beforeState = _stateFingerprint(actor);
        address referralChoice = _referralChoice(actor, failureSeed >> 2);

        vm.prank(actor);
        (bool succeeded,) =
            address(tier).call(abi.encodeCall(MembershipTier.contribute, (gross, referralChoice)));
        assertFalse(succeeded);

        paymentToken.setTransferFromBehavior(AdversarialERC20.Behavior.Normal);
        paymentToken.setFrozen(address(tier), false);
        paymentToken.setFrozen(address(factory), false);
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

    function _fundTopUp(uint256 tokenId) private {
        (, uint256 ownerTopUp) = tier.previewRefund(tokenId);
        if (ownerTopUp != 0) paymentToken.mint(creator, ownerTopUp);
    }

    function _grossRefund(uint256 tokenId) private view returns (uint256 grossRefund) {
        (grossRefund,) = tier.previewRefund(tokenId);
    }

    function _canIncreaseTime(address actor) private view returns (bool) {
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId != 0 && tier.isOccupied(tokenId)) return true;
        uint64 cap = tier.supplyCap();
        return cap == 0 || tier.occupiedSupply() < cap;
    }

    function _recordMonotonicState(uint256 tokenId) private {
        uint256 shares = tier.sharesOf(tokenId);
        assertGe(shares, ghostShareFloor[tokenId]);
        ghostShareFloor[tokenId] = shares;

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
        (uint256 refundPreview,) = tier.previewRefund(tokenId);
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
                tier.isOccupied(tokenId)
            )
        );
    }

    function _aggregateFingerprint() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                tier.totalMinted(),
                tier.occupiedSupply(),
                tier.totalShares(),
                tier.creatorProceeds(),
                tier.rewardReserve(),
                tier.totalReferralLiability()
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
        _paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        address creator = makeAddr("membershipInvariantCreator");
        _factory = new MembershipFactory(
            _paymentToken, address(renderer), address(this), makeAddr("membershipInvariantFees")
        );

        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(creator);
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

        bytes4[] memory selectors = new bytes4[](10);
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
        targetContract(address(_handler));
        targetSelector(FuzzSelector({addr: address(_handler), selectors: selectors}));
    }

    function invariant_identityLocksSharesAndOccupancyRemainConsistent() public view {
        uint256 totalMinted = _tier.totalMinted();
        uint256 countedOccupancy;
        for (uint256 tokenId = 1; tokenId <= totalMinted; ++tokenId) {
            address recipient = _tier.ownerOf(tokenId);
            assertEq(_tier.tokenOf(recipient), tokenId);
            assertGe(_tier.sharesOf(tokenId), _handler.ghostShareFloor(tokenId));
            if (_tier.isOccupied(tokenId)) ++countedOccupancy;

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
        assertEq(_tier.expiresAt(tokenId), modelExpiration);
        assertEq(_tier.isActiveToken(tokenId), modelActive);
        assertEq(_tier.isActive(recipient), modelActive);
        assertEq(_tier.isOccupied(tokenId), modelOccupied);
    }
}

contract RewardSettlementIndependenceTest is Test {
    function test_settlementFrequencyDoesNotChangePayoutsOrAssignPriorRewardsToNewShares() public {
        AdversarialERC20 token = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        config.pricePerPeriod = 0;
        MembershipTier frequent =
            new MembershipTier(makeAddr("frequentFactory"), token, address(renderer), config);
        MembershipTier deferred =
            new MembershipTier(makeAddr("deferredFactory"), token, address(renderer), config);
        address first = makeAddr("settlementFirst");
        address second = makeAddr("settlementSecond");

        token.mint(first, 1_000_000);
        token.mint(second, 1_000_000);
        vm.startPrank(first);
        token.approve(address(frequent), type(uint256).max);
        token.approve(address(deferred), type(uint256).max);
        frequent.contribute(100_000, address(0));
        deferred.contribute(100_000, address(0));
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
        uint256 frequentFirstFinal = frequent.claimReward(frequent.tokenOf(first));
        uint256 deferredFirstFinal = deferred.claimReward(deferred.tokenOf(first));
        vm.stopPrank();

        vm.prank(second);
        uint256 frequentSecondFinal = frequent.claimReward(frequentSecond);
        vm.prank(second);
        uint256 deferredSecondFinal = deferred.claimReward(deferredSecond);

        assertEq(earlyClaim + frequentFirstFinal, deferredFirstFinal);
        assertEq(frequentSecondFinal, deferredSecondFinal);
        assertEq(frequent.rewardReserve(), deferred.rewardReserve());
    }
}

contract FrozenGiftLifecycleTest is Test {
    function test_frozenPrepaidGiftRetainsIdentitySharesAndCapacityUntilNaturalExpiryAndSync()
        public
    {
        AdversarialERC20 token = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(address(this));
        config.supplyCap = 1;
        MembershipTier tier =
            new MembershipTier(makeAddr("giftFactory"), token, address(renderer), config);
        address payer = makeAddr("giftPayer");
        address recipient = makeAddr("frozenGiftRecipient");
        address competitor = makeAddr("giftCompetitor");

        token.mint(payer, config.pricePerPeriod);
        vm.startPrank(payer);
        token.approve(address(tier), type(uint256).max);
        uint256 tokenId = tier.gift(recipient, 1, MembershipTypes.ReferralStatus.Unset, address(0));
        vm.stopPrank();

        (uint256 grossRefund, uint256 ownerTopUp) = tier.previewRefund(tokenId);
        token.mint(address(this), ownerTopUp);
        token.approve(address(tier), type(uint256).max);
        token.setFrozen(recipient, true);

        uint256 tierBalance = token.balanceOf(address(tier));
        uint256 creatorProceeds = tier.creatorProceeds();
        uint256 rewardReserve = tier.rewardReserve();
        vm.expectRevert(AdversarialERC20.AccountFrozen.selector);
        tier.refund(tokenId, type(uint256).max, type(uint256).max);

        (uint256 refundAfterFailure, uint256 topUpAfterFailure) = tier.previewRefund(tokenId);
        assertEq(refundAfterFailure, grossRefund);
        assertEq(topUpAfterFailure, ownerTopUp);
        assertEq(token.balanceOf(address(tier)), tierBalance);
        assertEq(tier.creatorProceeds(), creatorProceeds);
        assertEq(tier.rewardReserve(), rewardReserve);
        assertEq(tier.sharesOf(tokenId), config.pricePerPeriod);
        assertTrue(tier.isOccupied(tokenId));
        assertEq(tier.occupiedSupply(), 1);

        vm.warp(tier.expiresAt(tokenId));
        assertTrue(tier.synchronize(tokenId));
        assertEq(tier.occupiedSupply(), 0);
        assertEq(tier.ownerOf(tokenId), recipient);
        assertEq(tier.sharesOf(tokenId), config.pricePerPeriod);

        token.mint(competitor, config.pricePerPeriod);
        vm.startPrank(competitor);
        token.approve(address(tier), type(uint256).max);
        uint256 competitorTokenId = tier.purchase(1, address(0));
        vm.stopPrank();
        assertEq(competitorTokenId, 2);
        assertEq(tier.occupiedSupply(), 1);
    }
}
