// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IPonsBuybackExecutor} from "./interfaces/IPonsBuybackExecutor.sol";
import {GraduationPhase} from "./interfaces/external/ILaunchpadV2.sol";
import {IPonsBondingCurve, IPonsLaunchFactory} from "./interfaces/external/IPons.sol";
import {BuybackIntegration as Integration} from "./libraries/BuybackIntegration.sol";
import {BuybackPolicyMath} from "./libraries/BuybackPolicyMath.sol";
import {ProtocolLaunchValidation} from "./libraries/ProtocolLaunchValidation.sol";
import {BuybackTypes} from "./types/BuybackTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
    error PriceBelowFloor(uint256 received, uint256 required);
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

    // Before/after balances deliberately measure exact settlement. nonReentrant
    // and the immutable vault caller prevent nested execution during these reads.
    // slither-disable-next-line reentrancy-balance
    function execute(
        address asset,
        uint256 amount,
        BuybackTypes.TypedRoute calldata route,
        BuybackTypes.Rate[] calldata rates,
        uint64 deadline
    ) external payable override nonReentrant returns (BuybackTypes.Execution memory result) {
        if (msg.sender != vault) revert OnlyVault();
        if (
            amount == 0 || asset == protocolToken || route.pools.length > 2
                || rates.length != route.pools.length + 1
                || msg.value != (asset == address(0) ? amount : 0)
        ) revert InvalidExecution();
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
        address[] memory assets = new address[](route.pools.length + 4);
        uint256[] memory baseline = new uint256[](assets.length);
        uint256 assetCount = _track(assets, baseline, 0, asset);
        for (uint256 i; i < route.pools.length; ++i) {
            assetCount =
                _track(assets, baseline, assetCount, Currency.unwrap(route.pools[i].currency0));
            assetCount =
                _track(assets, baseline, assetCount, Currency.unwrap(route.pools[i].currency1));
        }
        assetCount = _track(assets, baseline, assetCount, address(0));
        assetCount = _track(assets, baseline, assetCount, protocolToken);
        baseline[0] -= amount;
        result.legs = new BuybackTypes.Leg[](route.pools.length + 2);
        uint256 legCount;
        address current = asset;
        uint256 available = amount;
        for (uint256 i; i < route.pools.length; ++i) {
            BuybackTypes.Leg memory leg =
                _swap(current, available, route.pools[i], rates[i], deadline);
            result.legs[legCount++] = leg;
            current = leg.output;
            available = leg.received;
        }
        if (current == Integration.WETH) {
            uint256 beforeETH = address(this).balance;
            uint256 beforeWETH = IERC20(current).balanceOf(address(this));
            IWrappedEther(current).withdraw(available);
            if (
                address(this).balance != beforeETH + available
                    || IERC20(current).balanceOf(address(this)) != beforeWETH - available
            ) revert InexactSettlement();
            result.legs[legCount++] = BuybackTypes.Leg(current, address(0), available, available);
            current = address(0);
        }
        if (current != address(0)) revert InvalidExecution();
        BuybackTypes.Leg memory purchase = result.lifecycle == BuybackTypes.Lifecycle.Bonding
            ? _buyCurve(available, rates[rates.length - 1])
            : _buyPool(available, rates[rates.length - 1], deadline);
        result.legs[legCount++] = purchase;
        result.acquired = purchase.received;
        // Trim the allocation; no unused zero-valued leg is part of the accounting.
        BuybackTypes.Leg[] memory legs = result.legs;
        assembly ("memory-safe") { mstore(legs, legCount) }
        for (uint256 i; i < assetCount; ++i) {
            uint256 closing = _balance(assets[i]);
            if (closing < baseline[i]) revert InexactSettlement();
            uint256 returned = closing - baseline[i];
            if (returned != 0) _return(assets[i], returned);
            if (_balance(assets[i]) != baseline[i]) revert InexactSettlement();
        }
    }

    // Only execute() reaches this helper under nonReentrant. The immutable curve
    // is validated from Pons at construction; no caller can replace the recipient.
    // slither-disable-next-line arbitrary-send-eth,reentrancy-balance
    function _buyCurve(uint256 amount, BuybackTypes.Rate memory rate)
        private
        returns (BuybackTypes.Leg memory leg)
    {
        uint256 ethBefore = address(this).balance;
        uint256 tokenBefore = IERC20(protocolToken).balanceOf(address(this));
        // The curve's minimum is proportional on partial fills. The exact Safe
        // floor is checked below against measured spend, with one upward rounding.
        uint256 reported = IPonsBondingCurve(curve).buy{value: amount}(amount, 1, address(this));
        leg = BuybackTypes.Leg(
            address(0),
            protocolToken,
            ethBefore - address(this).balance,
            IERC20(protocolToken).balanceOf(address(this)) - tokenBefore
        );
        if (leg.received != reported) revert InexactSettlement();
        _checkFloor(leg, rate);
    }

    function _buyPool(uint256 amount, BuybackTypes.Rate memory rate, uint64 deadline)
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
        return _swap(address(0), amount, key, rate, deadline);
    }

    // Only execute() reaches this helper under nonReentrant. Snapshots measure
    // actual deltas and preserve pre-existing router/executor balances.
    // slither-disable-next-line reentrancy-balance
    function _swap(
        address input,
        uint256 amount,
        PoolKey memory key,
        BuybackTypes.Rate memory rate,
        uint64 deadline
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
        _routerSwap(key, zeroForOne, amount, deadline, input == address(0));
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
            ) revert InexactSettlement();
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
        if (leg.spent > amount) revert InexactSettlement();
        _checkFloor(leg, rate);
    }

    function _routerSwap(
        PoolKey memory key,
        bool zeroForOne,
        uint256 amount,
        uint64 deadline,
        bool nativeInput
    ) private {
        bytes[] memory actions = new bytes[](3);
        actions[0] = abi.encode(
            IV4Router.ExactInputSingleParams(
                key, zeroForOne, SafeCast.toUint128(amount), 1, 0, hex""
            )
        );
        actions[1] = abi.encode(zeroForOne ? key.currency0 : key.currency1, amount);
        actions[2] = abi.encode(zeroForOne ? key.currency1 : key.currency0, uint256(1));
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

    function _checkFloor(BuybackTypes.Leg memory leg, BuybackTypes.Rate memory rate) private pure {
        if (leg.spent == 0 || leg.received == 0) revert InexactSettlement();
        uint256 required = BuybackPolicyMath.minimum(leg.spent, rate);
        if (leg.received < required) revert PriceBelowFloor(leg.received, required);
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
