import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { zeroAddress } from "viem";
import { TransferMembership } from "./TransferMembership";
const read = vi.hoisted(() => vi.fn());
vi.mock("wagmi", () => ({ usePublicClient: () => ({ readContract: read }) }));
const owner = "0x1111111111111111111111111111111111111111";
const tier = "0x2222222222222222222222222222222222222222";
const recipient = "0x3333333333333333333333333333333333333333";
function mount(options = {}) {
  const onTransfer = vi.fn(async () => true),
    onApprove = vi.fn(async () => true),
    onOperatorApproval = vi.fn(async () => true);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TransferMembership
        chainId={31337}
        tier={tier}
        tokenId={7n}
        owner={owner}
        expiration={200n}
        asOf={100n}
        canOperate
        pending={false}
        onTransfer={onTransfer}
        onApprove={onApprove}
        onOperatorApproval={onOperatorApproval}
        {...options}
      />
    </QueryClientProvider>,
  );
  return { onTransfer, onApprove, onOperatorApproval };
}
describe("membership transfers", () => {
  beforeEach(() => {
    read
      .mockReset()
      .mockImplementation(async ({ functionName }) =>
        functionName === "getApproved" ? zeroAddress : false,
      );
  });
  it("requires confirmation of the selected position and recipient without a maintenance prerequisite", async () => {
    const { onTransfer } = mount();
    await userEvent.type(
      screen.getByLabelText("Transfer recipient wallet"),
      recipient,
    );
    expect(
      screen.getByRole("button", { name: "Transfer membership #7" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: /transfer the entire membership #7/i,
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Transfer membership #7" }),
    );
    expect(onTransfer).toHaveBeenCalledWith(recipient);
    expect(
      screen.queryByRole("button", { name: /maintenance|accounting/i }),
    ).not.toBeInTheDocument();
  });
  it("keeps transfer usable when approval discovery fails", async () => {
    read.mockRejectedValue(new Error("Approval read unavailable"));
    mount();
    await userEvent.click(screen.getByText("NFT transfer approvals"));
    await screen.findByRole("alert");
    await userEvent.type(
      screen.getByLabelText("Transfer recipient wallet"),
      recipient,
    );
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: /transfer the entire membership #7/i,
      }),
    );
    expect(
      screen.getByRole("button", { name: "Transfer membership #7" }),
    ).toBeEnabled();
  });
  it.each([{ asOf: 200n }, { canOperate: false }, { pending: true }])(
    "rejects expired, unauthorized or pending transfers: %o",
    async (options) => {
      mount(options);
      expect(
        screen.getByRole("button", { name: "Transfer membership #7" }),
      ).toBeDisabled();
    },
  );
  it("distinguishes transfer-only NFT approval and supports explicit revocation", async () => {
    read.mockImplementation(async ({ functionName }) =>
      functionName === "getApproved" ? recipient : false,
    );
    const { onApprove } = mount();
    await userEvent.click(screen.getByText("NFT transfer approvals"));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Revoke token transfer approval",
      }),
    );
    expect(onApprove).toHaveBeenCalledWith(zeroAddress);
    expect(
      screen.getByText(/do not authorize reward claims or renewal/i),
    ).toBeVisible();
  });
});
