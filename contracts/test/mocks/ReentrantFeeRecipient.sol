// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
        amount = factory.withdrawProtocolFees(IERC20(token));
    }

    function onTokenTransfer() external {
        if (msg.sender != token) revert OnlyToken();
        reentryAttempted = true;
        try factory.withdrawProtocolFees(IERC20(token)) {
            reentrySucceeded = true;
        } catch {
            reentrySucceeded = false;
        }
    }
}
