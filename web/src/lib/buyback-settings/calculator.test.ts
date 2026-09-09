import { expect, it } from "vitest";
import { draftLimits, intervalSeconds, recommendLimits } from "./calculator";
const base = {
  available: 1000000n,
  targetPercent: 100,
  horizonHours: 24,
  preferredBatches: 4,
  maxGasPercent: 2.5,
  nativeValueWei: 1000000n,
  gasWei: 10000n,
};
it("reduces purchase count to fit the gas preference and excludes economic dust", () => {
  const result = recommendLimits(base);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("wrong result");
  expect(result.batches).toBe(2);
  expect(result.limits).toEqual({
    minInput: 400000n,
    maxInput: 500000n,
    minInterval: 43200n,
  });
});
it("plans only the selected percentage without creating a budget or expiry", () => {
  const result = recommendLimits({ ...base, targetPercent: 50 });
  expect(result.target).toBe(500000n);
  if (result.status !== "ready") throw new Error("wrong result");
  expect(result.batches).toBe(1);
  expect(result.limits.minInterval).toBe(86400n);
  expect(result).not.toHaveProperty("validUntil");
  expect(result).not.toHaveProperty("budget");
});
it("defers a balance that cannot pay for one economical purchase", () => {
  expect(recommendLimits({ ...base, gasWei: 30000n }).status).toBe("defer");
  expect(recommendLimits({ ...base, available: 0n }).status).toBe("defer");
});
it("sizes larger batches from a rejected purchase quote, not the whole vault value", () => {
  const result = recommendLimits({
    ...base,
    available: 60000n,
    quotedAmount: 15000n,
    nativeValueWei: 15000n,
    gasWei: 600n,
    horizonHours: 1,
  });
  expect(result).toMatchObject({
    status: "ready",
    batches: 2,
    limits: { minInput: 24000n, maxInput: 30000n, minInterval: 1800n },
  });
});
it("reports the minimum balance and shortfall when even one purchase is too small", () => {
  expect(recommendLimits({ ...base, gasWei: 30000n })).toMatchObject({
    status: "defer",
    economicMinimum: 1200000n,
    shortfall: 200000n,
  });
});
it("marks missing gas as provisional and provides starting sizes for rehearsal", () => {
  const result = recommendLimits({ ...base, gasWei: undefined });
  expect(result.status).toBe("unpriced");
  if (result.status !== "unpriced") throw new Error("wrong result");
  expect(result.limits.minInput).toBe(result.limits.maxInput);
});
it("rejects invalid limits and preserves exact scaled-token human amounts", () => {
  const row = {
    asset: "0x1111111111111111111111111111111111111111" as const,
    decimals: 6,
    multiplier: 3n * 10n ** 18n,
    minimum: "1.5",
    maximum: "3",
    intervalMinutes: "5",
  };
  expect(draftLimits(row)).toEqual({
    minInput: 500000n,
    maxInput: 1000000n,
    minInterval: 300n,
  });
  expect(() => draftLimits({ ...row, minimum: "3", maximum: "1.5" })).toThrow(
    "minimum",
  );
  expect(() => draftLimits({ ...row, minimum: "1" })).toThrow(
    "exactly representable",
  );
  expect(intervalSeconds("0")).toBe(0n);
  expect(() => intervalSeconds("-1")).toThrow();
  expect(() => recommendLimits({ ...base, targetPercent: NaN })).toThrow();
});

it.each([31, 62, 124])(
  "roundtrips recommended %s-second intervals",
  async (seconds) => {
    const { intervalSeconds } = await import("./calculator");
    expect(intervalSeconds((seconds / 60).toString())).toBe(BigInt(seconds));
    expect(() => intervalSeconds("0.001")).toThrow();
  },
);
it("uses consistent hundredth-percent precision", async () => {
  const { percentageBps } = await import("./calculator");
  expect(percentageBps(2.01)).toBe(201n);
  expect(percentageBps(50.009)).toBe(5000n);
});
