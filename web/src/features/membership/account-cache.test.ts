import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  accountCacheKey,
  emptyAccountCache,
  loadAccountCache,
  mergeAccountPage,
  mergeOwnerPage,
  saveAccountCache,
  type AccountTierResult,
} from "@/features/membership/account-cache";

const wallet = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const tier = getAddress("0x3333333333333333333333333333333333333333");
const secondTier = getAddress("0x4444444444444444444444444444444444444444");
const paymentToken = getAddress("0x6666666666666666666666666666666666666666");

function result(overrides: Partial<AccountTierResult> = {}): AccountTierResult {
  return {
    tier,
    name: "The listening room",
    creatorOwned: false,
    paymentToken,
    positions: [
      {
        tokenId: 1n,
        active: true,
        expiration: 200n,
        claimableReward: 2_000_000n,
      },
    ],
    ownerBalance: 1n,
    nextOwnerOffset: 1n,
    ownerComplete: true,
    claimableReferral: 0n,
    creatorProceeds: 0n,
    retiredReward: 0n,
    retiredFractionalScaled: 0n,
    ...overrides,
  };
}

function page(results: AccountTierResult[], capturedBlock = 90n) {
  return {
    resumeOffset: 24n,
    complete: false,
    capturedBlock,
    scannedTiers: results.map(({ tier }) => tier),
    results,
  };
}

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } satisfies Storage;
}

