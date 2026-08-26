import { UserRejectedRequestError, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  executeTransaction,
  type TransactionLifecycle,
  waitForWriteReceipt,
} from "@/features/protocol/write-transaction";
import type { TransactionEvent } from "@/lib/transaction-state";

const hash = `0x${"1".repeat(64)}` as const;
const lifecycle = {
  onBeforeSubmit: async () => {},
  onSubmitted: () => {},
  onReplaced: () => {},
} satisfies TransactionLifecycle;

describe("shared protocol write execution", () => {
  it("keeps cancellation sticky across subsequent replacement notifications", async () => {
    const replacement = `0x${"2".repeat(64)}` as const;
    const client = {
      waitForTransactionReceipt: vi.fn(async ({ onReplaced }) => {
        onReplaced({
          reason: "cancelled",
          transaction: { hash: replacement },
        });
        onReplaced({
          reason: "repriced",
          transaction: { hash: `0x${"3".repeat(64)}` },
        });
        return { status: "success" };
      }),
    } as unknown as PublicClient;

    await expect(waitForWriteReceipt(client, hash, vi.fn())).resolves.toEqual({
      status: "cancelled",
    });
  });

  it("simulates, signs, confirms, and reconciles in order", async () => {
    const events: TransactionEvent[] = [];
    const result = await executeTransaction({
      simulate: async () => ({ request: true }),
      submit: async () => hash,
      wait: async () => ({ status: "success" }),
      reconcile: async () => "fresh state",
      dispatch: (event) => events.push(event),
      lifecycle,
    });

    expect(result).toEqual({ status: "reconciled", result: "fresh state" });
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
        onReplaced({
          hash: `0x${"2".repeat(64)}`,
          reason: "repriced",
        });
        return { status: "reverted" };
      },
      reconcile,
      dispatch,
      lifecycle,
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "REPLACED" }),
    );
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "REVERTED" }),
    );
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("arms durable recovery before wallet submission and records hash changes", async () => {
    const lifecycle: string[] = [];
    const replacement = `0x${"2".repeat(64)}` as const;
    await executeTransaction({
      simulate: async () => ({}),
      submit: async () => {
        lifecycle.push("wallet-submit");
        return hash;
      },
      wait: async (_hash, onReplaced) => {
        onReplaced({ hash: replacement, reason: "repriced" });
        return { status: "success" };
      },
      reconcile: async () => "fresh state",
      dispatch: vi.fn(),
      lifecycle: {
        onBeforeSubmit: async () => {
          lifecycle.push("armed");
        },
        onSubmitted: (submitted) => lifecycle.push(`submitted:${submitted}`),
        onReplaced: (value) => lifecycle.push(`replaced:${value.hash}`),
      },
    });

    expect(lifecycle).toEqual([
      "armed",
      "wallet-submit",
      `submitted:${hash}`,
      `replaced:${replacement}`,
    ]);
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
      lifecycle,
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
      lifecycle,
    });

    expect(events.map(({ type }) => type)).toContain("APPROVED");
    expect(events.at(-1)).toEqual({
      type: "FAILED",
      error: "CapacityReached: another supporter took the final place.",
    });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("does not imply the protected write was submitted when approval confirmation is unavailable", async () => {
    const events: TransactionEvent[] = [];
    const submit = vi.fn();
    const reconcile = vi.fn();
    await executeTransaction({
      approval: {
        simulate: async () => "approval request",
        submit: async () => hash,
        wait: async () => {
          throw new Error("approval receipt unavailable");
        },
      },
      simulate: async () => "protected request",
      submit,
      wait: async () => ({ status: "success" }),
      reconcile,
      dispatch: (event) => events.push(event),
      lifecycle,
    });

    expect(events.at(-1)).toEqual({
      type: "FAILED",
      error:
        "approval receipt unavailable No protected action was submitted; recheck the USDG allowance before continuing.",
    });
    expect(submit).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("treats a cancellation replacement as a safe cancellation, never action success", async () => {
    const events: TransactionEvent[] = [];
    const reconcile = vi.fn();
    await executeTransaction({
      simulate: async () => ({}),
      submit: async () => hash,
      wait: async (_hash, onReplaced) => {
        onReplaced({
          hash: `0x${"3".repeat(64)}`,
          reason: "cancelled",
        });
        return { status: "cancelled" };
      },
      reconcile,
      dispatch: (event) => events.push(event),
      lifecycle,
    });

    expect(events.at(-1)).toEqual({
      type: "CANCELLED",
      error: "The wallet cancelled the action replacement.",
    });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("keeps a post-submission transport failure non-retryable when state is unproven", async () => {
    const dispatch = vi.fn();
    await executeTransaction({
      simulate: async () => ({}),
      submit: async () => hash,
      wait: async () => {
        throw new Error("receipt unavailable");
      },
      reconcile: async () => undefined,
      dispatch,
      lifecycle,
    });

    expect(dispatch).toHaveBeenLastCalledWith({
      type: "UNCERTAIN",
      error: "receipt unavailable",
    });
  });

  it("reconciles a protected submit that broadcasts and then loses its response", async () => {
    const events: TransactionEvent[] = [];
    let broadcast = false;
    const outcome = await executeTransaction({
      simulate: async () => ({}),
      submit: async () => {
        broadcast = true;
        throw new Error("wallet response lost");
      },
      wait: async () => ({ status: "success" }),
      reconcile: async () => (broadcast ? "proven state" : undefined),
      dispatch: (event) => events.push(event),
      lifecycle,
    });

    expect(outcome).toEqual({
      status: "reconciled",
      result: "proven state",
    });
    expect(events.some(({ type }) => type === "FAILED")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "RECONCILED" });
  });

  it("keeps an explicit wallet rejection safely retryable", async () => {
    const events: TransactionEvent[] = [];
    const reconcile = vi.fn();
    const outcome = await executeTransaction({
      simulate: async () => ({}),
      submit: async () => {
        throw new UserRejectedRequestError(new Error("rejected"));
      },
      wait: async () => ({ status: "success" }),
      reconcile,
      dispatch: (event) => events.push(event),
      lifecycle,
    });

    expect(outcome).toEqual({ status: "definitive-failure" });
    expect(events.at(-1)).toEqual({
      type: "FAILED",
      error: "User rejected the request.",
    });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("recovers a submitted write from its proven postcondition", async () => {
    const dispatch = vi.fn();
    await expect(
      executeTransaction({
        simulate: async () => ({}),
        submit: async () => hash,
        wait: async () => {
          throw new Error("receipt unavailable");
        },
        reconcile: async () => "proven state",
        dispatch,
        lifecycle,
      }),
    ).resolves.toEqual({ status: "reconciled", result: "proven state" });

    expect(dispatch).toHaveBeenLastCalledWith({ type: "RECONCILED" });
  });
});
