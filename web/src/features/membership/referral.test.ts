import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  captureSharedReferrer,
  membershipShareUrl,
  referralStorageKey,
} from "@/features/membership/referral";

const tier = getAddress("0x2222222222222222222222222222222222222222");
const first = getAddress("0x1111111111111111111111111111111111111111");
const second = getAddress("0x3333333333333333333333333333333333333333");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("membership referrals", () => {
  it("captures a shared referrer per chain and tier and removes it from the URL", () => {
    const storage = memoryStorage();
    const url = new URL(
      `https://backedbyfans.example/chains/46630/tiers/${tier}?ref=${first}&view=compact#join`,
    );

    const result = captureSharedReferrer({
      chainId: 46_630,
      tier,
      url,
      storage,
    });

    expect(result).toEqual({
      referrer: first,
      cleanPath: `/chains/46630/tiers/${tier}?view=compact#join`,
    });
    expect(storage.getItem(referralStorageKey(46_630, tier))).toBe(first);
  });

  it("reuses the sticky referrer and lets a later valid share replace it", () => {
    const storage = memoryStorage();
    storage.setItem(referralStorageKey(46_630, tier), first);

    expect(
      captureSharedReferrer({
        chainId: 46_630,
        tier,
        url: new URL(`https://backedbyfans.example/chains/46630/tiers/${tier}`),
        storage,
      }).referrer,
    ).toBe(first);

    expect(
      captureSharedReferrer({
        chainId: 46_630,
        tier,
        url: new URL(
          `https://backedbyfans.example/chains/46630/tiers/${tier}?ref=${second}`,
        ),
        storage,
      }).referrer,
    ).toBe(second);
  });

  it("builds a chain-qualified share link for the connected wallet", () => {
    expect(
      membershipShareUrl({
        origin: "https://backedbyfans.example",
        chainId: 46_630,
        tier,
        referrer: first,
      }),
    ).toBe(
      `https://backedbyfans.example/chains/46630/tiers/${tier}?ref=${first}`,
    );
  });
});
