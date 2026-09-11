import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RewardPurchaseCurve } from "./RewardPurchaseCurve";
afterEach(cleanup);
const terms = {
  pricePerPeriod: 10n,
  earlySupportGross: 100n,
  startingBoostBps: 30000,
};
it.each([
  [0n, 10n],
  [90n, 120n],
  [120n, 150n],
])("marks the quoted purchase from %s to %s", (grossBefore, grossAfter) => {
  const { container } = render(
    <RewardPurchaseCurve
      terms={terms}
      quote={{ grossBefore, grossAfter, sharesAdded: 20n }}
    />,
  );
  const marker = container.querySelector("[data-purchase-start]");
  expect(marker?.getAttribute("data-purchase-start")).toBe(String(grossBefore));
  expect(marker?.getAttribute("data-purchase-end")).toBe(String(grossAfter));
  expect(screen.getByText(/Your purchase is highlighted/)).toBeVisible();
  const rect = container.querySelector("rect")!;
  expect(
    Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
  ).toBeLessThanOrEqual(408);
});
it("keeps the published curve without highlighting empty or zero payments", () => {
  const { container, rerender } = render(<RewardPurchaseCurve terms={terms} />);
  expect(container.querySelector("polyline")).toBeInTheDocument();
  expect(container.querySelector("[data-purchase-start]")).toBeNull();
  rerender(
    <RewardPurchaseCurve
      terms={terms}
      quote={{ grossBefore: 40n, grossAfter: 40n, sharesAdded: 0n }}
    />,
  );
  expect(container.querySelector("[data-purchase-start]")).toBeNull();
});
it("shows a flat 1x curve for None and supports custom boosts", () => {
  const { container, rerender } = render(
    <RewardPurchaseCurve
      terms={{ ...terms, startingBoostBps: 10000, earlySupportGross: 0n }}
    />,
  );
  expect(container.querySelector("polyline")?.getAttribute("points")).toBe(
    "40,140 408,140",
  );
  expect(
    screen.getByText("Every purchase earns 1× reward weight."),
  ).toBeVisible();
  rerender(
    <RewardPurchaseCurve terms={{ ...terms, startingBoostBps: 22500 }} />,
  );
  expect(screen.getByText(/Early support earns up to 2.25×/)).toBeVisible();
});
