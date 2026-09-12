import { parseEventLogs, type Address } from "viem";

import { membershipFactoryAbi, membershipTierAbi } from "@/contracts";
import type { SuccessfulReceiptLogs } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

/** The final tier event summarizes the whole combined batch, after ledger events. */
export function receiptMembershipMaintenance(
  receipt: SuccessfulReceiptLogs,
  tier: Address,
) {
  return parseEventLogs({
    abi: membershipTierAbi,
    eventName: "AccountingProgress",
    logs: receipt.logs,
    strict: true,
  })
    .filter((event) => isSameAddress(event.address, tier))
    .at(-1)?.args;
}

export function receiptRetiredReward(
  receipt: SuccessfulReceiptLogs,
  input: { tier: Address; owner: Address },
) {
  const event = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "RetiredRewardClaimed",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.owner, input.owner),
  );
  return event
    ? { amount: event.args.amount, recipient: event.args.owner }
    : undefined;
}

export function receiptProvesPayment(
  receipt: SuccessfulReceiptLogs,
  input: {
    tier: Address;
    payer: Address;
    recipient: Address;
    gross: bigint;
    periods: bigint;
    tokenId?: bigint;
  },
) {
  if (input.periods === 0n) return false;
  return parseEventLogs({
    abi: membershipTierAbi,
    eventName: "PaymentProcessed",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.payer, input.payer) &&
      isSameAddress(event.args.recipient, input.recipient) &&
      event.args.gross === input.gross &&
      (input.tokenId === undefined || event.args.tokenId === input.tokenId) &&
      event.args.periods === input.periods,
  );
}

/** Execution-time shares from the supplied payment receipt, never a prior quote. */
export function receiptIssuedShares(
  receipt: SuccessfulReceiptLogs,
  tier: Address,
  tokenId: bigint,
) {
  return parseEventLogs({
    abi: membershipTierAbi,
    eventName: "SharesIssued",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      isSameAddress(event.address, tier) && event.args.tokenId === tokenId,
  )?.args;
}

export function receiptRewardClaim(
  receipt: SuccessfulReceiptLogs,
  input: { tier: Address; tokenId: bigint; owner: Address },
) {
  const event = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "RewardClaimed",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      event.args.tokenId === input.tokenId &&
      isSameAddress(event.args.owner, input.owner) &&
      event.args.amount > 0n,
  );
  return event
    ? { amount: event.args.amount, recipient: event.args.owner }
    : undefined;
}

export function receiptReferralClaim(
  receipt: SuccessfulReceiptLogs,
  input: { tier: Address; referrer: Address },
) {
  const event = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "ReferralClaimed",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.referrer, input.referrer) &&
      event.args.amount > 0n,
  );
  return event
    ? { amount: event.args.amount, recipient: event.args.referrer }
    : undefined;
}

export function receiptMembershipRefund(
  receipt: SuccessfulReceiptLogs,
  input: {
    tier: Address;
    tokenId: bigint;
    recipient: Address;
    maxGrossRefund: bigint;
  },
) {
  return parseEventLogs({
    abi: membershipTierAbi,
    eventName: "MembershipRefunded",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      event.args.tokenId === input.tokenId &&
      event.args.grossRefund <= input.maxGrossRefund &&
      isSameAddress(event.args.recipient, input.recipient),
  )?.args;
}

/** Reconcile the supplied factory receipt against its exact selected positions. */
export function receiptSelectedRewards(
  receipt: SuccessfulReceiptLogs,
  input: {
    factory: Address;
    owner: Address;
    selection: readonly { tier: Address; tokenIds: readonly bigint[] }[];
  },
) {
  const confirmed = parseEventLogs({
    abi: membershipFactoryAbi,
    eventName: "EverythingClaimed",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.factory) &&
      isSameAddress(event.args.beneficiary, input.owner) &&
      event.args.tierCount === BigInt(input.selection.length),
  );
  if (!confirmed)
    throw new Error(
      "The successful receipt did not confirm this selected claim.",
    );
  const results = input.selection.map(({ tier }) => ({
    tier,
    liveReward: 0n,
    retiredReward: 0n,
    referral: 0n,
    creator: 0n,
  }));
  const seen = new Set<string>();
  for (const event of parseEventLogs({
    abi: membershipTierAbi,
    eventName: [
      "RewardClaimed",
      "RetiredRewardClaimed",
      "ReferralClaimed",
      "CreatorProceedsWithdrawn",
    ],
    logs: receipt.logs,
    strict: true,
  })) {
    const index = input.selection.findIndex((item) =>
      isSameAddress(item.tier, event.address),
    );
    if (index < 0) continue;
    const selected = input.selection[index];
    const owner =
      event.eventName === "ReferralClaimed"
        ? event.args.referrer
        : event.args.owner;
    if (
      !isSameAddress(owner, input.owner) ||
      (event.eventName === "RewardClaimed" &&
        !selected.tokenIds.includes(event.args.tokenId))
    ) {
      throw new Error(
        "The receipt contains an unexpected reward beneficiary or position.",
      );
    }
    const key = `${event.address.toLowerCase()}:${event.eventName}:${event.eventName === "RewardClaimed" ? event.args.tokenId : "owner"}`;
    if (seen.has(key))
      throw new Error(
        "The receipt repeats a reward payout category or position.",
      );
    seen.add(key);
    const category =
      event.eventName === "RewardClaimed"
        ? "liveReward"
        : event.eventName === "RetiredRewardClaimed"
          ? "retiredReward"
          : event.eventName === "ReferralClaimed"
            ? "referral"
            : "creator";
    results[index][category] += event.args.amount;
  }
  return results;
}
