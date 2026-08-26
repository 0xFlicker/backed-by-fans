// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTier} from "./MembershipTier.sol";
import {MembershipTypes} from "./types/MembershipTypes.sol";

/// @notice Isolates full membership-tier creation code from the factory runtime.
/// @dev The bound factory may deploy tiers, but this contract has no owner or tier authority.
contract MembershipTierDeployer {
    address public immutable factory;
    address public immutable renderer;

    error InvalidAddress();
    error OnlyFactory();

    constructor(address factory_, address renderer_) {
        if (factory_ == address(0) || renderer_ == address(0)) revert InvalidAddress();
        factory = factory_;
        renderer = renderer_;
    }

    function deploy(IERC20 paymentToken, MembershipTypes.TierConfig calldata config)
        external
        returns (address tier)
    {
        if (msg.sender != factory) revert OnlyFactory();
        tier = address(new MembershipTier(factory, paymentToken, renderer, config));
    }
}
