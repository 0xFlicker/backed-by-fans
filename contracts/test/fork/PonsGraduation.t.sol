// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {GraduationPhase} from "../../src/interfaces/external/ILaunchpadV2.sol";
import {IPonsLaunchFactory, IPonsLauncherToken} from "../../src/interfaces/external/IPons.sol";
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {BuybackTypes} from "../../src/types/BuybackTypes.sol";
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
        vault.setRoute(address(0), route);
        vault.setLimits(address(0), BuybackTypes.ExecutionLimits(1, SafeCast.toUint128(offered), 0));
        _testPolicy(address(0), BuybackTypes.Lifecycle.Bonding);
        vm.deal(address(this), offered);
        (bool sent,) = address(vault).call{value: offered}("");
        assertTrue(sent);
        vault.syncDonation(address(0));
    }

    function _cross(uint256 offered) private {
        uint256 supply = token.totalSupply();
        vm.prank(trader);
        vault.process(
            address(0),
            BuybackTypes.SourceBucket.Donation,
            offered,
            vault.revision(address(0)),
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
            uint256(vault.processingStatus(address(0), BuybackTypes.SourceBucket.Donation).status),
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
        vault.process(
            address(0),
            BuybackTypes.SourceBucket.Donation,
            1e12,
            vault.revision(address(0)),
            uint64(block.timestamp)
        );
        assertEq(
            uint256(vault.permissionlessPolicy(address(0)).lifecycle),
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
        vault.setLimits(
            address(0),
            BuybackTypes.ExecutionLimits(
                SafeCast.toUint128(offered), SafeCast.toUint128(offered), 60
            )
        );
        uint256 supply = token.totalSupply();
        vault.process(
            address(0),
            BuybackTypes.SourceBucket.Donation,
            offered,
            vault.revision(address(0)),
            uint64(block.timestamp)
        );
        uint256 spent = vault.inventory(address(0), BuybackTypes.SourceBucket.Donation).totalSpent;
        assertGt(spent, 0);
        assertLt(spent, offered);
        assertEq(vault.lastBuyAt(), block.timestamp);
        assertEq(vault.lastAssetBuyAt(address(0)), block.timestamp);
        assertLt(token.totalSupply(), supply);
        assertTrue(curve.readyToGraduate() || curve.graduated());
        uint64 currentRevision = vault.revision(address(0));
        vm.expectRevert();
        vault.process(
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
            uint256(vault.processingStatus(address(0), BuybackTypes.SourceBucket.Donation).status),
            uint256(BuybackTypes.Status.GraduationPending)
        );
        vm.clearMockedCalls();
        vm.prank(trader);
        PONS.graduate(address(token));
        _createAndBuyPool();
    }
}
