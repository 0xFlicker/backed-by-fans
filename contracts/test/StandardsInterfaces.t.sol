// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {Test} from "forge-std/Test.sol";

import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {IERC5643} from "../src/interfaces/IERC5643.sol";
import {IMembershipTier} from "../src/interfaces/IMembershipTier.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticVaultBinding} from "./helpers/SyntheticVaultBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract StandardsInterfacesTest is Test {
    function test_membershipInterfaceMatchesWebAuthenticityRequirement() public pure {
        assertEq(type(IMembershipTier).interfaceId, bytes4(0xaa0af8b7));
    }

    function test_erc5643CancellationPreservesAccountingAtomicityAndRetiresWeight() public {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        MockUSDG token = new MockUSDG();
        OnchainMetadataRenderer renderer = new OnchainMetadataRenderer();
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), address(renderer), address(token));
        config.pricePerPeriod = 1000;
        config.periodDuration = 10;
        config.supplyCap = 0;
        MembershipTier tier = MembershipTestConfig.deployTier(
            SyntheticVaultBinding.bind(address(this), address(token)), token, config
        );
        for (uint256 i = 1; i <= 26; ++i) {
            address member = address(SafeCast.toUint160(10_000 + i));
            token.mint(member, 1000);
            vm.startPrank(member);
            token.approve(address(tier), 1000);
            tier.createMembership(1, address(0), 25);
            vm.stopPrank();
        }
        address first = address(uint160(10_001));
        tier.addGrantTime(1, first, 2, 25);
        vm.warp(1010);
        tier.setPaused(true);
        bytes32 stateBefore = _fingerprint(tier);
        vm.expectRevert(
            abi.encodeWithSelector(
                MembershipTier.AccountingBehind.selector, uint64(1000), uint64(1010)
            )
        );
        tier.cancelSubscription(1);
        assertEq(_fingerprint(tier), stateBefore);
        tier.processAccounting(25);
        vm.prank(first);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, first));
        tier.cancelSubscription(1);
        while (!tier.accountingStatus().complete) tier.processAccounting(25);
        tier.cancelSubscription(1);
        (uint64 paid, uint64 granted,) = tier.timeBalances(1);
        assertEq(paid, 0);
        assertEq(granted, 0);
        assertEq(tier.sharesOf(1), 0);
        assertEq(tier.lifetimeGross(), 26_000);
        assertFalse(tier.rewardEligible(1));
        assertTrue(tier.accountingStatus().complete);
        assertTrue(tier.supportsInterface(type(IERC5643).interfaceId));
        assertFalse(tier.supportsInterface(0xb45a3c0e));
    }

    function test_erc5192InterfaceIdMatchesPublishedStandard() public pure {
        assertEq(bytes4(keccak256("locked(uint256)")), bytes4(0xb45a3c0e));
    }

    function _fingerprint(MembershipTier tier) private view returns (bytes32) {
        (uint64 paid, uint64 granted, uint64 checkpoint) = tier.timeBalances(1);
        return keccak256(
            abi.encode(tier.reserveState(), tier.allocationState(1), paid, granted, checkpoint)
        );
    }

    function test_erc5643InterfaceIdMatchesPublishedStandard() public pure {
        assertEq(type(IERC5643).interfaceId, bytes4(0x8c65f84d));
    }

    function test_mockUSDGProvidesExpectedERC20Behavior() public {
        MockUSDG token = new MockUSDG();
        address supporter = makeAddr("supporter");

        token.mint(address(this), 12_000_000);
        assertTrue(token.transfer(supporter, 2_000_000));

        assertEq(token.name(), "Mock USDG");
        assertEq(token.symbol(), "USDG");
        assertEq(token.decimals(), 6);
        assertEq(token.balanceOf(address(this)), 10_000_000);
        assertEq(token.balanceOf(supporter), 2_000_000);
        assertEq(token.totalSupply(), 12_000_000);
    }
}
