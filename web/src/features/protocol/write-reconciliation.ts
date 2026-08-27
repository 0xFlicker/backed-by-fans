import type { Log, TransactionReceipt } from "viem";

import {
  decodeTransactionError,
  type TransactionEvent,
} from "@/lib/transaction-state";

export type SuccessfulWriteReceipt = TransactionReceipt & {
  status: "success";
};

export type SuccessfulReceiptLogs = { logs: Log[] };

export function isSuccessfulWriteReceipt(
  receipt: TransactionReceipt,
): receipt is SuccessfulWriteReceipt {
  return receipt.status === "success";
}

/**
 * Application reconciliation starts only after wagmi/viem returns a successful
 * receipt. It may inspect that receipt and refresh canonical domain reads; it
 * never looks up, polls for, or reconstructs a transaction outcome.
 */
export async function reconcileSuccessfulWrite<Result>(input: {
  receipt: SuccessfulWriteReceipt;
  reconcile: (receipt: SuccessfulWriteReceipt) => Promise<Result | undefined>;
  dispatch: (event: TransactionEvent) => void;
}): Promise<Result | undefined> {
  input.dispatch({ type: "RECONCILE" });
  try {
    const result = await input.reconcile(input.receipt);
    if (result === undefined) {
      input.dispatch({
        type: "UNCERTAIN",
        error:
          "The transaction receipt succeeded, but the expected onchain result is not visible in the latest direct read.",
      });
      return undefined;
    }
    input.dispatch({ type: "RECONCILED" });
    return result;
  } catch (error) {
    input.dispatch({
      type: "UNCERTAIN",
      error: `The transaction receipt succeeded, but the updated onchain state could not be verified. ${decodeTransactionError(error)}`,
    });
    return undefined;
  }
}
