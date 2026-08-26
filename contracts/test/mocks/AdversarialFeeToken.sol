// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITokenTransferReceiver {
    function onTokenTransfer() external;
}

/// @notice ERC-20 test double for fee-vault outbound transfer failures.
contract AdversarialFeeToken is ERC20 {
    enum TransferMode {
        Normal,
        ReturnFalse,
        ShortTransfer,
        Callback
    }

    TransferMode public transferMode;

    constructor() ERC20("Adversarial USDG", "aUSDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function setTransferMode(TransferMode newMode) external {
        transferMode = newMode;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        TransferMode mode = transferMode;
        if (mode == TransferMode.ReturnFalse) return false;

        if (mode == TransferMode.ShortTransfer) {
            _transfer(_msgSender(), recipient, amount - 1);
            return true;
        }

        _transfer(_msgSender(), recipient, amount);
        if (mode == TransferMode.Callback && recipient.code.length != 0) {
            ITokenTransferReceiver(recipient).onTokenTransfer();
        }
        return true;
    }
}
