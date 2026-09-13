// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MembershipTypes} from "../types/MembershipTypes.sol";

/// @notice Direct-read registry and deployment surface for official membership tiers.
interface IMembershipFactory {
    event PaymentTokenMinimumUpdated(address indexed token, uint112 minimum);
    event TierMinimumPaymentConfigured(address indexed tier, uint112 minimum);
    function minimumPayment(address token) external view returns (uint112);
    function setMinimumPayment(address token, uint112 minimum) external;
    function owner() external view returns (address);
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
        uint16 protocolFeeBps,
        uint16 rewardBps,
        uint16 referralBps,
        uint64 supplyCap,
        uint64 maxPrepaidPeriods
    );
    event TierMetadataConfigured(address indexed tier, string description, string externalURI);
    event TierRewardCurveConfigured(
        address indexed tier, uint32 startingBoostBps, uint112 earlySupportGross
    );
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

    /// @notice Settle and claim the caller's selected tiers using a caller-supplied shared work budget.
    /// @dev Tiers and each tier's token IDs must be strictly ascending and unique.
    function claimEverything(
        MembershipTypes.TierClaimRequest[] calldata requests,
        uint256 maxAccountingSteps
    ) external returns (MembershipTypes.ClaimResult[] memory);

    function rendererSchema() external view returns (bytes32);

    function mediaStoreFactory() external view returns (address);

    function mediaStoreFactoryRuntimeCodehash() external view returns (bytes32);

    function implementation() external view returns (address);

    /// @notice Permanently bind the validated launch token; callable by the protocol owner once.
    function bindProtocolToken(address token) external;

    function protocolToken() external view returns (address);

    function buybackVault() external view returns (address);
    function burnRouter() external view returns (address);

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

    function setPaymentTokenEnabled(address token, bool enabled) external;
}
