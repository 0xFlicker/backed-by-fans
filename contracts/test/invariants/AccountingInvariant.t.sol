// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "../helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "../helpers/SyntheticPonsBinding.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../../src/MembershipFactory.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {RewardCurve} from "../../src/libraries/RewardCurve.sol";
import {OnchainMediaStoreFactory} from "../../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {AdversarialERC20} from "../mocks/AdversarialERC20.sol";
import {VestingLedgerHarness} from "../mocks/VestingLedgerHarness.sol";
import {MembershipModel} from "../models/MembershipModel.sol";

contract AccountingHandler is Test {
    using MembershipModel for MembershipModel.Lifecycle;
    using MembershipModel for MembershipModel.FundingBook;
    uint256 private constant Q = 1 << 128;
    AdversarialERC20 public immutable paymentToken;
    MembershipFactory public immutable factory;
    MembershipTier public immutable tier;
    address public immutable creator;
    address public immutable feeRecipient;
    address[4] private _actors;
    MembershipModel.FundingBook private _funding;
    mapping(uint256 => MembershipModel.Lifecycle) private _lifecycle;
    mapping(uint256 => uint256) private _shares;
    mapping(uint256 => bool) private _eligible;
    mapping(uint256 => MembershipTypes.ReferralStatus) private _referralStatus;
    mapping(uint256 => address) private _referrer;
    mapping(address => uint256) private _referralPaid;
    uint256 public ghostGrossIn;
    uint256 public ghostSurplusIn;
    uint256 public ghostRefunded;
    uint256 public modelFactoryDonations;
    uint256[4] public paid;

    constructor(
        AdversarialERC20 token_,
        MembershipFactory factory_,
        MembershipTier tier_,
        address creator_,
        address feeRecipient_,
        address[4] memory actors_
    ) {
        paymentToken = token_;
        factory = factory_;
        tier = tier_;
        creator = creator_;
        feeRecipient = feeRecipient_;
        _actors = actors_;
        _funding.accountedThrough = uint64(block.timestamp);
        for (uint256 i; i < actors_.length; ++i) {
            vm.prank(actors_[i]);
            token_.approve(address(tier_), type(uint256).max);
        }
    }

    function purchase(uint256 actorSeed, uint256 periodsSeed, uint256 referralSeed) external {
        address actor = _actor(actorSeed);
        uint64 periods = SafeCast.toUint64(1 + periodsSeed % 2);
        uint256 gross = tier.pricePerPeriod() * periods;
        paymentToken.mint(actor, gross);
        address choice = _choice(tier.tokenOf(actor), referralSeed);
        _settle();
        vm.prank(actor);
        uint256 id = tier.purchase(periods, choice);
        if (_referralStatus[id] == MembershipTypes.ReferralStatus.Unset) {
            _referralStatus[id] = choice == address(0)
                ? MembershipTypes.ReferralStatus.LockedNone
                : MembershipTypes.ReferralStatus.LockedAddress;
            _referrer[id] = choice;
        }
        _payment(id, gross, uint64(periods * tier.periodDuration()));
    }

    function gift(uint256 payerSeed, uint256 recipientSeed, uint256 periodsSeed) external {
        address payer = _actor(payerSeed);
        address recipient = _actor(recipientSeed);
        if (recipient == payer) recipient = _actors[(recipientSeed % 4 + 1) % 4];
        uint64 periods = SafeCast.toUint64(1 + periodsSeed % 2);
        uint256 gross = tier.pricePerPeriod() * periods;
        paymentToken.mint(payer, gross);
        uint256 oldId = tier.tokenOf(recipient);
        _settle();
        vm.prank(payer);
        uint256 id = tier.gift(recipient, periods, _referralStatus[oldId], _referrer[oldId]);
        _payment(id, gross, uint64(periods * tier.periodDuration()));
    }

    function _payment(uint256 id, uint256 gross, uint64 duration) private {
        (uint64 remaining,,) = _lifecycle[id].projected(uint64(block.timestamp));
        _funding.fund(
            id,
            gross,
            uint64(block.timestamp) + remaining,
            duration,
            tier.protocolFeeBps(),
            tier.rewardBps(),
            tier.referralBps(),
            _referrer[id]
        );
        _lifecycle[id].addPaidTime(uint64(block.timestamp), duration);
        _shares[id] += gross; // This invariant fixture publishes canonical None.
        _eligible[id] = true;
        ghostGrossIn += gross;
    }

    function claimReward(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 id = tier.tokenOf(actor);
        if (id == 0) return;
        MembershipTypes.EarnedBalances memory before = tier.previewAccounting(id, actor, 0).settled;
        vm.prank(actor);
        uint256 claimed = tier.claimReward(id);
        assertEq(claimed, before.member);
        assertEq(
            tier.previewAccounting(id, actor, 0).settled.fractionalScaled[1],
            before.fractionalScaled[1]
        );
        paid[1] += claimed;
    }

    function claimReferral(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 expected = _funding.referralEarnedScaled[actor] / Q - _referralPaid[actor];
        vm.prank(actor);
        uint256 claimed = tier.claimReferral();
        assertEq(claimed, expected);
        _referralPaid[actor] += claimed;
        paid[2] += claimed;
    }

    function withdrawCreatorProceeds() external {
        uint256 expected = _funding.earnedScaled[0] / Q - paid[0];
        vm.prank(creator);
        uint256 withdrawn = tier.withdrawCreatorProceeds();
        assertEq(withdrawn, expected);
        paid[0] += withdrawn;
    }

    function claimAll(uint256 actorSeed, bool batch) external {
        address actor = actorSeed % 5 == 4 ? creator : _actor(actorSeed);
        _settle();
        uint256 id = tier.tokenOf(actor);
        MembershipTypes.EarnedBalances memory before = tier.previewAccounting(id, actor, 0).settled;
        MembershipTypes.ClaimResult memory result;
        vm.prank(actor);
        if (batch) {
            address[] memory targets = new address[](1);
            targets[0] = address(tier);
            result = factory.claimEverything(targets)[0];
        } else {
            result = tier.claimAll();
        }
        assertEq(result.creator, actor == creator ? before.creator : 0);
        assertEq(result.reward, before.member);
        assertEq(result.referral, before.referral);
        assertEq(result.processedSteps, 0);
        MembershipTypes.EarnedBalances memory after_ = tier.previewAccounting(id, actor, 0).settled;
        assertEq(after_.fractionalScaled[1], before.fractionalScaled[1]);
        assertEq(after_.fractionalScaled[2], before.fractionalScaled[2]);
        paid[0] += result.creator;
        paid[1] += result.reward;
        paid[2] += result.referral;
        _referralPaid[actor] += result.referral;
    }

    function release() external {
        uint256 expected = _funding.earnedScaled[3] / Q - paid[3];
        assertEq(tier.releaseProtocolFees(), expected);
        paid[3] += expected;
    }

    function refund(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 id = tier.tokenOf(actor);
        if (id == 0 || tier.balanceOf(actor) == 0) return;
        _settle();
        uint256 expected = _funding.unusedGross(id, uint64(block.timestamp));
        assertEq(tier.previewRefund(id).grossRefund, expected);
        vm.prank(creator);
        assertEq(tier.refund(id, expected), expected);
        assertEq(_funding.cancel(id), expected);
        _lifecycle[id].refundTime(uint64(block.timestamp));
        _eligible[id] = false;
        ghostRefunded += expected;
    }

    function synchronizeExpired(uint256 actorSeed) external {
        uint256 id = tier.tokenOf(_actor(actorSeed));
        if (id == 0) return;
        _settle();
        bool expected = _lifecycle[id].synchronize(uint64(block.timestamp));
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(creator);
        assertEq(tier.synchronizeExpiredMemberships(ids), expected ? 1 : 0);
        if (expected) _eligible[id] = false;
    }

    function rejectProtocolWithdrawal() external {
        vm.prank(feeRecipient);
        (bool success,) = address(factory)
            .call(abi.encodeWithSignature("withdrawProtocolFees(address)", address(paymentToken)));
        assertFalse(success);
    }

    function advance(uint256) external {
        _settle();
    }

    function _settle() private {
        for (uint256 calls;; ++calls) {
            assertLt(calls, 500, "accounting must make bounded progress");
            (uint256 steps,, bool complete,) = tier.processAccounting(25);
            if (complete) break;
            assertGt(steps, 0);
        }
        _funding.recognize(uint64(block.timestamp));
    }

    /// @dev Between boundaries, the observed four-purpose derivative must equal
    /// the sum of independently scanned active lot rates.
    function tickActiveRates() external {
        _settle();
        MembershipTypes.AccountingStatus memory status = tier.accountingStatus();
        // Compare the controlled test clock with the next scheduler boundary.
        // forge-lint: disable-next-line(block-timestamp)
        if (status.nextBoundary != 0 && status.nextBoundary <= block.timestamp + 1) return;
        uint256[4] memory rates = _funding.currentRates();
        uint256[4] memory before = _funding.earnedScaled;
        if (rates[1] != 0) assertGt(tier.totalRewardShares(), 0);
        vm.warp(block.timestamp + 1);
        _settle();
        for (uint256 p; p < 4; ++p) {
            assertEq(_funding.earnedScaled[p] - before[p], rates[p]);
        }
        assertModel();
    }

    function warp(uint256 seed) external {
        vm.warp(block.timestamp + seed % (90 days + 1));
    }

    function donateToTier(uint256 seed) external {
        uint256 amount = seed % 10_000_001;
        paymentToken.mint(_actors[0], amount);
        vm.prank(_actors[0]);
        assertTrue(paymentToken.transfer(address(tier), amount));
        ghostSurplusIn += amount;
    }

    function donateToFactory(uint256 seed) external {
        uint256 amount = seed % 10_000_001;
        paymentToken.mint(_actors[1], amount);
        vm.prank(_actors[1]);
        assertTrue(paymentToken.transfer(address(factory), amount));
        modelFactoryDonations += amount;
        ghostSurplusIn += amount;
    }

    function failedExit(uint256 actorSeed, uint256 exitSeed) external {
        address actor = _actor(actorSeed);
        uint256 id = tier.tokenOf(actor);
        uint256 exit = exitSeed % 5;
        address frozen;
        address caller = actor;
        bytes memory data;
        if (exit == 0) {
            if (id == 0 || tier.claimableReward(id) == 0) return;
            frozen = actor;
            data = abi.encodeCall(MembershipTier.claimReward, (id));
        } else if (exit == 1) {
            if (tier.claimableReferral(actor) == 0) return;
            frozen = actor;
            data = abi.encodeCall(MembershipTier.claimReferral, ());
        } else if (exit == 2) {
            if (tier.creatorProceeds() == 0) return;
            frozen = creator;
            caller = creator;
            data = abi.encodeCall(MembershipTier.withdrawCreatorProceeds, ());
        } else if (exit == 3) {
            if (tier.protocolFeeEarnedHeld() == 0) return;
            frozen = tier.buybackVault();
            data = abi.encodeCall(MembershipTier.releaseProtocolFees, ());
        } else {
            if (
                id == 0 || tier.balanceOf(actor) == 0
                    // The model uses the same controlled test clock as the tier.
                    // forge-lint: disable-next-line(block-timestamp)
                    || _funding.unusedGross(id, uint64(block.timestamp)) == 0
            ) return;
            frozen = actor;
            caller = creator;
            data = abi.encodeCall(MembershipTier.refund, (id, type(uint256).max));
        }
        bytes32 before = _fingerprint();
        paymentToken.setFrozen(frozen, true);
        vm.prank(caller);
        (bool success,) = address(tier).call(data);
        assertFalse(success);
        paymentToken.setFrozen(frozen, false);
        assertEq(_fingerprint(), before);
    }

    function _fingerprint() private view returns (bytes32 hash) {
        hash = keccak256(
            abi.encode(
                tier.reserveState(),
                tier.previewAccounting(0, address(0), 0).settled,
                tier.totalRewardShares(),
                tier.occupiedSupply(),
                paymentToken.balanceOf(address(tier))
            )
        );
        for (uint256 i; i < 4; ++i) {
            uint256 id = tier.tokenOf(_actors[i]);
            hash = keccak256(
                abi.encode(
                    hash,
                    tier.previewAccounting(id, _actors[i], 0).settled,
                    paymentToken.balanceOf(_actors[i])
                )
            );
            if (id != 0) {
                hash = keccak256(
                    abi.encode(
                        hash,
                        tier.allocationState(id),
                        tier.isActiveToken(id),
                        tier.rewardEligible(id)
                    )
                );
            }
        }
    }

    function assertModel() public view {
        MembershipTypes.ReserveState memory reserves = tier.reserveState();
        uint256 memberCredit;
        uint256 referralCredit;
        uint256 eligibleSum;
        uint256 occupancy;
        for (uint256 i; i < 4; ++i) {
            address actor = _actors[i];
            uint256 id = tier.tokenOf(actor);
            MembershipTypes.EarnedBalances memory balance =
            tier.previewAccounting(id, actor, 0).settled;
            referralCredit += balance.referral * Q + balance.fractionalScaled[2];
            assertEq(
                balance.referral * Q + balance.fractionalScaled[2],
                _funding.referralEarnedScaled[actor] - _referralPaid[actor] * Q
            );
            if (id == 0) continue;
            memberCredit += balance.member * Q + balance.fractionalScaled[1];
            assertEq(tier.sharesOf(id), _shares[id]);
            assertEq(tier.rewardEligible(id), _eligible[id]);
            if (_eligible[id]) eligibleSum += _shares[id];
            (uint64 paidTime, uint64 grantTime, uint64 checkpoint) =
                _lifecycle[id].projected(uint64(block.timestamp));
            (uint64 actualPaid, uint64 actualGrant, uint64 actualCheckpoint) = tier.timeBalances(id);
            assertEq(actualPaid, paidTime);
            assertEq(actualGrant, grantTime);
            assertEq(actualCheckpoint, checkpoint);
            assertEq(tier.isActiveToken(id), _lifecycle[id].active(uint64(block.timestamp)));
            assertEq(tier.isOccupied(id), _lifecycle[id].occupied);
            if (_lifecycle[id].occupied) ++occupancy;
            (MembershipTypes.ReferralStatus referralStatus, address referrer) = tier.referralOf(id);
            assertEq(uint256(referralStatus), uint256(_referralStatus[id]));
            assertEq(referrer, _referrer[id]);
            assertEq(tier.allocationState(id).generation, _funding.generation[id]);
        }
        assertEq(tier.totalRewardShares(), eligibleSum);
        assertEq(tier.occupiedSupply(), occupancy);
        assertEq(tier.lifetimeGross(), ghostGrossIn);
        assertEq(tier.totalMinted(), _funding.tokenCount);
        assertEq(
            reserves.unassignedMemberScaled, 0, "public reward funding always has eligible support"
        );
        assertEq(reserves.status.accountedThrough, _funding.accountedThrough);
        MembershipTypes.EarnedBalances memory global =
        tier.previewAccounting(0, address(0), 0).settled;
        uint256[4] memory remainingEarned = [
            global.creator * Q + global.fractionalScaled[0],
            memberCredit + reserves.indexCarryScaled + reserves.distributionDustScaled,
            referralCredit,
            global.protocol * Q + global.fractionalScaled[3]
        ];
        for (uint256 p; p < 4; ++p) {
            assertEq(reserves.unearnedScaled[p], _funding.unearnedScaled[p]);
            assertEq(reserves.cancellationScaled[p], _funding.cancellationScaled[p]);
            assertEq(remainingEarned[p] + paid[p] * Q, _funding.earnedScaled[p]);
            assertEq(
                _funding.allocatedScaled[p],
                _funding.unearnedScaled[p] + _funding.earnedScaled[p]
                    + _funding.cancellationScaled[p] + _funding.refundedScaled[p]
            );
        }
        assertEq(paymentToken.balanceOf(address(factory)), modelFactoryDonations);
    }

    function assertCustody() external view {
        uint256 balance = paymentToken.balanceOf(address(tier));
        assertEq(balance, tier.totalProtectedLiability() + ghostSurplusIn - modelFactoryDonations);
        uint256 outflows = paid[0] + paid[1] + paid[2] + paid[3] + ghostRefunded;
        assertEq(
            balance + paymentToken.balanceOf(address(factory)) + outflows,
            ghostGrossIn + ghostSurplusIn
        );
        assertEq(paymentToken.balanceOf(tier.buybackVault()), paid[3]);
    }

    function _actor(uint256 seed) private view returns (address) {
        return _actors[seed % 4];
    }

    function _choice(uint256 id, uint256 seed) private view returns (address) {
        if (_referralStatus[id] == MembershipTypes.ReferralStatus.LockedAddress) {
            return _referrer[id];
        }
        if (_referralStatus[id] == MembershipTypes.ReferralStatus.LockedNone) return address(0);
        return seed % 2 == 0 ? address(0) : _actor(seed >> 1);
    }
}

