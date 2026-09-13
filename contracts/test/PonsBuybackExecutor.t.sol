// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {MembershipFactory} from "../src/MembershipFactory.sol";
import {MembershipTier} from "../src/MembershipTier.sol";
import {PonsBuybackExecutor} from "../src/PonsBuybackExecutor.sol";
import {ProtocolBuybackVault} from "../src/ProtocolBuybackVault.sol";
import {IPonsBuybackExecutor} from "../src/interfaces/IPonsBuybackExecutor.sol";
import {BuybackIntegration as Integration} from "../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../src/types/BuybackTypes.sol";
import {MembershipTypes} from "../src/types/MembershipTypes.sol";
import {LinkedVestingFixture} from "./helpers/LinkedVestingFixture.sol";
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticConversionBinding} from "./helpers/SyntheticConversionBinding.sol";
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
contract PonsBuybackExecutorTest is Test {
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
        vault.setRoute(address(0), BuybackTypes.TypedRoute(new PoolKey[](0)));
        _limits(1, 100, 0);
        vault.setBuybacksPaused(false);
        _fund(1000);
    }

    function _limits(uint128 minimum, uint128 maximum, uint64 interval) internal {
        vault.setLimits(address(0), BuybackTypes.ExecutionLimits(minimum, maximum, interval));
        activeRevision = vault.revision(address(0));
    }

    function _fund(uint256 amount) internal {
        vm.deal(address(this), amount);
        (bool sent,) = address(vault).call{value: amount}("");
        assertTrue(sent);
        vault.syncDonation(address(0));
    }

    function _process(uint256 amount) internal {
        vault.process(address(0), DONATION, amount, activeRevision, uint64(block.timestamp));
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
        vault.setRoute(address(payment), BuybackTypes.TypedRoute(pools));
        vault.setLimits(address(payment), BuybackTypes.ExecutionLimits(1, 100, 0));
        curve.configure(6000, 1, 1, 0);
        uint256 supply = token.totalSupply();
        for (uint8 b; b < 2; ++b) {
            _book.receiveFunds(address(payment), b, 100);
            _book.convert(address(payment), address(0), b, 100, 1 ether);
            _book.convert(address(0), address(token), b, 0.6 ether, 0.6 ether);
            _book.burn(address(token), b, 0.6 ether);
            vault.process(address(payment), BuybackTypes.SourceBucket(b), 100, 2, 1900);
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
        assertEq(payment.allowance(vault.executor(), Integration.PERMIT2), 0);
    }

    function test_onlyVaultCanExecuteAndThereIsNoCallerRecipient() public {
        BuybackTypes.TypedRoute memory route;
        IPonsBuybackExecutor executor = IPonsBuybackExecutor(vault.executor());
        vm.expectRevert(PonsBuybackExecutor.OnlyVault.selector);
        executor.execute(address(0), 100, route, 1900);
        vm.deal(address(this), 1);
        (bool sent,) = vault.executor().call{value: 1}("");
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
        assertEq(vault.lastBuyAt(), 1000);
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
                    ? PonsBuybackExecutor.InexactSettlement.selector
                    : ProtocolBuybackVault.InexactSettlement.selector
            );
            _process(100);
            assertEq(vault.inventory(address(0), DONATION).totalSpent, 0);
            assertEq(token.totalSupply(), supply);
            assertEq(address(vault).balance, 1000);
            assertEq(vault.lastBuyAt(), 0);
            assertEq(vault.lastAssetBuyAt(address(0)), 0);
        }
    }

    function test_cooldownRejectsBackToBackCallsAndSurvivesAllConfigurationChanges() public {
        _limits(50, 100, 60);
        vault.setGlobalMinInterval(30);
        _process(100);
        vault.setBuybacksPaused(true);
        vault.setAssetBuybacksPaused(address(0), true);
        vault.setBuybacksPaused(false);
        vault.setAssetBuybacksPaused(address(0), false);
        vault.setRoute(address(0), BuybackTypes.TypedRoute(new PoolKey[](0)));
        _limits(50, 100, 60);
        vault.setGlobalMinInterval(30);
        assertEq(vault.lastBuyAt(), 1000);
        assertEq(vault.lastAssetBuyAt(address(0)), 1000);
        vm.warp(1059);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector, BuybackTypes.Status.Cooldown
            )
        );
        _process(100);
        assertEq(vault.processingStatus(address(0), DONATION).nextEligibleAt, 1060);
        vm.warp(1060);
        _process(100);
        assertEq(vault.lastBuyAt(), 1060);
    }

    function test_deadlineRevisionAndAmountsAreCheckedAndStandingLimitsNeverExpire() public {
        vm.expectRevert(ProtocolBuybackVault.StaleRevision.selector);
        vault.process(address(0), DONATION, 100, 1, 1900);
        vm.expectRevert(ProtocolBuybackVault.DeadlineExpired.selector);
        vault.process(address(0), DONATION, 100, 2, 999);
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
                ProtocolBuybackVault.ProcessingUnavailable.selector,
                BuybackTypes.Status.LaunchPenalty
            )
        );
        _process(100);
        curve.setLifecycle(0, true, false);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector,
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
            address(vault), abi.encodeCall(vault.process, (address(0), DONATION, 100, 2, 1900))
        );
        _process(100);
        assertFalse(curve.callbackSucceeded());
        assertEq(vault.inventory(address(0), DONATION).totalSpent, 200);
    }

    function test_preexistingExecutorBalancesAreNotPurchasedOutputOrBurned() public {
        vm.deal(vault.executor(), 7);
        token.mint(vault.executor(), 9);
        uint256 supply = token.totalSupply();
        _process(100);
        assertEq(vault.executor().balance, 7);
        assertEq(token.balanceOf(vault.executor()), 9);
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
        vault.setRoute(address(asset), BuybackTypes.TypedRoute(pools));
        vault.setLimits(address(asset), BuybackTypes.ExecutionLimits(1, 100, 0));
    }

    function test_feeOnTransferCannotConsumeSourceOrBecomeExecutionFunding() public {
        AdversarialERC20 asset = _faultAsset();
        asset.setTransferBehavior(AdversarialERC20.Behavior.TaxedTransfer);
        vm.expectRevert(ProtocolBuybackVault.InexactSettlement.selector);
        vault.process(address(asset), DONATION, 100, 2, 1900);
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
        vm.expectRevert(PonsBuybackExecutor.InexactSettlement.selector);
        vault.process(address(asset), DONATION, 100, 2, 1900);
        assertEq(asset.balanceOf(address(vault)), 1000);
        assertEq(vault.inventory(address(asset), DONATION).totalSpent, 0);
        assertEq(asset.balanceOf(vault.executor()), 0);
        assertEq(asset.allowance(vault.executor(), Integration.PERMIT2), 0);
    }

    function test_partialDustCannotConsumeCooldownOrChangeAccounting() public {
        _limits(50, 100, 60);
        curve.configure(100, 1, 1, 0);
        uint256 supply = token.totalSupply();
        vm.expectRevert(ProtocolBuybackVault.InvalidAmount.selector);
        _process(100);
        assertEq(vault.lastBuyAt(), 0);
        assertEq(vault.lastAssetBuyAt(address(0)), 0);
        assertEq(vault.settlementSequence(), 0);
        assertEq(vault.inventory(address(0), DONATION).available, 1000);
        assertEq(token.totalSupply(), supply);
    }

    function test_belowMinimumInventoryIsDeferredWithoutStartingAClock() public {
        _limits(1001, 2000, 60);
        assertEq(
            uint256(vault.processingStatus(address(0), DONATION).status),
            uint256(BuybackTypes.Status.BelowMinimum)
        );
        assertEq(vault.processingStatus(address(0), DONATION).minInput, 1001);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector,
                BuybackTypes.Status.BelowMinimum
            )
        );
        _process(1000);
        assertEq(vault.lastBuyAt(), 0);
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
        vault.setLimits(Integration.WETH, BuybackTypes.ExecutionLimits(50, 100, 60));
        activeRevision = vault.revision(Integration.WETH);
        vault.process(Integration.WETH, DONATION, 100, activeRevision, uint64(block.timestamp));
        assertEq(vault.lastAssetBuyAt(Integration.WETH), 1000);
        assertEq(vault.lastAssetBuyAt(address(0)), 1000);
        assertEq(
            uint256(vault.processingStatus(address(0), DONATION).status),
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
        vault.process(
            Integration.WETH,
            BuybackTypes.SourceBucket.Membership,
            100,
            activeRevision,
            uint64(block.timestamp)
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector, BuybackTypes.Status.Cooldown
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
        vault.setRoute(address(payment), BuybackTypes.TypedRoute(pools));
        vault.setLimits(address(payment), BuybackTypes.ExecutionLimits(1, 100, 0));
        vault.setGlobalMinInterval(60);
        _process(100);
        vm.warp(1010);
        token.mint(address(vault), 5);
        vault.syncDonation(address(token));
        vault.process(address(token), DONATION, 5, 0, uint64(block.timestamp));
        assertEq(vault.lastBuyAt(), 1000);
        assertEq(
            uint256(vault.processingStatus(address(payment), DONATION).status),
            uint256(BuybackTypes.Status.Cooldown)
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector, BuybackTypes.Status.Cooldown
            )
        );
        vault.process(address(payment), DONATION, 100, 2, uint64(block.timestamp));
        vm.warp(1060);
        vault.process(address(payment), DONATION, 100, 2, uint64(block.timestamp));
        assertEq(vault.lastBuyAt(), 1060);
        assertEq(vault.lastAssetBuyAt(address(0)), 1000);
        assertEq(vault.lastAssetBuyAt(address(payment)), 1060);
    }

    function test_atomicConfigurationRejectsCanonicalDuplicatesAndRollsBackAllSettings() public {
        address[] memory assets = new address[](2);
        assets[1] = Integration.WETH;
        BuybackTypes.ExecutionLimits[] memory settings = new BuybackTypes.ExecutionLimits[](2);
        settings[0] = BuybackTypes.ExecutionLimits(10, 50, 60);
        settings[1] = settings[0];
        uint64 beforeRevision = vault.revision(address(0));
        vm.expectRevert(ProtocolBuybackVault.InvalidLimits.selector);
        vault.setExecutionLimits(100, assets, settings);
        assertEq(vault.revision(address(0)), beforeRevision);
        assertEq(vault.globalMinInterval(), 0);
        assertEq(vault.limits(address(0)).maxInput, 100);
        assets = new address[](1);
        settings = new BuybackTypes.ExecutionLimits[](1);
        settings[0] = BuybackTypes.ExecutionLimits(10, 50, 60);
        vault.setExecutionLimits(100, assets, settings);
        assertEq(vault.globalMinInterval(), 100);
        assertEq(vault.limits(address(0)).maxInput, 50);
        assertEq(vault.revision(address(0)), beforeRevision + 1);
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
}
