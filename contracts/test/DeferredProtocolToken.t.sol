// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";

import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {OnchainMetadataRenderer} from "../src/OnchainMetadataRenderer.sol";
import {ProtocolBurnRouter} from "../src/ProtocolBurnRouter.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {OnchainMediaStoreFactory} from "../src/media/OnchainMediaStoreFactory.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

contract DeferredProtocolTokenTest is Test {
    MembershipFactory factory;
    ProtocolBuybackVault vault;
    ProtocolBurnRouter router;
    MembershipTier tier;
    MockUSDG asset;

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0x150b7a02;
    }

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        asset = new MockUSDG();
        // No Pons fixture installed: membership deployment must not touch launch dependencies.
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(asset),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(0),
            MembershipTestConfig.tierCode(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(asset))
        );
        vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        router = ProtocolBurnRouter(factory.burnRouter());
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(asset)
        );
        config.protocolFeeBps = 2500;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.pricePerPeriod = 1000;
        config.periodDuration = 100;
        config.maxPrepaidPeriods = 12;
        tier = MembershipTier(factory.createTier(config));
        asset.mint(address(this), 5000);
        asset.approve(address(tier), 4000);
        tier.createMembership(4, address(0));
        vm.warp(1100);
    }

    function _collect() private {
        ProtocolBurnRouter.AdvanceTier[] memory tiers = new ProtocolBurnRouter.AdvanceTier[](1);
        tiers[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 25);
        ProtocolBurnRouter.Purchase[] memory purchases = new ProtocolBurnRouter.Purchase[](1);
        purchases[0] = ProtocolBurnRouter.Purchase(address(0), 0);
        vm.prank(address(0xBEEF));
        (, uint256 released, uint256 bought, uint256 burned) =
            router.advance(tiers, purchases, 1200);
        assertEq(released, 1);
        assertEq(bought, 0);
        assertEq(burned, 0);
    }

    function test_collectAndRefundBeforeLaunch() public {
        assertEq(factory.protocolToken(), address(0));
        assertEq(vault.executor(), address(0));
        _collect();
        assertEq(asset.balanceOf(address(vault)), 250);
        assertEq(tier.reserveState().unearnedScaled[3] / tier.ACCOUNTING_SCALE(), 750);
        uint256 gross = tier.refund(1, tier.ownerOf(1), 3000);
        assertEq(gross, 3000);
        assertEq(tier.reserveState().unearnedScaled[3], 0);
        assertEq(tier.protocolFeeEarnedHeld(), 0);
        assertEq(
            vault.inventory(address(asset), BuybackTypes.SourceBucket.Membership).available, 250
        );
    }

    function test_nativeDonationCannotBeMistakenForUnboundProtocolToken() public {
        vm.deal(address(vault), 1 ether);
        vault.syncDonation(address(0));
        vault.setBuybacksPaused(false);
        BuybackTypes.ProcessingState memory state =
            vault.processingStatus(address(0), BuybackTypes.SourceBucket.Donation);
        assertEq(uint256(state.status), uint256(BuybackTypes.Status.TokenNotLaunched));
        assertEq(state.available, 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector,
                BuybackTypes.Status.TokenNotLaunched
            )
        );
        vault.process(address(0), BuybackTypes.SourceBucket.Donation, 1 ether, 0, 1200);
        assertEq(address(vault).balance, 1 ether);
        assertEq(vault.settlementSequence(), 0);
    }

    function test_routesRequireLaunch() public {
        BuybackTypes.TypedRoute memory route;
        vm.expectRevert(ProtocolBuybackVault.ProtocolTokenNotLaunched.selector);
        vault.setRoute(address(0), route);
    }

    function test_onlyOwnerCanBindAndOnlyFactoryCanCallVault() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBEEF))
        );
        factory.bindProtocolToken(address(asset));
        vm.expectRevert(ProtocolBuybackVault.OnlyFactoryDeployment.selector);
        vault.bindProtocolToken(address(asset));
    }

    function test_failedBindingAtomicThenValidBindingPreservesFundsAndBurns() public {
        _collect();
        assertTrue(asset.transfer(address(vault), 100));
        vault.syncDonation(address(asset));
        vm.expectRevert(); // ERC20 with no authentic Pons launch binding.
        factory.bindProtocolToken(address(asset));
        assertEq(factory.protocolToken(), address(0));
        assertEq(vault.executor(), address(0));
        assertEq(asset.balanceOf(address(vault)), 350);
        SyntheticPonsBinding.bind(address(asset));
        factory.bindProtocolToken(address(asset));
        assertEq(factory.protocolToken(), address(asset));
        assertEq(vault.protocolToken(), address(asset));
        assertGt(vault.executor().code.length, 0);
        assertEq(asset.balanceOf(address(vault)), 350);
        assertEq(
            vault.inventory(address(asset), BuybackTypes.SourceBucket.Membership).available, 250
        );
        assertEq(vault.inventory(address(asset), BuybackTypes.SourceBucket.Donation).available, 100);
        assertTrue(vault.buybacksPaused());
        vault.setBuybacksPaused(false);
        uint256 supply = asset.totalSupply();
        vault.process(address(asset), BuybackTypes.SourceBucket.Membership, 250, 0, 1200);
        assertEq(asset.totalSupply(), supply - 250);
        assertEq(asset.balanceOf(address(vault)), 100);
        assertEq(tier.reserveState().unearnedScaled[3] / tier.ACCOUNTING_SCALE(), 750);
        vm.expectRevert(ProtocolBuybackVault.ProtocolTokenAlreadyBound.selector);
        factory.bindProtocolToken(address(asset));
        vm.expectRevert(ProtocolBuybackVault.ProtocolTokenAlreadyBound.selector);
        factory.bindProtocolToken(address(0));
    }

    function test_corruptedExecutorCodeCannotBindOrLoseCollectedFees() public {
        _collect();
        SyntheticPonsBinding.bind(address(asset));
        vm.etch(vault.executorCreationCodeStore(), hex"00");
        vm.expectRevert(ProtocolBuybackVault.ExecutorCreationCodeCorrupted.selector);
        factory.bindProtocolToken(address(asset));
        assertEq(factory.protocolToken(), address(0));
        assertEq(vault.executor(), address(0));
        assertEq(asset.balanceOf(address(vault)), 250);
    }

    function test_rejectZeroAndEOATokenWithoutChangingBinding() public {
        vm.expectRevert(ProtocolBuybackVault.InvalidAddress.selector);
        factory.bindProtocolToken(address(0));
        vm.expectRevert(ProtocolBuybackVault.InvalidAsset.selector);
        factory.bindProtocolToken(address(0xBEEF));
        assertEq(factory.protocolToken(), address(0));
        assertEq(vault.executor(), address(0));
    }
}
