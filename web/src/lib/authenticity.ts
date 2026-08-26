import { getAddress, isAddress, type Address, type PublicClient } from "viem";

import {
  factoryAbi,
  membershipInterfaceIds,
  tierAbi,
  tokenAbi,
} from "@/contracts/abis";
import { isSameAddress } from "@/lib/address";
import type { DeploymentAvailability } from "@/lib/config";
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

export async function verifyTierAuthenticity(
  client: PublicClient,
  input: {
    factory: string;
    tier: string;
    expectedPaymentToken: string;
    blockNumber?: bigint;
  },
): Promise<AuthenticityResult> {
  if (
    !isAddress(input.factory) ||
    !isAddress(input.tier) ||
    !isAddress(input.expectedPaymentToken)
  ) {
    return {
      status: "interface-mismatch",
      address: input.tier,
      failedChecks: ["valid contract addresses"],
      label:
        "The route or deployment configuration contains an invalid address.",
    };
  }

  const factory = getAddress(input.factory);
  const tier = getAddress(input.tier);
  const paymentToken = getAddress(input.expectedPaymentToken);

  try {
    const capturedBlock = input.blockNumber ?? (await client.getBlockNumber());
    const [factoryCode, tierCode, tokenCode] = await Promise.all([
      client.getBytecode({ address: factory, blockNumber: capturedBlock }),
      client.getBytecode({ address: tier, blockNumber: capturedBlock }),
      client.getBytecode({ address: paymentToken, blockNumber: capturedBlock }),
    ]);
    const failedChecks: string[] = [];

    if (!factoryCode || factoryCode === "0x") failedChecks.push("factory code");
    if (!tierCode || tierCode === "0x") failedChecks.push("tier code");
    if (!tokenCode || tokenCode === "0x") failedChecks.push("USDG code");

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

    const interfaceNames = Object.keys(membershipInterfaceIds);
    const readLabels = [
      "factory registration",
      "factory USDG binding",
      "factory renderer binding",
      "factory registry surface",
      "tier factory binding",
      "tier USDG binding",
      "USDG name",
      "USDG symbol",
      "USDG decimals",
      ...interfaceNames.map((name) => `${name} interface`),
    ];
    const reads = await Promise.allSettled([
      client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "isRegisteredTier",
        args: [tier],
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "paymentToken",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "renderer",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "tierCount",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "factory",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "paymentToken",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: paymentToken,
        abi: tokenAbi,
        functionName: "name",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: paymentToken,
        abi: tokenAbi,
        functionName: "symbol",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: paymentToken,
        abi: tokenAbi,
        functionName: "decimals",
        blockNumber: capturedBlock,
      }),
      ...Object.values(membershipInterfaceIds).map((interfaceId) =>
        client.readContract({
          address: tier,
          abi: tierAbi,
          functionName: "supportsInterface",
          args: [interfaceId],
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
    const factoryToken = values[1] as Address;
    const renderer = values[2] as Address;
    const tierCount = values[3] as bigint;
    const tierFactory = values[4] as Address;
    const tierToken = values[5] as Address;
    const tokenName = values[6] as string;
    const tokenSymbol = values[7] as string;
    const tokenDecimals = values[8] as number;
    const supportedInterfaces = values.slice(9) as boolean[];

    if (!registered) failedChecks.push("factory registration");
    if (!isSameAddress(factoryToken, paymentToken)) {
      failedChecks.push("factory USDG binding");
    }
    if (renderer === "0x0000000000000000000000000000000000000000") {
      failedChecks.push("factory renderer binding");
    }
    if (tierCount < 1n) failedChecks.push("factory registry surface");
    if (!isSameAddress(tierFactory, factory))
      failedChecks.push("tier factory binding");
    if (!isSameAddress(tierToken, paymentToken))
      failedChecks.push("tier USDG binding");
    if (!tokenName.trim() || tokenSymbol !== "USDG" || tokenDecimals !== 6) {
      failedChecks.push("USDG metadata interface");
    }

    interfaceNames.forEach((name, index) => {
      if (!supportedInterfaces[index]) failedChecks.push(`${name} interface`);
    });

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
