import { getAddress, isAddress, type Address, type PublicClient } from "viem";

import { membershipFactoryAbi, membershipTierAbi } from "@/contracts";
import { isSameAddress } from "@/lib/address";
import type { DeploymentAvailability, ReadyDeployment } from "@/lib/config";
import { membershipInterfaces } from "@/lib/membership-interfaces";
import { classifyReadError } from "@/lib/read-state";

export type AuthenticityResult =
  | {
      status: "verified";
      capturedBlock: bigint;
      factory: Address;
      tier: Address;
      paymentToken: Address;
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
  membershipInterfaces.forEach(({ name }, index) => {
    if (input.supportedInterfaces[index] !== true) {
      failedChecks.push(`${name} interface`);
    }
  });
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

  const factory = input.deployment.factoryAddress;
  const tier = getAddress(input.tier);
  const paymentToken = input.deployment.usdgAddress;

  try {
    const [capturedBlock, rpcChainId] = await Promise.all([
      input.blockNumber === undefined
        ? client.getBlockNumber({ cacheTime: 0 })
        : Promise.resolve(input.blockNumber),
      client.getChainId(),
    ]);
    if (rpcChainId !== input.deployment.chainId) {
      return {
        status: "interface-mismatch",
        address: tier,
        failedChecks: ["RPC chain ID"],
        label: "The RPC does not match the requested membership network.",
      };
    }
    const tierCode = await client.getBytecode({
      address: tier,
      blockNumber: capturedBlock,
    });
    const failedChecks: string[] = [];

    if (!tierCode || tierCode === "0x") failedChecks.push("tier code");
    if (failedChecks.length > 0) {
      return {
        status: "interface-mismatch",
        capturedBlock,
        address: tier,
        failedChecks,
        label:
          "The configured contracts are not present at the captured block.",
      };
    }

    const readLabels = [
      "factory registration",
      "tier factory binding",
      "tier USDG binding",
      ...membershipInterfaces.map(({ name }) => `${name} interface`),
    ];
    const reads = await Promise.allSettled([
      client.readContract({
        address: factory,
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
    const registered = values[0] as boolean;
    const tierFactory = values[1] as Address;
    const tierToken = values[2] as Address;
    const supportedInterfaces = values.slice(3) as boolean[];

    failedChecks.push(
      ...tierBindingFailures({
        registered,
        tierFactory,
        tierToken,
        supportedInterfaces,
        factory,
        paymentToken,
      }),
    );

    if (failedChecks.length > 0) {
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
      factory,
      tier,
      paymentToken,
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
      input.authenticity.factory,
      input.deployment.factoryAddress,
    ) ||
    !isSameAddress(
      input.authenticity.paymentToken,
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
    factory: input.authenticity.factory,
    tier: input.authenticity.tier,
    paymentToken: input.authenticity.paymentToken,
    capturedBlock: input.authenticity.capturedBlock,
  };
}
