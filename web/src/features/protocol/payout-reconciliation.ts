import { parseEventLogs, type Address } from "viem";

import { tierAbi } from "@/contracts/abis";
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
  },
) {
  if (input.periods === 0n) return false;
  return parseEventLogs({
    abi: tierAbi,
    eventName: "PaymentProcessed",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.payer, input.payer) &&
      isSameAddress(event.args.recipient, input.recipient) &&
      event.args.gross === input.gross &&
      event.args.periods === input.periods,
  );
}

export function receiptProvesRewardClaim(
  receipt: SuccessfulReceiptLogs,
  input: { tier: Address; tokenId: bigint; owner: Address; amount: bigint },
) {
  if (input.amount === 0n) return false;
  return parseEventLogs({
    abi: tierAbi,
    eventName: "RewardClaimed",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      event.args.tokenId === input.tokenId &&
      isSameAddress(event.args.owner, input.owner) &&
      event.args.amount >= input.amount,
  );
}

export function receiptProvesReferralClaim(
  receipt: SuccessfulReceiptLogs,
  input: { tier: Address; referrer: Address; amount: bigint },
) {
  if (input.amount === 0n) return false;
  return parseEventLogs({
    abi: tierAbi,
    eventName: "ReferralClaimed",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.referrer, input.referrer) &&
      event.args.amount >= input.amount,
  );
}

export function receiptProvesMembershipRefund(
  receipt: SuccessfulReceiptLogs,
  input: {
    tier: Address;
    tokenId: bigint;
    recipient: Address;
    tierOwner: Address;
  },
) {
  return parseEventLogs({
    abi: tierAbi,
    eventName: "MembershipRefunded",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      event.args.tokenId === input.tokenId &&
      isSameAddress(event.args.recipient, input.recipient) &&
      isSameAddress(event.args.tierOwner, input.tierOwner),
  );
}
