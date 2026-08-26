import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReadStateView } from "@/components/ReadState";
import { TransactionFlow } from "@/components/TransactionFlow";
import type { ReadState } from "@/lib/read-state";

describe("foundation status components", () => {
  it("announces loading without rendering an invented value", () => {
    const { container } = render(
      <ReadStateView
        state={{ status: "loading", label: "Reading registry" }}
      />,
    );

    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
    expect(screen.getByText("Reading registry")).toBeVisible();
  });

  it("shows partial fields and supports an explicit retry", async () => {
    const onRetry = vi.fn();
    render(
      <ReadStateView
        onRetry={onRetry}
        state={{
          status: "partial",
          reason: "missing-multicall",
          missing: ["pricePerPeriod"],
          label: "Direct fallback",
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByText("pricePerPeriod")).toBeInTheDocument();
  });

  it.each([
    ["valid", "Current onchain state"],
    ["stale", "Refresh required"],
    ["wrong-chain", "Wrong network"],
    ["unavailable", "Onchain state unavailable"],
    ["rate-limited", "Public RPC is busy"],
    ["invalid-address", "Invalid tier address"],
    ["interface-mismatch", "Unverified contract"],
  ] as const)("renders %s as a distinct non-color state", (status, copy) => {
    const shared = { label: `${status} detail` };
    const states = {
      valid: { ...shared, status: "valid", data: 1, capturedBlock: 1n },
      stale: {
        ...shared,
        status: "stale",
        data: 1,
        capturedBlock: 1n,
        latestBlock: 30n,
      },
      "wrong-chain": {
        ...shared,
        status: "wrong-chain",
        expectedChainId: 46630,
        actualChainId: 1,
      },
      unavailable: {
        ...shared,
        status: "unavailable",
        reason: "rpc-unavailable",
      },
      "rate-limited": { ...shared, status: "rate-limited" },
      "invalid-address": {
        ...shared,
        status: "invalid-address",
        value: "bad",
      },
      "interface-mismatch": {
        ...shared,
        status: "interface-mismatch",
        address: "0x0",
        failedChecks: ["factory registration"],
      },
    } satisfies Record<string, ReadState<number>>;

    const { container } = render(<ReadStateView state={states[status]} />);
    expect(
      container.querySelector(`[data-read-state='${status}']`),
    ).toBeVisible();
    expect(screen.getByText(copy)).toBeVisible();
  });

  it("announces contract reverts and retries from simulation", async () => {
    const onRetry = vi.fn();
    render(
      <TransactionFlow
        onRetry={onRetry}
        state={{
          phase: "reverted",
          message: "The contract rejected this transaction.",
          error: "Paused",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Paused");
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("offers only an onchain recheck for an uncertain submitted action", async () => {
    const onReconcile = vi.fn();
    const onRetry = vi.fn();
    render(
      <TransactionFlow
        onReconcile={onReconcile}
        onRetry={onRetry}
        state={{
          phase: "uncertain",
          message: "The outcome is not proven.",
          error: "receipt unavailable",
          hash: `0x${"ab".repeat(32)}`,
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /retry from simulation/i }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /recheck onchain outcome/i }),
    );
    expect(onReconcile).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
