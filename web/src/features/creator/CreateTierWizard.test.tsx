import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress, type Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

let walletAddress: Address | undefined;
let walletChainId = 46_630;

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: walletAddress,
    isConnected: Boolean(walletAddress),
  }),
  useChainId: () => walletChainId,
  useSwitchChain: () => ({ switchChain: vi.fn() }),
  useWriteContract: () => ({ isPending: false, writeContractAsync: vi.fn() }),
}));
vi.mock("@/components/WalletControl", () => ({
  WalletControl: () => <button type="button">Connect wallet</button>,
}));
vi.mock("@/components/WalletReadiness", () => ({
  WalletReadiness: () => <p>Wallet readiness preview</p>,
}));

import { CreateTierWizard } from "@/features/creator/CreateTierWizard";

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateTierWizard />
    </QueryClientProvider>,
  );
}

describe("creator setup component", () => {
  beforeEach(() => {
    walletAddress = undefined;
    walletChainId = 46_630;
  });

  it("preserves completed input through wallet and network rerenders", async () => {
    const user = userEvent.setup();
    const view = renderWizard();
    const name = screen.getByLabelText("Membership name");
    await user.clear(name);
    await user.type(name, "The listening room");

    walletAddress = getAddress("0x1111111111111111111111111111111111111111");
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );
    walletChainId = 4_663;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Membership name")).toHaveValue(
      "The listening room",
    );
  });

  it("requires both material acknowledgements before deployment", async () => {
    const user = userEvent.setup();
    walletAddress = getAddress("0x1111111111111111111111111111111111111111");
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^risks$/i }));
    const acknowledgements = screen.getAllByRole("checkbox");
    expect(acknowledgements).toHaveLength(2);
    await user.click(acknowledgements[0]);
    await user.click(screen.getByRole("button", { name: /^review$/i }));

    expect(screen.getByText(/both permanence and gifting/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /simulate and deploy/i }),
    ).toBeDisabled();
  });
});
