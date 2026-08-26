import { isAddress, type Address } from "viem";

export type AccountTierResult = {
  tier: Address;
  name: string;
  tokenId: bigint;
  active: boolean;
  claimableReward: bigint;
  claimableReferral: bigint;
  creatorProceeds: bigint;
};

type CachedAccountTier = Omit<
  AccountTierResult,
  "tokenId" | "claimableReward" | "claimableReferral" | "creatorProceeds"
> & {
  capturedBlock: string;
  tokenId: string;
  claimableReward: string;
  claimableReferral: string;
  creatorProceeds: string;
};

export type AccountCache = {
  version: 2;
  cursor: string;
  complete: boolean;
  results: CachedAccountTier[];
};

export function emptyAccountCache(): AccountCache {
  return { version: 2, cursor: "0", complete: false, results: [] };
}

export function accountCacheKey(
  chainId: number,
  factory: Address,
  wallet: Address,
) {
  return `backed-by-fans:account:v2:${chainId}:${factory.toLowerCase()}:${wallet.toLowerCase()}`;
}

function cachedResult(
  result: AccountTierResult,
  capturedBlock: bigint,
): CachedAccountTier {
  return {
    ...result,
    capturedBlock: capturedBlock.toString(),
    tokenId: result.tokenId.toString(),
    claimableReward: result.claimableReward.toString(),
    claimableReferral: result.claimableReferral.toString(),
    creatorProceeds: result.creatorProceeds.toString(),
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
    version: 2,
    cursor: page.resumeOffset.toString(),
    complete: page.complete,
    results: [...results.values()],
  };
}

function validCache(value: unknown): value is AccountCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as Partial<AccountCache>;
  if (
    cache.version !== 2 ||
    typeof cache.cursor !== "string" ||
    typeof cache.complete !== "boolean" ||
    !Array.isArray(cache.results)
  ) {
    return false;
  }
  try {
    BigInt(cache.cursor);
    return cache.results.every((result) => {
      if (
        !isAddress(result.tier) ||
        typeof result.name !== "string" ||
        typeof result.active !== "boolean"
      )
        return false;
      BigInt(result.capturedBlock);
      BigInt(result.tokenId);
      BigInt(result.claimableReward);
      BigInt(result.claimableReferral);
      BigInt(result.creatorProceeds);
      return true;
    });
  } catch {
    return false;
  }
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
