// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

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
import {Test} from "forge-std/Test.sol";

contract ProtocolBurnRouterTest is Test {
    MembershipFactory factory;
    ProtocolBuybackVault vault;
    ProtocolBurnRouter router;
    MembershipTier tier;
    MockUSDG token;

    function setUp() public {
        vm.warp(1000);
        token = new MockUSDG();
        SyntheticPonsBinding.bind(address(token));
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(token),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(token)
        );
        vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        router = ProtocolBurnRouter(factory.burnRouter());
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(token)
        );
        config.protocolFeeBps = 2500;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.pricePerPeriod = 1000;
        config.periodDuration = 100;
        config.maxPrepaidPeriods = 12;
        tier = MembershipTier(factory.createTier(config));
        token.mint(address(this), 5000);
        token.approve(address(tier), 4000);
        tier.purchase(4, address(0));
        vm.warp(1100);
        vault.setBuybacksPaused(false);
    }

    function collections() internal view returns (ProtocolBurnRouter.Collection[] memory c) {
        c = new ProtocolBurnRouter.Collection[](1);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        c[0] = ProtocolBurnRouter.Collection(address(tier), ids);
    }

    function purchases() internal view returns (ProtocolBurnRouter.Purchase[] memory p) {
        p = new ProtocolBurnRouter.Purchase[](1);
        p[0] = ProtocolBurnRouter.Purchase(address(token), 0);
    }

    function test_anyWalletAccruesReleasesAndBurnsInOneCall() public {
        uint256 beforeSupply = token.totalSupply();
        vm.prank(address(0xBEEF));
        (uint256 released, uint256 bought, uint256 burned) =
            router.burn(collections(), purchases(), 1200);
        assertEq(released, 1);
        assertEq(bought, 1);
        assertEq(burned, 250);
        assertEq(beforeSupply - token.totalSupply(), 250);
        assertEq(tier.protocolFeeHoldings(), 750);
        assertEq(tier.totalProtocolFeeReleased(), 250);
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).available, 0);
        assertEq(tier.protocolFeeState(1).unearned, 750);
        assertEq(
            uint256(router.nextSource(address(token))), uint256(BuybackTypes.SourceBucket.Donation)
        );
    }

    function test_directBurnProcessesBothSourcesOnceWhenBothAreReady() public {
        assertTrue(token.transfer(address(vault), 100));
        vault.syncDonation(address(token));
        (, uint256 bought, uint256 burned) = router.burn(collections(), purchases(), 1200);
        assertEq(bought, 2);
        assertEq(burned, 350);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalBurned, 250
        );
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Donation).totalBurned, 100
        );
        assertEq(
            uint256(router.nextSource(address(token))),
            uint256(BuybackTypes.SourceBucket.Membership)
        );
    }

    function test_directBurnProcessesBothSourcesAfterDonationBecomesPreferred() public {
        router.burn(collections(), purchases(), 1200);
        assertTrue(token.transfer(address(vault), 100));
        vault.syncDonation(address(token));
        vm.warp(1200);
        (, uint256 bought, uint256 burned) = router.burn(collections(), purchases(), 1200);
        assertEq(bought, 2);
        assertEq(burned, 350);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalBurned, 500
        );
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Donation).totalBurned, 100
        );
        assertEq(
            uint256(router.nextSource(address(token))), uint256(BuybackTypes.SourceBucket.Donation)
        );
    }

    function test_pausedAndStalePurchasesPreserveDonationPreference() public {
        router.burn(collections(), purchases(), 1200);
        vm.warp(1200);
        vault.setBuybacksPaused(true);
        (, uint256 bought,) = router.burn(collections(), purchases(), 1400);
        assertEq(bought, 0);
        assertEq(
            uint256(router.nextSource(address(token))), uint256(BuybackTypes.SourceBucket.Donation)
        );
        vault.setBuybacksPaused(false);
        vm.warp(1300);
        ProtocolBurnRouter.Purchase[] memory p = purchases();
        p[0].revision = 99;
        (, bought,) = router.burn(collections(), p, 1400);
        assertEq(bought, 0);
        assertEq(
            uint256(router.nextSource(address(token))), uint256(BuybackTypes.SourceBucket.Donation)
        );
    }

    function test_secondSameBlockCallHasNoWorkAndCannotDoubleRelease() public {
        router.burn(collections(), purchases(), 1200);
        vm.expectRevert(ProtocolBurnRouter.NothingToDo.selector);
        router.burn(collections(), purchases(), 1200);
        assertEq(tier.totalProtocolFeeReleased(), 250);
    }

    function test_collectionCanProgressWhileBuybacksPaused() public {
        vault.setBuybacksPaused(true);
        (uint256 released, uint256 bought, uint256 burned) =
            router.burn(collections(), purchases(), 1200);
        assertEq(released, 1);
        assertEq(bought, 0);
        assertEq(burned, 0);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).available, 250
        );
    }

    function test_failedAccrualDoesNotBlockExistingDonationBurn() public {
        assertTrue(token.transfer(address(vault), 100));
        vault.syncDonation(address(token));
        ProtocolBurnRouter.Collection[] memory c = collections();
        c[0].tokenIds[0] = 999;
        (uint256 released, uint256 bought, uint256 burned) = router.burn(c, purchases(), 1200);
        assertEq(released, 0);
        assertEq(bought, 1);
        assertEq(burned, 100);
        assertEq(tier.totalProtocolFeeReleased(), 0);
    }

    function test_staleRevisionSkipsPurchaseButKeepsCollection() public {
        ProtocolBurnRouter.Purchase[] memory p = purchases();
        p[0].revision = 99;
        (, uint256 bought, uint256 burned) = router.burn(collections(), p, 1200);
        assertEq(bought, 0);
        assertEq(burned, 0);
        assertEq(tier.totalProtocolFeeReleased(), 250);
    }

    function test_deadlineAndUnregisteredTierRejectBeforeCollection() public {
        vm.expectRevert(ProtocolBurnRouter.DeadlineExpired.selector);
        router.burn(collections(), purchases(), 1099);
        ProtocolBurnRouter.Collection[] memory c = collections();
        c[0].tier = address(token);
        vm.expectRevert(ProtocolBurnRouter.UnregisteredTier.selector);
        router.burn(c, purchases(), 1200);
        assertEq(tier.totalProtocolFeeReleased(), 0);
    }

    function test_duplicateCurrenciesAndOversizedCollectionRejected() public {
        ProtocolBurnRouter.Purchase[] memory p = new ProtocolBurnRouter.Purchase[](2);
        p[0] = purchases()[0];
        p[1] = p[0];
        vm.expectRevert(ProtocolBurnRouter.InvalidBatch.selector);
        router.burn(collections(), p, 1200);
        ProtocolBurnRouter.Collection[] memory c = collections();
        c[0].tokenIds = new uint256[](101);
        vm.expectRevert(ProtocolBurnRouter.InvalidBatch.selector);
        router.burn(c, purchases(), 1200);
    }

    function test_helpersCannotBeCalledByUserAndRouterCannotAdministerVault() public {
        vm.expectRevert(ProtocolBurnRouter.OnlySelf.selector);
        router.collect(collections()[0]);
        vm.expectRevert(ProtocolBurnRouter.OnlySelf.selector);
        router.purchase(purchases()[0], BuybackTypes.SourceBucket.Membership, 1200);
        vm.prank(address(router));
        vm.expectRevert(ProtocolBuybackVault.OnlyProtocolAuthority.selector);
        vault.setBuybacksPaused(true);
    }
}

