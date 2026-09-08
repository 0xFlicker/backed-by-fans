// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {BuybackTypes} from "../types/BuybackTypes.sol";

/// @notice Immutable custody identity and authenticated receipt of already-earned tier fees.
interface IProtocolBuybackVault {
    event EarnedFeesReceived(address indexed tier, address indexed asset, uint256 amount);
    event DonationRecorded(address indexed asset, uint256 amount);
    event RouteConfigured(
        address indexed asset, uint64 indexed revision, BuybackTypes.TypedRoute route
    );
    event PolicyConfigured(
        address indexed asset, uint64 indexed revision, BuybackTypes.ExecutionPolicy policy
    );
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

    function protocolToken() external view returns (address);
    function executor() external view returns (address);
    function settlementSequence() external view returns (uint256);
    function processingStatus(address asset, BuybackTypes.SourceBucket bucket)
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
    function policy(address asset) external view returns (BuybackTypes.PolicyState memory);
    function setRoute(address asset, BuybackTypes.TypedRoute calldata route_) external;
    function setPolicy(address asset, BuybackTypes.ExecutionPolicy calldata policy_) external;
    function setBuybacksPaused(bool paused) external;
    function setAssetBuybacksPaused(address asset, bool paused) external;

    function recordEarnedFees(uint256 amount) external;

    function syncDonation(address asset) external returns (uint256 amount);

    function inventory(address asset, BuybackTypes.SourceBucket bucket)
        external
        view
        returns (BuybackTypes.Inventory memory);
}
