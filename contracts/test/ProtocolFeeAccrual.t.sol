// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {MembershipModel} from "./models/MembershipModel.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

contract ProtocolFeeAccrualTest is Test {
    MockUSDG private asset;
    MembershipFactory private factory;
    OnchainMetadataRenderer private renderer;
    uint256 private salt;
    uint64 private constant PERIOD = 100;

    function setUp() public {
        vm.warp(1000);
        asset = new MockUSDG();
        MockUSDG protocolToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        SyntheticPonsBinding.bind(address(protocolToken));
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(asset),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(protocolToken)
        );
        asset.mint(address(this), 1e30);
    }

    function test_stoppedCollectorProjectsTwelveNineThreeZeroThenReleases() public {
        MembershipTier tier = _tier(1000, 10);
        uint256 id = tier.purchase(12, address(0));
        vm.warp(1300);
        _state(tier, id, 12, 9, 3, 0, 0);
        _accrue(tier, id);
        _state(tier, id, 12, 9, 0, 3, 0);
        assertEq(tier.releaseProtocolFees(), 3);
        _state(tier, id, 9, 9, 0, 0, 3);
        assertEq(
            ProtocolBuybackVault(payable(factory.buybackVault()))
            .inventory(address(asset), BuybackTypes.SourceBucket.Membership)
            .available,
            3
        );
        assertEq(tier.releaseProtocolFees(), 0);
        (uint256 gross, uint256 protocol, uint256 creator, uint256 topup) =
            tier.previewRefundComponents(id);
        assertEq(gross, 90);
        assertEq(protocol, 9);
        assertEq(creator, 81);
        assertEq(topup, 0);
    }

    function test_eventsPreserveZeroFeeIntervalsAndCanceledGenerationAttribution() public {
        MembershipTier tier = _tier(10_000, 0);
        vm.recordLogs();
        tier.contribute(0, address(0));
        tier.contribute(100, address(0));
        vm.warp(1150);
        _accrue(tier, 1);
        tier.refund(1, 50, 0);
        tier.contribute(80, address(0));
        vm.warp(1200);
        _accrue(tier, 1);
        assertEq(tier.releaseProtocolFees(), 90);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 allocations;
        uint256 accruals;
        uint256 releases;
        for (uint256 i; i < logs.length; ++i) {
            Vm.Log memory entry = logs[i];
            if (entry.emitter != address(tier)) continue;
            if (
                entry.topics[0]
                    == keccak256(
                        "ProtocolFeeAllocated(uint256,uint256,uint256,address,uint256,uint256,uint256)"
                    )
            ) {
                assertEq(uint256(entry.topics[1]), 1);
                assertEq(uint256(entry.topics[2]), allocations == 2 ? 1 : 0);
                (uint256 index, address paymentAsset, uint256 fee, uint256 start, uint256 end) =
                    abi.decode(entry.data, (uint256, address, uint256, uint256, uint256));
                assertEq(paymentAsset, address(asset));
                assertEq(index, allocations == 1 ? 1 : 0);
                assertEq(fee, allocations == 0 ? 0 : allocations == 1 ? 100 : 80);
                assertEq(start, allocations == 1 ? 100 : 0);
                assertEq(end, allocations == 1 ? 200 : 100);
                ++allocations;
            } else if (
                entry.topics[0] == keccak256("ProtocolFeesAccrued(uint256,uint256,uint256,uint256)")
            ) {
                assertEq(uint256(entry.topics[1]), 1);
                assertEq(uint256(entry.topics[2]), accruals);
                (uint256 amount, uint256 cumulative) = abi.decode(entry.data, (uint256, uint256));
                assertEq(amount, accruals == 0 ? 50 : 40);
                assertEq(cumulative, accruals == 0 ? 50 : 90);
                ++accruals;
            } else if (
                entry.topics[0] == keccak256("ProtocolFeesReleased(address,address,uint256)")
            ) {
                assertEq(address(uint160(uint256(entry.topics[1]))), factory.buybackVault());
                assertEq(address(uint160(uint256(entry.topics[2]))), address(asset));
                assertEq(abi.decode(entry.data, (uint256)), 90);
                ++releases;
            }
        }
        assertEq(allocations, 3);
        assertEq(accruals, 2);
        assertEq(releases, 1);
    }

    function test_fullAllocationRefundAfterReleaseNeedsNoTopupAndClosesGeneration() public {
        MembershipTier tier = _tier(10_000, 10);
        uint256 id = tier.purchase(12, address(0));
        vm.warp(1350);
        _accrue(tier, id);
        assertEq(tier.releaseProtocolFees(), 35);
        (uint256 gross, uint256 topup) = tier.refund(id, 85, 0);
        assertEq(gross, 85);
        assertEq(topup, 0);
        assertEq(tier.protocolFeeHoldings(), 0);
        assertEq(tier.protocolFeeState(id).generation, 1);
        assertEq(tier.totalProtocolFeeRefunded(), 85);
        tier.purchase(1, address(0));
        vm.warp(1400);
        _state(tier, id, 10, 5, 5, 0, 35);
    }

    function testFuzz_fractionalEntitlementIsIndependentOfCheckpointFrequency(
        uint128 gross,
        uint16 rate,
        uint8 elapsed
    ) public {
        gross = uint128(bound(gross, 0, 1e25));
        rate = uint16(bound(rate, 100, 10_000));
        uint256 secondsUsed = bound(elapsed, 0, PERIOD);
        MembershipTier frequent = _tier(rate, 0);
        MembershipTier deferred = _tier(rate, 0);
        uint256 id = frequent.contribute(gross, address(0));
        deferred.contribute(gross, address(0));
        MembershipModel.FeeLot[] memory lots = new MembershipModel.FeeLot[](1);
        lots[0] = MembershipModel.FeeLot(gross, uint256(gross) * rate / 10_000, PERIOD);
        for (uint256 s = 1; s <= secondsUsed; ++s) {
            vm.warp(1000 + s);
            _accrue(frequent, id);
        }
        (, uint256 expected,) = MembershipModel.feeEntitlement(lots, secondsUsed);
        assertEq(frequent.protocolFeeState(id).earned, expected);
        assertEq(deferred.protocolFeeState(id).earned, expected);
        _accrue(deferred, id);
        assertEq(frequent.releaseProtocolFees(), expected);
        assertEq(deferred.releaseProtocolFees(), expected);
    }

    function test_grantsAndZeroGrossPaidGapsCannotAccelerateLaterFees() public {
        MembershipTier tier = _tier(10_000, 0);
        uint256 id = tier.grantTime(address(this), 1);
        vm.warp(1050);
        tier.contribute(0, address(0));
        tier.contribute(100, address(0));
        vm.warp(1150);
        assertEq(tier.protocolFeeState(id).earned, 0);
        vm.warp(1200);
        assertEq(tier.protocolFeeState(id).earned, 50);
        vm.warp(1350);
        _accrue(tier, id);
        assertEq(tier.releaseProtocolFees(), 100);
        assertEq(tier.protocolFeeState(id).consumedPaid, 200);
    }

    function test_cancellationRoundingIsAttributedOnceAndNotPaidTimeEarnings() public {
        MembershipTier tier = _tier(10_000, 1);
        uint256 id = tier.purchase(1, address(0));
        vm.warp(1050);
        tier.refund(id, 0, 0);
        assertEq(tier.totalProtocolFeeCancellationRounding(), 1);
        assertEq(tier.protocolFeeEarnedHeld(), 1);
        assertEq(tier.protocolFeeState(id).earned, 0);
        assertEq(tier.protocolFeeState(id).uncheckpointedEarned, 0);
        vm.warp(2000);
        _accrue(tier, id);
        assertEq(tier.releaseProtocolFees(), 1);
        assertEq(tier.releaseProtocolFees(), 0);
    }

    function test_releaseAndRefundOrderProduceIdenticalFunding() public {
        MembershipTier a = _tier(1000, 10);
        MembershipTier b = _tier(1000, 10);
        a.purchase(12, address(0));
        b.purchase(12, address(0));
        vm.warp(1350);
        _accrue(a, 1);
        a.releaseProtocolFees();
        a.refund(1, 85, 0);
        b.refund(1, 85, 0);
        b.releaseProtocolFees();
        assertEq(a.totalProtocolFeeRefunded(), b.totalProtocolFeeRefunded());
        assertEq(a.totalProtocolFeeReleased(), b.totalProtocolFeeReleased());
        assertEq(a.creatorProceeds(), b.creatorProceeds());
    }

    function test_batchesAndPagesRejectUnboundedAndUnknownInputs() public {
        MembershipTier tier = _tier(1000, 10);
        tier.purchase(1, address(0));
        uint256[] memory ids = new uint256[](0);
        vm.expectRevert();
        tier.accrueProtocolFees(ids);
        ids = new uint256[](101);
        vm.expectRevert();
        tier.accrueProtocolFees(ids);
        ids = new uint256[](1);
        ids[0] = 2;
        vm.expectRevert();
        tier.accrueProtocolFees(ids);
        vm.expectRevert();
        tier.protocolFeeLots(1, 0, 101);
        assertEq(tier.protocolFeeLots(1, 0, 100).length, 1);
    }

    function test_expiredAndBurnedCredentialsRemainCollectible() public {
        MembershipTier tier = _tier(1000, 10);
        uint256 id = tier.purchase(1, address(0));
        vm.warp(1100);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(tier.synchronizeExpiredMemberships(ids), 1);
        assertEq(tier.balanceOf(address(this)), 0);
        vm.prank(address(0xBEEF));
        tier.accrueProtocolFees(ids);
        vm.prank(address(0xBEEF));
        assertEq(tier.releaseProtocolFees(), 1);
        assertEq(tier.protocolFeeState(id).earned, 1);
    }

    function test_maximumBatchAndConstantWorkRelease() public {
        MembershipTier tier = _tier(1000, 10);
        uint256[] memory ids = new uint256[](100);
        for (uint160 i; i < ids.length; ++i) {
            ids[i] = tier.gift(
                address(uint160(0x1000) + i), 1, MembershipTypes.ReferralStatus.Unset, address(0)
            );
        }
        vm.warp(1100);
        vm.cool(address(tier));
        uint256 before = gasleft();
        tier.accrueProtocolFees(ids);
        uint256 batchGas = before - gasleft();
        assertLt(batchGas, 15_000_000);
        assertEq(tier.protocolFeeEarnedHeld(), 100);
        before = gasleft();
        assertEq(tier.releaseProtocolFees(), 100);
        uint256 releaseGas = before - gasleft();
        assertLt(releaseGas, 200_000);
        tier.accrueProtocolFees(ids);
        assertEq(tier.releaseProtocolFees(), 0);
        emit log_named_uint("100-member accrual gas", batchGas);
        emit log_named_uint("aggregate release gas", releaseGas);
    }

    function testFuzz_varyingLotsAndRefundFundingMatchSlowOracle(
        uint96[8] memory amounts,
        uint16 rate,
        uint16 elapsed
    ) public {
        rate = uint16(bound(rate, 100, 10_000));
        MembershipTier tier = _tier(rate, 0);
        MembershipModel.FeeLot[] memory lots = new MembershipModel.FeeLot[](8);
        for (uint256 i; i < lots.length; ++i) {
            uint256 gross = bound(amounts[i], 0, 1e20);
            tier.contribute(gross, address(0));
            lots[i] = MembershipModel.FeeLot(gross, gross * rate / 10_000, PERIOD);
        }
        uint256 consumed = bound(elapsed, 0, 8 * PERIOD);
        vm.warp(1000 + consumed);
        (uint256 allocated, uint256 earned, uint256 grossRefund) =
            MembershipModel.feeEntitlement(lots, consumed);
        (uint256 protocol, uint256 creator, uint256 topup, uint256 rounding) =
            MembershipModel.refundFunding(allocated - earned, grossRefund, tier.creatorProceeds());
        assertLe(rounding, 1);
        (uint256 actualGross, uint256 actualProtocol, uint256 actualCreator, uint256 actualTopup) =
            tier.previewRefundComponents(1);
        assertEq(actualGross, grossRefund);
        assertEq(actualProtocol, protocol);
        assertEq(actualCreator, creator);
        assertEq(actualTopup, topup);
        _state(tier, 1, allocated, allocated - earned, earned, 0, 0);
        tier.refund(1, grossRefund, topup);
        assertEq(tier.releaseProtocolFees(), earned + rounding);
        assertEq(tier.totalProtocolFeeRefunded(), protocol);
        assertEq(tier.protocolFeeHoldings(), 0);
    }

    function test_largeHistoriesKeepProjectionLogarithmicAndResetBounded() public {
        MembershipTier tier = _tier(10_000, 0);
        tier.contribute(100, address(0));
        vm.warp(1050);
        vm.cool(address(tier));
        uint256 before = gasleft();
        tier.protocolFeeState(1);
        uint256 oneLotProjection = before - gasleft();
        for (uint256 i; i < 511; ++i) {
            tier.contribute(100, address(0));
        }
        vm.cool(address(tier));
        before = gasleft();
        tier.protocolFeeState(1);
        uint256 manyLotProjection = before - gasleft();
        assertLt(manyLotProjection, oneLotProjection + 50_000);
        vm.cool(address(tier));
        before = gasleft();
        tier.refund(1, type(uint256).max, 0);
        uint256 refundGas = before - gasleft();
        assertLt(refundGas, 350_000);
        before = gasleft();
        tier.contribute(100, address(0));
        uint256 rejoinGas = before - gasleft();
        assertLt(rejoinGas, 450_000);
        assertEq(tier.protocolFeeLots(1, 0, 100).length, 1);
        emit log_named_uint("one-lot projection gas", oneLotProjection);
        emit log_named_uint("512-lot projection gas", manyLotProjection);
        emit log_named_uint("512-lot refund gas", refundGas);
        emit log_named_uint("rejoin gas", rejoinGas);
    }

    function _tier(uint16 rate, uint256 price) private returns (MembershipTier tier) {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), address(renderer), address(asset));
        config.tierSalt = bytes32(++salt);
        config.protocolFeeBps = rate;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.periodDuration = PERIOD;
        config.pricePerPeriod = price;
        config.maxPrepaidPeriods = 0;
        tier = MembershipTier(factory.createTier(config));
        asset.approve(address(tier), type(uint256).max);
    }

    function _accrue(MembershipTier tier, uint256 id) private {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        tier.accrueProtocolFees(ids);
    }

    function _state(
        MembershipTier tier,
        uint256 id,
        uint256 held,
        uint256 unearned,
        uint256 pending,
        uint256 earnedHeld,
        uint256 released
    ) private view {
        MembershipTypes.ProtocolFeeState memory state = tier.protocolFeeState(id);
        assertEq(tier.protocolFeeHoldings(), held);
        assertEq(state.unearned, unearned);
        assertEq(state.uncheckpointedEarned, pending);
        assertEq(tier.protocolFeeEarnedHeld(), earnedHeld);
        assertEq(tier.totalProtocolFeeReleased(), released);
        assertEq(held, unearned + pending + earnedHeld);
        assertEq(
            tier.totalProtocolFeeAllocated(), held + released + tier.totalProtocolFeeRefunded()
        );
    }
}
