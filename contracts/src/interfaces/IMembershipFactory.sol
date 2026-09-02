// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice Direct-read registry and deployment surface for official membership tiers.
interface IMembershipFactory {
    event TierCreated(
        address indexed tier,
        address indexed creator,
        bytes32 indexed tierIdentity,
        uint256 tierIndex,
        string name,
        string symbol
    );
    event TierTermsConfigured(
        address indexed tier,
        address indexed paymentToken,
        uint256 pricePerPeriod,
        uint64 periodDuration,
        uint16 rewardBps,
        uint16 referralBps,
        uint64 supplyCap,
        uint64 maxPrepaidPeriods
    );
    event TierMetadataConfigured(address indexed tier, string description, string externalURI);
    event TierArtConfigured(
        address indexed tier,
        uint16 engine,
        uint128 collectionSeed,
        bytes32 artConfigHash,
        address mediaStore,
        bytes32 mediaDigest
    );
    event TierRendererConfigured(address indexed tier, address indexed renderer);
    event PaymentTokenListed(address indexed token, uint256 indexed tokenIndex);
    event PaymentTokenEnabled(address indexed token);
    event PaymentTokenDisabled(address indexed token);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event ProtocolFeesWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    function rendererSchema() external view returns (bytes32);

    function mediaStoreFactory() external view returns (address);

    function mediaStoreFactoryRuntimeCodehash() external view returns (bytes32);

    function deployer() external view returns (address);

    function feeRecipient() external view returns (address);

    function protocolFeeBps() external pure returns (uint16);

    function maxPageSize() external pure returns (uint256);

    function paymentTokenCount() external view returns (uint256);

    function paymentTokens(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page);

    function isPaymentTokenListed(address token) external view returns (bool);

    function isPaymentTokenEnabled(address token) external view returns (bool);

    function createTier(MembershipTypes.TierConfig calldata config) external returns (address tier);

    function predictTierIdentity(address creator, bytes32 tierSalt) external view returns (bytes32);

    function isTierSaltUsed(address creator, bytes32 tierSalt) external view returns (bool);

    function tierForIdentity(bytes32 tierIdentity) external view returns (address);

    function isRegisteredTier(address tier) external view returns (bool);

    function tierCount() external view returns (uint256);

    function tiers(uint256 offset, uint256 limit) external view returns (address[] memory page);

    function setFeeRecipient(address newRecipient) external;

    function setPaymentTokenEnabled(address token, bool enabled) external;

    function withdrawProtocolFees(IERC20 token) external returns (uint256 amount);
}
