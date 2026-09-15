import { getAddress, zeroAddress, type Address } from "viem";
import routes from "../../../../specs/003-protocol-buyback-burn/evidence/pinned-preflight-inputs-20260907.json";
import type { Pool } from "./model";

/** Venue catalog only. Every purchase obtains a live quote; no standing operator policy is read or written. */
export function operatorRoute(
  chainId: number,
  asset: Address,
): { pools: Pool[]; label: string } | undefined {
  if (chainId !== 31337 && chainId !== routes.origin.chainId) return undefined;
  const key = asset.toLowerCase();
  const entry = routes.assets.find(
    (token) => token.address.toLowerCase() === key,
  );
  if (asset === zeroAddress || entry?.kind === "non-stock")
    return { pools: [], label: "ETH → protocol token" };
  const route =
    entry?.kind === "usdg"
      ? routes.routes.usdg
      : entry?.kind === "stock"
        ? routes.routes.stock
        : undefined;
  if (!route) return undefined;
  return {
    pools: route.pools.map((pool) => ({
      ...pool,
      currency0: getAddress(pool.currency0),
      currency1: getAddress(pool.currency1),
      hooks: getAddress(pool.hooks),
    })),
    label:
      entry!.kind === "usdg"
        ? "USDG → ETH → protocol token"
        : "AMD → USDG → ETH → protocol token",
  };
}
