import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let connected = false;
let activeChainId = 46_630;
let switchError: Error | null = null;
const switchChain = vi.fn();

vi.mock("wagmi", () => ({
  useAccount: () => ({
    chainId: connected ? activeChainId : undefined,
    isConnected: connected,
  }),
  useChainId: () => activeChainId,
  useSwitchChain: () => ({
    error: switchError,
    isPending: false,
    switchChain,
  }),
}));

import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";

describe("ChainRouteBoundary", () => {
  beforeEach(() => {
    connected = false;
    activeChainId = 46_630;
    switchError = null;
    switchChain.mockReset();
  });

  it("selects a chain-qualified link in Wagmi for a disconnected session", async () => {
    render(
      <ChainRouteBoundary chainId={4_663}>
        <p>Membership</p>
      </ChainRouteBoundary>,
    );

    await waitFor(() =>
      expect(switchChain).toHaveBeenCalledWith({ chainId: 4_663 }),
    );
    expect(
      screen.queryByText(/switch wallet network/i),
    ).not.toBeInTheDocument();
  });

  it("prompts instead of auto-switching a connected wallet", async () => {
    connected = true;
    const user = userEvent.setup();
    render(
      <ChainRouteBoundary chainId={4_663}>
        <p>Membership</p>
      </ChainRouteBoundary>,
    );

    expect(switchChain).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /switch wallet network/i }),
    );
    expect(switchChain).toHaveBeenCalledWith({ chainId: 4_663 });
  });

  it("keeps the route bound to its chain after a rejected switch", () => {
    connected = true;
    switchError = new Error("rejected");
    render(
      <ChainRouteBoundary chainId={4_663}>
        <p>Membership</p>
      </ChainRouteBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /writes stay disabled until the wallet matches it/i,
    );
    expect(screen.getByText("Membership")).toBeVisible();
  });
});
