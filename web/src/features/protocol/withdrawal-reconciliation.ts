import { parseEventLogs, type Address } from "viem";

import { membershipTierAbi } from "@/contracts";
import type { SuccessfulReceiptLogs } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

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
    abi: membershipTierAbi,
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
