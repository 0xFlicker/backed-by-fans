import { getAddress, isAddress, type Address } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

import * as generatedContracts from "@/contracts";
import {
  getSupportedChain,
  isSupportedChainId,
  localAnvil,
  type SupportedChainId,
} from "@/lib/chains";

export type PublicEnvironment = {
  walletConnectProjectId?: string;
  siteUrl?: string;
  anvilRpcUrl?: string;
  anvilFactoryAddress?: string;
  anvilRendererAddress?: string;
  anvilPreviewHarnessAddress?: string;
  anvilRendererRegistryAddress?: string;
};

export type ReadyDeployment = {
  status: "ready";
  chainId: SupportedChainId;
  factoryAddress: Address;
  rendererAddress: Address;
  previewHarnessAddress: Address;
  rendererRegistryAddress?: Address;
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
  const value = exports.membershipFactoryAddress;
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "The generated MembershipFactory deployment map is invalid.",
    );
  }

  const addresses: Partial<Record<SupportedChainId, Address>> = {};
  for (const [rawChainId, rawAddress] of Object.entries(value)) {
    const chainId = Number(rawChainId);
    if (chainId !== robinhood.id && chainId !== robinhoodTestnet.id) continue;
    addresses[chainId] = parseRequiredAddress(
      rawAddress,
      `Generated MembershipFactory address for chain ${chainId}`,
    );
  }
  return addresses;
}

function generatedTestnetAddress(
  exportName: string,
  contractName: string,
  addressLabel: string,
): Partial<Record<number, Address>> {
  const exports = generatedContracts as Record<string, unknown>;
  const value = exports[exportName];
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`The generated ${contractName} deployment map is invalid.`);
  }
  const testnetAddress = (value as Record<number, unknown>)[
    robinhoodTestnet.id
  ];
  return testnetAddress === undefined
    ? {}
    : {
        [robinhoodTestnet.id]: parseRequiredAddress(
          testnetAddress,
          `Generated ${addressLabel} address for chain ${robinhoodTestnet.id}`,
        ),
      };
}

function generatedRendererAddresses(): Partial<Record<number, Address>> {
  return generatedTestnetAddress(
    "onchainMetadataRendererAddress",
    "OnchainMetadataRenderer",
    "canonical renderer",
  );
}

function generatedPreviewHarnessAddresses(): Partial<Record<number, Address>> {
  return generatedTestnetAddress(
    "rendererPreviewHarnessAddress",
    "RendererPreviewHarness",
    "preview harness",
  );
}

function generatedRendererRegistryAddresses(): Partial<
  Record<number, Address>
> {
  return generatedTestnetAddress(
    "rendererRegistryAddress",
    "RendererRegistry",
    "renderer registry",
  );
}

