import { expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { readTierFunding } from "./fee-forecast";

const tier = "0x1111111111111111111111111111111111111111";
const Q = 1n << 128n;
function fixture(complete = false) {
  const readContract = vi.fn(
    async ({ functionName }: { functionName: string }) => {
      if (functionName === "protocolFeeEarnedHeld") return 7n;
      if (functionName === "reserveState")
        return {
          unearnedScaled: [0n, 0n, 0n, 100n * Q + 9n],
          cancellationScaled: [0n, 0n, 0n, 3n],
          status: {
            accountedThrough: 900n,
            nextBoundary: 950n,
            scheduledMembers: 100000n,
            complete,
          },
        };
      throw new Error("Unexpected unbounded read: " + functionName);
    },
  );
  const client = {
    getBlock: vi.fn(async () => ({ number: 20n, timestamp: 1000n })),
    readContract,
  };
  return { client: client as unknown as PublicClient, readContract };
}
it("reads the same constant-size snapshot regardless of lifetime membership count", async () => {
  const f = fixture();
  const value = await readTierFunding(f.client, tier, { blockNumber: 20n });
  expect(f.readContract).toHaveBeenCalledTimes(2);
  expect(
    f.readContract.mock.calls.every(
      ([request]) => request.functionName !== "totalMinted",
    ),
  ).toBe(true);
  expect(value).toMatchObject({
    blockNumber: 20n,
    earnedHeld: 7n,
    reserved: 100n,
    reservedScaled: 100n * Q + 9n,
  });
});
it("retains fractional reserves and incomplete historical accounting without projecting new earnings", async () => {
  const value = await readTierFunding(fixture().client, tier);
  expect(value.accounting).toMatchObject({
    complete: false,
    accountedThrough: 900n,
  });
  expect(value.cancellationScaled).toBe(3n);
  expect(value).not.toHaveProperty("next24h");
});
it("reports complete settled accounting when the contract confirms it", async () => {
  expect(
    (await readTierFunding(fixture(true).client, tier)).accounting.complete,
  ).toBe(true);
});
it("propagates failed reads instead of reporting zero funding", async () => {
  const f = fixture();
  f.readContract.mockRejectedValue(new Error("RPC unavailable"));
  await expect(readTierFunding(f.client, tier)).rejects.toThrow(
    "RPC unavailable",
  );
});
