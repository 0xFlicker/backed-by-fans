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

export type CatalogPage = {
  capturedBlock: bigint;
  total: bigint;
  offset: bigint;
  limit: number;
  addresses: Address[];
  nextOffset: bigint | null;
};
