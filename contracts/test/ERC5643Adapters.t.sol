// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";

contract ERC5643AdaptersTest is Test {
    address private constant MEMBER = address(0xA11CE);
    address private constant RECIPIENT = address(0xB0B);
    MembershipTier private tier;
    MockUSDG private token;
    uint256 private target;

    function _setup(uint256 due, bool contribution) private {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        token = new MockUSDG();
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(token)
        );
        config.periodDuration = 100;
        config.maxPrepaidPeriods = 0;
        config.supplyCap = 0;
        if (contribution) config.pricePerPeriod = 0;
        tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(this), address(token)), token, config
        );
        token.mint(MEMBER, 1_000_000_000);
        vm.startPrank(MEMBER);
        token.approve(address(tier), type(uint256).max);
        if (contribution) {
            target = tier.createContributionMembership(0, address(0), 25);
            for (uint256 i; i < 9; ++i) {
                tier.renewContributionMembership(target, 0, address(0), 25);
            }
        } else {
            target = tier.createMembership(10, address(0), 25);
        }
        if (due >= 2) {
            if (contribution) tier.createContributionMembership(10_000_000, address(0), 25);
            else tier.createMembership(1, address(0), 25);
        }
        vm.stopPrank();
        uint256 grants = due >= 2 ? due - 2 : due;
        for (uint256 i; i < grants; ++i) {
            tier.grantMembership(RECIPIENT, 1, 25);
        }
        vm.warp(1100);
        uint256 snapshot = vm.snapshotState();
        MembershipTypes.MaintenanceResult memory result = tier.processAccounting(100);
        assertEq(result.processedSteps, due, "fixture checkpoint count");
        assertTrue(result.complete);
        assertTrue(vm.revertToState(snapshot));
    }

    function _renew(uint256 due, bool contribution) private {
        _setup(due, contribution);
        uint64 beforeExpiry = tier.expiresAt(target);
        uint256 balance = token.balanceOf(MEMBER);
        uint256 supply = tier.occupiedSupply();
        vm.cool(address(tier));
        vm.cool(address(token));
        if (due > 25) {
            vm.prank(MEMBER);
            vm.expectRevert();
            tier.renewSubscription(target, 100);
            assertEq(tier.expiresAt(target), beforeExpiry);
            assertEq(token.balanceOf(MEMBER), balance);
            assertEq(tier.occupiedSupply(), supply);
            assertFalse(tier.accountingStatus().complete);
            assertEq(tier.processAccounting(25).processedSteps, 25);
        }
        vm.prank(MEMBER);
        uint256 beforeGas = gasleft();
        tier.renewSubscription(target, 100);
        uint256 used = beforeGas - gasleft();
        assertLt(used, 30_000_000, "Robinhood cold adapter budget");
        assertEq(tier.expiresAt(target), beforeExpiry + 100);
        assertTrue(tier.accountingStatus().complete);
        if (due == 25) emit log_named_uint("25 mixed checkpoint renewal gas", used);
    }

    function _cancel(uint256 due) private {
        _setup(due, false);
        vm.prank(MEMBER);
        tier.transferFrom(MEMBER, RECIPIENT, target);
        // Transfer uses no maintenance; the adapter must handle the same backlog.
        uint256 beforeBalance = token.balanceOf(RECIPIENT);
        uint256 beforeSupply = tier.occupiedSupply();
        vm.cool(address(tier));
        vm.cool(address(token));
        if (due > 25) {
            vm.expectRevert();
            vm.prank(RECIPIENT);
            tier.cancelSubscription(target);
            assertEq(tier.ownerOf(target), RECIPIENT);
            assertEq(token.balanceOf(RECIPIENT), beforeBalance);
            assertEq(tier.occupiedSupply(), beforeSupply);
            assertEq(tier.processAccounting(25).processedSteps, 25);
        }
        uint256 beforeGas = gasleft();
        vm.prank(RECIPIENT);
        tier.cancelSubscription(target);
        uint256 used = beforeGas - gasleft();
        assertLt(used, 30_000_000, "Robinhood cold adapter budget");
        assertGt(token.balanceOf(RECIPIENT), beforeBalance);
        assertTrue(tier.accountingStatus().complete);
        if (due == 25) emit log_named_uint("25 mixed checkpoint cancellation gas", used);
    }

    function test_renewZero() public {
        _renew(0, false);
    }

    function test_renewOne() public {
        _renew(1, false);
    }

    function test_renewTwentyFive() public {
        _renew(25, false);
    }

    function test_renewTwentySixRollsBackAndRecovers() public {
        _renew(26, false);
    }

    function test_contributionZero() public {
        _renew(0, true);
    }

    function test_contributionOne() public {
        _renew(1, true);
    }

    function test_contributionTwentyFive() public {
        _renew(25, true);
    }

    function test_contributionTwentySixRollsBackAndRecovers() public {
        _renew(26, true);
    }

    function test_cancelZero() public {
        _cancel(0);
    }

    function test_cancelOne() public {
        _cancel(1);
    }

    function test_cancelTwentyFive() public {
        _cancel(25);
    }

    function test_cancelTwentySixRollsBackAndRecovers() public {
        _cancel(26);
    }
}
