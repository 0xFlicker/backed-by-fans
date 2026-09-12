import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RetiredRewardClaim } from "./RetiredRewardClaim";

it("keeps fractional ended credit visible when no whole unit is claimable", () => {
  render(
    <RetiredRewardClaim
      credit={[0n, 42n]}
      canClaim
      onClaim={vi.fn()}
      paymentLabel={String}
    />,
  );
  expect(screen.getByText(/Fractional credit is preserved/)).toBeVisible();
  expect(screen.getByRole("button")).toBeDisabled();
});
it("claims settled credit without an NFT, a live position, or completed maintenance", async () => {
  const claim = vi.fn();
  render(
    <RetiredRewardClaim
      credit={[3n, 42n]}
      canClaim
      onClaim={claim}
      paymentLabel={String}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Claim ended membership rewards" }),
  );
  expect(claim).toHaveBeenCalledTimes(1);
});
it("does not render an unavailable balance as zero", () => {
  render(
    <RetiredRewardClaim
      canClaim
      onClaim={vi.fn()}
      paymentLabel={String}
      error="Balance unavailable"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Balance unavailable");
  expect(screen.queryByText("No ended membership rewards.")).toBeNull();
  expect(screen.getByRole("button")).toBeDisabled();
});
