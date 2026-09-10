import { parseEventLogs, type Address } from "viem";

import { membershipTierAbi } from "@/contracts";
import type { SuccessfulReceiptLogs } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

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
