import {
  getAddress,
  isAddress,
  keccak256,
  size,
  sliceHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  membershipTierAbi,
  onchainMediaStoreFactoryAbi,
  membershipFactoryAbi,
} from "@/contracts";
import type {
  ProtocolDependencySnapshot,
  RendererRegistryEntry,
  TierArtConfig,
  TierMediaConfig,
} from "@/contracts/types";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import { isSameAddress } from "@/lib/address";
import type { DeploymentAvailability, ReadyDeployment } from "@/lib/config";
import { membershipInterfaces } from "@/lib/membership-interfaces";
import { classifyReadError } from "@/lib/read-state";

export type AuthenticityResult =
  | {
      status: "verified";
      capturedBlock: bigint;
      tier: Address;
      tierIdentity: Hex;
      rendererVersion: number;
      renderer: Address;
      rendererRuntimeCodehash: Hex;
      art: TierArtConfig;
      media: TierMediaConfig;
      protocolDependencies: ProtocolDependencySnapshot;
    }
  | {
      status: "interface-mismatch";
      capturedBlock?: bigint;
      address: string;
      failedChecks: string[];
      label: string;
    }
  | { status: "rate-limited"; label: string }
  | { status: "unavailable"; label: string };

export type WriteGuard =
  | {
      enabled: true;
      factory: Address;
      tier: Address;
      paymentToken: Address;
      capturedBlock: bigint;
    }
  | { enabled: false; reason: string };

export function tierBindingFailures(input: {
  registered: unknown;
  tierFactory: unknown;
  tierToken: unknown;
  supportedInterfaces: unknown[];
  factory: Address;
  paymentToken: Address;
  tierRenderer?: unknown;
  tierRendererVersion?: unknown;
  tierRendererRuntimeCodehash?: unknown;
  renderers?: readonly RendererRegistryEntry[];
  tierIdentity?: unknown;
  identityTier?: unknown;
  tier?: Address;
}) {
  const failedChecks: string[] = [];
  if (input.registered !== true) failedChecks.push("factory registration");
  if (
    !isAddress(input.tierFactory as string) ||
    !isSameAddress(input.tierFactory as Address, input.factory)
  ) {
    failedChecks.push("tier factory binding");
  }
  if (
    !isAddress(input.tierToken as string) ||
    !isSameAddress(input.tierToken as Address, input.paymentToken)
  ) {
    failedChecks.push("tier USDG binding");
  }
  if (input.renderers !== undefined) {
    if (
      typeof input.tierRendererVersion !== "number" ||
      !Number.isInteger(input.tierRendererVersion) ||
      input.tierRendererVersion < 1
    ) {
      failedChecks.push("tier renderer version");
    } else {
      const record = input.renderers.find(
        ({ version }) => version === input.tierRendererVersion,
      );
      if (!record) {
        failedChecks.push("tier renderer registry pin");
      } else {
        if (
          !isAddress(input.tierRenderer as string) ||
          !isSameAddress(input.tierRenderer as Address, record.implementation)
        ) {
          failedChecks.push("tier renderer binding");
        }
        if (
          !isBytes32(input.tierRendererRuntimeCodehash) ||
          input.tierRendererRuntimeCodehash.toLowerCase() !==
            record.runtimeCodehash.toLowerCase()
        ) {
          failedChecks.push("tier renderer runtime identity");
        }
      }
    }
  }
  if (
    input.tier !== undefined &&
    (!isAddress(input.identityTier as string) ||
      !isSameAddress(input.identityTier as Address, input.tier))
  ) {
    failedChecks.push("tier identity registration");
  }
  if (
    input.tierIdentity !== undefined &&
    (typeof input.tierIdentity !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(input.tierIdentity) ||
      /^0x0{64}$/.test(input.tierIdentity))
  ) {
    failedChecks.push("tier identity");
  }
  membershipInterfaces.forEach(({ name }, index) => {
    if (input.supportedInterfaces[index] !== true) {
      failedChecks.push(`${name} interface`);
    }
  });
  return failedChecks;
}

function isTierArtConfig(value: unknown): value is TierArtConfig {
  if (!value || typeof value !== "object") return false;
  const art = value as Record<string, unknown>;
  const numericFields = [
    "engine",
    "palette",
    "intensity",
    "density",
    "symmetry",
    "typographyScale",
    "typographyStyle",
    "textVisibility",
    "imageFit",
    "focalX",
    "focalY",
    "grain",
    "mediaMix",
    "primary",
    "secondary",
    "tertiary",
  ];
  return (
    typeof art.collectionSeed === "bigint" &&
    numericFields.every((field) => typeof art[field] === "number")
  );
}

