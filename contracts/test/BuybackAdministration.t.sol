// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {BuybackIntegration} from "../src/libraries/BuybackIntegration.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Deliberately hostile WETH replacement for one local guard regression only.
contract ReenteringUnwrapFixture {
    mapping(address => uint256) public balanceOf;
    bool public callbackSucceeded;
    bytes public callbackError;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function withdraw(uint256 amount) external {
        (callbackSucceeded, callbackError) =
            msg.sender.call(abi.encodeWithSignature("syncDonation(address)", address(this)));
        balanceOf[msg.sender] -= amount;
        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "unwrap failed");
    }
}

/// @notice Synthetic authority fixture. Genuine Safe signatures and successor
/// acceptance are tested separately on the canonical fork contracts.
contract BuybackAdministrationTest is Test {
    MembershipFactory private factory;
    ProtocolBuybackVault private vault;
    MockUSDG private token;
    address private admin = address(0xA11CE);

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        token = new MockUSDG();
        SyntheticPonsBinding.bind(address(token));
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(token),
            address(new OnchainMediaStoreFactory()),
            admin,
            address(token),
            MembershipTestConfig.tierCode(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(token))
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
        vault.setLimits(address(0), _limits());
        vm.expectRevert();
        vault.setGlobalMinInterval(60);
        vm.expectRevert();
        vault.setExecutionLimits(60, new address[](0), new BuybackTypes.ExecutionLimits[](0));
        token.mint(address(this), 1e18);
        vm.expectRevert();
        vault.setBuybacksPaused(false);
        vm.prank(admin);
        vault.setBuybacksPaused(false);
        assertFalse(vault.buybacksPaused());
    }

    function test_unwrapCallbackCannotReusePreWithdrawalBalances() public {
        address weth = BuybackIntegration.WETH;
        vm.etch(weth, address(new ReenteringUnwrapFixture()).code);
        vm.deal(weth, 10);
        ReenteringUnwrapFixture wrapped = ReenteringUnwrapFixture(weth);
        wrapped.mint(address(vault), 10);
        assertEq(vault.syncDonation(weth), 10);
        assertFalse(wrapped.callbackSucceeded());
        assertEq(wrapped.callbackError(), abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        assertEq(wrapped.balanceOf(address(vault)), 0);
        assertEq(address(vault).balance, 10);
        BuybackTypes.Inventory memory held =
            vault.inventory(address(0), BuybackTypes.SourceBucket.Donation);
        assertEq(held.available, 10);
        assertEq(held.totalReceived, 10);
        assertEq(vault.syncDonation(weth), 0);
        assertEq(vault.syncDonation(address(0)), 0);
    }

    function test_routeAndLimitsChangesAdvanceRevisionWithoutClearingStandingLimits() public {
        vm.startPrank(admin);
        vault.setRoute(address(0), _ethRoute());
        vault.setLimits(address(0), _limits());
        assertEq(vault.revision(address(0)), 2);
        vault.setRoute(address(0), _ethRoute());
        assertEq(vault.revision(address(0)), 3);
        assertEq(vault.limits(address(0)).maxInput, 0.001 ether);
    }

    function test_pausesDoNotChangeRevisionOrLimits() public {
        vm.startPrank(admin);
        vault.setRoute(address(0), _ethRoute());
        vault.setLimits(address(0), _limits());
        bytes32 beforeLimits = keccak256(abi.encode(vault.limits(address(0))));
        uint64 beforeRevision = vault.revision(address(0));
        vault.setBuybacksPaused(true);
        vault.setAssetBuybacksPaused(address(0), true);
        vault.setBuybacksPaused(false);
        vault.setAssetBuybacksPaused(address(0), false);
        assertEq(keccak256(abi.encode(vault.limits(address(0)))), beforeLimits);
        assertEq(vault.revision(address(0)), beforeRevision);
    }

    function test_limitsRequireRouteAndRejectInvalidBounds() public {
        vm.startPrank(admin);
        vm.expectRevert();
        vault.setLimits(address(0), _limits());
        vault.setRoute(address(0), _ethRoute());
        for (uint256 i; i < 3; ++i) {
            BuybackTypes.ExecutionLimits memory p = _limits();
            if (i == 0) p.minInput = 0;
            if (i == 1) p.maxInput = 0;
            if (i == 2) p.minInput = p.maxInput + 1;
            vm.expectRevert();
            vault.setLimits(address(0), p);
            assertEq(vault.revision(address(0)), 1);
        }
    }

    function testFuzz_limitsAcceptFullSizeAndIntervalRange(
        uint128 minimum,
        uint128 maximum,
        uint64 interval
    ) public {
        minimum = uint128(bound(minimum, 1, type(uint128).max));
        maximum = uint128(bound(maximum, minimum, type(uint128).max));
        vm.startPrank(admin);
        vault.setRoute(address(0), _ethRoute());
        vault.setLimits(address(0), BuybackTypes.ExecutionLimits(minimum, maximum, interval));
        assertEq(vault.limits(address(0)).maxInput, maximum);
        assertEq(vault.limits(address(0)).minInterval, interval);
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

    function _limits() private pure returns (BuybackTypes.ExecutionLimits memory) {
        return BuybackTypes.ExecutionLimits(1, 0.001 ether, 60);
    }
}
