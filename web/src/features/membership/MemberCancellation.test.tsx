import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberCancellation } from "./MemberCancellation";
import type { CancellationQuote } from "@/contracts/types";

const owner = "0x0000000000000000000000000000000000000001" as const;
const quote: CancellationQuote = {
  tokenId: 7n,
  lifecycle: 0,
  cancellationEligible: true,
  quoteAvailable: true,
  unavailableReason: 0,
  owner,
  asOf: 1000n,
  accountedThrough: 1000n,
  processedSteps: 0n,
  complete: true,
  creatorRetentionBps: 3000,
  deadline: 1120n,
  minOwnerRefund: 69n,
  canceledGross: 100n,
  ownerRefund: 70n,
  creatorRetained: 30n,
  paidSeconds: 100n,
  grantSeconds: 20n,
  earnedCreditScaled: 0n,
  fundingScaled: [0n, 0n, 0n, 0n],
  cancellationScaled: [0n, 0n, 0n, 0n],
  generation: 0n,
};
const label = (raw: bigint) => `${raw} USDG`;
function mount(value = quote, authorized = true) {
  const onCancel = vi
    .fn()
    .mockResolvedValue({ ownerRefund: 70n, creatorRetained: 30n, owner });
  render(
    <MemberCancellation
      initialTokenId={7n}
      canOperate
      pending={false}
      paymentLabel={label}
      onReview={vi.fn().mockResolvedValue({ quote: value, authorized })}
      onCancel={onCancel}
    />,
  );
  return onCancel;
}
async function review() {
  fireEvent.click(screen.getByRole("button", { name: "Review cancellation" }));
}
describe("MemberCancellation", () => {
  it("requires explicit review and confirmation, and keeps minimum separate from estimate", async () => {
    const cancel = mount();
    await review();
    await screen.findByText("70 USDG");
    expect(screen.getByText("69 USDG")).toBeInTheDocument();
    expect(screen.getByText(owner)).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Cancel membership #7" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(quote));
    expect(
      await screen.findByText(/Canceled membership #7/),
    ).toBeInTheDocument();
  });
  it.each([1, 2])(
    "never offers a cancellation for non-live lifecycle %s",
    async (lifecycle) => {
      mount({
        ...quote,
        lifecycle,
        cancellationEligible: false,
        quoteAvailable: false,
      });
      await review();
      await screen.findByText(/cannot be canceled/);
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    },
  );
  it("does not treat an incomplete projection as a zero-refund exit", async () => {
    mount({
      ...quote,
      quoteAvailable: false,
      complete: false,
      minOwnerRefund: 0n,
    });
    await review();
    await screen.findByText(/Advance membership accounting/);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("requires current owner or operator authorization", async () => {
    mount(quote, false);
    await review();
    await screen.findByText(/current owner or approved operator/);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("invalidates review when the selected NFT changes", async () => {
    const props = {
      canOperate: true,
      pending: false,
      paymentLabel: label,
      onReview: vi.fn().mockResolvedValue({ quote, authorized: true }),
      onCancel: vi.fn(),
    };
    const view = render(<MemberCancellation {...props} initialTokenId={7n} />);
    await review();
    await screen.findByText("70 USDG");
    view.rerender(<MemberCancellation {...props} initialTokenId={8n} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("expires the reviewed deadline and allows a fresh review", async () => {
    mount({ ...quote, deadline: quote.asOf });
    await review();
    await screen.findByText("70 USDG");
    await screen.findByText(/This quote expired/, {}, { timeout: 2500 });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review cancellation" }),
    ).toBeEnabled();
  });
  it("surfaces read failure without a zero-refund confirmation", async () => {
    render(
      <MemberCancellation
        initialTokenId={7n}
        canOperate
        pending={false}
        paymentLabel={label}
        onReview={vi.fn().mockRejectedValue(new Error("Unknown token"))}
        onCancel={vi.fn()}
      />,
    );
    await review();
    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown token");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("blocks pending submissions and preserves review after a rejected payment", async () => {
    const onCancel = vi.fn().mockRejectedValue(new Error("Payout rejected"));
    const props = {
      initialTokenId: 7n,
      canOperate: true,
      paymentLabel: label,
      onReview: vi.fn().mockResolvedValue({ quote, authorized: true }),
      onCancel,
    };
    const view = render(<MemberCancellation {...props} pending={false} />);
    await review();
    await screen.findByText("70 USDG");
    fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(<MemberCancellation {...props} pending />);
    expect(
      screen.getByRole("button", { name: "Cancel membership #7" }),
    ).toBeDisabled();
    view.rerender(<MemberCancellation {...props} pending={false} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel membership #7" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Payout rejected",
    );
    expect(screen.queryByText(/Canceled membership/)).not.toBeInTheDocument();
    expect(screen.getByText("69 USDG")).toBeInTheDocument();
  });
  it("preserves confirmed payout details when refresh removes the burned selection", async () => {
    let finish!: (value: {
      ownerRefund: bigint;
      creatorRetained: bigint;
      owner: typeof owner;
    }) => void;
    const onCancel = vi.fn(
      () =>
        new Promise<{
          ownerRefund: bigint;
          creatorRetained: bigint;
          owner: typeof owner;
        }>((resolve) => {
          finish = resolve;
        }),
    );
    const props = {
      canOperate: true,
      pending: false,
      paymentLabel: label,
      onReview: vi.fn().mockResolvedValue({ quote, authorized: true }),
      onCancel,
    };
    const view = render(<MemberCancellation {...props} initialTokenId={7n} />);
    await review();
    await screen.findByText("70 USDG");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel membership #7" }),
    );
    view.rerender(<MemberCancellation {...props} initialTokenId={undefined} />);
    finish({ ownerRefund: 70n, creatorRetained: 30n, owner });
    expect(await screen.findByText(/Canceled membership #7/)).toHaveTextContent(
      "creator retained 30 USDG",
    );
  });

  it("uses the selected membership without exposing a token ID input", async () => {
    const props = {
      canOperate: true,
      pending: false,
      paymentLabel: label,
      onReview: vi.fn().mockResolvedValue({ quote, authorized: true }),
      onCancel: vi.fn(),
    };
    const view = render(<MemberCancellation {...props} />);
    expect(
      screen.getByRole("button", { name: "Review cancellation" }),
    ).toBeDisabled();
    view.rerender(
      <MemberCancellation
        {...props}
        initialTokenId={7n}
        membershipName="Fans"
      />,
    );
    expect(screen.getByText("Fans · Membership #7")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await review();
    await screen.findByText("70 USDG");
    expect(props.onReview).toHaveBeenCalledWith(7n);
  });
  it("replaces a live review when a fresh chain read confirms expiration", async () => {
    const props = {
      initialTokenId: 7n,
      canOperate: true,
      pending: false,
      paymentLabel: label,
      onReview: vi.fn().mockResolvedValue({ quote, authorized: true }),
      onCancel: vi.fn(),
    };
    const view = render(
      <MemberCancellation {...props} chainTimestamp={1000n} />,
    );
    await review();
    await screen.findByText("70 USDG");
    view.rerender(
      <MemberCancellation
        {...props}
        chainTimestamp={quote.asOf + quote.paidSeconds + quote.grantSeconds}
      />,
    );
    expect(screen.getByText(/expired.*cannot be canceled/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/This quote expired/)).not.toBeInTheDocument();
  });
});
