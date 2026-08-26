"use client";

import { useEffect, useRef, type Dispatch } from "react";

import {
  reconcileTransaction,
  type WriteReceipt,
} from "@/features/protocol/write-transaction";
import type { TransactionEvent } from "@/lib/transaction-state";

type Reconciliation = (receipt?: WriteReceipt) => Promise<unknown | undefined>;

export function useTransactionReconciliation(
  dispatch: Dispatch<TransactionEvent>,
  contextKey: string,
) {
  const currentContext = useRef(contextKey);
  const pending = useRef<
    { contextKey: string; reconcile: Reconciliation } | undefined
  >(undefined);

  useEffect(() => {
    currentContext.current = contextKey;
    if (pending.current && pending.current.contextKey !== contextKey) {
      dispatch({
        type: "UNCERTAIN",
        error:
          "The wallet or chain changed after this action. Switch back to the submitting context before rechecking it.",
      });
    }
  }, [contextKey, dispatch]);

  function track<Result>(
    reconcile: (receipt?: WriteReceipt) => Promise<Result | undefined>,
  ): (receipt?: WriteReceipt) => Promise<Result | undefined> {
    const tracked = { contextKey, reconcile };
    pending.current = tracked;
    return (receipt) => {
      if (currentContext.current !== tracked.contextKey) {
        throw new Error(
          "The wallet or chain changed after submission. Switch back before reconciling this action.",
        );
      }
      return reconcile(receipt);
    };
  }

  function clear() {
    pending.current = undefined;
  }

  async function recheck() {
    if (!pending.current) return undefined;
    if (pending.current.contextKey !== currentContext.current) {
      dispatch({
        type: "UNCERTAIN",
        error:
          "Switch back to the wallet and chain that submitted this action before rechecking it.",
      });
      return undefined;
    }
    const result = await reconcileTransaction({
      dispatch,
      reconcile: pending.current.reconcile,
    });
    if (result !== undefined) clear();
    return result;
  }

  return { clear, recheck, track };
}
