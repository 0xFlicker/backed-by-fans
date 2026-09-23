// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipTier} from "../../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {AdversarialERC20} from "../mocks/AdversarialERC20.sol";
import {LinkedVestingFixture} from "./LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./SyntheticVaultBinding.sol";
import {Test} from "forge-std/Test.sol";

abstract contract PeriodicRefillFixture is Test {
    MembershipTier internal tier;
    MembershipTier internal refill;
    AdversarialERC20 internal token;
    address internal constant CREATOR = address(0xC);
    address internal constant MEMBER = address(0xA);
    address internal constant EXECUTOR = address(0xB);
    uint64 internal constant D = 30 days;
    uint256 internal constant P = 20_000_000;

    function setUp() public virtual {
        new LinkedVestingFixture().install();
        vm.warp(1_000_000);
        token = new AdversarialERC20();
        _deploy(0, true, P);
        _buy(1);
    }

    function _deploy(uint64 cap, bool enabled, uint256 price) internal {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            CREATOR, address(new OnchainMetadataRenderer()), address(token)
        );
        config.pricePerPeriod = price;
        config.maxPrepaidPeriods = cap;
        config.periodicEnabled = enabled;
        config.creatorRetentionBps = 3000;
        tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(0xF), address(token)), token, config
        );
        refill = tier;
        token.mint(MEMBER, 1000 * P);
        vm.prank(MEMBER);
        token.approve(address(tier), type(uint256).max);
    }

    function _buy(uint64 periods) internal returns (uint256 id) {
        vm.prank(MEMBER);
        id = tier.createMembership(periods, address(0), 25);
    }

    function _target(uint64 target) internal {
        vm.prank(MEMBER);
        refill.setRefillTarget(1, target, address(0));
    }

    function _remaining(uint64 seconds_) internal {
        vm.warp(tier.expiresAt(1) - seconds_);
    }

    function _run(uint256 maxPeriods)
        internal
        returns (MembershipTypes.RefillResult memory result)
    {
        vm.prank(EXECUTOR);
        return refill.refillMembership(1, maxPeriods, 25);
    }
}