describe("account discovery cache", () => {
  it("serializes every position and retired fraction exactly in version 5", () => {
    const local = createMemoryStorage();
    const key = accountCacheKey(46_630, factory, wallet);
    const hugeId = 9_007_199_254_740_993n;
    const fraction = (1n << 128n) - 1n;
    const cache = mergeAccountPage(
      emptyAccountCache(),
      page([
        result({
          positions: [
            result().positions[0],
            {
              tokenId: hugeId,
              active: false,
              expiration: 100n,
              claimableReward: hugeId,
            },
          ],
          ownerBalance: 101n,
          nextOwnerOffset: 2n,
          ownerComplete: false,
          retiredReward: 7n,
          retiredFractionalScaled: fraction,
        }),
      ]),
    );
    saveAccountCache(local, key, cache);
    expect(key).toContain(":v5:");
    expect(loadAccountCache(local, key)).toMatchObject({
      version: 5,
      cursor: "24",
      results: [
        {
          tier,
          capturedBlock: "90",
          ownerBalance: "101",
          nextOwnerOffset: "2",
          ownerComplete: false,
          retiredReward: "7",
          retiredFractionalScaled: fraction.toString(),
          positions: [
            { tokenId: "1", expiration: "200", claimableReward: "2000000" },
            {
              tokenId: hugeId.toString(),
              expiration: "100",
              claimableReward: hugeId.toString(),
            },
          ],
        },
      ],
    });
  });

  it("appends same-block owner pages and deduplicates token IDs without merging positions", () => {
    const first = mergeAccountPage(
      emptyAccountCache(),
      page([
        result({
          ownerBalance: 3n,
          ownerComplete: false,
        }),
      ]),
    );
    const next = result({
      positions: [
        result().positions[0],
        { tokenId: 2n, active: false, expiration: 80n, claimableReward: 3n },
        { tokenId: 3n, active: true, expiration: 300n, claimableReward: 4n },
      ],
      ownerBalance: 3n,
      nextOwnerOffset: 3n,
      ownerComplete: true,
    });
    const merged = mergeOwnerPage(first, next, 90n);
    expect(merged.results).toHaveLength(1);
    expect(merged.results[0].positions.map(({ tokenId }) => tokenId)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(merged.results[0]).toMatchObject({
      nextOwnerOffset: "3",
      ownerComplete: true,
    });
    expect(merged.cursor).toBe(first.cursor);
    expect(merged.complete).toBe(first.complete);
    expect(first.results[0].positions).toHaveLength(1);
  });

  it("rejects owner continuation at a different block instead of mixing snapshots", () => {
    const first = mergeAccountPage(
      emptyAccountCache(),
      page([result({ ownerComplete: false })]),
    );
    expect(() => mergeOwnerPage(first, result(), 91n)).toThrow();
    expect(first.results[0].capturedBlock).toBe("90");
  });

  it("restarts a refreshed tier at its new first page and discards old owner pages", () => {
    const first = mergeAccountPage(
      emptyAccountCache(),
      page([
        result({
          positions: [
            result().positions[0],
            {
              tokenId: 2n,
              active: true,
              expiration: 300n,
              claimableReward: 5n,
            },
          ],
          ownerBalance: 2n,
          nextOwnerOffset: 2n,
        }),
      ]),
    );
    const refreshed = mergeAccountPage(
      first,
      page(
        [
          result({
            positions: [
              {
                tokenId: 3n,
                active: true,
                expiration: 400n,
                claimableReward: 9n,
              },
            ],
          }),
        ],
        91n,
      ),
    );
    expect(
      refreshed.results[0].positions.map(({ tokenId }) => tokenId),
    ).toEqual(["3"]);
    expect(refreshed.results[0].capturedBlock).toBe("91");
  });

  it("keeps matching token IDs independent across tiers and owner-level balances once", () => {
    const cache = mergeAccountPage(
      emptyAccountCache(),
      page([
        result({ retiredReward: 7n, claimableReferral: 8n }),
        result({ tier: secondTier, retiredReward: 10n }),
      ]),
    );
    const merged = mergeOwnerPage(
      cache,
      result({ retiredReward: 7n, claimableReferral: 8n }),
      90n,
    );
    expect(merged.results).toHaveLength(2);
    expect(merged.results[0]).toMatchObject({
      retiredReward: "7",
      claimableReferral: "8",
    });
    expect(merged.results[1]).toMatchObject({
      tier: secondTier,
      retiredReward: "10",
    });
    expect(
      merged.results.every(({ positions }) => positions[0].tokenId === "1"),
    ).toBe(true);
  });

  it("retains zero-NFT fractional retired interest", () => {
    const cache = mergeAccountPage(
      emptyAccountCache(),
      page([
        result({
          positions: [],
          ownerBalance: 0n,
          nextOwnerOffset: 0n,
          retiredFractionalScaled: 1n,
        }),
      ]),
    );
    const local = createMemoryStorage();
    saveAccountCache(local, "retired", cache);
    expect(loadAccountCache(local, "retired").results[0]).toMatchObject({
      positions: [],
      ownerBalance: "0",
      retiredReward: "0",
      retiredFractionalScaled: "1",
    });
  });

  it("treats corrupt nested values and obsolete singleton caches as empty", () => {
    const local = createMemoryStorage();
    local.setItem("broken", "not-json");
    expect(loadAccountCache(local, "broken")).toEqual(emptyAccountCache());
    const cache = mergeAccountPage(emptyAccountCache(), page([result()]));
    local.setItem("broken", JSON.stringify({ ...cache, version: 4 }));
    expect(loadAccountCache(local, "broken")).toEqual(emptyAccountCache());
    local.setItem(
      "broken",
      JSON.stringify({
        ...cache,
        results: [
          {
            ...cache.results[0],
            positions: [
              { ...cache.results[0].positions[0], expiration: "unavailable" },
            ],
          },
        ],
      }),
    );
    expect(loadAccountCache(local, "broken")).toEqual(emptyAccountCache());
  });

  it("keeps skipped catalog pages resumable while retaining successful reads", () => {
    const cache = mergeAccountPage(emptyAccountCache(), {
      ...page([result()]),
      resumeOffset: 0n,
    });
    expect(cache.cursor).toBe("0");
    expect(cache.complete).toBe(false);
    expect(cache.results).toHaveLength(1);
  });

  it("isolates snapshots by chain, wallet and factory", () => {
    const local = createMemoryStorage();
    const key = accountCacheKey(46_630, factory, wallet);
    saveAccountCache(
      local,
      key,
      mergeAccountPage(emptyAccountCache(), page([result()])),
    );
    for (const otherKey of [
      accountCacheKey(46_630, factory, secondTier),
      accountCacheKey(46_630, secondTier, wallet),
      accountCacheKey(46_631, factory, wallet),
    ]) {
      expect(loadAccountCache(local, otherKey)).toEqual(emptyAccountCache());
    }
  });

  it("removes a cached claim when its rescanned tier has no current result", () => {
    const populated = mergeAccountPage(emptyAccountCache(), page([result()]));
    const refreshed = mergeAccountPage(populated, {
      ...page([], 91n),
      scannedTiers: [tier],
    });
    expect(refreshed.results).toEqual([]);
  });
});
