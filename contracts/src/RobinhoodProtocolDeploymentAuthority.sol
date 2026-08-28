// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Frozen authority used only to protect the public CREATE2 deployment slot.
/// @dev Changing this value intentionally changes the coordinator creation code and address.
library RobinhoodProtocolDeploymentAuthority {
    address internal constant APPROVED_DEPLOYER = 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027;
    address internal constant INITIAL_PROTOCOL_AUTHORITY =
        0xeAA4B38A99f766117C1D493a21012fec25f70505;
}
