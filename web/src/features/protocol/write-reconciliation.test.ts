import type { TransactionReceipt } from "viem";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  reconcileSuccessfulWrite,
  type SuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";

const receipt = {
  status: "success",
  transactionHash: `0x${"1".repeat(64)}`,
  blockNumber: 10n,
  logs: [],
} as unknown as SuccessfulWriteReceipt;

describe("successful write reconciliation", () => {
  it("passes the exact library receipt to domain reconciliation", async () => {
    const dispatch = vi.fn();
    const reconcile = vi.fn(async () => "fresh state");

    await expect(
      reconcileSuccessfulWrite({ receipt, reconcile, dispatch }),
    ).resolves.toBe("fresh state");

    expect(reconcile).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledWith(receipt);
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual([
      "RECONCILE",
      "RECONCILED",
    ]);
  });

  it("does not accept a receipt-less reconciliation contract", () => {
    type Input = Parameters<typeof reconcileSuccessfulWrite>[0];
    expectTypeOf<Input["receipt"]>().toMatchTypeOf<TransactionReceipt>();
  });

  it("never reports success when the domain postcondition is absent", async () => {
    const dispatch = vi.fn();

    await reconcileSuccessfulWrite({
      receipt,
      reconcile: async () => undefined,
      dispatch,
    });

    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "UNCERTAIN" }),
    );
    expect(dispatch).not.toHaveBeenCalledWith({ type: "RECONCILED" });
  });

  it("can retry only the domain verification with the same successful receipt", async () => {
    const dispatch = vi.fn();
    const reconcile = vi
      .fn<(receipt: SuccessfulWriteReceipt) => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("visible after a fresh canonical read");

    await expect(
      reconcileSuccessfulWrite({ receipt, reconcile, dispatch }),
    ).resolves.toBeUndefined();
    await expect(
      reconcileSuccessfulWrite({ receipt, reconcile, dispatch }),
    ).resolves.toBe("visible after a fresh canonical read");

    expect(reconcile.mock.calls).toEqual([[receipt], [receipt]]);
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual([
      "RECONCILE",
      "UNCERTAIN",
      "RECONCILE",
      "RECONCILED",
    ]);
  });
});
