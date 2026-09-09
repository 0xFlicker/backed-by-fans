// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";

import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";

/// @dev Synthetic authenticated sender; real tiers additionally enforce their paid-time entitlement.
contract SyntheticEarnedFeeTier {
    IERC20 public immutable paymentToken;
    ProtocolBuybackVault public immutable vault;

    constructor(IERC20 asset, ProtocolBuybackVault vault_) {
        paymentToken = asset;
        vault = vault_;
    }

    function release(uint256 amount) external {
        require(paymentToken.transfer(address(vault), amount), "transfer failed");
        vault.recordEarnedFees(amount);
    }

    function recordWithoutTransfer(uint256 amount) external {
        vault.recordEarnedFees(amount);
    }
}

/// @dev Synthetic registry only. It is never used by an authentic fork bootstrap.
contract SyntheticFeeRegistry {
    mapping(address => bool) public isRegisteredTier;

    function deployVault(address token) external returns (ProtocolBuybackVault) {
        SyntheticPonsBinding.bind(token);
        return new ProtocolBuybackVault(address(this), token);
    }

    function register(address tier) external {
        isRegisteredTier[tier] = true;
    }
}

contract ProtocolBuybackVaultTest is Test {
    MockUSDG private protocolToken;
    MockUSDG private paymentToken;
    SyntheticFeeRegistry private registry;
    ProtocolBuybackVault private vault;
    SyntheticEarnedFeeTier private tier;

    function setUp() public {
        protocolToken = new MockUSDG();
        paymentToken = new MockUSDG();
        registry = new SyntheticFeeRegistry();
        vault = registry.deployVault(address(protocolToken));
        tier = new SyntheticEarnedFeeTier(paymentToken, vault);
        registry.register(address(tier));
    }

    function testImmutableIdentityAndEmptyInventory() public view {
        assertEq(vault.factory(), address(registry));
        assertEq(vault.protocolToken(), address(protocolToken));
        assertEq(_available(BuybackTypes.SourceBucket.Membership), 0);
        assertEq(_available(BuybackTypes.SourceBucket.Donation), 0);
    }

    function testAllowsUnsetTokenAndRejectsImpersonatedConstructorFactory() public {
        ProtocolBuybackVault unbound = registry.deployVault(address(0));
        assertEq(unbound.protocolToken(), address(0));
        assertEq(unbound.executor(), address(0));
        vm.expectRevert(ProtocolBuybackVault.InvalidAsset.selector);
        registry.deployVault(address(0xBEEF));
        vm.expectRevert(ProtocolBuybackVault.OnlyFactoryDeployment.selector);
        new ProtocolBuybackVault(address(registry), address(protocolToken));
    }

    function testOnlyRegisteredTierCanAttributeMembershipFees() public {
        paymentToken.mint(address(vault), 100);
        vm.expectRevert(ProtocolBuybackVault.OnlyRegisteredTier.selector);
        vault.recordEarnedFees(100);
        SyntheticEarnedFeeTier counterfeit = new SyntheticEarnedFeeTier(paymentToken, vault);
        vm.expectRevert(ProtocolBuybackVault.OnlyRegisteredTier.selector);
        counterfeit.recordWithoutTransfer(100);
        assertEq(_available(BuybackTypes.SourceBucket.Membership), 0);
        assertEq(vault.syncDonation(address(paymentToken)), 100);
    }

    function testFuzzEarnedReceiptsAndDonationsConserveIndependentBuckets(
        uint128 earned,
        uint128 donated
    ) public {
        vm.assume(earned > 0);
        paymentToken.mint(address(tier), earned);
        tier.release(earned);
        paymentToken.mint(address(vault), donated);
        assertEq(_available(BuybackTypes.SourceBucket.Membership), earned);
        assertEq(_available(BuybackTypes.SourceBucket.Donation), 0);
        assertEq(vault.syncDonation(address(paymentToken)), donated);
        assertEq(vault.syncDonation(address(paymentToken)), 0);
        assertEq(_available(BuybackTypes.SourceBucket.Membership), earned);
        assertEq(_available(BuybackTypes.SourceBucket.Donation), donated);
        assertEq(paymentToken.balanceOf(address(vault)), uint256(earned) + donated);
        assertEq(
            vault.inventory(address(paymentToken), BuybackTypes.SourceBucket.Membership)
            .totalReceived,
            earned
        );
    }

    function testDonationCannotBeRelabeledOrReceiptReplayed() public {
        paymentToken.mint(address(vault), 7);
        vault.syncDonation(address(paymentToken));
        vm.expectRevert(ProtocolBuybackVault.InsufficientBacking.selector);
        tier.recordWithoutTransfer(7);
        paymentToken.mint(address(tier), 11);
        tier.release(11);
        vm.expectRevert(ProtocolBuybackVault.InsufficientBacking.selector);
        tier.recordWithoutTransfer(11);
        assertEq(_available(BuybackTypes.SourceBucket.Membership), 11);
        assertEq(_available(BuybackTypes.SourceBucket.Donation), 7);
    }

    function testZeroReceiptAndNativePaymentAssetAreRejected() public {
        vm.expectRevert(ProtocolBuybackVault.ZeroAmount.selector);
        tier.recordWithoutTransfer(0);
        SyntheticEarnedFeeTier invalidTier = new SyntheticEarnedFeeTier(IERC20(address(0)), vault);
        registry.register(address(invalidTier));
        vm.expectRevert(ProtocolBuybackVault.InvalidAsset.selector);
        invalidTier.recordWithoutTransfer(1);
    }

    function testUnaccountedDonationIsNotAbsorbedIntoAValidEarnedReceipt() public {
        paymentToken.mint(address(vault), 19);
        paymentToken.mint(address(tier), 13);
        tier.release(13);
        assertEq(_available(BuybackTypes.SourceBucket.Membership), 13);
        assertEq(_available(BuybackTypes.SourceBucket.Donation), 0);
        assertEq(vault.syncDonation(address(paymentToken)), 19);
        assertEq(paymentToken.balanceOf(address(vault)), 32);
    }

    function testShortTransferRevertsEntireRelease() public {
        AdversarialERC20 asset = new AdversarialERC20();
        SyntheticEarnedFeeTier shortTier = new SyntheticEarnedFeeTier(asset, vault);
        registry.register(address(shortTier));
        asset.mint(address(shortTier), 10);
        asset.setTransferBehavior(AdversarialERC20.Behavior.ShortTransfer);
        vm.expectRevert(ProtocolBuybackVault.InsufficientBacking.selector);
        shortTier.release(10);
        assertEq(asset.balanceOf(address(shortTier)), 10);
        assertEq(asset.balanceOf(address(vault)), 0);
        assertEq(vault.inventory(address(asset), BuybackTypes.SourceBucket.Membership).available, 0);
    }

    function testCallbackCannotStealAttributionDuringAtomicTransferAndRecord() public {
        AdversarialERC20 asset = new AdversarialERC20();
        SyntheticEarnedFeeTier callbackTier = new SyntheticEarnedFeeTier(asset, vault);
        registry.register(address(callbackTier));
        asset.mint(address(callbackTier), 10);
        asset.setCallback(address(vault), abi.encodeCall(vault.syncDonation, (address(asset))));
        asset.setTransferBehavior(AdversarialERC20.Behavior.Callback);
        vm.expectRevert(ProtocolBuybackVault.InsufficientBacking.selector);
        callbackTier.release(10);
        assertEq(asset.balanceOf(address(callbackTier)), 10);
        assertEq(vault.inventory(address(asset), BuybackTypes.SourceBucket.Donation).available, 0);
    }

    function testNativeDonationsAndZeroSyncAreSeparateFromMembership() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(vault).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(vault.syncDonation(address(0)), 1 ether);
        vm.recordLogs();
        assertEq(vault.syncDonation(address(0)), 0);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(vault.inventory(address(0), BuybackTypes.SourceBucket.Membership).available, 0);
    }

    function testNoWithdrawalUpgradeRecipientOrArbitraryExecutionSurface() public {
        paymentToken.mint(address(tier), 100);
        tier.release(100);
        bytes[] memory calls = new bytes[](5);
        calls[0] = abi.encodeWithSignature("withdraw(address,uint256)", address(paymentToken), 100);
        calls[1] = abi.encodeWithSignature("withdrawProtocolFees(address)", address(paymentToken));
        calls[2] = abi.encodeWithSignature("setFeeRecipient(address)", address(this));
        calls[3] =
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(this), bytes(""));
        calls[4] = abi.encodeWithSignature(
            "execute(address,bytes)",
            address(paymentToken),
            abi.encodeCall(paymentToken.transfer, (address(this), 100))
        );
        for (uint256 i; i < calls.length; ++i) {
            (bool success,) = address(vault).call(calls[i]);
            assertFalse(success);
        }
        assertEq(paymentToken.balanceOf(address(vault)), 100);
        assertEq(paymentToken.balanceOf(address(this)), 0);
    }

    function _available(BuybackTypes.SourceBucket bucket) private view returns (uint256) {
        return vault.inventory(address(paymentToken), bucket).available;
    }
}
