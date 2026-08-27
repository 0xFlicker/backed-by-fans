import { parseEventLogs, type Address } from "viem";

import { factoryAbi, tierAbi } from "@/contracts/abis";
import type { SuccessfulReceiptLogs } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

export function receiptProvesProtocolWithdrawal(
  receipt: SuccessfulReceiptLogs,
  input: {
    factory: Address;
    recipient: Address;
    amount: bigint;
  },
) {
  if (input.amount === 0n) return false;
  return parseEventLogs({
    abi: factoryAbi,
    eventName: "ProtocolFeesWithdrawn",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.factory) &&
      isSameAddress(event.args.recipient, input.recipient) &&
      event.args.amount >= input.amount,
  );
}

export function receiptProvesCreatorWithdrawal(
  receipt: SuccessfulReceiptLogs,
  input: {
    tier: Address;
    owner: Address;
    amount: bigint;
  },
) {
  if (input.amount === 0n) return false;
  return parseEventLogs({
    abi: tierAbi,
    eventName: "CreatorProceedsWithdrawn",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.owner, input.owner) &&
      event.args.amount >= input.amount,
  );
}
