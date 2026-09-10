import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AcceptedPaymentToken } from "@/lib/payment-token-read";
import { RewardCurveSummary } from "./RewardCurveControls";

const token: AcceptedPaymentToken = {
  chainId: 31337,
  factory: "0x1111111111111111111111111111111111111111",
  address: "0x2222222222222222222222222222222222222222",
  registryIndex: 0,
  minimumPayment: 1n,
  listed: true,
  enabled: true,
  name: "Payment token",
  symbol: "PAY",
  decimals: 6,
  scaledUI: true,
  uiMultiplier: 2n * 10n ** 18n,
  newUIMultiplier: 2n * 10n ** 18n,
  effectiveAt: 0n,
  readBlock: 1n,
};

describe("published reward curve summaries", () => {
  it.each([
    [10000, 0n, "None"],
    [15000, 1000n, "Some"],
    [30000, 1000n, "More"],
    [15000, 731n, "Custom"],
    [30000, 731n, "Custom"],
    [23700, 1000n, "Custom"],
  ])(
    "labels %i basis points across %s periods as %s",
    (boost, periods, label) => {
      render(
        <RewardCurveSummary
          terms={{
            startingBoostBps: boost,
            pricePerPeriod: 10_000_000n,
            earlySupportGross: periods * 10_000_000n,
          }}
        />,
      );
      expect(screen.getByText(`${label}.`)).toBeVisible();
      if (boost !== 10000)
        expect(
          screen.getByText(
            new RegExp(`${periods.toLocaleString()} purchased periods`),
          ),
        ).toBeVisible();
    },
  );

  it.each([
    [5_000_000_000n, "Some", "10000"],
    [10_000_000_000n, "Custom", "20000"],
  ])(
    "uses displayed PWYW units for the %s raw window",
    (gross, label, displayed) => {
      render(
        <RewardCurveSummary
          terms={{
            startingBoostBps: 15000,
            pricePerPeriod: 0n,
            earlySupportGross: gross,
          }}
          token={token}
        />,
      );
      expect(screen.getByText(`${label}.`)).toBeVisible();
      expect(
        screen.getByText(new RegExp(`${displayed} PAY in total contributions`)),
      ).toBeVisible();
    },
  );
});
