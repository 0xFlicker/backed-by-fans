// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {MembershipFactory} from "./MembershipFactory.sol";
import {RobinhoodProtocolConfig} from "./RobinhoodProtocolConfig.sol";

/// @notice Direct CREATE2 production factory with chain-selected USDG and fixed Safe authority.
contract RobinhoodMembershipFactory is MembershipFactory {
    error UnauthorizedDeploymentOrigin(address origin);

    constructor()
        MembershipFactory(
            RobinhoodProtocolConfig.canonicalPaymentToken(),
            RobinhoodProtocolConfig.initialRenderer(),
            RobinhoodProtocolConfig.mediaStoreFactory(),
            RobinhoodProtocolConfig.INITIAL_PROTOCOL_AUTHORITY,
            RobinhoodProtocolConfig.INITIAL_PROTOCOL_AUTHORITY
        )
    {
        if (tx.origin != RobinhoodProtocolConfig.APPROVED_DEPLOYER) {
            revert UnauthorizedDeploymentOrigin(tx.origin);
        }
    }
}
