import { expect, it, vi } from "vitest";
import { type Address, type PublicClient } from "viem";
import { readAccountRewards } from "./account-rewards-read";

const wallet = "0x1111111111111111111111111111111111111111" as const;
const scale = 1n << 128n;
const tiers = [1, 2].map((n) => ({
  tier: `0x${String(n).padStart(40, "0")}` as Address,
  name: `Tier ${n}`,
  tokenIds: [7n, 8n],
}));

type ReadRequest = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
  blockNumber?: bigint;
};
function fixture(
  steps = [12n, 13n],
  complete = [true, true],
  retired: { projected: bigint; settled: readonly [bigint, bigint] } = {
    projected: 6n * scale + (3n * scale) / 4n,
    settled: [4n, scale / 4n],
  },
) {
  const readContract = vi.fn(async (request: ReadRequest) => {
    const index = request.address === tiers[0].tier ? 0 : 1;
    if (request.functionName === "claimableRetiredReward") {
      expect(request.args).toEqual([wallet]);
      return retired.settled;
    }
    if (request.functionName === "previewClaimRewards") {
      const ids = request.args?.[1] as readonly bigint[];
      return {
        asOf: 100n,
        accountedThrough: complete[index] ? 100n : 90n,
        processedSteps: steps[index],
        complete: complete[index],
        positions: ids.map((tokenId, position) => ({
          tokenId,
          lifecycle: 0,
          creditScaled: BigInt(position + 2) * scale + (3n * scale) / 4n,
        })),
        retiredCreditScaled: retired.projected,
        referralCreditScaled: 3n * scale + scale / 2n,
        creatorCreditScaled: 5n * scale + scale / 2n,
      };
    }
    throw new Error(`Unexpected ${request.functionName}`);
  });
  const getBlockNumber = vi.fn(async () => 42n);
  return {
    readContract,
    getBlockNumber,
    client: { getBlockNumber, readContract } as unknown as PublicClient,
  };
}

it("projects each explicit selection once with one block and a shared 25-step budget", async () => {
  const f = fixture();
  const result = await readAccountRewards(f.client, wallet, tiers);
  expect(result).toMatchObject({ complete: true, blockNumber: 42n });
  expect(result.blocked).toBeUndefined();
  const previews = f.readContract.mock.calls
    .map(([request]) => request)
    .filter((request) => request.functionName === "previewClaimRewards");
  expect(previews.map(({ address, args }) => ({ address, args }))).toEqual([
    { address: tiers[0].tier, args: [wallet, [7n, 8n], 25n] },
    { address: tiers[1].tier, args: [wallet, [7n, 8n], 13n] },
  ]);
  expect(f.readContract).toHaveBeenCalledTimes(4);
  expect(f.getBlockNumber).toHaveBeenCalledTimes(1);
  expect(
    f.readContract.mock.calls.every(([request]) => request.blockNumber === 42n),
  ).toBe(true);
});

it("floors each position separately and includes beneficiary categories only once per tier", async () => {
  const result = await readAccountRewards(fixture().client, wallet, tiers);
  for (const item of result.results) {
    expect(item).toMatchObject({
      reward: 5n,
      retired: 6n,
      referral: 3n,
      creator: 5n,
      retiredCreditScaled: 6n * scale + (3n * scale) / 4n,
      settledRetired: [4n, scale / 4n],
      through: 100n,
      complete: true,
    });
    expect(item.positions.map((position) => position.tokenId)).toEqual([
      7n,
      8n,
    ]);
  }
});

it("passes zero remaining steps to later tiers and identifies the first incomplete tier", async () => {
  const f = fixture([25n, 0n], [false, false]);
  const result = await readAccountRewards(f.client, wallet, tiers);
  expect(result.complete).toBe(false);
  expect(result.blocked).toEqual(tiers[0]);
  expect(result.results[0]).toMatchObject({
    reward: 5n,
    through: 90n,
    complete: false,
  });
  expect(f.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      address: tiers[1].tier,
      functionName: "previewClaimRewards",
      args: [wallet, [7n, 8n], 0n],
    }),
  );
});

