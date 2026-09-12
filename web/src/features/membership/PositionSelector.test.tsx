import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PositionSelector } from "./PositionSelector";

const read = vi.hoisted(() => vi.fn());
vi.mock("wagmi", () => ({ usePublicClient: () => ({ readContract: read }) }));
const owner = "0x1111111111111111111111111111111111111111";
const tier = "0x2222222222222222222222222222222222222222";
function mount(balance = 101n, busy = false) {
  const select = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PositionSelector
        chainId={31337}
        tier={tier}
        owner={owner}
        blockNumber={99n}
        initialPage={{
          tokenIds: balance
            ? Array.from({ length: 100 }, (_, i) => BigInt(i + 1))
            : [],
          balance,
          nextOffset: balance ? 100n : 0n,
          complete: balance === 0n,
        }}
        selectedTokenId={0n}
        onSelect={select}
        busy={busy}
      />
    </QueryClientProvider>,
  );
  return select;
}
describe("explicit membership selection", () => {
  it("starts new and pages 101 positions at the captured block without inferring a target", async () => {
    read.mockResolvedValue({
      tokenIds: [101n],
      balance: 101n,
      nextOffset: 101n,
      complete: true,
    });
    const select = mount();
    expect(
      screen.getByRole("combobox", { name: "Membership action" }),
    ).toHaveValue("0");
    expect(select).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "More memberships" }),
    );
    await screen.findByRole("option", { name: "Membership #101" });
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ args: [owner, 100n, 100n], blockNumber: 99n }),
    );
    await userEvent.selectOptions(screen.getByRole("combobox"), "101");
    expect(select).toHaveBeenCalledWith(101n);
    expect(
      screen.getByRole("button", { name: "More memberships" }),
    ).toBeDisabled();
  });
  it("reports page failure and retries without reporting an empty wallet", async () => {
    read
      .mockRejectedValueOnce(new Error("RPC unavailable"))
      .mockResolvedValueOnce({
        tokenIds: [101n],
        balance: 101n,
        nextOffset: 101n,
        complete: true,
      });
    mount();
    await userEvent.click(
      screen.getByRole("button", { name: "More memberships" }),
    );
    await screen.findByRole("alert");
    expect(
      screen.queryByText("No memberships in this wallet."),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Membership #101" }),
      ).toBeInTheDocument(),
    );
  });
  it("keeps the explicit new action for an empty wallet and locks selection during a write", () => {
    mount(0n, true);
    expect(screen.getByText("No memberships in this wallet.")).toBeVisible();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
