import type { Address, PublicClient } from "viem";

import { factoryAbi, tokenAbi } from "@/contracts/abis";
import {
  verifyFactoryAuthenticity,
  type FactoryAuthenticity,
} from "@/features/protocol/factory-authenticity";
import type { DeploymentAvailability } from "@/lib/config";
import { classifyReadError, type ReadState } from "@/lib/read-state";

export type ProtocolSnapshot = {
  factory: Address;
  paymentToken: Address;
  owner: Address;
  pendingOwner: Address;
  feeRecipient: Address;
  protocolFeeBps: number;
  protocolBalance: bigint;
  tierCount: bigint;
  authenticity: Extract<FactoryAuthenticity, { status: "verified" }>;
};

export async function readProtocolState(
  client: PublicClient,
  deployment: DeploymentAvailability,
): Promise<ReadState<ProtocolSnapshot>> {
  const authenticity = await verifyFactoryAuthenticity(client, deployment);
  if (authenticity.status === "rate-limited") return authenticity;
  if (authenticity.status === "unavailable") {
    return {
      status: "unavailable",
      reason: "rpc-unavailable",
      label: authenticity.label,
    };
  }
  if (authenticity.status === "interface-mismatch") {
    return {
      status: "interface-mismatch",
      address:
        deployment.status === "ready"
          ? deployment.factoryAddress
          : "unavailable",
      failedChecks: authenticity.failedChecks,
      label: authenticity.label,
    };
  }

  try {
    const blockNumber = authenticity.capturedBlock;
    const [owner, pendingOwner, feeRecipient, tierCount, balance] =
      await Promise.all([
        client.readContract({
          address: authenticity.factory,
          abi: factoryAbi,
          functionName: "owner",
          blockNumber,
        }),
        client.readContract({
          address: authenticity.factory,
          abi: factoryAbi,
          functionName: "pendingOwner",
          blockNumber,
        }),
        client.readContract({
          address: authenticity.factory,
          abi: factoryAbi,
          functionName: "feeRecipient",
          blockNumber,
        }),
        client.readContract({
          address: authenticity.factory,
          abi: factoryAbi,
          functionName: "tierCount",
          blockNumber,
        }),
        client.readContract({
          address: authenticity.paymentToken,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [authenticity.factory],
          blockNumber,
        }),
      ]);
    return {
      status: "valid",
      capturedBlock: blockNumber,
      data: {
        factory: authenticity.factory,
        paymentToken: authenticity.paymentToken,
        owner,
        pendingOwner,
        feeRecipient,
        protocolFeeBps: authenticity.protocolFeeBps,
        protocolBalance: balance,
        tierCount,
        authenticity,
      },
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}
