import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
  createUseWatchContractEvent,
} from "wagmi/codegen";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IERC165
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const ierc165Abi = [
  {
    type: "function",
    inputs: [{ name: "interfaceId", internalType: "bytes4", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPonsBondingCurve
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPonsBondingCurveAbi = [
  {
    type: "function",
    inputs: [
      { name: "quoteIn", internalType: "uint256", type: "uint256" },
      { name: "minTokensOut", internalType: "uint256", type: "uint256" },
      { name: "recipient", internalType: "address", type: "address" },
    ],
    name: "buy",
    outputs: [{ name: "tokensOut", internalType: "uint256", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [],
    name: "buybackBurnBps",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "buybackEnabled",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "buybackQuoteBalance",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "buybackVault",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "creatorTaxBalance",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "creatorTaxBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "currentSnipeTaxBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "deployer",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "factory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "feeBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "feeEscrow",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "feePolicy",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "graduate",
    outputs: [
      { name: "ethOut", internalType: "uint256", type: "uint256" },
      { name: "tokenOut", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "graduated",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "graduationThreshold",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchSupply",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchedAt",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxInternalPriceImpactBps",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "pairToken",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "phantomQuote",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeRecipient",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeShareBps",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "quoteFeeBalance",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "quoteReserve",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "readyToGraduate",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "realQuoteReserve",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "reservedTokens",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "tokensIn", internalType: "uint256", type: "uint256" },
      { name: "minQuoteOut", internalType: "uint256", type: "uint256" },
      { name: "recipient", internalType: "address", type: "address" },
    ],
    name: "sell",
    outputs: [{ name: "quoteOut", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "sellableTokens",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "snipeTaxSeconds",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "minBuybackTokensOut", internalType: "uint256", type: "uint256" },
    ],
    name: "sweepFees",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "token",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "tokenReserve",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPonsBuybackVault
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPonsBuybackVaultAbi = [
  {
    type: "function",
    inputs: [],
    name: "VESTING_DURATION",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "factory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "feeEscrow",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "feePolicy",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "releasable",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "release",
    outputs: [{ name: "released", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "totalLocked",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "totalReleased",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "vestedAmount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "vestingStart",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "vestingTerms",
    outputs: [
      { name: "creatorRecipient", internalType: "address", type: "address" },
      { name: "protocolRecipient", internalType: "address", type: "address" },
      { name: "protocolFeeShareBps", internalType: "uint16", type: "uint16" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "previousRecipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "newRecipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "CreatorRecipientUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "depositor",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newVestingStart",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Locked",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "creatorAmount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "protocolAmount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Released",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPonsFeeEscrow
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPonsFeeEscrowAbi = [
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "recipient", internalType: "address", type: "address" },
      { name: "token", internalType: "address", type: "address" },
    ],
    name: "balanceOfToken",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    name: "claim",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "claim",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "token", internalType: "address", type: "address" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "claimToken",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "claimToken",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "credit",
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [
      { name: "recipient", internalType: "address", type: "address" },
      { name: "token", internalType: "address", type: "address" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "creditToken",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Claimed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ClaimedToken",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "depositor",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Credited",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "depositor",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "CreditedToken",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPonsLaunchFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPonsLaunchFactoryAbi = [
  {
    type: "function",
    inputs: [],
    name: "buybackVault",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "account", internalType: "address", type: "address" }],
    name: "canLaunch",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "createGraduatedPool",
    outputs: [{ name: "positionId", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "executeCreatorFeeRecipientChange",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "feeEscrow",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "id", internalType: "uint256", type: "uint256" }],
    name: "getLaunchConfig",
    outputs: [
      {
        name: "",
        internalType: "struct IPonsLaunchFactory.LaunchConfig",
        type: "tuple",
        components: [
          { name: "supply", internalType: "uint256", type: "uint256" },
          { name: "curveFeeBps", internalType: "uint256", type: "uint256" },
          { name: "phantomQuote", internalType: "uint256", type: "uint256" },
          {
            name: "graduationThreshold",
            internalType: "uint256",
            type: "uint256",
          },
          { name: "poolFee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "enabled", internalType: "bool", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "getLaunchedToken",
    outputs: [
      {
        name: "",
        internalType: "struct IPonsV2LaunchFactory.LaunchedToken",
        type: "tuple",
        components: [
          { name: "token", internalType: "address", type: "address" },
          { name: "curve", internalType: "address", type: "address" },
          { name: "deployer", internalType: "address", type: "address" },
          {
            name: "creatorFeeRecipient",
            internalType: "address",
            type: "address",
          },
          { name: "pairToken", internalType: "address", type: "address" },
          {
            name: "graduationThreshold",
            internalType: "uint256",
            type: "uint256",
          },
          { name: "poolFee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "creatorTaxBps", internalType: "uint16", type: "uint16" },
          { name: "buybackEnabled", internalType: "bool", type: "bool" },
          {
            name: "phase",
            internalType: "enum GraduationPhase",
            type: "uint8",
          },
          { name: "sweptQuote", internalType: "uint256", type: "uint256" },
          { name: "sweptTokens", internalType: "uint256", type: "uint256" },
          { name: "sweptAt", internalType: "uint256", type: "uint256" },
          { name: "exists", internalType: "bool", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "graduate",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "graduationExecutor",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "graduationGuard",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchConfigCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchDeployer",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchEnabled",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchFee",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchForwarder",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "params",
        internalType: "struct IPonsLaunchFactory.TokenParams",
        type: "tuple",
        components: [
          { name: "name", internalType: "string", type: "string" },
          { name: "symbol", internalType: "string", type: "string" },
          { name: "logo", internalType: "string", type: "string" },
          { name: "description", internalType: "string", type: "string" },
          {
            name: "socials",
            internalType: "struct IPonsLaunchFactory.Socials",
            type: "tuple",
            components: [
              { name: "twitter", internalType: "string", type: "string" },
              { name: "telegram", internalType: "string", type: "string" },
              { name: "discord", internalType: "string", type: "string" },
              { name: "website", internalType: "string", type: "string" },
              { name: "farcaster", internalType: "string", type: "string" },
            ],
          },
          {
            name: "creatorFeeRecipient",
            internalType: "address",
            type: "address",
          },
          { name: "creatorTaxBps", internalType: "uint16", type: "uint16" },
          { name: "buybackEnabled", internalType: "bool", type: "bool" },
          {
            name: "expectedEconomics",
            internalType: "bytes32",
            type: "bytes32",
          },
          { name: "salt", internalType: "bytes32", type: "bytes32" },
        ],
      },
      { name: "launchConfigId", internalType: "uint256", type: "uint256" },
      { name: "pairToken", internalType: "address", type: "address" },
    ],
    name: "launchToken",
    outputs: [
      { name: "token", internalType: "address", type: "address" },
      { name: "curve", internalType: "address", type: "address" },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [],
    name: "locker",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "memeHook",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "owner",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "pendingCreatorFeeRecipient",
    outputs: [
      { name: "newRecipient", internalType: "address", type: "address" },
      { name: "effectiveAt", internalType: "uint256", type: "uint256" },
      { name: "expiresAt", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "permit2",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "poolManager",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "positionManager",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "launchConfigId", internalType: "uint256", type: "uint256" },
      { name: "pairToken", internalType: "address", type: "address" },
    ],
    name: "previewLaunchEconomics",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "token", internalType: "address", type: "address" },
      { name: "enabled", internalType: "bool", type: "bool" },
    ],
    name: "setBuybackEnabled",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "token", internalType: "address", type: "address" },
      { name: "newRecipient", internalType: "address", type: "address" },
    ],
    name: "setCreatorFeeRecipient",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "snipeTaxSeconds",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "snipeTaxStartBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "token", internalType: "address", type: "address" },
      { name: "newRecipient", internalType: "address", type: "address" },
    ],
    name: "transferCreatorFeeRecipient",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      { name: "enabled", internalType: "bool", type: "bool", indexed: false },
      {
        name: "controller",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "BuybackEnabledUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "proposedRecipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "CreatorFeeRecipientChangeCancelled",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "currentRecipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "proposedRecipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "effectiveAt",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "expiresAt",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "CreatorFeeRecipientChangeProposed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "previousRecipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "newRecipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "CreatorFeeRecipientUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "quoteOut",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "tokenOut",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "LaunchSwept",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "positionId",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "tokenAmount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "pairTokenAmount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "PoolGraduated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "curve",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "deployer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "pairToken",
        internalType: "address",
        type: "address",
        indexed: false,
      },
      {
        name: "launchConfigId",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "graduationThreshold",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "TokenLaunched",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPonsLauncherToken
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPonsLauncherTokenAbi = [
  {
    type: "function",
    inputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    name: "burn",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "curve",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "deployer",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "launchFactory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPonsMemeHook
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPonsMemeHookAbi = [
  {
    type: "function",
    inputs: [],
    name: "buybackBurnBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "buybackVault",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "currentFeePolicy",
    outputs: [
      {
        name: "",
        internalType: "struct FeePolicySnapshot",
        type: "tuple",
        components: [
          {
            name: "protocolFeeRecipient",
            internalType: "address",
            type: "address",
          },
          {
            name: "protocolFeeShareBps",
            internalType: "uint16",
            type: "uint16",
          },
          { name: "buybackBurnBps", internalType: "uint16", type: "uint16" },
          { name: "hookFeeBps", internalType: "uint16", type: "uint16" },
          {
            name: "maxInternalPriceImpactBps",
            internalType: "uint16",
            type: "uint16",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "factory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "feeEscrow",
    outputs: [
      { name: "", internalType: "contract IPonsV2FeeEscrow", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "feeSweepOperator",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "hookFeeBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxInternalPriceImpactBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "poolId", internalType: "bytes32", type: "bytes32" },
      { name: "currency", internalType: "address", type: "address" },
    ],
    name: "pendingBuyback",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "poolId", internalType: "bytes32", type: "bytes32" },
      { name: "currency", internalType: "address", type: "address" },
    ],
    name: "pendingCreatorTax",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "poolId", internalType: "bytes32", type: "bytes32" },
      { name: "currency", internalType: "address", type: "address" },
    ],
    name: "pendingFees",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "poolManager",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeRecipient",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeShareBps",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "poolId", internalType: "bytes32", type: "bytes32" },
      {
        name: "minConversionQuoteOut",
        internalType: "uint256",
        type: "uint256",
      },
      { name: "minBuybackTokensOut", internalType: "uint256", type: "uint256" },
    ],
    name: "sweepPoolFees",
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IPoolManager
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iPoolManagerAbi = [
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "spender", internalType: "address", type: "address" },
      { name: "id", internalType: "uint256", type: "uint256" },
    ],
    name: "allowance",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "spender", internalType: "address", type: "address" },
      { name: "id", internalType: "uint256", type: "uint256" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "id", internalType: "uint256", type: "uint256" },
    ],
    name: "balanceOf",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "from", internalType: "address", type: "address" },
      { name: "id", internalType: "uint256", type: "uint256" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "burn",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "currency", internalType: "Currency", type: "address" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "clear",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "recipient", internalType: "address", type: "address" },
      { name: "currency", internalType: "Currency", type: "address" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "collectProtocolFees",
    outputs: [
      { name: "amountCollected", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "key",
        internalType: "struct PoolKey",
        type: "tuple",
        components: [
          { name: "currency0", internalType: "Currency", type: "address" },
          { name: "currency1", internalType: "Currency", type: "address" },
          { name: "fee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "hooks", internalType: "contract IHooks", type: "address" },
        ],
      },
      { name: "amount0", internalType: "uint256", type: "uint256" },
      { name: "amount1", internalType: "uint256", type: "uint256" },
      { name: "hookData", internalType: "bytes", type: "bytes" },
    ],
    name: "donate",
    outputs: [{ name: "", internalType: "BalanceDelta", type: "int256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "slot", internalType: "bytes32", type: "bytes32" }],
    name: "extsload",
    outputs: [{ name: "value", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "startSlot", internalType: "bytes32", type: "bytes32" },
      { name: "nSlots", internalType: "uint256", type: "uint256" },
    ],
    name: "extsload",
    outputs: [{ name: "values", internalType: "bytes32[]", type: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "slots", internalType: "bytes32[]", type: "bytes32[]" }],
    name: "extsload",
    outputs: [{ name: "values", internalType: "bytes32[]", type: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "slots", internalType: "bytes32[]", type: "bytes32[]" }],
    name: "exttload",
    outputs: [{ name: "values", internalType: "bytes32[]", type: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "slot", internalType: "bytes32", type: "bytes32" }],
    name: "exttload",
    outputs: [{ name: "value", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "key",
        internalType: "struct PoolKey",
        type: "tuple",
        components: [
          { name: "currency0", internalType: "Currency", type: "address" },
          { name: "currency1", internalType: "Currency", type: "address" },
          { name: "fee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "hooks", internalType: "contract IHooks", type: "address" },
        ],
      },
      { name: "sqrtPriceX96", internalType: "uint160", type: "uint160" },
    ],
    name: "initialize",
    outputs: [{ name: "tick", internalType: "int24", type: "int24" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "spender", internalType: "address", type: "address" },
    ],
    name: "isOperator",
    outputs: [{ name: "approved", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "to", internalType: "address", type: "address" },
      { name: "id", internalType: "uint256", type: "uint256" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "key",
        internalType: "struct PoolKey",
        type: "tuple",
        components: [
          { name: "currency0", internalType: "Currency", type: "address" },
          { name: "currency1", internalType: "Currency", type: "address" },
          { name: "fee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "hooks", internalType: "contract IHooks", type: "address" },
        ],
      },
      {
        name: "params",
        internalType: "struct ModifyLiquidityParams",
        type: "tuple",
        components: [
          { name: "tickLower", internalType: "int24", type: "int24" },
          { name: "tickUpper", internalType: "int24", type: "int24" },
          { name: "liquidityDelta", internalType: "int256", type: "int256" },
          { name: "salt", internalType: "bytes32", type: "bytes32" },
        ],
      },
      { name: "hookData", internalType: "bytes", type: "bytes" },
    ],
    name: "modifyLiquidity",
    outputs: [
      { name: "callerDelta", internalType: "BalanceDelta", type: "int256" },
      { name: "feesAccrued", internalType: "BalanceDelta", type: "int256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeController",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "currency", internalType: "Currency", type: "address" }],
    name: "protocolFeesAccrued",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "operator", internalType: "address", type: "address" },
      { name: "approved", internalType: "bool", type: "bool" },
    ],
    name: "setOperator",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "key",
        internalType: "struct PoolKey",
        type: "tuple",
        components: [
          { name: "currency0", internalType: "Currency", type: "address" },
          { name: "currency1", internalType: "Currency", type: "address" },
          { name: "fee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "hooks", internalType: "contract IHooks", type: "address" },
        ],
      },
      { name: "newProtocolFee", internalType: "uint24", type: "uint24" },
    ],
    name: "setProtocolFee",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "controller", internalType: "address", type: "address" }],
    name: "setProtocolFeeController",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "settle",
    outputs: [{ name: "paid", internalType: "uint256", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "settleFor",
    outputs: [{ name: "paid", internalType: "uint256", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "key",
        internalType: "struct PoolKey",
        type: "tuple",
        components: [
          { name: "currency0", internalType: "Currency", type: "address" },
          { name: "currency1", internalType: "Currency", type: "address" },
          { name: "fee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "hooks", internalType: "contract IHooks", type: "address" },
        ],
      },
      {
        name: "params",
        internalType: "struct SwapParams",
        type: "tuple",
        components: [
          { name: "zeroForOne", internalType: "bool", type: "bool" },
          { name: "amountSpecified", internalType: "int256", type: "int256" },
          {
            name: "sqrtPriceLimitX96",
            internalType: "uint160",
            type: "uint160",
          },
        ],
      },
      { name: "hookData", internalType: "bytes", type: "bytes" },
    ],
    name: "swap",
    outputs: [
      { name: "swapDelta", internalType: "BalanceDelta", type: "int256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "currency", internalType: "Currency", type: "address" }],
    name: "sync",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "currency", internalType: "Currency", type: "address" },
      { name: "to", internalType: "address", type: "address" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "take",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "receiver", internalType: "address", type: "address" },
      { name: "id", internalType: "uint256", type: "uint256" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "sender", internalType: "address", type: "address" },
      { name: "receiver", internalType: "address", type: "address" },
      { name: "id", internalType: "uint256", type: "uint256" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "data", internalType: "bytes", type: "bytes" }],
    name: "unlock",
    outputs: [{ name: "", internalType: "bytes", type: "bytes" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "key",
        internalType: "struct PoolKey",
        type: "tuple",
        components: [
          { name: "currency0", internalType: "Currency", type: "address" },
          { name: "currency1", internalType: "Currency", type: "address" },
          { name: "fee", internalType: "uint24", type: "uint24" },
          { name: "tickSpacing", internalType: "int24", type: "int24" },
          { name: "hooks", internalType: "contract IHooks", type: "address" },
        ],
      },
      { name: "newDynamicLPFee", internalType: "uint24", type: "uint24" },
    ],
    name: "updateDynamicLPFee",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "spender",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      { name: "id", internalType: "uint256", type: "uint256", indexed: true },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Approval",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "id", internalType: "PoolId", type: "bytes32", indexed: true },
      {
        name: "sender",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount0",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "amount1",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Donate",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "id", internalType: "PoolId", type: "bytes32", indexed: true },
      {
        name: "currency0",
        internalType: "Currency",
        type: "address",
        indexed: true,
      },
      {
        name: "currency1",
        internalType: "Currency",
        type: "address",
        indexed: true,
      },
      { name: "fee", internalType: "uint24", type: "uint24", indexed: false },
      {
        name: "tickSpacing",
        internalType: "int24",
        type: "int24",
        indexed: false,
      },
      {
        name: "hooks",
        internalType: "contract IHooks",
        type: "address",
        indexed: false,
      },
      {
        name: "sqrtPriceX96",
        internalType: "uint160",
        type: "uint160",
        indexed: false,
      },
      { name: "tick", internalType: "int24", type: "int24", indexed: false },
    ],
    name: "Initialize",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "id", internalType: "PoolId", type: "bytes32", indexed: true },
      {
        name: "sender",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "tickLower",
        internalType: "int24",
        type: "int24",
        indexed: false,
      },
      {
        name: "tickUpper",
        internalType: "int24",
        type: "int24",
        indexed: false,
      },
      {
        name: "liquidityDelta",
        internalType: "int256",
        type: "int256",
        indexed: false,
      },
      {
        name: "salt",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
    ],
    name: "ModifyLiquidity",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "operator",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      { name: "approved", internalType: "bool", type: "bool", indexed: false },
    ],
    name: "OperatorSet",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "protocolFeeController",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "ProtocolFeeControllerUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "id", internalType: "PoolId", type: "bytes32", indexed: true },
      {
        name: "protocolFee",
        internalType: "uint24",
        type: "uint24",
        indexed: false,
      },
    ],
    name: "ProtocolFeeUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "id", internalType: "PoolId", type: "bytes32", indexed: true },
      {
        name: "sender",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount0",
        internalType: "int128",
        type: "int128",
        indexed: false,
      },
      {
        name: "amount1",
        internalType: "int128",
        type: "int128",
        indexed: false,
      },
      {
        name: "sqrtPriceX96",
        internalType: "uint160",
        type: "uint160",
        indexed: false,
      },
      {
        name: "liquidity",
        internalType: "uint128",
        type: "uint128",
        indexed: false,
      },
      { name: "tick", internalType: "int24", type: "int24", indexed: false },
      { name: "fee", internalType: "uint24", type: "uint24", indexed: false },
    ],
    name: "Swap",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "caller",
        internalType: "address",
        type: "address",
        indexed: false,
      },
      { name: "from", internalType: "address", type: "address", indexed: true },
      { name: "to", internalType: "address", type: "address", indexed: true },
      { name: "id", internalType: "uint256", type: "uint256", indexed: true },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Transfer",
  },
  { type: "error", inputs: [], name: "AlreadyUnlocked" },
  {
    type: "error",
    inputs: [
      { name: "currency0", internalType: "address", type: "address" },
      { name: "currency1", internalType: "address", type: "address" },
    ],
    name: "CurrenciesOutOfOrderOrEqual",
  },
  { type: "error", inputs: [], name: "CurrencyNotSettled" },
  { type: "error", inputs: [], name: "InvalidCaller" },
  { type: "error", inputs: [], name: "ManagerLocked" },
  { type: "error", inputs: [], name: "MustClearExactPositiveDelta" },
  { type: "error", inputs: [], name: "NonzeroNativeValue" },
  { type: "error", inputs: [], name: "PoolNotInitialized" },
  { type: "error", inputs: [], name: "ProtocolFeeCurrencySynced" },
  {
    type: "error",
    inputs: [{ name: "fee", internalType: "uint24", type: "uint24" }],
    name: "ProtocolFeeTooLarge",
  },
  { type: "error", inputs: [], name: "SwapAmountCannotBeZero" },
  {
    type: "error",
    inputs: [{ name: "tickSpacing", internalType: "int24", type: "int24" }],
    name: "TickSpacingTooLarge",
  },
  {
    type: "error",
    inputs: [{ name: "tickSpacing", internalType: "int24", type: "int24" }],
    name: "TickSpacingTooSmall",
  },
  { type: "error", inputs: [], name: "UnauthorizedDynamicLPFeeUpdate" },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ISafe
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iSafeAbi = [
  {
    type: "function",
    inputs: [],
    name: "VERSION",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "to", internalType: "address", type: "address" },
      { name: "value", internalType: "uint256", type: "uint256" },
      { name: "data", internalType: "bytes", type: "bytes" },
      { name: "operation", internalType: "uint8", type: "uint8" },
      { name: "safeTxGas", internalType: "uint256", type: "uint256" },
      { name: "baseGas", internalType: "uint256", type: "uint256" },
      { name: "gasPrice", internalType: "uint256", type: "uint256" },
      { name: "gasToken", internalType: "address", type: "address" },
      {
        name: "refundReceiver",
        internalType: "address payable",
        type: "address",
      },
      { name: "signatures", internalType: "bytes", type: "bytes" },
    ],
    name: "execTransaction",
    outputs: [{ name: "success", internalType: "bool", type: "bool" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [
      { name: "start", internalType: "address", type: "address" },
      { name: "pageSize", internalType: "uint256", type: "uint256" },
    ],
    name: "getModulesPaginated",
    outputs: [
      { name: "", internalType: "address[]", type: "address[]" },
      { name: "", internalType: "address", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "getOwners",
    outputs: [{ name: "", internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "length", internalType: "uint256", type: "uint256" },
    ],
    name: "getStorageAt",
    outputs: [{ name: "", internalType: "bytes", type: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "getThreshold",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "to", internalType: "address", type: "address" },
      { name: "value", internalType: "uint256", type: "uint256" },
      { name: "data", internalType: "bytes", type: "bytes" },
      { name: "operation", internalType: "uint8", type: "uint8" },
      { name: "safeTxGas", internalType: "uint256", type: "uint256" },
      { name: "baseGas", internalType: "uint256", type: "uint256" },
      { name: "gasPrice", internalType: "uint256", type: "uint256" },
      { name: "gasToken", internalType: "address", type: "address" },
      { name: "refundReceiver", internalType: "address", type: "address" },
      { name: "nonce_", internalType: "uint256", type: "uint256" },
    ],
    name: "getTransactionHash",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "masterCopy",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "nonce",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "prevOwner", internalType: "address", type: "address" },
      { name: "oldOwner", internalType: "address", type: "address" },
      { name: "newOwner", internalType: "address", type: "address" },
    ],
    name: "swapOwner",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "txHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "payment",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ExecutionFailure",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "txHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "payment",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ExecutionSuccess",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IScaledUIAmount
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iScaledUiAmountAbi = [
  {
    type: "function",
    inputs: [],
    name: "uiMultiplier",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "from", internalType: "address", type: "address", indexed: true },
      { name: "to", internalType: "address", type: "address", indexed: true },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "uiAmount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "TransferWithUIAmount",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "oldMultiplier",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "newMultiplier",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "effectiveAtTimestamp",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "UIMultiplierUpdated",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IScaledUIAmountNewUIMultiplier
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iScaledUiAmountNewUiMultiplierAbi = [
  {
    type: "function",
    inputs: [],
    name: "effectiveAt",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "newUIMultiplier",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IV4Quoter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iv4QuoterAbi = [
  {
    type: "function",
    inputs: [],
    name: "msgSender",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "poolManager",
    outputs: [
      { name: "", internalType: "contract IPoolManager", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "params",
        internalType: "struct IV4Quoter.QuoteExactParams",
        type: "tuple",
        components: [
          { name: "exactCurrency", internalType: "Currency", type: "address" },
          {
            name: "path",
            internalType: "struct PathKey[]",
            type: "tuple[]",
            components: [
              {
                name: "intermediateCurrency",
                internalType: "Currency",
                type: "address",
              },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
              { name: "hookData", internalType: "bytes", type: "bytes" },
            ],
          },
          { name: "exactAmount", internalType: "uint128", type: "uint128" },
        ],
      },
    ],
    name: "quoteExactInput",
    outputs: [
      { name: "amountOut", internalType: "uint256", type: "uint256" },
      { name: "gasEstimate", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "params",
        internalType: "struct IV4Quoter.QuoteExactSingleParams",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            internalType: "struct PoolKey",
            type: "tuple",
            components: [
              { name: "currency0", internalType: "Currency", type: "address" },
              { name: "currency1", internalType: "Currency", type: "address" },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
            ],
          },
          { name: "zeroForOne", internalType: "bool", type: "bool" },
          { name: "exactAmount", internalType: "uint128", type: "uint128" },
          { name: "hookData", internalType: "bytes", type: "bytes" },
        ],
      },
    ],
    name: "quoteExactInputSingle",
    outputs: [
      { name: "amountOut", internalType: "uint256", type: "uint256" },
      { name: "gasEstimate", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "params",
        internalType: "struct IV4Quoter.QuoteExactParams",
        type: "tuple",
        components: [
          { name: "exactCurrency", internalType: "Currency", type: "address" },
          {
            name: "path",
            internalType: "struct PathKey[]",
            type: "tuple[]",
            components: [
              {
                name: "intermediateCurrency",
                internalType: "Currency",
                type: "address",
              },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
              { name: "hookData", internalType: "bytes", type: "bytes" },
            ],
          },
          { name: "exactAmount", internalType: "uint128", type: "uint128" },
        ],
      },
    ],
    name: "quoteExactOutput",
    outputs: [
      { name: "amountIn", internalType: "uint256", type: "uint256" },
      { name: "gasEstimate", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "params",
        internalType: "struct IV4Quoter.QuoteExactSingleParams",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            internalType: "struct PoolKey",
            type: "tuple",
            components: [
              { name: "currency0", internalType: "Currency", type: "address" },
              { name: "currency1", internalType: "Currency", type: "address" },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
            ],
          },
          { name: "zeroForOne", internalType: "bool", type: "bool" },
          { name: "exactAmount", internalType: "uint128", type: "uint128" },
          { name: "hookData", internalType: "bytes", type: "bytes" },
        ],
      },
    ],
    name: "quoteExactOutputSingle",
    outputs: [
      { name: "amountIn", internalType: "uint256", type: "uint256" },
      { name: "gasEstimate", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IWrappedEther
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iWrappedEtherAbi = [
  {
    type: "function",
    inputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IWrappedNative
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const iWrappedNativeAbi = [
  {
    type: "function",
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MembershipFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const membershipFactoryAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "initialPaymentTokens",
        internalType: "contract IERC20[]",
        type: "address[]",
      },
      { name: "mediaStoreFactory_", internalType: "address", type: "address" },
      { name: "initialOwner", internalType: "address", type: "address" },
      { name: "protocolToken_", internalType: "address", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "acceptOwnership",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "bindProtocolToken",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "burnRouter",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "buybackVault",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "config",
        internalType: "struct MembershipTypes.TierConfig",
        type: "tuple",
        components: [
          { name: "creator", internalType: "address", type: "address" },
          { name: "tierSalt", internalType: "bytes32", type: "bytes32" },
          { name: "renderer", internalType: "address", type: "address" },
          { name: "paymentToken", internalType: "address", type: "address" },
          { name: "name", internalType: "string", type: "string" },
          { name: "symbol", internalType: "string", type: "string" },
          { name: "pricePerPeriod", internalType: "uint256", type: "uint256" },
          { name: "periodDuration", internalType: "uint64", type: "uint64" },
          { name: "protocolFeeBps", internalType: "uint16", type: "uint16" },
          { name: "rewardBps", internalType: "uint16", type: "uint16" },
          { name: "referralBps", internalType: "uint16", type: "uint16" },
          { name: "supplyCap", internalType: "uint64", type: "uint64" },
          { name: "maxPrepaidPeriods", internalType: "uint64", type: "uint64" },
          {
            name: "metadata",
            internalType: "struct MembershipTypes.TierMetadata",
            type: "tuple",
            components: [
              { name: "description", internalType: "string", type: "string" },
              { name: "externalURI", internalType: "string", type: "string" },
            ],
          },
          {
            name: "art",
            internalType: "struct MembershipTypes.ArtConfig",
            type: "tuple",
            components: [
              { name: "engine", internalType: "uint16", type: "uint16" },
              {
                name: "collectionSeed",
                internalType: "uint128",
                type: "uint128",
              },
              { name: "palette", internalType: "uint8", type: "uint8" },
              { name: "intensity", internalType: "uint8", type: "uint8" },
              { name: "density", internalType: "uint8", type: "uint8" },
              { name: "symmetry", internalType: "uint8", type: "uint8" },
              { name: "typographyScale", internalType: "uint8", type: "uint8" },
              { name: "typographyStyle", internalType: "uint8", type: "uint8" },
              { name: "textVisibility", internalType: "uint8", type: "uint8" },
              {
                name: "imageFit",
                internalType: "enum MembershipTypes.ImageFit",
                type: "uint8",
              },
              { name: "focalX", internalType: "uint8", type: "uint8" },
              { name: "focalY", internalType: "uint8", type: "uint8" },
              { name: "grain", internalType: "uint8", type: "uint8" },
              { name: "mediaMix", internalType: "uint8", type: "uint8" },
              { name: "primary", internalType: "uint8", type: "uint8" },
              { name: "secondary", internalType: "uint8", type: "uint8" },
              { name: "tertiary", internalType: "uint8", type: "uint8" },
            ],
          },
          {
            name: "media",
            internalType: "struct MembershipTypes.MediaConfig",
            type: "tuple",
            components: [
              {
                name: "mime",
                internalType: "enum MembershipTypes.MediaMIME",
                type: "uint8",
              },
              { name: "store", internalType: "address", type: "address" },
              { name: "length", internalType: "uint32", type: "uint32" },
              { name: "digest", internalType: "bytes32", type: "bytes32" },
              {
                name: "runtimeCodehash",
                internalType: "bytes32",
                type: "bytes32",
              },
            ],
          },
        ],
      },
    ],
    name: "createTier",
    outputs: [{ name: "tier", internalType: "address", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "deployer",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "isPaymentTokenEnabled",
    outputs: [{ name: "enabled", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "isPaymentTokenListed",
    outputs: [{ name: "listed", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tier", internalType: "address", type: "address" }],
    name: "isRegisteredTier",
    outputs: [{ name: "registered", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      { name: "tierSalt", internalType: "bytes32", type: "bytes32" },
    ],
    name: "isTierSaltUsed",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxPageSize",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "mediaStoreFactory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "mediaStoreFactoryRuntimeCodehash",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "owner",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "paymentTokenCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "limit", internalType: "uint256", type: "uint256" },
    ],
    name: "paymentTokens",
    outputs: [{ name: "page", internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "pendingOwner",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      { name: "tierSalt", internalType: "bytes32", type: "bytes32" },
    ],
    name: "predictTierIdentity",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolToken",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "rendererSchema",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [
      { name: "token", internalType: "address", type: "address" },
      { name: "enabled", internalType: "bool", type: "bool" },
    ],
    name: "setPaymentTokenEnabled",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "tierCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "tierIdentity_", internalType: "bytes32", type: "bytes32" },
    ],
    name: "tierForIdentity",
    outputs: [{ name: "tier", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "limit", internalType: "uint256", type: "uint256" },
    ],
    name: "tiers",
    outputs: [{ name: "page", internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "newOwner", internalType: "address", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "previousOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "newOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "OwnershipTransferStarted",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "previousOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "newOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "OwnershipTransferred",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "PaymentTokenDisabled",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "PaymentTokenEnabled",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenIndex",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
    ],
    name: "PaymentTokenListed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tier", internalType: "address", type: "address", indexed: true },
      {
        name: "engine",
        internalType: "uint16",
        type: "uint16",
        indexed: false,
      },
      {
        name: "collectionSeed",
        internalType: "uint128",
        type: "uint128",
        indexed: false,
      },
      {
        name: "artConfigHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
      {
        name: "mediaStore",
        internalType: "address",
        type: "address",
        indexed: false,
      },
      {
        name: "mediaDigest",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
    ],
    name: "TierArtConfigured",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tier", internalType: "address", type: "address", indexed: true },
      {
        name: "creator",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "tierIdentity",
        internalType: "bytes32",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "tierIndex",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      { name: "name", internalType: "string", type: "string", indexed: false },
      {
        name: "symbol",
        internalType: "string",
        type: "string",
        indexed: false,
      },
    ],
    name: "TierCreated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tier", internalType: "address", type: "address", indexed: true },
      {
        name: "description",
        internalType: "string",
        type: "string",
        indexed: false,
      },
      {
        name: "externalURI",
        internalType: "string",
        type: "string",
        indexed: false,
      },
    ],
    name: "TierMetadataConfigured",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tier", internalType: "address", type: "address", indexed: true },
      {
        name: "renderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "TierRendererConfigured",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tier", internalType: "address", type: "address", indexed: true },
      {
        name: "paymentToken",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "pricePerPeriod",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "periodDuration",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
      {
        name: "protocolFeeBps",
        internalType: "uint16",
        type: "uint16",
        indexed: false,
      },
      {
        name: "rewardBps",
        internalType: "uint16",
        type: "uint16",
        indexed: false,
      },
      {
        name: "referralBps",
        internalType: "uint16",
        type: "uint16",
        indexed: false,
      },
      {
        name: "supplyCap",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
      {
        name: "maxPrepaidPeriods",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "TierTermsConfigured",
  },
  { type: "error", inputs: [], name: "CreatorMustBeCaller" },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "DuplicatePaymentToken",
  },
  { type: "error", inputs: [], name: "EmptyPaymentTokenList" },
  { type: "error", inputs: [], name: "InvalidAddress" },
  { type: "error", inputs: [], name: "InvalidContract" },
  { type: "error", inputs: [], name: "InvalidPageSize" },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "InvalidPaymentToken",
  },
  { type: "error", inputs: [], name: "InvalidPeriodDuration" },
  {
    type: "error",
    inputs: [{ name: "candidate", internalType: "address", type: "address" }],
    name: "InvalidProtocolSafe",
  },
  { type: "error", inputs: [], name: "InvalidRateTotal" },
  { type: "error", inputs: [], name: "InvalidRenderer" },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "InvalidRendererSchema",
  },
  { type: "error", inputs: [], name: "InvalidTierSalt" },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "MediaStoreFactoryCodeChanged",
  },
  {
    type: "error",
    inputs: [{ name: "owner", internalType: "address", type: "address" }],
    name: "OwnableInvalidOwner",
  },
  {
    type: "error",
    inputs: [{ name: "account", internalType: "address", type: "address" }],
    name: "OwnableUnauthorizedAccount",
  },
  { type: "error", inputs: [], name: "OwnershipRenunciationDisabled" },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "PaymentTokenNotEnabled",
  },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "PaymentTokenNotListed",
  },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "TierIdentityMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      { name: "tierSalt", internalType: "bytes32", type: "bytes32" },
    ],
    name: "TierSaltAlreadyUsed",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MembershipTier
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const membershipTierAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "factory_", internalType: "address", type: "address" },
      {
        name: "paymentToken_",
        internalType: "contract IERC20",
        type: "address",
      },
      {
        name: "config",
        internalType: "struct MembershipTypes.TierConfig",
        type: "tuple",
        components: [
          { name: "creator", internalType: "address", type: "address" },
          { name: "tierSalt", internalType: "bytes32", type: "bytes32" },
          { name: "renderer", internalType: "address", type: "address" },
          { name: "paymentToken", internalType: "address", type: "address" },
          { name: "name", internalType: "string", type: "string" },
          { name: "symbol", internalType: "string", type: "string" },
          { name: "pricePerPeriod", internalType: "uint256", type: "uint256" },
          { name: "periodDuration", internalType: "uint64", type: "uint64" },
          { name: "protocolFeeBps", internalType: "uint16", type: "uint16" },
          { name: "rewardBps", internalType: "uint16", type: "uint16" },
          { name: "referralBps", internalType: "uint16", type: "uint16" },
          { name: "supplyCap", internalType: "uint64", type: "uint64" },
          { name: "maxPrepaidPeriods", internalType: "uint64", type: "uint64" },
          {
            name: "metadata",
            internalType: "struct MembershipTypes.TierMetadata",
            type: "tuple",
            components: [
              { name: "description", internalType: "string", type: "string" },
              { name: "externalURI", internalType: "string", type: "string" },
            ],
          },
          {
            name: "art",
            internalType: "struct MembershipTypes.ArtConfig",
            type: "tuple",
            components: [
              { name: "engine", internalType: "uint16", type: "uint16" },
              {
                name: "collectionSeed",
                internalType: "uint128",
                type: "uint128",
              },
              { name: "palette", internalType: "uint8", type: "uint8" },
              { name: "intensity", internalType: "uint8", type: "uint8" },
              { name: "density", internalType: "uint8", type: "uint8" },
              { name: "symmetry", internalType: "uint8", type: "uint8" },
              { name: "typographyScale", internalType: "uint8", type: "uint8" },
              { name: "typographyStyle", internalType: "uint8", type: "uint8" },
              { name: "textVisibility", internalType: "uint8", type: "uint8" },
              {
                name: "imageFit",
                internalType: "enum MembershipTypes.ImageFit",
                type: "uint8",
              },
              { name: "focalX", internalType: "uint8", type: "uint8" },
              { name: "focalY", internalType: "uint8", type: "uint8" },
              { name: "grain", internalType: "uint8", type: "uint8" },
              { name: "mediaMix", internalType: "uint8", type: "uint8" },
              { name: "primary", internalType: "uint8", type: "uint8" },
              { name: "secondary", internalType: "uint8", type: "uint8" },
              { name: "tertiary", internalType: "uint8", type: "uint8" },
            ],
          },
          {
            name: "media",
            internalType: "struct MembershipTypes.MediaConfig",
            type: "tuple",
            components: [
              {
                name: "mime",
                internalType: "enum MembershipTypes.MediaMIME",
                type: "uint8",
              },
              { name: "store", internalType: "address", type: "address" },
              { name: "length", internalType: "uint32", type: "uint32" },
              { name: "digest", internalType: "bytes32", type: "bytes32" },
              {
                name: "runtimeCodehash",
                internalType: "bytes32",
                type: "bytes32",
              },
            ],
          },
        ],
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_DESCRIPTION_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_NAME_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_RENDERABLE_MEDIA_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_SYMBOL_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_SYNC_BATCH_SIZE",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_URI_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "acceptOwnership",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "tokenIds", internalType: "uint256[]", type: "uint256[]" },
    ],
    name: "accrueProtocolFees",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "activeBalanceOf",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "", internalType: "address", type: "address" },
      { name: "", internalType: "uint256", type: "uint256" },
    ],
    name: "approve",
    outputs: [],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [],
    name: "artConfig",
    outputs: [
      {
        name: "",
        internalType: "struct MembershipTypes.ArtConfig",
        type: "tuple",
        components: [
          { name: "engine", internalType: "uint16", type: "uint16" },
          { name: "collectionSeed", internalType: "uint128", type: "uint128" },
          { name: "palette", internalType: "uint8", type: "uint8" },
          { name: "intensity", internalType: "uint8", type: "uint8" },
          { name: "density", internalType: "uint8", type: "uint8" },
          { name: "symmetry", internalType: "uint8", type: "uint8" },
          { name: "typographyScale", internalType: "uint8", type: "uint8" },
          { name: "typographyStyle", internalType: "uint8", type: "uint8" },
          { name: "textVisibility", internalType: "uint8", type: "uint8" },
          {
            name: "imageFit",
            internalType: "enum MembershipTypes.ImageFit",
            type: "uint8",
          },
          { name: "focalX", internalType: "uint8", type: "uint8" },
          { name: "focalY", internalType: "uint8", type: "uint8" },
          { name: "grain", internalType: "uint8", type: "uint8" },
          { name: "mediaMix", internalType: "uint8", type: "uint8" },
          { name: "primary", internalType: "uint8", type: "uint8" },
          { name: "secondary", internalType: "uint8", type: "uint8" },
          { name: "tertiary", internalType: "uint8", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "owner", internalType: "address", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "buybackVault",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "cancelSubscription",
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [],
    name: "claimReferral",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "claimReward",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "referrer", internalType: "address", type: "address" }],
    name: "claimableReferral",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "claimableReward",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "gross", internalType: "uint256", type: "uint256" },
      { name: "referralChoice", internalType: "address", type: "address" },
    ],
    name: "contribute",
    outputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "creatorProceeds",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "description",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "expiresAt",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "externalURI",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "factory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "getApproved",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "recipient", internalType: "address", type: "address" },
      { name: "periods", internalType: "uint64", type: "uint64" },
      {
        name: "expectedReferralStatus",
        internalType: "enum MembershipTypes.ReferralStatus",
        type: "uint8",
      },
      { name: "expectedReferrer", internalType: "address", type: "address" },
    ],
    name: "gift",
    outputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "recipient", internalType: "address", type: "address" },
      { name: "periods", internalType: "uint64", type: "uint64" },
    ],
    name: "grantTime",
    outputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "isActive",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "isActiveToken",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "operator", internalType: "address", type: "address" },
    ],
    name: "isApprovedForAll",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "isOccupied",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "isRenewable",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "locked",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxPrepaidPeriods",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "mediaConfig",
    outputs: [
      {
        name: "",
        internalType: "struct MembershipTypes.MediaConfig",
        type: "tuple",
        components: [
          {
            name: "mime",
            internalType: "enum MembershipTypes.MediaMIME",
            type: "uint8",
          },
          { name: "store", internalType: "address", type: "address" },
          { name: "length", internalType: "uint32", type: "uint32" },
          { name: "digest", internalType: "bytes32", type: "bytes32" },
          { name: "runtimeCodehash", internalType: "bytes32", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "name",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "occupiedSupply",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "owner",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "paused",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "paymentToken",
    outputs: [{ name: "", internalType: "contract IERC20", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "pendingOwner",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "periodDuration",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "previewRefund",
    outputs: [
      { name: "grossRefund", internalType: "uint256", type: "uint256" },
      { name: "ownerTopUp", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "previewRefundComponents",
    outputs: [
      { name: "grossRefund", internalType: "uint256", type: "uint256" },
      {
        name: "protocolContribution",
        internalType: "uint256",
        type: "uint256",
      },
      { name: "creatorContribution", internalType: "uint256", type: "uint256" },
      { name: "ownerTopUp", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "pricePerPeriod",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeBps",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeEarnedHeld",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolFeeHoldings",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "tokenId", internalType: "uint256", type: "uint256" },
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "limit", internalType: "uint256", type: "uint256" },
    ],
    name: "protocolFeeLots",
    outputs: [
      {
        name: "page",
        internalType: "struct MembershipTypes.ProtocolFeeLot[]",
        type: "tuple[]",
        components: [
          { name: "startPaid", internalType: "uint256", type: "uint256" },
          { name: "endPaid", internalType: "uint256", type: "uint256" },
          { name: "fee", internalType: "uint256", type: "uint256" },
          { name: "cumulativeFee", internalType: "uint256", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "protocolFeeState",
    outputs: [
      {
        name: "result",
        internalType: "struct MembershipTypes.ProtocolFeeState",
        type: "tuple",
        components: [
          { name: "generation", internalType: "uint256", type: "uint256" },
          { name: "consumedPaid", internalType: "uint256", type: "uint256" },
          { name: "allocated", internalType: "uint256", type: "uint256" },
          { name: "earned", internalType: "uint256", type: "uint256" },
          { name: "unearned", internalType: "uint256", type: "uint256" },
          {
            name: "uncheckpointedEarned",
            internalType: "uint256",
            type: "uint256",
          },
          { name: "refunded", internalType: "uint256", type: "uint256" },
          {
            name: "cancellationRounding",
            internalType: "uint256",
            type: "uint256",
          },
          { name: "lotCount", internalType: "uint256", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "periods", internalType: "uint64", type: "uint64" },
      { name: "referralChoice", internalType: "address", type: "address" },
    ],
    name: "purchase",
    outputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "referralBps",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "referralOf",
    outputs: [
      {
        name: "status",
        internalType: "enum MembershipTypes.ReferralStatus",
        type: "uint8",
      },
      { name: "referrer", internalType: "address", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "tokenId", internalType: "uint256", type: "uint256" },
      { name: "maxGrossRefund", internalType: "uint256", type: "uint256" },
      { name: "maxOwnerTopUp", internalType: "uint256", type: "uint256" },
    ],
    name: "refund",
    outputs: [
      { name: "grossRefund", internalType: "uint256", type: "uint256" },
      { name: "ownerTopUp", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "releaseProtocolFees",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "renderer",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "tokenId", internalType: "uint256", type: "uint256" },
      { name: "duration", internalType: "uint64", type: "uint64" },
    ],
    name: "renewSubscription",
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "revokeGrantTime",
    outputs: [
      { name: "revokedSeconds", internalType: "uint64", type: "uint64" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "rewardBps",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "rewardEligible",
    outputs: [{ name: "eligible", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "rewardPerShare",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "rewardReserve",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "from", internalType: "address", type: "address" },
      { name: "to", internalType: "address", type: "address" },
      { name: "tokenId", internalType: "uint256", type: "uint256" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "from", internalType: "address", type: "address" },
      { name: "to", internalType: "address", type: "address" },
      { name: "tokenId", internalType: "uint256", type: "uint256" },
      { name: "data", internalType: "bytes", type: "bytes" },
    ],
    name: "safeTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "", internalType: "address", type: "address" },
      { name: "", internalType: "bool", type: "bool" },
    ],
    name: "setApprovalForAll",
    outputs: [],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [{ name: "newMaximum", internalType: "uint64", type: "uint64" }],
    name: "setMaxPrepaidPeriods",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "newPaused", internalType: "bool", type: "bool" }],
    name: "setPaused",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "newRenderer", internalType: "address", type: "address" },
      {
        name: "newArt",
        internalType: "struct MembershipTypes.ArtConfig",
        type: "tuple",
        components: [
          { name: "engine", internalType: "uint16", type: "uint16" },
          { name: "collectionSeed", internalType: "uint128", type: "uint128" },
          { name: "palette", internalType: "uint8", type: "uint8" },
          { name: "intensity", internalType: "uint8", type: "uint8" },
          { name: "density", internalType: "uint8", type: "uint8" },
          { name: "symmetry", internalType: "uint8", type: "uint8" },
          { name: "typographyScale", internalType: "uint8", type: "uint8" },
          { name: "typographyStyle", internalType: "uint8", type: "uint8" },
          { name: "textVisibility", internalType: "uint8", type: "uint8" },
          {
            name: "imageFit",
            internalType: "enum MembershipTypes.ImageFit",
            type: "uint8",
          },
          { name: "focalX", internalType: "uint8", type: "uint8" },
          { name: "focalY", internalType: "uint8", type: "uint8" },
          { name: "grain", internalType: "uint8", type: "uint8" },
          { name: "mediaMix", internalType: "uint8", type: "uint8" },
          { name: "primary", internalType: "uint8", type: "uint8" },
          { name: "secondary", internalType: "uint8", type: "uint8" },
          { name: "tertiary", internalType: "uint8", type: "uint8" },
        ],
      },
      {
        name: "newMedia",
        internalType: "struct MembershipTypes.MediaConfig",
        type: "tuple",
        components: [
          {
            name: "mime",
            internalType: "enum MembershipTypes.MediaMIME",
            type: "uint8",
          },
          { name: "store", internalType: "address", type: "address" },
          { name: "length", internalType: "uint32", type: "uint32" },
          { name: "digest", internalType: "bytes32", type: "bytes32" },
          { name: "runtimeCodehash", internalType: "bytes32", type: "bytes32" },
        ],
      },
    ],
    name: "setPresentation",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "newSupplyCap", internalType: "uint64", type: "uint64" }],
    name: "setSupplyCap",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "newMetadata",
        internalType: "struct MembershipTypes.TierMetadata",
        type: "tuple",
        components: [
          { name: "description", internalType: "string", type: "string" },
          { name: "externalURI", internalType: "string", type: "string" },
        ],
      },
    ],
    name: "setTierMetadata",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "sharesOf",
    outputs: [{ name: "shares", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "supplyCap",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "interfaceId", internalType: "bytes4", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "tokenIds", internalType: "uint256[]", type: "uint256[]" },
    ],
    name: "synchronizeExpiredMemberships",
    outputs: [
      { name: "burnedCount", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "tierIdentity",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "timeBalances",
    outputs: [
      { name: "paidSeconds", internalType: "uint64", type: "uint64" },
      { name: "grantSeconds", internalType: "uint64", type: "uint64" },
      { name: "effectiveCheckpoint", internalType: "uint64", type: "uint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "recipient", internalType: "address", type: "address" }],
    name: "tokenOf",
    outputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalMinted",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalProtectedLiability",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalProtocolFeeAllocated",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalProtocolFeeCancellationRounding",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalProtocolFeeRefunded",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalProtocolFeeReleased",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalReferralLiability",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalRewardShares",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "from", internalType: "address", type: "address" },
      { name: "to", internalType: "address", type: "address" },
      { name: "tokenId", internalType: "uint256", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "newOwner", internalType: "address", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "withdrawCreatorProceeds",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "approved",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
    ],
    name: "Approval",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "operator",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      { name: "approved", internalType: "bool", type: "bool", indexed: false },
    ],
    name: "ApprovalForAll",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "fromTokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "toTokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "BatchMetadataUpdate",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "CreatorProceedsWithdrawn",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "suspendedShares",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ExpiredMembershipSynchronized",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Locked",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "previousMaximum",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
      {
        name: "newMaximum",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "MaxPrepaidPeriodsUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "tierOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "grossRefund",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "ownerTopUp",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "MembershipRefunded",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "paidSeconds",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
      {
        name: "grantSeconds",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
      {
        name: "expiration",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "MembershipTimeUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "MetadataUpdate",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "previousOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "newOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "OwnershipTransferStarted",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "previousOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "newOwner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "OwnershipTransferred",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "paused", internalType: "bool", type: "bool", indexed: false },
    ],
    name: "PauseUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "protocolFee",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "reward",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "referral",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "creator",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "PaymentAllocated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "payer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "gross",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "periods",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "PaymentProcessed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "previousRenderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "newRenderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "previousArtHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
      {
        name: "newArtHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
      {
        name: "previousMediaHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
      {
        name: "newMediaHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
    ],
    name: "PresentationUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "generation",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "lotIndex",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: false,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "startPaid",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "endPaid",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ProtocolFeeAllocated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "generation",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "cumulativeEarned",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ProtocolFeesAccrued",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "vault",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ProtocolFeesReleased",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "referrer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "ReferralClaimed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "status",
        internalType: "enum MembershipTypes.ReferralStatus",
        type: "uint8",
        indexed: false,
      },
      {
        name: "referrer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "ReferralLocked",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "protocolContribution",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "creatorContribution",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "ownerTopUp",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "cancellationRounding",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "RefundFunded",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "RewardClaimed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      { name: "eligible", internalType: "bool", type: "bool", indexed: false },
      {
        name: "eligibleShares",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "totalRewardShares",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "RewardEligibilityUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "reward",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "rewardPerShare",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "directRemainder",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "RewardPerShareUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "tokenShares",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "aggregateShares",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "SharesIssued",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "expiration",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "SubscriptionUpdate",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "previousCap",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
      {
        name: "newCap",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "SupplyCapUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "description",
        internalType: "string",
        type: "string",
        indexed: false,
      },
      {
        name: "externalURI",
        internalType: "string",
        type: "string",
        indexed: false,
      },
    ],
    name: "TierMetadataUpdated",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "from", internalType: "address", type: "address", indexed: true },
      { name: "to", internalType: "address", type: "address", indexed: true },
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
    ],
    name: "Transfer",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "tokenId",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Unlocked",
  },
  { type: "error", inputs: [], name: "CapacityReached" },
  { type: "error", inputs: [], name: "DurationOverflow" },
  {
    type: "error",
    inputs: [
      { name: "sender", internalType: "address", type: "address" },
      { name: "tokenId", internalType: "uint256", type: "uint256" },
      { name: "owner", internalType: "address", type: "address" },
    ],
    name: "ERC721IncorrectOwner",
  },
  {
    type: "error",
    inputs: [
      { name: "operator", internalType: "address", type: "address" },
      { name: "tokenId", internalType: "uint256", type: "uint256" },
    ],
    name: "ERC721InsufficientApproval",
  },
  {
    type: "error",
    inputs: [{ name: "approver", internalType: "address", type: "address" }],
    name: "ERC721InvalidApprover",
  },
  {
    type: "error",
    inputs: [{ name: "operator", internalType: "address", type: "address" }],
    name: "ERC721InvalidOperator",
  },
  {
    type: "error",
    inputs: [{ name: "owner", internalType: "address", type: "address" }],
    name: "ERC721InvalidOwner",
  },
  {
    type: "error",
    inputs: [{ name: "receiver", internalType: "address", type: "address" }],
    name: "ERC721InvalidReceiver",
  },
  {
    type: "error",
    inputs: [{ name: "sender", internalType: "address", type: "address" }],
    name: "ERC721InvalidSender",
  },
  {
    type: "error",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "ERC721NonexistentToken",
  },
  {
    type: "error",
    inputs: [
      { name: "required", internalType: "uint256", type: "uint256" },
      { name: "maximum", internalType: "uint256", type: "uint256" },
    ],
    name: "GrossRefundLimitExceeded",
  },
  { type: "error", inputs: [], name: "IncorrectPricingMode" },
  { type: "error", inputs: [], name: "InexactTokenTransfer" },
  { type: "error", inputs: [], name: "InvalidAddress" },
  { type: "error", inputs: [], name: "InvalidCancellationRounding" },
  { type: "error", inputs: [], name: "InvalidFeePageSize" },
  { type: "error", inputs: [], name: "InvalidMediaConfig" },
  { type: "error", inputs: [], name: "InvalidMetadata" },
  { type: "error", inputs: [], name: "InvalidPaidDuration" },
  { type: "error", inputs: [], name: "InvalidPeriodDuration" },
  { type: "error", inputs: [], name: "InvalidPeriods" },
  { type: "error", inputs: [], name: "InvalidRateTotal" },
  { type: "error", inputs: [], name: "InvalidRenderer" },
  {
    type: "error",
    inputs: [
      { name: "provided", internalType: "uint256", type: "uint256" },
      { name: "maximum", internalType: "uint256", type: "uint256" },
    ],
    name: "InvalidSyncBatchSize",
  },
  { type: "error", inputs: [], name: "InvalidText" },
  { type: "error", inputs: [], name: "InvalidTierSalt" },
  {
    type: "error",
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "InvalidTokenId",
  },
  { type: "error", inputs: [], name: "NativeValueRejected" },
  { type: "error", inputs: [], name: "NoGrantTime" },
  {
    type: "error",
    inputs: [{ name: "owner", internalType: "address", type: "address" }],
    name: "OwnableInvalidOwner",
  },
  {
    type: "error",
    inputs: [{ name: "account", internalType: "address", type: "address" }],
    name: "OwnableUnauthorizedAccount",
  },
  {
    type: "error",
    inputs: [
      { name: "required", internalType: "uint256", type: "uint256" },
      { name: "maximum", internalType: "uint256", type: "uint256" },
    ],
    name: "OwnerTopUpLimitExceeded",
  },
  { type: "error", inputs: [], name: "OwnershipRenunciationDisabled" },
  { type: "error", inputs: [], name: "PaymentOverflow" },
  { type: "error", inputs: [], name: "PrepaymentLimitExceeded" },
  { type: "error", inputs: [], name: "ReentrancyGuardReentrantCall" },
  { type: "error", inputs: [], name: "ReferralChoiceMismatch" },
  { type: "error", inputs: [], name: "ReferralChoiceRequired" },
  { type: "error", inputs: [], name: "ReferralStateMismatch" },
  {
    type: "error",
    inputs: [
      { name: "bits", internalType: "uint8", type: "uint8" },
      { name: "value", internalType: "uint256", type: "uint256" },
    ],
    name: "SafeCastOverflowedUintDowncast",
  },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "SafeERC20FailedOperation",
  },
  { type: "error", inputs: [], name: "SelfGiftNotAllowed" },
  { type: "error", inputs: [], name: "Soulbound" },
  { type: "error", inputs: [], name: "SupplyCapBelowOccupancy" },
  { type: "error", inputs: [], name: "TierPaused" },
  { type: "error", inputs: [], name: "TimestampOverflow" },
  { type: "error", inputs: [], name: "TokenOwnerOnly" },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// OnchainMediaStoreFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const onchainMediaStoreFactoryAbi = [
  {
    type: "function",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "limit", internalType: "uint256", type: "uint256" },
    ],
    name: "creatorMedia",
    outputs: [
      {
        name: "page",
        internalType: "struct MembershipTypes.MediaRecord[]",
        type: "tuple[]",
        components: [
          { name: "store", internalType: "address", type: "address" },
          { name: "creator", internalType: "address", type: "address" },
          {
            name: "mime",
            internalType: "enum MembershipTypes.MediaMIME",
            type: "uint8",
          },
          { name: "length", internalType: "uint32", type: "uint32" },
          { name: "digest", internalType: "bytes32", type: "bytes32" },
          { name: "runtimeCodehash", internalType: "bytes32", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "creator", internalType: "address", type: "address" }],
    name: "creatorMediaCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "store_", internalType: "address", type: "address" }],
    name: "isRegisteredMedia",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxCodeStorePayloadBytes",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxPageSize",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxRenderableMediaBytes",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      {
        name: "mime",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
      { name: "length", internalType: "uint32", type: "uint32" },
      { name: "digest", internalType: "bytes32", type: "bytes32" },
    ],
    name: "mediaKey",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [{ name: "store_", internalType: "address", type: "address" }],
    name: "mediaRecord",
    outputs: [
      {
        name: "",
        internalType: "struct MembershipTypes.MediaRecord",
        type: "tuple",
        components: [
          { name: "store", internalType: "address", type: "address" },
          { name: "creator", internalType: "address", type: "address" },
          {
            name: "mime",
            internalType: "enum MembershipTypes.MediaMIME",
            type: "uint8",
          },
          { name: "length", internalType: "uint32", type: "uint32" },
          { name: "digest", internalType: "bytes32", type: "bytes32" },
          { name: "runtimeCodehash", internalType: "bytes32", type: "bytes32" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      {
        name: "mime",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
      { name: "length", internalType: "uint32", type: "uint32" },
      { name: "digest", internalType: "bytes32", type: "bytes32" },
    ],
    name: "mediaStore",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      { name: "payload", internalType: "bytes", type: "bytes" },
      {
        name: "mime",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
    ],
    name: "predictStore",
    outputs: [{ name: "store_", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "payload", internalType: "bytes", type: "bytes" },
      {
        name: "mime",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
    ],
    name: "store",
    outputs: [{ name: "store_", internalType: "address", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "creator", internalType: "address", type: "address" },
      {
        name: "media",
        internalType: "struct MembershipTypes.MediaConfig",
        type: "tuple",
        components: [
          {
            name: "mime",
            internalType: "enum MembershipTypes.MediaMIME",
            type: "uint8",
          },
          { name: "store", internalType: "address", type: "address" },
          { name: "length", internalType: "uint32", type: "uint32" },
          { name: "digest", internalType: "bytes32", type: "bytes32" },
          { name: "runtimeCodehash", internalType: "bytes32", type: "bytes32" },
        ],
      },
    ],
    name: "validateOnchainMedia",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "creator",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "store",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "digest",
        internalType: "bytes32",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "mime",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
        indexed: false,
      },
      {
        name: "length",
        internalType: "uint32",
        type: "uint32",
        indexed: false,
      },
      {
        name: "runtimeCodehash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
      },
    ],
    name: "MediaStored",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "CodeStoreDigestMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "CodeStoreHashMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "uint256", type: "uint256" },
      { name: "actual", internalType: "uint256", type: "uint256" },
    ],
    name: "CodeStoreLengthMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "actual", internalType: "bytes1", type: "bytes1" },
    ],
    name: "CodeStorePrefixMismatch",
  },
  { type: "error", inputs: [], name: "EmptyMedia" },
  {
    type: "error",
    inputs: [{ name: "store", internalType: "address", type: "address" }],
    name: "InvalidCodeStore",
  },
  { type: "error", inputs: [], name: "InvalidCreator" },
  {
    type: "error",
    inputs: [
      {
        name: "mime",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
    ],
    name: "InvalidMediaSignature",
  },
  { type: "error", inputs: [], name: "InvalidPageSize" },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "MediaCodehashMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "address", type: "address" },
      { name: "actual", internalType: "address", type: "address" },
    ],
    name: "MediaCreatorMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "MediaDigestMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "uint32", type: "uint32" },
      { name: "actual", internalType: "uint32", type: "uint32" },
    ],
    name: "MediaLengthMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      {
        name: "expected",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
      {
        name: "actual",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
    ],
    name: "MediaMIMEMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "length", internalType: "uint256", type: "uint256" },
      { name: "maximum", internalType: "uint256", type: "uint256" },
    ],
    name: "MediaTooLarge",
  },
  {
    type: "error",
    inputs: [{ name: "store", internalType: "address", type: "address" }],
    name: "PredictedStoreOccupied",
  },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "address", type: "address" },
      { name: "actual", internalType: "address", type: "address" },
    ],
    name: "StoreAddressMismatch",
  },
  {
    type: "error",
    inputs: [{ name: "store", internalType: "address", type: "address" }],
    name: "UnregisteredStore",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// OnchainMetadataRenderer
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const onchainMetadataRendererAbi = [
  {
    type: "function",
    inputs: [],
    name: "MAX_DESCRIPTION_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_NAME_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_RENDERABLE_MEDIA_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_URI_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "engineCount",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [{ name: "engine", internalType: "uint16", type: "uint16" }],
    name: "engineName",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [
      {
        name: "context",
        internalType: "struct MembershipTypes.PreviewContext",
        type: "tuple",
        components: [
          {
            name: "token",
            internalType: "struct MembershipTypes.TokenRenderData",
            type: "tuple",
            components: [
              { name: "tierName", internalType: "string", type: "string" },
              { name: "description", internalType: "string", type: "string" },
              { name: "externalURI", internalType: "string", type: "string" },
              {
                name: "tierIdentity",
                internalType: "bytes32",
                type: "bytes32",
              },
              {
                name: "art",
                internalType: "struct MembershipTypes.ArtConfig",
                type: "tuple",
                components: [
                  { name: "engine", internalType: "uint16", type: "uint16" },
                  {
                    name: "collectionSeed",
                    internalType: "uint128",
                    type: "uint128",
                  },
                  { name: "palette", internalType: "uint8", type: "uint8" },
                  { name: "intensity", internalType: "uint8", type: "uint8" },
                  { name: "density", internalType: "uint8", type: "uint8" },
                  { name: "symmetry", internalType: "uint8", type: "uint8" },
                  {
                    name: "typographyScale",
                    internalType: "uint8",
                    type: "uint8",
                  },
                  {
                    name: "typographyStyle",
                    internalType: "uint8",
                    type: "uint8",
                  },
                  {
                    name: "textVisibility",
                    internalType: "uint8",
                    type: "uint8",
                  },
                  {
                    name: "imageFit",
                    internalType: "enum MembershipTypes.ImageFit",
                    type: "uint8",
                  },
                  { name: "focalX", internalType: "uint8", type: "uint8" },
                  { name: "focalY", internalType: "uint8", type: "uint8" },
                  { name: "grain", internalType: "uint8", type: "uint8" },
                  { name: "mediaMix", internalType: "uint8", type: "uint8" },
                  { name: "primary", internalType: "uint8", type: "uint8" },
                  { name: "secondary", internalType: "uint8", type: "uint8" },
                  { name: "tertiary", internalType: "uint8", type: "uint8" },
                ],
              },
              {
                name: "media",
                internalType: "struct MembershipTypes.MediaConfig",
                type: "tuple",
                components: [
                  {
                    name: "mime",
                    internalType: "enum MembershipTypes.MediaMIME",
                    type: "uint8",
                  },
                  { name: "store", internalType: "address", type: "address" },
                  { name: "length", internalType: "uint32", type: "uint32" },
                  { name: "digest", internalType: "bytes32", type: "bytes32" },
                  {
                    name: "runtimeCodehash",
                    internalType: "bytes32",
                    type: "bytes32",
                  },
                ],
              },
              { name: "tokenId", internalType: "uint256", type: "uint256" },
              { name: "expiration", internalType: "uint64", type: "uint64" },
              { name: "active", internalType: "bool", type: "bool" },
            ],
          },
          { name: "nativeMedia", internalType: "bytes", type: "bytes" },
        ],
      },
    ],
    name: "previewSVG",
    outputs: [{ name: "rawSVG", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "context",
        internalType: "struct MembershipTypes.PreviewContext",
        type: "tuple",
        components: [
          {
            name: "token",
            internalType: "struct MembershipTypes.TokenRenderData",
            type: "tuple",
            components: [
              { name: "tierName", internalType: "string", type: "string" },
              { name: "description", internalType: "string", type: "string" },
              { name: "externalURI", internalType: "string", type: "string" },
              {
                name: "tierIdentity",
                internalType: "bytes32",
                type: "bytes32",
              },
              {
                name: "art",
                internalType: "struct MembershipTypes.ArtConfig",
                type: "tuple",
                components: [
                  { name: "engine", internalType: "uint16", type: "uint16" },
                  {
                    name: "collectionSeed",
                    internalType: "uint128",
                    type: "uint128",
                  },
                  { name: "palette", internalType: "uint8", type: "uint8" },
                  { name: "intensity", internalType: "uint8", type: "uint8" },
                  { name: "density", internalType: "uint8", type: "uint8" },
                  { name: "symmetry", internalType: "uint8", type: "uint8" },
                  {
                    name: "typographyScale",
                    internalType: "uint8",
                    type: "uint8",
                  },
                  {
                    name: "typographyStyle",
                    internalType: "uint8",
                    type: "uint8",
                  },
                  {
                    name: "textVisibility",
                    internalType: "uint8",
                    type: "uint8",
                  },
                  {
                    name: "imageFit",
                    internalType: "enum MembershipTypes.ImageFit",
                    type: "uint8",
                  },
                  { name: "focalX", internalType: "uint8", type: "uint8" },
                  { name: "focalY", internalType: "uint8", type: "uint8" },
                  { name: "grain", internalType: "uint8", type: "uint8" },
                  { name: "mediaMix", internalType: "uint8", type: "uint8" },
                  { name: "primary", internalType: "uint8", type: "uint8" },
                  { name: "secondary", internalType: "uint8", type: "uint8" },
                  { name: "tertiary", internalType: "uint8", type: "uint8" },
                ],
              },
              {
                name: "media",
                internalType: "struct MembershipTypes.MediaConfig",
                type: "tuple",
                components: [
                  {
                    name: "mime",
                    internalType: "enum MembershipTypes.MediaMIME",
                    type: "uint8",
                  },
                  { name: "store", internalType: "address", type: "address" },
                  { name: "length", internalType: "uint32", type: "uint32" },
                  { name: "digest", internalType: "bytes32", type: "bytes32" },
                  {
                    name: "runtimeCodehash",
                    internalType: "bytes32",
                    type: "bytes32",
                  },
                ],
              },
              { name: "tokenId", internalType: "uint256", type: "uint256" },
              { name: "expiration", internalType: "uint64", type: "uint64" },
              { name: "active", internalType: "bool", type: "bool" },
            ],
          },
          { name: "nativeMedia", internalType: "bytes", type: "bytes" },
        ],
      },
    ],
    name: "previewTokenURI",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "data",
        internalType: "struct MembershipTypes.TokenRenderData",
        type: "tuple",
        components: [
          { name: "tierName", internalType: "string", type: "string" },
          { name: "description", internalType: "string", type: "string" },
          { name: "externalURI", internalType: "string", type: "string" },
          { name: "tierIdentity", internalType: "bytes32", type: "bytes32" },
          {
            name: "art",
            internalType: "struct MembershipTypes.ArtConfig",
            type: "tuple",
            components: [
              { name: "engine", internalType: "uint16", type: "uint16" },
              {
                name: "collectionSeed",
                internalType: "uint128",
                type: "uint128",
              },
              { name: "palette", internalType: "uint8", type: "uint8" },
              { name: "intensity", internalType: "uint8", type: "uint8" },
              { name: "density", internalType: "uint8", type: "uint8" },
              { name: "symmetry", internalType: "uint8", type: "uint8" },
              { name: "typographyScale", internalType: "uint8", type: "uint8" },
              { name: "typographyStyle", internalType: "uint8", type: "uint8" },
              { name: "textVisibility", internalType: "uint8", type: "uint8" },
              {
                name: "imageFit",
                internalType: "enum MembershipTypes.ImageFit",
                type: "uint8",
              },
              { name: "focalX", internalType: "uint8", type: "uint8" },
              { name: "focalY", internalType: "uint8", type: "uint8" },
              { name: "grain", internalType: "uint8", type: "uint8" },
              { name: "mediaMix", internalType: "uint8", type: "uint8" },
              { name: "primary", internalType: "uint8", type: "uint8" },
              { name: "secondary", internalType: "uint8", type: "uint8" },
              { name: "tertiary", internalType: "uint8", type: "uint8" },
            ],
          },
          {
            name: "media",
            internalType: "struct MembershipTypes.MediaConfig",
            type: "tuple",
            components: [
              {
                name: "mime",
                internalType: "enum MembershipTypes.MediaMIME",
                type: "uint8",
              },
              { name: "store", internalType: "address", type: "address" },
              { name: "length", internalType: "uint32", type: "uint32" },
              { name: "digest", internalType: "bytes32", type: "bytes32" },
              {
                name: "runtimeCodehash",
                internalType: "bytes32",
                type: "bytes32",
              },
            ],
          },
          { name: "tokenId", internalType: "uint256", type: "uint256" },
          { name: "expiration", internalType: "uint64", type: "uint64" },
          { name: "active", internalType: "bool", type: "bool" },
        ],
      },
    ],
    name: "renderTokenURI",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "rendererName",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [],
    name: "rendererSchema",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [
      {
        name: "art",
        internalType: "struct MembershipTypes.ArtConfig",
        type: "tuple",
        components: [
          { name: "engine", internalType: "uint16", type: "uint16" },
          { name: "collectionSeed", internalType: "uint128", type: "uint128" },
          { name: "palette", internalType: "uint8", type: "uint8" },
          { name: "intensity", internalType: "uint8", type: "uint8" },
          { name: "density", internalType: "uint8", type: "uint8" },
          { name: "symmetry", internalType: "uint8", type: "uint8" },
          { name: "typographyScale", internalType: "uint8", type: "uint8" },
          { name: "typographyStyle", internalType: "uint8", type: "uint8" },
          { name: "textVisibility", internalType: "uint8", type: "uint8" },
          {
            name: "imageFit",
            internalType: "enum MembershipTypes.ImageFit",
            type: "uint8",
          },
          { name: "focalX", internalType: "uint8", type: "uint8" },
          { name: "focalY", internalType: "uint8", type: "uint8" },
          { name: "grain", internalType: "uint8", type: "uint8" },
          { name: "mediaMix", internalType: "uint8", type: "uint8" },
          { name: "primary", internalType: "uint8", type: "uint8" },
          { name: "secondary", internalType: "uint8", type: "uint8" },
          { name: "tertiary", internalType: "uint8", type: "uint8" },
        ],
      },
      {
        name: "media",
        internalType: "struct MembershipTypes.MediaConfig",
        type: "tuple",
        components: [
          {
            name: "mime",
            internalType: "enum MembershipTypes.MediaMIME",
            type: "uint8",
          },
          { name: "store", internalType: "address", type: "address" },
          { name: "length", internalType: "uint32", type: "uint32" },
          { name: "digest", internalType: "bytes32", type: "bytes32" },
          { name: "runtimeCodehash", internalType: "bytes32", type: "bytes32" },
        ],
      },
    ],
    name: "validateConfiguration",
    outputs: [],
    stateMutability: "pure",
  },
  {
    type: "error",
    inputs: [
      { name: "required", internalType: "uint256", type: "uint256" },
      { name: "capacity", internalType: "uint256", type: "uint256" },
    ],
    name: "BufferCapacityExceeded",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "CodeStoreDigestMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "CodeStoreHashMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "expected", internalType: "uint256", type: "uint256" },
      { name: "actual", internalType: "uint256", type: "uint256" },
    ],
    name: "CodeStoreLengthMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "store", internalType: "address", type: "address" },
      { name: "actual", internalType: "bytes1", type: "bytes1" },
    ],
    name: "CodeStorePrefixMismatch",
  },
  {
    type: "error",
    inputs: [
      { name: "control", internalType: "uint8", type: "uint8" },
      { name: "value", internalType: "uint8", type: "uint8" },
      { name: "maximum", internalType: "uint8", type: "uint8" },
    ],
    name: "InvalidArtControl",
  },
  {
    type: "error",
    inputs: [{ name: "store", internalType: "address", type: "address" }],
    name: "InvalidCodeStore",
  },
  {
    type: "error",
    inputs: [{ name: "engine", internalType: "uint16", type: "uint16" }],
    name: "InvalidEngine",
  },
  { type: "error", inputs: [], name: "InvalidMediaConfig" },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "InvalidNativeMediaDigest",
  },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "uint256", type: "uint256" },
      { name: "actual", internalType: "uint256", type: "uint256" },
    ],
    name: "InvalidNativeMediaLength",
  },
  {
    type: "error",
    inputs: [
      {
        name: "mime",
        internalType: "enum MembershipTypes.MediaMIME",
        type: "uint8",
      },
    ],
    name: "InvalidNativeMediaSignature",
  },
  { type: "error", inputs: [], name: "InvalidText" },
  {
    type: "error",
    inputs: [
      { name: "field", internalType: "uint8", type: "uint8" },
      { name: "length", internalType: "uint256", type: "uint256" },
      { name: "maximum", internalType: "uint256", type: "uint256" },
    ],
    name: "InvalidTextLength",
  },
  {
    type: "error",
    inputs: [
      { name: "value", internalType: "uint256", type: "uint256" },
      { name: "length", internalType: "uint256", type: "uint256" },
    ],
    name: "StringsInsufficientHexLength",
  },
  {
    type: "error",
    inputs: [{ name: "engine", internalType: "uint16", type: "uint16" }],
    name: "UnsupportedEngine",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PonsBuybackExecutor
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const ponsBuybackExecutorAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "vault_", internalType: "address", type: "address" },
      { name: "token_", internalType: "address", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    inputs: [],
    name: "curve",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "asset", internalType: "address", type: "address" },
      { name: "amount", internalType: "uint256", type: "uint256" },
      {
        name: "route",
        internalType: "struct BuybackTypes.TypedRoute",
        type: "tuple",
        components: [
          {
            name: "pools",
            internalType: "struct PoolKey[]",
            type: "tuple[]",
            components: [
              { name: "currency0", internalType: "Currency", type: "address" },
              { name: "currency1", internalType: "Currency", type: "address" },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
            ],
          },
        ],
      },
      { name: "deadline", internalType: "uint64", type: "uint64" },
    ],
    name: "execute",
    outputs: [
      {
        name: "result",
        internalType: "struct BuybackTypes.Execution",
        type: "tuple",
        components: [
          {
            name: "lifecycle",
            internalType: "enum BuybackTypes.Lifecycle",
            type: "uint8",
          },
          {
            name: "legs",
            internalType: "struct BuybackTypes.Leg[]",
            type: "tuple[]",
            components: [
              { name: "input", internalType: "address", type: "address" },
              { name: "output", internalType: "address", type: "address" },
              { name: "spent", internalType: "uint256", type: "uint256" },
              { name: "received", internalType: "uint256", type: "uint256" },
            ],
          },
          { name: "acquired", internalType: "uint256", type: "uint256" },
        ],
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    inputs: [],
    name: "lifecycle",
    outputs: [
      { name: "", internalType: "enum BuybackTypes.Lifecycle", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolToken",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "vault",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  { type: "error", inputs: [], name: "GraduationPending" },
  { type: "error", inputs: [], name: "InexactSettlement" },
  { type: "error", inputs: [], name: "InvalidDependency" },
  { type: "error", inputs: [], name: "InvalidExecution" },
  { type: "error", inputs: [], name: "InvalidProtocolLaunch" },
  { type: "error", inputs: [], name: "LaunchPenalty" },
  { type: "error", inputs: [], name: "OnlyVault" },
  { type: "error", inputs: [], name: "ReentrancyGuardReentrantCall" },
  {
    type: "error",
    inputs: [
      { name: "bits", internalType: "uint8", type: "uint8" },
      { name: "value", internalType: "uint256", type: "uint256" },
    ],
    name: "SafeCastOverflowedUintDowncast",
  },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "SafeERC20FailedOperation",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ProtocolBurnRouter
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const protocolBurnRouterAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "factory_", internalType: "address", type: "address" },
      { name: "vault_", internalType: "address", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "collections",
        internalType: "struct ProtocolBurnRouter.Collection[]",
        type: "tuple[]",
        components: [
          { name: "tier", internalType: "address", type: "address" },
          { name: "tokenIds", internalType: "uint256[]", type: "uint256[]" },
        ],
      },
      {
        name: "purchases",
        internalType: "struct ProtocolBurnRouter.Purchase[]",
        type: "tuple[]",
        components: [
          { name: "asset", internalType: "address", type: "address" },
          { name: "revision", internalType: "uint64", type: "uint64" },
        ],
      },
      { name: "deadline", internalType: "uint64", type: "uint64" },
    ],
    name: "burn",
    outputs: [
      { name: "releasedTiers", internalType: "uint256", type: "uint256" },
      { name: "purchaseCount", internalType: "uint256", type: "uint256" },
      { name: "burned", internalType: "uint256", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      {
        name: "collection",
        internalType: "struct ProtocolBurnRouter.Collection",
        type: "tuple",
        components: [
          { name: "tier", internalType: "address", type: "address" },
          { name: "tokenIds", internalType: "uint256[]", type: "uint256[]" },
        ],
      },
    ],
    name: "collect",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "factory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "nextSource",
    outputs: [
      {
        name: "",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "item",
        internalType: "struct ProtocolBurnRouter.Purchase",
        type: "tuple",
        components: [
          { name: "asset", internalType: "address", type: "address" },
          { name: "revision", internalType: "uint64", type: "uint64" },
        ],
      },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
      },
      { name: "deadline", internalType: "uint64", type: "uint64" },
    ],
    name: "purchase",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "vault",
    outputs: [
      {
        name: "",
        internalType: "contract IProtocolBuybackVault",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "caller",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "releasedTiers",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "purchases",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "burned",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "BurnCompleted",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tier", internalType: "address", type: "address", indexed: true },
      { name: "reason", internalType: "bytes", type: "bytes", indexed: false },
    ],
    name: "CollectionFailed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
        indexed: false,
      },
      { name: "reason", internalType: "bytes", type: "bytes", indexed: false },
    ],
    name: "PurchaseFailed",
  },
  { type: "error", inputs: [], name: "DeadlineExpired" },
  { type: "error", inputs: [], name: "InvalidBatch" },
  { type: "error", inputs: [], name: "NothingToDo" },
  { type: "error", inputs: [], name: "OnlySelf" },
  { type: "error", inputs: [], name: "ReentrancyGuardReentrantCall" },
  { type: "error", inputs: [], name: "UnregisteredTier" },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ProtocolBuybackVault
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const protocolBuybackVaultAbi = [
  {
    type: "constructor",
    inputs: [
      { name: "factory_", internalType: "address", type: "address" },
      { name: "protocolToken_", internalType: "address", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "assetBuybacksPaused",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "bindProtocolToken",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "buybacksPaused",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "canonicalAsset",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [],
    name: "executor",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "executorCreationCodeHash",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "executorCreationCodeLength",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "executorCreationCodeStore",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "factory",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "globalMinInterval",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "asset", internalType: "address", type: "address" },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
      },
    ],
    name: "inventory",
    outputs: [
      {
        name: "",
        internalType: "struct BuybackTypes.Inventory",
        type: "tuple",
        components: [
          { name: "available", internalType: "uint256", type: "uint256" },
          { name: "totalReceived", internalType: "uint256", type: "uint256" },
          {
            name: "totalConvertedIn",
            internalType: "uint256",
            type: "uint256",
          },
          { name: "totalSpent", internalType: "uint256", type: "uint256" },
          { name: "totalBurned", internalType: "uint256", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "lastAssetBuyAt",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "lastBuyAt",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "limits",
    outputs: [
      {
        name: "",
        internalType: "struct BuybackTypes.ExecutionLimits",
        type: "tuple",
        components: [
          { name: "minInput", internalType: "uint128", type: "uint128" },
          { name: "maxInput", internalType: "uint128", type: "uint128" },
          { name: "minInterval", internalType: "uint64", type: "uint64" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "asset", internalType: "address", type: "address" },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
      },
      { name: "amountIn", internalType: "uint256", type: "uint256" },
      { name: "expectedRevision", internalType: "uint64", type: "uint64" },
      { name: "deadline", internalType: "uint64", type: "uint64" },
    ],
    name: "process",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "asset", internalType: "address", type: "address" },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
      },
    ],
    name: "processingStatus",
    outputs: [
      {
        name: "state",
        internalType: "struct BuybackTypes.ProcessingState",
        type: "tuple",
        components: [
          {
            name: "status",
            internalType: "enum BuybackTypes.Status",
            type: "uint8",
          },
          { name: "revision", internalType: "uint64", type: "uint64" },
          { name: "available", internalType: "uint256", type: "uint256" },
          { name: "maxInput", internalType: "uint256", type: "uint256" },
          { name: "minInput", internalType: "uint256", type: "uint256" },
          { name: "nextEligibleAt", internalType: "uint256", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "protocolToken",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    name: "recordEarnedFees",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "revision",
    outputs: [{ name: "", internalType: "uint64", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "route",
    outputs: [
      {
        name: "",
        internalType: "struct BuybackTypes.TypedRoute",
        type: "tuple",
        components: [
          {
            name: "pools",
            internalType: "struct PoolKey[]",
            type: "tuple[]",
            components: [
              { name: "currency0", internalType: "Currency", type: "address" },
              { name: "currency1", internalType: "Currency", type: "address" },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
            ],
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "asset", internalType: "address", type: "address" },
      { name: "paused", internalType: "bool", type: "bool" },
    ],
    name: "setAssetBuybacksPaused",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "paused", internalType: "bool", type: "bool" }],
    name: "setBuybacksPaused",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "globalInterval", internalType: "uint64", type: "uint64" },
      { name: "assets", internalType: "address[]", type: "address[]" },
      {
        name: "limits_",
        internalType: "struct BuybackTypes.ExecutionLimits[]",
        type: "tuple[]",
        components: [
          { name: "minInput", internalType: "uint128", type: "uint128" },
          { name: "maxInput", internalType: "uint128", type: "uint128" },
          { name: "minInterval", internalType: "uint64", type: "uint64" },
        ],
      },
    ],
    name: "setExecutionLimits",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "minInterval", internalType: "uint64", type: "uint64" }],
    name: "setGlobalMinInterval",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "asset", internalType: "address", type: "address" },
      {
        name: "limits_",
        internalType: "struct BuybackTypes.ExecutionLimits",
        type: "tuple",
        components: [
          { name: "minInput", internalType: "uint128", type: "uint128" },
          { name: "maxInput", internalType: "uint128", type: "uint128" },
          { name: "minInterval", internalType: "uint64", type: "uint64" },
        ],
      },
    ],
    name: "setLimits",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "asset", internalType: "address", type: "address" },
      {
        name: "route_",
        internalType: "struct BuybackTypes.TypedRoute",
        type: "tuple",
        components: [
          {
            name: "pools",
            internalType: "struct PoolKey[]",
            type: "tuple[]",
            components: [
              { name: "currency0", internalType: "Currency", type: "address" },
              { name: "currency1", internalType: "Currency", type: "address" },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
            ],
          },
        ],
      },
    ],
    name: "setRoute",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "settlementSequence",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "asset", internalType: "address", type: "address" }],
    name: "syncDonation",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      { name: "paused", internalType: "bool", type: "bool", indexed: false },
    ],
    name: "AssetBuybacksPaused",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "sequence",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
        indexed: true,
      },
      {
        name: "input",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "inputSpent",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "burned",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "lifecycle",
        internalType: "enum BuybackTypes.Lifecycle",
        type: "uint8",
        indexed: false,
      },
      {
        name: "revision",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "BuybackBurned",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "paused", internalType: "bool", type: "bool", indexed: false },
    ],
    name: "BuybacksPaused",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "sequence",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
        indexed: true,
      },
      {
        name: "input",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "output",
        internalType: "address",
        type: "address",
        indexed: false,
      },
      {
        name: "spent",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "received",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
      {
        name: "revision",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "ConversionSettled",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "sequence",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
      {
        name: "bucket",
        internalType: "enum BuybackTypes.SourceBucket",
        type: "uint8",
        indexed: true,
      },
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "DirectBurned",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "DonationRecorded",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tier", internalType: "address", type: "address", indexed: true },
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "amount",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "EarnedFeesReceived",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "minInterval",
        internalType: "uint64",
        type: "uint64",
        indexed: false,
      },
    ],
    name: "GlobalIntervalConfigured",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "revision",
        internalType: "uint64",
        type: "uint64",
        indexed: true,
      },
      {
        name: "limits",
        internalType: "struct BuybackTypes.ExecutionLimits",
        type: "tuple",
        components: [
          { name: "minInput", internalType: "uint128", type: "uint128" },
          { name: "maxInput", internalType: "uint128", type: "uint128" },
          { name: "minInterval", internalType: "uint64", type: "uint64" },
        ],
        indexed: false,
      },
    ],
    name: "LimitsConfigured",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "token",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "executor",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "ProtocolTokenBound",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "asset",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "revision",
        internalType: "uint64",
        type: "uint64",
        indexed: true,
      },
      {
        name: "route",
        internalType: "struct BuybackTypes.TypedRoute",
        type: "tuple",
        components: [
          {
            name: "pools",
            internalType: "struct PoolKey[]",
            type: "tuple[]",
            components: [
              { name: "currency0", internalType: "Currency", type: "address" },
              { name: "currency1", internalType: "Currency", type: "address" },
              { name: "fee", internalType: "uint24", type: "uint24" },
              { name: "tickSpacing", internalType: "int24", type: "int24" },
              {
                name: "hooks",
                internalType: "contract IHooks",
                type: "address",
              },
            ],
          },
        ],
        indexed: false,
      },
    ],
    name: "RouteConfigured",
  },
  { type: "error", inputs: [], name: "DeadlineExpired" },
  { type: "error", inputs: [], name: "ExecutorCreationCodeCorrupted" },
  { type: "error", inputs: [], name: "ExecutorDeploymentFailed" },
  { type: "error", inputs: [], name: "InexactSettlement" },
  { type: "error", inputs: [], name: "InsufficientBacking" },
  { type: "error", inputs: [], name: "InvalidAddress" },
  { type: "error", inputs: [], name: "InvalidAmount" },
  { type: "error", inputs: [], name: "InvalidAsset" },
  { type: "error", inputs: [], name: "InvalidLimits" },
  { type: "error", inputs: [], name: "InvalidRoute" },
  { type: "error", inputs: [], name: "OnlyFactoryDeployment" },
  { type: "error", inputs: [], name: "OnlyProtocolAuthority" },
  { type: "error", inputs: [], name: "OnlyRegisteredTier" },
  {
    type: "error",
    inputs: [
      {
        name: "status",
        internalType: "enum BuybackTypes.Status",
        type: "uint8",
      },
    ],
    name: "ProcessingUnavailable",
  },
  { type: "error", inputs: [], name: "ProtocolTokenAlreadyBound" },
  { type: "error", inputs: [], name: "ProtocolTokenNotLaunched" },
  { type: "error", inputs: [], name: "ReentrancyGuardReentrantCall" },
  {
    type: "error",
    inputs: [
      { name: "bits", internalType: "uint8", type: "uint8" },
      { name: "value", internalType: "uint256", type: "uint256" },
    ],
    name: "SafeCastOverflowedUintDowncast",
  },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "SafeERC20FailedOperation",
  },
  { type: "error", inputs: [], name: "StaleRevision" },
  { type: "error", inputs: [], name: "ZeroAmount" },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// RendererPreviewHarness
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const rendererPreviewHarnessAbi = [
  {
    type: "function",
    inputs: [],
    name: "MAX_FAILURE_REASON_BYTES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "creationCode", internalType: "bytes", type: "bytes" },
      { name: "rendererCallData", internalType: "bytes", type: "bytes" },
    ],
    name: "preview",
    outputs: [{ name: "rendererResult", internalType: "bytes", type: "bytes" }],
    stateMutability: "nonpayable",
  },
  {
    type: "error",
    inputs: [{ name: "reason", internalType: "bytes", type: "bytes" }],
    name: "CandidateCallFailed",
  },
  { type: "error", inputs: [], name: "CandidateDeploymentFailed" },
  { type: "error", inputs: [], name: "EmptyCallData" },
  { type: "error", inputs: [], name: "EmptyCreationCode" },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// RendererRegistry
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const rendererRegistryAbi = [
  {
    type: "function",
    inputs: [{ name: "owner", internalType: "address", type: "address" }],
    name: "createdRendererCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "limit", internalType: "uint256", type: "uint256" },
    ],
    name: "createdRenderers",
    outputs: [{ name: "page", internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "creatorCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "renderer", internalType: "address", type: "address" }],
    name: "creatorOf",
    outputs: [{ name: "creator", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "limit", internalType: "uint256", type: "uint256" },
    ],
    name: "creators",
    outputs: [{ name: "page", internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "initCode", internalType: "bytes", type: "bytes" }],
    name: "deployAndRegister",
    outputs: [{ name: "renderer", internalType: "address", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "creator", internalType: "address", type: "address" }],
    name: "isCreator",
    outputs: [{ name: "known", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxInitCodeBytes",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "maxPageSize",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "renderer", internalType: "address", type: "address" }],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "renderer", internalType: "address", type: "address" },
    ],
    name: "registrationKind",
    outputs: [
      {
        name: "kind",
        internalType: "enum IRendererRegistry.RegistrationKind",
        type: "uint8",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "rendererSchema",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "owner", internalType: "address", type: "address" }],
    name: "savedRendererCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "offset", internalType: "uint256", type: "uint256" },
      { name: "limit", internalType: "uint256", type: "uint256" },
    ],
    name: "savedRenderers",
    outputs: [{ name: "page", internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "renderer", internalType: "address", type: "address" }],
    name: "unregister",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "creator",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "creatorIndex",
        internalType: "uint256",
        type: "uint256",
        indexed: true,
      },
    ],
    name: "CreatorAdded",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "creator",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "renderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "initCodeHash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "createdIndex",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "RendererDeployed",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "renderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "kind",
        internalType: "enum IRendererRegistry.RegistrationKind",
        type: "uint8",
        indexed: true,
      },
      {
        name: "index",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "RendererRegistered",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "owner",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "renderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "kind",
        internalType: "enum IRendererRegistry.RegistrationKind",
        type: "uint8",
        indexed: true,
      },
    ],
    name: "RendererUnregistered",
  },
  { type: "error", inputs: [], name: "DeploymentFailed" },
  {
    type: "error",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "renderer", internalType: "address", type: "address" },
    ],
    name: "DuplicateRegistration",
  },
  { type: "error", inputs: [], name: "EmptyInitCode" },
  {
    type: "error",
    inputs: [
      { name: "maximum", internalType: "uint256", type: "uint256" },
      { name: "actual", internalType: "uint256", type: "uint256" },
    ],
    name: "InitCodeTooLarge",
  },
  {
    type: "error",
    inputs: [
      { name: "maximum", internalType: "uint256", type: "uint256" },
      { name: "actual", internalType: "uint256", type: "uint256" },
    ],
    name: "InvalidPageSize",
  },
  {
    type: "error",
    inputs: [{ name: "renderer", internalType: "address", type: "address" }],
    name: "InvalidRenderer",
  },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "InvalidRendererSchema",
  },
  { type: "error", inputs: [], name: "ReentrancyGuardReentrantCall" },
  {
    type: "error",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "renderer", internalType: "address", type: "address" },
    ],
    name: "RendererNotRegistered",
  },
] as const;

