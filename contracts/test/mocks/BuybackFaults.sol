// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackIntegration} from "../../src/libraries/BuybackIntegration.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Explicit synthetic fault injection. Never used in authentic fork evidence.
contract FaultBurnToken is ERC20 {
    uint8 public burnMode;
    constructor() ERC20("Fault protocol token", "FAULT") {}

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function setBurnMode(uint8 mode) external {
        burnMode = mode;
    }

    function burn(uint256 amount) external {
        if (burnMode == 1) return;
        _burn(msg.sender, amount + (burnMode == 2 ? 1 : 0));
    }
}

contract FaultBondingCurve {
    address public immutable token;
    uint256 public spendBps = 10_000;
    uint256 public outputNumerator = 1;
    uint256 public outputDenominator = 1;
    uint256 public undercut;
    uint256 public penalty;
    bool public graduated;
    bool public readyToGraduate;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;

    constructor(address token_) {
        token = token_;
    }

    function factory() external pure returns (address) {
        return BuybackIntegration.PONS_FACTORY;
    }

    function pairToken() external pure returns (address) {
        return address(0);
    }

    function currentSnipeTaxBps(address) external view returns (uint256) {
        return penalty;
    }

    function configure(uint256 spendBps_, uint256 numerator, uint256 denominator, uint256 undercut_)
        external
    {
        spendBps = spendBps_;
        outputNumerator = numerator;
        outputDenominator = denominator;
        undercut = undercut_;
    }

    function setLifecycle(uint256 penalty_, bool ready, bool closed) external {
        penalty = penalty_;
        readyToGraduate = ready;
        graduated = closed;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function buy(uint256 offered, uint256, address recipient)
        external
        payable
        returns (uint256 output)
    {
        require(msg.value == offered);
        uint256 spent = offered * spendBps / 10_000;
        output = spent * outputNumerator / outputDenominator;
        output = output > undercut ? output - undercut : 0;
        if (callbackTarget != address(0)) (callbackSucceeded,) = callbackTarget.call(callbackData);
        require(IERC20(token).transfer(recipient, output));
        if (spent < offered) {
            (bool sent,) = msg.sender.call{value: offered - spent}("");
            require(sent);
        }
    }
}

/// @dev Test-only WETH implementation behind the recorded proxy runtime.
contract SyntheticWrappedEther is ERC20 {
    constructor() ERC20("Synthetic WETH", "WETH") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok);
    }
}
