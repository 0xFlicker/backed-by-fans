import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PositionSelector } from "./PositionSelector";

const read = vi.hoisted(() => vi.fn());
vi.mock("wagmi", () => ({ usePublicClient: () => ({ readContract: read }) }));
const owner = "0x1111111111111111111111111111111111111111";
const tier = "0x2222222222222222222222222222222222222222";
function mount(balance = 101n, busy = false, selectedTokenId = 0n) {
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
            ? Array.from(
                { length: Number(balance < 100n ? balance : 100n) },
                (_, i) => BigInt(i + 1),
              )
            : [],
          balance,
          nextOffset: balance ? 100n : 0n,
          complete: balance <= 100n,
        }}
        selectedTokenId={selectedTokenId}
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
      screen.getByRole("combobox", { name: "Your memberships" }),
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
      screen.queryByRole("button", { name: "More memberships" }),
    ).not.toBeInTheDocument();
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
  it("shows a sole membership without a picker or pagination and keeps joining again explicit", async () => {
    const select = mount(1n, false, 1n);
    expect(screen.getByText("Your membership #1")).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Join again" }));
    expect(select).toHaveBeenCalledWith(0n);
  });
  it("can return from joining again to the sole membership", async () => {
    const select = mount(1n);
    await userEvent.click(
      screen.getByRole("button", { name: "Back to your membership" }),
    );
    expect(select).toHaveBeenCalledWith(1n);
  });
  it("hides the entire selector for a wallet without memberships", () => {
    mount(0n, true);
    expect(
      screen.queryByRole("region", { name: "Membership selection" }),
    ).not.toBeInTheDocument();
  });
});
