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
import {MembershipTestConfig} from "./helpers/MembershipTestConfig.sol";
import {SyntheticConversionBinding} from "./helpers/SyntheticConversionBinding.sol";
import {SyntheticPonsBinding} from "./helpers/SyntheticPonsBinding.sol";
import {AdversarialERC20} from "./mocks/AdversarialERC20.sol";
import {FaultBondingCurve, FaultBurnToken} from "./mocks/BuybackFaults.sol";
import {BuybackModel} from "./models/BuybackModel.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Synthetic faults complement, and never replace, authentic venue tests.
contract PonsBuybackExecutorTest is Test {
    using BuybackModel for BuybackModel.Book;
    BuybackModel.Book private _book;
    FaultBurnToken internal token;
    FaultBondingCurve internal curve;
    MembershipFactory internal factory;
    ProtocolBuybackVault internal vault;
    uint64 internal activeRevision;
    BuybackTypes.SourceBucket internal constant DONATION = BuybackTypes.SourceBucket.Donation;

    function setUp() public {
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
                abi.encode(assets, media, address(this), address(token))
            )
        );
        vault = ProtocolBuybackVault(payable(factory.buybackVault()));
        vault.setRoute(address(0), BuybackTypes.TypedRoute(new PoolKey[](0)));
        _policy(100, 1000, 1000, 1900);
        vault.setBuybacksPaused(false);
        _fund(1000);
    }

    function _policy(uint128 cap, uint128 budget, uint64 start, uint64 end) internal {
        BuybackTypes.Rate[] memory rates = new BuybackTypes.Rate[](1);
        rates[0] = BuybackTypes.Rate(1, 1, 0);
        vault.setPolicy(
            address(0),
            BuybackTypes.ExecutionPolicy(
                start, end, cap, budget, rates, keccak256("synthetic reference")
            )
        );
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
        uint256 id = tier.purchase(2, address(0));
        vm.warp(block.timestamp + 1);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        tier.accrueProtocolFees(ids);
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
        BuybackTypes.Rate[] memory rates = new BuybackTypes.Rate[](2);
        rates[0] = BuybackTypes.Rate(1e16, 1, 0);
        rates[1] = BuybackTypes.Rate(1, 1, 0);
        vault.setPolicy(
            address(payment),
            BuybackTypes.ExecutionPolicy(
                1000, 1900, 100, 200, rates, keccak256("synthetic 100 units per ETH")
            )
        );
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
        assertEq(vault.policy(address(payment)).spent, 200);
        assertEq(token.totalSupply(), supply - 1.2 ether);
        assertEq(address(vault).balance, 0.8 ether + 1000);
        assertEq(payment.allowance(vault.executor(), Integration.PERMIT2), 0);
    }

    function test_onlyVaultCanExecuteAndThereIsNoCallerRecipient() public {
        BuybackTypes.TypedRoute memory route;
        BuybackTypes.Rate[] memory rates = new BuybackTypes.Rate[](1);
        IPonsBuybackExecutor executor = IPonsBuybackExecutor(vault.executor());
        vm.expectRevert(PonsBuybackExecutor.OnlyVault.selector);
        executor.execute(address(0), 100, route, rates, 1900);
        vm.deal(address(this), 1);
        (bool sent,) = vault.executor().call{value: 1}("");
        assertFalse(sent);
    }

    function test_actualPartialFillConsumesOnlySixtyAndPreservesFortyAsOriginalSource() public {
        curve.configure(6000, 1, 1, 0);
        uint256 supply = token.totalSupply();
        _process(100);
        assertEq(vault.policy(address(0)).spent, 60);
        assertEq(vault.inventory(address(0), DONATION).available, 940);
        assertEq(address(vault).balance, 940);
        assertEq(vault.inventory(address(token), DONATION).totalBurned, 60);
        assertEq(token.totalSupply(), supply - 60);
    }

    function test_oneUnitBelowSafeFloorRollsBackEveryLedgerAndVenueTransfer() public {
        curve.configure(10_000, 1, 1, 1);
        uint256 supply = token.totalSupply();
        vm.expectRevert(
            abi.encodeWithSelector(PonsBuybackExecutor.PriceBelowFloor.selector, 99, 100)
        );
        _process(100);
        assertEq(vault.policy(address(0)).spent, 0);
        assertEq(address(vault).balance, 1000);
        assertEq(token.totalSupply(), supply);
        assertEq(vault.settlementSequence(), 0);
        curve.configure(10_000, 1, 1, 0);
        _process(100);
        assertEq(vault.settlementSequence(), 1);
    }

    function test_zeroOutputAndNoOpOrExcessBurnCannotConsumeBudget() public {
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
            assertEq(vault.policy(address(0)).spent, 0);
            assertEq(token.totalSupply(), supply);
            assertEq(address(vault).balance, 1000);
        }
    }

    function test_pauseResumeAndDuplicateCallsCannotRefillSpentAuthorization() public {
        _policy(100, 200, 1000, 1900);
        _process(100);
        uint64 revision = vault.revision(address(0));
        vault.setBuybacksPaused(true);
        vault.setAssetBuybacksPaused(address(0), true);
        vm.expectRevert();
        _process(100);
        vault.setBuybacksPaused(false);
        vault.setAssetBuybacksPaused(address(0), false);
        assertEq(vault.policy(address(0)).spent, 100);
        assertEq(vault.revision(address(0)), revision);
        _process(100);
        assertEq(vault.policy(address(0)).spent, 200);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector,
                BuybackTypes.Status.BudgetExhausted
            )
        );
        _process(1);
        _policy(100, 100, 1000, 1900);
        assertEq(vault.revision(address(0)), revision + 1);
        _process(100);
    }

    function test_deadlineRevisionAmountAndValidityAreExecutionTimeChecks() public {
        vm.expectRevert(ProtocolBuybackVault.StaleRevision.selector);
        vault.process(address(0), DONATION, 100, 1, 1900);
        vm.expectRevert(ProtocolBuybackVault.DeadlineExpired.selector);
        vault.process(address(0), DONATION, 100, 2, 999);
        vm.expectRevert(ProtocolBuybackVault.InvalidAmount.selector);
        _process(101);
        vm.expectRevert(ProtocolBuybackVault.InvalidAmount.selector);
        _process(0);
        _policy(100, 1000, 1100, 1900);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector, BuybackTypes.Status.NotYetValid
            )
        );
        _process(100);
        vm.warp(1100);
        _process(100);
        vm.warp(1901);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolBuybackVault.ProcessingUnavailable.selector, BuybackTypes.Status.Expired
            )
        );
        _process(100);
        assertEq(vault.policy(address(0)).spent, 100);
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
        assertEq(vault.policy(address(0)).spent, 200);
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
        BuybackTypes.Rate[] memory rates = new BuybackTypes.Rate[](2);
        rates[0] = BuybackTypes.Rate(1, 1, 0);
        rates[1] = rates[0];
        vault.setPolicy(
            address(asset),
            BuybackTypes.ExecutionPolicy(
                1000, 1900, 100, 1000, rates, keccak256("synthetic fault only")
            )
        );
    }

    function test_feeOnTransferCannotConsumeSourceOrBecomeExecutionFunding() public {
        AdversarialERC20 asset = _faultAsset();
        asset.setTransferBehavior(AdversarialERC20.Behavior.TaxedTransfer);
        vm.expectRevert(ProtocolBuybackVault.InexactSettlement.selector);
        vault.process(address(asset), DONATION, 100, 2, 1900);
        assertEq(asset.balanceOf(address(vault)), 1000);
        assertEq(asset.totalSupply(), 1000);
        assertEq(vault.policy(address(asset)).spent, 0);
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
        assertEq(vault.policy(address(asset)).spent, 0);
        assertEq(asset.balanceOf(vault.executor()), 0);
        assertEq(asset.allowance(vault.executor(), Integration.PERMIT2), 0);
    }

    function testFuzz_partialSpendConservesSourceAndSupply(uint96 offered, uint16 fillBps) public {
        uint256 amount = bound(offered, 10_000, 1e24);
        uint256 fill = bound(fillBps, 1, 10_000);
        _fund(amount);
        _policy(SafeCast.toUint128(amount), SafeCast.toUint128(amount), 1000, 1900);
        curve.configure(fill, 1, 1, 0);
        uint256 supply = token.totalSupply();
        _process(amount);
        uint256 spent = amount * fill / 10_000;
        assertEq(vault.policy(address(0)).spent, spent);
        assertEq(address(vault).balance, 1000 + amount - spent);
        assertEq(vault.inventory(address(0), DONATION).totalSpent, spent);
        assertEq(token.totalSupply(), supply - spent);
    }
}
