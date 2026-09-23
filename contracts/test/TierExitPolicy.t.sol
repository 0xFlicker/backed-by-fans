// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";

contract TierExitPolicyTest is Test {
    MockUSDG private token;
    address private renderer;
    address private factory;

    function setUp() public {
        new LinkedVestingFixture().install();
        token = new MockUSDG();
        renderer = address(new OnchainMetadataRenderer());
        factory = SyntheticVaultBinding.bind(makeAddr("factory"), address(token));
    }

    function test_creationRejectsRetentionAbove100Percent() public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer, address(token));
        config.creatorRetentionBps = 10_001;
        vm.expectRevert(bytes4(keccak256("InvalidCreatorRetention()")));
        MembershipTestConfig.deployTier(factory, token, config);
    }

    function test_creationRejectsPeriodicContributionPricing() public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer, address(token));
        config.periodicEnabled = true;
        config.pricePerPeriod = 0;
        vm.expectRevert(bytes4(keccak256("IncorrectPricingMode()")));
        MembershipTestConfig.deployTier(factory, token, config);
    }
}
