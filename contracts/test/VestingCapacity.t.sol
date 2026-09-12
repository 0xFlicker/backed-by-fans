// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {ProtocolBurnRouter} from "../src/ProtocolBurnRouter.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Real public tier/ledger/router calls; only the external launch identity is synthetic.
/// The full workload is opt-in so normal CI does not construct 100,000 storage lots.
/// BBF_FULL_VESTING_CAPACITY=true selects the release gate without changing any call budget.
contract VestingCapacityTest is Test {
    uint256 private constant PRICE = 1_000_000;
    uint256 private constant Q = 1 << 128;
    uint64 private constant START = 1_000_000;
    MockUSDG private asset;
    MembershipFactory private factory;
    MembershipTier private tier;
    ProtocolBurnRouter private router;
    ProtocolBuybackVault private vault;
    address private ledger;

    function setUp() public {
        new LinkedVestingFixture().install();
        ledger = vm.parseJsonAddress(vm.readFile("out/vesting-leaf/link-manifest.json"), ".address");
        vm.warp(START);
        asset = new MockUSDG();
        SyntheticPonsBinding.bind(address(asset));
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(asset),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(asset),
            MembershipTestConfig.tierCode(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(asset))
        );
        router = ProtocolBurnRouter(factory.burnRouter());
        vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(asset)
        );
        config.pricePerPeriod = PRICE;
        config.periodDuration = 30 days;
        config.maxPrepaidPeriods = 0;
        config.rewardBps = 1000;
        config.referralBps = 500;
        config.protocolFeeBps = 500;
        config.startingBoostBps = 30_000;
        config.earlySupportGross = SafeCast.toUint112(1000 * PRICE);
        tier = MembershipTier(factory.createTier(config));
        vault.setBuybacksPaused(false);
    }

    function test_capacityRecoversAllPaymentsAfterYearIdleWithColdCalls() public {
        uint256 members = vm.envOr("BBF_FULL_VESTING_CAPACITY", false) ? 10_000 : 100;
        uint256 paymentsPerMember = 10;
        uint256 budget = tier.MAX_ACCOUNTING_STEPS();
        assertEq(budget, 25);
        for (uint256 i; i < members; ++i) {
            address member = _member(i);
            asset.mint(member, paymentsPerMember * PRICE);
            vm.startPrank(member);
            asset.approve(address(tier), type(uint256).max);
            // Dense identical ENDs, every allocation active, distinct fixed referrers.
            for (uint256 j; j < paymentsPerMember; ++j) {
                if (j == 0) tier.createMembership(1, _referrer(i));
                else tier.renewMembership(i + 1, 1, _referrer(i));
            }
            vm.stopPrank();
        }
        assertEq(tier.accountingStatus().scheduledMembers, members);
        assertEq(
            tier.reserveState().unearnedScaled[0],
            members * paymentsPerMember * PRICE * 80 / 100 * Q
        );
        vm.warp(START + 365 days);
        assertFalse(tier.accountingStatus().complete);
        uint256 totalSteps;
        uint256 calls;
        uint256 totalGas;
        uint256 peakGas;
        ProtocolBurnRouter.AdvanceTier[] memory tiers = new ProtocolBurnRouter.AdvanceTier[](1);
        tiers[0] = ProtocolBurnRouter.AdvanceTier(address(tier), budget);
        ProtocolBurnRouter.Purchase[] memory purchases = new ProtocolBurnRouter.Purchase[](1);
        purchases[0] = ProtocolBurnRouter.Purchase(address(asset), 0);
        while (!tier.accountingStatus().complete) {
            uint256 intrinsic = _intrinsicGas(
                abi.encodeCall(router.advance, (tiers, purchases, uint64(block.timestamp)))
            );
            _cold();
            uint256 beforeGas = gasleft();
            // This is the complete combined call, including release and a real direct burn.
            (uint256 steps,,,) =
                router.advance{gas: 20_000_000}(tiers, purchases, uint64(block.timestamp));
            uint256 used = beforeGas - gasleft() + intrinsic;
            assertGt(steps, 0, "recovery must make actual boundary progress");
            assertLe(steps, budget);
            assertLe(used, 15_000_000, "cold combined 25-step gas budget");
            totalSteps += steps;
            totalGas += used;
            if (used > peakGas) peakGas = used;
            ++calls;
            if (!tier.accountingStatus().complete) vm.warp(block.timestamp + 12);
        }
        assertEq(totalSteps, members * (paymentsPerMember + 1));
        assertEq(calls, (totalSteps + budget - 1) / budget);
        assertEq(tier.accountingStatus().scheduledMembers, 0);
        for (uint256 purpose; purpose < 4; ++purpose) {
            assertEq(tier.reserveState().unearnedScaled[purpose], 0);
        }
        assertEq(tier.lifetimeGross(), members * paymentsPerMember * PRICE);
        emit log_named_uint("capacity_members", members);
        emit log_named_uint("capacity_payments", totalSteps);
        emit log_named_uint("recovery_transactions", calls);
        emit log_named_uint("recovery_total_gas", totalGas);
        emit log_named_uint("recovery_peak_combined_gas", peakGas);
        _postRecovery();
    }

    function test_longQueueCancellationDoesNotScanHistory() public {
        uint256 payments = vm.envOr("BBF_FULL_VESTING_CAPACITY", false) ? 10_000 : 100;
        address member = _member(0);
        asset.mint(member, payments * PRICE);
        vm.startPrank(member);
        asset.approve(address(tier), type(uint256).max);
        for (uint256 i; i < payments; ++i) {
            if (i == 0) tier.createMembership(1, _referrer(0));
            else tier.renewMembership(1, 1, _referrer(0));
        }
        vm.stopPrank();
        vm.warp(START + 15 days);
        tier.processAccounting(25);
        assertGt(tier.sharesOf(1), 0);
        _cold();
        uint256 beforeGas = gasleft();
        uint256 refunded = tier.refund{gas: 2_000_000}(1, tier.ownerOf(1), payments * PRICE);
        uint256 used = beforeGas - gasleft();
        assertLe(used, 2_000_000);
        assertEq(refunded, payments * PRICE - PRICE / 2);
        assertEq(tier.allocationState(1).generation, 1);
        assertEq(tier.sharesOf(1), 0);
        assertEq(tier.lifetimeGross(), payments * PRICE);
        assertEq(tier.accountingStatus().scheduledMembers, 0);
        emit log_named_uint("canceled_queue_payments", payments);
        emit log_named_uint("cold_cancellation_gas", used);
    }

    function _postRecovery() private {
        _cold();
        uint256 beforeGas = gasleft();
        vm.prank(_member(0));
        assertGt(tier.claimRetiredRewards{gas: 2_000_000}(), 0);
        emit log_named_uint("cold_member_claim_gas", beforeGas - gasleft());
        _cold();
        beforeGas = gasleft();
        vm.prank(_referrer(0));
        assertGt(tier.claimReferral{gas: 2_000_000}(), 0);
        emit log_named_uint("cold_referral_claim_gas", beforeGas - gasleft());
        _cold();
        beforeGas = gasleft();
        assertGt(tier.withdrawCreatorProceeds{gas: 2_000_000}(), 0);
        emit log_named_uint("cold_creator_claim_gas", beforeGas - gasleft());
        _cold();
        beforeGas = gasleft();
        assertEq(tier.releaseProtocolFees{gas: 2_000_000}(), 0);
        emit log_named_uint("cold_settled_release_gas", beforeGas - gasleft());
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        assertEq(tier.processExpirations(25).retiredCount, 0);
        assertFalse(tier.rewardEligible(1));
        asset.mint(_member(0), PRICE);
        vm.prank(_member(0));
        uint256 fresh = tier.createMembership(1, _referrer(0));
        assertGt(fresh, 1);
        assertTrue(tier.rewardEligible(fresh));
        assertEq(tier.refund(fresh, tier.ownerOf(fresh), PRICE), PRICE);
        assertGe(asset.balanceOf(address(tier)), tier.totalProtectedLiability());
    }

    function _cold() private {
        vm.cool(address(tier));
        vm.cool(address(router));
        vm.cool(address(factory));
        vm.cool(address(vault));
        vm.cool(address(asset));
        vm.cool(ledger);
    }

    function _member(uint256 i) private pure returns (address) {
        return address(SafeCast.toUint160(0x10000 + i));
    }

    function _referrer(uint256 i) private pure returns (address) {
        return address(SafeCast.toUint160(0x100000 + i));
    }

    function _intrinsicGas(bytes memory data) private pure returns (uint256 gas) {
        gas = 21_000;
        for (uint256 i; i < data.length; ++i) {
            gas += data[i] == 0 ? 4 : 16;
        }
    }
}
