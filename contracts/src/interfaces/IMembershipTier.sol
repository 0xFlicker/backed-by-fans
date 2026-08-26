// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {MembershipTypes} from "../types/MembershipTypes.sol";
import {IERC5192} from "./IERC5192.sol";
import {IERC5643} from "./IERC5643.sol";

/// @notice Immutable economic terms and public-standard surface of one membership tier.
interface IMembershipTier is IERC165, IERC721, IERC5192, IERC5643 {
    event MetadataUpdate(uint256 tokenId);
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);
    event MembershipTimeUpdated(
        uint256 indexed tokenId, uint64 paidSeconds, uint64 grantSeconds, uint64 expiration
    );
    event MembershipSynchronized(uint256 indexed tokenId, address indexed recipient);
    event PauseUpdated(bool paused);
    event SupplyCapUpdated(uint64 previousCap, uint64 newCap);
    event MaxPrepaidPeriodsUpdated(uint64 previousMaximum, uint64 newMaximum);
    event TierMetadataUpdated(string description, string imageURI, string externalURI);

    function factory() external view returns (address);

    function paymentToken() external view returns (IERC20);

    function renderer() external view returns (address);

    function pricePerPeriod() external view returns (uint256);

    function periodDuration() external view returns (uint64);

    function rewardBps() external view returns (uint16);

    function referralBps() external view returns (uint16);

    function protocolFeeBps() external pure returns (uint16);

    function supplyCap() external view returns (uint64);

    function maxPrepaidPeriods() external view returns (uint64);

    function description() external view returns (string memory);

    function imageURI() external view returns (string memory);

    function externalURI() external view returns (string memory);

    function paused() external view returns (bool);

    function occupiedSupply() external view returns (uint64);

    function totalMinted() external view returns (uint256);

    function tokenOf(address recipient) external view returns (uint256);

    function activeBalanceOf(address recipient) external view returns (uint256);

    function isActive(address recipient) external view returns (bool);

    function isActiveToken(uint256 tokenId) external view returns (bool);

    function timeBalances(uint256 tokenId)
        external
        view
        returns (uint64 paidSeconds, uint64 grantSeconds, uint64 effectiveCheckpoint);

    function isOccupied(uint256 tokenId) external view returns (bool);

    function grantTime(address recipient, uint64 periods) external returns (uint256 tokenId);

    function revokeGrantTime(uint256 tokenId) external returns (uint64 revokedSeconds);

    function synchronize(uint256 tokenId) external returns (bool released);

    function setPaused(bool newPaused) external;

    function setSupplyCap(uint64 newSupplyCap) external;

    function setMaxPrepaidPeriods(uint64 newMaximum) external;

    function setTierMetadata(MembershipTypes.TierMetadata calldata newMetadata) external;
}
