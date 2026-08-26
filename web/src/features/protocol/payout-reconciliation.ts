import { parseEventLogs, type Address } from "viem";

import { tierAbi } from "@/contracts/abis";
import type { WriteReceipt } from "@/features/protocol/write-transaction";
import { isSameAddress } from "@/lib/address";

export function receiptProvesRewardClaim(
  receipt: WriteReceipt | undefined,
  input: { tier: Address; tokenId: bigint; owner: Address; amount: bigint },
) {
  if (!receipt?.logs || input.amount === 0n) return false;
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
  receipt: WriteReceipt | undefined,
  input: { tier: Address; referrer: Address; amount: bigint },
) {
  if (!receipt?.logs || input.amount === 0n) return false;
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
  receipt: WriteReceipt | undefined,
  input: {
    tier: Address;
    tokenId: bigint;
    recipient: Address;
    tierOwner: Address;
  },
) {
  if (!receipt?.logs) return false;
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
