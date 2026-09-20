// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {PonsBuybackModule} from "../src/PonsBuybackModule.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {IPonsBuybackModule} from "../src/interfaces/IPonsBuybackModule.sol";
import {BuybackIntegration as Integration} from "../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {BuybackTestCalls} from "./helpers/BuybackTestCalls.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {
    SyntheticConversionBinding,
    SyntheticLiquidityBank,
    SyntheticTwoLegRouter
} from "./helpers/SyntheticConversionBinding.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {FaultBondingCurve, FaultBurnToken, SyntheticWrappedEther} from "./mocks/BuybackFaults.sol";
import {BuybackModel} from "./models/BuybackModel.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Synthetic faults complement, and never replace, authentic venue tests.
contract PonsBuybackModuleTest is Test {
    using BuybackTestCalls for ProtocolBuybackVault;

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0x150b7a02;
    }

    using BuybackModel for BuybackModel.Book;
    BuybackModel.Book private _book;
    FaultBurnToken internal token;
    FaultBondingCurve internal curve;
    MembershipFactory internal factory;
    ProtocolBuybackVault internal vault;
    PonsBuybackModule internal module;
    uint64 internal activeRevision;
    BuybackTypes.SourceBucket internal constant DONATION = BuybackTypes.SourceBucket.Donation;

    function setUp() public {
        new LinkedVestingFixture().install();
        vm.warp(1000);
        token = new FaultBurnToken();
        curve = new FaultBondingCurve(address(token));
        token.mint(address(curve), 1e30);
        SyntheticPonsBinding.installDependencies();
        SyntheticPonsBinding.bindLaunch(address(token), address(curve));
        IERC20[] memory assets = new IERC20[](1);
        assets[0] = IERC20(address(token));
        address media = deployCode("OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory");
        factory = MembershipFactory(
            deployCode(
                "MembershipFactory.sol:MembershipFactory",
                abi.encode(
                    assets,
                    media,
                    address(this),
                    address(token),
                    MembershipTestConfig.implementation(),
                    MembershipTestConfig.minimumPayments(assets)
                )
            )
        );
        vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        module = PonsBuybackModule(payable(vault.activeModule()));
        module.setRoute(address(0), BuybackTypes.TypedRoute(new PoolKey[](0)));
        _limits(1, 100, 0);
        module.setExecutionMode(BuybackTypes.ExecutionMode.PermissionlessGuarded);
        vault.setBuybacksPaused(false);
        _fund(1000);
    }

    function _limits(uint128 minimum, uint128 maximum, uint64 interval) internal {
        module.setLimits(address(0), BuybackTypes.ExecutionLimits(minimum, maximum, interval));
        _allowPolicy(address(0));
        activeRevision = module.revision(address(0));
    }

    /// @dev Explicit permissive test policy isolates settlement regressions; economic bounds have separate tests.
    function _allowPolicy(address asset) internal {
        BuybackTypes.OutputRate[] memory rates =
            new BuybackTypes.OutputRate[](module.route(asset).pools.length + 1);
        for (uint256 i; i < rates.length; ++i) {
            rates[i] = BuybackTypes.OutputRate(1, 1e30);
        }
        module.setPermissionlessPolicy(asset, BuybackTypes.Lifecycle.Bonding, rates, 0, 0);
    }

    function _fund(uint256 amount) internal {
        vm.deal(address(this), amount);
        (bool sent,) = address(vault).call{value: amount}("");
        assertTrue(sent);
        vault.syncDonation(address(0));
    }

    function _process(uint256 amount) internal {
        vault.processPons(address(0), DONATION, amount, activeRevision, uint64(block.timestamp));
    }

    function test_oneHundredOriginalUnitsConvertToOneETHWithPointFourResidualInEachSourceBucket()
        public
    {
        SyntheticConversionBinding.install();
        AdversarialERC20 payment = new AdversarialERC20();
        factory.setMinimumPayment(address(payment), 1);
        factory.setPaymentTokenEnabled(address(payment), true);
        address renderer = deployCode("OnchainMetadataRenderer.sol:OnchainMetadataRenderer");
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer, address(payment));
        config.protocolFeeBps = 10_000;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.pricePerPeriod = 100;
        config.periodDuration = 1;
        MembershipTier tier = MembershipTier(factory.createTier(config));
        payment.mint(address(this), 300);
        payment.approve(address(tier), 200);
        uint256 id = tier.createMembership(2, address(0), 25);
        vm.warp(block.timestamp + 1);
        assertEq(id, 1);
        tier.processAccounting(25);
        assertEq(tier.releaseProtocolFees(), 100);
        assertTrue(payment.transfer(address(vault), 100));
        vault.syncDonation(address(payment));
        uint256 protected = tier.totalProtectedLiability();
        assertEq(protected, 100);
        PoolKey[] memory pools = new PoolKey[](1);
        pools[0] = PoolKey(
            Currency.wrap(address(0)), Currency.wrap(address(payment)), 100, 1, IHooks(address(0))
        );
        module.setRoute(address(payment), BuybackTypes.TypedRoute(pools));
        module.setLimits(address(payment), BuybackTypes.ExecutionLimits(1, 100, 0));
        _allowPolicy(address(payment));
        curve.configure(6000, 1, 1, 0);
        uint256 supply = token.totalSupply();
        for (uint8 b; b < 2; ++b) {
            _book.receiveFunds(address(payment), b, 100);
            _book.convert(address(payment), address(0), b, 100, 1 ether);
            _book.convert(address(0), address(token), b, 0.6 ether, 0.6 ether);
            _book.burn(address(token), b, 0.6 ether);
            vault.processPons(address(payment), BuybackTypes.SourceBucket(b), 100, 3, 1900);
            BuybackTypes.Inventory memory original =
                vault.inventory(address(payment), BuybackTypes.SourceBucket(b));
            assertEq(original.available, _book.available(address(payment), b));
            assertEq(original.totalReceived, 100);
            assertEq(original.totalSpent, 100);
            BuybackTypes.Inventory memory eth =
                vault.inventory(address(0), BuybackTypes.SourceBucket(b));
            assertEq(eth.available, _book.available(address(0), b) + (b == 1 ? 1000 : 0));
            assertEq(eth.totalConvertedIn, 1 ether);
            assertEq(eth.totalSpent, 0.6 ether);
            assertEq(
                vault.inventory(address(token), BuybackTypes.SourceBucket(b)).totalBurned, 0.6 ether
            );
            assertEq(payment.balanceOf(address(tier)), protected);
            assertEq(tier.totalProtectedLiability(), protected);
        }
        assertEq(vault.inventory(address(payment), DONATION).totalSpent, 100);
        assertEq(token.totalSupply(), supply - 1.2 ether);
        assertEq(address(vault).balance, 0.8 ether + 1000);
        assertEq(payment.allowance(vault.activeModule(), Integration.PERMIT2), 0);
    }

    function test_onlyVaultCanExecuteAndThereIsNoCallerRecipient() public {
        BuybackTypes.TypedRoute memory route;
        IPonsBuybackModule executor = IPonsBuybackModule(vault.activeModule());
        vm.expectRevert(PonsBuybackModule.OnlyVault.selector);
        executor.execute(
            address(this),
            address(0),
            DONATION,
            100,
            1900,
            abi.encode(uint64(0), route, new uint256[](0))
        );
        vm.deal(address(this), 1);
        (bool sent,) = vault.activeModule().call{value: 1}("");
        assertFalse(sent);
    }

    function test_actualPartialFillConsumesOnlySixtyAndPreservesFortyAsOriginalSource() public {
        curve.configure(6000, 1, 1, 0);
        uint256 supply = token.totalSupply();
        _process(100);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 60);
        assertEq(vault.inventory(address(0), DONATION).available, 940);
        assertEq(address(vault).balance, 940);
        assertEq(vault.inventory(address(token), DONATION).totalBurned, 60);
        assertEq(token.totalSupply(), supply - 60);
    }

    function test_priceMovementDoesNotRequireAReplacementAuthorization() public {
        curve.configure(10_000, 1, 1, 1);
        uint256 supply = token.totalSupply();
        _process(100);
        assertEq(token.totalSupply(), supply - 99);
        assertEq(module.lastBuyAt(), 1000);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 100);
    }

    function test_zeroOutputAndNoOpOrExcessBurnCannotConsumeInventoryOrCooldown() public {
        for (uint256 mode; mode < 3; ++mode) {
            if (mode == 0) {
                curve.configure(10_000, 0, 1, 0);
            } else {
                curve.configure(10_000, 1, 1, 0);
                token.setBurnMode(SafeCast.toUint8(mode));
            }
            token.mint(address(vault), 1);
            vault.syncDonation(address(token));
            uint256 supply = token.totalSupply();
            vm.expectRevert(
                mode == 0
                    ? PonsBuybackModule.InexactSettlement.selector
                    : ProtocolBuybackVault.InexactSettlement.selector
            );
            _process(100);
            assertEq(vault.inventory(address(0), DONATION).totalSpent, 0);
            assertEq(token.totalSupply(), supply);
            assertEq(address(vault).balance, 1000);
            assertEq(module.lastBuyAt(), 0);
            assertEq(module.lastAssetBuyAt(address(0)), 0);
        }
    }

    function test_cooldownRejectsBackToBackCallsAndSurvivesAllConfigurationChanges() public {
        _limits(50, 100, 60);
        module.setGlobalMinInterval(30);
        _process(100);
        vault.setBuybacksPaused(true);
        module.setAssetBuybacksPaused(address(0), true);
        vault.setBuybacksPaused(false);
        module.setAssetBuybacksPaused(address(0), false);
        module.setRoute(address(0), BuybackTypes.TypedRoute(new PoolKey[](0)));
        _limits(50, 100, 60);
        module.setGlobalMinInterval(30);
        assertEq(module.lastBuyAt(), 1000);
        assertEq(module.lastAssetBuyAt(address(0)), 1000);
        vm.warp(1059);
        vm.expectRevert(
            abi.encodeWithSelector(
                PonsBuybackModule.ProcessingUnavailable.selector, BuybackTypes.Status.Cooldown
            )
        );
        _process(100);
        assertEq(module.processingStatus(address(0), DONATION).nextEligibleAt, 1060);
        vm.warp(1060);
        _process(100);
        assertEq(module.lastBuyAt(), 1060);
    }

    function test_deadlineRevisionAndAmountsAreCheckedAndStandingLimitsNeverExpire() public {
        vm.expectRevert(ProtocolBuybackVault.StaleRevision.selector);
        vault.processPons(address(0), DONATION, 100, 1, 1900);
        vm.expectRevert(PonsBuybackModule.DeadlineExpired.selector);
        vault.processPons(address(0), DONATION, 100, 3, 999);
        vm.expectRevert(ProtocolBuybackVault.InvalidAmount.selector);
        _process(101);
        vm.expectRevert(ProtocolBuybackVault.InvalidAmount.selector);
        _process(0);
        _limits(50, 100, 0);
        vm.expectRevert(ProtocolBuybackVault.InvalidAmount.selector);
        _process(49);
        vm.warp(1000 + 365 days);
        _process(100);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 100);
    }

    function test_launchPenaltyAndGraduationPendingCannotLeaveConversionOnlySuccess() public {
        curve.setLifecycle(1, false, false);
        vm.expectRevert(
            abi.encodeWithSelector(
                PonsBuybackModule.ProcessingUnavailable.selector, BuybackTypes.Status.LaunchPenalty
            )
        );
        _process(100);
        curve.setLifecycle(0, true, false);
        vm.expectRevert(
            abi.encodeWithSelector(
                PonsBuybackModule.ProcessingUnavailable.selector,
                BuybackTypes.Status.GraduationPending
            )
        );
        _process(100);
        curve.setLifecycle(0, false, false);
        _process(100);
    }

    function test_callbackCannotSyncDonationOrStartAnotherSettlement() public {
        curve.setCallback(address(vault), abi.encodeCall(vault.syncDonation, (address(0))));
        _process(100);
        assertFalse(curve.callbackSucceeded());
        curve.setCallback(
            address(vault),
            abi.encodeCall(
                vault.process,
                (
                    address(0),
                    DONATION,
                    100,
                    uint64(1),
                    uint64(1900),
                    abi.encode(
                        uint64(3), BuybackTypes.TypedRoute(new PoolKey[](0)), new uint256[](0)
                    )
                )
            )
        );
        _process(100);
        assertFalse(curve.callbackSucceeded());
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 200);
    }

    function test_preexistingExecutorBalancesAreNotPurchasedOutputOrBurned() public {
        vm.deal(vault.activeModule(), 7);
        token.mint(vault.activeModule(), 9);
        uint256 supply = token.totalSupply();
        _process(100);
        assertEq(vault.activeModule().balance, 7);
        assertEq(token.balanceOf(vault.activeModule()), 9);
        assertEq(token.totalSupply(), supply - 100);
        assertEq(vault.inventory(address(token), DONATION).totalBurned, 100);
    }

    function _faultAsset() internal returns (AdversarialERC20 asset) {
        asset = new AdversarialERC20();
        asset.mint(address(vault), 1000);
        vault.syncDonation(address(asset));
        // Explicit synthetic initialized-state response, used only for failed
        // transfer/router tests. Authentic markets have separate fork evidence.
        vm.mockCall(
            Integration.POOL_MANAGER,
            abi.encodeWithSignature("extsload(bytes32)"),
            abi.encode(uint256(1))
        );
        PoolKey[] memory pools = new PoolKey[](1);
        pools[0] = PoolKey(
            Currency.wrap(address(0)), Currency.wrap(address(asset)), 100, 1, IHooks(address(0))
        );
        module.setRoute(address(asset), BuybackTypes.TypedRoute(pools));
        module.setLimits(address(asset), BuybackTypes.ExecutionLimits(1, 100, 0));
        _allowPolicy(address(asset));
    }

    function test_feeOnTransferCannotConsumeSourceOrBecomeExecutionFunding() public {
        AdversarialERC20 asset = _faultAsset();
        asset.setTransferBehavior(AdversarialERC20.Behavior.TaxedTransfer);
        vm.expectRevert(ProtocolBuybackVault.InexactSettlement.selector);
        vault.processPons(address(asset), DONATION, 100, 3, 1900);
        assertEq(asset.balanceOf(address(vault)), 1000);
        assertEq(asset.totalSupply(), 1000);
        assertEq(vault.inventory(address(asset), DONATION).totalSpent, 0);
        assertEq(vault.inventory(address(asset), DONATION).available, 1000);
    }

    function test_noOpVenueCannotProduceConversionOnlySuccessOrLeaveAllowances() public {
        AdversarialERC20 asset = _faultAsset();
        vm.mockCall(
            Integration.ROUTER, abi.encodeWithSignature("execute(bytes,bytes[],uint256)"), hex""
        );
        vm.expectRevert(PonsBuybackModule.InexactSettlement.selector);
        vault.processPons(address(asset), DONATION, 100, 3, 1900);
        assertEq(asset.balanceOf(address(vault)), 1000);
        assertEq(vault.inventory(address(asset), DONATION).totalSpent, 0);
        assertEq(asset.balanceOf(vault.activeModule()), 0);
        assertEq(asset.allowance(vault.activeModule(), Integration.PERMIT2), 0);
    }

    function test_partialDustCannotConsumeCooldownOrChangeAccounting() public {
        _limits(50, 100, 60);
        curve.configure(100, 1, 1, 0);
        uint256 supply = token.totalSupply();
        vm.expectRevert(ProtocolBuybackVault.InvalidAmount.selector);
        _process(100);
        assertEq(module.lastBuyAt(), 0);
        assertEq(module.lastAssetBuyAt(address(0)), 0);
        assertEq(vault.settlementSequence(), 0);
        assertEq(vault.inventory(address(0), DONATION).available, 1000);
        assertEq(token.totalSupply(), supply);
    }

    function test_belowMinimumInventoryIsDeferredWithoutStartingAClock() public {
        _limits(1001, 2000, 60);
        assertEq(
            uint256(module.processingStatus(address(0), DONATION).status),
            uint256(BuybackTypes.Status.BelowMinimum)
        );
        assertEq(module.processingStatus(address(0), DONATION).minInput, 1001);
        vm.expectRevert(
            abi.encodeWithSelector(
                PonsBuybackModule.ProcessingUnavailable.selector, BuybackTypes.Status.BelowMinimum
            )
        );
        _process(1000);
        assertEq(module.lastBuyAt(), 0);
    }

    function _installSyntheticWrappedImplementation() private {
        SyntheticWrappedEther implementation = new SyntheticWrappedEther();
        // Recorded WETH is a proxy. Its runtime remains canonical while these
        // unit tests deliberately replace only its absent implementation state.
        vm.store(
            Integration.WETH,
            bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1),
            bytes32(uint256(uint160(address(implementation))))
        );
    }

    function test_nativeAndWrappedDonationsAreOneInventoryAndShareEligibility() public {
        _installSyntheticWrappedImplementation();
        vm.deal(address(this), 100);
        (bool deposited,) = Integration.WETH.call{value: 100}(abi.encodeWithSignature("deposit()"));
        assertTrue(deposited);
        assertTrue(IERC20(Integration.WETH).transfer(address(vault), 100));
        assertEq(vault.syncDonation(Integration.WETH), 100);
        assertEq(IERC20(Integration.WETH).balanceOf(address(vault)), 0);
        assertEq(vault.inventory(Integration.WETH, DONATION).available, 1100);
        assertEq(vault.inventory(address(0), DONATION).available, 1100);
        assertEq(vault.inventory(address(0), DONATION).totalReceived, 1100);
        assertEq(vault.syncDonation(address(0)), 0);
        module.setLimits(Integration.WETH, BuybackTypes.ExecutionLimits(50, 100, 60));
        _allowPolicy(Integration.WETH);
        activeRevision = module.revision(Integration.WETH);
        vault.processPons(Integration.WETH, DONATION, 100, activeRevision, uint64(block.timestamp));
        assertEq(module.lastAssetBuyAt(Integration.WETH), 1000);
        assertEq(module.lastAssetBuyAt(address(0)), 1000);
        assertEq(
            uint256(module.processingStatus(address(0), DONATION).status),
            uint256(BuybackTypes.Status.Cooldown)
        );
        assertEq(vault.inventory(Integration.WETH, DONATION).available, 1000);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 100);
    }

    function test_wrappedEarnedReceiptPreservesUnsynchronizedDonationsAndSharesBucketCooldown()
        public
    {
        _installSyntheticWrappedImplementation();
        factory.setMinimumPayment(Integration.WETH, 1);
        factory.setPaymentTokenEnabled(Integration.WETH, true);
        address renderer = deployCode("OnchainMetadataRenderer.sol:OnchainMetadataRenderer");
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(address(this), renderer, Integration.WETH);
        config.protocolFeeBps = 10_000;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.pricePerPeriod = 100;
        config.periodDuration = 1;
        MembershipTier tier = MembershipTier(factory.createTier(config));
        vm.deal(address(this), 240);
        (bool deposited,) = Integration.WETH.call{value: 230}(abi.encodeWithSignature("deposit()"));
        assertTrue(deposited);
        assertTrue(IERC20(Integration.WETH).approve(address(tier), 200));
        uint256 id = tier.createMembership(2, address(0), 25);
        assertTrue(IERC20(Integration.WETH).transfer(address(vault), 30));
        (bool sent,) = address(vault).call{value: 10}("");
        assertTrue(sent);
        vm.warp(1001);
        assertEq(id, 1);
        tier.processAccounting(25);
        assertEq(tier.releaseProtocolFees(), 100);
        assertEq(vault.inventory(address(0), BuybackTypes.SourceBucket.Membership).available, 100);
        assertEq(vault.inventory(address(0), DONATION).available, 1000);
        assertEq(IERC20(Integration.WETH).balanceOf(address(vault)), 30);
        assertEq(vault.syncDonation(Integration.WETH), 30);
        assertEq(vault.syncDonation(address(0)), 10);
        assertEq(vault.inventory(address(0), DONATION).available, 1040);
        _limits(50, 100, 60);
        vault.processPons(
            Integration.WETH,
            BuybackTypes.SourceBucket.Membership,
            100,
            activeRevision,
            uint64(block.timestamp)
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                PonsBuybackModule.ProcessingUnavailable.selector, BuybackTypes.Status.Cooldown
            )
        );
        _process(100);
        assertEq(vault.inventory(address(0), DONATION).available, 1040);
        assertEq(tier.totalProtectedLiability(), 100);
    }

    function test_globalIntervalAppliesAcrossCurrenciesButDirectBurnDoesNotConsumeIt() public {
        SyntheticConversionBinding.install();
        AdversarialERC20 payment = new AdversarialERC20();
        payment.mint(address(vault), 100);
        vault.syncDonation(address(payment));
        PoolKey[] memory pools = new PoolKey[](1);
        pools[0] = PoolKey(
            Currency.wrap(address(0)), Currency.wrap(address(payment)), 100, 1, IHooks(address(0))
        );
        module.setRoute(address(payment), BuybackTypes.TypedRoute(pools));
        module.setLimits(address(payment), BuybackTypes.ExecutionLimits(1, 100, 0));
        _allowPolicy(address(payment));
        module.setGlobalMinInterval(60);
        _process(100);
        vm.warp(1010);
        token.mint(address(vault), 5);
        vault.syncDonation(address(token));
        vault.processPons(address(token), DONATION, 5, 0, uint64(block.timestamp));
        assertEq(module.lastBuyAt(), 1000);
        assertEq(
            uint256(module.processingStatus(address(payment), DONATION).status),
            uint256(BuybackTypes.Status.Cooldown)
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                PonsBuybackModule.ProcessingUnavailable.selector, BuybackTypes.Status.Cooldown
            )
        );
        vault.processPons(address(payment), DONATION, 100, 3, uint64(block.timestamp));
        vm.warp(1060);
        vault.processPons(address(payment), DONATION, 100, 3, uint64(block.timestamp));
        assertEq(module.lastBuyAt(), 1060);
        assertEq(module.lastAssetBuyAt(address(0)), 1000);
        assertEq(module.lastAssetBuyAt(address(payment)), 1060);
    }

    function test_atomicConfigurationRejectsCanonicalDuplicatesAndRollsBackAllSettings() public {
        address[] memory assets = new address[](2);
        assets[1] = Integration.WETH;
        BuybackTypes.ExecutionLimits[] memory settings = new BuybackTypes.ExecutionLimits[](2);
        settings[0] = BuybackTypes.ExecutionLimits(10, 50, 60);
        settings[1] = settings[0];
        uint64 beforeRevision = module.revision(address(0));
        vm.expectRevert(PonsBuybackModule.InvalidLimits.selector);
        module.setExecutionLimits(100, assets, settings);
        assertEq(module.revision(address(0)), beforeRevision);
        assertEq(module.globalMinInterval(), 0);
        assertEq(module.limits(address(0)).maxInput, 100);
        assets = new address[](1);
        settings = new BuybackTypes.ExecutionLimits[](1);
        settings[0] = BuybackTypes.ExecutionLimits(10, 50, 60);
        module.setExecutionLimits(100, assets, settings);
        assertEq(module.globalMinInterval(), 100);
        assertEq(module.limits(address(0)).maxInput, 50);
        assertEq(module.revision(address(0)), beforeRevision + 1);
    }

    function testFuzz_partialSpendConservesSourceAndSupply(uint96 offered, uint16 fillBps) public {
        uint256 amount = bound(offered, 10_000, 1e24);
        uint256 fill = bound(fillBps, 1, 10_000);
        _fund(amount);
        _limits(1, SafeCast.toUint128(amount), 0);
        curve.configure(fill, 1, 1, 0);
        uint256 supply = token.totalSupply();
        _process(amount);
        uint256 spent = amount * fill / 10_000;
        assertEq(vault.inventory(address(0), DONATION).totalSpent, spent);
        assertEq(address(vault).balance, 1000 + amount - spent);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, spent);
        assertEq(token.totalSupply(), supply - spent);
    }

    function _operatorPurchase(uint256 amount, uint256 minimum) internal {
        uint256[] memory minima = new uint256[](1);
        minima[0] = minimum;
        vault.process(
            address(0),
            DONATION,
            amount,
            uint64(1),
            uint64(block.timestamp),
            abi.encode(uint64(0), BuybackTypes.TypedRoute(new PoolKey[](0)), minima)
        );
    }

    function _publicPolicy(uint256 numerator, uint256 denominator, uint64 expiry, uint256 budget)
        internal
    {
        BuybackTypes.OutputRate[] memory rates = new BuybackTypes.OutputRate[](1);
        rates[0] = BuybackTypes.OutputRate(numerator, denominator);
        module.setPermissionlessPolicy(
            address(0), BuybackTypes.Lifecycle.Bonding, rates, expiry, budget
        );
        activeRevision = module.revision(address(0));
    }

    function test_operatorUsesOnlyTransactionTermsAndRevocationIsImmediate() public {
        module.setOperator(address(this));
        module.setExecutionMode(BuybackTypes.ExecutionMode.OperatorGuarded);
        _limits(500, 600, 1000);
        module.setGlobalMinInterval(1000);
        bytes32 policyBefore = keccak256(abi.encode(module.permissionlessPolicy(address(0))));
        _operatorPurchase(100, 100);
        _operatorPurchase(100, 100);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 200);
        assertEq(keccak256(abi.encode(module.permissionlessPolicy(address(0)))), policyBefore);
        module.setOperator(address(0xBEEF));
        vm.expectRevert(PonsBuybackModule.OnlyOperator.selector);
        _operatorPurchase(100, 100);
        module.setOperator(address(0));
        vm.prank(address(0xBEEF));
        vm.expectRevert(PonsBuybackModule.OnlyOperator.selector);
        _operatorPurchase(100, 100);
    }

    function test_operatorCannotBypassPauseOrSubmitMissingOutputCoverage() public {
        module.setOperator(address(this));
        module.setExecutionMode(BuybackTypes.ExecutionMode.OperatorGuarded);
        vm.expectRevert(PonsBuybackModule.InvalidPolicy.selector);
        _operatorPurchase(100, 0);
        vm.expectRevert(PonsBuybackModule.InvalidPolicy.selector);
        vault.processPons(address(0), DONATION, 100, 0, 1900);
        vault.setBuybacksPaused(true);
        vm.expectRevert(ProtocolBuybackVault.BuybacksArePaused.selector);
        _operatorPurchase(100, 100);
        assertEq(vault.settlementSequence(), 0);
    }

    function test_operatorAbsoluteMinimumRejectsPartialFillAndRollsBack() public {
        module.setOperator(address(this));
        module.setExecutionMode(BuybackTypes.ExecutionMode.OperatorGuarded);
        curve.configure(6000, 1, 1, 0);
        uint256 supply = token.totalSupply();
        vm.expectRevert(PonsBuybackModule.InexactSettlement.selector);
        _operatorPurchase(100, 61);
        assertEq(vault.inventory(address(0), DONATION).available, 1000);
        assertEq(module.lastBuyAt(), 0);
        assertEq(vault.settlementSequence(), 0);
        assertEq(token.totalSupply(), supply);
        _operatorPurchase(100, 60);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 60);
    }

    function test_permissionlessRatesRoundUpAndCannotBeWeakenedByCaller() public {
        _publicPolicy(2, 3, 0, 0);
        curve.configure(10_000, 2, 3, 0);
        vm.expectRevert(PonsBuybackModule.InexactSettlement.selector);
        _process(100); // Floor(100 * 2 / 3) = 66, authorized ceiling = 67.
        assertEq(vault.settlementSequence(), 0);
        curve.configure(10_000, 1, 1, 0);
        vm.prank(address(0xBEEF));
        _process(100);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 100);
    }

    function test_permissionlessPartialFillUsesActualSpendAndRejectsBadRate() public {
        _publicPolicy(1, 1, 0, 100);
        curve.configure(6000, 1, 1, 1);
        uint256 supply = token.totalSupply();
        vm.expectRevert(PonsBuybackModule.InexactSettlement.selector);
        _process(100);
        assertEq(vault.inventory(address(0), DONATION).available, 1000);
        assertEq(module.permissionlessPolicy(address(0)).remainingBudget, 100);
        assertEq(module.lastBuyAt(), 0);
        assertEq(token.totalSupply(), supply);
        curve.configure(6000, 1, 1, 0);
        _process(100);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 60);
        assertEq(module.permissionlessPolicy(address(0)).remainingBudget, 40);
        assertEq(token.totalSupply(), supply - 60);
    }

    function test_permissionlessBudgetDebitsActualSpendAndSurvivesModeChanges() public {
        _publicPolicy(1, 100, 0, 100);
        curve.configure(6000, 1, 1, 0);
        _process(100);
        assertEq(module.permissionlessPolicy(address(0)).remainingBudget, 40);
        assertEq(module.processingStatus(Integration.WETH, DONATION).maxInput, 40);
        module.setExecutionMode(BuybackTypes.ExecutionMode.OperatorGuarded);
        module.setExecutionMode(BuybackTypes.ExecutionMode.PermissionlessGuarded);
        module.setOperator(address(0xBEEF));
        vault.setBuybacksPaused(true);
        vault.setBuybacksPaused(false);
        assertEq(module.permissionlessPolicy(address(0)).remainingBudget, 40);
        module.setLimits(address(0), BuybackTypes.ExecutionLimits(1, 80, 0));
        activeRevision = module.revision(address(0));
        assertEq(module.permissionlessPolicy(address(0)).revision, activeRevision);
        assertEq(module.permissionlessPolicy(address(0)).remainingBudget, 40);
        curve.configure(10_000, 1, 1, 0);
        _process(40);
        assertEq(
            uint256(module.processingStatus(address(0), DONATION).status),
            uint256(BuybackTypes.Status.BudgetExhausted)
        );
        assertEq(module.permissionlessPolicy(address(0)).remainingBudget, 0);
    }

    function test_expiryIsOptionalAndRouteChangesRequireFreshPublicPolicy() public {
        _publicPolicy(1, 1, 1100, 0);
        vm.warp(1100);
        _process(100);
        vm.warp(1101);
        assertEq(
            uint256(module.processingStatus(address(0), DONATION).status),
            uint256(BuybackTypes.Status.PolicyExpired)
        );
        _publicPolicy(1, 1, 0, 0);
        vm.warp(1101 + 100 * 365 days);
        _process(100);
        module.setRoute(address(0), BuybackTypes.TypedRoute(new PoolKey[](0)));
        assertEq(
            uint256(module.processingStatus(address(0), DONATION).status),
            uint256(BuybackTypes.Status.StalePolicy)
        );
        module.setLimits(address(0), BuybackTypes.ExecutionLimits(1, 80, 0));
        assertEq(
            uint256(module.processingStatus(address(0), DONATION).status),
            uint256(BuybackTypes.Status.StalePolicy)
        );
        assertFalse(module.permissionlessPolicy(address(0)).budgetLimited);
    }

    function test_operatorRouteDoesNotRequireOrOverwriteStoredPublicRoute() public {
        SyntheticConversionBinding.install();
        AdversarialERC20 asset = new AdversarialERC20();
        asset.mint(address(vault), 100);
        vault.syncDonation(address(asset));
        PoolKey[] memory pools = new PoolKey[](1);
        pools[0] = PoolKey(
            Currency.wrap(address(0)), Currency.wrap(address(asset)), 100, 1, IHooks(address(0))
        );
        uint256[] memory minima = new uint256[](2);
        minima[0] = 1 ether;
        minima[1] = 1 ether;
        module.setOperator(address(this));
        module.setExecutionMode(BuybackTypes.ExecutionMode.OperatorGuarded);
        minima[0] = 1 ether + 1;
        vm.expectRevert(PonsBuybackModule.InexactSettlement.selector);
        vault.process(
            address(asset),
            DONATION,
            100,
            uint64(1),
            1900,
            abi.encode(uint64(0), BuybackTypes.TypedRoute(pools), minima)
        );
        assertEq(vault.inventory(address(asset), DONATION).available, 100);
        assertEq(asset.allowance(vault.activeModule(), Integration.PERMIT2), 0);
        assertEq(vault.settlementSequence(), 0);
        minima[0] = 1 ether;
        vault.process(
            address(asset),
            DONATION,
            100,
            uint64(1),
            1900,
            abi.encode(uint64(0), BuybackTypes.TypedRoute(pools), minima)
        );
        assertEq(module.route(address(asset)).pools.length, 0);
        assertEq(module.permissionlessPolicy(address(asset)).rates.length, 0);
        assertEq(module.limits(address(asset)).maxInput, 0);
        assertEq(vault.inventory(address(asset), DONATION).totalSpent, 100);
    }

    function _conversionKey(address a, address b) internal pure returns (PoolKey memory) {
        return PoolKey(
            Currency.wrap(a < b ? a : b), Currency.wrap(a < b ? b : a), 100, 1, IHooks(address(0))
        );
    }

    function test_twoConversionsUseDistinctOfferedInputRatesAndExcludeExactUnwrap() public {
        _installSyntheticWrappedImplementation();
        AdversarialERC20 asset = new AdversarialERC20();
        AdversarialERC20 middle = new AdversarialERC20();
        SyntheticLiquidityBank bank = new SyntheticLiquidityBank();
        middle.mint(address(bank), 10_000);
        vm.deal(address(this), 10_000);
        (bool deposited,) =
            Integration.WETH.call{value: 10_000}(abi.encodeWithSignature("deposit()"));
        assertTrue(deposited);
        assertTrue(IERC20(Integration.WETH).transfer(address(bank), 10_000));
        SyntheticTwoLegRouter router = new SyntheticTwoLegRouter(bank, address(middle));
        vm.mockFunction(
            Integration.ROUTER,
            address(router),
            abi.encodeWithSignature("execute(bytes,bytes[],uint256)")
        );
        vm.mockCall(
            Integration.POOL_MANAGER,
            abi.encodeWithSignature("extsload(bytes32)"),
            abi.encode(uint256(1))
        );
        asset.mint(address(vault), 100);
        vault.syncDonation(address(asset));
        PoolKey[] memory pools = new PoolKey[](2);
        pools[0] = _conversionKey(address(asset), address(middle));
        pools[1] = _conversionKey(address(middle), Integration.WETH);
        module.setRoute(address(asset), BuybackTypes.TypedRoute(pools));
        module.setLimits(address(asset), BuybackTypes.ExecutionLimits(1, 100, 0));
        BuybackTypes.OutputRate[] memory rates = new BuybackTypes.OutputRate[](3);
        rates[0] = BuybackTypes.OutputRate(2, 1);
        rates[1] = BuybackTypes.OutputRate(3, 1);
        rates[2] = BuybackTypes.OutputRate(1, 1);
        uint256 supply = token.totalSupply();
        for (uint256 i; i < 3; ++i) {
            ++rates[i].numerator;
            module.setPermissionlessPolicy(
                address(asset), BuybackTypes.Lifecycle.Bonding, rates, 0, 100
            );
            uint64 currentRevision = module.revision(address(asset));
            vm.expectRevert(PonsBuybackModule.InexactSettlement.selector);
            vault.processPons(address(asset), DONATION, 100, currentRevision, 1900);
            assertEq(vault.inventory(address(asset), DONATION).available, 100);
            assertEq(vault.inventory(address(middle), DONATION).available, 0);
            assertEq(vault.inventory(address(0), DONATION).available, 1000);
            assertEq(module.permissionlessPolicy(address(asset)).remainingBudget, 100);
            assertEq(module.lastBuyAt(), 0);
            assertEq(vault.settlementSequence(), 0);
            assertEq(asset.allowance(vault.activeModule(), Integration.PERMIT2), 0);
            assertEq(middle.allowance(vault.activeModule(), Integration.PERMIT2), 0);
            assertEq(token.totalSupply(), supply);
            --rates[i].numerator;
        }
        module.setPermissionlessPolicy(
            address(asset), BuybackTypes.Lifecycle.Bonding, rates, 0, 100
        );
        vault.processPons(address(asset), DONATION, 100, module.revision(address(asset)), 1900);
        assertEq(vault.inventory(address(asset), DONATION).totalSpent, 100);
        assertEq(vault.inventory(address(middle), DONATION).totalConvertedIn, 200);
        assertEq(vault.inventory(address(middle), DONATION).totalSpent, 200);
        assertEq(vault.inventory(address(0), DONATION).totalConvertedIn, 600);
        assertEq(vault.inventory(address(token), DONATION).totalBurned, 600);
        assertEq(module.permissionlessPolicy(address(asset)).remainingBudget, 0);
    }

    function test_nativeBudgetIsSharedByMembershipDonationAndWrappedAlias() public {
        _installSyntheticWrappedImplementation();
        factory.setMinimumPayment(Integration.WETH, 1);
        factory.setPaymentTokenEnabled(Integration.WETH, true);
        MembershipTypes.TierConfig memory config = MembershipTestConfig.defaultConfig(
            address(this),
            deployCode("OnchainMetadataRenderer.sol:OnchainMetadataRenderer"),
            Integration.WETH
        );
        config.protocolFeeBps = 10_000;
        config.rewardBps = 0;
        config.referralBps = 0;
        config.pricePerPeriod = 100;
        config.periodDuration = 1;
        MembershipTier tier = MembershipTier(factory.createTier(config));
        vm.deal(address(this), 200);
        (bool deposited,) = Integration.WETH.call{value: 200}(abi.encodeWithSignature("deposit()"));
        assertTrue(deposited);
        assertTrue(IERC20(Integration.WETH).approve(address(tier), 200));
        tier.createMembership(2, address(0), 25);
        vm.warp(1001);
        tier.processAccounting(25);
        assertEq(tier.releaseProtocolFees(), 100);
        _publicPolicy(1, 1, 0, 150);
        _process(100);
        assertEq(
            module.processingStatus(Integration.WETH, BuybackTypes.SourceBucket.Membership)
            .maxInput,
            50
        );
        vault.processPons(
            Integration.WETH, BuybackTypes.SourceBucket.Membership, 50, activeRevision, 1900
        );
        assertEq(vault.inventory(address(0), DONATION).available, 900);
        assertEq(
            vault.inventory(Integration.WETH, BuybackTypes.SourceBucket.Membership).available, 50
        );
        for (uint256 b; b < 2; ++b) {
            assertEq(
                uint256(
                    module.processingStatus(Integration.WETH, BuybackTypes.SourceBucket(b)).status
                ),
                uint256(BuybackTypes.Status.BudgetExhausted)
            );
            vm.expectRevert(
                abi.encodeWithSelector(
                    PonsBuybackModule.ProcessingUnavailable.selector,
                    BuybackTypes.Status.BudgetExhausted
                )
            );
            vault.processPons(
                b == 0 ? address(0) : Integration.WETH,
                BuybackTypes.SourceBucket(b),
                1,
                activeRevision,
                1900
            );
        }
    }
}
