// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {BuybackTypes} from "../types/BuybackTypes.sol";

/// @notice Immutable custody identity and authenticated receipt of already-earned tier fees.
interface IProtocolBuybackVault {
    event OperatorConfigured(address indexed operator);
    event ExecutionModeConfigured(BuybackTypes.ExecutionMode mode);
    event PermissionlessPolicyConfigured(
        address indexed asset, BuybackTypes.PermissionlessPolicy policy
    );

    function executionMode() external view returns (BuybackTypes.ExecutionMode);
    function operator() external view returns (address);
    function setOperator(address operator_) external;
    function setExecutionMode(BuybackTypes.ExecutionMode mode) external;
    function permissionlessPolicy(address asset)
        external
        view
        returns (BuybackTypes.PermissionlessPolicy memory);
    /// @notice Safe-authorized public rates; expiry 0 is indefinite and inputBudget 0 is unlimited.
    /// @dev Rates cover conversion pools in order, then the final purchase; unwrap is exact 1:1.
    function setPermissionlessPolicy(
        address asset,
        BuybackTypes.Lifecycle lifecycle_,
        BuybackTypes.OutputRate[] calldata rates,
        uint64 expiresAt,
        uint256 inputBudget
    ) external;
    /// @notice Operator-only transaction terms; does not read or store standing routes, limits, or policy.
    /// @dev Positive absolute minimums cover conversion pools in order, then the final purchase.
    function processOperator(
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amountIn,
        BuybackTypes.TypedRoute calldata route_,
        uint256[] calldata minimumOutputs,
        uint64 deadline
    ) external;
    event EarnedFeesReceived(address indexed tier, address indexed asset, uint256 amount);
    event DonationRecorded(address indexed asset, uint256 amount);
    event RouteConfigured(
        address indexed asset, uint64 indexed revision, BuybackTypes.TypedRoute route
    );
    event LimitsConfigured(
        address indexed asset, uint64 indexed revision, BuybackTypes.ExecutionLimits limits
    );
    event GlobalIntervalConfigured(uint64 minInterval);
    event BuybacksPaused(bool paused);
    event AssetBuybacksPaused(address indexed asset, bool paused);
    event ConversionSettled(
        uint256 indexed sequence,
        BuybackTypes.SourceBucket indexed bucket,
        address indexed input,
        address output,
        uint256 spent,
        uint256 received,
        uint64 revision
    );
    event BuybackBurned(
        uint256 indexed sequence,
        BuybackTypes.SourceBucket indexed bucket,
        address indexed input,
        uint256 inputSpent,
        uint256 burned,
        BuybackTypes.Lifecycle lifecycle,
        uint64 revision
    );
    event DirectBurned(
        uint256 indexed sequence,
        BuybackTypes.SourceBucket indexed bucket,
        address indexed token,
        uint256 amount
    );

    function factory() external view returns (address);

    event ProtocolTokenBound(address indexed token, address indexed executor);

    /// @notice Factory-only, one-time activation after launch validation.
    function bindProtocolToken(address token) external;

    function protocolToken() external view returns (address);
    function executor() external view returns (address);
    function settlementSequence() external view returns (uint256);
    function processingStatus(address asset, BuybackTypes.SourceBucket bucket)
        external
        view
        returns (BuybackTypes.ProcessingState memory);
    /// @notice Eligibility after a hypothetical earned-fee release. Does not quote a swap.
    function previewProcessing(address asset, BuybackTypes.SourceBucket bucket, uint256 additional)
        external
        view
        returns (BuybackTypes.ProcessingState memory);
    function process(
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amountIn,
        uint64 expectedRevision,
        uint64 deadline
    ) external;
    function buybacksPaused() external view returns (bool);
    function assetBuybacksPaused(address asset) external view returns (bool);
    function revision(address asset) external view returns (uint64);
    function route(address asset) external view returns (BuybackTypes.TypedRoute memory);
    function canonicalAsset(address asset) external pure returns (address);
    function limits(address asset) external view returns (BuybackTypes.ExecutionLimits memory);
    function globalMinInterval() external view returns (uint64);
    function lastBuyAt() external view returns (uint64);
    function lastAssetBuyAt(address asset) external view returns (uint64);
    function setExecutionLimits(
        uint64 globalInterval,
        address[] calldata assets,
        BuybackTypes.ExecutionLimits[] calldata limits_
    ) external;
    function setGlobalMinInterval(uint64 minInterval) external;
    function setRoute(address asset, BuybackTypes.TypedRoute calldata route_) external;
    function setLimits(address asset, BuybackTypes.ExecutionLimits calldata limits_) external;
    function setBuybacksPaused(bool paused) external;
    function setAssetBuybacksPaused(address asset, bool paused) external;

    function recordEarnedFees(uint256 amount) external;

    function syncDonation(address asset) external returns (uint256 amount);

    function inventory(address asset, BuybackTypes.SourceBucket bucket)
        external
        view
        returns (BuybackTypes.Inventory memory);
}
