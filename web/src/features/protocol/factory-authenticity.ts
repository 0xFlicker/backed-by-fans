import {
  getAddress,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { factoryAbi } from "@/contracts/abis";
import type { DeploymentAvailability } from "@/lib/config";
import { classifyReadError } from "@/lib/read-state";

export const eip1967ImplementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

function addressFromStorageWord(word: Hex | undefined): Address | undefined {
  if (!word || word.length !== 66) return undefined;
  const address = getAddress(`0x${word.slice(-40)}`);
  return address === "0x0000000000000000000000000000000000000000"
    ? undefined
    : address;
}

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
  blockNumber?: bigint,
): Promise<FactoryAuthenticity> {
  if (deployment.status !== "ready") {
    return { status: "unavailable", label: deployment.detail };
  }

  const factory = deployment.factoryAddress;
  const paymentToken = deployment.usdgAddress;
  try {
    const [capturedBlock, rpcChainId] = await Promise.all([
      blockNumber === undefined
        ? client.getBlockNumber()
        : Promise.resolve(blockNumber),
      client.getChainId(),
    ]);
    const [factoryCode, tokenCode, tokenImplementationWord, values] =
      await Promise.all([
        client.getBytecode({ address: factory, blockNumber: capturedBlock }),
        client.getBytecode({
          address: paymentToken,
          blockNumber: capturedBlock,
        }),
        client.getStorageAt({
          address: paymentToken,
          slot: eip1967ImplementationSlot,
          blockNumber: capturedBlock,
        }),
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

    if (rpcChainId !== deployment.chainId) failedChecks.push("RPC chain ID");
    if (!matchesRuntimeHash(factoryCode, deployment.factoryRuntimeCodeHash)) {
      failedChecks.push("factory runtime code");
    }
    if (!matchesRuntimeHash(tokenCode, deployment.usdgRuntimeCodeHash)) {
      failedChecks.push("USDG runtime code");
    }
    const observedImplementation = addressFromStorageWord(
      tokenImplementationWord,
    );
    if (observedImplementation !== deployment.usdgImplementationAddress) {
      failedChecks.push("USDG implementation binding");
    }
    if (getAddress(boundToken) !== paymentToken) {
      failedChecks.push("factory USDG binding");
    }
    if (feeBps !== 100 || maxPageSize !== 100n) {
      failedChecks.push("factory constants");
    }

    const [rendererCode, deployerCode, tokenImplementationCode] =
      await Promise.all([
        client.getBytecode({
          address: getAddress(renderer),
          blockNumber: capturedBlock,
        }),
        client.getBytecode({
          address: getAddress(deployer),
          blockNumber: capturedBlock,
        }),
        client.getBytecode({
          address: deployment.usdgImplementationAddress,
          blockNumber: capturedBlock,
        }),
      ]);
    if (!matchesRuntimeHash(rendererCode, deployment.rendererRuntimeCodeHash)) {
      failedChecks.push("renderer runtime code");
    }
    if (!matchesRuntimeHash(deployerCode, deployment.deployerRuntimeCodeHash)) {
      failedChecks.push("deployer runtime code");
    }
    if (
      !matchesRuntimeHash(
        tokenImplementationCode,
        deployment.usdgImplementationRuntimeCodeHash,
      )
    ) {
      failedChecks.push("USDG implementation runtime code");
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

function matchesRuntimeHash(code: Hex | undefined, expected: Hex) {
  return Boolean(code && code !== "0x" && keccak256(code) === expected);
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
