// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {Test} from "forge-std/Test.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

contract CustomRendererAddressTest is Test {
    MockUSDG private paymentToken;
    OnchainMetadataRenderer private canonicalRenderer;
    OnchainMediaStoreFactory private mediaStoreFactory;
    MembershipFactory private factory;
    address private creator;

    function setUp() public {
        creator = makeAddr("creator");
        paymentToken = new MockUSDG();
        canonicalRenderer = new OnchainMetadataRenderer();
        mediaStoreFactory = new OnchainMediaStoreFactory();
        factory = new MembershipFactory(
            paymentToken, address(mediaStoreFactory), address(this), makeAddr("feeRecipient")
        );
    }

    function test_unregisteredCompatibleRendererCreatesTierAndIsExposed() public {
        OnchainMetadataRenderer creatorRenderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(creatorRenderer));

        vm.prank(creator);
        MembershipTier tier = MembershipTier(factory.createTier(config));

        assertEq(tier.renderer(), address(creatorRenderer));
        assertEq(tier.pricePerPeriod(), config.pricePerPeriod);
        assertEq(tier.periodDuration(), config.periodDuration);
        assertEq(tier.rewardBps(), config.rewardBps);
        assertEq(tier.referralBps(), config.referralBps);
        assertEq(tier.supplyCap(), config.supplyCap);
        assertEq(tier.maxPrepaidPeriods(), config.maxPrepaidPeriods);
    }

    function test_canonicalRendererAlsoUsesDirectAddress() public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(canonicalRenderer));

        vm.prank(creator);
        MembershipTier tier = MembershipTier(factory.createTier(config));

        assertEq(tier.renderer(), address(canonicalRenderer));
    }

    function test_zeroRendererAddressIsRejected() public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, address(0));

        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidRenderer.selector);
        factory.createTier(config);
    }

    function test_nonContractRendererAddressIsRejected() public {
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(creator, makeAddr("not-a-contract"));

        vm.prank(creator);
        vm.expectRevert(MembershipFactory.InvalidRenderer.selector);
        factory.createTier(config);
    }
}
