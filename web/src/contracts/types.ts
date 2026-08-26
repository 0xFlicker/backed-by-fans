import type { Address } from "viem";

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
  imageURI: string;
  externalURI: string;
  rewardBps: number;
  referralBps: number;
  supplyCap: bigint;
  occupiedSupply: bigint;
  maxPrepaidPeriods: bigint;
  paymentToken: Address;
  factory: Address;
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
