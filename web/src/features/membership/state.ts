import { getAddress, isAddress, parseUnits, type Address } from "viem";

import {
  previewPaymentSplit,
  type SplitPreview,
} from "@/features/creator/config";
import { isSameAddress } from "@/lib/address";

export type MembershipActionState =
  | "unready"
  | "joinable"
  | "active"
  | "expired-occupied"
  | "historical-synchronized";

export function classifyMembershipState(input: {
  walletReady: boolean;
  tokenId: bigint;
  active?: boolean;
  occupied?: boolean;
}): MembershipActionState {
  if (!input.walletReady) return "unready";
  if (input.tokenId === 0n) return "joinable";
  if (input.active) return "active";
  return input.occupied ? "expired-occupied" : "historical-synchronized";
}

export type PaymentPreview = {
  gross: bigint;
  duration: bigint;
  resultingExpiration: bigint;
  exactApproval: bigint;
  sharesAdded: bigint;
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
      : previewPaymentSplit(gross, input.rewardBps, input.referralBps);
  const base =
    input.currentExpiration > input.now ? input.currentExpiration : input.now;

  return {
    gross,
    duration,
    resultingExpiration: base + duration,
    exactApproval: input.allowance < gross ? gross : 0n,
    sharesAdded: gross,
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

export function parseUsdg(value: string): bigint | undefined {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) return undefined;
  try {
    const parsed = parseUnits(normalized, 6);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}
