// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IERC5192} from "./IERC5192.sol";
import {IERC5643} from "./IERC5643.sol";

/// @notice Immutable economic terms and public-standard surface of one membership tier.
interface IMembershipTier is IERC165, IERC721, IERC5192, IERC5643 {
    event MetadataUpdate(uint256 tokenId);
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);

    function factory() external view returns (address);

    function paymentToken() external view returns (IERC20);

    function renderer() external view returns (address);

    function pricePerPeriod() external view returns (uint256);

    function periodDuration() external view returns (uint64);

    function rewardBps() external view returns (uint16);

    function referralBps() external view returns (uint16);

    function protocolFeeBps() external pure returns (uint16);

    function supplyCap() external view returns (uint64);

    function paidPrepaymentLimit() external view returns (uint64);
}
