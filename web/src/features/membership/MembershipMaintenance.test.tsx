import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MembershipMaintenance } from "./MembershipMaintenance";

const status = {
  accountedThrough: 1000n,
  nextBoundary: 1100n,
  scheduledMembers: 0n,
  scheduledExpirations: 30n,
  nextKind: 2,
  complete: false,
};
it("allows any authorized wallet to advance an expiry-only backlog one batch at a time", async () => {
  const advance = vi.fn();
  render(
    <MembershipMaintenance status={status} canAdvance onAdvance={advance} />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Advance maintenance" }),
  );
  expect(advance).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/25 funding or expiration/)).toBeVisible();
});
it("shows committed partial progress and requires an explicit next batch", () => {
  const advance = vi.fn();
  render(
    <MembershipMaintenance
      status={status}
      canAdvance
      onAdvance={advance}
      outcome={{ processedSteps: 25n, retiredCount: 25n, complete: false }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(/25.*25.*More remains/);
  expect(advance).not.toHaveBeenCalled();
});
it("blocks stale reads, exposes failures, and distinguishes loading from empty", () => {
  const { rerender } = render(
    <MembershipMaintenance canAdvance onAdvance={vi.fn()} loading />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  rerender(
    <MembershipMaintenance
      status={status}
      canAdvance
      onAdvance={vi.fn()}
      stale
      error="Read failed"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Read failed");
  expect(screen.getByRole("button")).toBeDisabled();
  rerender(
    <MembershipMaintenance
      status={{ ...status, complete: true }}
      canAdvance
      onAdvance={vi.fn()}
    />,
  );
  expect(screen.getByText(/up to date/)).toBeVisible();
});
