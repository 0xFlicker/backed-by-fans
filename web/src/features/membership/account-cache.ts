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
  tokenId: string;
  claimableReward: string;
  claimableReferral: string;
  creatorProceeds: string;
};

export type AccountCache = {
  version: 1;
  cursor: string;
  capturedBlock?: string;
  complete: boolean;
  results: CachedAccountTier[];
};

export function emptyAccountCache(): AccountCache {
  return { version: 1, cursor: "0", complete: false, results: [] };
}

export function accountCacheKey(
  chainId: number,
  factory: Address,
  wallet: Address,
) {
  return `backed-by-fans:account:v1:${chainId}:${factory.toLowerCase()}:${wallet.toLowerCase()}`;
}

function cachedResult(result: AccountTierResult): CachedAccountTier {
  return {
    ...result,
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
    results: AccountTierResult[];
  },
): AccountCache {
  const results = new Map(
    cache.results.map((result) => [result.tier.toLowerCase(), result]),
  );
  page.results.forEach((result) =>
    results.set(result.tier.toLowerCase(), cachedResult(result)),
  );
  return {
    version: 1,
    cursor: page.resumeOffset.toString(),
    capturedBlock: page.capturedBlock.toString(),
    complete: page.complete,
    results: [...results.values()],
  };
}

function validCache(value: unknown): value is AccountCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as Partial<AccountCache>;
  if (
    cache.version !== 1 ||
    typeof cache.cursor !== "string" ||
    (cache.capturedBlock !== undefined &&
      typeof cache.capturedBlock !== "string") ||
    typeof cache.complete !== "boolean" ||
    !Array.isArray(cache.results)
  ) {
    return false;
  }
  try {
    BigInt(cache.cursor);
    if (cache.capturedBlock) BigInt(cache.capturedBlock);
    return cache.results.every((result) => {
      if (
        !isAddress(result.tier) ||
        typeof result.name !== "string" ||
        typeof result.active !== "boolean"
      )
        return false;
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
