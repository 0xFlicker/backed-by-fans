// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {DeployForkProtocol} from "./DeployForkProtocol.s.sol";

/// @notice Local membership protocol with no Pons launch or protocol-token purchase.
/// @dev Inherits the same preserved-leaf deployment and runtime checks through _deployLocal.
contract DeployForkProtocolNoToken is DeployForkProtocol {
    function _deployFork(address developer, address[] memory owners, bytes32 salt, uint256)
        internal
        override
        returns (Deployment memory result)
    {
        _validateForkDependencies();
        if (owners.length != 1 || owners[0] == address(0) || owners[0] == developer) {
            revert InvalidLaunchTerms();
        }
        result.developer = developer;
        result.safe = _deploySafe(owners, salt);
        _validateLocalToken(USDG, result.safe, address(0));
        (result.mediaStoreFactory, result.renderer, result.previewHarness, result.factory) =
            _deployLocal(USDG, result.safe, address(0));
    }
}
