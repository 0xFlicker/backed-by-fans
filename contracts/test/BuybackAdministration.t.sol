// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Synthetic authority fixture. Genuine Safe signatures and successor
/// acceptance are tested separately on the canonical fork contracts.
contract BuybackAdministrationTest is Test {
    MembershipFactory private factory;
    ProtocolBuybackVault private vault;
    MockUSDG private token;
    address private admin = address(0xA11CE);

    function setUp() public {
        vm.warp(1000);
        token = new MockUSDG();
        SyntheticPonsBinding.bind(address(token));
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(token),
            address(new OnchainMediaStoreFactory()),
            admin,
            address(token)
        );
        vault = ProtocolBuybackVault(payable(factory.buybackVault()));
    }

    function test_factoryOwnerIsOnlyConfigurationAuthority() public {
        vm.expectRevert();
        vault.setBuybacksPaused(false);
        vm.expectRevert();
        vault.setAssetBuybacksPaused(address(0), false);
        vm.expectRevert();
        vault.setRoute(address(0), _ethRoute());
        vm.expectRevert();
        vault.setPolicy(address(0), _policy());
        token.mint(address(this), 1e18);
        vm.expectRevert();
        vault.setBuybacksPaused(false);
        vm.prank(admin);
        vault.setBuybacksPaused(false);
        assertFalse(vault.buybacksPaused());
    }

    function test_routeReplacementInvalidatesPolicyAndEveryEconomicChangeAdvancesRevision() public {
        vm.startPrank(admin);
        vault.setRoute(address(0), _ethRoute());
        assertEq(vault.revision(address(0)), 1);
        vault.setPolicy(address(0), _policy());
        assertEq(vault.revision(address(0)), 2);
        assertEq(vault.policy(address(0)).terms.totalBudget, 0.01 ether);
        vault.setPolicy(address(0), _policy());
        assertEq(vault.revision(address(0)), 3);
        vault.setRoute(address(0), _ethRoute());
        assertEq(vault.revision(address(0)), 4);
        assertEq(vault.policy(address(0)).terms.totalBudget, 0);
        vm.stopPrank();
    }

    function test_pausesDoNotChangeRevisionOrRefillBudget() public {
        vm.startPrank(admin);
        vault.setRoute(address(0), _ethRoute());
        vault.setPolicy(address(0), _policy());
        bytes32 beforePolicy = keccak256(abi.encode(vault.policy(address(0))));
        uint64 beforeRevision = vault.revision(address(0));
        vault.setBuybacksPaused(true);
        vault.setAssetBuybacksPaused(address(0), true);
        vault.setBuybacksPaused(false);
        vault.setAssetBuybacksPaused(address(0), false);
        assertEq(keccak256(abi.encode(vault.policy(address(0)))), beforePolicy);
        assertEq(vault.revision(address(0)), beforeRevision);
    }

    function test_policyRequiresRouteAndRejectsInvalidBounds() public {
        vm.startPrank(admin);
        vm.expectRevert();
        vault.setPolicy(address(0), _policy());
        vault.setRoute(address(0), _ethRoute());
        for (uint256 i; i < 10; ++i) {
            BuybackTypes.ExecutionPolicy memory p = _policy();
            if (i == 0) p.rates[0].numerator = 0;
            if (i == 1) p.rates[0].denominator = 0;
            if (i == 2) p.rates[0].toleranceBps = 101;
            if (i == 3) p.validUntil = p.validAfter;
            if (i == 4) p.validUntil = p.validAfter + 24 hours + 1;
            if (i == 5) p.batchCap = 0;
            if (i == 6) p.totalBudget = 0;
            if (i == 7) p.batchCap = p.totalBudget + 1;
            if (i == 8) p.rates = new BuybackTypes.Rate[](2);
            if (i == 9) p.evidenceHash = bytes32(0);
            vm.expectRevert();
            vault.setPolicy(address(0), p);
            assertEq(vault.revision(address(0)), 1);
        }
    }

    function testFuzz_uint128OperandBoundsRemainRepresentable(
        uint128 numerator,
        uint128 denominator,
        uint128 budget
    ) public {
        numerator = uint128(bound(numerator, 1, type(uint128).max));
        denominator = uint128(bound(denominator, 1, type(uint128).max));
        budget = uint128(bound(budget, 1, type(uint128).max));
        BuybackTypes.ExecutionPolicy memory p = _policy();
        p.rates[0] = BuybackTypes.Rate(numerator, denominator, 100);
        p.batchCap = budget;
        p.totalBudget = budget;
        vm.startPrank(admin);
        vault.setRoute(address(0), _ethRoute());
        vault.setPolicy(address(0), p);
        assertEq(vault.policy(address(0)).terms.totalBudget, budget);
    }

    function test_cannotConfigureDirectBurnAsAMarketOrInventAnEmptyTokenRoute() public {
        vm.startPrank(admin);
        vm.expectRevert();
        vault.setRoute(address(token), _ethRoute());
        MockUSDG other = new MockUSDG();
        vm.expectRevert();
        vault.setRoute(address(other), _ethRoute());
        BuybackTypes.TypedRoute memory route = _ethRoute();
        route.pools = new PoolKey[](3);
        vm.expectRevert();
        vault.setRoute(address(other), route);
    }

    function test_cannotDiscardAuthorityOrNominateEOAOrSpoofSafe() public {
        vm.startPrank(admin);
        vm.expectRevert();
        factory.renounceOwnership();
        vm.expectRevert();
        factory.transferOwnership(address(0xBEEF));
        vm.expectRevert();
        factory.transferOwnership(address(token));
        assertEq(factory.owner(), admin);
        assertEq(factory.pendingOwner(), address(0));
    }

    function _ethRoute() private pure returns (BuybackTypes.TypedRoute memory) {
        return BuybackTypes.TypedRoute(new PoolKey[](0));
    }

    function _policy() private view returns (BuybackTypes.ExecutionPolicy memory p) {
        p.validAfter = uint64(block.timestamp);
        p.validUntil = p.validAfter + 15 minutes;
        p.batchCap = 0.001 ether;
        p.totalBudget = 0.01 ether;
        p.rates = new BuybackTypes.Rate[](1);
        p.rates[0] = BuybackTypes.Rate(1000, 1, 100);
        p.evidenceHash = keccak256("independent synthetic policy reference");
    }
}