/**
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const rendererRegistryAddress = {
  46630: "0x4d421062e1Af4AB12e4f65ba475F169f633d745A",
} as const;

/**
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const rendererRegistryConfig = {
  address: rendererRegistryAddress,
  abi: rendererRegistryAbi,
} as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// USDG
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const usdgAbi = [
  {
    type: "event",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
    name: "Approval",
  },
  {
    type: "event",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
    name: "Transfer",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "name",
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "symbol",
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// React
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ierc165Abi}__
 */
export const useReadIerc165 = /*#__PURE__*/ createUseReadContract({
  abi: ierc165Abi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ierc165Abi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadIerc165SupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: ierc165Abi,
    functionName: "supportsInterface",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__
 */
export const useReadIPonsBondingCurve = /*#__PURE__*/ createUseReadContract({
  abi: iPonsBondingCurveAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"buybackBurnBps"`
 */
export const useReadIPonsBondingCurveBuybackBurnBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "buybackBurnBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"buybackEnabled"`
 */
export const useReadIPonsBondingCurveBuybackEnabled =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "buybackEnabled",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"buybackQuoteBalance"`
 */
export const useReadIPonsBondingCurveBuybackQuoteBalance =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "buybackQuoteBalance",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"buybackVault"`
 */
export const useReadIPonsBondingCurveBuybackVault =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "buybackVault",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"creatorTaxBalance"`
 */
export const useReadIPonsBondingCurveCreatorTaxBalance =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "creatorTaxBalance",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"creatorTaxBps"`
 */
export const useReadIPonsBondingCurveCreatorTaxBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "creatorTaxBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"currentSnipeTaxBps"`
 */
export const useReadIPonsBondingCurveCurrentSnipeTaxBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "currentSnipeTaxBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"deployer"`
 */
export const useReadIPonsBondingCurveDeployer =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "deployer",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"factory"`
 */
export const useReadIPonsBondingCurveFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "factory",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"feeBps"`
 */
export const useReadIPonsBondingCurveFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "feeBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"feeEscrow"`
 */
export const useReadIPonsBondingCurveFeeEscrow =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "feeEscrow",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"feePolicy"`
 */
export const useReadIPonsBondingCurveFeePolicy =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "feePolicy",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"graduated"`
 */
export const useReadIPonsBondingCurveGraduated =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "graduated",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"graduationThreshold"`
 */
export const useReadIPonsBondingCurveGraduationThreshold =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "graduationThreshold",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"launchSupply"`
 */
export const useReadIPonsBondingCurveLaunchSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "launchSupply",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"launchedAt"`
 */
export const useReadIPonsBondingCurveLaunchedAt =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "launchedAt",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"maxInternalPriceImpactBps"`
 */
export const useReadIPonsBondingCurveMaxInternalPriceImpactBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "maxInternalPriceImpactBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"pairToken"`
 */
export const useReadIPonsBondingCurvePairToken =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "pairToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"phantomQuote"`
 */
export const useReadIPonsBondingCurvePhantomQuote =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "phantomQuote",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"protocolFeeRecipient"`
 */
export const useReadIPonsBondingCurveProtocolFeeRecipient =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "protocolFeeRecipient",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"protocolFeeShareBps"`
 */
export const useReadIPonsBondingCurveProtocolFeeShareBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "protocolFeeShareBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"quoteFeeBalance"`
 */
export const useReadIPonsBondingCurveQuoteFeeBalance =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "quoteFeeBalance",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"quoteReserve"`
 */
export const useReadIPonsBondingCurveQuoteReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "quoteReserve",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"readyToGraduate"`
 */
export const useReadIPonsBondingCurveReadyToGraduate =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "readyToGraduate",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"realQuoteReserve"`
 */
export const useReadIPonsBondingCurveRealQuoteReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "realQuoteReserve",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"reservedTokens"`
 */
export const useReadIPonsBondingCurveReservedTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "reservedTokens",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"sellableTokens"`
 */
export const useReadIPonsBondingCurveSellableTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "sellableTokens",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"snipeTaxSeconds"`
 */
export const useReadIPonsBondingCurveSnipeTaxSeconds =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "snipeTaxSeconds",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"token"`
 */
export const useReadIPonsBondingCurveToken =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "token",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"tokenReserve"`
 */
export const useReadIPonsBondingCurveTokenReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBondingCurveAbi,
    functionName: "tokenReserve",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__
 */
export const useWriteIPonsBondingCurve = /*#__PURE__*/ createUseWriteContract({
  abi: iPonsBondingCurveAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"buy"`
 */
export const useWriteIPonsBondingCurveBuy =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsBondingCurveAbi,
    functionName: "buy",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"graduate"`
 */
export const useWriteIPonsBondingCurveGraduate =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsBondingCurveAbi,
    functionName: "graduate",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"sell"`
 */
export const useWriteIPonsBondingCurveSell =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsBondingCurveAbi,
    functionName: "sell",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"sweepFees"`
 */
export const useWriteIPonsBondingCurveSweepFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsBondingCurveAbi,
    functionName: "sweepFees",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__
 */
export const useSimulateIPonsBondingCurve =
  /*#__PURE__*/ createUseSimulateContract({ abi: iPonsBondingCurveAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"buy"`
 */
export const useSimulateIPonsBondingCurveBuy =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsBondingCurveAbi,
    functionName: "buy",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"graduate"`
 */
export const useSimulateIPonsBondingCurveGraduate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsBondingCurveAbi,
    functionName: "graduate",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"sell"`
 */
export const useSimulateIPonsBondingCurveSell =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsBondingCurveAbi,
    functionName: "sell",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsBondingCurveAbi}__ and `functionName` set to `"sweepFees"`
 */
export const useSimulateIPonsBondingCurveSweepFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsBondingCurveAbi,
    functionName: "sweepFees",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__
 */
export const useReadIPonsBuybackVault = /*#__PURE__*/ createUseReadContract({
  abi: iPonsBuybackVaultAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"VESTING_DURATION"`
 */
export const useReadIPonsBuybackVaultVestingDuration =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "VESTING_DURATION",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"factory"`
 */
export const useReadIPonsBuybackVaultFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "factory",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"feeEscrow"`
 */
export const useReadIPonsBuybackVaultFeeEscrow =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "feeEscrow",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"feePolicy"`
 */
export const useReadIPonsBuybackVaultFeePolicy =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "feePolicy",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"releasable"`
 */
export const useReadIPonsBuybackVaultReleasable =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "releasable",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"totalLocked"`
 */
export const useReadIPonsBuybackVaultTotalLocked =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "totalLocked",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"totalReleased"`
 */
export const useReadIPonsBuybackVaultTotalReleased =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "totalReleased",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"vestedAmount"`
 */
export const useReadIPonsBuybackVaultVestedAmount =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "vestedAmount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"vestingStart"`
 */
export const useReadIPonsBuybackVaultVestingStart =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "vestingStart",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"vestingTerms"`
 */
export const useReadIPonsBuybackVaultVestingTerms =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "vestingTerms",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__
 */
export const useWriteIPonsBuybackVault = /*#__PURE__*/ createUseWriteContract({
  abi: iPonsBuybackVaultAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"release"`
 */
export const useWriteIPonsBuybackVaultRelease =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "release",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__
 */
export const useSimulateIPonsBuybackVault =
  /*#__PURE__*/ createUseSimulateContract({ abi: iPonsBuybackVaultAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `functionName` set to `"release"`
 */
export const useSimulateIPonsBuybackVaultRelease =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsBuybackVaultAbi,
    functionName: "release",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__
 */
export const useWatchIPonsBuybackVaultEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: iPonsBuybackVaultAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `eventName` set to `"CreatorRecipientUpdated"`
 */
export const useWatchIPonsBuybackVaultCreatorRecipientUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsBuybackVaultAbi,
    eventName: "CreatorRecipientUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `eventName` set to `"Locked"`
 */
export const useWatchIPonsBuybackVaultLockedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsBuybackVaultAbi,
    eventName: "Locked",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsBuybackVaultAbi}__ and `eventName` set to `"Released"`
 */
export const useWatchIPonsBuybackVaultReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsBuybackVaultAbi,
    eventName: "Released",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__
 */
export const useReadIPonsFeeEscrow = /*#__PURE__*/ createUseReadContract({
  abi: iPonsFeeEscrowAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadIPonsFeeEscrowBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "balanceOf",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"balanceOfToken"`
 */
export const useReadIPonsFeeEscrowBalanceOfToken =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "balanceOfToken",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__
 */
export const useWriteIPonsFeeEscrow = /*#__PURE__*/ createUseWriteContract({
  abi: iPonsFeeEscrowAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"claim"`
 */
export const useWriteIPonsFeeEscrowClaim = /*#__PURE__*/ createUseWriteContract(
  { abi: iPonsFeeEscrowAbi, functionName: "claim" },
);

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"claimToken"`
 */
export const useWriteIPonsFeeEscrowClaimToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "claimToken",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"credit"`
 */
export const useWriteIPonsFeeEscrowCredit =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "credit",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"creditToken"`
 */
export const useWriteIPonsFeeEscrowCreditToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "creditToken",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__
 */
export const useSimulateIPonsFeeEscrow =
  /*#__PURE__*/ createUseSimulateContract({ abi: iPonsFeeEscrowAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"claim"`
 */
export const useSimulateIPonsFeeEscrowClaim =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "claim",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"claimToken"`
 */
export const useSimulateIPonsFeeEscrowClaimToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "claimToken",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"credit"`
 */
export const useSimulateIPonsFeeEscrowCredit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "credit",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `functionName` set to `"creditToken"`
 */
export const useSimulateIPonsFeeEscrowCreditToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsFeeEscrowAbi,
    functionName: "creditToken",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__
 */
export const useWatchIPonsFeeEscrowEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: iPonsFeeEscrowAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `eventName` set to `"Claimed"`
 */
export const useWatchIPonsFeeEscrowClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsFeeEscrowAbi,
    eventName: "Claimed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `eventName` set to `"ClaimedToken"`
 */
export const useWatchIPonsFeeEscrowClaimedTokenEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsFeeEscrowAbi,
    eventName: "ClaimedToken",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `eventName` set to `"Credited"`
 */
export const useWatchIPonsFeeEscrowCreditedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsFeeEscrowAbi,
    eventName: "Credited",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsFeeEscrowAbi}__ and `eventName` set to `"CreditedToken"`
 */
export const useWatchIPonsFeeEscrowCreditedTokenEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsFeeEscrowAbi,
    eventName: "CreditedToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__
 */
export const useReadIPonsLaunchFactory = /*#__PURE__*/ createUseReadContract({
  abi: iPonsLaunchFactoryAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"buybackVault"`
 */
export const useReadIPonsLaunchFactoryBuybackVault =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "buybackVault",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"canLaunch"`
 */
export const useReadIPonsLaunchFactoryCanLaunch =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "canLaunch",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"feeEscrow"`
 */
export const useReadIPonsLaunchFactoryFeeEscrow =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "feeEscrow",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"getLaunchConfig"`
 */
export const useReadIPonsLaunchFactoryGetLaunchConfig =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "getLaunchConfig",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"getLaunchedToken"`
 */
export const useReadIPonsLaunchFactoryGetLaunchedToken =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "getLaunchedToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"graduationExecutor"`
 */
export const useReadIPonsLaunchFactoryGraduationExecutor =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "graduationExecutor",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"graduationGuard"`
 */
export const useReadIPonsLaunchFactoryGraduationGuard =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "graduationGuard",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"launchConfigCount"`
 */
export const useReadIPonsLaunchFactoryLaunchConfigCount =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "launchConfigCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"launchDeployer"`
 */
export const useReadIPonsLaunchFactoryLaunchDeployer =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "launchDeployer",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"launchEnabled"`
 */
export const useReadIPonsLaunchFactoryLaunchEnabled =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "launchEnabled",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"launchFee"`
 */
export const useReadIPonsLaunchFactoryLaunchFee =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "launchFee",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"launchForwarder"`
 */
export const useReadIPonsLaunchFactoryLaunchForwarder =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "launchForwarder",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"locker"`
 */
export const useReadIPonsLaunchFactoryLocker =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "locker",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"memeHook"`
 */
export const useReadIPonsLaunchFactoryMemeHook =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "memeHook",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadIPonsLaunchFactoryOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "owner",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"pendingCreatorFeeRecipient"`
 */
export const useReadIPonsLaunchFactoryPendingCreatorFeeRecipient =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "pendingCreatorFeeRecipient",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"permit2"`
 */
export const useReadIPonsLaunchFactoryPermit2 =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "permit2",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"poolManager"`
 */
export const useReadIPonsLaunchFactoryPoolManager =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "poolManager",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"positionManager"`
 */
export const useReadIPonsLaunchFactoryPositionManager =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "positionManager",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"previewLaunchEconomics"`
 */
export const useReadIPonsLaunchFactoryPreviewLaunchEconomics =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "previewLaunchEconomics",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"snipeTaxSeconds"`
 */
export const useReadIPonsLaunchFactorySnipeTaxSeconds =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "snipeTaxSeconds",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"snipeTaxStartBps"`
 */
export const useReadIPonsLaunchFactorySnipeTaxStartBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "snipeTaxStartBps",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__
 */
export const useWriteIPonsLaunchFactory = /*#__PURE__*/ createUseWriteContract({
  abi: iPonsLaunchFactoryAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"createGraduatedPool"`
 */
export const useWriteIPonsLaunchFactoryCreateGraduatedPool =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "createGraduatedPool",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"executeCreatorFeeRecipientChange"`
 */
export const useWriteIPonsLaunchFactoryExecuteCreatorFeeRecipientChange =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "executeCreatorFeeRecipientChange",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"graduate"`
 */
export const useWriteIPonsLaunchFactoryGraduate =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "graduate",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"launchToken"`
 */
export const useWriteIPonsLaunchFactoryLaunchToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "launchToken",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"setBuybackEnabled"`
 */
export const useWriteIPonsLaunchFactorySetBuybackEnabled =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "setBuybackEnabled",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"setCreatorFeeRecipient"`
 */
export const useWriteIPonsLaunchFactorySetCreatorFeeRecipient =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "setCreatorFeeRecipient",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"transferCreatorFeeRecipient"`
 */
export const useWriteIPonsLaunchFactoryTransferCreatorFeeRecipient =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "transferCreatorFeeRecipient",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__
 */
export const useSimulateIPonsLaunchFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: iPonsLaunchFactoryAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"createGraduatedPool"`
 */
export const useSimulateIPonsLaunchFactoryCreateGraduatedPool =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "createGraduatedPool",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"executeCreatorFeeRecipientChange"`
 */
export const useSimulateIPonsLaunchFactoryExecuteCreatorFeeRecipientChange =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "executeCreatorFeeRecipientChange",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"graduate"`
 */
export const useSimulateIPonsLaunchFactoryGraduate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "graduate",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"launchToken"`
 */
export const useSimulateIPonsLaunchFactoryLaunchToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "launchToken",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"setBuybackEnabled"`
 */
export const useSimulateIPonsLaunchFactorySetBuybackEnabled =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "setBuybackEnabled",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"setCreatorFeeRecipient"`
 */
export const useSimulateIPonsLaunchFactorySetCreatorFeeRecipient =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "setCreatorFeeRecipient",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `functionName` set to `"transferCreatorFeeRecipient"`
 */
export const useSimulateIPonsLaunchFactoryTransferCreatorFeeRecipient =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLaunchFactoryAbi,
    functionName: "transferCreatorFeeRecipient",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__
 */
export const useWatchIPonsLaunchFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: iPonsLaunchFactoryAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `eventName` set to `"BuybackEnabledUpdated"`
 */
export const useWatchIPonsLaunchFactoryBuybackEnabledUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsLaunchFactoryAbi,
    eventName: "BuybackEnabledUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `eventName` set to `"CreatorFeeRecipientChangeCancelled"`
 */
export const useWatchIPonsLaunchFactoryCreatorFeeRecipientChangeCancelledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsLaunchFactoryAbi,
    eventName: "CreatorFeeRecipientChangeCancelled",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `eventName` set to `"CreatorFeeRecipientChangeProposed"`
 */
export const useWatchIPonsLaunchFactoryCreatorFeeRecipientChangeProposedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsLaunchFactoryAbi,
    eventName: "CreatorFeeRecipientChangeProposed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `eventName` set to `"CreatorFeeRecipientUpdated"`
 */
export const useWatchIPonsLaunchFactoryCreatorFeeRecipientUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsLaunchFactoryAbi,
    eventName: "CreatorFeeRecipientUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `eventName` set to `"LaunchSwept"`
 */
export const useWatchIPonsLaunchFactoryLaunchSweptEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsLaunchFactoryAbi,
    eventName: "LaunchSwept",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `eventName` set to `"PoolGraduated"`
 */
export const useWatchIPonsLaunchFactoryPoolGraduatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsLaunchFactoryAbi,
    eventName: "PoolGraduated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPonsLaunchFactoryAbi}__ and `eventName` set to `"TokenLaunched"`
 */
export const useWatchIPonsLaunchFactoryTokenLaunchedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPonsLaunchFactoryAbi,
    eventName: "TokenLaunched",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__
 */
export const useReadIPonsLauncherToken = /*#__PURE__*/ createUseReadContract({
  abi: iPonsLauncherTokenAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__ and `functionName` set to `"curve"`
 */
export const useReadIPonsLauncherTokenCurve =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLauncherTokenAbi,
    functionName: "curve",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__ and `functionName` set to `"deployer"`
 */
export const useReadIPonsLauncherTokenDeployer =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLauncherTokenAbi,
    functionName: "deployer",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__ and `functionName` set to `"launchFactory"`
 */
export const useReadIPonsLauncherTokenLaunchFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsLauncherTokenAbi,
    functionName: "launchFactory",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__
 */
export const useWriteIPonsLauncherToken = /*#__PURE__*/ createUseWriteContract({
  abi: iPonsLauncherTokenAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteIPonsLauncherTokenBurn =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsLauncherTokenAbi,
    functionName: "burn",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__
 */
export const useSimulateIPonsLauncherToken =
  /*#__PURE__*/ createUseSimulateContract({ abi: iPonsLauncherTokenAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsLauncherTokenAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateIPonsLauncherTokenBurn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsLauncherTokenAbi,
    functionName: "burn",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__
 */
export const useReadIPonsMemeHook = /*#__PURE__*/ createUseReadContract({
  abi: iPonsMemeHookAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"buybackBurnBps"`
 */
export const useReadIPonsMemeHookBuybackBurnBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "buybackBurnBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"buybackVault"`
 */
export const useReadIPonsMemeHookBuybackVault =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "buybackVault",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"currentFeePolicy"`
 */
export const useReadIPonsMemeHookCurrentFeePolicy =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "currentFeePolicy",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"factory"`
 */
export const useReadIPonsMemeHookFactory = /*#__PURE__*/ createUseReadContract({
  abi: iPonsMemeHookAbi,
  functionName: "factory",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"feeEscrow"`
 */
export const useReadIPonsMemeHookFeeEscrow =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "feeEscrow",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"feeSweepOperator"`
 */
export const useReadIPonsMemeHookFeeSweepOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "feeSweepOperator",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"hookFeeBps"`
 */
export const useReadIPonsMemeHookHookFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "hookFeeBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"maxInternalPriceImpactBps"`
 */
export const useReadIPonsMemeHookMaxInternalPriceImpactBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "maxInternalPriceImpactBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"pendingBuyback"`
 */
export const useReadIPonsMemeHookPendingBuyback =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "pendingBuyback",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"pendingCreatorTax"`
 */
export const useReadIPonsMemeHookPendingCreatorTax =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "pendingCreatorTax",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"pendingFees"`
 */
export const useReadIPonsMemeHookPendingFees =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "pendingFees",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"poolManager"`
 */
export const useReadIPonsMemeHookPoolManager =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "poolManager",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"protocolFeeRecipient"`
 */
export const useReadIPonsMemeHookProtocolFeeRecipient =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "protocolFeeRecipient",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"protocolFeeShareBps"`
 */
export const useReadIPonsMemeHookProtocolFeeShareBps =
  /*#__PURE__*/ createUseReadContract({
    abi: iPonsMemeHookAbi,
    functionName: "protocolFeeShareBps",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__
 */
export const useWriteIPonsMemeHook = /*#__PURE__*/ createUseWriteContract({
  abi: iPonsMemeHookAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"sweepPoolFees"`
 */
export const useWriteIPonsMemeHookSweepPoolFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPonsMemeHookAbi,
    functionName: "sweepPoolFees",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__
 */
export const useSimulateIPonsMemeHook = /*#__PURE__*/ createUseSimulateContract(
  { abi: iPonsMemeHookAbi },
);

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPonsMemeHookAbi}__ and `functionName` set to `"sweepPoolFees"`
 */
export const useSimulateIPonsMemeHookSweepPoolFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPonsMemeHookAbi,
    functionName: "sweepPoolFees",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__
 */
export const useReadIPoolManager = /*#__PURE__*/ createUseReadContract({
  abi: iPoolManagerAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadIPoolManagerAllowance = /*#__PURE__*/ createUseReadContract(
  { abi: iPoolManagerAbi, functionName: "allowance" },
);

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadIPoolManagerBalanceOf = /*#__PURE__*/ createUseReadContract(
  { abi: iPoolManagerAbi, functionName: "balanceOf" },
);

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"extsload"`
 */
export const useReadIPoolManagerExtsload = /*#__PURE__*/ createUseReadContract({
  abi: iPoolManagerAbi,
  functionName: "extsload",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"exttload"`
 */
export const useReadIPoolManagerExttload = /*#__PURE__*/ createUseReadContract({
  abi: iPoolManagerAbi,
  functionName: "exttload",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"isOperator"`
 */
export const useReadIPoolManagerIsOperator =
  /*#__PURE__*/ createUseReadContract({
    abi: iPoolManagerAbi,
    functionName: "isOperator",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"protocolFeeController"`
 */
export const useReadIPoolManagerProtocolFeeController =
  /*#__PURE__*/ createUseReadContract({
    abi: iPoolManagerAbi,
    functionName: "protocolFeeController",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"protocolFeesAccrued"`
 */
export const useReadIPoolManagerProtocolFeesAccrued =
  /*#__PURE__*/ createUseReadContract({
    abi: iPoolManagerAbi,
    functionName: "protocolFeesAccrued",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__
 */
export const useWriteIPoolManager = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteIPoolManagerApprove = /*#__PURE__*/ createUseWriteContract(
  { abi: iPoolManagerAbi, functionName: "approve" },
);

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteIPoolManagerBurn = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "burn",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"clear"`
 */
export const useWriteIPoolManagerClear = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "clear",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"collectProtocolFees"`
 */
export const useWriteIPoolManagerCollectProtocolFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "collectProtocolFees",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"donate"`
 */
export const useWriteIPoolManagerDonate = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "donate",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"initialize"`
 */
export const useWriteIPoolManagerInitialize =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "initialize",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteIPoolManagerMint = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "mint",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"modifyLiquidity"`
 */
export const useWriteIPoolManagerModifyLiquidity =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "modifyLiquidity",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"setOperator"`
 */
export const useWriteIPoolManagerSetOperator =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "setOperator",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"setProtocolFee"`
 */
export const useWriteIPoolManagerSetProtocolFee =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "setProtocolFee",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"setProtocolFeeController"`
 */
export const useWriteIPoolManagerSetProtocolFeeController =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "setProtocolFeeController",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"settle"`
 */
export const useWriteIPoolManagerSettle = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "settle",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"settleFor"`
 */
export const useWriteIPoolManagerSettleFor =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "settleFor",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"swap"`
 */
export const useWriteIPoolManagerSwap = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "swap",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"sync"`
 */
export const useWriteIPoolManagerSync = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "sync",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"take"`
 */
export const useWriteIPoolManagerTake = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "take",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteIPoolManagerTransfer =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "transfer",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteIPoolManagerTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "transferFrom",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"unlock"`
 */
export const useWriteIPoolManagerUnlock = /*#__PURE__*/ createUseWriteContract({
  abi: iPoolManagerAbi,
  functionName: "unlock",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"updateDynamicLPFee"`
 */
export const useWriteIPoolManagerUpdateDynamicLpFee =
  /*#__PURE__*/ createUseWriteContract({
    abi: iPoolManagerAbi,
    functionName: "updateDynamicLPFee",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__
 */
export const useSimulateIPoolManager = /*#__PURE__*/ createUseSimulateContract({
  abi: iPoolManagerAbi,
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateIPoolManagerApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "approve",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateIPoolManagerBurn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "burn",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"clear"`
 */
export const useSimulateIPoolManagerClear =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "clear",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"collectProtocolFees"`
 */
export const useSimulateIPoolManagerCollectProtocolFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "collectProtocolFees",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"donate"`
 */
export const useSimulateIPoolManagerDonate =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "donate",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"initialize"`
 */
export const useSimulateIPoolManagerInitialize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "initialize",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateIPoolManagerMint =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "mint",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"modifyLiquidity"`
 */
export const useSimulateIPoolManagerModifyLiquidity =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "modifyLiquidity",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"setOperator"`
 */
export const useSimulateIPoolManagerSetOperator =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "setOperator",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"setProtocolFee"`
 */
export const useSimulateIPoolManagerSetProtocolFee =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "setProtocolFee",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"setProtocolFeeController"`
 */
export const useSimulateIPoolManagerSetProtocolFeeController =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "setProtocolFeeController",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"settle"`
 */
export const useSimulateIPoolManagerSettle =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "settle",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"settleFor"`
 */
export const useSimulateIPoolManagerSettleFor =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "settleFor",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"swap"`
 */
export const useSimulateIPoolManagerSwap =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "swap",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"sync"`
 */
export const useSimulateIPoolManagerSync =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "sync",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"take"`
 */
export const useSimulateIPoolManagerTake =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "take",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateIPoolManagerTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "transfer",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateIPoolManagerTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "transferFrom",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"unlock"`
 */
export const useSimulateIPoolManagerUnlock =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "unlock",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iPoolManagerAbi}__ and `functionName` set to `"updateDynamicLPFee"`
 */
export const useSimulateIPoolManagerUpdateDynamicLpFee =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iPoolManagerAbi,
    functionName: "updateDynamicLPFee",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__
 */
export const useWatchIPoolManagerEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: iPoolManagerAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchIPoolManagerApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "Approval",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"Donate"`
 */
export const useWatchIPoolManagerDonateEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "Donate",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"Initialize"`
 */
export const useWatchIPoolManagerInitializeEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "Initialize",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"ModifyLiquidity"`
 */
export const useWatchIPoolManagerModifyLiquidityEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "ModifyLiquidity",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"OperatorSet"`
 */
export const useWatchIPoolManagerOperatorSetEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "OperatorSet",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"ProtocolFeeControllerUpdated"`
 */
export const useWatchIPoolManagerProtocolFeeControllerUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "ProtocolFeeControllerUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"ProtocolFeeUpdated"`
 */
export const useWatchIPoolManagerProtocolFeeUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "ProtocolFeeUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"Swap"`
 */
export const useWatchIPoolManagerSwapEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "Swap",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iPoolManagerAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchIPoolManagerTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iPoolManagerAbi,
    eventName: "Transfer",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__
 */
export const useReadISafe = /*#__PURE__*/ createUseReadContract({
  abi: iSafeAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"VERSION"`
 */
export const useReadISafeVersion = /*#__PURE__*/ createUseReadContract({
  abi: iSafeAbi,
  functionName: "VERSION",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"getModulesPaginated"`
 */
export const useReadISafeGetModulesPaginated =
  /*#__PURE__*/ createUseReadContract({
    abi: iSafeAbi,
    functionName: "getModulesPaginated",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"getOwners"`
 */
export const useReadISafeGetOwners = /*#__PURE__*/ createUseReadContract({
  abi: iSafeAbi,
  functionName: "getOwners",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"getStorageAt"`
 */
export const useReadISafeGetStorageAt = /*#__PURE__*/ createUseReadContract({
  abi: iSafeAbi,
  functionName: "getStorageAt",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"getThreshold"`
 */
export const useReadISafeGetThreshold = /*#__PURE__*/ createUseReadContract({
  abi: iSafeAbi,
  functionName: "getThreshold",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"getTransactionHash"`
 */
export const useReadISafeGetTransactionHash =
  /*#__PURE__*/ createUseReadContract({
    abi: iSafeAbi,
    functionName: "getTransactionHash",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"masterCopy"`
 */
export const useReadISafeMasterCopy = /*#__PURE__*/ createUseReadContract({
  abi: iSafeAbi,
  functionName: "masterCopy",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"nonce"`
 */
export const useReadISafeNonce = /*#__PURE__*/ createUseReadContract({
  abi: iSafeAbi,
  functionName: "nonce",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iSafeAbi}__
 */
export const useWriteISafe = /*#__PURE__*/ createUseWriteContract({
  abi: iSafeAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"execTransaction"`
 */
export const useWriteISafeExecTransaction =
  /*#__PURE__*/ createUseWriteContract({
    abi: iSafeAbi,
    functionName: "execTransaction",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"swapOwner"`
 */
export const useWriteISafeSwapOwner = /*#__PURE__*/ createUseWriteContract({
  abi: iSafeAbi,
  functionName: "swapOwner",
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iSafeAbi}__
 */
export const useSimulateISafe = /*#__PURE__*/ createUseSimulateContract({
  abi: iSafeAbi,
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"execTransaction"`
 */
export const useSimulateISafeExecTransaction =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iSafeAbi,
    functionName: "execTransaction",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iSafeAbi}__ and `functionName` set to `"swapOwner"`
 */
export const useSimulateISafeSwapOwner =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iSafeAbi,
    functionName: "swapOwner",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iSafeAbi}__
 */
export const useWatchISafeEvent = /*#__PURE__*/ createUseWatchContractEvent({
  abi: iSafeAbi,
});

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iSafeAbi}__ and `eventName` set to `"ExecutionFailure"`
 */
export const useWatchISafeExecutionFailureEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iSafeAbi,
    eventName: "ExecutionFailure",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iSafeAbi}__ and `eventName` set to `"ExecutionSuccess"`
 */
export const useWatchISafeExecutionSuccessEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iSafeAbi,
    eventName: "ExecutionSuccess",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iScaledUiAmountAbi}__
 */
export const useReadIScaledUiAmount = /*#__PURE__*/ createUseReadContract({
  abi: iScaledUiAmountAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iScaledUiAmountAbi}__ and `functionName` set to `"uiMultiplier"`
 */
export const useReadIScaledUiAmountUiMultiplier =
  /*#__PURE__*/ createUseReadContract({
    abi: iScaledUiAmountAbi,
    functionName: "uiMultiplier",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iScaledUiAmountAbi}__
 */
export const useWatchIScaledUiAmountEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: iScaledUiAmountAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iScaledUiAmountAbi}__ and `eventName` set to `"TransferWithUIAmount"`
 */
export const useWatchIScaledUiAmountTransferWithUiAmountEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iScaledUiAmountAbi,
    eventName: "TransferWithUIAmount",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link iScaledUiAmountAbi}__ and `eventName` set to `"UIMultiplierUpdated"`
 */
export const useWatchIScaledUiAmountUiMultiplierUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: iScaledUiAmountAbi,
    eventName: "UIMultiplierUpdated",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iScaledUiAmountNewUiMultiplierAbi}__
 */
export const useReadIScaledUiAmountNewUiMultiplier =
  /*#__PURE__*/ createUseReadContract({
    abi: iScaledUiAmountNewUiMultiplierAbi,
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iScaledUiAmountNewUiMultiplierAbi}__ and `functionName` set to `"effectiveAt"`
 */
export const useReadIScaledUiAmountNewUiMultiplierEffectiveAt =
  /*#__PURE__*/ createUseReadContract({
    abi: iScaledUiAmountNewUiMultiplierAbi,
    functionName: "effectiveAt",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iScaledUiAmountNewUiMultiplierAbi}__ and `functionName` set to `"newUIMultiplier"`
 */
export const useReadIScaledUiAmountNewUiMultiplierNewUiMultiplier =
  /*#__PURE__*/ createUseReadContract({
    abi: iScaledUiAmountNewUiMultiplierAbi,
    functionName: "newUIMultiplier",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iv4QuoterAbi}__
 */
export const useReadIv4Quoter = /*#__PURE__*/ createUseReadContract({
  abi: iv4QuoterAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"msgSender"`
 */
export const useReadIv4QuoterMsgSender = /*#__PURE__*/ createUseReadContract({
  abi: iv4QuoterAbi,
  functionName: "msgSender",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"poolManager"`
 */
export const useReadIv4QuoterPoolManager = /*#__PURE__*/ createUseReadContract({
  abi: iv4QuoterAbi,
  functionName: "poolManager",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iv4QuoterAbi}__
 */
export const useWriteIv4Quoter = /*#__PURE__*/ createUseWriteContract({
  abi: iv4QuoterAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactInput"`
 */
export const useWriteIv4QuoterQuoteExactInput =
  /*#__PURE__*/ createUseWriteContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactInput",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactInputSingle"`
 */
export const useWriteIv4QuoterQuoteExactInputSingle =
  /*#__PURE__*/ createUseWriteContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactInputSingle",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactOutput"`
 */
export const useWriteIv4QuoterQuoteExactOutput =
  /*#__PURE__*/ createUseWriteContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactOutput",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactOutputSingle"`
 */
export const useWriteIv4QuoterQuoteExactOutputSingle =
  /*#__PURE__*/ createUseWriteContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactOutputSingle",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iv4QuoterAbi}__
 */
export const useSimulateIv4Quoter = /*#__PURE__*/ createUseSimulateContract({
  abi: iv4QuoterAbi,
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactInput"`
 */
export const useSimulateIv4QuoterQuoteExactInput =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactInput",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactInputSingle"`
 */
export const useSimulateIv4QuoterQuoteExactInputSingle =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactInputSingle",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactOutput"`
 */
export const useSimulateIv4QuoterQuoteExactOutput =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactOutput",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iv4QuoterAbi}__ and `functionName` set to `"quoteExactOutputSingle"`
 */
export const useSimulateIv4QuoterQuoteExactOutputSingle =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iv4QuoterAbi,
    functionName: "quoteExactOutputSingle",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iWrappedEtherAbi}__
 */
export const useWriteIWrappedEther = /*#__PURE__*/ createUseWriteContract({
  abi: iWrappedEtherAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iWrappedEtherAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteIWrappedEtherWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: iWrappedEtherAbi,
    functionName: "withdraw",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iWrappedEtherAbi}__
 */
export const useSimulateIWrappedEther = /*#__PURE__*/ createUseSimulateContract(
  { abi: iWrappedEtherAbi },
);

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iWrappedEtherAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateIWrappedEtherWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iWrappedEtherAbi,
    functionName: "withdraw",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iWrappedNativeAbi}__
 */
export const useWriteIWrappedNative = /*#__PURE__*/ createUseWriteContract({
  abi: iWrappedNativeAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iWrappedNativeAbi}__ and `functionName` set to `"deposit"`
 */
export const useWriteIWrappedNativeDeposit =
  /*#__PURE__*/ createUseWriteContract({
    abi: iWrappedNativeAbi,
    functionName: "deposit",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link iWrappedNativeAbi}__ and `functionName` set to `"withdraw"`
 */
export const useWriteIWrappedNativeWithdraw =
  /*#__PURE__*/ createUseWriteContract({
    abi: iWrappedNativeAbi,
    functionName: "withdraw",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iWrappedNativeAbi}__
 */
export const useSimulateIWrappedNative =
  /*#__PURE__*/ createUseSimulateContract({ abi: iWrappedNativeAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iWrappedNativeAbi}__ and `functionName` set to `"deposit"`
 */
export const useSimulateIWrappedNativeDeposit =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iWrappedNativeAbi,
    functionName: "deposit",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link iWrappedNativeAbi}__ and `functionName` set to `"withdraw"`
 */
export const useSimulateIWrappedNativeWithdraw =
  /*#__PURE__*/ createUseSimulateContract({
    abi: iWrappedNativeAbi,
    functionName: "withdraw",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__
 */
export const useReadMembershipFactory = /*#__PURE__*/ createUseReadContract({
  abi: membershipFactoryAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"burnRouter"`
 */
export const useReadMembershipFactoryBurnRouter =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "burnRouter",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"buybackVault"`
 */
export const useReadMembershipFactoryBuybackVault =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "buybackVault",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"deployer"`
 */
export const useReadMembershipFactoryDeployer =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "deployer",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"isPaymentTokenEnabled"`
 */
export const useReadMembershipFactoryIsPaymentTokenEnabled =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "isPaymentTokenEnabled",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"isPaymentTokenListed"`
 */
export const useReadMembershipFactoryIsPaymentTokenListed =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "isPaymentTokenListed",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"isRegisteredTier"`
 */
export const useReadMembershipFactoryIsRegisteredTier =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "isRegisteredTier",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"isTierSaltUsed"`
 */
export const useReadMembershipFactoryIsTierSaltUsed =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "isTierSaltUsed",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"maxPageSize"`
 */
export const useReadMembershipFactoryMaxPageSize =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "maxPageSize",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"mediaStoreFactory"`
 */
export const useReadMembershipFactoryMediaStoreFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "mediaStoreFactory",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"mediaStoreFactoryRuntimeCodehash"`
 */
export const useReadMembershipFactoryMediaStoreFactoryRuntimeCodehash =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "mediaStoreFactoryRuntimeCodehash",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadMembershipFactoryOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "owner",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"paymentTokenCount"`
 */
export const useReadMembershipFactoryPaymentTokenCount =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "paymentTokenCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"paymentTokens"`
 */
export const useReadMembershipFactoryPaymentTokens =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "paymentTokens",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadMembershipFactoryPendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "pendingOwner",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"predictTierIdentity"`
 */
export const useReadMembershipFactoryPredictTierIdentity =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "predictTierIdentity",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"protocolToken"`
 */
export const useReadMembershipFactoryProtocolToken =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "protocolToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"rendererSchema"`
 */
export const useReadMembershipFactoryRendererSchema =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "rendererSchema",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useReadMembershipFactoryRenounceOwnership =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "renounceOwnership",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"tierCount"`
 */
export const useReadMembershipFactoryTierCount =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "tierCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"tierForIdentity"`
 */
export const useReadMembershipFactoryTierForIdentity =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "tierForIdentity",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"tiers"`
 */
export const useReadMembershipFactoryTiers =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipFactoryAbi,
    functionName: "tiers",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipFactoryAbi}__
 */
export const useWriteMembershipFactory = /*#__PURE__*/ createUseWriteContract({
  abi: membershipFactoryAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteMembershipFactoryAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipFactoryAbi,
    functionName: "acceptOwnership",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"bindProtocolToken"`
 */
export const useWriteMembershipFactoryBindProtocolToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipFactoryAbi,
    functionName: "bindProtocolToken",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"createTier"`
 */
export const useWriteMembershipFactoryCreateTier =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipFactoryAbi,
    functionName: "createTier",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"setPaymentTokenEnabled"`
 */
export const useWriteMembershipFactorySetPaymentTokenEnabled =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipFactoryAbi,
    functionName: "setPaymentTokenEnabled",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteMembershipFactoryTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipFactoryAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipFactoryAbi}__
 */
export const useSimulateMembershipFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: membershipFactoryAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateMembershipFactoryAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipFactoryAbi,
    functionName: "acceptOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"bindProtocolToken"`
 */
export const useSimulateMembershipFactoryBindProtocolToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipFactoryAbi,
    functionName: "bindProtocolToken",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"createTier"`
 */
export const useSimulateMembershipFactoryCreateTier =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipFactoryAbi,
    functionName: "createTier",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"setPaymentTokenEnabled"`
 */
export const useSimulateMembershipFactorySetPaymentTokenEnabled =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipFactoryAbi,
    functionName: "setPaymentTokenEnabled",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateMembershipFactoryTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipFactoryAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__
 */
export const useWatchMembershipFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: membershipFactoryAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchMembershipFactoryOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "OwnershipTransferStarted",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchMembershipFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "OwnershipTransferred",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"PaymentTokenDisabled"`
 */
export const useWatchMembershipFactoryPaymentTokenDisabledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "PaymentTokenDisabled",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"PaymentTokenEnabled"`
 */
export const useWatchMembershipFactoryPaymentTokenEnabledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "PaymentTokenEnabled",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"PaymentTokenListed"`
 */
export const useWatchMembershipFactoryPaymentTokenListedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "PaymentTokenListed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"TierArtConfigured"`
 */
export const useWatchMembershipFactoryTierArtConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "TierArtConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"TierCreated"`
 */
export const useWatchMembershipFactoryTierCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "TierCreated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"TierMetadataConfigured"`
 */
export const useWatchMembershipFactoryTierMetadataConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "TierMetadataConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"TierRendererConfigured"`
 */
export const useWatchMembershipFactoryTierRendererConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "TierRendererConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipFactoryAbi}__ and `eventName` set to `"TierTermsConfigured"`
 */
export const useWatchMembershipFactoryTierTermsConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipFactoryAbi,
    eventName: "TierTermsConfigured",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__
 */
export const useReadMembershipTier = /*#__PURE__*/ createUseReadContract({
  abi: membershipTierAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"MAX_DESCRIPTION_BYTES"`
 */
export const useReadMembershipTierMaxDescriptionBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "MAX_DESCRIPTION_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"MAX_NAME_BYTES"`
 */
export const useReadMembershipTierMaxNameBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "MAX_NAME_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"MAX_RENDERABLE_MEDIA_BYTES"`
 */
export const useReadMembershipTierMaxRenderableMediaBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "MAX_RENDERABLE_MEDIA_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"MAX_SYMBOL_BYTES"`
 */
export const useReadMembershipTierMaxSymbolBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "MAX_SYMBOL_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"MAX_SYNC_BATCH_SIZE"`
 */
export const useReadMembershipTierMaxSyncBatchSize =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "MAX_SYNC_BATCH_SIZE",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"MAX_URI_BYTES"`
 */
export const useReadMembershipTierMaxUriBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "MAX_URI_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"activeBalanceOf"`
 */
export const useReadMembershipTierActiveBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "activeBalanceOf",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"approve"`
 */
export const useReadMembershipTierApprove = /*#__PURE__*/ createUseReadContract(
  { abi: membershipTierAbi, functionName: "approve" },
);

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"artConfig"`
 */
export const useReadMembershipTierArtConfig =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "artConfig",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadMembershipTierBalanceOf =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "balanceOf",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"buybackVault"`
 */
export const useReadMembershipTierBuybackVault =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "buybackVault",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"claimableReferral"`
 */
export const useReadMembershipTierClaimableReferral =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "claimableReferral",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"claimableReward"`
 */
export const useReadMembershipTierClaimableReward =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "claimableReward",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"creatorProceeds"`
 */
export const useReadMembershipTierCreatorProceeds =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "creatorProceeds",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"description"`
 */
export const useReadMembershipTierDescription =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "description",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"expiresAt"`
 */
export const useReadMembershipTierExpiresAt =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "expiresAt",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"externalURI"`
 */
export const useReadMembershipTierExternalUri =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "externalURI",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"factory"`
 */
export const useReadMembershipTierFactory = /*#__PURE__*/ createUseReadContract(
  { abi: membershipTierAbi, functionName: "factory" },
);

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"getApproved"`
 */
export const useReadMembershipTierGetApproved =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "getApproved",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"isActive"`
 */
export const useReadMembershipTierIsActive =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "isActive",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"isActiveToken"`
 */
export const useReadMembershipTierIsActiveToken =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "isActiveToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"isApprovedForAll"`
 */
export const useReadMembershipTierIsApprovedForAll =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "isApprovedForAll",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"isOccupied"`
 */
export const useReadMembershipTierIsOccupied =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "isOccupied",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"isRenewable"`
 */
export const useReadMembershipTierIsRenewable =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "isRenewable",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"locked"`
 */
export const useReadMembershipTierLocked = /*#__PURE__*/ createUseReadContract({
  abi: membershipTierAbi,
  functionName: "locked",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"maxPrepaidPeriods"`
 */
export const useReadMembershipTierMaxPrepaidPeriods =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "maxPrepaidPeriods",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"mediaConfig"`
 */
export const useReadMembershipTierMediaConfig =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "mediaConfig",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"name"`
 */
export const useReadMembershipTierName = /*#__PURE__*/ createUseReadContract({
  abi: membershipTierAbi,
  functionName: "name",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"occupiedSupply"`
 */
export const useReadMembershipTierOccupiedSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "occupiedSupply",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"owner"`
 */
export const useReadMembershipTierOwner = /*#__PURE__*/ createUseReadContract({
  abi: membershipTierAbi,
  functionName: "owner",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"ownerOf"`
 */
export const useReadMembershipTierOwnerOf = /*#__PURE__*/ createUseReadContract(
  { abi: membershipTierAbi, functionName: "ownerOf" },
);

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"paused"`
 */
export const useReadMembershipTierPaused = /*#__PURE__*/ createUseReadContract({
  abi: membershipTierAbi,
  functionName: "paused",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"paymentToken"`
 */
export const useReadMembershipTierPaymentToken =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "paymentToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadMembershipTierPendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "pendingOwner",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"periodDuration"`
 */
export const useReadMembershipTierPeriodDuration =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "periodDuration",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"previewRefund"`
 */
export const useReadMembershipTierPreviewRefund =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "previewRefund",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"previewRefundComponents"`
 */
export const useReadMembershipTierPreviewRefundComponents =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "previewRefundComponents",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"pricePerPeriod"`
 */
export const useReadMembershipTierPricePerPeriod =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "pricePerPeriod",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"protocolFeeBps"`
 */
export const useReadMembershipTierProtocolFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "protocolFeeBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"protocolFeeEarnedHeld"`
 */
export const useReadMembershipTierProtocolFeeEarnedHeld =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "protocolFeeEarnedHeld",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"protocolFeeHoldings"`
 */
export const useReadMembershipTierProtocolFeeHoldings =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "protocolFeeHoldings",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"protocolFeeLots"`
 */
export const useReadMembershipTierProtocolFeeLots =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "protocolFeeLots",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"protocolFeeState"`
 */
export const useReadMembershipTierProtocolFeeState =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "protocolFeeState",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"referralBps"`
 */
export const useReadMembershipTierReferralBps =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "referralBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"referralOf"`
 */
export const useReadMembershipTierReferralOf =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "referralOf",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"renderer"`
 */
export const useReadMembershipTierRenderer =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "renderer",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useReadMembershipTierRenounceOwnership =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "renounceOwnership",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"rewardBps"`
 */
export const useReadMembershipTierRewardBps =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "rewardBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"rewardEligible"`
 */
export const useReadMembershipTierRewardEligible =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "rewardEligible",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"rewardPerShare"`
 */
export const useReadMembershipTierRewardPerShare =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "rewardPerShare",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"rewardReserve"`
 */
export const useReadMembershipTierRewardReserve =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "rewardReserve",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setApprovalForAll"`
 */
export const useReadMembershipTierSetApprovalForAll =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "setApprovalForAll",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"sharesOf"`
 */
export const useReadMembershipTierSharesOf =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "sharesOf",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"supplyCap"`
 */
export const useReadMembershipTierSupplyCap =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "supplyCap",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"supportsInterface"`
 */
export const useReadMembershipTierSupportsInterface =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "supportsInterface",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadMembershipTierSymbol = /*#__PURE__*/ createUseReadContract({
  abi: membershipTierAbi,
  functionName: "symbol",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"tierIdentity"`
 */
export const useReadMembershipTierTierIdentity =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "tierIdentity",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"timeBalances"`
 */
export const useReadMembershipTierTimeBalances =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "timeBalances",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"tokenOf"`
 */
export const useReadMembershipTierTokenOf = /*#__PURE__*/ createUseReadContract(
  { abi: membershipTierAbi, functionName: "tokenOf" },
);

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"tokenURI"`
 */
export const useReadMembershipTierTokenUri =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "tokenURI",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalMinted"`
 */
export const useReadMembershipTierTotalMinted =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalMinted",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalProtectedLiability"`
 */
export const useReadMembershipTierTotalProtectedLiability =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalProtectedLiability",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalProtocolFeeAllocated"`
 */
export const useReadMembershipTierTotalProtocolFeeAllocated =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalProtocolFeeAllocated",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalProtocolFeeCancellationRounding"`
 */
export const useReadMembershipTierTotalProtocolFeeCancellationRounding =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalProtocolFeeCancellationRounding",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalProtocolFeeRefunded"`
 */
export const useReadMembershipTierTotalProtocolFeeRefunded =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalProtocolFeeRefunded",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalProtocolFeeReleased"`
 */
export const useReadMembershipTierTotalProtocolFeeReleased =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalProtocolFeeReleased",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalReferralLiability"`
 */
export const useReadMembershipTierTotalReferralLiability =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalReferralLiability",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalRewardShares"`
 */
export const useReadMembershipTierTotalRewardShares =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalRewardShares",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__
 */
export const useWriteMembershipTier = /*#__PURE__*/ createUseWriteContract({
  abi: membershipTierAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteMembershipTierAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "acceptOwnership",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"accrueProtocolFees"`
 */
export const useWriteMembershipTierAccrueProtocolFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "accrueProtocolFees",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"cancelSubscription"`
 */
export const useWriteMembershipTierCancelSubscription =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "cancelSubscription",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"claimReferral"`
 */
export const useWriteMembershipTierClaimReferral =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "claimReferral",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"claimReward"`
 */
export const useWriteMembershipTierClaimReward =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "claimReward",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"contribute"`
 */
export const useWriteMembershipTierContribute =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "contribute",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"gift"`
 */
export const useWriteMembershipTierGift = /*#__PURE__*/ createUseWriteContract({
  abi: membershipTierAbi,
  functionName: "gift",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"grantTime"`
 */
export const useWriteMembershipTierGrantTime =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "grantTime",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"purchase"`
 */
export const useWriteMembershipTierPurchase =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "purchase",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"refund"`
 */
export const useWriteMembershipTierRefund =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "refund",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"releaseProtocolFees"`
 */
export const useWriteMembershipTierReleaseProtocolFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "releaseProtocolFees",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"renewSubscription"`
 */
export const useWriteMembershipTierRenewSubscription =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "renewSubscription",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"revokeGrantTime"`
 */
export const useWriteMembershipTierRevokeGrantTime =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "revokeGrantTime",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"safeTransferFrom"`
 */
export const useWriteMembershipTierSafeTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "safeTransferFrom",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setMaxPrepaidPeriods"`
 */
export const useWriteMembershipTierSetMaxPrepaidPeriods =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "setMaxPrepaidPeriods",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setPaused"`
 */
export const useWriteMembershipTierSetPaused =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "setPaused",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setPresentation"`
 */
export const useWriteMembershipTierSetPresentation =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "setPresentation",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setSupplyCap"`
 */
export const useWriteMembershipTierSetSupplyCap =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "setSupplyCap",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setTierMetadata"`
 */
export const useWriteMembershipTierSetTierMetadata =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "setTierMetadata",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"synchronizeExpiredMemberships"`
 */
export const useWriteMembershipTierSynchronizeExpiredMemberships =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "synchronizeExpiredMemberships",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteMembershipTierTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "transferFrom",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteMembershipTierTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"withdrawCreatorProceeds"`
 */
export const useWriteMembershipTierWithdrawCreatorProceeds =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "withdrawCreatorProceeds",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__
 */
export const useSimulateMembershipTier =
  /*#__PURE__*/ createUseSimulateContract({ abi: membershipTierAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateMembershipTierAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "acceptOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"accrueProtocolFees"`
 */
export const useSimulateMembershipTierAccrueProtocolFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "accrueProtocolFees",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"cancelSubscription"`
 */
export const useSimulateMembershipTierCancelSubscription =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "cancelSubscription",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"claimReferral"`
 */
export const useSimulateMembershipTierClaimReferral =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "claimReferral",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"claimReward"`
 */
export const useSimulateMembershipTierClaimReward =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "claimReward",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"contribute"`
 */
export const useSimulateMembershipTierContribute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "contribute",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"gift"`
 */
export const useSimulateMembershipTierGift =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "gift",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"grantTime"`
 */
export const useSimulateMembershipTierGrantTime =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "grantTime",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"purchase"`
 */
export const useSimulateMembershipTierPurchase =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "purchase",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"refund"`
 */
export const useSimulateMembershipTierRefund =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "refund",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"releaseProtocolFees"`
 */
export const useSimulateMembershipTierReleaseProtocolFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "releaseProtocolFees",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"renewSubscription"`
 */
export const useSimulateMembershipTierRenewSubscription =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "renewSubscription",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"revokeGrantTime"`
 */
export const useSimulateMembershipTierRevokeGrantTime =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "revokeGrantTime",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"safeTransferFrom"`
 */
export const useSimulateMembershipTierSafeTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "safeTransferFrom",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setMaxPrepaidPeriods"`
 */
export const useSimulateMembershipTierSetMaxPrepaidPeriods =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "setMaxPrepaidPeriods",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setPaused"`
 */
export const useSimulateMembershipTierSetPaused =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "setPaused",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setPresentation"`
 */
export const useSimulateMembershipTierSetPresentation =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "setPresentation",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setSupplyCap"`
 */
export const useSimulateMembershipTierSetSupplyCap =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "setSupplyCap",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"setTierMetadata"`
 */
export const useSimulateMembershipTierSetTierMetadata =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "setTierMetadata",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"synchronizeExpiredMemberships"`
 */
export const useSimulateMembershipTierSynchronizeExpiredMemberships =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "synchronizeExpiredMemberships",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateMembershipTierTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "transferFrom",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateMembershipTierTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"withdrawCreatorProceeds"`
 */
export const useSimulateMembershipTierWithdrawCreatorProceeds =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "withdrawCreatorProceeds",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__
 */
export const useWatchMembershipTierEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: membershipTierAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchMembershipTierApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "Approval",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"ApprovalForAll"`
 */
export const useWatchMembershipTierApprovalForAllEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "ApprovalForAll",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"BatchMetadataUpdate"`
 */
export const useWatchMembershipTierBatchMetadataUpdateEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "BatchMetadataUpdate",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"CreatorProceedsWithdrawn"`
 */
export const useWatchMembershipTierCreatorProceedsWithdrawnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "CreatorProceedsWithdrawn",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"ExpiredMembershipSynchronized"`
 */
export const useWatchMembershipTierExpiredMembershipSynchronizedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "ExpiredMembershipSynchronized",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"Locked"`
 */
export const useWatchMembershipTierLockedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "Locked",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"MaxPrepaidPeriodsUpdated"`
 */
export const useWatchMembershipTierMaxPrepaidPeriodsUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "MaxPrepaidPeriodsUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"MembershipRefunded"`
 */
export const useWatchMembershipTierMembershipRefundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "MembershipRefunded",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"MembershipTimeUpdated"`
 */
export const useWatchMembershipTierMembershipTimeUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "MembershipTimeUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"MetadataUpdate"`
 */
export const useWatchMembershipTierMetadataUpdateEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "MetadataUpdate",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchMembershipTierOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "OwnershipTransferStarted",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchMembershipTierOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "OwnershipTransferred",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"PauseUpdated"`
 */
export const useWatchMembershipTierPauseUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "PauseUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"PaymentAllocated"`
 */
export const useWatchMembershipTierPaymentAllocatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "PaymentAllocated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"PaymentProcessed"`
 */
export const useWatchMembershipTierPaymentProcessedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "PaymentProcessed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"PresentationUpdated"`
 */
export const useWatchMembershipTierPresentationUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "PresentationUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"ProtocolFeeAllocated"`
 */
export const useWatchMembershipTierProtocolFeeAllocatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "ProtocolFeeAllocated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"ProtocolFeesAccrued"`
 */
export const useWatchMembershipTierProtocolFeesAccruedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "ProtocolFeesAccrued",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"ProtocolFeesReleased"`
 */
export const useWatchMembershipTierProtocolFeesReleasedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "ProtocolFeesReleased",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"ReferralClaimed"`
 */
export const useWatchMembershipTierReferralClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "ReferralClaimed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"ReferralLocked"`
 */
export const useWatchMembershipTierReferralLockedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "ReferralLocked",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"RefundFunded"`
 */
export const useWatchMembershipTierRefundFundedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "RefundFunded",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"RewardClaimed"`
 */
export const useWatchMembershipTierRewardClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "RewardClaimed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"RewardEligibilityUpdated"`
 */
export const useWatchMembershipTierRewardEligibilityUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "RewardEligibilityUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"RewardPerShareUpdated"`
 */
export const useWatchMembershipTierRewardPerShareUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "RewardPerShareUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"SharesIssued"`
 */
export const useWatchMembershipTierSharesIssuedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "SharesIssued",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"SubscriptionUpdate"`
 */
export const useWatchMembershipTierSubscriptionUpdateEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "SubscriptionUpdate",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"SupplyCapUpdated"`
 */
export const useWatchMembershipTierSupplyCapUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "SupplyCapUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"TierMetadataUpdated"`
 */
export const useWatchMembershipTierTierMetadataUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "TierMetadataUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchMembershipTierTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "Transfer",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"Unlocked"`
 */
export const useWatchMembershipTierUnlockedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "Unlocked",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__
 */
export const useReadOnchainMediaStoreFactory =
  /*#__PURE__*/ createUseReadContract({ abi: onchainMediaStoreFactoryAbi });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"creatorMedia"`
 */
export const useReadOnchainMediaStoreFactoryCreatorMedia =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "creatorMedia",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"creatorMediaCount"`
 */
export const useReadOnchainMediaStoreFactoryCreatorMediaCount =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "creatorMediaCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"isRegisteredMedia"`
 */
export const useReadOnchainMediaStoreFactoryIsRegisteredMedia =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "isRegisteredMedia",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"maxCodeStorePayloadBytes"`
 */
export const useReadOnchainMediaStoreFactoryMaxCodeStorePayloadBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "maxCodeStorePayloadBytes",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"maxPageSize"`
 */
export const useReadOnchainMediaStoreFactoryMaxPageSize =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "maxPageSize",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"maxRenderableMediaBytes"`
 */
export const useReadOnchainMediaStoreFactoryMaxRenderableMediaBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "maxRenderableMediaBytes",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"mediaKey"`
 */
export const useReadOnchainMediaStoreFactoryMediaKey =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "mediaKey",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"mediaRecord"`
 */
export const useReadOnchainMediaStoreFactoryMediaRecord =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "mediaRecord",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"mediaStore"`
 */
export const useReadOnchainMediaStoreFactoryMediaStore =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "mediaStore",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"predictStore"`
 */
export const useReadOnchainMediaStoreFactoryPredictStore =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "predictStore",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"validateOnchainMedia"`
 */
export const useReadOnchainMediaStoreFactoryValidateOnchainMedia =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "validateOnchainMedia",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__
 */
export const useWriteOnchainMediaStoreFactory =
  /*#__PURE__*/ createUseWriteContract({ abi: onchainMediaStoreFactoryAbi });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"store"`
 */
export const useWriteOnchainMediaStoreFactoryStore =
  /*#__PURE__*/ createUseWriteContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "store",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__
 */
export const useSimulateOnchainMediaStoreFactory =
  /*#__PURE__*/ createUseSimulateContract({ abi: onchainMediaStoreFactoryAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `functionName` set to `"store"`
 */
export const useSimulateOnchainMediaStoreFactoryStore =
  /*#__PURE__*/ createUseSimulateContract({
    abi: onchainMediaStoreFactoryAbi,
    functionName: "store",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__
 */
export const useWatchOnchainMediaStoreFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: onchainMediaStoreFactoryAbi,
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link onchainMediaStoreFactoryAbi}__ and `eventName` set to `"MediaStored"`
 */
export const useWatchOnchainMediaStoreFactoryMediaStoredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: onchainMediaStoreFactoryAbi,
    eventName: "MediaStored",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__
 */
export const useReadOnchainMetadataRenderer =
  /*#__PURE__*/ createUseReadContract({ abi: onchainMetadataRendererAbi });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"MAX_DESCRIPTION_BYTES"`
 */
export const useReadOnchainMetadataRendererMaxDescriptionBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "MAX_DESCRIPTION_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"MAX_NAME_BYTES"`
 */
export const useReadOnchainMetadataRendererMaxNameBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "MAX_NAME_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"MAX_RENDERABLE_MEDIA_BYTES"`
 */
export const useReadOnchainMetadataRendererMaxRenderableMediaBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "MAX_RENDERABLE_MEDIA_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"MAX_URI_BYTES"`
 */
export const useReadOnchainMetadataRendererMaxUriBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "MAX_URI_BYTES",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"engineCount"`
 */
export const useReadOnchainMetadataRendererEngineCount =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "engineCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"engineName"`
 */
export const useReadOnchainMetadataRendererEngineName =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "engineName",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"previewSVG"`
 */
export const useReadOnchainMetadataRendererPreviewSvg =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "previewSVG",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"previewTokenURI"`
 */
export const useReadOnchainMetadataRendererPreviewTokenUri =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "previewTokenURI",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"renderTokenURI"`
 */
export const useReadOnchainMetadataRendererRenderTokenUri =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "renderTokenURI",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"rendererName"`
 */
export const useReadOnchainMetadataRendererRendererName =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "rendererName",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"rendererSchema"`
 */
export const useReadOnchainMetadataRendererRendererSchema =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "rendererSchema",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link onchainMetadataRendererAbi}__ and `functionName` set to `"validateConfiguration"`
 */
export const useReadOnchainMetadataRendererValidateConfiguration =
  /*#__PURE__*/ createUseReadContract({
    abi: onchainMetadataRendererAbi,
    functionName: "validateConfiguration",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__
 */
export const useReadPonsBuybackExecutor = /*#__PURE__*/ createUseReadContract({
  abi: ponsBuybackExecutorAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__ and `functionName` set to `"curve"`
 */
export const useReadPonsBuybackExecutorCurve =
  /*#__PURE__*/ createUseReadContract({
    abi: ponsBuybackExecutorAbi,
    functionName: "curve",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__ and `functionName` set to `"lifecycle"`
 */
export const useReadPonsBuybackExecutorLifecycle =
  /*#__PURE__*/ createUseReadContract({
    abi: ponsBuybackExecutorAbi,
    functionName: "lifecycle",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__ and `functionName` set to `"protocolToken"`
 */
export const useReadPonsBuybackExecutorProtocolToken =
  /*#__PURE__*/ createUseReadContract({
    abi: ponsBuybackExecutorAbi,
    functionName: "protocolToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__ and `functionName` set to `"vault"`
 */
export const useReadPonsBuybackExecutorVault =
  /*#__PURE__*/ createUseReadContract({
    abi: ponsBuybackExecutorAbi,
    functionName: "vault",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__
 */
export const useWritePonsBuybackExecutor = /*#__PURE__*/ createUseWriteContract(
  { abi: ponsBuybackExecutorAbi },
);

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__ and `functionName` set to `"execute"`
 */
export const useWritePonsBuybackExecutorExecute =
  /*#__PURE__*/ createUseWriteContract({
    abi: ponsBuybackExecutorAbi,
    functionName: "execute",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__
 */
export const useSimulatePonsBuybackExecutor =
  /*#__PURE__*/ createUseSimulateContract({ abi: ponsBuybackExecutorAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link ponsBuybackExecutorAbi}__ and `functionName` set to `"execute"`
 */
export const useSimulatePonsBuybackExecutorExecute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: ponsBuybackExecutorAbi,
    functionName: "execute",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__
 */
export const useReadProtocolBurnRouter = /*#__PURE__*/ createUseReadContract({
  abi: protocolBurnRouterAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"factory"`
 */
export const useReadProtocolBurnRouterFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBurnRouterAbi,
    functionName: "factory",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"nextSource"`
 */
export const useReadProtocolBurnRouterNextSource =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBurnRouterAbi,
    functionName: "nextSource",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"vault"`
 */
export const useReadProtocolBurnRouterVault =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBurnRouterAbi,
    functionName: "vault",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__
 */
export const useWriteProtocolBurnRouter = /*#__PURE__*/ createUseWriteContract({
  abi: protocolBurnRouterAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"burn"`
 */
export const useWriteProtocolBurnRouterBurn =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBurnRouterAbi,
    functionName: "burn",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"collect"`
 */
export const useWriteProtocolBurnRouterCollect =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBurnRouterAbi,
    functionName: "collect",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"purchase"`
 */
export const useWriteProtocolBurnRouterPurchase =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBurnRouterAbi,
    functionName: "purchase",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__
 */
export const useSimulateProtocolBurnRouter =
  /*#__PURE__*/ createUseSimulateContract({ abi: protocolBurnRouterAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"burn"`
 */
export const useSimulateProtocolBurnRouterBurn =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBurnRouterAbi,
    functionName: "burn",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"collect"`
 */
export const useSimulateProtocolBurnRouterCollect =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBurnRouterAbi,
    functionName: "collect",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `functionName` set to `"purchase"`
 */
export const useSimulateProtocolBurnRouterPurchase =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBurnRouterAbi,
    functionName: "purchase",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBurnRouterAbi}__
 */
export const useWatchProtocolBurnRouterEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: protocolBurnRouterAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `eventName` set to `"BurnCompleted"`
 */
export const useWatchProtocolBurnRouterBurnCompletedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBurnRouterAbi,
    eventName: "BurnCompleted",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `eventName` set to `"CollectionFailed"`
 */
export const useWatchProtocolBurnRouterCollectionFailedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBurnRouterAbi,
    eventName: "CollectionFailed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBurnRouterAbi}__ and `eventName` set to `"PurchaseFailed"`
 */
export const useWatchProtocolBurnRouterPurchaseFailedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBurnRouterAbi,
    eventName: "PurchaseFailed",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__
 */
export const useReadProtocolBuybackVault = /*#__PURE__*/ createUseReadContract({
  abi: protocolBuybackVaultAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"assetBuybacksPaused"`
 */
export const useReadProtocolBuybackVaultAssetBuybacksPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "assetBuybacksPaused",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"buybacksPaused"`
 */
export const useReadProtocolBuybackVaultBuybacksPaused =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "buybacksPaused",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"canonicalAsset"`
 */
export const useReadProtocolBuybackVaultCanonicalAsset =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "canonicalAsset",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"executor"`
 */
export const useReadProtocolBuybackVaultExecutor =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "executor",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"executorCreationCodeHash"`
 */
export const useReadProtocolBuybackVaultExecutorCreationCodeHash =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "executorCreationCodeHash",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"executorCreationCodeLength"`
 */
export const useReadProtocolBuybackVaultExecutorCreationCodeLength =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "executorCreationCodeLength",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"executorCreationCodeStore"`
 */
export const useReadProtocolBuybackVaultExecutorCreationCodeStore =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "executorCreationCodeStore",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"factory"`
 */
export const useReadProtocolBuybackVaultFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "factory",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"globalMinInterval"`
 */
export const useReadProtocolBuybackVaultGlobalMinInterval =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "globalMinInterval",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"inventory"`
 */
export const useReadProtocolBuybackVaultInventory =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "inventory",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"lastAssetBuyAt"`
 */
export const useReadProtocolBuybackVaultLastAssetBuyAt =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "lastAssetBuyAt",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"lastBuyAt"`
 */
export const useReadProtocolBuybackVaultLastBuyAt =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "lastBuyAt",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"limits"`
 */
export const useReadProtocolBuybackVaultLimits =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "limits",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"processingStatus"`
 */
export const useReadProtocolBuybackVaultProcessingStatus =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "processingStatus",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"protocolToken"`
 */
export const useReadProtocolBuybackVaultProtocolToken =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "protocolToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"revision"`
 */
export const useReadProtocolBuybackVaultRevision =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "revision",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"route"`
 */
export const useReadProtocolBuybackVaultRoute =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "route",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"settlementSequence"`
 */
export const useReadProtocolBuybackVaultSettlementSequence =
  /*#__PURE__*/ createUseReadContract({
    abi: protocolBuybackVaultAbi,
    functionName: "settlementSequence",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__
 */
export const useWriteProtocolBuybackVault =
  /*#__PURE__*/ createUseWriteContract({ abi: protocolBuybackVaultAbi });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"bindProtocolToken"`
 */
export const useWriteProtocolBuybackVaultBindProtocolToken =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "bindProtocolToken",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"process"`
 */
export const useWriteProtocolBuybackVaultProcess =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "process",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"recordEarnedFees"`
 */
export const useWriteProtocolBuybackVaultRecordEarnedFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "recordEarnedFees",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setAssetBuybacksPaused"`
 */
export const useWriteProtocolBuybackVaultSetAssetBuybacksPaused =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setAssetBuybacksPaused",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setBuybacksPaused"`
 */
export const useWriteProtocolBuybackVaultSetBuybacksPaused =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setBuybacksPaused",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setExecutionLimits"`
 */
export const useWriteProtocolBuybackVaultSetExecutionLimits =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setExecutionLimits",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setGlobalMinInterval"`
 */
export const useWriteProtocolBuybackVaultSetGlobalMinInterval =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setGlobalMinInterval",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setLimits"`
 */
export const useWriteProtocolBuybackVaultSetLimits =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setLimits",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setRoute"`
 */
export const useWriteProtocolBuybackVaultSetRoute =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setRoute",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"syncDonation"`
 */
export const useWriteProtocolBuybackVaultSyncDonation =
  /*#__PURE__*/ createUseWriteContract({
    abi: protocolBuybackVaultAbi,
    functionName: "syncDonation",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__
 */
export const useSimulateProtocolBuybackVault =
  /*#__PURE__*/ createUseSimulateContract({ abi: protocolBuybackVaultAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"bindProtocolToken"`
 */
export const useSimulateProtocolBuybackVaultBindProtocolToken =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "bindProtocolToken",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"process"`
 */
export const useSimulateProtocolBuybackVaultProcess =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "process",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"recordEarnedFees"`
 */
export const useSimulateProtocolBuybackVaultRecordEarnedFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "recordEarnedFees",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setAssetBuybacksPaused"`
 */
export const useSimulateProtocolBuybackVaultSetAssetBuybacksPaused =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setAssetBuybacksPaused",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setBuybacksPaused"`
 */
export const useSimulateProtocolBuybackVaultSetBuybacksPaused =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setBuybacksPaused",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setExecutionLimits"`
 */
export const useSimulateProtocolBuybackVaultSetExecutionLimits =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setExecutionLimits",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setGlobalMinInterval"`
 */
export const useSimulateProtocolBuybackVaultSetGlobalMinInterval =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setGlobalMinInterval",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setLimits"`
 */
export const useSimulateProtocolBuybackVaultSetLimits =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setLimits",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"setRoute"`
 */
export const useSimulateProtocolBuybackVaultSetRoute =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "setRoute",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `functionName` set to `"syncDonation"`
 */
export const useSimulateProtocolBuybackVaultSyncDonation =
  /*#__PURE__*/ createUseSimulateContract({
    abi: protocolBuybackVaultAbi,
    functionName: "syncDonation",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__
 */
export const useWatchProtocolBuybackVaultEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: protocolBuybackVaultAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"AssetBuybacksPaused"`
 */
export const useWatchProtocolBuybackVaultAssetBuybacksPausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "AssetBuybacksPaused",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"BuybackBurned"`
 */
export const useWatchProtocolBuybackVaultBuybackBurnedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "BuybackBurned",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"BuybacksPaused"`
 */
export const useWatchProtocolBuybackVaultBuybacksPausedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "BuybacksPaused",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"ConversionSettled"`
 */
export const useWatchProtocolBuybackVaultConversionSettledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "ConversionSettled",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"DirectBurned"`
 */
export const useWatchProtocolBuybackVaultDirectBurnedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "DirectBurned",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"DonationRecorded"`
 */
export const useWatchProtocolBuybackVaultDonationRecordedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "DonationRecorded",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"EarnedFeesReceived"`
 */
export const useWatchProtocolBuybackVaultEarnedFeesReceivedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "EarnedFeesReceived",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"GlobalIntervalConfigured"`
 */
export const useWatchProtocolBuybackVaultGlobalIntervalConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "GlobalIntervalConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"LimitsConfigured"`
 */
export const useWatchProtocolBuybackVaultLimitsConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "LimitsConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"ProtocolTokenBound"`
 */
export const useWatchProtocolBuybackVaultProtocolTokenBoundEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "ProtocolTokenBound",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link protocolBuybackVaultAbi}__ and `eventName` set to `"RouteConfigured"`
 */
export const useWatchProtocolBuybackVaultRouteConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: protocolBuybackVaultAbi,
    eventName: "RouteConfigured",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererPreviewHarnessAbi}__
 */
export const useReadRendererPreviewHarness =
  /*#__PURE__*/ createUseReadContract({ abi: rendererPreviewHarnessAbi });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererPreviewHarnessAbi}__ and `functionName` set to `"MAX_FAILURE_REASON_BYTES"`
 */
export const useReadRendererPreviewHarnessMaxFailureReasonBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererPreviewHarnessAbi,
    functionName: "MAX_FAILURE_REASON_BYTES",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link rendererPreviewHarnessAbi}__
 */
export const useWriteRendererPreviewHarness =
  /*#__PURE__*/ createUseWriteContract({ abi: rendererPreviewHarnessAbi });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link rendererPreviewHarnessAbi}__ and `functionName` set to `"preview"`
 */
export const useWriteRendererPreviewHarnessPreview =
  /*#__PURE__*/ createUseWriteContract({
    abi: rendererPreviewHarnessAbi,
    functionName: "preview",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link rendererPreviewHarnessAbi}__
 */
export const useSimulateRendererPreviewHarness =
  /*#__PURE__*/ createUseSimulateContract({ abi: rendererPreviewHarnessAbi });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link rendererPreviewHarnessAbi}__ and `functionName` set to `"preview"`
 */
export const useSimulateRendererPreviewHarnessPreview =
  /*#__PURE__*/ createUseSimulateContract({
    abi: rendererPreviewHarnessAbi,
    functionName: "preview",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistry = /*#__PURE__*/ createUseReadContract({
  abi: rendererRegistryAbi,
  address: rendererRegistryAddress,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"createdRendererCount"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryCreatedRendererCount =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "createdRendererCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"createdRenderers"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryCreatedRenderers =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "createdRenderers",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"creatorCount"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryCreatorCount =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "creatorCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"creatorOf"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryCreatorOf =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "creatorOf",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"creators"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryCreators =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "creators",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"isCreator"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryIsCreator =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "isCreator",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"maxInitCodeBytes"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryMaxInitCodeBytes =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "maxInitCodeBytes",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"maxPageSize"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryMaxPageSize =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "maxPageSize",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"registrationKind"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryRegistrationKind =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "registrationKind",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"rendererSchema"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistryRendererSchema =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "rendererSchema",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"savedRendererCount"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistrySavedRendererCount =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "savedRendererCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"savedRenderers"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useReadRendererRegistrySavedRenderers =
  /*#__PURE__*/ createUseReadContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "savedRenderers",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link rendererRegistryAbi}__
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWriteRendererRegistry = /*#__PURE__*/ createUseWriteContract({
  abi: rendererRegistryAbi,
  address: rendererRegistryAddress,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"deployAndRegister"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWriteRendererRegistryDeployAndRegister =
  /*#__PURE__*/ createUseWriteContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "deployAndRegister",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"register"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWriteRendererRegistryRegister =
  /*#__PURE__*/ createUseWriteContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "register",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"unregister"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWriteRendererRegistryUnregister =
  /*#__PURE__*/ createUseWriteContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "unregister",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link rendererRegistryAbi}__
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useSimulateRendererRegistry =
  /*#__PURE__*/ createUseSimulateContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"deployAndRegister"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useSimulateRendererRegistryDeployAndRegister =
  /*#__PURE__*/ createUseSimulateContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "deployAndRegister",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"register"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useSimulateRendererRegistryRegister =
  /*#__PURE__*/ createUseSimulateContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "register",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link rendererRegistryAbi}__ and `functionName` set to `"unregister"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useSimulateRendererRegistryUnregister =
  /*#__PURE__*/ createUseSimulateContract({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    functionName: "unregister",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link rendererRegistryAbi}__
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWatchRendererRegistryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link rendererRegistryAbi}__ and `eventName` set to `"CreatorAdded"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWatchRendererRegistryCreatorAddedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    eventName: "CreatorAdded",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link rendererRegistryAbi}__ and `eventName` set to `"RendererDeployed"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWatchRendererRegistryRendererDeployedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    eventName: "RendererDeployed",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link rendererRegistryAbi}__ and `eventName` set to `"RendererRegistered"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWatchRendererRegistryRendererRegisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    eventName: "RendererRegistered",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link rendererRegistryAbi}__ and `eventName` set to `"RendererUnregistered"`
 *
 * [__View Contract on Robinhood Chain Testnet Blockscout__](https://explorer.testnet.chain.robinhood.com/address/0x4d421062e1af4ab12e4f65ba475f169f633d745a)
 */
export const useWatchRendererRegistryRendererUnregisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: rendererRegistryAbi,
    address: rendererRegistryAddress,
    eventName: "RendererUnregistered",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link usdgAbi}__
 */
export const useReadUsdg = /*#__PURE__*/ createUseReadContract({
  abi: usdgAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadUsdgAllowance = /*#__PURE__*/ createUseReadContract({
  abi: usdgAbi,
  functionName: "allowance",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadUsdgBalanceOf = /*#__PURE__*/ createUseReadContract({
  abi: usdgAbi,
  functionName: "balanceOf",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadUsdgDecimals = /*#__PURE__*/ createUseReadContract({
  abi: usdgAbi,
  functionName: "decimals",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"name"`
 */
export const useReadUsdgName = /*#__PURE__*/ createUseReadContract({
  abi: usdgAbi,
  functionName: "name",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadUsdgSymbol = /*#__PURE__*/ createUseReadContract({
  abi: usdgAbi,
  functionName: "symbol",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadUsdgTotalSupply = /*#__PURE__*/ createUseReadContract({
  abi: usdgAbi,
  functionName: "totalSupply",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link usdgAbi}__
 */
export const useWriteUsdg = /*#__PURE__*/ createUseWriteContract({
  abi: usdgAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteUsdgApprove = /*#__PURE__*/ createUseWriteContract({
  abi: usdgAbi,
  functionName: "approve",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteUsdgTransfer = /*#__PURE__*/ createUseWriteContract({
  abi: usdgAbi,
  functionName: "transfer",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteUsdgTransferFrom = /*#__PURE__*/ createUseWriteContract({
  abi: usdgAbi,
  functionName: "transferFrom",
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link usdgAbi}__
 */
export const useSimulateUsdg = /*#__PURE__*/ createUseSimulateContract({
  abi: usdgAbi,
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateUsdgApprove = /*#__PURE__*/ createUseSimulateContract({
  abi: usdgAbi,
  functionName: "approve",
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateUsdgTransfer = /*#__PURE__*/ createUseSimulateContract({
  abi: usdgAbi,
  functionName: "transfer",
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link usdgAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateUsdgTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: usdgAbi,
    functionName: "transferFrom",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link usdgAbi}__
 */
export const useWatchUsdgEvent = /*#__PURE__*/ createUseWatchContractEvent({
  abi: usdgAbi,
});

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link usdgAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchUsdgApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: usdgAbi,
    eventName: "Approval",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link usdgAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchUsdgTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: usdgAbi,
    eventName: "Transfer",
  });