/// @dev Synthetic router-only fixture: models shared per-asset cooldown and process
/// failures. It does not execute a venue purchase or prove real vault settlement.
contract SyntheticRouterCooldownVault {
    address public immutable protocolToken;
    mapping(address asset => uint256) public lastBuyAt;
    mapping(address asset => uint256) public processCount;
    mapping(address asset => BuybackTypes.SourceBucket) public lastSource;
    mapping(address asset => bool) public failPurchases;
    bool public attemptReentry;
    bytes public reentryFailure;

    error SyntheticPurchaseFailure();

    constructor(address token_) {
        protocolToken = token_;
    }

    function canonicalAsset(address asset) external pure returns (address) {
        return asset;
    }

    function setFailPurchases(address asset, bool value) external {
        failPurchases[asset] = value;
    }

    function setAttemptReentry() external {
        attemptReentry = true;
    }

    // forge-lint: disable-next-item(block-timestamp)
    function processingStatus(address asset, BuybackTypes.SourceBucket)
        external
        view
        returns (BuybackTypes.ProcessingState memory state)
    {
        state.available = 100;
        state.maxInput = 1;
        if (lastBuyAt[asset] != 0 && block.timestamp < lastBuyAt[asset] + 60) {
            state.status = BuybackTypes.Status.Cooldown;
        }
    }

    function process(address asset, BuybackTypes.SourceBucket bucket, uint256, uint64, uint64)
        external
    {
        if (failPurchases[asset]) revert SyntheticPurchaseFailure();
        lastBuyAt[asset] = block.timestamp;
        lastSource[asset] = bucket;
        ++processCount[asset];
        if (attemptReentry) {
            try ProtocolBurnRouter(msg.sender)
                .burn(
                    new ProtocolBurnRouter.Collection[](0),
                    new ProtocolBurnRouter.Purchase[](0),
                    type(uint64).max
                ) {}
            catch (bytes memory reason) {
                reentryFailure = reason;
            }
        }
    }
}

