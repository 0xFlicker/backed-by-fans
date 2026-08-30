import { getAddress, isAddress, type Address } from "viem";

export const referralQueryParameter = "ref";

export function referralStorageKey(chainId: number, tier: Address) {
  return `backed-by-fans:referrer:${chainId}:${tier.toLowerCase()}`;
}

function normalizedAddress(value: string | null) {
  return value && isAddress(value) ? getAddress(value) : undefined;
}

export function captureSharedReferrer({
  chainId,
  tier,
  url,
  storage,
}: {
  chainId: number;
  tier: Address;
  url: URL;
  storage?: Pick<Storage, "getItem" | "setItem">;
}) {
  const key = referralStorageKey(chainId, tier);
  const shared = normalizedAddress(
    url.searchParams.get(referralQueryParameter),
  );

  if (shared) storage?.setItem(key, shared);

  const referrer = shared ?? normalizedAddress(storage?.getItem(key) ?? null);
  const hadReferralParameter = url.searchParams.has(referralQueryParameter);
  url.searchParams.delete(referralQueryParameter);

  return {
    referrer,
    cleanPath: hadReferralParameter
      ? `${url.pathname}${url.search}${url.hash}`
      : undefined,
  };
}

export function membershipShareUrl({
  origin,
  chainId,
  tier,
  referrer,
}: {
  origin: string;
  chainId: number;
  tier: Address;
  referrer: Address;
}) {
  const url = new URL(`/chains/${chainId}/tiers/${tier}`, origin);
  url.searchParams.set(referralQueryParameter, referrer);
  return url.toString();
}
