import type { Address, ContractFunctionReturnType, Hex } from "viem";

import type { membershipTierAbi } from "@/contracts";
import type { AcceptedPaymentToken } from "@/lib/payment-token-read";

export type ProtocolDependencySnapshot = {
  chainId: 4663 | 46630 | 31337;
  factory: Address;
  paymentTokens: readonly Address[];
  rendererSchema: Hex;
  renderer: Address;
  rendererName: string;
  rendererEngineCount: number;
  rendererEngineNames: readonly string[];
  previewHarness: Address;
  mediaStoreFactory: Address;
  mediaStoreFactoryRuntimeCodehash: Hex;
};

export type ProtocolCustodyIdentity = {
  protocolToken: Address;
  buybackVault: Address;
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

export type RefundQuote = ContractFunctionReturnType<
  typeof membershipTierAbi,
  "view",
  "previewRefund"
>;

export type TierSummary = {
  address: Address;
  name: string;
  symbol: string;
  creator: Address;
  paymentToken: Address;
  pricePerPeriod: bigint;
  periodDuration: bigint;
  paused: boolean;
};

export type CatalogTierSummary = TierSummary & {
  description: string;
  externalURI: string;
  renderer: Address;
  art: TierArtConfig;
  media: TierMediaConfig;
  artworkRevision: Hex;
};

export type TierSnapshot = TierSummary & {
  minimumPayment: bigint;
  description: string;
  externalURI: string;
  tierIdentity: Hex;
  art: TierArtConfig;
  media: TierMediaConfig;
  rewardBps: number;
  protocolFeeBps: number;
  referralBps: number;
  startingBoostBps: number;
  earlySupportGross: bigint;
  grossPaid: bigint;
  accounting: ContractFunctionReturnType<
    typeof membershipTierAbi,
    "view",
    "accountingStatus"
  >;
  supplyCap: bigint;
  occupiedSupply: bigint;
  maxPrepaidPeriods: bigint;
  paymentToken: Address;
  paymentTokenState?: AcceptedPaymentToken;
  factory: Address;
  renderer: Address;
  protocolDependencies: ProtocolDependencySnapshot;
};

export type TierManagementSnapshot = TierSnapshot & {
  pendingOwner: Address;
  creatorProceeds: bigint;
  totalMinted: bigint;
  reserves: ContractFunctionReturnType<
    typeof membershipTierAbi,
    "view",
    "reserveState"
  >;
};

export type ReferralStatus = "unset" | "locked-none" | "locked-address";

export type SupporterCredential = {
  tokenId: bigint;
  owner: Address;
  minted: boolean;
  active: boolean;
  occupied: boolean;
  expiration: bigint;
  paidSeconds: bigint;
  grantSeconds: bigint;
  shares: bigint;
  rewardEligible: boolean;
  claimableReward: bigint;
  refundableGross: bigint;
  refund?: RefundQuote;
  referralStatus: ReferralStatus;
  referrer: Address;
};

export type TierSupporterSnapshot = TierSnapshot & {
  totalEligibleRewardShares?: bigint;
  capturedTimestamp: bigint;
  wallet?: Address;
  walletPaymentTokenBalance?: bigint;
  walletEthBalance?: bigint;
  allowance?: bigint;
  claimableReferral?: bigint;
  creatorProceeds?: bigint;
  credential?: SupporterCredential;
  vesting?: {
    earned: ContractFunctionReturnType<
      typeof membershipTierAbi,
      "view",
      "previewAccounting"
    >["settled"];
    preview: ContractFunctionReturnType<
      typeof membershipTierAbi,
      "view",
      "previewAccounting"
    >;
    reserves: ContractFunctionReturnType<
      typeof membershipTierAbi,
      "view",
      "reserveState"
    >;
    allocation:
      | ContractFunctionReturnType<
          typeof membershipTierAbi,
          "view",
          "allocationState"
        >
      | undefined;
  };
};

export type CatalogPage = {
  capturedBlock: bigint;
  total: bigint;
  offset: bigint;
  limit: number;
  addresses: Address[];
  nextOffset: bigint | null;
};
