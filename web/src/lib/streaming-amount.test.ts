import { expect, it } from "vitest";
import {
  ACCOUNTING_SCALE as Q,
  projectedAmount,
  type EarningsStream,
} from "./streaming-amount";
import { formatLocalizedTokenAmount } from "./token-amount";
const stream: EarningsStream = {
  raw: 10n,
  fractional: Q / 2n,
  rate: Q,
  asOf: 100n,
  nextBoundary: 120n,
  complete: true,
};
it("adds fractional accrual without floating point balances", () => {
  expect(projectedAmount(stream, 1500)).toBe(12n);
});
it("stops at a checkpoint and never extrapolates a partial preview", () => {
  expect(projectedAmount(stream, 40000)).toBe(30n);
  expect(projectedAmount({ ...stream, complete: false }, 10000)).toBe(10n);
});
it("caps stale or boundary-free estimates at thirty seconds", () => {
  expect(projectedAmount({ ...stream, nextBoundary: 0n }, 90000)).toBe(40n);
});
it("accepts decreases and handles zero or past boundaries", () => {
  expect(projectedAmount({ ...stream, raw: 0n, rate: 0n }, 10000)).toBe(0n);
  expect(projectedAmount({ ...stream, nextBoundary: 99n }, 10000)).toBe(10n);
});
it("uses existing precision and locale rules including digit carries", () => {
  const s = { ...stream, raw: 999999n, rate: Q * 1000n, fractional: 0n };
  expect(
    formatLocalizedTokenAmount(
      { raw: projectedAmount(s, 1), decimals: 3, multiplier: 10n ** 18n },
      "de-DE",
    ),
  ).toBe("1.000");
});
it("preserves tiny rates and very large balances", () => {
  const raw = 10n ** 40n;
  expect(
    projectedAmount({ ...stream, raw, rate: 1n, fractional: 0n }, 1000),
  ).toBe(raw);
});
