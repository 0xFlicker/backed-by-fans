import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransferMembership } from "./TransferMembership";
const recipient = "0x3333333333333333333333333333333333333333";
function mount(options = {}) {
  const onTransfer = vi.fn(async () => true);
  render(
    <TransferMembership
      tokenId={7n}
      expiration={200n}
      asOf={100n}
      canOperate
      pending={false}
      onTransfer={onTransfer}
      {...options}
    />,
  );
  return { onTransfer };
}
describe("membership transfers", () => {
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
  it.each([{ asOf: 200n }, { canOperate: false }, { pending: true }])(
    "rejects expired, unauthorized or pending transfers: %o",
    async (options) => {
      mount(options);
      expect(
        screen.getByRole("button", { name: "Transfer membership #7" }),
      ).toBeDisabled();
    },
  );
});
