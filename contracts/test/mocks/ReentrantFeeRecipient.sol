// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IMembershipFactory} from "../../src/interfaces/IMembershipFactory.sol";

/// @notice Fixed fee recipient that attempts to reenter during token delivery.
contract ReentrantFeeRecipient {
    IMembershipFactory public immutable factory;
    address public immutable token;

    bool public reentryAttempted;
    bool public reentrySucceeded;

    error OnlyToken();

    constructor(IMembershipFactory factory_, address token_) {
        factory = factory_;
        token = token_;
    }

    function withdraw() external returns (uint256 amount) {
        amount = factory.withdrawProtocolFees();
    }

    function onTokenTransfer() external {
        if (msg.sender != token) revert OnlyToken();
        reentryAttempted = true;
        try factory.withdrawProtocolFees() {
            reentrySucceeded = true;
        } catch {
            reentrySucceeded = false;
        }
    }
}
