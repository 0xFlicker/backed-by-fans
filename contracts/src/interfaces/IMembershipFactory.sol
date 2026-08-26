// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice Direct-read registry and deployment surface for official membership tiers.
interface IMembershipFactory {
    event TierCreated(address indexed tier, address indexed creator, uint256 indexed tierIndex);

    function paymentToken() external view returns (IERC20);

    function renderer() external view returns (address);

    function deployer() external view returns (address);

    function feeRecipient() external view returns (address);

    function protocolFeeBps() external pure returns (uint16);

    function createTier(MembershipTypes.TierConfig calldata config) external returns (address tier);

    function isRegisteredTier(address tier) external view returns (bool);

    function tierCount() external view returns (uint256);

    function tiers(uint256 offset, uint256 limit) external view returns (address[] memory page);
}
