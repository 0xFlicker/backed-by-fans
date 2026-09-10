import { describe, expect, it } from "vitest";

import {
  displayedToRaw,
  formatLocalizedTokenAmount,
  formatRawTokenAmount,
  parseDisplayedUnits,
  rawToDisplayedUnits,
  scheduledDisplayAdjustment,
  tokenAmount,
  tokenMultiplierScale,
} from "@/lib/token-amount";

describe("token amount conversion", () => {
  it.each([
    ["10.123456", 6, 10_123_456n],
    ["+0.05", 18, 50_000_000_000_000_000n],
    [".5", 6, 500_000n],
    ["1.", 6, 1_000_000n],
    ["0", 0, 0n],
  ])("parses %s at %i decimals exactly", (input, decimals, expected) => {
    expect(parseDisplayedUnits(input, decimals)).toBe(expected);
  });

  it.each(["-1", "1e3", "NaN", "", "+", "1_000"])(
    "rejects unsupported input %s",
    (input) => {
      expect(() => parseDisplayedUnits(input, 18)).toThrow();
    },
  );

  it("rejects precision the token cannot represent", () => {
    expect(() => parseDisplayedUnits("0.0000001", 6)).toThrow(
      "at most 6 fractional digits",
    );
  });

  it.each([
    ["0.05", 18, 2n * tokenMultiplierScale, 25_000_000_000_000_000n],
    ["0.05", 18, 3n * tokenMultiplierScale, 16_666_666_666_666_667n],
    ["0.000001", 6, 3n * tokenMultiplierScale, 0n],
    ["0.000002", 6, 3n * tokenMultiplierScale, 1n],
  ])(
    "converts %s to the nearest raw unit",
    (displayed, decimals, multiplier, expected) => {
      expect(displayedToRaw({ displayed, decimals, multiplier })).toBe(
        expected,
      );
    },
  );
});

describe("token amount display", () => {
  it.each([
    [49_999_999n, 9, tokenMultiplierScale, "0.05"],
    [123_456n, 9, tokenMultiplierScale, "0.000123"],
    [123_456n, 4, tokenMultiplierScale, "12.346"],
    [10_000_000n, 6, tokenMultiplierScale, "10"],
    [999_996n, 4, tokenMultiplierScale, "100"],
    [10_123_456n, 6, tokenMultiplierScale, "10.123"],
    [1n, 18, tokenMultiplierScale, "0.000000000000000001"],
    [0n, 255, tokenMultiplierScale, "0"],
    [25_000_000_000_000_000n, 18, 2n * tokenMultiplierScale, "0.05"],
    [1n, 0, tokenMultiplierScale / 2n, "0.5"],
  ])(
    "formats raw %s with decimals %i",
    (raw, decimals, multiplier, expected) => {
      expect(formatRawTokenAmount({ raw, decimals, multiplier })).toBe(
        expected,
      );
    },
  );

  it("retains rational remainder for display rounding", () => {
    expect(
      formatRawTokenAmount({
        raw: 1n,
        decimals: 0,
        multiplier: tokenMultiplierScale / 3n,
      }),
    ).toBe("0.333");
  });

  it("keeps exact raw state separate from rounded display", () => {
    const amount = tokenAmount({
      raw: 12_345_678n,
      decimals: 6,
      multiplier: tokenMultiplierScale,
      symbol: "USDG",
    });
    expect(amount).toMatchObject({
      raw: 12_345_678n,
      uiUnits: 12_345_678n,
      formatted: "12.346",
      symbol: "USDG",
    });
    expect(rawToDisplayedUnits(amount.raw, amount.multiplier)).toBe(
      12_345_678n,
    );
  });

  it("shows a future multiplier without applying it to current state", () => {
    const adjustment = scheduledDisplayAdjustment({
      raw: 50_000_000_000_000_000n,
      decimals: 18,
      currentMultiplier: tokenMultiplierScale,
      futureMultiplier: 2n * tokenMultiplierScale,
      effectiveAt: new Date(Date.now() + 60_000),
      referenceTime: new Date(0),
    });
    expect(adjustment).toMatchObject({
      currentFormatted: "0.05",
      futureFormatted: "0.1",
    });
  });

  it("keeps a scheduled multiplier future relative to a captured block time", () => {
    expect(
      scheduledDisplayAdjustment({
        raw: 25_000_000_000_000_000n,
        decimals: 18,
        currentMultiplier: 2n * tokenMultiplierScale,
        futureMultiplier: 4n * tokenMultiplierScale,
        effectiveAt: new Date("2030-01-02T00:00:00Z"),
        referenceTime: new Date("2030-01-01T00:00:00Z"),
      }),
    ).toMatchObject({ currentFormatted: "0.05", futureFormatted: "0.1" });
  });
});

it.each([
  ["en-US", "22,779,103.047"],
  ["de-DE", "22.779.103,047"],
  ["fr-FR", "22\u202f779\u202f103,047"],
])("localizes amounts for %s", (locale, expected) => {
  expect(
    formatLocalizedTokenAmount(
      { raw: 22779103047n, decimals: 3, multiplier: tokenMultiplierScale },
      locale,
    ),
  ).toBe(expected);
});
it("localizes large balances and tiny fractions without precision loss", () => {
  expect(
    formatLocalizedTokenAmount({
      raw: 9007199254740993123n,
      decimals: 3,
      multiplier: tokenMultiplierScale,
    }),
  ).toBe("9,007,199,254,740,993.123");
  expect(
    formatLocalizedTokenAmount({
      raw: 1n,
      decimals: 18,
      multiplier: tokenMultiplierScale,
    }),
  ).toBe("0.000000000000000001");
});