it("reports the later incomplete tier without losing earlier balances", async () => {
  const result = await readAccountRewards(
    fixture([12n, 13n], [true, false]).client,
    wallet,
    tiers,
  );
  expect(result.blocked).toEqual(tiers[1]);
  expect(result.complete).toBe(false);
  expect(result.results[0]).toMatchObject({ reward: 5n, complete: true });
  expect(result.results[1]).toMatchObject({ reward: 5n, complete: false });
});

it("supports an empty position selection for retired, referral and creator balances", async () => {
  const f = fixture([0n, 0n]);
  const result = await readAccountRewards(f.client, wallet, [
    { ...tiers[0], tokenIds: [] },
  ]);
  expect(result.results[0]).toMatchObject({
    reward: 0n,
    positions: [],
    retired: 6n,
    settledRetired: [4n, scale / 4n],
    referral: 3n,
    creator: 5n,
  });
  expect(f.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      functionName: "previewClaimRewards",
      args: [wallet, [], 25n],
    }),
  );
});

it("retains scaled fractional beneficiary credit even when raw payout is zero", async () => {
  const f = fixture([0n, 0n], [true, true], {
    projected: 1n,
    settled: [0n, 1n],
  });
  const result = await readAccountRewards(f.client, wallet, [
    { ...tiers[0], tokenIds: [] },
  ]);
  expect(result.results[0]).toMatchObject({
    retired: 0n,
    retiredCreditScaled: 1n,
    settledRetired: [0n, 1n],
  });
});

it.each(["RPC unavailable", "ERC721NonexistentToken", "TokenOwnerOnly"])(
  "propagates %s without silently dropping a selected position",
  async (message) => {
    const f = fixture();
    f.readContract.mockRejectedValue(new Error(message));
    await expect(readAccountRewards(f.client, wallet, tiers)).rejects.toThrow(
      message,
    );
  },
);

it.each([
  {
    label: "duplicate token IDs",
    selection: [{ ...tiers[0], tokenIds: [7n, 7n] }],
  },
  { label: "zero token ID", selection: [{ ...tiers[0], tokenIds: [0n] }] },
  { label: "negative token ID", selection: [{ ...tiers[0], tokenIds: [-1n] }] },
  { label: "duplicate tiers", selection: [tiers[0], tiers[0]] },
  {
    label: "more than 32 aggregate IDs",
    selection: tiers.map((tier) => ({
      ...tier,
      tokenIds: Array.from({ length: 17 }, (_, i) => BigInt(i + 1)),
    })),
  },
  {
    label: "more than eight tiers",
    selection: Array.from({ length: 9 }, (_, i) => ({
      tier: `0x${(i + 1).toString(16).padStart(40, "0")}` as Address,
      name: `Tier ${i}`,
      tokenIds: [],
    })),
  },
])("rejects $label before any network work", async ({ selection }) => {
  const f = fixture();
  await expect(
    readAccountRewards(f.client, wallet, selection),
  ).rejects.toThrow();
  expect(f.getBlockNumber).not.toHaveBeenCalled();
  expect(f.readContract).not.toHaveBeenCalled();
});

it("rejects case-insensitive duplicate tier addresses", async () => {
  const f = fixture();
  const tier = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
  await expect(
    readAccountRewards(f.client, wallet, [
      { tier, name: "first", tokenIds: [1n] },
      {
        tier: tier.toUpperCase().replace("0X", "0x") as Address,
        name: "duplicate",
        tokenIds: [2n],
      },
    ]),
  ).rejects.toThrow();
  expect(f.readContract).not.toHaveBeenCalled();
});

it("accepts exactly 32 selections across eight tiers without imposing a wallet position limit", async () => {
  const selection = Array.from({ length: 8 }, (_, i) => ({
    tier: `0x${(i + 1).toString(16).padStart(40, "0")}` as Address,
    name: `Tier ${i}`,
    tokenIds: [1n, 2n, 3n, 4n],
  }));
  const result = await readAccountRewards(
    fixture([0n, 0n]).client,
    wallet,
    selection,
  );
  expect(result.results).toHaveLength(8);
  expect(result.results.flatMap((item) => item.positions)).toHaveLength(32);
});
