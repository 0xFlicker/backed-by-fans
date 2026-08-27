import { foundry, robinhood, robinhoodTestnet, type Chain } from "viem/chains";

export const localAnvil = {
  ...foundry,
  name: "Backed By Fans Anvil",
} as const satisfies Chain;

export const publicChains = [robinhoodTestnet, robinhood] as const;

export const publicChainIds = [robinhoodTestnet.id, robinhood.id] as const;

export const supportedChainIds = [
  robinhoodTestnet.id,
  robinhood.id,
  localAnvil.id,
] as const;

export type PublicChainId = (typeof publicChainIds)[number];
export type SupportedChainId = (typeof supportedChainIds)[number];

export function isPublicChainId(value: number): value is PublicChainId {
  return publicChainIds.some((chainId) => chainId === value);
}

export function isSupportedChainId(value: number): value is SupportedChainId {
  return supportedChainIds.some((chainId) => chainId === value);
}

export function parseSupportedChainId(value: string) {
  const chainId = Number(value);
  return Number.isSafeInteger(chainId) && isSupportedChainId(chainId)
    ? chainId
    : undefined;
}

export function getSupportedChain(chainId: SupportedChainId) {
  if (chainId === robinhood.id) return robinhood;
  if (chainId === robinhoodTestnet.id) return robinhoodTestnet;
  return localAnvil;
}
