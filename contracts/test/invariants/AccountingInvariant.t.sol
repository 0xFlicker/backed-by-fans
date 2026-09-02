// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
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

contract AccountingHandler is Test {
    using MembershipModel for MembershipModel.Lifecycle;
    using MembershipModel for MembershipModel.PaymentBook;

    uint256 private constant _MAX_SURPLUS = 10_000_000;

    AdversarialERC20 public immutable paymentToken;
    MembershipFactory public immutable factory;
    MembershipTier public immutable tier;
    address public immutable creator;
    address public immutable feeRecipient;

    address[4] private _actors;

    MembershipModel.PaymentBook private _book;
    mapping(uint256 tokenId => MembershipModel.Lifecycle state) private _lifecycle;
    mapping(uint256 tokenId => MembershipTypes.ReferralStatus status) private _referralStatus;
    mapping(uint256 tokenId => address referrer) private _referrer;

    uint256 public ghostGrossIn;
    uint256 public ghostOwnerTopUps;
    uint256 public ghostSurplusIn;
    uint256 public ghostCreatorWithdrawn;
    uint256 public ghostRewardClaimed;
    uint256 public ghostReferralClaimed;
    uint256 public ghostRefunded;
    uint256 public ghostProtocolWithdrawn;
    uint256 public ghostRewardAllocated;

    constructor(
        AdversarialERC20 paymentToken_,
        MembershipFactory factory_,
        MembershipTier tier_,
        address creator_,
        address feeRecipient_,
        address[4] memory actors_
    ) {
        paymentToken = paymentToken_;
        factory = factory_;
        tier = tier_;
        creator = creator_;
        feeRecipient = feeRecipient_;
        _actors = actors_;
        _book.initialize(address(paymentToken_));

        for (uint256 i; i < actors_.length; ++i) {
            vm.prank(actors_[i]);
            paymentToken_.approve(address(tier_), type(uint256).max);
        }
        vm.prank(creator_);
        paymentToken_.approve(address(tier_), type(uint256).max);
    }

    function purchase(uint256 actorSeed, uint256 periodsSeed, uint256 referralSeed) external {
        address actor = _actor(actorSeed);
        uint64 periods = 1;
        if (periodsSeed % 2 != 0) periods = 2;
        uint256 gross = tier.pricePerPeriod() * periods;
        paymentToken.mint(actor, gross);
        address referralChoice = _referralChoice(tier.tokenOf(actor), referralSeed);

        vm.prank(actor);
        uint256 tokenId = tier.purchase(periods, referralChoice);

        _lockModelReferral(tokenId, referralChoice);
        _lifecycle[tokenId].addPaidTime(
            _timestamp(), uint64(uint256(periods) * tier.periodDuration())
        );
        _applyModelPayment(tokenId, gross);
    }

    function gift(uint256 payerSeed, uint256 recipientSeed, uint256 periodsSeed) external {
        address payer = _actor(payerSeed);
        address recipient = _differentActor(payer, recipientSeed);
        uint64 periods = 1;
        if (periodsSeed % 2 != 0) periods = 2;
        uint256 gross = tier.pricePerPeriod() * periods;
        paymentToken.mint(payer, gross);

        uint256 existingTokenId = tier.tokenOf(recipient);
        MembershipTypes.ReferralStatus status;
        address referrer;
        if (existingTokenId != 0) (status, referrer) = tier.referralOf(existingTokenId);

        vm.prank(payer);
        uint256 tokenId = tier.gift(recipient, periods, status, referrer);

        _lifecycle[tokenId].addPaidTime(
            _timestamp(), uint64(uint256(periods) * tier.periodDuration())
        );
        _applyModelPayment(tokenId, gross);
    }

    function claimReward(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0) return;

        uint256 expected = _book.claimableReward(tokenId);
        vm.prank(actor);
        uint256 claimed = tier.claimReward(tokenId);
        assertEq(claimed, expected);
        assertEq(_book.claimReward(tokenId), expected);
        ghostRewardClaimed += claimed;
    }

    function claimReferral(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 expected = _book.referralCredits[actor];
        vm.prank(actor);
        uint256 claimed = tier.claimReferral();
        assertEq(claimed, expected);
        assertEq(_book.claimReferral(actor), expected);
        ghostReferralClaimed += claimed;
    }

    function refund(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 tokenId = tier.tokenOf(actor);
        if (tokenId == 0 || tier.balanceOf(actor) == 0) return;

        (uint64 paidSeconds,,) = _lifecycle[tokenId].projected(_timestamp());
        uint256 expectedRefund =
            MembershipModel.fixedRefund(paidSeconds, tier.pricePerPeriod(), tier.periodDuration());
        uint256 expectedTopUp =
            expectedRefund > _book.creatorProceeds ? expectedRefund - _book.creatorProceeds : 0;
        (uint256 actualRefund, uint256 actualTopUp) = tier.previewRefund(tokenId);
        assertEq(actualRefund, expectedRefund);
        assertEq(actualTopUp, expectedTopUp);
        if (expectedTopUp != 0) paymentToken.mint(creator, expectedTopUp);

        vm.prank(creator);
        (uint256 refunded, uint256 ownerTopUp) = tier.refund(tokenId, expectedRefund, expectedTopUp);
        assertEq(refunded, expectedRefund);
        assertEq(ownerTopUp, expectedTopUp);
        assertEq(_book.applyRefund(expectedRefund), expectedTopUp);
        _book.deactivateRewards(tokenId);
        _lifecycle[tokenId].refundTime(_timestamp());
        ghostOwnerTopUps += ownerTopUp;
        ghostRefunded += refunded;
    }

    function synchronizeExpired(uint256 actorSeed) external {
        uint256 tokenId = tier.tokenOf(_actor(actorSeed));
        if (tokenId == 0) return;

        bool expectedBurn = _lifecycle[tokenId].synchronize(_timestamp());
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        vm.prank(creator);
        uint256 burned = tier.synchronizeExpiredMemberships(tokenIds);
        assertEq(burned, expectedBurn ? 1 : 0);
        if (expectedBurn) _book.deactivateRewards(tokenId);
    }

    function withdrawCreatorProceeds() external {
        uint256 expected = _book.creatorProceeds;
        vm.prank(creator);
        uint256 withdrawn = tier.withdrawCreatorProceeds();
        assertEq(withdrawn, expected);
        assertEq(_book.withdrawCreatorProceeds(), expected);
        ghostCreatorWithdrawn += withdrawn;
    }

    function withdrawProtocolFees() external {
        uint256 expected = _book.protocolProceeds;
        vm.prank(feeRecipient);
        uint256 withdrawn = factory.withdrawProtocolFees(paymentToken);
        assertEq(withdrawn, expected);
        assertEq(_book.withdrawProtocolProceeds(), expected);
        ghostProtocolWithdrawn += withdrawn;
    }

    function donateToTier(uint256 amountSeed) external {
        uint256 amount = amountSeed % (_MAX_SURPLUS + 1);
        if (amount == 0) return;
        address donor = _actors[0];
        paymentToken.mint(donor, amount);
        vm.prank(donor);
        assertTrue(paymentToken.transfer(address(tier), amount));
        ghostSurplusIn += amount;
    }

    function donateToFactory(uint256 amountSeed) external {
        uint256 amount = amountSeed % (_MAX_SURPLUS + 1);
        if (amount == 0) return;
        address donor = _actors[1];
        paymentToken.mint(donor, amount);
        vm.prank(donor);
        assertTrue(paymentToken.transfer(address(factory), amount));
        _book.protocolProceeds += amount;
        ghostSurplusIn += amount;
    }

    function failedExit(uint256 actorSeed, uint256 exitSeed) external {
        address actor = _actor(actorSeed);
        uint256 exit = exitSeed % 5;
        address frozenAccount;
        bytes memory callData;
        address caller;
        address target;

        if (exit == 0) {
            uint256 tokenId = tier.tokenOf(actor);
            if (tokenId == 0 || _book.claimableReward(tokenId) == 0) return;
            frozenAccount = actor;
            caller = actor;
            target = address(tier);
            callData = abi.encodeCall(MembershipTier.claimReward, (tokenId));
        } else if (exit == 1) {
            if (_book.referralCredits[actor] == 0) return;
            frozenAccount = actor;
            caller = actor;
            target = address(tier);
            callData = abi.encodeCall(MembershipTier.claimReferral, ());
        } else if (exit == 2) {
            if (_book.creatorProceeds == 0) return;
            frozenAccount = creator;
            caller = creator;
            target = address(tier);
            callData = abi.encodeCall(MembershipTier.withdrawCreatorProceeds, ());
        } else if (exit == 3) {
            if (_book.protocolProceeds == 0) return;
            frozenAccount = feeRecipient;
            caller = feeRecipient;
            target = address(factory);
            callData = abi.encodeCall(MembershipFactory.withdrawProtocolFees, (paymentToken));
        } else {
            uint256 tokenId = tier.tokenOf(actor);
            if (tokenId == 0 || tier.balanceOf(actor) == 0) return;
            (uint64 paidSeconds,,) = _lifecycle[tokenId].projected(_timestamp());
            uint256 grossRefund = MembershipModel.fixedRefund(
                paidSeconds, tier.pricePerPeriod(), tier.periodDuration()
            );
            if (grossRefund == 0) return;
            uint256 topUp =
                grossRefund > _book.creatorProceeds ? grossRefund - _book.creatorProceeds : 0;
            if (topUp != 0) paymentToken.mint(creator, topUp);
            frozenAccount = actor;
            caller = creator;
            target = address(tier);
            callData = abi.encodeCall(MembershipTier.refund, (tokenId, grossRefund, topUp));
        }

        paymentToken.setFrozen(frozenAccount, true);
        vm.prank(caller);
        (bool succeeded,) = target.call(callData);
        assertFalse(succeeded);
        paymentToken.setFrozen(frozenAccount, false);
    }

    function warp(uint256 elapsedSeed) external {
        vm.warp(block.timestamp + elapsedSeed % (90 days + 1));
    }

    function modelLifecycle(uint256 tokenId)
        external
        view
        returns (
            uint64 paidSeconds,
            uint64 grantSeconds,
            uint64 checkpoint,
            uint64 expiration,
            bool active,
            bool occupied
        )
    {
        MembershipModel.Lifecycle storage state = _lifecycle[tokenId];
        (paidSeconds, grantSeconds, checkpoint) = state.projected(_timestamp());
        expiration = state.expiration();
        active = state.active(_timestamp());
        occupied = state.occupied;
    }

    function modelShares(uint256 tokenId) external view returns (uint256) {
        return _book.shares[tokenId];
    }

    function modelClaimableReward(uint256 tokenId) external view returns (uint256) {
        return _book.claimableReward(tokenId);
    }

    function modelReferral(uint256 tokenId)
        external
        view
        returns (MembershipTypes.ReferralStatus, address)
    {
        return (_referralStatus[tokenId], _referrer[tokenId]);
    }

    function modelReferralCredit(address referrer) external view returns (uint256) {
        return _book.referralCredits[referrer];
    }

    function modelCreatorProceeds() external view returns (uint256) {
        return _book.creatorProceeds;
    }

    function modelProtocolProceeds() external view returns (uint256) {
        return _book.protocolProceeds;
    }

    function modelPaymentToken() external view returns (address) {
        return _book.paymentToken;
    }

    function modelRewardReserve() external view returns (uint256) {
        return _book.rewardReserve;
    }

    function modelReferralLiability() external view returns (uint256) {
        return _book.totalReferralLiability;
    }

    function modelTotalRewardShares() external view returns (uint256) {
        return _book.totalRewardShares;
    }

    function modelRewardEligible(uint256 tokenId) external view returns (bool) {
        return _book.rewardEligible[tokenId];
    }

    function modelTokenCount() external view returns (uint256) {
        return _book.tokenCount;
    }

    function actorAt(uint256 index) external view returns (address) {
        return _actors[index];
    }

    function recipientFor(uint256 tokenId) external view returns (address) {
        for (uint256 i; i < _actors.length; ++i) {
            if (tier.tokenOf(_actors[i]) == tokenId) return _actors[i];
        }
        return address(0);
    }

    function _applyModelPayment(uint256 tokenId, uint256 gross) private {
        address referrer = _referralStatus[tokenId] == MembershipTypes.ReferralStatus.LockedAddress
            ? _referrer[tokenId]
            : address(0);
        _book.applyPayment(
            address(paymentToken),
            tokenId,
            gross,
            tier.protocolFeeBps(),
            tier.rewardBps(),
            tier.referralBps(),
            referrer
        );
        ghostGrossIn += gross;
        ghostRewardAllocated += Math.mulDiv(gross, tier.rewardBps(), 10_000);
    }

    function _lockModelReferral(uint256 tokenId, address referralChoice) private {
        if (_referralStatus[tokenId] != MembershipTypes.ReferralStatus.Unset) return;
        if (referralChoice == address(0)) {
            _referralStatus[tokenId] = MembershipTypes.ReferralStatus.LockedNone;
        } else {
            _referralStatus[tokenId] = MembershipTypes.ReferralStatus.LockedAddress;
            _referrer[tokenId] = referralChoice;
        }
    }

    function _actor(uint256 seed) private view returns (address) {
        return _actors[seed % _actors.length];
    }

    function _differentActor(address payer, uint256 seed) private view returns (address recipient) {
        uint256 index = seed % _actors.length;
        recipient = _actors[index];
        if (recipient == payer) recipient = _actors[(index + 1) % _actors.length];
    }

    function _referralChoice(uint256 tokenId, uint256 seed) private view returns (address choice) {
        MembershipTypes.ReferralStatus status = _referralStatus[tokenId];
        if (status == MembershipTypes.ReferralStatus.LockedAddress) return _referrer[tokenId];
        if (status == MembershipTypes.ReferralStatus.LockedNone) return address(0);
        return seed % 2 == 0 ? address(0) : _actor(seed >> 1);
    }

    function _timestamp() private view returns (uint64) {
        return uint64(block.timestamp);
    }
}

