// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;
import {BuybackTypes} from "../types/BuybackTypes.sol";

interface IProtocolBuybackVault {
    event EarnedFeesReceived(address indexed tier, address indexed asset, uint256 amount);
    event DonationRecorded(address indexed asset, uint256 amount);
    event BuybacksPaused(bool paused);
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
        bytes32 context,
        uint64 revision
    );
    event DirectBurned(
        uint256 indexed sequence,
        BuybackTypes.SourceBucket indexed bucket,
        address indexed token,
        uint256 amount
    );
    event ProtocolTokenBound(address indexed token, address indexed module);
    function factory() external view returns (address);
    function bindProtocolToken(address token) external;
    function protocolToken() external view returns (address);
    function settlementSequence() external view returns (uint256);
    function buybacksPaused() external view returns (bool);
    function canonicalAsset(address asset) external pure returns (address);
    function setBuybacksPaused(bool paused) external;
    function recordEarnedFees(uint256 amount) external;
    function syncDonation(address asset) external returns (uint256 amount);
    function inventory(address asset, BuybackTypes.SourceBucket bucket)
        external
        view
        returns (BuybackTypes.Inventory memory);
    event BuybackModuleProposed(address indexed module, bytes32 codeHash, uint256 activationAt);
    event BuybackModuleCancelled();
    event BuybackModuleActivated(address indexed module, bytes32 codeHash, uint64 revision);
    event ModuleReplacementFreezeProposed(
        address indexed module, bytes32 codeHash, uint256 finalizeAt
    );
    event ModuleReplacementFreezeCancelled();
    event ModuleReplacementFinalized(address indexed module, bytes32 codeHash, uint64 revision);
    function activeModule() external view returns (address);
    function activeModuleCodeHash() external view returns (bytes32);
    function moduleRevision() external view returns (uint64);
    function moduleReplacementFrozen() external view returns (bool);
    function proposeBuybackModule(address candidate) external;
    function cancelBuybackModule() external;
    function activateBuybackModule() external;
    function proposeModuleReplacementFreeze() external;
    function cancelModuleReplacementFreeze() external;
    function finalizeModuleReplacementFreeze() external;
    function process(
        address asset,
        BuybackTypes.SourceBucket bucket,
        uint256 amountIn,
        uint64 expectedModuleRevision,
        uint64 deadline,
        bytes calldata data
    ) external;
}
