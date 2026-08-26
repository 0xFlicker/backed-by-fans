import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTransactionReconciliation } from "@/features/protocol/use-transaction-reconciliation";
import type { TransactionEvent } from "@/lib/transaction-state";

describe("transaction reconciliation context", () => {
  it("refuses to reconcile an uncertain action under another wallet context", async () => {
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    const reconcile = vi.fn().mockResolvedValue({ proven: true });
    const hook = renderHook(
      ({ contextKey }) => useTransactionReconciliation(dispatch, contextKey),
      { initialProps: { contextKey: "46630:wallet-a:tier" } },
    );

    act(() => {
      hook.result.current.track(reconcile);
    });
    hook.rerender({ contextKey: "46630:wallet-b:tier" });

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "UNCERTAIN" }),
      ),
    );
    await act(async () => {
      await hook.result.current.recheck();
    });
    expect(reconcile).not.toHaveBeenCalled();

    hook.rerender({ contextKey: "46630:wallet-a:tier" });
    await act(async () => {
      await hook.result.current.recheck();
    });
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