function isBytes32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isZeroBytes32(value: unknown): value is Hex {
  return isBytes32(value) && /^0x0{64}$/.test(value);
}

function isTierMediaConfig(value: unknown): value is TierMediaConfig {
  if (!value || typeof value !== "object") return false;
  const media = value as Record<string, unknown>;
  if (
    typeof media.mime !== "number" ||
    !isAddress(media.store as string) ||
    typeof media.length !== "number" ||
    !isBytes32(media.digest) ||
    !isBytes32(media.runtimeCodehash)
  ) {
    return false;
  }
  const generatedOnly =
    media.mime === 0 &&
    isSameAddress(media.store as Address, zeroAddress) &&
    media.length === 0 &&
    isZeroBytes32(media.digest) &&
    isZeroBytes32(media.runtimeCodehash);
  if (generatedOnly) return true;
  return (
    (media.mime === 1 || media.mime === 2) &&
    !isSameAddress(media.store as Address, zeroAddress) &&
    Number.isInteger(media.length) &&
    media.length > 0 &&
    !isZeroBytes32(media.digest) &&
    !isZeroBytes32(media.runtimeCodehash)
  );
}

async function onchainMediaFailures(
  client: PublicClient,
  protocol: ProtocolDependencySnapshot,
  media: TierMediaConfig,
  blockNumber: bigint,
) {
  if (isSameAddress(media.store, zeroAddress)) return [];
  const [registered, record, code] = await Promise.all([
    client.readContract({
      address: protocol.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "isRegisteredMedia",
      args: [media.store],
      blockNumber,
    }),
    client.readContract({
      address: protocol.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "mediaRecord",
      args: [media.store],
      blockNumber,
    }),
    client.getBytecode({ address: media.store, blockNumber }),
  ]);
  const failedChecks: string[] = [];
  if (!registered) failedChecks.push("onchain media registration");
  if (
    record.creator === zeroAddress ||
    !isSameAddress(record.store, media.store) ||
    record.mime !== media.mime ||
    record.length !== media.length ||
    record.digest !== media.digest ||
    record.runtimeCodehash !== media.runtimeCodehash
  ) {
    failedChecks.push("onchain media registry record");
  }
  if (
    !code ||
    !code.startsWith("0x00") ||
    size(code) !== media.length + 1 ||
    keccak256(code) !== media.runtimeCodehash ||
    keccak256(sliceHex(code, 1)) !== media.digest
  ) {
    failedChecks.push("onchain media runtime identity");
  }
  return failedChecks;
}

