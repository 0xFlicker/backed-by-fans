import { getAddress, isAddress, type Address } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

import {
  getSupportedChain,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/chains";

export const officialMainnetUsdg = getAddress(
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
);

export type PublicEnvironment = {
  chainId?: string;
  factoryAddress?: string;
  usdgAddress?: string;
  mainnetRpcUrl?: string;
  testnetRpcUrl?: string;
  walletConnectProjectId?: string;
  siteUrl?: string;
};

export type DeploymentAvailability =
  | { status: "ready"; factoryAddress: Address; usdgAddress: Address }
  | {
      status: "unavailable";
      reason:
        | "factory-not-deployed"
        | "payment-token-unconfirmed"
        | "invalid-public-config";
      detail: string;
    };

export type PublicConfig = {
  chainId: SupportedChainId;
  chain: ReturnType<typeof getSupportedChain>;
  mainnetRpcUrl: string;
  testnetRpcUrl: string;
  rpcUrl: string;
  walletConnectProjectId?: string;
  siteUrl: string;
  deployment: DeploymentAvailability;
};

function parsePublicUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function parseAddress(value: string | undefined): Address | undefined {
  const candidate = value?.trim();
  if (!candidate || !isAddress(candidate)) return undefined;
  return getAddress(candidate);
}

export function buildPublicConfig(
  environment: PublicEnvironment,
): PublicConfig {
  const requestedChainId = Number(environment.chainId || robinhoodTestnet.id);
  const chainId = isSupportedChainId(requestedChainId)
    ? requestedChainId
    : robinhoodTestnet.id;
  const chain = getSupportedChain(chainId);
  const mainnetRpcUrl = parsePublicUrl(
    environment.mainnetRpcUrl,
    robinhood.rpcUrls.default.http[0],
  );
  const testnetRpcUrl = parsePublicUrl(
    environment.testnetRpcUrl,
    robinhoodTestnet.rpcUrls.default.http[0],
  );
  const siteUrl = parsePublicUrl(environment.siteUrl, "http://localhost:3000");
  const factoryAddress = parseAddress(environment.factoryAddress);
  const configuredUsdg = parseAddress(environment.usdgAddress);
  const walletConnectProjectId =
    environment.walletConnectProjectId?.trim() || undefined;

  let deployment: DeploymentAvailability;

  if (!isSupportedChainId(requestedChainId)) {
    deployment = {
      status: "unavailable",
      reason: "invalid-public-config",
      detail: `Unsupported public chain ID ${environment.chainId ?? ""}.`,
    };
  } else if (!factoryAddress) {
    deployment = {
      status: "unavailable",
      reason: "factory-not-deployed",
      detail: "No independently checked factory is configured for this chain.",
    };
  } else if (chainId === robinhoodTestnet.id && !configuredUsdg) {
    deployment = {
      status: "unavailable",
      reason: "payment-token-unconfirmed",
      detail:
        "No approved official source currently publishes canonical testnet USDG.",
    };
  } else if (
    chainId === robinhood.id &&
    configuredUsdg &&
    configuredUsdg !== officialMainnetUsdg
  ) {
    deployment = {
      status: "unavailable",
      reason: "invalid-public-config",
      detail: "The configured mainnet token is not the official USDG proxy.",
    };
  } else {
    deployment = {
      status: "ready",
      factoryAddress,
      usdgAddress:
        chainId === robinhood.id
          ? officialMainnetUsdg
          : (configuredUsdg as Address),
    };
  }

  return {
    chainId,
    chain,
    mainnetRpcUrl,
    testnetRpcUrl,
    rpcUrl: chainId === robinhood.id ? mainnetRpcUrl : testnetRpcUrl,
    walletConnectProjectId,
    siteUrl,
    deployment,
  };
}

export const publicConfig = buildPublicConfig({
  chainId: process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID,
  factoryAddress: process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
  usdgAddress: process.env.NEXT_PUBLIC_USDG_ADDRESS,
  mainnetRpcUrl: process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL,
  testnetRpcUrl: process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL,
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
});
