// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {VestingLedger} from "../src/libraries/VestingLedger.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

contract VestedAllocationsTest is Test {
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0x150b7a02;
    }

    MockUSDG private asset;
    MembershipFactory private factory;
    OnchainMetadataRenderer private renderer;
    uint256 private salt;
    uint64 private constant PERIOD = 100;
    uint256 private constant Q = 1 << 128;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        asset = new MockUSDG();
        MockUSDG protocolToken = new MockUSDG();
        renderer = new OnchainMetadataRenderer();
        SyntheticPonsBinding.bind(address(protocolToken));
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(asset),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(protocolToken),
            MembershipTestConfig.tierCode(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(asset))
        );
        asset.mint(address(this), 1e30);
    }

    function test_stoppedCollectorStoresReservesUntilAccountingThenReleasesOnlyEarned() public {
        MembershipTier tier = _tier(1000, 10_000_000);
        uint256 id = tier.createMembership(12, address(0));
        vm.warp(1300);
        assertFalse(tier.accountingStatus().complete);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
        assertEq(tier.allocationState(id).unearnedScaled[3], 12_000_000 * Q);
        assertEq(tier.releaseProtocolFees(), 0);
        tier.processAccounting(25);
        assertEq(tier.allocationState(id).earnedScaled[3], 3_000_000 * Q);
        assertEq(tier.allocationState(id).unearnedScaled[3], 9_000_000 * Q);
        assertEq(tier.releaseProtocolFees(), 3_000_000);
        assertEq(
            ProtocolBuybackVault(payable(factory.buybackVault()))
            .inventory(address(asset), BuybackTypes.SourceBucket.Membership)
            .available,
            3_000_000
        );
        assertEq(tier.releaseProtocolFees(), 0);
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(id);
        assertTrue(quote.complete);
        assertEq(quote.grossRefund, 90_000_000);
        assertEq(quote.fundingScaled[0], 81_000_000 * Q);
        assertEq(quote.fundingScaled[3], 9_000_000 * Q);
        assertEq(tier.totalProtectedLiability(), asset.balanceOf(address(tier)));
    }

    function test_eventsExcludeFreeGapsAndRetainCanceledGenerationAttribution() public {
        MembershipTier tier = _tier(10_000, 0);
        vm.recordLogs();
        tier.createContributionMembership(0, address(0));
        tier.renewContributionMembership(1, 100, address(0));
        vm.warp(1150);
        tier.processAccounting(25);
        assertEq(tier.refund(1, tier.ownerOf(1), 50), 50);
        tier.createContributionMembership(80, address(0));
        vm.warp(1200);
        tier.processAccounting(25);
        // 80 Q / 100 has a fractional per-second remainder until the END.
        assertEq(tier.releaseProtocolFees(), 89);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 allocations;
        uint256 cancellations;
        uint256 releases;
        for (uint256 i; i < logs.length; ++i) {
            Vm.Log memory entry = logs[i];
            if (entry.emitter != address(tier)) continue;
            if (
                entry.topics[0]
                    == keccak256(
                        "FundingLotScheduled(uint256,uint256,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint256,address)"
                    )
            ) {
                assertEq(uint256(entry.topics[1]), allocations + 1);
                assertEq(uint256(entry.topics[2]), 0);
                (
                    uint256 index,
                    uint64 start,
                    uint64 end,
                    uint256 gross,
                    uint256 creator,
                    uint256 member,
                    uint256 referral,
                    uint256 protocol,
                    address referrer
                ) = abi.decode(
                    entry.data,
                    (uint256, uint64, uint64, uint256, uint256, uint256, uint256, uint256, address)
                );
                assertEq(index, 0);
                assertEq(start, allocations == 0 ? 1100 : 1150);
                assertEq(end, allocations == 0 ? 1200 : 1250);
                assertEq(gross, allocations == 0 ? 100 : 80);
                assertEq(protocol, gross);
                assertEq(creator + member + referral, 0);
                assertEq(referrer, address(0));
                ++allocations;
            } else if (
                entry.topics[0]
                    == keccak256("FundingGenerationCanceled(uint256,uint256,uint256[4])")
            ) {
                assertEq(uint256(entry.topics[1]), 1);
                assertEq(uint256(entry.topics[2]), 0);
                uint256[4] memory residual = abi.decode(entry.data, (uint256[4]));
                assertEq(residual[0] + residual[1] + residual[2] + residual[3], 0);
                ++cancellations;
            } else if (
                entry.topics[0] == keccak256("ProtocolFeesReleased(address,address,uint256)")
            ) {
                assertEq(address(uint160(uint256(entry.topics[1]))), factory.buybackVault());
                assertEq(address(uint160(uint256(entry.topics[2]))), address(asset));
                assertEq(abi.decode(entry.data, (uint256)), 89);
                ++releases;
            }
        }
        assertEq(allocations, 2);
        assertEq(cancellations, 1);
        assertEq(releases, 1);
        vm.warp(1250);
        tier.processAccounting(25);
        assertEq(tier.releaseProtocolFees(), 41);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
    }

    function test_fullProtocolAllocationRefundAfterReleaseClosesGeneration() public {
        MembershipTier tier = _tier(10_000, 10);
        uint256 id = tier.createMembership(12, address(0));
        vm.warp(1350);
        tier.processAccounting(25);
        // The scaled per-second rate is rounded down; the END supplies its tail.
        assertEq(tier.releaseProtocolFees(), 34);
        assertEq(tier.refund(id, tier.ownerOf(id), 85), 85);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
        assertEq(tier.allocationState(id).generation, 1);
        assertEq(tier.lifetimeGross(), 120);
        assertEq(tier.reserveState().unearnedScaled[3], 0);
        assertEq(asset.balanceOf(address(tier)), 1);
        assertEq(tier.totalProtectedLiability(), 1);
        uint256 fresh = tier.createMembership(1, address(0));
        assertGt(fresh, id);
        vm.warp(1400);
        tier.processAccounting(25);
        assertEq(tier.allocationState(fresh).earnedScaled[3], 10 * Q / PERIOD * 50);
        assertEq(tier.lifetimeGross(), 130);
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
        uint256 id = frequent.createContributionMembership(gross, address(0));
        deferred.createContributionMembership(gross, address(0));
        for (uint256 s = 1; s <= secondsUsed; ++s) {
            vm.warp(1000 + s);
            frequent.processAccounting(25);
        }
        deferred.processAccounting(25);
        uint256 allocation = uint256(gross) * rate / 10_000;
        uint256 expected =
            secondsUsed == PERIOD ? allocation * Q : allocation * Q / PERIOD * secondsUsed;
        assertEq(frequent.allocationState(id).earnedScaled[3], expected);
        assertEq(deferred.allocationState(id).earnedScaled[3], expected);
        assertEq(frequent.releaseProtocolFees(), expected / Q);
        assertEq(deferred.releaseProtocolFees(), expected / Q);
        assertEq(
            frequent.previewAccounting(id, address(0), address(0), 0).settled.fractionalScaled[3],
            expected % Q
        );
        assertEq(
            deferred.previewAccounting(id, address(0), address(0), 0).settled.fractionalScaled[3],
            expected % Q
        );
    }

    function test_grantsAndZeroGrossPaidGapsCannotAccelerateLaterFunding() public {
        MembershipTier tier = _tier(10_000, 0);
        uint256 id = tier.grantMembership(address(this), 1);
        vm.warp(1050);
        tier.renewContributionMembership(id, 0, address(0));
        tier.renewContributionMembership(id, 100, address(0));
        vm.warp(1150);
        tier.processAccounting(25);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
        vm.warp(1200);
        tier.processAccounting(25);
        assertEq(tier.protocolFeeEarnedHeld(), 50);
        vm.warp(1350);
        tier.processAccounting(25);
        assertEq(tier.releaseProtocolFees(), 100);
        assertEq(tier.allocationState(id).earnedScaled[3], 100 * Q);
        assertEq(tier.allocationState(id).unearnedScaled[3], 0);
    }

    function test_cancellationRoundingRemainsProtectedAndNeverBecomesEarned() public {
        MembershipTier tier = _tier(10_000, 1);
        uint256 id = tier.createMembership(1, address(0));
        vm.warp(1050);
        assertEq(tier.refund(id, tier.ownerOf(id), 0), 0);
        uint256 earned = Q / PERIOD * 50;
        assertEq(
            tier.previewAccounting(id, address(0), address(0), 0).settled.fractionalScaled[3],
            earned
        );
        assertEq(tier.reserveState().cancellationScaled[3], Q - earned);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
        vm.warp(2000);
        tier.processAccounting(25);
        assertEq(tier.releaseProtocolFees(), 0);
        assertEq(tier.reserveState().cancellationScaled[3], Q - earned);
        assertEq(tier.totalProtectedLiability(), 1);
        assertEq(asset.balanceOf(address(tier)), 1);
    }

    function test_releaseAndRefundOrderProduceIdenticalFunding() public {
        MembershipTier a = _tier(1000, 10);
        MembershipTier b = _tier(1000, 10);
        a.createMembership(12, address(0));
        b.createMembership(12, address(0));
        vm.warp(1350);
        a.processAccounting(25);
        uint256 releasedA = a.releaseProtocolFees();
        assertEq(a.refund(1, a.ownerOf(1), 85), 85);
        assertEq(b.refund(1, b.ownerOf(1), 85), 85);
        assertEq(b.releaseProtocolFees(), releasedA);
        assertEq(
            abi.encode(a.previewAccounting(1, address(0), address(0), 0).settled),
            abi.encode(b.previewAccounting(1, address(0), address(0), 0).settled)
        );
        assertEq(abi.encode(a.reserveState()), abi.encode(b.reserveState()));
        assertEq(asset.balanceOf(address(a)), asset.balanceOf(address(b)));
    }

    function test_budgetsAndPagesRejectUnboundedInputs() public {
        MembershipTier tier = _tier(1000, 10);
        tier.createMembership(1, address(0));
        vm.expectRevert(VestingLedger.InvalidAccountingSteps.selector);
        tier.processAccounting(0);
        vm.expectRevert(VestingLedger.InvalidAccountingSteps.selector);
        tier.processAccounting(101);
        vm.expectRevert(VestingLedger.InvalidAllocationPageSize.selector);
        tier.allocationLots(1, 0, 0, 101);
        vm.expectRevert(VestingLedger.InvalidAllocationPageSize.selector);
        tier.allocationLots(1, 0, 0, 0);
        assertEq(tier.allocationLots(1, 0, 0, 100).length, 1);
        assertEq(tier.allocationLots(1, 0, 1000, 100).length, 0);
    }

    function test_expiredAndBurnedCredentialsRetainCollectibleEarnings() public {
        MembershipTier tier = _tier(1000, 10);
        uint256 id = tier.createMembership(1, address(0));
        vm.warp(1100);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(tier.processExpirations(25).retiredCount, 1);
        assertEq(tier.balanceOf(address(this)), 0);
        vm.prank(address(0xBEEF));
        tier.processAccounting(25);
        vm.prank(address(0xBEEF));
        assertEq(tier.releaseProtocolFees(), 1);
        assertEq(tier.allocationState(id).earnedScaled[3], Q);
    }

    function test_maximumBatchAndConstantWorkRelease() public {
        MembershipTier tier = _tier(1000, 10);
        for (uint160 i; i < 25; ++i) {
            tier.giftMembership(address(uint160(0x1000) + i), 1);
        }
        vm.warp(1100);
        vm.cool(address(tier));
        uint256 before = gasleft();
        MembershipTypes.MaintenanceResult memory progress = tier.processAccounting(25);
        uint256 steps = progress.processedSteps;
        bool complete = progress.complete;
        uint256 batchGas = before - gasleft();
        assertEq(steps, 25);
        assertFalse(complete); // 25 funding ends precede the 25 expirations.
        assertEq(tier.occupiedSupply(), 25);
        assertLt(batchGas, 15_000_000);
        assertEq(tier.protocolFeeEarnedHeld(), 25);
        before = gasleft();
        assertEq(tier.releaseProtocolFees(), 25);
        uint256 releaseGas = before - gasleft();
        assertLt(releaseGas, 200_000);
        assertEq(tier.processAccounting(25).retiredCount, 25);
        assertTrue(tier.accountingStatus().complete);
        assertEq(tier.releaseProtocolFees(), 0);
        emit log_named_uint("25-member accounting gas", batchGas);
        emit log_named_uint("aggregate release gas", releaseGas);
    }

    function testFuzz_varyingLotsAndRefundFundingMatchSlowIntervalOracle(
        uint96[8] memory amounts,
        uint16 rate,
        uint16 elapsed
    ) public {
        rate = uint16(bound(rate, 100, 10_000));
        uint256 consumed = bound(elapsed, 0, 8 * PERIOD);
        MembershipTier tier = _tier(rate, 0);
        uint256 grossRefund;
        uint256 totalGross;
        uint256[4] memory allocated;
        uint256[4] memory earned;
        for (uint256 i; i < amounts.length; ++i) {
            uint256 gross = bound(amounts[i], 0, 1e20);
            if (i == 0) tier.createContributionMembership(gross, address(0));
            else tier.renewContributionMembership(1, gross, address(0));
            totalGross += gross;
            uint256 used = consumed > i * PERIOD ? consumed - i * PERIOD : 0;
            if (used > PERIOD) used = PERIOD;
            grossRefund += gross * (PERIOD - used) / PERIOD;
            uint256 protocol = gross * rate / 10_000;
            uint256[4] memory split = [gross - protocol, uint256(0), uint256(0), protocol];
            for (uint256 purpose; purpose < 4; ++purpose) {
                allocated[purpose] += split[purpose] * Q;
                earned[
                    purpose
                ] += used == PERIOD ? split[purpose] * Q : split[purpose] * Q / PERIOD * used;
            }
        }
        vm.warp(1000 + consumed);
        tier.processAccounting(25);
        MembershipTypes.AllocationState memory state = tier.allocationState(1);
        MembershipTypes.RefundPreview memory quote = tier.previewRefund(1);
        assertEq(quote.grossRefund, grossRefund);
        uint256 remaining = grossRefund * Q;
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(state.allocatedScaled[purpose], allocated[purpose]);
            assertEq(state.earnedScaled[purpose], earned[purpose]);
            uint256 unearned = allocated[purpose] - earned[purpose];
            uint256 taken = remaining < unearned ? remaining : unearned;
            assertEq(quote.fundingScaled[purpose], taken);
            assertEq(quote.cancellationScaled[purpose], unearned - taken);
            remaining -= taken;
        }
        assertEq(remaining, 0);
        if (consumed < 8 * PERIOD) {
            assertEq(tier.refund(1, address(this), grossRefund), grossRefund);
        } else {
            assertEq(grossRefund, 0);
            assertEq(tier.balanceOf(address(this)), 0);
        }
        uint256 released = tier.releaseProtocolFees();
        assertEq(released, earned[3] / Q);
        assertEq(asset.balanceOf(address(tier)) + grossRefund + released, totalGross);
        assertEq(tier.reserveState().unearnedScaled[3], 0);
    }

    function test_largeHistoriesKeepViewsAndResetBounded() public {
        MembershipTier tier = _tier(10_000, 0);
        tier.createContributionMembership(100, address(0));
        vm.warp(1050);
        vm.cool(address(tier));
        uint256 before = gasleft();
        tier.allocationState(1);
        uint256 oneLotView = before - gasleft();
        for (uint256 i; i < 511; ++i) {
            tier.renewContributionMembership(1, 100, address(0));
        }
        vm.cool(address(tier));
        before = gasleft();
        tier.allocationState(1);
        uint256 manyLotView = before - gasleft();
        assertLt(manyLotView, oneLotView + 50_000);
        vm.cool(address(tier));
        before = gasleft();
        tier.refund(1, tier.ownerOf(1), type(uint256).max);
        uint256 refundGas = before - gasleft();
        assertLt(refundGas, 1_000_000); // Includes permanent burn and owner enumeration removal.
        before = gasleft();
        uint256 fresh = tier.createContributionMembership(100, address(0));
        uint256 rejoinGas = before - gasleft();
        emit log_named_uint("one-lot view gas", oneLotView);
        emit log_named_uint("512-lot view gas", manyLotView);
        emit log_named_uint("512-lot refund gas", refundGas);
        emit log_named_uint("rejoin gas", rejoinGas);
        assertLt(rejoinGas, 1_000_000); // A fresh NFT and funding position are created.
        assertEq(tier.allocationLots(fresh, 0, 0, 100).length, 1);
        assertGt(fresh, 1);
        assertEq(tier.allocationLots(1, 1, 0, 100).length, 0);
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
}