export async function verifyTierAuthenticity(
  client: PublicClient,
  input: {
    tier: string;
    deployment: ReadyDeployment;
    blockNumber?: bigint;
  },
): Promise<AuthenticityResult> {
  if (!isAddress(input.tier)) {
    return {
      status: "interface-mismatch",
      address: input.tier,
      failedChecks: ["valid contract addresses"],
      label:
        "The route or deployment configuration contains an invalid address.",
    };
  }

  const tier = getAddress(input.tier);

  try {
    const protocol = await readProtocolDependencies(
      client,
      input.deployment,
      input.blockNumber,
    );
    if (protocol.status === "rate-limited") return protocol;
    if (protocol.status === "unavailable") {
      return { status: "unavailable", label: protocol.label };
    }
    if (protocol.status !== "valid") {
      return {
        status: "interface-mismatch",
        address: tier,
        failedChecks:
          protocol.status === "interface-mismatch"
            ? protocol.failedChecks
            : ["RPC chain ID"],
        label: protocol.label,
      };
    }

    const capturedBlock = protocol.capturedBlock;
    const tierCode = await client.getBytecode({
      address: tier,
      blockNumber: capturedBlock,
    });
    if (!tierCode || tierCode === "0x") {
      return {
        status: "interface-mismatch",
        capturedBlock,
        address: tier,
        failedChecks: ["tier code"],
        label:
          "The configured contracts are not present at the captured block.",
      };
    }

    const readLabels = [
      "factory registration",
      "tier factory binding",
      "tier USDG binding",
      "tier renderer binding",
      "tier renderer version",
      "tier renderer runtime identity",
      "tier identity",
      "tier art config",
      "tier media config",
      ...membershipInterfaces.map(({ name }) => `${name} interface`),
    ];
    const reads = await Promise.allSettled([
      client.readContract({
        address: protocol.data.factory,
        abi: membershipFactoryAbi,
        functionName: "isRegisteredTier",
        args: [tier],
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "factory",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "paymentToken",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "renderer",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "rendererVersion",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "rendererRuntimeCodehash",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tierIdentity",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "artConfig",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "mediaConfig",
        blockNumber: capturedBlock,
      }),
      ...membershipInterfaces.map(({ id }) =>
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "supportsInterface",
          args: [id],
          blockNumber: capturedBlock,
        }),
      ),
    ]);

    const failedChecks: string[] = [];
    reads.forEach((result, index) => {
      if (result.status === "rejected") failedChecks.push(readLabels[index]);
    });
    if (failedChecks.length > 0) {
      const rateLimited = reads.find(
        (result) =>
          result.status === "rejected" &&
          classifyReadError(result.reason).status === "rate-limited",
      );
      if (rateLimited?.status === "rejected") {
        return classifyReadError(rateLimited.reason);
      }
      return {
        status: "interface-mismatch",
        capturedBlock,
        address: tier,
        failedChecks,
        label:
          "This address does not expose the configured official membership surface.",
      };
    }

    const values = reads.map((result) =>
      result.status === "fulfilled" ? result.value : undefined,
    );
    const registered = values[0];
    const tierFactory = values[1];
    const tierToken = values[2];
    const tierRenderer = values[3];
    const tierRendererVersion = values[4];
    const tierRendererRuntimeCodehash = values[5];
    const tierIdentity = values[6];
    const art = values[7];
    const media = values[8];
    const supportedInterfaces = values.slice(9);

    let identityTier: unknown;
    if (isBytes32(tierIdentity)) {
      identityTier = await client.readContract({
        address: protocol.data.factory,
        abi: membershipFactoryAbi,
        functionName: "tierForIdentity",
        args: [tierIdentity],
        blockNumber: capturedBlock,
      });
    }

    failedChecks.push(
      ...tierBindingFailures({
        registered,
        tierFactory,
        tierToken,
        tierRenderer,
        tierRendererVersion,
        tierRendererRuntimeCodehash,
        tierIdentity,
        identityTier,
        supportedInterfaces,
        factory: protocol.data.factory,
        paymentToken: protocol.data.paymentToken,
        renderers: protocol.data.renderers,
        tier,
      }),
    );
    if (!isTierArtConfig(art)) failedChecks.push("tier art config");
    if (!isTierMediaConfig(media)) failedChecks.push("tier media config");
    if (isTierMediaConfig(media)) {
      failedChecks.push(
        ...(await onchainMediaFailures(
          client,
          protocol.data,
          media,
          capturedBlock,
        )),
      );
    }

    if (
      failedChecks.length > 0 ||
      !isBytes32(tierIdentity) ||
      !isTierArtConfig(art) ||
      !isTierMediaConfig(media)
    ) {
      return {
        status: "interface-mismatch",
        capturedBlock,
        address: tier,
        failedChecks,
        label:
          "This address does not match the configured official membership surface.",
      };
    }

    return {
      status: "verified",
      capturedBlock,
      tier,
      tierIdentity,
      rendererVersion: tierRendererVersion as number,
      renderer: getAddress(tierRenderer as Address),
      rendererRuntimeCodehash: tierRendererRuntimeCodehash as Hex,
      art,
      media,
      protocolDependencies: protocol.data,
    };
  } catch (error) {
    return classifyReadError(error);
  }
}

export function getWriteGuard(input: {
  deployment: DeploymentAvailability;
  walletChainId?: number;
  expectedChainId: number;
  authenticity: AuthenticityResult;
}): WriteGuard {
  if (input.deployment.status !== "ready") {
    return { enabled: false, reason: input.deployment.detail };
  }
  if (input.walletChainId !== input.expectedChainId) {
    return {
      enabled: false,
      reason: "Switch the wallet to the configured Robinhood Chain network.",
    };
  }
  if (input.authenticity.status !== "verified") {
    return {
      enabled: false,
      reason:
        "Contract registration and expected interfaces must be verified first.",
    };
  }
  if (
    !isSameAddress(
      input.authenticity.protocolDependencies.factory,
      input.deployment.factoryAddress,
    ) ||
    !isSameAddress(
      input.authenticity.protocolDependencies.paymentToken,
      input.deployment.usdgAddress,
    )
  ) {
    return {
      enabled: false,
      reason: "The verified contracts do not match the configured deployment.",
    };
  }

  return {
    enabled: true,
    factory: input.authenticity.protocolDependencies.factory,
    tier: input.authenticity.tier,
    paymentToken: input.authenticity.protocolDependencies.paymentToken,
    capturedBlock: input.authenticity.capturedBlock,
  };
}