export function buildPublicConfig(
  environment: PublicEnvironment,
  factoryAddresses: Partial<
    Record<number, string>
  > = generatedFactoryAddresses(),
  rendererAddresses: Partial<
    Record<number, string>
  > = generatedRendererAddresses(),
  previewHarnessAddresses: Partial<
    Record<number, string>
  > = generatedPreviewHarnessAddresses(),
  rendererRegistryAddresses: Partial<
    Record<number, string>
  > = generatedRendererRegistryAddresses(),
): PublicConfig {
  const siteUrl = parsePublicUrl(environment.siteUrl, "http://localhost:3000");
  const deployments: Partial<Record<SupportedChainId, ReadyDeployment>> = {};

  const publicFactoryAddress = factoryAddresses[robinhoodTestnet.id];
  const publicRendererAddress = rendererAddresses[robinhoodTestnet.id];
  const publicPreviewHarnessAddress =
    previewHarnessAddresses[robinhoodTestnet.id];
  const publicRendererRegistryAddress =
    rendererRegistryAddresses[robinhoodTestnet.id];
  if (
    publicFactoryAddress &&
    publicRendererAddress &&
    publicPreviewHarnessAddress
  ) {
    deployments[robinhoodTestnet.id] = {
      status: "ready",
      chainId: robinhoodTestnet.id,
      factoryAddress: parseRequiredAddress(
        publicFactoryAddress,
        `MembershipFactory address for chain ${robinhoodTestnet.id}`,
      ),
      rendererAddress: parseRequiredAddress(
        publicRendererAddress,
        `Canonical renderer address for chain ${robinhoodTestnet.id}`,
      ),
      previewHarnessAddress: parseRequiredAddress(
        publicPreviewHarnessAddress,
        `Preview harness address for chain ${robinhoodTestnet.id}`,
      ),
      ...(publicRendererRegistryAddress
        ? {
            rendererRegistryAddress: parseRequiredAddress(
              publicRendererRegistryAddress,
              `Renderer registry address for chain ${robinhoodTestnet.id}`,
            ),
          }
        : {}),
    };
  }

  const localDeploymentValues = [
    environment.anvilRpcUrl?.trim(),
    environment.anvilFactoryAddress?.trim(),
  ];
  const hasAnyLocalDeploymentValue = localDeploymentValues.some(Boolean);
  const hasEveryLocalDeploymentValue = localDeploymentValues.every(Boolean);
  if (hasAnyLocalDeploymentValue && !hasEveryLocalDeploymentValue) {
    throw new Error(
      "Anvil configuration requires its RPC URL and factory address together.",
    );
  }
  const localRendererValues = [
    environment.anvilRendererAddress?.trim(),
    environment.anvilPreviewHarnessAddress?.trim(),
  ];
  const hasAnyLocalRendererValue = localRendererValues.some(Boolean);
  const hasEveryLocalRendererValue = localRendererValues.every(Boolean);
  if (
    hasAnyLocalRendererValue &&
    (!hasEveryLocalRendererValue || !hasEveryLocalDeploymentValue)
  ) {
    throw new Error(
      "Anvil renderer evidence requires its renderer and preview harness addresses plus the complete Anvil deployment configuration.",
    );
  }
  if (
    environment.anvilRendererRegistryAddress?.trim() &&
    (!hasEveryLocalRendererValue || !hasEveryLocalDeploymentValue)
  ) {
    throw new Error(
      "Anvil renderer registry requires the complete Anvil deployment configuration.",
    );
  }

  let anvilRpcUrl: string | undefined;
  if (hasEveryLocalDeploymentValue) {
    anvilRpcUrl = parsePublicUrl(environment.anvilRpcUrl, "");
    if (!anvilRpcUrl) throw new Error("The Anvil RPC URL is invalid.");
  }

  if (hasEveryLocalDeploymentValue && hasEveryLocalRendererValue) {
    deployments[localAnvil.id] = {
      status: "ready",
      chainId: localAnvil.id,
      factoryAddress: parseRequiredAddress(
        environment.anvilFactoryAddress,
        "Anvil MembershipFactory address",
      ),
      rendererAddress: parseRequiredAddress(
        environment.anvilRendererAddress,
        "Anvil canonical renderer address",
      ),
      previewHarnessAddress: parseRequiredAddress(
        environment.anvilPreviewHarnessAddress,
        "Anvil preview harness address",
      ),
      ...(environment.anvilRendererRegistryAddress?.trim()
        ? {
            rendererRegistryAddress: parseRequiredAddress(
              environment.anvilRendererRegistryAddress,
              "Anvil renderer registry address",
            ),
          }
        : {}),
    };
  }

  const walletConnectProjectId =
    environment.walletConnectProjectId?.trim() || undefined;

  return {
    anvilRpcUrl,
    walletConnectProjectId,
    siteUrl,
    defaultChainId: robinhoodTestnet.id,
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
  anvilRendererAddress: process.env.NEXT_PUBLIC_ANVIL_RENDERER_ADDRESS,
  anvilPreviewHarnessAddress:
    process.env.NEXT_PUBLIC_ANVIL_PREVIEW_HARNESS_ADDRESS,
  anvilRendererRegistryAddress:
    process.env.NEXT_PUBLIC_ANVIL_RENDERER_REGISTRY_ADDRESS,
});
