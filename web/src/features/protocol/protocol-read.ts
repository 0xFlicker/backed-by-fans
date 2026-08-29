import type { Address, PublicClient } from "viem";

import { robinhoodMembershipFactoryAbi, usdgAbi } from "@/contracts";
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
};

export async function readProtocolState(
  client: PublicClient,
  deployment: DeploymentAvailability,
): Promise<ReadState<ProtocolSnapshot>> {
  if (deployment.status !== "ready") {
    return {
      status: "unavailable",
      reason: "not-deployed",
      label: deployment.detail,
    };
  }

  try {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const [
      rpcChainId,
      boundToken,
      owner,
      pendingOwner,
      feeRecipient,
      feeBps,
      tierCount,
      balance,
    ] = await Promise.all([
      client.getChainId(),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "paymentToken",
        blockNumber,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "owner",
        blockNumber,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "pendingOwner",
        blockNumber,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "feeRecipient",
        blockNumber,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "protocolFeeBps",
        blockNumber,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "tierCount",
        blockNumber,
      }),
      client.readContract({
        address: deployment.usdgAddress,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [deployment.factoryAddress],
        blockNumber,
      }),
    ]);
    if (rpcChainId !== deployment.chainId) {
      return {
        status: "wrong-chain",
        expectedChainId: deployment.chainId,
        actualChainId: rpcChainId,
        label: "The RPC does not match the selected membership network.",
      };
    }
    if (boundToken.toLowerCase() !== deployment.usdgAddress.toLowerCase()) {
      return {
        status: "interface-mismatch",
        address: deployment.factoryAddress,
        failedChecks: ["factory USDG binding"],
        label: "The factory is not bound to canonical USDG for this network.",
      };
    }
    return {
      status: "valid",
      capturedBlock: blockNumber,
      data: {
        factory: deployment.factoryAddress,
        paymentToken: deployment.usdgAddress,
        owner,
        pendingOwner,
        feeRecipient,
        protocolFeeBps: feeBps,
        protocolBalance: balance,
        tierCount,
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
