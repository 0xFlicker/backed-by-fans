// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackTypes} from "../types/BuybackTypes.sol";
import {IBuybackModule} from "./IBuybackModule.sol";

interface IPonsBuybackModule is IBuybackModule {
    function curve() external view returns (address);
    function lifecycle() external view returns (BuybackTypes.Lifecycle);
    event OperatorConfigured(address indexed operator);
    event ExecutionModeConfigured(BuybackTypes.ExecutionMode mode);
    event PermissionlessPolicyConfigured(
        address indexed asset, BuybackTypes.PermissionlessPolicy policy
    );
    event RouteConfigured(
        address indexed asset, uint64 indexed revision, BuybackTypes.TypedRoute route
    );
    event LimitsConfigured(
        address indexed asset, uint64 indexed revision, BuybackTypes.ExecutionLimits limits
    );
    event GlobalIntervalConfigured(uint64 minInterval);
    event AssetBuybacksPaused(address indexed asset, bool paused);
    function executionMode() external view returns (BuybackTypes.ExecutionMode);
    function operator() external view returns (address);
    function setOperator(address operator_) external;
    function setExecutionMode(BuybackTypes.ExecutionMode mode) external;
    function permissionlessPolicy(address asset)
        external
        view
        returns (BuybackTypes.PermissionlessPolicy memory);
    function setPermissionlessPolicy(
        address asset,
        BuybackTypes.Lifecycle lifecycle_,
        BuybackTypes.OutputRate[] calldata rates,
        uint64 expiresAt,
        uint256 inputBudget
    ) external;
    function processingStatus(address asset, BuybackTypes.SourceBucket bucket)
        external
        view
        returns (BuybackTypes.ProcessingState memory);
    function previewProcessing(address asset, BuybackTypes.SourceBucket bucket, uint256 additional)
        external
        view
        returns (BuybackTypes.ProcessingState memory);
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
    function setAssetBuybacksPaused(address asset, bool paused) external;
}
