import { expect, it, vi } from "vitest";
import { type Address, type PublicClient } from "viem";
import { readAccountRewards } from "./account-rewards-read";
const wallet = "0x1111111111111111111111111111111111111111";
const tiers = [1, 2].map((n) => ({
  tier: `0x${String(n).padStart(40, "0")}` as Address,
  name: `Tier ${n}`,
}));
function fixture(steps = [12n, 13n], complete = true) {
  const readContract = vi.fn(async ({ address, functionName, args }) => {
    if (functionName === "tokenOf") return 7n;
    if (functionName === "owner")
      return address === tiers[0].tier ? wallet : tiers[1].tier;
    if (functionName === "previewAccounting") {
      expect(args).toEqual([7n, wallet, 256n]);
      return {
        asOf: 100n,
        ratesScaled: [0n, 0n, 0n, 0n],
        current: {
          fractionalScaled: [0n, 0n, 0n, 0n],
          member: 2n,
          referral: 3n,
          creator: 5n,
          status: { nextBoundary: 0n, complete, accountedThrough: 100n },
        },
        processedSteps: steps[address === tiers[0].tier ? 0 : 1],
      };
    }
    throw new Error(`Unexpected ${functionName}`);
  });
  return {
    readContract,
    client: {
      getBlockNumber: vi.fn(async () => 42n),
      readContract,
    } as unknown as PublicClient,
  };
}
it("reads current balances in one block and includes creator proceeds only for the owner", async () => {
  const f = fixture();
  const p = await readAccountRewards(f.client, wallet, tiers);
  expect(p.blocked).toBeUndefined();
  expect(p.results.map((r) => r.creator)).toEqual([5n, 0n]);
  expect(p.results.map((r) => r.reward + r.referral)).toEqual([5n, 5n]);
  expect(
    f.readContract.mock.calls.every(([request]) => request.blockNumber === 42n),
  ).toBe(true);
});
it("identifies the first tier exceeding the shared write budget without hiding earned balances", async () => {
  const p = await readAccountRewards(fixture([12n, 14n]).client, wallet, tiers);
  expect(p.blocked).toEqual(tiers[1]);
  expect(p.results[1].reward).toBe(2n);
  expect(p.complete).toBe(true);
});
it("labels a bounded partial projection and propagates read failures", async () => {
  const f = fixture([256n, 0n], false);
  expect(await readAccountRewards(f.client, wallet, tiers)).toMatchObject({
    complete: false,
    blocked: tiers[0],
  });
  f.readContract.mockRejectedValue(new Error("RPC unavailable"));
  await expect(readAccountRewards(f.client, wallet, tiers)).rejects.toThrow(
    "RPC unavailable",
  );
});
