import { expect, it } from "vitest";
import { exactAmount, fraction, dragBps } from "./math";
it("preserves scaled token precision and refuses silent rounding", () => {
  expect(exactAmount("1.5", 6, 3n * 10n ** 18n)).toBe(500000n);
  expect(() => exactAmount("1", 6, 3n * 10n ** 18n)).toThrow(
    "exactly representable",
  );
  expect(() => exactAmount("0.0000001", 6, 10n ** 18n)).toThrow();
});
it("reduces marginal rates and reports actual execution drag", () => {
  expect(fraction(20n, 10n)).toEqual({ numerator: 2n, denominator: 1n });
  expect(dragBps(100n, 97n, { numerator: 1n, denominator: 1n })).toBe(300n);
});
