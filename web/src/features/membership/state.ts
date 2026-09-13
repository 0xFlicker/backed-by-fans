import { getAddress, isAddress, type Address, type PublicClient } from "viem";

import { membershipTierAbi } from "@/contracts";
import {
  receiptIssuedShares,
  receiptProvesPayment,
} from "@/features/protocol/payout-reconciliation";
import type { SuccessfulReceiptLogs } from "@/features/protocol/write-reconciliation";

import {
  previewPaymentSplit,
  type SplitPreview,
} from "@/features/creator/config";
import { isSameAddress } from "@/lib/address";
import { displayedToRaw } from "@/lib/token-amount";

export type MembershipIntent =
  { kind: "new" } | { kind: "renew"; tokenId: bigint; expiration: bigint };

export function positionKey(chainId: number, tier: Address, tokenId: bigint) {
  return `${chainId}:${tier.toLowerCase()}:${tokenId}`;
}

export function membershipPaymentCall(input: {
  intent: MembershipIntent;
  now: bigint;
  periods: bigint;
  gross: bigint;
  pricePerPeriod: bigint;
  referralChoice: Address;
  maxAccountingSteps?: bigint;
}) {
  const { intent, referralChoice } = input;
  const maxAccountingSteps = input.maxAccountingSteps ?? 25n;
  if (
    intent.kind === "renew" &&
    (intent.tokenId === 0n || intent.expiration <= input.now)
  ) {
    throw new Error(
      "This membership has ended. Choose New membership to return.",
    );
  }
  if (input.pricePerPeriod === 0n) {
    return intent.kind === "new"
      ? {
          functionName: "createContributionMembership" as const,
          args: [input.gross, referralChoice, maxAccountingSteps] as const,
        }
      : {
          functionName: "renewContributionMembership" as const,
          args: [
            intent.tokenId,
            input.gross,
            referralChoice,
            maxAccountingSteps,
          ] as const,
        };
  }
  return intent.kind === "new"
    ? {
        functionName: "createMembership" as const,
        args: [input.periods, referralChoice, maxAccountingSteps] as const,
      }
    : {
        functionName: "renewMembership" as const,
        args: [
          intent.tokenId,
          input.periods,
          referralChoice,
          maxAccountingSteps,
        ] as const,
      };
}

/** A quote at the snapshot block reserves neither curve position nor shares. */
export async function readRewardQuote(
  client: PublicClient,
  input: {
    tier: Address;
    gross: bigint;
    blockNumber: bigint;
  },
) {
  const quote = await client.readContract({
    address: input.tier,
    abi: membershipTierAbi,
    functionName: "previewShares",
    args: [input.gross],
    blockNumber: input.blockNumber,
  });
  return quote;
}

/** Canonical weight may have grown again since this successful payment. */
export function reconcilePaymentWeight(
  receipt: SuccessfulReceiptLogs,
  input: {
    tier: Address;
    payer: Address;
    recipient: Address;
    gross: bigint;
    periods: bigint;
    tokenId: bigint;
    shares: bigint;
  },
) {
  if (!receiptProvesPayment(receipt, input)) return undefined;
  if (input.gross === 0n) return 0n;
  const issued = receiptIssuedShares(receipt, input.tier, input.tokenId);
  return issued && input.shares >= issued.tokenShares
    ? issued.amount
    : undefined;
}

export function averageRewardBoost(shares: bigint, gross: bigint) {
  if (gross === 0n) return "0×";
  return `${Number((shares * 10000n) / gross) / 10000}×`;
}

export type MembershipActionState =
  "unready" | "joinable" | "active" | "expired-pending" | "retired";

export function classifyMembershipState(input: {
  walletReady: boolean;
  tokenId: bigint;
  active?: boolean;
  occupied?: boolean;
}): MembershipActionState {
  if (!input.walletReady) return "unready";
  if (input.tokenId === 0n) return "joinable";
  if (input.active) return "active";
  return input.occupied ? "expired-pending" : "retired";
}

export type PaymentPreview = {
  gross: bigint;
  duration: bigint;
  resultingExpiration: bigint;
  exactApproval: bigint;
  split?: SplitPreview;
  appliedReferral: bigint;
  appliedCreator: bigint;
};

export function buildPaymentPreview(input: {
  now: bigint;
  currentExpiration: bigint;
  periodDuration: bigint;
  periods: bigint;
  pricePerPeriod: bigint;
  contribution: bigint;
  allowance: bigint;
  rewardBps: number;
  protocolFeeBps: number;
  referralBps: number;
  referralApplies: boolean;
}): PaymentPreview {
  const duration = input.periodDuration * input.periods;
  const gross =
    input.pricePerPeriod === 0n
      ? input.contribution
      : input.pricePerPeriod * input.periods;
  const split =
    gross === 0n
      ? undefined
      : previewPaymentSplit(
          gross,
          input.protocolFeeBps,
          input.rewardBps,
          input.referralBps,
        );
  const base =
    input.currentExpiration > input.now ? input.currentExpiration : input.now;

  return {
    gross,
    duration,
    resultingExpiration: base + duration,
    exactApproval: input.allowance < gross ? gross : 0n,
    split,
    appliedReferral: split && input.referralApplies ? split.referral : 0n,
    appliedCreator: split
      ? input.referralApplies
        ? split.creatorReferred
        : split.creatorUnreferred
      : 0n,
  };
}

export function validateGift(
  payer: Address,
  recipientInput: string,
  pricePerPeriod: bigint,
) {
  const value = recipientInput.trim();
  if (!isAddress(value)) return "Enter a valid gift recipient address.";
  const recipient = getAddress(value);
  if (isSameAddress(recipient, payer)) {
    return "Use the primary membership action instead of gifting to yourself.";
  }
  if (pricePerPeriod === 0n) {
    return "Zero-price tiers allow self-actions only and cannot be gifted.";
  }
  return undefined;
}

export function parsePaymentAmount(
  value: string,
  token: { decimals: number; uiMultiplier: bigint },
): bigint | undefined {
  try {
    const parsed = displayedToRaw({
      displayed: value,
      decimals: token.decimals,
      multiplier: token.uiMultiplier,
    });
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}