contract ProtocolBurnRouterSyntheticCooldownTest is Test {
    SyntheticRouterCooldownVault vault;
    ProtocolBurnRouter router;
    address constant ASSET = address(0xA);
    address constant OTHER_ASSET = address(0xB);

    function setUp() public {
        vm.warp(1000);
        vault = new SyntheticRouterCooldownVault(address(new MockUSDG()));
        router = new ProtocolBurnRouter(address(0), address(vault));
    }

    function _burn(bool includeOther) internal returns (uint256 bought) {
        ProtocolBurnRouter.Purchase[] memory p =
            new ProtocolBurnRouter.Purchase[](includeOther ? 2 : 1);
        p[0] = ProtocolBurnRouter.Purchase(ASSET, 0);
        if (includeOther) p[1] = ProtocolBurnRouter.Purchase(OTHER_ASSET, 0);
        (, bought,) = router.burn(new ProtocolBurnRouter.Collection[](0), p, type(uint64).max);
    }

    function test_syntheticSuccessiveEligibleBatchesAlternateSources() public {
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Membership));
        for (uint256 i; i < 4; ++i) {
            vm.warp(1000 + i * 60);
            assertEq(_burn(false), 1);
            assertEq(vault.processCount(ASSET), i + 1);
            assertEq(uint256(vault.lastSource(ASSET)), i % 2);
            assertEq(uint256(router.nextSource(ASSET)), (i + 1) % 2);
        }
    }

    function test_syntheticCoolingAssetPreservesPreferenceWhileOtherAssetSucceeds() public {
        _burn(false);
        assertEq(_burn(true), 1);
        assertEq(vault.processCount(ASSET), 1);
        assertEq(vault.processCount(OTHER_ASSET), 1);
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
        vm.warp(1060);
        assertEq(_burn(false), 1);
        assertEq(uint256(vault.lastSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
    }

    function test_syntheticPurchaseFailurePreservesPreferenceAndOtherAssetProgress() public {
        _burn(false);
        vm.warp(1060);
        vault.setFailPurchases(ASSET, true);
        assertEq(_burn(true), 1);
        assertEq(vault.processCount(ASSET), 1);
        assertEq(vault.processCount(OTHER_ASSET), 1);
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
        vault.setFailPurchases(ASSET, false);
        assertEq(_burn(false), 1);
        assertEq(uint256(vault.lastSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
    }

    function test_syntheticPurchaseCallbackCannotReenterBurn() public {
        vault.setAttemptReentry();
        assertEq(_burn(false), 1);
        assertEq(vault.reentryFailure(), abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        assertEq(vault.processCount(ASSET), 1);
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
    }
}
