import { beforeEach, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { readAccountRewardStreams } from "./account-reward-streams";
import {
  projectedAmount,
  ACCOUNTING_SCALE as scale,
} from "@/lib/streaming-amount";
const mock = vi.hoisted(() => ({ claims: vi.fn() }));
vi.mock("./account-rewards-read", async (original) => ({
  ...(await original<typeof import("./account-rewards-read")>()),
  readAccountRewards: mock.claims,
}));
const wallet = "0x1111111111111111111111111111111111111111";
const tier = "0x2222222222222222222222222222222222222222";
const tiers = [{ tier, name: "Fans", tokenIds: [1n, 2n] }] as const;
beforeEach(() =>
  mock.claims.mockResolvedValue({
    blockNumber: 42n,
    complete: true,
    results: [
      {
        asOf: 100n,
        through: 100n,
        complete: true,
        reward: 4n,
        retired: 3n,
        referral: 4n,
        creator: 5n,
        positions: [1n, 2n].map((tokenId) => ({
          tokenId,
          creditScaled: 2n * scale + scale / 2n,
        })),
        retiredCreditScaled: 3n * scale,
        referralCreditScaled: 4n * scale,
        creatorCreditScaled: 5n * scale,
      },
    ],
  }),
);
function fixture(owner = wallet, complete = true) {
  const readContract = vi.fn(
    async ({ functionName }: { functionName: string }) =>
      functionName === "owner"
        ? owner
        : {
            asOf: 100n,
            ratesScaled: [3n * scale, scale, 2n * scale, scale],
            current: { status: { complete, nextBoundary: 110n } },
          },
  );
  return { readContract, client: { readContract } as unknown as PublicClient };
}
it("streams each position and beneficiary category once from the same block", async () => {
  const f = fixture();
  const {
    results: [result],
  } = await readAccountRewardStreams(f.client, wallet, tiers);
  expect(
    f.readContract.mock.calls.every(
      ([args]) => "blockNumber" in args && args.blockNumber === 42n,
    ),
  ).toBe(true);
  expect(f.readContract).toHaveBeenCalledTimes(3);
  expect(result.streams).toHaveLength(5);
  expect(
    result.streams.reduce((sum, s) => sum + projectedAmount(s, 1000), 0n),
  ).toBe(23n);
  expect(result.positions[0].stream.rate).toBe(scale);
  expect(result.retiredStream.rate).toBe(0n);
});
it("does not grow creator rewards for someone who is not the creator", async () => {
  const result = await readAccountRewardStreams(
    fixture(tier).client,
    wallet,
    tiers,
  );
  expect(result.results[0].creatorStream.rate).toBe(0n);
});
it("keeps incomplete previews frozen", async () => {
  const result = await readAccountRewardStreams(
    fixture(wallet, false).client,
    wallet,
    tiers,
  );
  for (const stream of result.results[0].streams)
    expect(projectedAmount(stream, 5000)).toBe(stream.raw);
});
it("stops growth at the next funding or expiration boundary", async () => {
  const result = await readAccountRewardStreams(
    fixture().client,
    wallet,
    tiers,
  );
  const stream = result.results[0].positions[0].stream;
  expect(projectedAmount(stream, 15000)).toBe(projectedAmount(stream, 10000));
});
it("reads beneficiary rates without requiring an owned NFT", async () => {
  const claims = await mock.claims();
  claims.results[0].positions = [];
  const f = fixture();
  const result = await readAccountRewardStreams(f.client, wallet, [
    { tier, name: "Fans", tokenIds: [] },
  ]);
  expect(f.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      functionName: "previewAccounting",
      args: [0n, wallet, wallet, 25n],
      blockNumber: 42n,
    }),
  );
  expect(result.results[0].streams).toHaveLength(3);
});
