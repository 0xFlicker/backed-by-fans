import { describe, expect, it, vi } from "vitest";

import { executeTransaction } from "@/features/protocol/write-transaction";
import type { TransactionEvent } from "@/lib/transaction-state";

const hash = `0x${"1".repeat(64)}` as const;

describe("shared protocol write execution", () => {
  it("simulates, signs, confirms, and reconciles in order", async () => {
    const events: TransactionEvent[] = [];
    const result = await executeTransaction({
      simulate: async () => ({ request: true }),
      submit: async () => hash,
      wait: async () => ({ status: "success" }),
      reconcile: async () => "fresh state",
      dispatch: (event) => events.push(event),
    });

    expect(result).toBe("fresh state");
    expect(events.map(({ type }) => type)).toEqual([
      "SIMULATE",
      "SIMULATED",
      "SIGN",
      "SIGNED",
      "SUBMITTED",
      "CONFIRM",
      "RECONCILE",
      "RECONCILED",
    ]);
  });

  it("tracks replacements and never reconciles a reverted receipt", async () => {
    const dispatch = vi.fn();
    const reconcile = vi.fn();
    await executeTransaction({
      simulate: async () => ({}),
      submit: async () => hash,
      wait: async (_hash, onReplaced) => {
        onReplaced(`0x${"2".repeat(64)}`);
        return { status: "reverted" };
      },
      reconcile,
      dispatch,
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REPLACED" }),
    );
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "REVERTED" }),
    );
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("confirms an exact approval before simulating the protected write", async () => {
    const events: TransactionEvent[] = [];
    const order: string[] = [];
    await executeTransaction({
      approval: {
        simulate: async () => {
          order.push("approval simulation");
          return "approval request";
        },
        submit: async () => hash,
        wait: async () => ({ status: "success" }),
      },
      simulate: async () => {
        order.push("write simulation");
        return "write request";
      },
      submit: async () => `0x${"2".repeat(64)}`,
      wait: async () => ({ status: "success" }),
      reconcile: async () => undefined,
      dispatch: (event) => events.push(event),
    });

    expect(order).toEqual(["approval simulation", "write simulation"]);
    expect(events.map(({ type }) => type)).toContain("APPROVED");
  });

  it("keeps approval success separate when the purchase then loses capacity", async () => {
    const events: TransactionEvent[] = [];
    const reconcile = vi.fn();
    await executeTransaction({
      approval: {
        simulate: async () => "approval request",
        submit: async () => hash,
        wait: async () => ({ status: "success" }),
      },
      simulate: async () => {
        throw new Error(
          "CapacityReached: another supporter took the final place.",
        );
      },
      submit: async () => `0x${"2".repeat(64)}`,
      wait: async () => ({ status: "success" }),
      reconcile,
      dispatch: (event) => events.push(event),
    });

    expect(events.map(({ type }) => type)).toContain("APPROVED");
    expect(events.at(-1)).toEqual({
      type: "FAILED",
      error: "CapacityReached: another supporter took the final place.",
    });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("marks a post-submission transport failure as uncertain and dropped", async () => {
    const dispatch = vi.fn();
    await executeTransaction({
      simulate: async () => ({}),
      submit: async () => hash,
      wait: async () => {
        throw new Error("receipt unavailable");
      },
      reconcile: async () => undefined,
      dispatch,
    });

    expect(dispatch).toHaveBeenLastCalledWith({
      type: "DROPPED",
      error: "receipt unavailable",
    });
  });
});
