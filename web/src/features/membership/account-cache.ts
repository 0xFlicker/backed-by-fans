import { isAddress, type Address } from "viem";

export type AccountPosition = {
  tokenId: bigint;
  active: boolean;
  expiration: bigint;
  claimableReward: bigint;
};
export type AccountTierResult = {
  tier: Address;
  name: string;
  creatorOwned: boolean;
  paymentToken: Address;
  positions: AccountPosition[];
  ownerBalance: bigint;
  nextOwnerOffset: bigint;
  ownerComplete: boolean;
  claimableReferral: bigint;
  creatorProceeds: bigint;
  retiredReward: bigint;
  retiredFractionalScaled: bigint;
};
type CachedPosition = {
  tokenId: string;
  active: boolean;
  expiration: string;
  claimableReward: string;
};
export type CachedAccountTier = Omit<
  AccountTierResult,
  | "positions"
  | "ownerBalance"
  | "nextOwnerOffset"
  | "claimableReferral"
  | "creatorProceeds"
  | "retiredReward"
  | "retiredFractionalScaled"
> & {
  capturedBlock: string;
  positions: CachedPosition[];
  ownerBalance: string;
  nextOwnerOffset: string;
  claimableReferral: string;
  creatorProceeds: string;
  retiredReward: string;
  retiredFractionalScaled: string;
};
export type AccountCache = {
  version: 5;
  cursor: string;
  complete: boolean;
  results: CachedAccountTier[];
};
export function emptyAccountCache(): AccountCache {
  return { version: 5, cursor: "0", complete: false, results: [] };
}
export function accountCacheKey(
  chainId: number,
  factory: Address,
  wallet: Address,
) {
  return `backed-by-fans:account:v5:${chainId}:${factory.toLowerCase()}:${wallet.toLowerCase()}`;
}
function cachedResult(
  result: AccountTierResult,
  capturedBlock: bigint,
): CachedAccountTier {
  return {
    ...result,
    capturedBlock: capturedBlock.toString(),
    positions: result.positions.map((p) => ({
      ...p,
      tokenId: p.tokenId.toString(),
      expiration: p.expiration.toString(),
      claimableReward: p.claimableReward.toString(),
    })),
    ownerBalance: result.ownerBalance.toString(),
    nextOwnerOffset: result.nextOwnerOffset.toString(),
    claimableReferral: result.claimableReferral.toString(),
    creatorProceeds: result.creatorProceeds.toString(),
    retiredReward: result.retiredReward.toString(),
    retiredFractionalScaled: result.retiredFractionalScaled.toString(),
  };
}
export function mergeAccountPage(
  cache: AccountCache,
  page: {
    resumeOffset: bigint;
    complete: boolean;
    capturedBlock: bigint;
    scannedTiers: Address[];
    results: AccountTierResult[];
  },
): AccountCache {
  const results = new Map(
    cache.results.map((result) => [result.tier.toLowerCase(), result]),
  );
  page.scannedTiers.forEach((tier) => results.delete(tier.toLowerCase()));
  page.results.forEach((result) =>
    results.set(
      result.tier.toLowerCase(),
      cachedResult(result, page.capturedBlock),
    ),
  );
  return {
    version: 5,
    cursor: page.resumeOffset.toString(),
    complete: page.complete,
    results: [...results.values()],
  };
}
export function mergeOwnerPage(
  cache: AccountCache,
  page: AccountTierResult,
  capturedBlock: bigint,
): AccountCache {
  const index = cache.results.findIndex(
    (tier) => tier.tier.toLowerCase() === page.tier.toLowerCase(),
  );
  const existing = cache.results[index];
  if (!existing || existing.capturedBlock !== capturedBlock.toString())
    throw new Error(
      "Ownership snapshot changed. Refresh memberships to restart discovery.",
    );
  if (
    existing.ownerBalance !== page.ownerBalance.toString() ||
    page.nextOwnerOffset < BigInt(existing.nextOwnerOffset)
  )
    throw new Error("Ownership page does not continue this snapshot.");
  const next = cachedResult(page, capturedBlock);
  const positions = new Map(
    existing.positions.map((position) => [position.tokenId, position]),
  );
  next.positions.forEach((position) =>
    positions.set(position.tokenId, position),
  );
  const results = [...cache.results];
  results[index] = { ...next, positions: [...positions.values()] };
  return { ...cache, results };
}
function numeric(value: unknown) {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}
function validCache(value: unknown): value is AccountCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as AccountCache;
  return (
    cache.version === 5 &&
    numeric(cache.cursor) &&
    typeof cache.complete === "boolean" &&
    Array.isArray(cache.results) &&
    cache.results.every(
      (result) =>
        isAddress(result.tier) &&
        isAddress(result.paymentToken) &&
        typeof result.name === "string" &&
        typeof result.creatorOwned === "boolean" &&
        typeof result.ownerComplete === "boolean" &&
        [
          result.capturedBlock,
          result.ownerBalance,
          result.nextOwnerOffset,
          result.claimableReferral,
          result.creatorProceeds,
          result.retiredReward,
          result.retiredFractionalScaled,
        ].every(numeric) &&
        Array.isArray(result.positions) &&
        result.positions.every(
          (p) =>
            numeric(p.tokenId) &&
            p.tokenId !== "0" &&
            numeric(p.expiration) &&
            numeric(p.claimableReward) &&
            typeof p.active === "boolean",
        ),
    )
  );
}
export function loadAccountCache(storage: Storage, key: string): AccountCache {
  const serialized = storage.getItem(key);
  if (!serialized) return emptyAccountCache();
  try {
    const parsed: unknown = JSON.parse(serialized);
    return validCache(parsed) ? parsed : emptyAccountCache();
  } catch {
    return emptyAccountCache();
  }
}
export function saveAccountCache(
  storage: Storage,
  key: string,
  cache: AccountCache,
) {
  storage.setItem(key, JSON.stringify(cache));
}