contract AccountingInvariantTest is StdInvariant, Test {
    AdversarialERC20 private _paymentToken;
    MembershipFactory private _factory;
    MembershipTier private _tier;
    AccountingHandler private _handler;

    function setUp() public {
        new LinkedVestingFixture().install();
        _paymentToken = new AdversarialERC20();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        OnchainMediaStoreFactory mediaStoreFactory = new OnchainMediaStoreFactory();
        address creator = makeAddr("invariantCreator");
        address feeRecipient = makeAddr("invariantFeeRecipient");
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

        bytes4[] memory selectors = new bytes4[](16);
        selectors[0] = AccountingHandler.purchase.selector;
        selectors[1] = AccountingHandler.gift.selector;
        selectors[2] = AccountingHandler.claimReward.selector;
        selectors[3] = AccountingHandler.claimReferral.selector;
        selectors[4] = AccountingHandler.refund.selector;
        selectors[5] = AccountingHandler.withdrawCreatorProceeds.selector;
        selectors[6] = AccountingHandler.rejectProtocolWithdrawal.selector;
        selectors[7] = AccountingHandler.donateToTier.selector;
        selectors[8] = AccountingHandler.donateToFactory.selector;
        selectors[9] = AccountingHandler.failedExit.selector;
        selectors[10] = AccountingHandler.warp.selector;
        selectors[11] = AccountingHandler.synchronizeExpired.selector;
        selectors[12] = AccountingHandler.advance.selector;
        selectors[13] = AccountingHandler.release.selector;
        selectors[14] = AccountingHandler.tickActiveRates.selector;
        selectors[15] = AccountingHandler.claimAll.selector;
        targetContract(address(_handler));
        targetSelector(FuzzSelector({addr: address(_handler), selectors: selectors}));
    }

    function invariant_slowIntervalsLifecycleAndEligibilityStayEquivalent() public view {
        assertEq(address(_tier.paymentToken()), address(_paymentToken));
        assertTrue(_factory.isPaymentTokenListed(address(_paymentToken)));
        _handler.assertModel();
    }

    function invariant_accountingConservationAndProtectedLiabilities() public view {
        _handler.assertCustody();
    }

    function test_syntheticEmptyVectorProtectsOtherwiseUnreachableMemberFunding() public {
        VestingLedgerHarness ledger = new VestingLedgerHarness(_paymentToken);
        _paymentToken.mint(address(this), 3);
        _paymentToken.approve(address(ledger), 3);
        ledger.fund([uint256(0), 3, 0, 0], 3);
        ledger.injectEmptyEligibleVector();
        vm.warp(block.timestamp + 3);
        ledger.advance();
        assertEq(ledger.unassignedMemberFunding(), 3 * (uint256(1) << 128));
        assertEq(ledger.claim(1), 0);
        assertEq(ledger.reserved(1), 0);
        assertEq(_paymentToken.balanceOf(address(ledger)), 3);
    }

    function test_capacityAndClockCeilingsPreserveExactCashAndCanceledGeneration() public {
        uint256 c = type(uint112).max;
        uint256 q = 1 << 128;
        vm.warp(type(uint64).max - 2);
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), _tier.renderer(), address(_paymentToken)
        );
        config.pricePerPeriod = 0;
        config.periodDuration = 2;
        config.startingBoostBps = 100_000;
        config.earlySupportGross = type(uint112).max;
        config.rewardBps = 1000;
        config.referralBps = 500;
        config.protocolFeeBps = 500;
        MembershipTier bounded = MembershipTier(_factory.createTier(config));
        _paymentToken.mint(address(this), c + 8);
        _paymentToken.approve(address(bounded), type(uint256).max);
        uint256 id = bounded.contribute(c, address(0xCAFE));
        assertEq(bounded.lifetimeGross(), c);
        assertEq(bounded.totalProtectedLiability(), c);
        assertEq(bounded.sharesOf(id), c + c * 9 / 2);
        vm.warp(type(uint64).max - 1);
        bounded.processAccounting(25);
        MembershipTypes.ReserveState memory reserve = bounded.reserveState();
        MembershipTypes.EarnedBalances memory earned =
        bounded.previewAccounting(id, address(0xCAFE), 0).settled;
        uint256 heldScaled =
            (earned.creator + earned.member + earned.referral + earned.protocol) * q;
        for (uint256 i; i < 4; ++i) {
            heldScaled += reserve.unearnedScaled[i] + earned.fractionalScaled[i];
        }
        heldScaled += reserve.indexCarryScaled + reserve.distributionDustScaled
        + reserve.unassignedMemberScaled;
        assertEq(heldScaled, c * q);
        // Donations never alter any protected purpose or replenish lifetime capacity.
        assertTrue(_paymentToken.transfer(address(bounded), 7));
        assertEq(_paymentToken.balanceOf(address(bounded)) - bounded.totalProtectedLiability(), 7);
        uint256 returned = bounded.refund(id, c);
        assertEq(returned, c / 2);
        assertEq(bounded.allocationState(id).generation, 1);
        assertEq(bounded.lifetimeGross(), c);
        vm.expectRevert(RewardCurve.CurveCapacityExceeded.selector);
        bounded.contribute(1, address(0xCAFE));
        assertEq(bounded.allocationState(id).generation, 1);
        uint256 beforeBalance = _paymentToken.balanceOf(address(bounded));
        bounded.claimReward(id);
        bounded.withdrawCreatorProceeds();
        vm.prank(address(0xCAFE));
        bounded.claimReferral();
        bounded.releaseProtocolFees();
        assertLt(_paymentToken.balanceOf(address(bounded)), beforeBalance);
        assertEq(_paymentToken.balanceOf(address(bounded)) - bounded.totalProtectedLiability(), 7);
        vm.warp(type(uint64).max);
        bounded.processAccounting(25);
        assertEq(bounded.accountingStatus().scheduledMembers, 0);
        assertEq(bounded.claimableReferral(address(0xBAD)), 0);
    }
}
