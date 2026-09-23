import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { zeroAddress } from "viem";
import type { RefillQuote } from "@/contracts/types";
import { PeriodicRefill } from "./PeriodicRefill";

const owner = "0x0000000000000000000000000000000000000001" as const;
const quote = {
  tokenId: 1n,
  lifecycle: 0,
  owner,
  asOf: 100n,
  expiration: 900000n,
  paidSeconds: 600000n,
  grantSeconds: 0n,
  effectiveReferral: zeroAddress,
  balance: 55000000n,
  allowance: 40000000n,
  desiredPeriods: 2n,
  periods: 2n,
  gross: 40000000n,
  resultingExpiration: 6084000n,
  reason: 0,
  enrollment: {
    authorizingOwner: owner,
    targetSeconds: 3888000n,
    pendingReferralChoice: zeroAddress,
  },
  accounting: {
    complete: true,
    accountedThrough: 100n,
    nextBoundary: 0n,
    scheduledMembers: 1n,
    nextKind: 0,
    scheduledExpirations: 1n,
  },
} as RefillQuote;
function props() {
  return {
    initialTokenId: 1n,
    chainTimestamp: 100n,
    canOperate: true,
    pending: false,
    periodicEnabled: true,
    paused: false,
    price: 20000000n,
    walletAllowance: 40000000n,
    periodDuration: 2592000n,
    maxPrepaidPeriods: 12n,
    paymentLabel: (raw: bigint) => `${Number(raw) / 1000000} USDG`,
    onReview: vi
      .fn()
      .mockResolvedValue({ quote, isOwner: true, referralStatus: 1 }),
    onTarget: vi.fn().mockResolvedValue(true),
    onStop: vi.fn().mockResolvedValue(true),
    onAllowance: vi.fn().mockResolvedValue(true),
    onRefill: vi.fn().mockResolvedValue({ periods: 2n, gross: 40000000n }),
  };
}
async function review() {
  fireEvent.click(
    screen.getByRole("button", { name: "Review periodic refill" }),
  );
  await screen.findByRole("heading", { name: /Ready to refill|Tier paused/ });
}
describe("periodic refill controls", () => {
  it("reviews real collectible periods before explicit permissionless execution", async () => {
    const p = props();
    render(<PeriodicRefill {...p} />);
    await review();
    expect(p.onRefill).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Refill 2 periods" }));
    await waitFor(() => expect(p.onRefill).toHaveBeenCalledWith(quote));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Purchased 2 periods",
    );
  });
  it("keeps stop separate from cancellation and preserves prepaid time", async () => {
    const p = props();
    render(<PeriodicRefill {...p} />);
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Stop periodic refill" }),
    );
    await waitFor(() => expect(p.onStop).toHaveBeenCalledWith(1n));
    expect(await screen.findByText(/Prepaid time is unchanged/)).toBeVisible();
  });
  it("lets an unrelated executor refill but hides enrollment controls", async () => {
    const p = props();
    p.onReview.mockResolvedValue({ quote, isOwner: false, referralStatus: 1 });
    render(<PeriodicRefill {...p} />);
    await review();
    expect(
      screen.queryByRole("button", { name: "Stop periodic refill" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Refill 2 periods" }),
    ).toBeEnabled();
  });
  it("propagates unavailable reads without inventing a zero balance", async () => {
    const p = props();
    p.onReview.mockRejectedValue(new Error("RPC unavailable"));
    render(<PeriodicRefill {...p} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review periodic refill" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "RPC unavailable",
    );
    expect(screen.queryByText("0 USDG")).toBeNull();
  });
  it("separates fractional coverage from collectible whole periods and shared funds", async () => {
    render(<PeriodicRefill {...props()} />);
    await review();
    expect(screen.getByText("2.75 balance-equivalent periods")).toBeVisible();
    expect(screen.getByText("2 allowance-equivalent periods")).toBeVisible();
    expect(
      screen.getByText(
        /Other memberships share this balance and tier allowance/,
      ),
    ).toBeVisible();
  });
  it("requires an approval choice and can revoke while paused without stopping enrollment", async () => {
    const p = props();
    render(<PeriodicRefill {...p} paused />);
    await review();
    expect(
      screen.getByRole("button", { name: "Set tier allowance" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Refill approval"), {
      target: { value: "finite" },
    });
    fireEvent.change(screen.getByLabelText("Approval periods"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set tier allowance" }));
    await waitFor(() => expect(p.onAllowance).toHaveBeenCalledWith(60000000n));
    expect(p.onStop).not.toHaveBeenCalled();
  });
  it("can revoke tier allowance while paused", async () => {
    const p = props();
    render(<PeriodicRefill {...p} paused />);
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke tier allowance" }),
    );
    await waitFor(() => expect(p.onAllowance).toHaveBeenCalledWith(0n));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Enrollment is unchanged",
    );
  });
  it("does not silently submit refill while target edits are unsaved", async () => {
    render(<PeriodicRefill {...props()} />);
    await review();
    fireEvent.change(screen.getByLabelText("Refill target (days)"), {
      target: { value: "50" },
    });
    expect(
      screen.getByRole("button", { name: "Refill 2 periods" }),
    ).toBeDisabled();
  });
  it("labels successful no-work separately from a payment", async () => {
    const p = props();
    p.onRefill.mockResolvedValue({ periods: 0n, gross: 0n });
    render(<PeriodicRefill {...p} />);
    await review();
    fireEvent.click(screen.getByRole("button", { name: "Refill 2 periods" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "No refill payment",
    );
    expect(screen.queryByText(/Purchased/)).toBeNull();
  });
  it("retains reviewed data after a failed action without reporting a stopped refill", async () => {
    const p = props();
    p.onStop.mockResolvedValue(false);
    render(<PeriodicRefill {...p} />);
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Stop periodic refill" }),
    );
    await waitFor(() => expect(p.onStop).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Ready to refill")).toBeVisible();
  });
  it("keeps controls pending until the supplied wallet action resolves", async () => {
    const p = props();
    p.onStop.mockImplementation(() => new Promise(() => {}));
    render(<PeriodicRefill {...p} />);
    await review();
    fireEvent.click(
      screen.getByRole("button", { name: "Stop periodic refill" }),
    );
    expect(
      screen.getByRole("button", { name: "Refill 2 periods" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Refill membership NFT")).toBeDisabled();
  });
  it("shows off without a stored reason and offers explicit owner enrollment", async () => {
    const p = props();
    p.onReview.mockResolvedValue({
      quote: {
        ...quote,
        reason: 8,
        periods: 0n,
        enrollment: {
          authorizingOwner: zeroAddress,
          targetSeconds: 0n,
          pendingReferralChoice: zeroAddress,
        },
      },
      isOwner: true,
      referralStatus: 1,
    });
    render(<PeriodicRefill {...p} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review periodic refill" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Periodic refill off" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Enable periodic refill for this NFT",
      }),
    ).toBeEnabled();
    expect(p.onTarget).not.toHaveBeenCalled();
  });
  it("preserves cached values as stale when a refresh fails", async () => {
    const p = props();
    render(<PeriodicRefill {...p} />);
    await review();
    p.onReview.mockRejectedValueOnce(new Error("Network unavailable"));
    fireEvent.click(
      screen.getByRole("button", { name: "Review periodic refill" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("stale");
    expect(screen.getByText("55 USDG")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Refill 2 periods" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Review periodic refill" }),
    ).toBeEnabled();
  });
  it("removes payment and restart controls when chain time reaches expiration", async () => {
    const p = props();
    const view = render(<PeriodicRefill {...p} />);
    await review();
    view.rerender(<PeriodicRefill {...p} chainTimestamp={quote.expiration} />);
    expect(
      screen.getByRole("heading", { name: "Membership expired" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Refill 2 periods" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Update refill target" }),
    ).toBeNull();
  });
  it("invalidates a position review after ownership refresh removes it", async () => {
    const p = props();
    const view = render(<PeriodicRefill {...p} />);
    await review();
    view.rerender(<PeriodicRefill {...p} initialTokenId={undefined} />);
    expect(
      screen.queryByRole("button", { name: "Refill 2 periods" }),
    ).toBeNull();
    expect(screen.getByLabelText("Refill membership NFT")).toHaveValue("1");
  });
  it("releases an obsolete in-flight review when the selected position changes", async () => {
    const p = props();
    let finish!: (value: {
      quote: RefillQuote;
      isOwner: boolean;
      referralStatus: number;
    }) => void;
    p.onReview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PeriodicRefill {...p} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review periodic refill" }),
    );
    view.rerender(<PeriodicRefill {...p} initialTokenId={undefined} />);
    finish({ quote, isOwner: true, referralStatus: 1 });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review periodic refill" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText("Ready to refill")).toBeNull();
  });
  it("can revoke the connected wallet's allowance without a live NFT or review", async () => {
    const p = props();
    render(<PeriodicRefill {...p} initialTokenId={undefined} paused />);
    fireEvent.click(
      screen.getByRole("button", { name: "Revoke tier allowance" }),
    );
    await waitFor(() => expect(p.onAllowance).toHaveBeenCalledWith(0n));
    expect(p.onReview).not.toHaveBeenCalled();
    expect(p.onStop).not.toHaveBeenCalled();
  });
});
