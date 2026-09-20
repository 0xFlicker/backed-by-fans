// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {BuybackTypes} from "../types/BuybackTypes.sol";

/// @notice Version 1 full-strategy module. The vault alone settles custody and burns.
interface IBuybackModule {
    struct Result {
        BuybackTypes.Leg[] legs;
        uint256 acquired;
        bytes32 context;
    }

    function vault() external view returns (address);
    function protocolToken() external view returns (address);
    function interfaceVersion() external pure returns (uint256);
    function moduleId() external pure returns (bytes32);
    function moduleVersion() external pure returns (uint256);
    /// @notice Assets whose vault and module balances settlement must reconcile.
    function trackedAssets(address asset, bytes calldata data)
        external
        view
        returns (address[] memory);
    function execute(
        address caller,
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amount,
        uint64 deadline,
        bytes calldata data
    ) external payable returns (Result memory);
}
