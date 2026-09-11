import { expect, it, vi } from "vitest";
import { zeroAddress, type PublicClient } from "viem";
import { previewAdvance, type PreviewPlan } from "./preview-advance";
const tier = "0x1111111111111111111111111111111111111111";
const asset = "0x2222222222222222222222222222222222222222";
const vault = "0x3333333333333333333333333333333333333333";
const plan: PreviewPlan = {
  vault,
  blockNumber: 100n,
  tiers: [{ tier, maxAccountingSteps: 25n }],
  purchases: [{ asset, revision: 1n }],
};
function fixture(steps = 2n) {
  const readContract = vi.fn(async ({ functionName, args }) => {
    if (functionName === "previewAccounting")
      return {
        processedSteps: steps,
        asOf: 100n,
        ratesScaled: [0n, 0n, 0n, 0n] as const,
        earnedDeltaScaled: [5n, 0n, 0n, 7n],
        settled: { protocol: 3n, fractionalScaled: [0n, 0n, 0n, 0n] },
        current: {
          fractionalScaled: [0n, 0n, 0n, 0n],
          protocol: 10n,
          status: { nextBoundary: 0n, complete: true },
        },
      };
    if (functionName === "paymentToken" || functionName === "canonicalAsset")
      return asset;
    if (functionName === "previewProcessing")
      return { status: args[2] >= 10n ? 0 : 1, available: args[2] };
    throw new Error(`Unexpected ${functionName}`);
  });
  return { readContract, client: { readContract } as unknown as PublicClient };
}
it("previews release deltas and eligibility after release, without crediting donations", async () => {
  const f = fixture();
  const p = await previewAdvance(f.client, plan, "both");
  expect(p).toMatchObject({
    processedSteps: 2n,
    purchases: 1n,
    ready: true,
    funds: [{ asset, amount: 10n, delta: 7n }],
  });
  expect(f.readContract.mock.calls.map(([r]) => r)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        functionName: "previewAccounting",
        args: [0n, zeroAddress, 25n],
        blockNumber: 100n,
      }),
      expect.objectContaining({
        functionName: "previewProcessing",
        args: [asset, 0, 10n],
      }),
      expect.objectContaining({
        functionName: "previewProcessing",
        args: [asset, 1, 0n],
      }),
    ]),
  );
});
it("does not preview accounting or future releases in buyback-only mode", async () => {
  const f = fixture();
  expect(await previewAdvance(f.client, plan, "buyback")).toMatchObject({
    processedSteps: 0n,
    ready: false,
    funds: [],
  });
  expect(
    f.readContract.mock.calls.every(
      ([r]) => r.functionName === "previewProcessing",
    ),
  ).toBe(true);
});
it("keeps continuous accrual as optional settlement and honors zero accounting budgets", async () => {
  const f = fixture(0n);
  expect(await previewAdvance(f.client, plan, "accounting")).toMatchObject({
    ready: false,
    useful: true,
  });
  expect(
    await previewAdvance(
      f.client,
      { ...plan, tiers: [{ tier, maxAccountingSteps: 0n }] },
      "both",
    ),
  ).toMatchObject({ funds: [{ asset, amount: 3n, delta: 0n }] });
});
