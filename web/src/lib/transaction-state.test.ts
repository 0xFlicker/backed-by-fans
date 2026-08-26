import { describe, expect, it } from "vitest";

import {
  decodeTransactionError,
  initialTransactionState,
  transactionReducer,
} from "@/lib/transaction-state";

const hash = `0x${"ab".repeat(32)}` as const;
const replacementHash = `0x${"cd".repeat(32)}` as const;

describe("transaction state machine", () => {
  it("tracks simulation through reconciled confirmation", () => {
    let state = transactionReducer(initialTransactionState, {
      type: "SIMULATE",
    });
    state = transactionReducer(state, {
      type: "SIMULATED",
      approvalRequired: true,
    });
    expect(state.phase).toBe("approval");
    state = transactionReducer(state, { type: "APPROVED" });
    state = transactionReducer(state, { type: "SIGNED" });
    state = transactionReducer(state, { type: "SUBMITTED", hash });
    state = transactionReducer(state, { type: "CONFIRM" });
    state = transactionReducer(state, { type: "RECONCILE" });
    state = transactionReducer(state, { type: "RECONCILED" });

    expect(state).toMatchObject({ phase: "confirmed", hash });
  });

  it("does not call a replacement successful before reconciliation", () => {
    const submitted = transactionReducer(initialTransactionState, {
      type: "SUBMITTED",
      hash,
    });
    const replaced = transactionReducer(submitted, {
      type: "REPLACED",
      replacementHash,
    });

    expect(replaced).toMatchObject({
      phase: "replacement",
      hash,
      replacementHash,
    });
  });

  it.each(["DROPPED", "REVERTED", "FAILED"] as const)(
    "makes %s failures retryable",
    (type) => {
      const failed = transactionReducer(initialTransactionState, {
        type,
        error: "wallet reason",
      });
      expect(["dropped", "reverted", "retry"]).toContain(failed.phase);
      expect(failed.error).toBe("wallet reason");
      expect(transactionReducer(failed, { type: "RETRY" }).phase).toBe(
        "simulation",
      );
    },
  );

  it("preserves a readable non-viem error", () => {
    expect(decodeTransactionError(new Error("User rejected signature"))).toBe(
      "User rejected signature",
    );
    expect(decodeTransactionError(undefined)).toContain("unknown");
  });
});
