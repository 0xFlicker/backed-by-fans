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
    event PaymentProcessed(
        address indexed payer,
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 gross,
        uint64 periods
    );
    event PaymentAllocated(
        uint256 indexed tokenId,
        uint256 protocolFee,
        uint256 reward,
        uint256 referral,
        uint256 creator
    );
    event ReferralLocked(
        uint256 indexed tokenId, MembershipTypes.ReferralStatus status, address indexed referrer
    );
    event SharesIssued(
        uint256 indexed tokenId, uint256 amount, uint256 tokenShares, uint256 aggregateShares
    );
    event RewardPerShareUpdated(
        uint256 indexed tokenId, uint256 reward, uint256 rewardPerShare, uint256 directRemainder
    );
    event CreatorProceedsWithdrawn(address indexed owner, uint256 amount);
    event RewardClaimed(uint256 indexed tokenId, address indexed owner, uint256 amount);
    event ReferralClaimed(address indexed referrer, uint256 amount);
    event MembershipRefunded(
        uint256 indexed tokenId,
        address indexed recipient,
        address indexed tierOwner,
        uint256 grossRefund,
        uint256 ownerTopUp
    );

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

    function purchase(uint64 periods, address referralChoice) external returns (uint256 tokenId);

    function gift(
        address recipient,
        uint64 periods,
        MembershipTypes.ReferralStatus expectedReferralStatus,
        address expectedReferrer
    ) external returns (uint256 tokenId);

    function contribute(uint256 gross, address referralChoice) external returns (uint256 tokenId);

    function referralOf(uint256 tokenId)
        external
        view
        returns (MembershipTypes.ReferralStatus status, address referrer);

    function sharesOf(uint256 tokenId) external view returns (uint256);

    function totalShares() external view returns (uint256);

    function rewardPerShare() external view returns (uint256);

    function creatorProceeds() external view returns (uint256);

    function rewardReserve() external view returns (uint256);

    function claimableReferral(address referrer) external view returns (uint256);

    function totalReferralLiability() external view returns (uint256);

    function totalProtectedLiability() external view returns (uint256);

    function claimableReward(uint256 tokenId) external view returns (uint256);

    function withdrawCreatorProceeds() external returns (uint256 amount);

    function claimReward(uint256 tokenId) external returns (uint256 amount);

    function claimReferral() external returns (uint256 amount);

    function previewRefund(uint256 tokenId)
        external
        view
        returns (uint256 grossRefund, uint256 ownerTopUp);

    function refund(uint256 tokenId, uint256 maxOwnerTopUp)
        external
        returns (uint256 grossRefund, uint256 ownerTopUp);

    function grantTime(address recipient, uint64 periods) external returns (uint256 tokenId);

    function revokeGrantTime(uint256 tokenId) external returns (uint64 revokedSeconds);

    function synchronize(uint256 tokenId) external returns (bool released);

    function setPaused(bool newPaused) external;

    function setSupplyCap(uint64 newSupplyCap) external;

    function setMaxPrepaidPeriods(uint64 newMaximum) external;

    function setTierMetadata(MembershipTypes.TierMetadata calldata newMetadata) external;
}
