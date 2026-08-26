import { robinhood, robinhoodTestnet } from "viem/chains";

export const supportedChains = [robinhoodTestnet, robinhood] as const;

export const supportedChainIds = [robinhoodTestnet.id, robinhood.id] as const;

export type SupportedChainId = (typeof supportedChainIds)[number];

export function isSupportedChainId(value: number): value is SupportedChainId {
  return supportedChainIds.some((chainId) => chainId === value);
}

export function getSupportedChain(chainId: SupportedChainId) {
  return chainId === robinhood.id ? robinhood : robinhoodTestnet;
}
