// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

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
import {
    AdvanceFaultRegistry,
    AdvanceFaultTier,
    AdvanceFaultVault,
    AdvanceMeasurementToken,
    AdvanceStageFault
} from "./mocks/BuybackFaults.sol";
import {MockUSDG} from "./mocks/MockUSDG.sol";
import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

contract ProtocolBurnRouterTest is Test {
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0x150b7a02;
    }
    MembershipFactory factory;
    ProtocolBuybackVault vault;
    ProtocolBurnRouter router;
    MembershipTier tier;
    MockUSDG token;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        token = new MockUSDG();
        SyntheticPonsBinding.bind(address(token));
        factory = new MembershipFactory(
            MembershipTestConfig.paymentTokens(token),
            address(new OnchainMediaStoreFactory()),
            address(this),
            address(token),
            MembershipTestConfig.implementation(),
            MembershipTestConfig.minimumPayments(MembershipTestConfig.paymentTokens(token))
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
        tier.createMembership(4, address(0), 25);
        vm.warp(1100);
        vault.setBuybacksPaused(false);
    }

    function advanceTiers() internal view returns (ProtocolBurnRouter.AdvanceTier[] memory c) {
        c = new ProtocolBurnRouter.AdvanceTier[](1);
        c[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 25);
    }

    function purchases() internal view returns (ProtocolBurnRouter.Purchase[] memory p) {
        p = new ProtocolBurnRouter.Purchase[](1);
        p[0] = ProtocolBurnRouter.Purchase(address(token), 0);
    }

    function test_operatorModeSkipsMarketsWhilePublicAccountingReleaseAndDirectBurnWork() public {
        vm.deal(address(vault), 100);
        vault.syncDonation(address(0));
        ProtocolBurnRouter.Purchase[] memory items = new ProtocolBurnRouter.Purchase[](2);
        items[0] = ProtocolBurnRouter.Purchase(address(0), 0);
        items[1] = ProtocolBurnRouter.Purchase(address(token), 0);
        vm.prank(address(0xBEEF));
        (, uint256 released, uint256 bought, uint256 burned) =
            router.advance(advanceTiers(), items, 1200);
        assertEq(released, 1);
        assertEq(bought, 1);
        assertEq(burned, 250);
        assertEq(vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).available, 100);
        assertEq(
            uint256(vault.processingStatus(address(0), BuybackTypes.SourceBucket.Donation).status),
            uint256(BuybackTypes.Status.OperatorOnly)
        );
    }

    function test_anyWalletAdvancesReleasesAndBurnsInOneCall() public {
        uint256 beforeSupply = token.totalSupply();
        vm.prank(address(0xBEEF));
        (, uint256 released, uint256 bought, uint256 burned) =
            router.advance(advanceTiers(), purchases(), 1200);
        assertEq(released, 1);
        assertEq(bought, 1);
        assertEq(burned, 250);
        assertEq(beforeSupply - token.totalSupply(), 250);
        assertEq(tier.reserveState().unearnedScaled[3] / tier.ACCOUNTING_SCALE(), 750);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 250
        );
        assertEq(token.balanceOf(address(router)), 0);
        assertEq(vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).available, 0);
        assertEq(tier.reserveState().unearnedScaled[3] / tier.ACCOUNTING_SCALE(), 750);
        assertEq(
            uint256(router.nextSource(address(token))), uint256(BuybackTypes.SourceBucket.Donation)
        );
    }

    function test_directBurnProcessesBothSourcesOnceWhenBothAreReady() public {
        assertTrue(token.transfer(address(vault), 100));
        vault.syncDonation(address(token));
        (,, uint256 bought, uint256 burned) = router.advance(advanceTiers(), purchases(), 1200);
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
        router.advance(advanceTiers(), purchases(), 1200);
        assertTrue(token.transfer(address(vault), 100));
        vault.syncDonation(address(token));
        vm.warp(1200);
        (,, uint256 bought, uint256 burned) = router.advance(advanceTiers(), purchases(), 1200);
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
        router.advance(advanceTiers(), purchases(), 1200);
        vm.warp(1200);
        vault.setBuybacksPaused(true);
        (,, uint256 bought,) = router.advance(advanceTiers(), purchases(), 1400);
        assertEq(bought, 0);
        assertEq(
            uint256(router.nextSource(address(token))), uint256(BuybackTypes.SourceBucket.Donation)
        );
        vault.setBuybacksPaused(false);
        vm.warp(1300);
        ProtocolBurnRouter.Purchase[] memory p = purchases();
        p[0].revision = 99;
        vm.expectRevert(ProtocolBurnRouter.StaleRevision.selector);
        router.advance(advanceTiers(), p, 1400);
        assertEq(
            uint256(router.nextSource(address(token))), uint256(BuybackTypes.SourceBucket.Donation)
        );
    }

    function test_secondSameBlockCallHasNoWorkAndCannotDoubleRelease() public {
        router.advance(advanceTiers(), purchases(), 1200);
        vm.expectRevert(ProtocolBurnRouter.NothingToDo.selector);
        router.advance(advanceTiers(), purchases(), 1200);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 250
        );
    }

    function test_accountingCanProgressWhileBuybacksPaused() public {
        vault.setBuybacksPaused(true);
        (, uint256 released, uint256 bought, uint256 burned) =
            router.advance(advanceTiers(), purchases(), 1200);
        assertEq(released, 1);
        assertEq(bought, 0);
        assertEq(burned, 0);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).available, 250
        );
    }

    function test_failedAccountingRollsBackAndDonationCanBurnSeparately() public {
        assertTrue(token.transfer(address(vault), 100));
        vault.syncDonation(address(token));
        vm.mockCallRevert(
            address(tier),
            abi.encodeWithSelector(tier.processAccounting.selector),
            abi.encodeWithSignature("AccountingFailure()")
        );
        vm.expectRevert(abi.encodeWithSignature("AccountingFailure()"));
        router.advance(advanceTiers(), purchases(), 1200);
        assertEq(tier.accountingStatus().accountedThrough, 1000);
        (uint256 bought, uint256 burned) = router.buyback(purchases(), 1200);
        assertEq(bought, 1);
        assertEq(burned, 100);
    }

    function test_staleRevisionRollsBackAccountingAndRelease() public {
        ProtocolBurnRouter.Purchase[] memory p = purchases();
        p[0].revision = 99;
        vm.expectRevert(ProtocolBurnRouter.StaleRevision.selector);
        router.advance(advanceTiers(), p, 1200);
        assertEq(tier.accountingStatus().accountedThrough, 1000);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 0
        );
    }

    function test_deadlineAndUnregisteredTierRejectBeforeAccounting() public {
        vm.expectRevert(ProtocolBurnRouter.DeadlineExpired.selector);
        router.advance(advanceTiers(), purchases(), 1099);
        ProtocolBurnRouter.AdvanceTier[] memory c = advanceTiers();
        c[0].tier = address(token);
        vm.expectRevert(ProtocolBurnRouter.UnregisteredTier.selector);
        router.advance(c, purchases(), 1200);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 0
        );
    }

    function test_duplicateCurrenciesRejectedAndCallerBudgetAccepted() public {
        ProtocolBurnRouter.Purchase[] memory p = new ProtocolBurnRouter.Purchase[](2);
        p[0] = purchases()[0];
        p[1] = p[0];
        vm.expectRevert(ProtocolBurnRouter.InvalidBatch.selector);
        router.advance(advanceTiers(), p, 1200);
        ProtocolBurnRouter.AdvanceTier[] memory c = advanceTiers();
        c[0].maxAccountingSteps = 101;
        router.advance(c, purchases(), 1200);
    }

    function test_zeroBudgetReleasesSettledFundsWithoutMovingCursor() public {
        tier.processAccounting(25);
        vm.warp(1150);
        ProtocolBurnRouter.AdvanceTier[] memory items = advanceTiers();
        items[0].maxAccountingSteps = 0;
        (uint256 steps, uint256 released, uint256 bought, uint256 burned) =
            router.advance(items, new ProtocolBurnRouter.Purchase[](0), 1200);
        assertEq(steps, 0);
        assertEq(released, 1);
        assertEq(bought, 0);
        assertEq(burned, 0);
        assertEq(tier.accountingStatus().accountedThrough, 1100);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 250
        );
    }

    function test_failedReleaseRollsBackAndAccountingCanRunSeparately() public {
        vm.mockCallRevert(
            address(tier),
            abi.encodeWithSelector(tier.releaseProtocolFees.selector),
            abi.encodeWithSignature("ReleaseFailure()")
        );
        vm.expectRevert(abi.encodeWithSignature("ReleaseFailure()"));
        router.advance(advanceTiers(), new ProtocolBurnRouter.Purchase[](0), 1200);
        assertEq(tier.accountingStatus().accountedThrough, 1000);
        router.advanceAccounting(advanceTiers());
        assertEq(tier.protocolFeeEarnedHeld(), 250);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 0
        );
    }

    function test_duplicateAndUnsortedTiersFailBeforeAnyAccounting() public {
        ProtocolBurnRouter.AdvanceTier[] memory items = new ProtocolBurnRouter.AdvanceTier[](2);
        items[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 12);
        items[1] = items[0];
        vm.expectRevert(ProtocolBurnRouter.InvalidBatch.selector);
        router.advance(items, new ProtocolBurnRouter.Purchase[](0), 1200);
        assertEq(tier.accountingStatus().accountedThrough, 1000);

        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(token)
        );
        config.tierSalt = bytes32(uint256(2));
        address other = factory.createTier(config);
        // CREATE2 addresses change with implementation bytecode; explicitly order descending.
        items[0] = ProtocolBurnRouter.AdvanceTier(other > address(tier) ? other : address(tier), 12);
        items[1] = ProtocolBurnRouter.AdvanceTier(other > address(tier) ? address(tier) : other, 51);
        vm.expectRevert(ProtocolBurnRouter.InvalidBatch.selector);
        router.advance(items, new ProtocolBurnRouter.Purchase[](0), 1200);
        assertEq(tier.accountingStatus().accountedThrough, 1000);
    }

    function test_emptyRequestHasNoUsefulWork() public {
        vm.expectRevert(ProtocolBurnRouter.NothingToDo.selector);
        router.advance(
            new ProtocolBurnRouter.AdvanceTier[](0), new ProtocolBurnRouter.Purchase[](0), 1200
        );
    }

    function test_requestedBudgetIsMaximumAndEqualTimeProgressCanResumeWithoutEarningAgain()
        public
    {
        for (uint256 i; i < 3; ++i) {
            address member = address(SafeCast.toUint160(0x100 + i));
            token.mint(member, 1000);
            vm.startPrank(member);
            token.approve(address(tier), 1000);
            tier.createMembership(1, address(0), 25);
            vm.stopPrank();
        }
        vm.warp(1200);
        ProtocolBurnRouter.AdvanceTier[] memory items = advanceTiers();
        items[0].maxAccountingSteps = 2;
        ProtocolBurnRouter.Purchase[] memory none = new ProtocolBurnRouter.Purchase[](0);
        (uint256 steps, uint256 released, uint256 bought, uint256 burned) =
            router.advance(items, none, 1200);
        assertEq(steps, 2);
        assertEq(released, 1);
        assertEq(bought + burned, 0);
        assertEq(tier.accountingStatus().accountedThrough, 1200);
        assertFalse(tier.accountingStatus().complete);
        uint256 received =
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived;
        items[0].maxAccountingSteps = 25;
        (steps, released,,) = router.advance(items, none, 1200);
        assertEq(steps, 4, "one funding boundary and three retirements remain");
        assertEq(released, 0, "the same interval cannot earn twice");
        assertTrue(tier.accountingStatus().complete);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived,
            received
        );
        vm.expectRevert(ProtocolBurnRouter.NothingToDo.selector);
        router.advance(items, none, 1200);
    }

    function test_accountingOnlyPaysNoWorkerAndDoesNotCallVaultOrRelease() public {
        vm.mockCallRevert(
            address(tier), abi.encodeWithSelector(tier.releaseProtocolFees.selector), hex"abcd"
        );
        vm.mockCallRevert(
            address(vault), abi.encodeWithSelector(vault.protocolToken.selector), hex"abcd"
        );
        address worker = address(0xBEEF);
        vm.prank(worker);
        assertEq(router.advanceAccounting(advanceTiers()), 0);
        assertEq(tier.protocolFeeEarnedHeld(), 250);
        assertEq(token.balanceOf(worker), 0);
        vm.expectRevert(ProtocolBurnRouter.NothingToDo.selector);
        router.advanceAccounting(advanceTiers());
    }

    function test_acceptsNineTiersAndThirtyThreePurchases() public {
        ProtocolBurnRouter.AdvanceTier[] memory items = new ProtocolBurnRouter.AdvanceTier[](9);
        items[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 26);
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), tier.renderer(), address(token));
        for (uint256 i = 1; i < items.length; ++i) {
            config.tierSalt = bytes32(i);
            items[i] = ProtocolBurnRouter.AdvanceTier(factory.createTier(config), 26);
        }
        for (uint256 i = 1; i < items.length; ++i) {
            for (uint256 j = i; j > 0 && items[j].tier < items[j - 1].tier; --j) {
                (items[j], items[j - 1]) = (items[j - 1], items[j]);
            }
        }
        ProtocolBurnRouter.Purchase[] memory buys = new ProtocolBurnRouter.Purchase[](33);
        for (uint256 i; i < buys.length; ++i) {
            buys[i] = ProtocolBurnRouter.Purchase(address(SafeCast.toUint160(i + 1)), 0);
        }
        (, uint256 released, uint256 bought,) = router.advance(items, buys, 1200);
        assertEq(released, 1);
        assertEq(bought, 0);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).available, 250
        );
    }

    function test_invalidLargeBatchesRejectBeforeAnyWork() public {
        ProtocolBurnRouter.AdvanceTier[] memory tooMany = new ProtocolBurnRouter.AdvanceTier[](9);
        vm.expectRevert(ProtocolBurnRouter.UnregisteredTier.selector);
        router.advance(tooMany, new ProtocolBurnRouter.Purchase[](0), 1200);
        vm.expectRevert(ProtocolBurnRouter.InvalidBatch.selector);
        router.advance(advanceTiers(), new ProtocolBurnRouter.Purchase[](33), 1200);
        assertEq(tier.accountingStatus().accountedThrough, 1000);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 0
        );
    }

    function test_twoTiersCanUseExactlyTheSharedBudgetWithoutMixingMoney() public {
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this), address(new OnchainMetadataRenderer()), address(token)
        );
        config.tierSalt = bytes32(uint256(22));
        config.pricePerPeriod = 1000;
        config.periodDuration = 100;
        config.protocolFeeBps = 1000;
        MembershipTier other = MembershipTier(factory.createTier(config));
        token.approve(address(other), 1000);
        other.createMembership(1, address(0), 25);
        vm.warp(1200);
        ProtocolBurnRouter.AdvanceTier[] memory items = new ProtocolBurnRouter.AdvanceTier[](2);
        items[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 12);
        items[1] = ProtocolBurnRouter.AdvanceTier(address(other), 13);
        if (items[0].tier > items[1].tier) (items[0], items[1]) = (items[1], items[0]);
        (uint256 steps, uint256 released,,) =
            router.advance(items, new ProtocolBurnRouter.Purchase[](0), 1200);
        assertEq(steps, 2, "funding end and expiration both consume work");
        assertEq(released, 2, "return value counts tiers, never sums arbitrary currencies");
        assertTrue(tier.accountingStatus().complete);
        assertTrue(other.accountingStatus().complete);
        assertEq(
            vault.inventory(address(token), BuybackTypes.SourceBucket.Membership).totalReceived, 600
        );
    }

    function test_routerCannotAdministerVault() public {
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
                .advance(
                    new ProtocolBurnRouter.AdvanceTier[](0),
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

    function _advance(bool includeOther) internal returns (uint256 bought) {
        ProtocolBurnRouter.Purchase[] memory p =
            new ProtocolBurnRouter.Purchase[](includeOther ? 2 : 1);
        p[0] = ProtocolBurnRouter.Purchase(ASSET, 0);
        if (includeOther) p[1] = ProtocolBurnRouter.Purchase(OTHER_ASSET, 0);
        (,, bought,) = router.advance(new ProtocolBurnRouter.AdvanceTier[](0), p, type(uint64).max);
    }

    function test_syntheticSuccessiveEligibleBatchesAlternateSources() public {
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Membership));
        for (uint256 i; i < 4; ++i) {
            vm.warp(1000 + i * 60);
            assertEq(_advance(false), 1);
            assertEq(vault.processCount(ASSET), i + 1);
            assertEq(uint256(vault.lastSource(ASSET)), i % 2);
            assertEq(uint256(router.nextSource(ASSET)), (i + 1) % 2);
        }
    }

    function test_syntheticCoolingAssetPreservesPreferenceWhileOtherAssetSucceeds() public {
        _advance(false);
        assertEq(_advance(true), 1);
        assertEq(vault.processCount(ASSET), 1);
        assertEq(vault.processCount(OTHER_ASSET), 1);
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
        vm.warp(1060);
        assertEq(_advance(false), 1);
        assertEq(uint256(vault.lastSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
    }

    function test_syntheticPurchaseFailureRollsBackOtherAssetProgress() public {
        _advance(false);
        vm.warp(1060);
        vault.setFailPurchases(ASSET, true);
        vm.expectRevert(SyntheticRouterCooldownVault.SyntheticPurchaseFailure.selector);
        _advance(true);
        assertEq(vault.processCount(ASSET), 1);
        assertEq(vault.processCount(OTHER_ASSET), 0);
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
        vault.setFailPurchases(ASSET, false);
        assertEq(_advance(false), 1);
        assertEq(uint256(vault.lastSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
    }

    function test_syntheticPurchaseCallbackCannotReenterAdvance() public {
        vault.setAttemptReentry();
        assertEq(_advance(false), 1);
        assertEq(vault.reentryFailure(), abi.encodeWithSignature("ReentrancyGuardReentrantCall()"));
        assertEq(vault.processCount(ASSET), 1);
        assertEq(uint256(router.nextSource(ASSET)), uint256(BuybackTypes.SourceBucket.Donation));
    }
}

/// @dev Real router with synthetic adversarial endpoints. This proves stage
/// atomic rollback, not asset custody or venue behavior.
contract ProtocolBurnRouterStageFaultTest is Test {
    AdvanceFaultTier private tier;
    AdvanceFaultVault private vault;
    AdvanceMeasurementToken private token;
    ProtocolBurnRouter private router;

    function setUp() public {
        vm.warp(1000);
        token = new AdvanceMeasurementToken();
        tier = new AdvanceFaultTier(address(token));
        vault = new AdvanceFaultVault(token);
        router = new ProtocolBurnRouter(
            address(new AdvanceFaultRegistry(address(tier))), address(vault)
        );
    }

    function _advance()
        private
        returns (uint256 steps, uint256 releases, uint256 buys, uint256 burns)
    {
        ProtocolBurnRouter.AdvanceTier[] memory items = new ProtocolBurnRouter.AdvanceTier[](1);
        items[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 2);
        ProtocolBurnRouter.Purchase[] memory purchase = new ProtocolBurnRouter.Purchase[](1);
        purchase[0] = ProtocolBurnRouter.Purchase(address(token), 0);
        return router.advance{gas: 18_000_000}(items, purchase, 1000);
    }

    function testFuzz_successCannotMeanGasStarvedPartialWork(uint32 suppliedGas) public {
        uint256 gasLimit = bound(uint256(suppliedGas), 25_000, 1_000_000);
        ProtocolBurnRouter.AdvanceTier[] memory items = new ProtocolBurnRouter.AdvanceTier[](1);
        items[0] = ProtocolBurnRouter.AdvanceTier(address(tier), 2);
        ProtocolBurnRouter.Purchase[] memory purchase = new ProtocolBurnRouter.Purchase[](1);
        purchase[0] = ProtocolBurnRouter.Purchase(address(token), 0);
        (bool ok,) = address(router).call{gas: gasLimit}(
            abi.encodeCall(router.advance, (items, purchase, 1000))
        );
        assertEq(tier.accounted(), ok ? 1 : 0);
        assertEq(tier.released(), ok ? 1 : 0);
        assertEq(vault.purchases(), ok ? 2 : 0);
    }

    function test_allStageFaultsRollbackEntireCall() public {
        for (uint256 stage; stage < 4; ++stage) {
            for (uint256 fault = 1; fault <= (stage == 0 ? 5 : stage == 2 ? 3 : 4); ++fault) {
                uint256 checkpoint = vm.snapshotState();
                AdvanceStageFault.Fault mode = AdvanceStageFault.Fault(fault);
                if (stage == 0) tier.configure(mode, AdvanceStageFault.Fault.None);
                if (stage == 1) tier.configure(AdvanceStageFault.Fault.None, mode);
                if (stage == 2) vault.configure(mode);
                if (stage == 3) token.configure(AdvanceStageFault.Fault.None, mode);
                vm.expectRevert();
                _advance();
                assertEq(tier.accounted(), 0);
                assertEq(tier.released(), 0);
                assertEq(vault.purchases(), 0);
                assertEq(uint256(router.nextSource(address(token))), 0);
                assertTrue(vm.revertToState(checkpoint));
            }
        }
    }
}
