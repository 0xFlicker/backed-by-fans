// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {RewardCurve} from "../src/libraries/RewardCurve.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test, console2} from "forge-std/Test.sol";

/// @dev The report supplies independent Python expected values. No RPC is used.
contract RewardCurveCalibrationTest is Test {
    uint256 private constant Q = 1 << 128;

    function test_calibrationLifecycleCashAgainstRationalReport() public {
        new LinkedVestingFixture().install();
        uint256[] memory data = abi.decode(
            vm.readFileBinary("test/fixtures/membership-curve-lifecycle.bin"), (uint256[])
        );
        assertEq(data.length, 6 * 13);
        MockUSDG token = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        address a = makeAddr("calibration-a");
        address b = makeAddr("calibration-b");
        address referrer = makeAddr("calibration-referrer");
        for (uint256 i; i < data.length; i += 13) {
            vm.warp(1000);
            bool refund = data[i + 1] == 1;
            MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
                address(this), address(renderer), address(token)
            );
            config.pricePerPeriod = 0;
            config.periodDuration = refund ? 30 : 10;
            config.protocolFeeBps = 500;
            config.rewardBps = 1000;
            config.referralBps = 500;
            config.startingBoostBps = uint32(data[i]);
            config.earlySupportGross = data[i] == 10_000 ? 0 : 1000e18;
            MembershipTier tier = new MembershipTier(
                SyntheticVaultBinding.bind(address(this), address(token)), token, config
            );
            token.mint(a, 400e18);
            token.mint(b, 200e18);
            vm.prank(a);
            token.approve(address(tier), type(uint256).max);
            vm.prank(b);
            token.approve(address(tier), type(uint256).max);
            vm.prank(a);
            uint256 idA = tier.createContributionMembership(100e18, referrer);
            vm.prank(b);
            uint256 idB = tier.createContributionMembership(100e18, referrer);
            vm.warp(1010);
            if (refund) {
                tier.setPaused(true);
                assertEq(tier.refund(idB, tier.ownerOf(idB), type(uint256).max), data[i + 3]);
                tier.setPaused(false);
            } else {
                uint256[] memory ids = new uint256[](1);
                ids[0] = idB;
                tier.processExpirations(25).retiredCount;
                vm.prank(a);
                tier.createContributionMembership(100e18, referrer);
            }
            vm.warp(1020);
            if (!refund) {
                vm.prank(a);
                tier.createContributionMembership(100e18, referrer);
            }
            vm.prank(b);
            tier.createContributionMembership(1e18, referrer);
            vm.warp(1030);
            tier.processAccounting(25);
            assertEq(tier.lifetimeGross(), data[i + 2]);
            assertEq(_ownerShares(tier, a), data[i + 4]);
            assertEq(tier.sharesOf(idA), 0);
            assertEq(_ownerShares(tier, b), data[i + 5]);
            assertEq(tier.sharesOf(idB), 0);
            assertApproxEqAbs(_ownerReward(tier, a), data[i + 6], 1);
            assertApproxEqAbs(_ownerReward(tier, b), data[i + 7], 1);
            assertApproxEqAbs(tier.creatorProceeds(), data[i + 8], 1);
            assertApproxEqAbs(tier.claimableReferral(referrer), data[i + 10], 1);
            assertApproxEqAbs(tier.protocolFeeEarnedHeld(), data[i + 11], 1);
            MembershipTypes.ReserveState memory reserves = tier.reserveState();
            uint256 unearned;
            for (uint256 purpose; purpose < 4; ++purpose) {
                unearned += reserves.unearnedScaled[purpose];
            }
            assertApproxEqAbs(unearned / Q, data[i + 12], 1);
            console2.log("cash", i / 13, _ownerReward(tier, a), _ownerReward(tier, b));
        }
    }

    function _ownerShares(MembershipTier tier, address owner) private view returns (uint256 sum) {
        uint256[] memory ids = tier.tokensOfOwner(owner, 0, 100).tokenIds;
        for (uint256 i; i < ids.length; ++i) {
            sum += tier.sharesOf(ids[i]);
        }
    }

    function _ownerReward(MembershipTier tier, address owner) private view returns (uint256 sum) {
        uint256[] memory ids = tier.tokensOfOwner(owner, 0, 100).tokenIds;
        (sum,) = tier.claimableRetiredReward(owner);
        for (uint256 i; i < ids.length; ++i) {
            sum += tier.claimableReward(ids[i]);
        }
    }

    function test_calibrationMatchesSolidityOutputs() public view {
        uint256[] memory data =
            abi.decode(vm.readFileBinary("deployments/curve-calibration/cases.bin"), (uint256[]));
        assertGt(data.length, 0);
        assertEq(data.length % 4, 0);
        for (uint256 i; i < data.length; i += 4) {
            uint256 gross = data[i];
            assertLe(data[i + 1], type(uint112).max);
            assertLe(data[i + 2], type(uint32).max);
            uint112 horizon = uint112(data[i + 1]);
            uint32 boost = uint32(data[i + 2]);
            RewardCurve.validate(boost, horizon, 0);
            uint256 actual = RewardCurve.quote(0, gross, boost, horizon);
            assertEq(actual, data[i + 3], string.concat("calibration case ", vm.toString(i / 4)));
            console2.log("calibration", i / 4, actual);
        }
    }
}
