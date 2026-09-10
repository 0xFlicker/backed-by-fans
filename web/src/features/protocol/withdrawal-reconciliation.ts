import { parseEventLogs, type Address } from "viem";

import { membershipTierAbi } from "@/contracts";
import type { SuccessfulReceiptLogs } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

export function receiptCreatorWithdrawal(
  receipt: SuccessfulReceiptLogs,
  input: {
    tier: Address;
    owner: Address;
  },
) {
  const event = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "CreatorProceedsWithdrawn",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.owner, input.owner) &&
      event.args.amount > 0n,
  );
  return event
    ? { amount: event.args.amount, recipient: event.args.owner }
    : undefined;
}
