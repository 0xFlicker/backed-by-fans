import {
  decodeEventLog,
  isAddressEqual,
  type Address,
  type TransactionReceipt,
} from "viem";
import { protocolBuybackVaultAbi } from "@/contracts";

/** Called only after wagmi/viem supplies a successful receipt. */
export function receiptBuyback(
  receipt: TransactionReceipt,
  input: {
    vault: Address;
    asset: Address;
    bucket: 0 | 1;
    amount: bigint;
    revision: bigint;
  },
) {
  if (receipt.status !== "success") return undefined;
  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, input.vault)) continue;
    let event;
    try {
      event = decodeEventLog({
        abi: protocolBuybackVaultAbi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (
      event.eventName === "BuybackBurned" &&
      isAddressEqual(event.args.input, input.asset) &&
      event.args.bucket === input.bucket &&
      event.args.revision === input.revision &&
      event.args.inputSpent > 0n &&
      event.args.inputSpent <= input.amount &&
      event.args.burned > 0n
    ) {
      return {
        burned: event.args.burned,
        spent: event.args.inputSpent,
        sequence: event.args.sequence,
      };
    }
    if (
      event.eventName === "DirectBurned" &&
      isAddressEqual(event.args.token, input.asset) &&
      event.args.bucket === input.bucket &&
      input.revision === 0n &&
      event.args.amount === input.amount &&
      event.args.amount > 0n
    ) {
      return {
        burned: event.args.amount,
        spent: event.args.amount,
        sequence: event.args.sequence,
      };
    }
  }
  return undefined;
}
