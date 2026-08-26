import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  accountCacheKey,
  emptyAccountCache,
  loadAccountCache,
  mergeAccountPage,
  saveAccountCache,
} from "@/features/membership/account-cache";

const wallet = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const tier = getAddress("0x3333333333333333333333333333333333333333");

function storage() {
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
  it("resumes one wallet/factory cursor without becoming canonical state", () => {
    const local = storage();
    const key = accountCacheKey(46_630, factory, wallet);
    const cache = mergeAccountPage(emptyAccountCache(), {
      resumeOffset: 24n,
      complete: false,
      capturedBlock: 90n,
      results: [
        {
          tier,
          name: "The listening room",
          tokenId: 1n,
          active: true,
          claimableReward: 2_000_000n,
          claimableReferral: 0n,
          creatorProceeds: 0n,
        },
      ],
    });
    saveAccountCache(local, key, cache);

    expect(loadAccountCache(local, key)).toMatchObject({
      cursor: "24",
      capturedBlock: "90",
      results: [{ tier, claimableReward: "2000000" }],
    });
  });

  it("deduplicates refreshed verified tiers and treats corrupt data as empty", () => {
    const first = mergeAccountPage(emptyAccountCache(), {
      resumeOffset: 1n,
      complete: false,
      capturedBlock: 10n,
      results: [
        {
          tier,
          name: "Room",
          tokenId: 1n,
          active: false,
          claimableReward: 1n,
          claimableReferral: 2n,
          creatorProceeds: 3n,
        },
      ],
    });
    const updated = mergeAccountPage(first, {
      resumeOffset: 1n,
      complete: true,
      capturedBlock: 12n,
      results: [
        {
          tier,
          name: "Room",
          tokenId: 1n,
          active: true,
          claimableReward: 5n,
          claimableReferral: 2n,
          creatorProceeds: 3n,
        },
      ],
    });
    expect(updated.results).toHaveLength(1);
    expect(updated.results[0]).toMatchObject({
      active: true,
      claimableReward: "5",
    });

    const local = storage();
    local.setItem("broken", "not-json");
    expect(loadAccountCache(local, "broken")).toEqual(emptyAccountCache());
  });

  it("keeps a skipped page resumable while retaining successful tier reads", () => {
    const cache = mergeAccountPage(emptyAccountCache(), {
      resumeOffset: 0n,
      complete: false,
      capturedBlock: 25n,
      results: [
        {
          tier,
          name: "Room",
          tokenId: 1n,
          active: true,
          claimableReward: 4n,
          claimableReferral: 0n,
          creatorProceeds: 0n,
        },
      ],
    });

    expect(cache.cursor).toBe("0");
    expect(cache.complete).toBe(false);
    expect(cache.results).toHaveLength(1);
  });

  it("isolates cursors and results when the wallet or factory changes", () => {
    const local = storage();
    const firstKey = accountCacheKey(46_630, factory, wallet);
    const nextWallet = getAddress("0x4444444444444444444444444444444444444444");
    const nextFactory = getAddress(
      "0x5555555555555555555555555555555555555555",
    );
    saveAccountCache(
      local,
      firstKey,
      mergeAccountPage(emptyAccountCache(), {
        resumeOffset: 24n,
        complete: false,
        capturedBlock: 90n,
        results: [
          {
            tier,
            name: "Room",
            tokenId: 1n,
            active: true,
            claimableReward: 1n,
            claimableReferral: 0n,
            creatorProceeds: 0n,
          },
        ],
      }),
    );

    expect(
      loadAccountCache(local, accountCacheKey(46_630, factory, nextWallet)),
    ).toEqual(emptyAccountCache());
    expect(
      loadAccountCache(local, accountCacheKey(46_630, nextFactory, wallet)),
    ).toEqual(emptyAccountCache());
  });
});
