// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackTypes} from "../types/BuybackTypes.sol";

interface IPonsBuybackExecutor {
    function vault() external view returns (address);
    function protocolToken() external view returns (address);
    function curve() external view returns (address);
    function lifecycle() external view returns (BuybackTypes.Lifecycle);
    function execute(
        address asset,
        uint256 amount,
        BuybackTypes.TypedRoute calldata route,
        BuybackTypes.Rate[] calldata rates,
        uint64 deadline
    ) external payable returns (BuybackTypes.Execution memory);
}
