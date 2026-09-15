// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackIntegration as Integration} from "../../src/libraries/BuybackIntegration.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {
    IUniversalRouter
} from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Vm} from "forge-std/Vm.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

contract SyntheticLiquidityBank {
    receive() external payable {}

    function payToken(address token, address recipient, uint256 amount) external {
        require(msg.sender == Integration.ROUTER);
        require(IERC20(token).transfer(recipient, amount));
    }

    function pay(address recipient, uint256 amount) external {
        require(msg.sender == Integration.ROUTER);
        IUniversalRouter(recipient).execute{value: amount}(hex"", new bytes[](0), type(uint256).max);
    }
}

/// @dev ONLY synthetic model tests: substitutes router execution while keeping
/// real Permit2 allowances/transfers. Never imported by fork or deployment code.
contract SyntheticConversionRouter {
    SyntheticLiquidityBank private immutable _bank;

    constructor(SyntheticLiquidityBank bank) {
        _bank = bank;
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256) external payable {
        if (commands.length == 0) return;
        (, bytes[] memory actions) = abi.decode(inputs[0], (bytes, bytes[]));
        IV4Router.ExactInputSingleParams memory swap =
            abi.decode(actions[0], (IV4Router.ExactInputSingleParams));
        address input =
            Currency.unwrap(swap.zeroForOne ? swap.poolKey.currency0 : swap.poolKey.currency1);
        require(
            Currency.unwrap(swap.zeroForOne ? swap.poolKey.currency1 : swap.poolKey.currency0)
                == address(0)
        );
        IAllowanceTransfer(Integration.PERMIT2)
            .transferFrom(msg.sender, address(_bank), SafeCast.toUint160(swap.amountIn), input);
        _bank.pay(address(this), uint256(swap.amountIn) * 1e16);
        (bool ok,) = msg.sender.call{value: address(this).balance}("");
        require(ok);
    }
}

/// @dev Two distinct synthetic conversion rates, preserving real Permit2 input transfers.
contract SyntheticTwoLegRouter {
    SyntheticLiquidityBank private immutable _bank;
    address private immutable _middle;

    constructor(SyntheticLiquidityBank bank, address middle) {
        _bank = bank;
        _middle = middle;
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256) external payable {
        if (commands.length == 0) return;
        (, bytes[] memory actions) = abi.decode(inputs[0], (bytes, bytes[]));
        IV4Router.ExactInputSingleParams memory swap =
            abi.decode(actions[0], (IV4Router.ExactInputSingleParams));
        address input =
            Currency.unwrap(swap.zeroForOne ? swap.poolKey.currency0 : swap.poolKey.currency1);
        address output =
            Currency.unwrap(swap.zeroForOne ? swap.poolKey.currency1 : swap.poolKey.currency0);
        IAllowanceTransfer(Integration.PERMIT2)
            .transferFrom(msg.sender, address(_bank), SafeCast.toUint160(swap.amountIn), input);
        _bank.payToken(output, msg.sender, uint256(swap.amountIn) * (output == _middle ? 2 : 3));
    }
}

library SyntheticConversionBinding {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function install() internal {
        SyntheticLiquidityBank bank = new SyntheticLiquidityBank();
        VM.deal(address(bank), 1_000_000 ether);
        SyntheticConversionRouter router = new SyntheticConversionRouter(bank);
        VM.mockFunction(
            Integration.ROUTER,
            address(router),
            abi.encodeWithSignature("execute(bytes,bytes[],uint256)")
        );
        VM.mockCall(
            Integration.POOL_MANAGER,
            abi.encodeWithSignature("extsload(bytes32)"),
            abi.encode(bytes32(uint256(1)))
        );
    }
}
