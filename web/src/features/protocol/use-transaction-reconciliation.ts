"use client";

import { useEffect, useLayoutEffect, useRef, type Dispatch } from "react";
import {
  clearPendingWrite,
  loadPendingWrite,
  pendingWriteId,
  savePendingWrite,
  pendingWriteStorageKey,
  type DurableRecoveryResolution,
  type PendingWrite,
  type WriteIntent,
} from "@/features/protocol/pending-write";
import {
  reconcileTransaction,
  type TransactionLifecycle,
  type WriteReceipt,
} from "@/features/protocol/write-transaction";
import type { TransactionEvent } from "@/lib/transaction-state";

type Reconciliation = (receipt?: WriteReceipt) => Promise<unknown | undefined>;

type DurableRecoveryOptions = {
  recover: (pending: PendingWrite) => Promise<DurableRecoveryResolution>;
  onRecovered?: (
    resolution: Extract<DurableRecoveryResolution, { status: "reconciled" }>,
    pending: PendingWrite,
  ) => void;
};

type TrackedWrite = {
  pending: PendingWrite;
  reconcile: Reconciliation;
};

function browserStorage() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

async function withPendingWriteLock(action: () => void) {
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error(
      "Cross-tab recovery locking is unavailable. Use a supported browser before signing this write.",
    );
  }
  await navigator.locks.request(
    `${pendingWriteStorageKey}.lock`,
    { mode: "exclusive" },
    action,
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useTransactionReconciliation(
  dispatch: Dispatch<TransactionEvent>,
  contextKey: string,
  options: DurableRecoveryOptions,
) {
  const currentContext = useRef(contextKey);
  const currentOptions = useRef(options);
  const pending = useRef<TrackedWrite | undefined>(undefined);
  const mounted = useRef(true);
  const recheckInFlight = useRef<Promise<unknown | undefined> | undefined>(
    undefined,
  );

  useLayoutEffect(() => {
    currentContext.current = contextKey;
    currentOptions.current = options;
  }, [contextKey, options]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let stored: PendingWrite | undefined;
    try {
      const storage = browserStorage();
      stored = storage ? loadPendingWrite(storage) : undefined;
    } catch (error) {
      dispatch({
        type: "UNCERTAIN",
        error: errorMessage(
          error,
          "Browser-local recovery state could not be inspected.",
        ),
      });
      return;
    }
    if (stored) {
      if (pending.current?.pending.id !== stored.id) {
        pending.current = {
          pending: stored,
          reconcile: async () => undefined,
        };
      } else {
        pending.current.pending = stored;
      }
      if (stored.hash) dispatch({ type: "SUBMITTED", hash: stored.hash });
      if (stored.replacementHash && stored.replacementReason) {
        dispatch({
          type: "REPLACED",
          replacementHash: stored.replacementHash,
          reason: stored.replacementReason,
        });
      }
      dispatch({
        type: "UNCERTAIN",
        error:
          stored.contextKey === currentContext.current
            ? `${stored.label} is still awaiting an exact onchain outcome. Recheck it before preparing another write.`
            : `A pending ${stored.label.toLowerCase()} belongs to another wallet, chain, or contract. Return to its submitting context before rechecking it.`,
      });
      return;
    }
    if (pending.current && pending.current.pending.contextKey !== contextKey) {
      dispatch({
        type: "UNCERTAIN",
        error:
          "The wallet or chain changed after this action. Switch back to the submitting context before rechecking it.",
      });
    }
  }, [contextKey, dispatch]);

  function persist(tracked: TrackedWrite) {
    pending.current = tracked;
    const storage = browserStorage();
    if (storage) savePendingWrite(storage, tracked.pending);
  }

  function clear(id?: string) {
    const trackedId = id ?? pending.current?.pending.id;
    const storage = browserStorage();
    try {
      if (storage) clearPendingWrite(storage, trackedId);
    } catch (error) {
      dispatch({
        type: "UNCERTAIN",
        error: errorMessage(
          error,
          "Browser-local recovery state could not be cleared.",
        ),
      });
      return false;
    }
    if (!id || pending.current?.pending.id === id) pending.current = undefined;
    return true;
  }

  function track(input: {
    label: string;
    intent: WriteIntent;
    reconcile: Reconciliation;
  }): {
    reconcile: Reconciliation;
    lifecycle: TransactionLifecycle;
    clear: () => void;
  } {
    const pendingWrite: PendingWrite = {
      version: 1,
      id: pendingWriteId(),
      contextKey,
      label: input.label,
      armedAt: Date.now(),
      intent: input.intent,
    };
    let confirmedReceipt: WriteReceipt | undefined;

    const reconcile: Reconciliation = (receipt) => {
      if (currentContext.current !== pendingWrite.contextKey) {
        throw new Error(
          "The wallet or chain changed after submission. Switch back before reconciling this action.",
        );
      }
      confirmedReceipt ??= receipt;
      return input.reconcile(confirmedReceipt);
    };
    const tracked: TrackedWrite = { pending: pendingWrite, reconcile };
    const lifecycle: TransactionLifecycle = {
      onBeforeSubmit: () =>
        withPendingWriteLock(() => {
          const storage = browserStorage();
          if (!storage) {
            throw new Error(
              "Browser-local recovery storage is unavailable. Enable site storage before signing this write.",
            );
          }
          const existing = loadPendingWrite(storage);
          if (existing && existing.id !== tracked.pending.id) {
            throw new Error(
              `Recover the pending ${existing.label.toLowerCase()} before submitting another write.`,
            );
          }
          persist(tracked);
          if (loadPendingWrite(storage)?.id !== tracked.pending.id) {
            throw new Error(
              "The pending write lock could not verify its browser-local recovery record.",
            );
          }
        }),
      onSubmitted: (hash) => {
        tracked.pending = { ...tracked.pending, hash };
        persist(tracked);
      },
      onReplaced: (replacement) => {
        tracked.pending = {
          ...tracked.pending,
          replacementHash: replacement.hash,
          replacementReason: replacement.reason,
        };
        persist(tracked);
      },
    };
    return {
      reconcile,
      lifecycle,
      clear: () => clear(tracked.pending.id),
    };
  }

  async function recheckOnce() {
    if (!pending.current) {
      const storage = browserStorage();
      const stored = storage ? loadPendingWrite(storage) : undefined;
      if (!stored) return undefined;
      pending.current = { pending: stored, reconcile: async () => undefined };
    }
    const tracked = pending.current;
    if (tracked.pending.contextKey !== currentContext.current) {
      dispatch({
        type: "UNCERTAIN",
        error:
          "Switch back to the wallet, chain, and contract that submitted this action before rechecking it.",
      });
      return undefined;
    }

    const storage = browserStorage();
    const stored = storage ? loadPendingWrite(storage) : undefined;
    if (!stored) {
      const result = await reconcileTransaction({
        dispatch,
        reconcile: tracked.reconcile,
      });
      if (result !== undefined) clear(tracked.pending.id);
      return result;
    }

    dispatch({ type: "RECONCILE" });
    try {
      const recoveryContext = currentContext.current;
      const resolution = await currentOptions.current.recover(stored);
      const currentStored = storage ? loadPendingWrite(storage) : undefined;
      if (
        !mounted.current ||
        currentContext.current !== recoveryContext ||
        pending.current?.pending.id !== stored.id ||
        currentStored?.id !== stored.id
      ) {
        return undefined;
      }
      if (resolution.status === "reconciled") {
        dispatch({ type: "RECONCILED" });
        clear(stored.id);
        currentOptions.current.onRecovered?.(resolution, stored);
        return resolution.result;
      }
      if (resolution.status === "reverted") {
        dispatch({ type: "REVERTED", error: resolution.error });
        clear(stored.id);
        return undefined;
      }
      if (resolution.status === "cancelled") {
        dispatch({ type: "CANCELLED", error: resolution.error });
        clear(stored.id);
        return undefined;
      }
      dispatch({
        type: "UNCERTAIN",
        error:
          resolution.error ??
          "The requested postcondition is not visible at the latest checked block.",
      });
      return undefined;
    } catch (error) {
      dispatch({
        type: "UNCERTAIN",
        error:
          error instanceof Error
            ? error.message
            : "The exact onchain outcome could not be checked.",
      });
      return undefined;
    }
  }

  function recheck() {
    if (recheckInFlight.current) return recheckInFlight.current;
    const request = recheckOnce()
      .catch((error) => {
        dispatch({
          type: "UNCERTAIN",
          error: errorMessage(
            error,
            "The exact onchain outcome could not be checked.",
          ),
        });
        return undefined;
      })
      .finally(() => {
        if (recheckInFlight.current === request) {
          recheckInFlight.current = undefined;
        }
      });
    recheckInFlight.current = request;
    return request;
  }

  return { clear, recheck, track };
}
