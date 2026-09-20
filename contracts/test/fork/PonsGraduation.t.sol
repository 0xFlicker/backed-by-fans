// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {PonsBuybackModule} from "../../src/PonsBuybackModule.sol";
import {ProtocolBurnRouter} from "../../src/ProtocolBurnRouter.sol";
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {GraduationPhase} from "../../src/interfaces/external/ILaunchpadV2.sol";
import {IPonsLaunchFactory, IPonsLauncherToken} from "../../src/interfaces/external/IPons.sol";
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
import {BuybackTestCalls} from "../helpers/BuybackTestCalls.sol";
import {ProtocolBuybacksForkTest} from "./ProtocolBuybacks.t.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

contract PonsGraduationForkTest is ProtocolBuybacksForkTest {
    using BuybackTestCalls for ProtocolBuybackVault;

    function test_routerFinalFillAppliesRateToActualSpendAndDebitsBudget() public {
        uint256 offered = _prepareClosingPurchase();
        uint256 snapshot = vm.snapshotState();
        _cross(offered);
        uint256 spent = vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).totalSpent;
        uint256 acquired =
            vault.inventory(address(token), BuybackTypes.SourceBucket.Donation).totalBurned;
        assertTrue(vm.revertToState(snapshot));
        PonsBuybackModule module = PonsBuybackModule(payable(vault.activeModule()));
        module.setLimits(
            address(0),
            BuybackTypes.ExecutionLimits(
                SafeCast.toUint128(offered), SafeCast.toUint128(offered), 60
            )
        );
        BuybackTypes.OutputRate[] memory rates = new BuybackTypes.OutputRate[](1);
        rates[0] = BuybackTypes.OutputRate(acquired, spent * 2);
        assertGt(
            Math.mulDiv(offered, acquired, spent * 2),
            acquired,
            "full-offer floor exceeds closing output"
        );
        module.setPermissionlessPolicy(
            address(0), BuybackTypes.Lifecycle.Bonding, rates, 0, offered
        );
        ProtocolBurnRouter.Purchase[] memory purchases = new ProtocolBurnRouter.Purchase[](1);
        purchases[0] = ProtocolBurnRouter.Purchase(address(0), module.revision(address(0)));
        (uint256 count, uint256 burned) =
            ProtocolBurnRouter(bbf.burnRouter()).buyback(purchases, uint64(block.timestamp));
        assertEq(count, 1);
        assertEq(burned, acquired);
        assertEq(module.permissionlessPolicy(address(0)).remainingBudget, offered - spent);
        assertEq(
            vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).available,
            offered - spent
        );
        assertEq(module.lastBuyAt(), block.timestamp);
        assertEq(uint256(module.lifecycle()), uint256(BuybackTypes.Lifecycle.GraduationPending));
    }

    function _prepareClosingPurchase() private returns (uint256 offered) {
        vm.warp(block.timestamp + curve.snipeTaxSeconds());
        uint256 net = curve.graduationThreshold() - curve.realQuoteReserve() - 1e12;
        uint256 gross = net * 10_000 / (10_000 - curve.feeBps());
        vm.deal(trader, gross + 1 ether);
        _buy(trader, gross);
        assertGt(curve.sellableTokens(), 0);
        assertFalse(curve.readyToGraduate());
        offered = 0.001 ether;
        BuybackTypes.TypedRoute memory route;
        PonsBuybackModule(payable(address(vault.activeModule()))).setRoute(address(0), route);
        PonsBuybackModule(payable(address(vault.activeModule())))
            .setLimits(address(0), BuybackTypes.ExecutionLimits(1, SafeCast.toUint128(offered), 0));
        _testPolicy(address(0), BuybackTypes.Lifecycle.Bonding);
        vm.deal(address(this), offered);
        (bool sent,) = address(vault).call{value: offered}("");
        assertTrue(sent);
        vault.syncDonation(address(0));
    }

    function _cross(uint256 offered) private {
        uint256 supply = token.totalSupply();
        vm.prank(trader);
        vault.processPons(
            address(0),
            BuybackTypes.SourceBucket.Donation,
            offered,
            PonsBuybackModule(payable(address(vault.activeModule()))).revision(address(0)),
            uint64(block.timestamp)
        );
        uint256 spent = vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).totalSpent;
        assertGt(spent, 0);
        assertLt(spent, offered);
        assertEq(address(vault).balance, offered - spent);
        assertEq(
            vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).available,
            offered - spent
        );
        assertEq(
            supply - token.totalSupply(),
            vault.inventory(address(token), BuybackTypes.SourceBucket.Donation).totalBurned
        );
        emit log_named_uint("Closing ETH actually spent", spent);
        emit log_named_uint("Closing ETH returned to the same bucket", offered - spent);
    }

    function _createAndBuyPool() private returns (uint128 liquidity) {
        assertEq(
            uint256(PONS.getLaunchedToken(address(token)).phase), uint256(GraduationPhase.Swept)
        );
        assertEq(
            uint256(
                PonsBuybackModule(payable(address(vault.activeModule())))
                .processingStatus(address(0), BuybackTypes.SourceBucket.Donation)
                .status
            ),
            uint256(BuybackTypes.Status.GraduationPending)
        );
        vm.prank(trader);
        uint256 positionId = PONS.createGraduatedPool(address(token));
        assertGt(positionId, 0);
        IPonsLaunchFactory.LaunchedToken memory launch = PONS.getLaunchedToken(address(token));
        assertEq(uint256(launch.phase), uint256(GraduationPhase.PoolCreated));
        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(address(token)),
            launch.poolFee,
            launch.tickSpacing,
            IHooks(Integration.MEME_HOOK)
        );
        liquidity = StateLibrary.getLiquidity(
            IPoolManager(Integration.POOL_MANAGER), PoolIdLibrary.toId(key)
        );
        assertGt(liquidity, 0);
        uint256 supply = token.totalSupply();
        uint256 burnedBefore =
            vault.inventory(address(token), BuybackTypes.SourceBucket.Donation).totalBurned;
        uint256 spentBefore =
            vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).totalSpent;
        _testPolicy(address(0), BuybackTypes.Lifecycle.Pool);
        vm.prank(developer);
        vault.processPons(
            address(0),
            BuybackTypes.SourceBucket.Donation,
            1e12,
            PonsBuybackModule(payable(address(vault.activeModule()))).revision(address(0)),
            uint64(block.timestamp)
        );
        assertEq(
            uint256(
                PonsBuybackModule(payable(address(vault.activeModule())))
                .permissionlessPolicy(address(0))
                .lifecycle
            ),
            uint256(BuybackTypes.Lifecycle.Pool)
        );
        assertEq(
            vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).totalSpent
                - spentBefore,
            1e12
        );
        uint256 newlyBurned = vault.inventory(address(token), BuybackTypes.SourceBucket.Donation)
            .totalBurned - burnedBefore;
        assertGt(newlyBurned, 0);
        assertEq(supply - token.totalSupply(), newlyBurned);
        emit log_named_uint("Real graduated pool position", positionId);
        emit log_named_uint("Post-pool purchased tokens actually burned", newlyBurned);
    }

    function test_actualPartialFillGraduationAndPoolBurnPreserveTheSameLimits() public {
        uint256 offered = _prepareClosingPurchase();
        _cross(offered);
        _createAndBuyPool();
    }

    function test_authenticClosingPartialFillBelowMinimumAdvancesClockExactlyOnce() public {
        uint256 offered = _prepareClosingPurchase();
        PonsBuybackModule(payable(address(vault.activeModule())))
            .setLimits(
                address(0),
                BuybackTypes.ExecutionLimits(
                    SafeCast.toUint128(offered), SafeCast.toUint128(offered), 60
                )
            );
        uint256 supply = token.totalSupply();
        vault.processPons(
            address(0),
            BuybackTypes.SourceBucket.Donation,
            offered,
            PonsBuybackModule(payable(address(vault.activeModule()))).revision(address(0)),
            uint64(block.timestamp)
        );
        uint256 spent = vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).totalSpent;
        assertGt(spent, 0);
        assertLt(spent, offered);
        assertEq(
            PonsBuybackModule(payable(address(vault.activeModule()))).lastBuyAt(), block.timestamp
        );
        assertEq(
            PonsBuybackModule(payable(address(vault.activeModule()))).lastAssetBuyAt(address(0)),
            block.timestamp
        );
        assertLt(token.totalSupply(), supply);
        assertTrue(curve.readyToGraduate() || curve.graduated());
        uint64 currentRevision =
            PonsBuybackModule(payable(address(vault.activeModule()))).revision(address(0));
        vm.expectRevert();
        vault.processPons(
            address(0),
            BuybackTypes.SourceBucket.Donation,
            offered,
            currentRevision,
            uint64(block.timestamp)
        );
        assertEq(vault.settlementSequence(), 1);
    }

    function test_holderBurnDoesNotChangeReserveBasedGraduationOrPoolSeed() public {
        uint256 branch = vm.snapshotState();
        uint256 offered = _prepareClosingPurchase();
        _cross(offered);
        IPonsLaunchFactory.LaunchedToken memory first = PONS.getLaunchedToken(address(token));
        uint128 firstLiquidity = _createAndBuyPool();
        vm.revertToState(branch);
        uint256 purchasedHolding = token.balanceOf(developer);
        vm.prank(developer);
        IPonsLauncherToken(address(token)).burn(purchasedHolding / 2);
        offered = _prepareClosingPurchase();
        _cross(offered);
        IPonsLaunchFactory.LaunchedToken memory second = PONS.getLaunchedToken(address(token));
        assertEq(first.sweptQuote, second.sweptQuote);
        assertEq(first.sweptTokens, second.sweptTokens);
        assertEq(_createAndBuyPool(), firstLiquidity);
    }

    function test_labeledAutoGraduationFaultAllowsPublicRecoveryFromReadyAndSwept() public {
        uint256 offered = _prepareClosingPurchase();
        // Deliberate fault branch: only the auto-graduate call is made to fail.
        // Clearing it restores the authentic factory; no success proof uses it.
        vm.mockCallRevert(
            address(PONS),
            abi.encodeCall(PONS.graduate, (address(token))),
            abi.encodeWithSignature("InjectedExternalFault()")
        );
        _cross(offered);
        assertTrue(curve.readyToGraduate());
        assertFalse(curve.graduated());
        assertEq(
            uint256(PONS.getLaunchedToken(address(token)).phase),
            uint256(GraduationPhase.NotGraduated)
        );
        assertEq(
            uint256(
                PonsBuybackModule(payable(address(vault.activeModule())))
                .processingStatus(address(0), BuybackTypes.SourceBucket.Donation)
                .status
            ),
            uint256(BuybackTypes.Status.GraduationPending)
        );
        vm.clearMockedCalls();
        vm.prank(trader);
        PONS.graduate(address(token));
        _createAndBuyPool();
    }
}
