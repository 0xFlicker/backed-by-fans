import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VestingSummary } from "./VestingSummary";

const Q = 1n << 128n;
const reserves = {
  unearnedScaled: [80n * Q, 10n * Q, 5n * Q, 5n * Q],
  cancellationScaled: [0n, 0n, 0n, 0n],
  unassignedMemberScaled: 0n,
  distributionDustScaled: 0n,
  indexCarryScaled: 0n,
  status: {
    accountedThrough: 1_000n,
    nextBoundary: 1_100n,
    scheduledMembers: 2n,
    complete: false,
  },
} as const;
describe("vesting balance summaries", () => {
  it("labels the shared future pool and historical settlement without a personal promise or repeated live announcements", () => {
    render(
      <VestingSummary
        reserves={reserves}
        paymentLabel={(raw) => `${raw} units`}
      />,
    );
    expect(screen.getByText("10 units")).toBeVisible();
    expect(screen.getByText(/not a personal payout estimate/)).toBeVisible();
    expect(
      screen.getByText(/Already-settled claims remain available/),
    ).toBeVisible();
    expect(screen.queryByText("Reserved creator funding")).toBeNull();
    expect(
      screen
        .getByRole("region", { name: "Vesting and accounting" })
        .querySelector("[aria-live]"),
    ).toBeNull();
  });
  it("shows creator reserves and preserves sub-unit amounts rather than displaying them as zero", () => {
    render(
      <VestingSummary
        creator
        reserves={{
          ...reserves,
          unearnedScaled: [1n, 10n * Q, 0n, 0n],
          status: { ...reserves.status, complete: true },
        }}
        paymentLabel={(raw) => `${raw} units`}
      />,
    );
    expect(screen.getByText("Reserved creator funding")).toBeVisible();
    expect(screen.getByText("Less than 1 units")).toBeVisible();
    expect(
      screen.getByText("Accounting is up to date at this read."),
    ).toBeVisible();
  });
});
