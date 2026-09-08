// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {
    FeePolicySnapshot,
    IPonsV2BondingCurve,
    IPonsV2FeeEscrow,
    IPonsV2FeePolicy,
    IPonsV2LaunchFactory
} from "./ILaunchpadV2.sol";

/// @notice Narrow integration interfaces derived from the verified Robinhood Pons v2 bundle.
/// @dev Provenance and original source are in external/pons/4663/. Tuple order is upstream order.
interface IPonsLaunchFactory is IPonsV2LaunchFactory {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }

    struct LaunchConfig {
        uint256 supply;
        uint256 curveFeeBps;
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        bool enabled;
    }

    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed deployer,
        address pairToken,
        uint256 launchConfigId,
        uint256 graduationThreshold
    );
    event LaunchSwept(address indexed token, uint256 quoteOut, uint256 tokenOut);
    event CreatorFeeRecipientUpdated(
        address indexed token, address indexed previousRecipient, address indexed newRecipient
    );
    event CreatorFeeRecipientChangeProposed(
        address indexed token,
        address indexed currentRecipient,
        address indexed proposedRecipient,
        uint256 effectiveAt,
        uint256 expiresAt
    );
    event CreatorFeeRecipientChangeCancelled(
        address indexed token, address indexed proposedRecipient
    );
    event BuybackEnabledUpdated(address indexed token, bool enabled, address indexed controller);
    event PoolGraduated(
        address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount
    );

    function owner() external view returns (address);
    function poolManager() external view returns (address);
    function positionManager() external view returns (address);
    function permit2() external view returns (address);
    function locker() external view returns (address);
    function memeHook() external view returns (address);
    function feeEscrow() external view returns (address);
    function buybackVault() external view returns (address);
    function graduationExecutor() external view returns (address);
    function graduationGuard() external view returns (address);
    function launchDeployer() external view returns (address);
    function launchForwarder() external view returns (address);
    function launchEnabled() external view returns (bool);
    function canLaunch(address account) external view returns (bool);
    function transferCreatorFeeRecipient(address token, address newRecipient) external;
    function setCreatorFeeRecipient(address token, address newRecipient) external;
    function executeCreatorFeeRecipientChange(address token) external;
    function pendingCreatorFeeRecipient(address token)
        external
        view
        returns (address newRecipient, uint256 effectiveAt, uint256 expiresAt);
    function setBuybackEnabled(address token, bool enabled) external;
    function launchFee() external view returns (uint256);
    function snipeTaxStartBps() external view returns (uint256);
    function snipeTaxSeconds() external view returns (uint256);
    function launchConfigCount() external view returns (uint256);
    function getLaunchConfig(uint256 id) external view returns (LaunchConfig memory);
    function previewLaunchEconomics(uint256 launchConfigId, address pairToken)
        external
        view
        returns (bytes32);
    function launchToken(TokenParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve);
    function graduate(address token) external;
    function createGraduatedPool(address token) external returns (uint256 positionId);
}

interface IPonsBondingCurve is IPonsV2BondingCurve {
    function factory() external view returns (address);
    function deployer() external view returns (address);
    function feePolicy() external view returns (address);
    function feeEscrow() external view returns (address);
    function buybackVault() external view returns (address);
    function launchSupply() external view returns (uint256);
    function launchedAt() external view returns (uint256);
    function phantomQuote() external view returns (uint256);
    function feeBps() external view returns (uint256);
    function creatorTaxBps() external view returns (uint256);
    function buybackEnabled() external view returns (bool);
    function quoteFeeBalance() external view returns (uint256);
    function buybackQuoteBalance() external view returns (uint256);
    function creatorTaxBalance() external view returns (uint256);
    function protocolFeeRecipient() external view returns (address);
    function protocolFeeShareBps() external view returns (uint16);
    function buybackBurnBps() external view returns (uint16);
    function reservedTokens() external view returns (uint256);
    function sellableTokens() external view returns (uint256);
    function snipeTaxSeconds() external view returns (uint256);
    function currentSnipeTaxBps(address recipient) external view returns (uint256);
    function maxInternalPriceImpactBps() external view returns (uint16);
    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient)
        external
        returns (uint256 quoteOut);
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        returns (uint256 tokensOut);
}

interface IPonsBuybackVault {
    event Locked(
        address indexed token, address indexed depositor, uint256 amount, uint256 newVestingStart
    );
    event Released(address indexed token, uint256 creatorAmount, uint256 protocolAmount);
    event CreatorRecipientUpdated(
        address indexed token, address indexed previousRecipient, address indexed newRecipient
    );
    function factory() external view returns (address);
    function feePolicy() external view returns (address);
    function feeEscrow() external view returns (address);
    function VESTING_DURATION() external view returns (uint256);
    function totalLocked(address token) external view returns (uint256);
    function totalReleased(address token) external view returns (uint256);
    function vestingStart(address token) external view returns (uint256);
    function vestedAmount(address token) external view returns (uint256);
    function releasable(address token) external view returns (uint256);
    function vestingTerms(address token)
        external
        view
        returns (address creatorRecipient, address protocolRecipient, uint16 protocolFeeShareBps);
    function release(address token) external returns (uint256 released);
}

interface IPonsFeeEscrow is IPonsV2FeeEscrow {
    event Credited(address indexed recipient, address indexed depositor, uint256 amount);
    event CreditedToken(
        address indexed recipient, address indexed token, address indexed depositor, uint256 amount
    );
    event Claimed(address indexed recipient, uint256 amount);
    event ClaimedToken(address indexed recipient, address indexed token, uint256 amount);
}

interface IPonsMemeHook is IPonsV2FeePolicy {
    function factory() external view returns (address);
    function poolManager() external view returns (address);
    function buybackVault() external view returns (address);
    function hookFeeBps() external view returns (uint256);
    function pendingFees(bytes32 poolId, address currency) external view returns (uint256);
    function pendingCreatorTax(bytes32 poolId, address currency) external view returns (uint256);
    function pendingBuyback(bytes32 poolId, address currency) external view returns (uint256);
    function sweepPoolFees(
        bytes32 poolId,
        uint256 minConversionQuoteOut,
        uint256 minBuybackTokensOut
    ) external;
}

interface IPonsLauncherToken {
    function deployer() external view returns (address);
    function launchFactory() external view returns (address);
    function curve() external view returns (address);
    function burn(uint256 amount) external;
}
