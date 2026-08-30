import { getAddress, isAddress, type Address } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

import * as generatedContracts from "@/contracts";
import {
  getSupportedChain,
  isSupportedChainId,
  localAnvil,
  type SupportedChainId,
} from "@/lib/chains";

export const officialMainnetUsdg = getAddress(
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
);

export type PublicEnvironment = {
  walletConnectProjectId?: string;
  siteUrl?: string;
  anvilRpcUrl?: string;
  anvilFactoryAddress?: string;
  anvilUsdgAddress?: string;
};

export type ReadyDeployment = {
  status: "ready";
  chainId: SupportedChainId;
  factoryAddress: Address;
  usdgAddress: Address;
};

export type DeploymentAvailability =
  | ReadyDeployment
  | {
      status: "unavailable";
      chainId: SupportedChainId;
      reason: "factory-not-deployed" | "unsupported-chain";
      detail: string;
    };

export type PublicConfig = {
  anvilRpcUrl?: string;
  walletConnectProjectId?: string;
  siteUrl: string;
  defaultChainId: SupportedChainId;
  deployments: Readonly<Partial<Record<SupportedChainId, ReadyDeployment>>>;
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

function parseRequiredAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${label} is not a valid address.`);
  }
  return getAddress(value);
}

function generatedFactoryAddresses(): Partial<
  Record<SupportedChainId, Address>
> {
  const exports = generatedContracts as Record<string, unknown>;
  const value = exports.robinhoodMembershipFactoryAddress;
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "The generated RobinhoodMembershipFactory deployment map is invalid.",
    );
  }

  const addresses: Partial<Record<SupportedChainId, Address>> = {};
  for (const [rawChainId, rawAddress] of Object.entries(value)) {
    const chainId = Number(rawChainId);
    if (chainId !== robinhood.id && chainId !== robinhoodTestnet.id) continue;
    addresses[chainId] = parseRequiredAddress(
      rawAddress,
      `Generated RobinhoodMembershipFactory address for chain ${chainId}`,
    );
  }
  return addresses;
}

function generatedUsdgAddresses(): Partial<Record<SupportedChainId, Address>> {
  const exports = generatedContracts as Record<string, unknown>;
  const addresses: Partial<Record<SupportedChainId, Address>> = {
    [robinhood.id]: officialMainnetUsdg,
  };
  const value = exports.testnetUsdgAddress;
  if (value === undefined) return addresses;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The generated TestnetUSDG deployment map is invalid.");
  }
  const testnetAddress = (value as Record<number, unknown>)[
    robinhoodTestnet.id
  ];
  if (testnetAddress !== undefined) {
    addresses[robinhoodTestnet.id] = parseRequiredAddress(
      testnetAddress,
      `Generated TestnetUSDG address for chain ${robinhoodTestnet.id}`,
    );
  }
  return addresses;
}

export function buildPublicConfig(
  environment: PublicEnvironment,
  factoryAddresses: Partial<
    Record<number, string>
  > = generatedFactoryAddresses(),
  usdgAddresses: Partial<Record<number, string>> = generatedUsdgAddresses(),
): PublicConfig {
  const siteUrl = parsePublicUrl(environment.siteUrl, "http://localhost:3000");
  const deployments: Partial<Record<SupportedChainId, ReadyDeployment>> = {};

  for (const chainId of [robinhoodTestnet.id, robinhood.id] as const) {
    const factoryAddress = factoryAddresses[chainId];
    const usdgAddress = usdgAddresses[chainId];
    if (!factoryAddress || !usdgAddress) continue;
    deployments[chainId] = {
      status: "ready",
      chainId,
      factoryAddress: parseRequiredAddress(
        factoryAddress,
        `MembershipFactory address for chain ${chainId}`,
      ),
      usdgAddress: parseRequiredAddress(
        usdgAddress,
        `USDG address for chain ${chainId}`,
      ),
    };
  }

  const localValues = [
    environment.anvilRpcUrl?.trim(),
    environment.anvilFactoryAddress?.trim(),
    environment.anvilUsdgAddress?.trim(),
  ];
  const hasAnyLocalValue = localValues.some(Boolean);
  const hasEveryLocalValue = localValues.every(Boolean);
  if (hasAnyLocalValue && !hasEveryLocalValue) {
    throw new Error(
      "Anvil configuration requires its RPC URL, factory address, and USDG address together.",
    );
  }

  let anvilRpcUrl: string | undefined;
  if (hasEveryLocalValue) {
    anvilRpcUrl = parsePublicUrl(environment.anvilRpcUrl, "");
    if (!anvilRpcUrl) throw new Error("The Anvil RPC URL is invalid.");
    deployments[localAnvil.id] = {
      status: "ready",
      chainId: localAnvil.id,
      factoryAddress: parseRequiredAddress(
        environment.anvilFactoryAddress,
        "Anvil MembershipFactory address",
      ),
      usdgAddress: parseRequiredAddress(
        environment.anvilUsdgAddress,
        "Anvil USDG address",
      ),
    };
  }

  const walletConnectProjectId =
    environment.walletConnectProjectId?.trim() || undefined;

  return {
    anvilRpcUrl,
    walletConnectProjectId,
    siteUrl,
    defaultChainId: deployments[robinhood.id]
      ? robinhood.id
      : robinhoodTestnet.id,
    deployments,
  };
}

export function getDeployment(
  config: PublicConfig,
  chainId: number,
): DeploymentAvailability {
  if (!isSupportedChainId(chainId)) {
    return {
      status: "unavailable",
      chainId: config.defaultChainId,
      reason: "unsupported-chain",
      detail: `Chain ${chainId} is not supported by this application.`,
    };
  }
  return (
    config.deployments[chainId] ?? {
      status: "unavailable",
      chainId,
      reason: "factory-not-deployed",
      detail: `Backed By Fans is not deployed on ${getSupportedChain(chainId).name}.`,
    }
  );
}

export const publicConfig = buildPublicConfig({
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  anvilRpcUrl: process.env.NEXT_PUBLIC_ANVIL_RPC_URL,
  anvilFactoryAddress: process.env.NEXT_PUBLIC_ANVIL_FACTORY_ADDRESS,
  anvilUsdgAddress: process.env.NEXT_PUBLIC_ANVIL_USDG_ADDRESS,
});
