import { parseEventLogs, type Address } from "viem";

import { factoryAbi, tierAbi } from "@/contracts/abis";
import type { WriteReceipt } from "@/features/protocol/write-transaction";
import { isSameAddress } from "@/lib/address";

export function receiptProvesProtocolWithdrawal(
  receipt: WriteReceipt | undefined,
  input: {
    factory: Address;
    recipient: Address;
    amount: bigint;
  },
) {
  if (!receipt?.logs || input.amount === 0n) return false;
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
  receipt: WriteReceipt | undefined,
  input: {
    tier: Address;
    owner: Address;
    amount: bigint;
  },
) {
  if (!receipt?.logs || input.amount === 0n) return false;
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
