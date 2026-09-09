import type { Address } from "viem";
import verifiedSources from "../../../contracts/external/verification/4663/sources.json";
import { isSameAddress } from "@/lib/address";

// Use the existing verified dependency record, never a token's display symbol.
export function isWrappedNative(chainId: number, token: Address) {
  return (
    (chainId === verifiedSources.origin.chainId || chainId === 31337) &&
    isSameAddress(token, verifiedSources.records.weth.address as Address)
  );
}
