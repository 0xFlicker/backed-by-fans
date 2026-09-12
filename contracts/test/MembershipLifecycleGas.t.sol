// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {VestingLedger} from "../src/libraries/VestingLedger.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";

contract MembershipLifecycleGasTest is Test {
    MembershipTier private tier;
    MockUSDG private asset;
    address private constant ALICE = address(0xA11CE);
    uint256 private constant POSITIONS = 10_000;

    function setUp() public {
        // Setup represents 10,000 separate grant transactions. Meter only the
        // individual maintenance/read/claim operations under test below.
        vm.pauseGasMetering();
        new LinkedVestingFixture().install();
        vm.warp(1000);
        asset = new MockUSDG();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(asset)
        );
        config.pricePerPeriod = 0;
        config.periodDuration = 100;
        config.supplyCap = 0;
        config.maxPrepaidPeriods = 0;
        tier = new MembershipTier(
            SyntheticVaultBinding.bind(address(this), address(asset)), asset, config
        );
        for (uint256 i; i < POSITIONS; ++i) {
            tier.grantMembership(ALICE, 1);
        }
        asset.mint(ALICE, 32_000);
        vm.prank(ALICE);
        asset.approve(address(tier), type(uint256).max);
        // Thirty-two existing positions acquire real funding and claim credit.
        vm.startPrank(ALICE);
        for (uint256 id = 1; id <= 32; ++id) {
            tier.renewContributionMembership(id, 1000, address(0));
        }
        vm.stopPrank();
        vm.resumeGasMetering();
    }

    function test_tenThousandPositionsBoundPreviewStorageReadsAndOwnerPage() public {
        assertEq(tier.accountingStatus().scheduledExpirations, POSITIONS);
        vm.warp(1100);
        vm.cool(address(tier));
        vm.record();
        uint256 before = gasleft();
        MembershipTypes.ClaimPreview memory preview = tier.previewClaimRewards(ALICE, _ids(), 256);
        uint256 used = before - gasleft();
        (bytes32[] memory reads,) = vm.accesses(address(tier));
        assertEq(preview.processedSteps, 256);
        assertFalse(preview.complete);
        // This ceiling is smaller than the 10,000-node heap: the view must read
        // a bounded frontier, never clone or scan every scheduled position.
        assertLt(reads.length, 4096);
        assertLt(used, 30_000_000);
        emit log_named_uint("256-step preview gas at 10000 positions", used);
        emit log_named_uint("preview distinct storage reads", reads.length);
        before = gasleft();
        MembershipTypes.PositionPage memory page = tier.tokensOfOwner(ALICE, 0, 100);
        used = before - gasleft();
        assertEq(page.tokenIds.length, 100);
        assertEq(page.balance, POSITIONS);
        assertFalse(page.complete);
        assertLt(used, 1_000_000);
        emit log_named_uint("100-position owner page gas", used);
        vm.expectRevert(MembershipTier.InvalidPositionPage.selector);
        tier.tokensOfOwner(ALICE, 0, 101);
        vm.expectRevert(VestingLedger.InvalidAccountingSteps.selector);
        tier.previewClaimRewards(ALICE, _ids(), 257);
    }

    function test_equalTimeBacklogMakesBoundedProgressWhilePaused() public {
        vm.warp(1100);
        tier.setPaused(true);
        uint256 processed;
        uint256 retired;
        uint256 peak;
        uint256 calls;
        while (!tier.accountingStatus().complete) {
            // Meter the deepest heap batches and the final shrinking heap.
            // The remaining drain represents separate transactions, not one
            // artificial billion-gas maintenance transaction.
            bool measured = calls < 8 || tier.occupiedSupply() <= 132;
            if (!measured) vm.pauseGasMetering();
            vm.cool(address(tier));
            uint256 before = gasleft();
            MembershipTypes.MaintenanceResult memory result = tier.processAccounting(25);
            uint256 used = before - gasleft();
            if (!measured) vm.resumeGasMetering();
            assertGt(result.processedSteps, 0);
            assertLe(result.processedSteps, 25);
            assertLt(used, 15_000_000);
            if (used > peak) peak = used;
            processed += result.processedSteps;
            retired += result.retiredCount;
            ++calls;
            // Each measured call is a separate logical transaction; avoid making
            // the test harness itself pay for all 400 transactions in one gas cap.
            vm.pauseGasMetering();
            assertEq(tier.accountingStatus().scheduledExpirations, POSITIONS - retired);
            vm.resumeGasMetering();
        }
        assertEq(retired, POSITIONS - 32);
        assertEq(processed, POSITIONS); // 32 funding ENDs, then 9968 free expirations.
        assertEq(calls, 400);
        assertEq(tier.occupiedSupply(), 32);
        emit log_named_uint("25-boundary maintenance peak gas at 10000 positions", peak);
        emit log_named_uint("equal-time maintenance calls", calls);
    }

    function test_maximumSelectedClaimAndPreviewParityAtLargePopulation() public {
        vm.warp(1050);
        MembershipTypes.ClaimPreview memory preview = tier.previewClaimRewards(ALICE, _ids(), 25);
        assertTrue(preview.complete);
        assertEq(preview.positions.length, 32);
        assertEq(preview.processedSteps, 0);
        uint256 expected;
        for (uint256 i; i < 32; ++i) {
            expected += preview.positions[i].creditScaled / (1 << 128);
        }
        vm.cool(address(tier));
        vm.prank(ALICE);
        uint256 before = gasleft();
        MembershipTypes.ClaimResult memory result = tier.claimRewards(_ids(), 25);
        uint256 used = before - gasleft();
        assertEq(result.liveReward, expected);
        assertEq(result.processedSteps, 0);
        assertLt(used, 5_000_000);
        emit log_named_uint("32-position claim gas at 10000 positions", used);
    }

    function _ids() private pure returns (uint256[] memory ids) {
        ids = new uint256[](32);
        for (uint256 i; i < 32; ++i) {
            ids[i] = i + 1;
        }
    }
}
