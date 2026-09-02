// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice ERC-8056 core scaled-UI amount interface.
interface IScaledUIAmount {
    event UIMultiplierUpdated(
        uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp
    );
    event TransferWithUIAmount(
        address indexed from, address indexed to, uint256 amount, uint256 uiAmount
    );

    function uiMultiplier() external view returns (uint256);
}

/// @notice ERC-8056 required pending-multiplier extension.
interface IScaledUIAmountNewUIMultiplier {
    function newUIMultiplier() external view returns (uint256);

    function effectiveAt() external view returns (uint256);
}

library ERC8056InterfaceIds {
    bytes4 internal constant SCALED_UI_AMOUNT = 0xa60bf13d;
    bytes4 internal constant PENDING_UI_MULTIPLIER = 0x4bd27648;
    bytes4 internal constant CONVERSION = 0x57854fc3;
    bytes4 internal constant UI_BALANCES = 0xd890fd71;
}
