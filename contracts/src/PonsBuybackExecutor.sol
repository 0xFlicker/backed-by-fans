// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IPonsBuybackExecutor} from "./interfaces/IPonsBuybackExecutor.sol";
import {GraduationPhase} from "./interfaces/external/ILaunchpadV2.sol";
import {IPonsBondingCurve, IPonsLaunchFactory} from "./interfaces/external/IPons.sol";
import {BuybackIntegration as Integration} from "./libraries/BuybackIntegration.sol";
import {ProtocolLaunchValidation} from "./libraries/ProtocolLaunchValidation.sol";
import {BuybackTypes} from "./types/BuybackTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {
    IUniversalRouter
} from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

interface IWrappedEther {
    function withdraw(uint256 amount) external;
}

/// @notice Fixed-purpose settlement. Only the immutable vault can supply funds and terms.
contract PonsBuybackExecutor is ReentrancyGuard, IPonsBuybackExecutor {
    using SafeERC20 for IERC20;

    struct MarketState {
        address current;
        uint256 available;
        uint256 legCount;
    }

    struct BalanceSnapshot {
        address[] assets;
        uint256[] baseline;
        uint256 count;
    }

    struct ExecutionTerms {
        uint256[] minimumOutputs;
        BuybackTypes.OutputRate[] rates;
        uint64 deadline;
    }

    struct SwapBalances {
        uint256 input;
        uint256 output;
        uint256 routerETH;
        uint256 routerInput;
        uint256 routerOutput;
    }
    address public immutable override vault;
    address public immutable override protocolToken;
    address public immutable override curve;
    error OnlyVault();
    error InvalidDependency();
    error InvalidExecution();
    error GraduationPending();
    error LaunchPenalty();
    error InexactSettlement();

    constructor(address vault_, address token_) {
        if (vault_ == address(0) || msg.sender != vault_) revert OnlyVault();
        vault = vault_;
        protocolToken = token_;
        curve = ProtocolLaunchValidation.validate(token_);
        _validateDependencies();
    }

    receive() external payable {
        // V4 TAKE_ALL pays the executor directly from PoolManager. ETH is
        // accepted only within the active vault-authorized settlement.
        if (
            !_reentrancyGuardEntered()
                || (msg.sender != curve
                    && msg.sender != Integration.ROUTER
                    && msg.sender != Integration.WETH
                    && msg.sender != Integration.POOL_MANAGER)
        ) revert InvalidExecution();
    }

    function _validateDependencies() private view {
        if (
            Integration.ROUTER.codehash != Integration.ROUTER_HASH
                || Integration.PERMIT2.codehash != Integration.PERMIT2_HASH
                || Integration.POOL_MANAGER.codehash != Integration.POOL_MANAGER_HASH
                || Integration.WETH.codehash != Integration.WETH_HASH
                || Integration.MEME_HOOK.codehash != Integration.MEME_HOOK_HASH
        ) revert InvalidDependency();
    }

    function lifecycle() public view override returns (BuybackTypes.Lifecycle) {
        IPonsLaunchFactory.LaunchedToken memory launch =
            IPonsLaunchFactory(Integration.PONS_FACTORY).getLaunchedToken(protocolToken);
        if (launch.phase == GraduationPhase.PoolCreated) return BuybackTypes.Lifecycle.Pool;
        if (
            launch.phase != GraduationPhase.NotGraduated
                || IPonsBondingCurve(curve).readyToGraduate()
                || IPonsBondingCurve(curve).graduated()
        ) return BuybackTypes.Lifecycle.GraduationPending;
        return BuybackTypes.Lifecycle.Bonding;
    }

    function execute(
        address asset,
        uint256 amount,
        BuybackTypes.TypedRoute calldata route,
        uint256[] calldata minimumOutputs,
        BuybackTypes.OutputRate[] calldata rates,
        uint64 deadline
    ) external payable override nonReentrant returns (BuybackTypes.Execution memory result) {
        return _execute(asset, amount, route, ExecutionTerms(minimumOutputs, rates, deadline));
    }

    // Only execute() enters this private helper under nonReentrant; the immutable
    // vault caller is checked before settlement. Balance snapshots intentionally
    // measure external calls, while callbacks cannot start another execution.
    // slither-disable-next-line reentrancy-balance
    function _execute(
        address asset,
        uint256 amount,
        BuybackTypes.TypedRoute calldata route,
        ExecutionTerms memory terms
    ) private returns (BuybackTypes.Execution memory result) {
        if (msg.sender != vault) revert OnlyVault();
        if (
            amount == 0 || asset == protocolToken || route.pools.length > 2
                || msg.value != (asset == address(0) ? amount : 0)
        ) revert InvalidExecution();
        uint256 marketLegs = route.pools.length + 1;
        if ((terms.minimumOutputs.length == marketLegs) == (terms.rates.length == marketLegs)) {
            revert InvalidExecution();
        }
        if (terms.minimumOutputs.length != 0 && terms.rates.length != 0) revert InvalidExecution();
        for (uint256 i; i < marketLegs; ++i) {
            if (terms.minimumOutputs.length != 0) {
                if (terms.minimumOutputs[i] == 0) revert InvalidExecution();
            } else if (terms.rates[i].numerator == 0 || terms.rates[i].denominator == 0) {
                revert InvalidExecution();
            }
        }
        _validateDependencies();
        result.lifecycle = lifecycle();
        if (result.lifecycle == BuybackTypes.Lifecycle.GraduationPending) {
            revert GraduationPending();
        }
        if (
            result.lifecycle == BuybackTypes.Lifecycle.Bonding
                && IPonsBondingCurve(curve).currentSnipeTaxBps(address(this)) != 0
        ) revert LaunchPenalty();
        // Preserve all pre-existing executor balances. Only newly supplied or
        // acquired route assets return to this settlement's source bucket.
        BalanceSnapshot memory snapshot = _snapshot(route, asset, amount);
        result.legs = new BuybackTypes.Leg[](route.pools.length + 2);
        MarketState memory market = MarketState(asset, amount, 0);
        for (uint256 i; i < route.pools.length; ++i) {
            BuybackTypes.Leg memory leg = _swap(
                market.current,
                market.available,
                route.pools[i],
                terms.deadline,
                _minimum(market.available, i, terms.minimumOutputs, terms.rates)
            );
            result.legs[market.legCount++] = leg;
            market.current = leg.output;
            market.available = leg.received;
        }
        if (market.current == Integration.WETH) {
            uint256 beforeETH = address(this).balance;
            uint256 beforeWETH = IERC20(market.current).balanceOf(address(this));
            IWrappedEther(market.current).withdraw(market.available);
            if (
                address(this).balance != beforeETH + market.available
                    || IERC20(market.current).balanceOf(address(this))
                        != beforeWETH - market.available
            ) revert InexactSettlement();
            result.legs[market.legCount++] =
                BuybackTypes.Leg(market.current, address(0), market.available, market.available);
            market.current = address(0);
        }
        if (market.current != address(0)) revert InvalidExecution();
        uint256 finalMinimum =
            _minimum(market.available, route.pools.length, terms.minimumOutputs, terms.rates);
        BuybackTypes.Leg memory purchase = result.lifecycle == BuybackTypes.Lifecycle.Bonding
            ? _buyCurve(market.available, finalMinimum)
            : _buyPool(market.available, terms.deadline, finalMinimum);
        result.legs[market.legCount++] = purchase;
        result.acquired = purchase.received;
        // Trim the allocation; no unused zero-valued leg is part of the accounting.
        BuybackTypes.Leg[] memory legs = result.legs;
        uint256 legCount = market.legCount;
        assembly ("memory-safe") { mstore(legs, legCount) }
        for (uint256 i; i < snapshot.count; ++i) {
            uint256 closing = _balance(snapshot.assets[i]);
            if (closing < snapshot.baseline[i]) revert InexactSettlement();
            uint256 returned = closing - snapshot.baseline[i];
            if (returned != 0) _return(snapshot.assets[i], returned);
            if (_balance(snapshot.assets[i]) != snapshot.baseline[i]) revert InexactSettlement();
        }
    }

    function _snapshot(BuybackTypes.TypedRoute calldata route, address asset, uint256 amount)
        private
        view
        returns (BalanceSnapshot memory snapshot)
    {
        snapshot.assets = new address[](route.pools.length + 4);
        snapshot.baseline = new uint256[](snapshot.assets.length);
        snapshot.count = _track(snapshot.assets, snapshot.baseline, 0, asset);
        for (uint256 i; i < route.pools.length; ++i) {
            snapshot.count = _track(
                snapshot.assets,
                snapshot.baseline,
                snapshot.count,
                Currency.unwrap(route.pools[i].currency0)
            );
            snapshot.count = _track(
                snapshot.assets,
                snapshot.baseline,
                snapshot.count,
                Currency.unwrap(route.pools[i].currency1)
            );
        }
        snapshot.count = _track(snapshot.assets, snapshot.baseline, snapshot.count, address(0));
        snapshot.count = _track(snapshot.assets, snapshot.baseline, snapshot.count, protocolToken);
        snapshot.baseline[0] -= amount;
    }

    // Only execute() reaches this helper under nonReentrant. The immutable curve
    // is validated from Pons at construction; no caller can replace the recipient.
    // slither-disable-next-line arbitrary-send-eth,reentrancy-balance
    function _buyCurve(uint256 amount, uint256 minimumOutput)
        private
        returns (BuybackTypes.Leg memory leg)
    {
        uint256 ethBefore = address(this).balance;
        uint256 tokenBefore = IERC20(protocolToken).balanceOf(address(this));
        // Require a nonzero purchase; measured deltas below prove exact settlement.
        uint256 reported =
            IPonsBondingCurve(curve).buy{value: amount}(amount, minimumOutput, address(this));
        leg = BuybackTypes.Leg(
            address(0),
            protocolToken,
            ethBefore - address(this).balance,
            IERC20(protocolToken).balanceOf(address(this)) - tokenBefore
        );
        if (leg.received != reported || leg.received < minimumOutput) revert InexactSettlement();
        _checkSettlement(leg);
    }

    function _buyPool(uint256 amount, uint64 deadline, uint256 minimumOutput)
        private
        returns (BuybackTypes.Leg memory)
    {
        IPonsLaunchFactory.LaunchedToken memory launch =
            IPonsLaunchFactory(Integration.PONS_FACTORY).getLaunchedToken(protocolToken);
        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(protocolToken),
            launch.poolFee,
            launch.tickSpacing,
            IHooks(Integration.MEME_HOOK)
        );
        (uint160 price,,,) =
            StateLibrary.getSlot0(IPoolManager(Integration.POOL_MANAGER), PoolIdLibrary.toId(key));
        if (price == 0) revert GraduationPending();
        return _swap(address(0), amount, key, deadline, minimumOutput);
    }

    // Only execute() reaches this helper under nonReentrant. Snapshots measure
    // actual deltas and preserve pre-existing router/executor balances.
    // slither-disable-next-line reentrancy-balance
    function _swap(
        address input,
        uint256 amount,
        PoolKey memory key,
        uint64 deadline,
        uint256 minimumOutput
    ) private returns (BuybackTypes.Leg memory leg) {
        bool zeroForOne = input == Currency.unwrap(key.currency0);
        if (!zeroForOne && input != Currency.unwrap(key.currency1)) revert InvalidExecution();
        address output = Currency.unwrap(zeroForOne ? key.currency1 : key.currency0);
        SwapBalances memory beforeSwap = SwapBalances(
            _balance(input),
            _balance(output),
            Integration.ROUTER.balance,
            input == address(0)
                ? Integration.ROUTER.balance
                : IERC20(input).balanceOf(Integration.ROUTER),
            output == address(0)
                ? Integration.ROUTER.balance
                : IERC20(output).balanceOf(Integration.ROUTER)
        );
        if (input != address(0)) {
            IERC20(input).forceApprove(Integration.PERMIT2, amount);
            IAllowanceTransfer(Integration.PERMIT2)
                .approve(
                    input,
                    Integration.ROUTER,
                    SafeCast.toUint160(amount),
                    SafeCast.toUint48(deadline)
                );
        }
        _routerSwap(key, zeroForOne, amount, deadline, input == address(0), minimumOutput);
        // SWEEP refunds newly unused ETH. Preserve unrelated router ETH exactly;
        // it is neither this purchase's input nor this vault's revenue.
        if (beforeSwap.routerETH != 0) {
            IUniversalRouter(Integration.ROUTER).execute{value: beforeSwap.routerETH}(
                hex"", new bytes[](0), deadline
            );
        }
        if (input != address(0)) {
            IERC20(input).forceApprove(Integration.PERMIT2, 0);
            // Permit2 rewrites expiration 0 to the current block. Use an
            // explicit past expiration and zero amount for a cleared approval.
            IAllowanceTransfer(Integration.PERMIT2).approve(input, Integration.ROUTER, 0, 1);
            (uint160 allowance, uint48 expiry,) = IAllowanceTransfer(Integration.PERMIT2)
                .allowance(address(this), input, Integration.ROUTER);
            if (
                allowance != 0 || expiry != 1
                    || IERC20(input).allowance(address(this), Integration.PERMIT2) != 0
            ) {
                revert InexactSettlement();
            }
        }
        if (
            Integration.ROUTER.balance != beforeSwap.routerETH
                || (input != address(0)
                    && IERC20(input).balanceOf(Integration.ROUTER) != beforeSwap.routerInput)
                || (output != address(0)
                    && IERC20(output).balanceOf(Integration.ROUTER) != beforeSwap.routerOutput)
        ) revert InexactSettlement();
        leg = BuybackTypes.Leg(
            input, output, beforeSwap.input - _balance(input), _balance(output) - beforeSwap.output
        );
        if (leg.spent > amount || leg.received < minimumOutput) revert InexactSettlement();
        _checkSettlement(leg);
    }

    function _routerSwap(
        PoolKey memory key,
        bool zeroForOne,
        uint256 amount,
        uint64 deadline,
        bool nativeInput,
        uint256 minimumOutput
    ) private {
        bytes[] memory actions = new bytes[](3);
        actions[0] = abi.encode(
            IV4Router.ExactInputSingleParams(
                key,
                zeroForOne,
                SafeCast.toUint128(amount),
                SafeCast.toUint128(minimumOutput),
                0,
                hex""
            )
        );
        actions[1] = abi.encode(zeroForOne ? key.currency0 : key.currency1, amount);
        actions[2] = abi.encode(zeroForOne ? key.currency1 : key.currency0, minimumOutput);
        bytes[] memory commands = new bytes[](2);
        commands[0] = abi.encode(
            abi.encodePacked(
                uint8(Actions.SWAP_EXACT_IN_SINGLE),
                uint8(Actions.SETTLE_ALL),
                uint8(Actions.TAKE_ALL)
            ),
            actions
        );
        commands[1] = abi.encode(address(0), address(this), uint256(0));
        IUniversalRouter(Integration.ROUTER).execute{value: nativeInput ? amount : 0}(
            abi.encodePacked(uint8(Commands.V4_SWAP), uint8(Commands.SWEEP)), commands, deadline
        );
    }

    function _minimum(
        uint256 offered,
        uint256 index,
        uint256[] memory minimumOutputs,
        BuybackTypes.OutputRate[] memory rates
    ) private pure returns (uint256) {
        if (minimumOutputs.length != 0) {
            return minimumOutputs[index];
        }
        return
            Math.mulDiv(
                offered, rates[index].numerator, rates[index].denominator, Math.Rounding.Ceil
            );
    }

    function _checkSettlement(BuybackTypes.Leg memory leg) private pure {
        if (leg.spent == 0 || leg.received == 0) revert InexactSettlement();
    }

    function _track(
        address[] memory assets,
        uint256[] memory balances,
        uint256 count,
        address asset
    ) private view returns (uint256) {
        for (uint256 i; i < count; ++i) {
            if (assets[i] == asset) return count;
        }
        assets[count] = asset;
        balances[count] = _balance(asset);
        return count + 1;
    }

    function _balance(address asset) private view returns (uint256) {
        return asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
    }

    function _return(address asset, uint256 amount) private {
        if (asset == address(0)) {
            (bool sent,) = vault.call{value: amount}("");
            if (!sent) revert InexactSettlement();
        } else {
            IERC20(asset).safeTransfer(vault, amount);
        }
    }
}