contract AccountingInvariantTest is StdInvariant, Test {
    AdversarialERC20 private _paymentToken;
    MembershipFactory private _factory;
    MembershipTier private _tier;
    AccountingHandler private _handler;

    function setUp() public {
        _paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        OnchainMediaStoreFactory mediaStoreFactory = new OnchainMediaStoreFactory();
        address creator = makeAddr("invariantCreator");
        address feeRecipient = makeAddr("invariantFeeRecipient");
        _factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(_paymentToken),
            address(mediaStoreFactory),
            address(this),
            feeRecipient
        );

        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(renderer), address(_paymentToken));
        config.maxPrepaidPeriods = 0;
        vm.prank(creator);
        _tier = MembershipTier(_factory.createTier(config));

        address[4] memory actors = [
            makeAddr("accountingActor0"),
            makeAddr("accountingActor1"),
            makeAddr("accountingActor2"),
            makeAddr("accountingActor3")
        ];
        _handler =
            new AccountingHandler(_paymentToken, _factory, _tier, creator, feeRecipient, actors);

        bytes4[] memory selectors = new bytes4[](12);
        selectors[0] = AccountingHandler.purchase.selector;
        selectors[1] = AccountingHandler.gift.selector;
        selectors[2] = AccountingHandler.claimReward.selector;
        selectors[3] = AccountingHandler.claimReferral.selector;
        selectors[4] = AccountingHandler.refund.selector;
        selectors[5] = AccountingHandler.withdrawCreatorProceeds.selector;
        selectors[6] = AccountingHandler.withdrawProtocolFees.selector;
        selectors[7] = AccountingHandler.donateToTier.selector;
        selectors[8] = AccountingHandler.donateToFactory.selector;
        selectors[9] = AccountingHandler.failedExit.selector;
        selectors[10] = AccountingHandler.warp.selector;
        selectors[11] = AccountingHandler.synchronizeExpired.selector;
        targetContract(address(_handler));
        targetSelector(FuzzSelector({addr: address(_handler), selectors: selectors}));
    }

    function invariant_slowPaymentAndLifecycleModelsStayEquivalent() public view {
        assertEq(address(_tier.paymentToken()), address(_paymentToken));
        assertEq(_handler.modelPaymentToken(), address(_paymentToken));
        assertTrue(_factory.isPaymentTokenListed(address(_paymentToken)));
        assertEq(_tier.creatorProceeds(), _handler.modelCreatorProceeds());
        assertEq(_paymentToken.balanceOf(address(_factory)), _handler.modelProtocolProceeds());
        assertEq(_tier.rewardReserve(), _handler.modelRewardReserve());
        assertEq(_tier.totalReferralLiability(), _handler.modelReferralLiability());
        assertEq(_tier.totalRewardShares(), _handler.modelTotalRewardShares());

        uint256 totalMinted = _handler.modelTokenCount();
        assertEq(_tier.totalMinted(), totalMinted);
        uint256 modeledOccupancy;
        for (uint256 tokenId = 1; tokenId <= totalMinted; ++tokenId) {
            if (_assertTokenModel(tokenId)) ++modeledOccupancy;
        }
        assertEq(_tier.occupiedSupply(), modeledOccupancy);

        for (uint256 i; i < 4; ++i) {
            address currentActor = _handler.actorAt(i);
            assertEq(
                _tier.claimableReferral(currentActor), _handler.modelReferralCredit(currentActor)
            );
        }
    }

    function _assertTokenModel(uint256 tokenId) private view returns (bool modelOccupied) {
        assertEq(_tier.sharesOf(tokenId), _handler.modelShares(tokenId));
        assertEq(_tier.rewardEligible(tokenId), _handler.modelRewardEligible(tokenId));
        assertEq(_tier.claimableReward(tokenId), _handler.modelClaimableReward(tokenId));

        modelOccupied = _assertTokenLifecycle(tokenId);
        _assertTokenReferral(tokenId);
    }

    function _assertTokenLifecycle(uint256 tokenId) private view returns (bool modelOccupied) {
        (
            uint64 modelPaid,
            uint64 modelGrant,
            uint64 modelCheckpoint,
            uint64 modelExpiration,
            bool modelActive,
            bool occupied
        ) = _handler.modelLifecycle(tokenId);
        (uint64 paidSeconds, uint64 grantSeconds, uint64 checkpoint) = _tier.timeBalances(tokenId);
        assertEq(paidSeconds, modelPaid);
        assertEq(grantSeconds, modelGrant);
        assertEq(checkpoint, modelCheckpoint);
        address recipient = _handler.recipientFor(tokenId);
        assertTrue(recipient != address(0));
        if (_tier.balanceOf(recipient) != 0) {
            assertEq(_tier.expiresAt(tokenId), modelExpiration);
        }
        assertEq(_tier.isActiveToken(tokenId), modelActive);
        assertEq(_tier.isOccupied(tokenId), occupied);
        return occupied;
    }

    function _assertTokenReferral(uint256 tokenId) private view {
        (MembershipTypes.ReferralStatus actualStatus, address actualReferrer) =
            _tier.referralOf(tokenId);
        (MembershipTypes.ReferralStatus modelStatus, address modelReferrer) =
            _handler.modelReferral(tokenId);
        assertEq(uint256(actualStatus), uint256(modelStatus));
        assertEq(actualReferrer, modelReferrer);
    }

    function invariant_accountingConservationAndProtectedLiabilities() public view {
        uint256 tierBalance = _paymentToken.balanceOf(address(_tier));
        uint256 factoryBalance = _paymentToken.balanceOf(address(_factory));
        uint256 liabilities =
            _tier.creatorProceeds() + _tier.rewardReserve() + _tier.totalReferralLiability();
        assertGe(tierBalance, liabilities);

        uint256 inflows =
            _handler.ghostGrossIn() + _handler.ghostOwnerTopUps() + _handler.ghostSurplusIn();
        uint256 accounted = tierBalance + factoryBalance + _handler.ghostCreatorWithdrawn()
            + _handler.ghostRewardClaimed() + _handler.ghostReferralClaimed()
            + _handler.ghostRefunded() + _handler.ghostProtocolWithdrawn();
        assertEq(accounted, inflows);

        assertEq(
            _handler.ghostRewardClaimed() + _tier.rewardReserve(), _handler.ghostRewardAllocated()
        );
    }
}
