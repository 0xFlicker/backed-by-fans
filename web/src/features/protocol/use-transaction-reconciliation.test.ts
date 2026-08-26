import { act, renderHook, waitFor } from "@testing-library/react";
import { getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadPendingWrite,
  savePendingWrite,
  type PendingWrite,
} from "@/features/protocol/pending-write";
import { useTransactionReconciliation } from "@/features/protocol/use-transaction-reconciliation";
import type { TransactionEvent } from "@/lib/transaction-state";
import { createMemoryStorage } from "@/test/memory-storage";

const walletA = getAddress("0x1111111111111111111111111111111111111111");
const walletB = getAddress("0x2222222222222222222222222222222222222222");
const tier = getAddress("0x3333333333333333333333333333333333333333");
const recoveryOptions = {
  recover: vi.fn().mockResolvedValue({ status: "uncertain" as const }),
};

function pending(contextKey: string): PendingWrite {
  return {
    version: 1,
    id: "pending-1",
    contextKey,
    label: "Pause tier",
    armedAt: 1_777_777_777_777,
    intent: {
      kind: "tier-paused",
      tier,
      previous: false,
      expected: true,
      fromBlock: 100n,
    },
  };
}

describe("transaction reconciliation context", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: vi.fn(
          async (
            _name: string,
            _options: LockOptions,
            callback: () => void | Promise<void>,
          ) => callback(),
        ),
      },
    });
  });

  it("refuses to reconcile an uncertain action under another wallet context", async () => {
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    const recover = vi
      .fn()
      .mockResolvedValue({ status: "reconciled" as const, result: true });
    const hook = renderHook(
      ({ contextKey }) =>
        useTransactionReconciliation(dispatch, contextKey, { recover }),
      { initialProps: { contextKey: "46630:wallet-a:tier" } },
    );

    const tracked = hook.result.current.track({
      label: "Pause tier",
      intent: {
        kind: "tier-paused",
        tier,
        previous: false,
        expected: true,
        fromBlock: 100n,
      },
      reconcile: vi.fn(),
    });
    await act(async () => {
      await tracked.lifecycle.onBeforeSubmit();
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
    expect(recover).not.toHaveBeenCalled();

    hook.rerender({ contextKey: "46630:wallet-a:tier" });
    await act(async () => {
      await hook.result.current.recheck();
    });
    expect(recover).toHaveBeenCalledOnce();
  });

  it("persists an armed action and updates its submitted hash", async () => {
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    const contextKey = `46630:${walletA}:${tier}`;
    const hook = renderHook(() =>
      useTransactionReconciliation(dispatch, contextKey, recoveryOptions),
    );
    const tracked = hook.result.current.track({
      label: "Pause tier",
      intent: {
        kind: "tier-paused",
        tier,
        previous: false,
        expected: true,
        fromBlock: 100n,
      },
      reconcile: vi.fn().mockResolvedValue({ paused: true }),
    });

    await act(async () => {
      await tracked.lifecycle.onBeforeSubmit();
    });
    expect(loadPendingWrite(window.localStorage)).toMatchObject({
      contextKey,
      label: "Pause tier",
      intent: { kind: "tier-paused", expected: true },
    });

    act(() =>
      tracked.lifecycle.onSubmitted(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    );
    expect(loadPendingWrite(window.localStorage)?.hash).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );

    act(() =>
      tracked.lifecycle.onReplaced({
        hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        reason: "replaced",
      }),
    );
    expect(loadPendingWrite(window.localStorage)).toMatchObject({
      replacementHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      replacementReason: "replaced",
    });
  });

  it("serializes tabs and refuses to overwrite another pending action", async () => {
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    const contextKey = `46630:${walletA}:${tier}`;
    const first = renderHook(() =>
      useTransactionReconciliation(dispatch, contextKey, recoveryOptions),
    );
    const second = renderHook(() =>
      useTransactionReconciliation(dispatch, contextKey, recoveryOptions),
    );
    const firstWrite = first.result.current.track({
      label: "Pause tier",
      intent: pending(contextKey).intent,
      reconcile: vi.fn(),
    });
    const secondWrite = second.result.current.track({
      label: "Change supply cap",
      intent: pending(contextKey).intent,
      reconcile: vi.fn(),
    });

    await firstWrite.lifecycle.onBeforeSubmit();
    const storedId = loadPendingWrite(window.localStorage)?.id;
    await expect(secondWrite.lifecycle.onBeforeSubmit()).rejects.toThrow(
      /recover the pending pause tier/i,
    );
    expect(loadPendingWrite(window.localStorage)?.id).toBe(storedId);
    expect(navigator.locks.request).toHaveBeenCalledTimes(2);
  });

  it("fails closed before signing when durable browser storage is unavailable", async () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("storage denied");
      },
    });
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    const hook = renderHook(() =>
      useTransactionReconciliation(
        dispatch,
        `46630:${walletA}:${tier}`,
        recoveryOptions,
      ),
    );
    const tracked = hook.result.current.track({
      label: "Pause tier",
      intent: {
        kind: "tier-paused",
        tier,
        previous: false,
        expected: true,
        fromBlock: 100n,
      },
      reconcile: vi.fn(),
    });

    await expect(tracked.lifecycle.onBeforeSubmit()).rejects.toThrow(
      /recovery storage is unavailable/i,
    );
  });

  it("restores and reconciles an exact pending intent after remount", async () => {
    const contextKey = `46630:${walletA}:${tier}`;
    savePendingWrite(window.localStorage, pending(contextKey));
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    const recover = vi.fn().mockResolvedValue({
      status: "reconciled",
      result: { paused: true },
    });
    const onRecovered = vi.fn();
    const hook = renderHook(() =>
      useTransactionReconciliation(dispatch, contextKey, {
        recover,
        onRecovered,
      }),
    );

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "UNCERTAIN" }),
      ),
    );
    await act(async () => {
      await hook.result.current.recheck();
    });

    expect(recover).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          kind: "tier-paused",
          expected: true,
        }),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith({ type: "RECONCILED" });
    expect(onRecovered).toHaveBeenCalledWith(
      expect.objectContaining({ status: "reconciled" }),
      expect.objectContaining({ id: "pending-1" }),
    );
    expect(loadPendingWrite(window.localStorage)).toBeUndefined();
  });

  it("keeps a restored intent blocked under the wrong wallet", async () => {
    const originalContext = `46630:${walletA}:${tier}`;
    savePendingWrite(window.localStorage, pending(originalContext));
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    const recover = vi.fn();
    const hook = renderHook(() =>
      useTransactionReconciliation(dispatch, `46630:${walletB}:${tier}`, {
        recover,
      }),
    );

    await act(async () => {
      await hook.result.current.recheck();
    });
    expect(recover).not.toHaveBeenCalled();
    expect(loadPendingWrite(window.localStorage)?.id).toBe("pending-1");
  });

  it("coalesces concurrent rechecks into one onchain recovery", async () => {
    const contextKey = `46630:${walletA}:${tier}`;
    savePendingWrite(window.localStorage, pending(contextKey));
    let resolveRecovery: ((value: { status: "uncertain" }) => void) | undefined;
    const recover = vi.fn(
      () =>
        new Promise<{ status: "uncertain" }>((resolve) => {
          resolveRecovery = resolve;
        }),
    );
    const hook = renderHook(() =>
      useTransactionReconciliation(vi.fn(), contextKey, { recover }),
    );

    const first = hook.result.current.recheck();
    const second = hook.result.current.recheck();
    expect(second).toBe(first);
    await waitFor(() => expect(recover).toHaveBeenCalledOnce());
    resolveRecovery?.({ status: "uncertain" });
    await first;
  });

  it("does not apply a recovered result after the wallet context changes", async () => {
    const originalContext = `46630:${walletA}:${tier}`;
    savePendingWrite(window.localStorage, pending(originalContext));
    const dispatch = vi.fn<(event: TransactionEvent) => void>();
    let resolveRecovery:
      ((value: { status: "reconciled"; result: string }) => void) | undefined;
    const recover = vi.fn(
      () =>
        new Promise<{ status: "reconciled"; result: string }>((resolve) => {
          resolveRecovery = resolve;
        }),
    );
    const hook = renderHook(
      ({ contextKey }) =>
        useTransactionReconciliation(dispatch, contextKey, { recover }),
      { initialProps: { contextKey: originalContext } },
    );

    const request = hook.result.current.recheck();
    await waitFor(() => expect(recover).toHaveBeenCalledOnce());
    hook.rerender({ contextKey: `46630:${walletB}:${tier}` });
    resolveRecovery?.({ status: "reconciled", result: "done" });
    await request;

    expect(dispatch).not.toHaveBeenCalledWith({ type: "RECONCILED" });
    expect(loadPendingWrite(window.localStorage)?.id).toBe("pending-1");
  });
});
