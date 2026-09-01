import type { Address, ContractFunctionReturnType, Hex } from "viem";

import type { membershipTierAbi } from "@/contracts";

export type ProtocolDependencySnapshot = {
  chainId: 4663 | 46630 | 31337;
  factory: Address;
  paymentToken: Address;
  rendererSchema: Hex;
  renderer: Address;
  rendererName: string;
  rendererEngineCount: number;
  rendererEngineNames: readonly string[];
  previewHarness: Address;
  mediaStoreFactory: Address;
  mediaStoreFactoryRuntimeCodehash: Hex;
};

export type TierArtConfig = ContractFunctionReturnType<
  typeof membershipTierAbi,
  "view",
  "artConfig"
>;

export type TierMediaConfig = ContractFunctionReturnType<
  typeof membershipTierAbi,
  "view",
  "mediaConfig"
>;

export type TierSummary = {
  address: Address;
  name: string;
  symbol: string;
  creator: Address;
  pricePerPeriod: bigint;
  periodDuration: bigint;
  paused: boolean;
};

export type TierSnapshot = TierSummary & {
  description: string;
  externalURI: string;
  tierIdentity: Hex;
  art: TierArtConfig;
  media: TierMediaConfig;
  rewardBps: number;
  referralBps: number;
  supplyCap: bigint;
  occupiedSupply: bigint;
  maxPrepaidPeriods: bigint;
  paymentToken: Address;
  factory: Address;
  renderer: Address;
  protocolDependencies: ProtocolDependencySnapshot;
};

export type TierManagementSnapshot = TierSnapshot & {
  pendingOwner: Address;
  creatorProceeds: bigint;
  totalMinted: bigint;
};

export type ReferralStatus = "unset" | "locked-none" | "locked-address";

export type SupporterCredential = {
  tokenId: bigint;
  owner: Address;
  active: boolean;
  occupied: boolean;
  expiration: bigint;
  paidSeconds: bigint;
  grantSeconds: bigint;
  shares: bigint;
  claimableReward: bigint;
  refundableGross: bigint;
  referralStatus: ReferralStatus;
  referrer: Address;
};

export type TierSupporterSnapshot = TierSnapshot & {
  capturedTimestamp: bigint;
  wallet?: Address;
  walletUsdgBalance?: bigint;
  walletEthBalance?: bigint;
  allowance?: bigint;
  claimableReferral?: bigint;
  creatorProceeds?: bigint;
  credential?: SupporterCredential;
};

export type CatalogPage = {
  capturedBlock: bigint;
  total: bigint;
  offset: bigint;
  limit: number;
  addresses: Address[];
  nextOffset: bigint | null;
};
