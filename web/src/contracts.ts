import {
  createUseReadContract,
  createUseWriteContract,
  createUseSimulateContract,
  createUseWatchContractEvent,
} from "wagmi/codegen";

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
      { name: "rendererVersion_", internalType: "uint32", type: "uint32" },
      { name: "renderer_", internalType: "address", type: "address" },
      {
        name: "rendererRuntimeCodehash_",
        internalType: "bytes32",
        type: "bytes32",
      },
      {
        name: "config",
        internalType: "struct MembershipTypes.TierConfig",
        type: "tuple",
        components: [
          { name: "creator", internalType: "address", type: "address" },
          { name: "tierSalt", internalType: "bytes32", type: "bytes32" },
          { name: "rendererVersion", internalType: "uint32", type: "uint32" },
          { name: "name", internalType: "string", type: "string" },
          { name: "symbol", internalType: "string", type: "string" },
          { name: "pricePerPeriod", internalType: "uint256", type: "uint256" },
          { name: "periodDuration", internalType: "uint64", type: "uint64" },
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
    name: "renderer",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "rendererRuntimeCodehash",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "rendererVersion",
    outputs: [{ name: "", internalType: "uint32", type: "uint32" }],
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
    inputs: [{ name: "tokenId", internalType: "uint256", type: "uint256" }],
    name: "synchronize",
    outputs: [{ name: "released", internalType: "bool", type: "bool" }],
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
    name: "totalReferralLiability",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "totalShares",
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
        name: "recipient",
        internalType: "address",
        type: "address",
        indexed: true,
      },
    ],
    name: "MembershipSynchronized",
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
  { type: "error", inputs: [], name: "InvalidMediaConfig" },
  { type: "error", inputs: [], name: "InvalidMetadata" },
  { type: "error", inputs: [], name: "InvalidPaidDuration" },
  { type: "error", inputs: [], name: "InvalidPeriodDuration" },
  { type: "error", inputs: [], name: "InvalidPeriods" },
  { type: "error", inputs: [], name: "InvalidRateTotal" },
  { type: "error", inputs: [], name: "InvalidText" },
  { type: "error", inputs: [], name: "InvalidTierSalt" },
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
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "RendererCodeChanged",
  },
  {
    type: "error",
    inputs: [
      { name: "expected", internalType: "uint32", type: "uint32" },
      { name: "actual", internalType: "uint32", type: "uint32" },
    ],
    name: "RendererVersionMismatch",
  },
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
// RobinhoodMembershipFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const robinhoodMembershipFactoryAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
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
      {
        name: "config",
        internalType: "struct MembershipTypes.TierConfig",
        type: "tuple",
        components: [
          { name: "creator", internalType: "address", type: "address" },
          { name: "tierSalt", internalType: "bytes32", type: "bytes32" },
          { name: "rendererVersion", internalType: "uint32", type: "uint32" },
          { name: "name", internalType: "string", type: "string" },
          { name: "symbol", internalType: "string", type: "string" },
          { name: "pricePerPeriod", internalType: "uint256", type: "uint256" },
          { name: "periodDuration", internalType: "uint64", type: "uint64" },
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
    inputs: [],
    name: "feeRecipient",
    outputs: [{ name: "", internalType: "address", type: "address" }],
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
    name: "protocolFeeBps",
    outputs: [{ name: "", internalType: "uint16", type: "uint16" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "renderer_", internalType: "address", type: "address" }],
    name: "registerRenderer",
    outputs: [
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "rendererCount",
    outputs: [{ name: "", internalType: "uint32", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
    ],
    name: "rendererRecord",
    outputs: [
      {
        name: "",
        internalType: "struct MembershipTypes.RendererRecord",
        type: "tuple",
        components: [
          { name: "implementation", internalType: "address", type: "address" },
          { name: "runtimeCodehash", internalType: "bytes32", type: "bytes32" },
          { name: "enabled", internalType: "bool", type: "bool" },
        ],
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
    inputs: [{ name: "renderer_", internalType: "address", type: "address" }],
    name: "rendererVersionOf",
    outputs: [
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
    ],
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
      { name: "newRecipient", internalType: "address", type: "address" },
    ],
    name: "setFeeRecipient",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
      { name: "enabled", internalType: "bool", type: "bool" },
    ],
    name: "setRendererEnabled",
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
    type: "function",
    inputs: [],
    name: "withdrawProtocolFees",
    outputs: [{ name: "amount", internalType: "uint256", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
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
    name: "FeeRecipientUpdated",
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
    name: "ProtocolFeesWithdrawn",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "rendererVersion",
        internalType: "uint32",
        type: "uint32",
        indexed: true,
      },
      { name: "enabled", internalType: "bool", type: "bool", indexed: false },
    ],
    name: "RendererEnabled",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      {
        name: "rendererVersion",
        internalType: "uint32",
        type: "uint32",
        indexed: true,
      },
      {
        name: "renderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "runtimeCodehash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: true,
      },
    ],
    name: "RendererRegistered",
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
        name: "rendererVersion",
        internalType: "uint32",
        type: "uint32",
        indexed: true,
      },
      {
        name: "renderer",
        internalType: "address",
        type: "address",
        indexed: true,
      },
      {
        name: "runtimeCodehash",
        internalType: "bytes32",
        type: "bytes32",
        indexed: false,
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
  { type: "error", inputs: [], name: "InexactTokenTransfer" },
  { type: "error", inputs: [], name: "InvalidAddress" },
  { type: "error", inputs: [], name: "InvalidContract" },
  { type: "error", inputs: [], name: "InvalidPageSize" },
  { type: "error", inputs: [], name: "InvalidPeriodDuration" },
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
  { type: "error", inputs: [], name: "OnlyFeeRecipient" },
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
  { type: "error", inputs: [], name: "ReentrancyGuardReentrantCall" },
  {
    type: "error",
    inputs: [
      { name: "renderer", internalType: "address", type: "address" },
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
    ],
    name: "RendererAlreadyRegistered",
  },
  {
    type: "error",
    inputs: [
      { name: "renderer", internalType: "address", type: "address" },
      { name: "expected", internalType: "bytes32", type: "bytes32" },
      { name: "actual", internalType: "bytes32", type: "bytes32" },
    ],
    name: "RendererCodeChanged",
  },
  {
    type: "error",
    inputs: [
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
    ],
    name: "RendererNotEnabled",
  },
  {
    type: "error",
    inputs: [
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
      { name: "enabled", internalType: "bool", type: "bool" },
    ],
    name: "RendererStatusUnchanged",
  },
  {
    type: "error",
    inputs: [{ name: "token", internalType: "address", type: "address" }],
    name: "SafeERC20FailedOperation",
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
  {
    type: "error",
    inputs: [{ name: "origin", internalType: "address", type: "address" }],
    name: "UnauthorizedDeploymentOrigin",
  },
  {
    type: "error",
    inputs: [
      { name: "rendererVersion", internalType: "uint32", type: "uint32" },
    ],
    name: "UnknownRendererVersion",
  },
  {
    type: "error",
    inputs: [{ name: "chainId", internalType: "uint256", type: "uint256" }],
    name: "UnsupportedRobinhoodChain",
  },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// TestnetUSDG
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const testnetUsdgAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    inputs: [],
    name: "ROBINHOOD_TESTNET_CHAIN_ID",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "owner", internalType: "address", type: "address" },
      { name: "spender", internalType: "address", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "spender", internalType: "address", type: "address" },
      { name: "value", internalType: "uint256", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "account", internalType: "address", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", internalType: "uint8", type: "uint8" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [
      { name: "recipient", internalType: "address", type: "address" },
      { name: "amount", internalType: "uint256", type: "uint256" },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "owner",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
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
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "to", internalType: "address", type: "address" },
      { name: "value", internalType: "uint256", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "from", internalType: "address", type: "address" },
      { name: "to", internalType: "address", type: "address" },
      { name: "value", internalType: "uint256", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
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
      {
        name: "value",
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
      { name: "from", internalType: "address", type: "address", indexed: true },
      { name: "to", internalType: "address", type: "address", indexed: true },
      {
        name: "value",
        internalType: "uint256",
        type: "uint256",
        indexed: false,
      },
    ],
    name: "Transfer",
  },
  {
    type: "error",
    inputs: [
      { name: "spender", internalType: "address", type: "address" },
      { name: "allowance", internalType: "uint256", type: "uint256" },
      { name: "needed", internalType: "uint256", type: "uint256" },
    ],
    name: "ERC20InsufficientAllowance",
  },
  {
    type: "error",
    inputs: [
      { name: "sender", internalType: "address", type: "address" },
      { name: "balance", internalType: "uint256", type: "uint256" },
      { name: "needed", internalType: "uint256", type: "uint256" },
    ],
    name: "ERC20InsufficientBalance",
  },
  {
    type: "error",
    inputs: [{ name: "approver", internalType: "address", type: "address" }],
    name: "ERC20InvalidApprover",
  },
  {
    type: "error",
    inputs: [{ name: "receiver", internalType: "address", type: "address" }],
    name: "ERC20InvalidReceiver",
  },
  {
    type: "error",
    inputs: [{ name: "sender", internalType: "address", type: "address" }],
    name: "ERC20InvalidSender",
  },
  {
    type: "error",
    inputs: [{ name: "spender", internalType: "address", type: "address" }],
    name: "ERC20InvalidSpender",
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
  {
    type: "error",
    inputs: [{ name: "origin", internalType: "address", type: "address" }],
    name: "UnauthorizedDeploymentOrigin",
  },
  {
    type: "error",
    inputs: [{ name: "chainId", internalType: "uint256", type: "uint256" }],
    name: "UnsupportedChain",
  },
] as const;

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
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"rendererRuntimeCodehash"`
 */
export const useReadMembershipTierRendererRuntimeCodehash =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "rendererRuntimeCodehash",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"rendererVersion"`
 */
export const useReadMembershipTierRendererVersion =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "rendererVersion",
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
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalReferralLiability"`
 */
export const useReadMembershipTierTotalReferralLiability =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalReferralLiability",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"totalShares"`
 */
export const useReadMembershipTierTotalShares =
  /*#__PURE__*/ createUseReadContract({
    abi: membershipTierAbi,
    functionName: "totalShares",
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
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"synchronize"`
 */
export const useWriteMembershipTierSynchronize =
  /*#__PURE__*/ createUseWriteContract({
    abi: membershipTierAbi,
    functionName: "synchronize",
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
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link membershipTierAbi}__ and `functionName` set to `"synchronize"`
 */
export const useSimulateMembershipTierSynchronize =
  /*#__PURE__*/ createUseSimulateContract({
    abi: membershipTierAbi,
    functionName: "synchronize",
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
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"MembershipSynchronized"`
 */
export const useWatchMembershipTierMembershipSynchronizedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "MembershipSynchronized",
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
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link membershipTierAbi}__ and `eventName` set to `"RewardClaimed"`
 */
export const useWatchMembershipTierRewardClaimedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: membershipTierAbi,
    eventName: "RewardClaimed",
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
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__
 */
export const useReadRobinhoodMembershipFactory =
  /*#__PURE__*/ createUseReadContract({ abi: robinhoodMembershipFactoryAbi });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"deployer"`
 */
export const useReadRobinhoodMembershipFactoryDeployer =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "deployer",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"feeRecipient"`
 */
export const useReadRobinhoodMembershipFactoryFeeRecipient =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "feeRecipient",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"isRegisteredTier"`
 */
export const useReadRobinhoodMembershipFactoryIsRegisteredTier =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "isRegisteredTier",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"isTierSaltUsed"`
 */
export const useReadRobinhoodMembershipFactoryIsTierSaltUsed =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "isTierSaltUsed",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"maxPageSize"`
 */
export const useReadRobinhoodMembershipFactoryMaxPageSize =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "maxPageSize",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"mediaStoreFactory"`
 */
export const useReadRobinhoodMembershipFactoryMediaStoreFactory =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "mediaStoreFactory",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"mediaStoreFactoryRuntimeCodehash"`
 */
export const useReadRobinhoodMembershipFactoryMediaStoreFactoryRuntimeCodehash =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "mediaStoreFactoryRuntimeCodehash",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"owner"`
 */
export const useReadRobinhoodMembershipFactoryOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "owner",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"paymentToken"`
 */
export const useReadRobinhoodMembershipFactoryPaymentToken =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "paymentToken",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"pendingOwner"`
 */
export const useReadRobinhoodMembershipFactoryPendingOwner =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "pendingOwner",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"predictTierIdentity"`
 */
export const useReadRobinhoodMembershipFactoryPredictTierIdentity =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "predictTierIdentity",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"protocolFeeBps"`
 */
export const useReadRobinhoodMembershipFactoryProtocolFeeBps =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "protocolFeeBps",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"rendererCount"`
 */
export const useReadRobinhoodMembershipFactoryRendererCount =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "rendererCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"rendererRecord"`
 */
export const useReadRobinhoodMembershipFactoryRendererRecord =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "rendererRecord",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"rendererSchema"`
 */
export const useReadRobinhoodMembershipFactoryRendererSchema =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "rendererSchema",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"rendererVersionOf"`
 */
export const useReadRobinhoodMembershipFactoryRendererVersionOf =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "rendererVersionOf",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useReadRobinhoodMembershipFactoryRenounceOwnership =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "renounceOwnership",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"tierCount"`
 */
export const useReadRobinhoodMembershipFactoryTierCount =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "tierCount",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"tierForIdentity"`
 */
export const useReadRobinhoodMembershipFactoryTierForIdentity =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "tierForIdentity",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"tiers"`
 */
export const useReadRobinhoodMembershipFactoryTiers =
  /*#__PURE__*/ createUseReadContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "tiers",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__
 */
export const useWriteRobinhoodMembershipFactory =
  /*#__PURE__*/ createUseWriteContract({ abi: robinhoodMembershipFactoryAbi });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useWriteRobinhoodMembershipFactoryAcceptOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "acceptOwnership",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"createTier"`
 */
export const useWriteRobinhoodMembershipFactoryCreateTier =
  /*#__PURE__*/ createUseWriteContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "createTier",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"registerRenderer"`
 */
export const useWriteRobinhoodMembershipFactoryRegisterRenderer =
  /*#__PURE__*/ createUseWriteContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "registerRenderer",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"setFeeRecipient"`
 */
export const useWriteRobinhoodMembershipFactorySetFeeRecipient =
  /*#__PURE__*/ createUseWriteContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "setFeeRecipient",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"setRendererEnabled"`
 */
export const useWriteRobinhoodMembershipFactorySetRendererEnabled =
  /*#__PURE__*/ createUseWriteContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "setRendererEnabled",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteRobinhoodMembershipFactoryTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"withdrawProtocolFees"`
 */
export const useWriteRobinhoodMembershipFactoryWithdrawProtocolFees =
  /*#__PURE__*/ createUseWriteContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "withdrawProtocolFees",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__
 */
export const useSimulateRobinhoodMembershipFactory =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"acceptOwnership"`
 */
export const useSimulateRobinhoodMembershipFactoryAcceptOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "acceptOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"createTier"`
 */
export const useSimulateRobinhoodMembershipFactoryCreateTier =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "createTier",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"registerRenderer"`
 */
export const useSimulateRobinhoodMembershipFactoryRegisterRenderer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "registerRenderer",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"setFeeRecipient"`
 */
export const useSimulateRobinhoodMembershipFactorySetFeeRecipient =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "setFeeRecipient",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"setRendererEnabled"`
 */
export const useSimulateRobinhoodMembershipFactorySetRendererEnabled =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "setRendererEnabled",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateRobinhoodMembershipFactoryTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `functionName` set to `"withdrawProtocolFees"`
 */
export const useSimulateRobinhoodMembershipFactoryWithdrawProtocolFees =
  /*#__PURE__*/ createUseSimulateContract({
    abi: robinhoodMembershipFactoryAbi,
    functionName: "withdrawProtocolFees",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__
 */
export const useWatchRobinhoodMembershipFactoryEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"FeeRecipientUpdated"`
 */
export const useWatchRobinhoodMembershipFactoryFeeRecipientUpdatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "FeeRecipientUpdated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"OwnershipTransferStarted"`
 */
export const useWatchRobinhoodMembershipFactoryOwnershipTransferStartedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "OwnershipTransferStarted",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchRobinhoodMembershipFactoryOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "OwnershipTransferred",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"ProtocolFeesWithdrawn"`
 */
export const useWatchRobinhoodMembershipFactoryProtocolFeesWithdrawnEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "ProtocolFeesWithdrawn",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"RendererEnabled"`
 */
export const useWatchRobinhoodMembershipFactoryRendererEnabledEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "RendererEnabled",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"RendererRegistered"`
 */
export const useWatchRobinhoodMembershipFactoryRendererRegisteredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "RendererRegistered",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"TierArtConfigured"`
 */
export const useWatchRobinhoodMembershipFactoryTierArtConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "TierArtConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"TierCreated"`
 */
export const useWatchRobinhoodMembershipFactoryTierCreatedEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "TierCreated",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"TierMetadataConfigured"`
 */
export const useWatchRobinhoodMembershipFactoryTierMetadataConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "TierMetadataConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"TierRendererConfigured"`
 */
export const useWatchRobinhoodMembershipFactoryTierRendererConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "TierRendererConfigured",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link robinhoodMembershipFactoryAbi}__ and `eventName` set to `"TierTermsConfigured"`
 */
export const useWatchRobinhoodMembershipFactoryTierTermsConfiguredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "TierTermsConfigured",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__
 */
export const useReadTestnetUsdg = /*#__PURE__*/ createUseReadContract({
  abi: testnetUsdgAbi,
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"ROBINHOOD_TESTNET_CHAIN_ID"`
 */
export const useReadTestnetUsdgRobinhoodTestnetChainId =
  /*#__PURE__*/ createUseReadContract({
    abi: testnetUsdgAbi,
    functionName: "ROBINHOOD_TESTNET_CHAIN_ID",
  });

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"allowance"`
 */
export const useReadTestnetUsdgAllowance = /*#__PURE__*/ createUseReadContract({
  abi: testnetUsdgAbi,
  functionName: "allowance",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"balanceOf"`
 */
export const useReadTestnetUsdgBalanceOf = /*#__PURE__*/ createUseReadContract({
  abi: testnetUsdgAbi,
  functionName: "balanceOf",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"decimals"`
 */
export const useReadTestnetUsdgDecimals = /*#__PURE__*/ createUseReadContract({
  abi: testnetUsdgAbi,
  functionName: "decimals",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"name"`
 */
export const useReadTestnetUsdgName = /*#__PURE__*/ createUseReadContract({
  abi: testnetUsdgAbi,
  functionName: "name",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"owner"`
 */
export const useReadTestnetUsdgOwner = /*#__PURE__*/ createUseReadContract({
  abi: testnetUsdgAbi,
  functionName: "owner",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"symbol"`
 */
export const useReadTestnetUsdgSymbol = /*#__PURE__*/ createUseReadContract({
  abi: testnetUsdgAbi,
  functionName: "symbol",
});

/**
 * Wraps __{@link useReadContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"totalSupply"`
 */
export const useReadTestnetUsdgTotalSupply =
  /*#__PURE__*/ createUseReadContract({
    abi: testnetUsdgAbi,
    functionName: "totalSupply",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testnetUsdgAbi}__
 */
export const useWriteTestnetUsdg = /*#__PURE__*/ createUseWriteContract({
  abi: testnetUsdgAbi,
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"approve"`
 */
export const useWriteTestnetUsdgApprove = /*#__PURE__*/ createUseWriteContract({
  abi: testnetUsdgAbi,
  functionName: "approve",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"mint"`
 */
export const useWriteTestnetUsdgMint = /*#__PURE__*/ createUseWriteContract({
  abi: testnetUsdgAbi,
  functionName: "mint",
});

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useWriteTestnetUsdgRenounceOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: testnetUsdgAbi,
    functionName: "renounceOwnership",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"transfer"`
 */
export const useWriteTestnetUsdgTransfer = /*#__PURE__*/ createUseWriteContract(
  { abi: testnetUsdgAbi, functionName: "transfer" },
);

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useWriteTestnetUsdgTransferFrom =
  /*#__PURE__*/ createUseWriteContract({
    abi: testnetUsdgAbi,
    functionName: "transferFrom",
  });

/**
 * Wraps __{@link useWriteContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useWriteTestnetUsdgTransferOwnership =
  /*#__PURE__*/ createUseWriteContract({
    abi: testnetUsdgAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testnetUsdgAbi}__
 */
export const useSimulateTestnetUsdg = /*#__PURE__*/ createUseSimulateContract({
  abi: testnetUsdgAbi,
});

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"approve"`
 */
export const useSimulateTestnetUsdgApprove =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testnetUsdgAbi,
    functionName: "approve",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"mint"`
 */
export const useSimulateTestnetUsdgMint =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testnetUsdgAbi,
    functionName: "mint",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"renounceOwnership"`
 */
export const useSimulateTestnetUsdgRenounceOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testnetUsdgAbi,
    functionName: "renounceOwnership",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"transfer"`
 */
export const useSimulateTestnetUsdgTransfer =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testnetUsdgAbi,
    functionName: "transfer",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"transferFrom"`
 */
export const useSimulateTestnetUsdgTransferFrom =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testnetUsdgAbi,
    functionName: "transferFrom",
  });

/**
 * Wraps __{@link useSimulateContract}__ with `abi` set to __{@link testnetUsdgAbi}__ and `functionName` set to `"transferOwnership"`
 */
export const useSimulateTestnetUsdgTransferOwnership =
  /*#__PURE__*/ createUseSimulateContract({
    abi: testnetUsdgAbi,
    functionName: "transferOwnership",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link testnetUsdgAbi}__
 */
export const useWatchTestnetUsdgEvent =
  /*#__PURE__*/ createUseWatchContractEvent({ abi: testnetUsdgAbi });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link testnetUsdgAbi}__ and `eventName` set to `"Approval"`
 */
export const useWatchTestnetUsdgApprovalEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: testnetUsdgAbi,
    eventName: "Approval",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link testnetUsdgAbi}__ and `eventName` set to `"OwnershipTransferred"`
 */
export const useWatchTestnetUsdgOwnershipTransferredEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: testnetUsdgAbi,
    eventName: "OwnershipTransferred",
  });

/**
 * Wraps __{@link useWatchContractEvent}__ with `abi` set to __{@link testnetUsdgAbi}__ and `eventName` set to `"Transfer"`
 */
export const useWatchTestnetUsdgTransferEvent =
  /*#__PURE__*/ createUseWatchContractEvent({
    abi: testnetUsdgAbi,
    eventName: "Transfer",
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
