// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Configurable ERC-20 test double for exact-delta and reentrancy boundaries.
contract AdversarialERC20 is ERC20 {
    enum Behavior {
        Normal,
        ReturnFalse,
        RevertTransfer,
        ShortTransfer,
        TaxedTransfer,
        Callback
    }

    Behavior public transferBehavior;
    Behavior public transferFromBehavior;
    mapping(address account => bool frozen) public frozen;

    address public callbackTarget;
    bytes public callbackData;
    uint256 public callbackAttempts;
    bool public lastCallbackSucceeded;

    error AccountFrozen();
    error ForcedTransferRevert();

    constructor() ERC20("Adversarial USDG", "aUSDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function setTransferBehavior(Behavior behavior) external {
        transferBehavior = behavior;
    }

    function setTransferFromBehavior(Behavior behavior) external {
        transferFromBehavior = behavior;
    }

    function setFrozen(address account, bool isFrozen) external {
        frozen[account] = isFrozen;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        callbackAttempts = 0;
        lastCallbackSucceeded = false;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        return _performTransfer(_msgSender(), recipient, amount, transferBehavior);
    }

    function transferFrom(address sender, address recipient, uint256 amount)
        public
        override
        returns (bool)
    {
        _spendAllowance(sender, _msgSender(), amount);
        return _performTransfer(sender, recipient, amount, transferFromBehavior);
    }

    function _performTransfer(address sender, address recipient, uint256 amount, Behavior behavior)
        private
        returns (bool)
    {
        if (behavior == Behavior.ReturnFalse) return false;
        if (behavior == Behavior.RevertTransfer) revert ForcedTransferRevert();
        if (frozen[sender] || frozen[recipient]) revert AccountFrozen();

        if (behavior == Behavior.ShortTransfer && amount != 0) {
            _transfer(sender, recipient, amount - 1);
        } else if (behavior == Behavior.TaxedTransfer && amount != 0) {
            _burn(sender, 1);
            _transfer(sender, recipient, amount - 1);
        } else {
            _transfer(sender, recipient, amount);
        }

        if (behavior == Behavior.Callback && callbackTarget != address(0)) {
            ++callbackAttempts;
            (lastCallbackSucceeded,) = callbackTarget.call(callbackData);
        }
        return true;
    }
}
