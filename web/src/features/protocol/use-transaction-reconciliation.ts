"use client";

import { useRef, type Dispatch } from "react";

import {
  reconcileTransaction,
  type WriteReceipt,
} from "@/features/protocol/write-transaction";
import type { TransactionEvent } from "@/lib/transaction-state";

type Reconciliation = (receipt?: WriteReceipt) => Promise<unknown | undefined>;

export function useTransactionReconciliation(
  dispatch: Dispatch<TransactionEvent>,
) {
  const pending = useRef<Reconciliation | undefined>(undefined);

  function track<Result>(
    reconcile: (receipt?: WriteReceipt) => Promise<Result | undefined>,
  ): (receipt?: WriteReceipt) => Promise<Result | undefined> {
    pending.current = reconcile;
    return reconcile;
  }

  function clear() {
    pending.current = undefined;
  }

  async function recheck() {
    if (!pending.current) return undefined;
    const result = await reconcileTransaction({
      dispatch,
      reconcile: pending.current,
    });
    if (result !== undefined) clear();
    return result;
  }

  return { clear, recheck, track };
}
