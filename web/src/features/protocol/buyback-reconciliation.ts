import {
  decodeEventLog,
  parseEventLogs,
  isAddressEqual,
  type Address,
  type TransactionReceipt,
} from "viem";
import { protocolBuybackVaultAbi, protocolBurnRouterAbi } from "@/contracts";

/** Only the supplied successful receipt proves completed work; later balances may change. */
export function receiptAdvance(
  receipt: TransactionReceipt,
  input: { router: Address; caller: Address },
) {
  if (receipt.status !== "success") return undefined;
  const events = parseEventLogs({
    abi: protocolBurnRouterAbi,
    logs: receipt.logs,
  }).filter((event) => isAddressEqual(event.address, input.router));
  const completion = events.find(
    (event) =>
      event.eventName === "AdvanceCompleted" &&
      isAddressEqual(event.args.caller, input.caller),
  );
  if (!completion || completion.eventName !== "AdvanceCompleted")
    return undefined;
  return {
    completed: completion.args,
    accounting: events
      .filter((event) => event.eventName === "AccountingAdvanced")
      .map((event) => event.args),
    releases: events
      .filter((event) => event.eventName === "TierReleased")
      .map((event) => event.args),
    purchases: events
      .filter((event) => event.eventName === "PurchaseCompleted")
      .map((event) => event.args),
    skipped: events
      .filter((event) => event.eventName === "PurchaseSkipped")
      .map((event) => event.args),
  };
}

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

export function buybackSkipReason(status: number): string {
  const reasons = [
    "ready",
    "no released funds",
    "buybacks paused",
    "no trading route",
    "trading limits not configured",
    "below the buyback minimum",
    "cooldown",
    "launch penalty active",
    "graduation pending",
    "protocol token not launched",
  ];
  return reasons[status] ?? `status ${status}`;
}
