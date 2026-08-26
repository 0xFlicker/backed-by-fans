import { getAddress, isAddress, type Address, type Hex } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

import {
  getSupportedChain,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/chains";

export const officialMainnetUsdg = getAddress(
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
);
export const officialTestnetUsdg = getAddress(
  "0x7E955252E15c84f5768B83c41a71F9eba181802F",
);

export type PublicEnvironment = {
  chainId?: string;
  factoryAddress?: string;
  usdgAddress?: string;
  factoryRuntimeCodeHash?: string;
  rendererRuntimeCodeHash?: string;
  deployerRuntimeCodeHash?: string;
  usdgRuntimeCodeHash?: string;
  usdgImplementationAddress?: string;
  usdgImplementationRuntimeCodeHash?: string;
  mainnetRpcUrl?: string;
  testnetRpcUrl?: string;
  walletConnectProjectId?: string;
  siteUrl?: string;
};

type DeploymentCommitments = {
  factoryRuntimeCodeHash: Hex;
  rendererRuntimeCodeHash: Hex;
  deployerRuntimeCodeHash: Hex;
  usdgRuntimeCodeHash: Hex;
  usdgImplementationAddress: Address;
  usdgImplementationRuntimeCodeHash: Hex;
};

export type ReadyDeployment = DeploymentCommitments & {
  status: "ready";
  chainId: SupportedChainId;
  factoryAddress: Address;
  usdgAddress: Address;
};

export type DeploymentAvailability =
  | ReadyDeployment
  | {
      status: "unavailable";
      reason:
        | "factory-not-deployed"
        | "deployment-commitments-missing"
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

function parseHash(value: string | undefined): Hex | undefined {
  const candidate = value?.trim();
  return candidate && /^0x[0-9a-fA-F]{64}$/.test(candidate)
    ? (candidate.toLowerCase() as Hex)
    : undefined;
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
  const configuredUsdgValue = environment.usdgAddress?.trim();
  const configuredUsdg = parseAddress(environment.usdgAddress);
  const officialUsdg =
    chainId === robinhood.id ? officialMainnetUsdg : officialTestnetUsdg;
  const commitments = {
    factoryRuntimeCodeHash: parseHash(environment.factoryRuntimeCodeHash),
    rendererRuntimeCodeHash: parseHash(environment.rendererRuntimeCodeHash),
    deployerRuntimeCodeHash: parseHash(environment.deployerRuntimeCodeHash),
    usdgRuntimeCodeHash: parseHash(environment.usdgRuntimeCodeHash),
    usdgImplementationAddress: parseAddress(
      environment.usdgImplementationAddress,
    ),
    usdgImplementationRuntimeCodeHash: parseHash(
      environment.usdgImplementationRuntimeCodeHash,
    ),
  };
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
  } else if (
    configuredUsdgValue &&
    (!configuredUsdg || configuredUsdg !== officialUsdg)
  ) {
    deployment = {
      status: "unavailable",
      reason: "invalid-public-config",
      detail:
        "The configured token is not the official USDG proxy for this chain.",
    };
  } else if (Object.values(commitments).some((value) => !value)) {
    deployment = {
      status: "unavailable",
      reason: "deployment-commitments-missing",
      detail:
        "The checked deployment record's complete proxy, implementation, and runtime-code commitments are required before writes can be enabled.",
    };
  } else {
    deployment = {
      status: "ready",
      chainId,
      factoryAddress,
      usdgAddress: officialUsdg,
      ...(commitments as DeploymentCommitments),
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
  factoryRuntimeCodeHash: process.env.NEXT_PUBLIC_FACTORY_RUNTIME_CODE_HASH,
  rendererRuntimeCodeHash: process.env.NEXT_PUBLIC_RENDERER_RUNTIME_CODE_HASH,
  deployerRuntimeCodeHash: process.env.NEXT_PUBLIC_DEPLOYER_RUNTIME_CODE_HASH,
  usdgRuntimeCodeHash: process.env.NEXT_PUBLIC_USDG_RUNTIME_CODE_HASH,
  usdgImplementationAddress:
    process.env.NEXT_PUBLIC_USDG_IMPLEMENTATION_ADDRESS,
  usdgImplementationRuntimeCodeHash:
    process.env.NEXT_PUBLIC_USDG_IMPLEMENTATION_RUNTIME_CODE_HASH,
  mainnetRpcUrl: process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL,
  testnetRpcUrl: process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL,
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
});
