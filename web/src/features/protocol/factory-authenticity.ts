import { getAddress, type Address, type PublicClient } from "viem";

import { factoryAbi } from "@/contracts/abis";
import type { DeploymentAvailability } from "@/lib/config";
import { classifyReadError } from "@/lib/read-state";

export type FactoryAuthenticity =
  | {
      status: "verified";
      capturedBlock: bigint;
      factory: Address;
      paymentToken: Address;
      protocolFeeBps: number;
    }
  | { status: "interface-mismatch"; failedChecks: string[]; label: string }
  | { status: "rate-limited"; label: string }
  | { status: "unavailable"; label: string };

export async function verifyFactoryAuthenticity(
  client: PublicClient,
  deployment: DeploymentAvailability,
): Promise<FactoryAuthenticity> {
  if (deployment.status !== "ready") {
    return { status: "unavailable", label: deployment.detail };
  }

  const factory = deployment.factoryAddress;
  const paymentToken = deployment.usdgAddress;
  try {
    const capturedBlock = await client.getBlockNumber();
    const [factoryCode, tokenCode, values] = await Promise.all([
      client.getBytecode({ address: factory, blockNumber: capturedBlock }),
      client.getBytecode({ address: paymentToken, blockNumber: capturedBlock }),
      Promise.all([
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
          functionName: "deployer",
          blockNumber: capturedBlock,
        }),
        client.readContract({
          address: factory,
          abi: factoryAbi,
          functionName: "protocolFeeBps",
          blockNumber: capturedBlock,
        }),
        client.readContract({
          address: factory,
          abi: factoryAbi,
          functionName: "maxPageSize",
          blockNumber: capturedBlock,
        }),
      ]),
    ]);
    const [boundToken, renderer, deployer, feeBps, maxPageSize] = values;
    const failedChecks: string[] = [];

    if (!factoryCode || factoryCode === "0x") failedChecks.push("factory code");
    if (!tokenCode || tokenCode === "0x") failedChecks.push("USDG code");
    if (getAddress(boundToken) !== paymentToken) {
      failedChecks.push("factory USDG binding");
    }
    if (feeBps !== 100 || maxPageSize !== 100n) {
      failedChecks.push("factory constants");
    }

    const [rendererCode, deployerCode] = await Promise.all([
      client.getBytecode({
        address: getAddress(renderer),
        blockNumber: capturedBlock,
      }),
      client.getBytecode({
        address: getAddress(deployer),
        blockNumber: capturedBlock,
      }),
    ]);
    if (!rendererCode || rendererCode === "0x") {
      failedChecks.push("renderer code");
    }
    if (!deployerCode || deployerCode === "0x") {
      failedChecks.push("deployer code");
    }

    return failedChecks.length > 0
      ? {
          status: "interface-mismatch",
          failedChecks,
          label:
            "The configured factory does not match the official deployment surface.",
        }
      : {
          status: "verified",
          capturedBlock,
          factory,
          paymentToken,
          protocolFeeBps: feeBps,
        };
  } catch (error) {
    return classifyReadError(error);
  }
}

export function factoryWriteGuard(input: {
  deployment: DeploymentAvailability;
  walletChainId?: number;
  expectedChainId: number;
  authenticity?: FactoryAuthenticity;
}) {
  if (input.deployment.status !== "ready") {
    return { enabled: false as const, reason: input.deployment.detail };
  }
  if (input.walletChainId !== input.expectedChainId) {
    return {
      enabled: false as const,
      reason: "Switch the wallet to the configured Robinhood Chain network.",
    };
  }
  if (input.authenticity?.status !== "verified") {
    return {
      enabled: false as const,
      reason:
        "The factory, deployer, renderer, and canonical USDG binding must be verified first.",
    };
  }
  return {
    enabled: true as const,
    factory: input.authenticity.factory,
    paymentToken: input.authenticity.paymentToken,
    capturedBlock: input.authenticity.capturedBlock,
  };
}
