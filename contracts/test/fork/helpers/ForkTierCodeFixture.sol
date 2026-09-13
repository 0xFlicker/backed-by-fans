// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {TierImplementationDeployment} from "../../../script/TierImplementationDeployment.sol";

/// @dev Deploy the linked local protocol on an existing fork. Unlike the unit
/// fixture this must verify the origin's CREATE2 deployer, never replace its code.
contract ForkTierCodeFixture is TierImplementationDeployment {
    function install() external {
        _ensureTierImplementation();
    }
}
