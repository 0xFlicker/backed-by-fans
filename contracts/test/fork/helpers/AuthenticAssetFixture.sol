// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackIntegration as Integration} from "../../../src/libraries/BuybackIntegration.sol";
import {PonsForkFixture} from "./PonsForkFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {
    IUniversalRouter
} from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IV4Quoter} from "@uniswap/v4-periphery/src/interfaces/IV4Quoter.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

interface IAuthenticWETH {
    function deposit() external payable;
}

/// @notice Acquires authentic assets using actual deposits/trades. No balance,
/// implementation, issuer permission, price or liquidity storage is patched.
abstract contract AuthenticAssetFixture is PonsForkFixture {
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant AMD = 0x86923f96303D656E4aa86D9d42D1e57ad2023fdC;
    address internal constant QUOTER = 0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94;

    function _usdPool() internal pure returns (PoolKey memory) {
        return PoolKey(Currency.wrap(address(0)), Currency.wrap(USDG), 100, 1, IHooks(address(0)));
    }

    function _stockPool() internal pure returns (PoolKey memory) {
        return PoolKey(Currency.wrap(USDG), Currency.wrap(AMD), 10_000, 200, IHooks(address(0)));
    }

    function _acquire(address asset, address buyer, uint256 ethAmount)
        internal
        returns (uint256 acquired)
    {
        uint256 beforeBalance = IERC20(asset).balanceOf(buyer);
        if (asset == Integration.WETH) {
            vm.prank(buyer);
            IAuthenticWETH(asset).deposit{value: ethAmount}();
        } else {
            uint256 usd = _tradeAs(buyer, _usdPool(), true, ethAmount);
            if (asset == AMD) _tradeAs(buyer, _stockPool(), true, usd);
            else assertEq(asset, USDG);
        }
        acquired = IERC20(asset).balanceOf(buyer) - beforeBalance;
        assertGt(acquired, 0);
    }

    function _tradeAs(address buyer, PoolKey memory key, bool zeroForOne, uint256 amount)
        internal
        returns (uint256 output)
    {
        address input = Currency.unwrap(zeroForOne ? key.currency0 : key.currency1);
        address destination = Currency.unwrap(zeroForOne ? key.currency1 : key.currency0);
        (uint256 quote,) = IV4Quoter(QUOTER)
            .quoteExactInputSingle(
                IV4Quoter.QuoteExactSingleParams(key, zeroForOne, SafeCast.toUint128(amount), hex"")
            );
        uint256 floor = quote * 99 / 100;
        uint256 beforeOutput =
            destination == address(0) ? buyer.balance : IERC20(destination).balanceOf(buyer);
        bytes[] memory actions = new bytes[](3);
        actions[0] = abi.encode(
            IV4Router.ExactInputSingleParams(
                key, zeroForOne, SafeCast.toUint128(amount), SafeCast.toUint128(floor), 0, hex""
            )
        );
        actions[1] = abi.encode(Currency.wrap(input), amount);
        actions[2] = abi.encode(Currency.wrap(destination), floor);
        bytes[] memory commands = new bytes[](2);
        commands[0] = abi.encode(
            abi.encodePacked(
                uint8(Actions.SWAP_EXACT_IN_SINGLE),
                uint8(Actions.SETTLE_ALL),
                uint8(Actions.TAKE_ALL)
            ),
            actions
        );
        commands[1] = abi.encode(address(0), buyer, uint256(0));
        vm.startPrank(buyer);
        if (input != address(0)) {
            assertTrue(IERC20(input).approve(Integration.PERMIT2, amount));
            IAllowanceTransfer(Integration.PERMIT2)
                .approve(
                    input,
                    Integration.ROUTER,
                    SafeCast.toUint160(amount),
                    SafeCast.toUint48(block.timestamp + 300)
                );
        }
        IUniversalRouter(Integration.ROUTER).execute{value: input == address(0) ? amount : 0}(
            abi.encodePacked(uint8(Commands.V4_SWAP), uint8(Commands.SWEEP)),
            commands,
            block.timestamp + 300
        );
        if (input != address(0)) {
            assertTrue(IERC20(input).approve(Integration.PERMIT2, 0));
            IAllowanceTransfer(Integration.PERMIT2).approve(input, Integration.ROUTER, 0, 1);
        }
        vm.stopPrank();
        output = (destination == address(0) ? buyer.balance : IERC20(destination).balanceOf(buyer))
            - beforeOutput;
        assertGe(output, floor);
    }
}
