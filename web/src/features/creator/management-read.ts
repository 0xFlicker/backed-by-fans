import type { Address, PublicClient } from "viem";

import { membershipTierAbi } from "@/contracts";
import type { TierManagementSnapshot } from "@/contracts/types";
import type { ReadyDeployment } from "@/lib/config";
import { readTierSnapshotState } from "@/lib/direct-read";
import { classifyReadError, type ReadState } from "@/lib/read-state";

export async function readTierManagementState(
  client: PublicClient,
  input: { tier: Address; deployment: ReadyDeployment },
): Promise<ReadState<TierManagementSnapshot>> {
  const tier = await readTierSnapshotState(client, input);
  if (tier.status !== "valid" && tier.status !== "stale") return tier;

  try {
    const [pendingOwner, creatorProceeds, totalMinted] = await Promise.all([
      client.readContract({
        address: input.tier,
        abi: membershipTierAbi,
        functionName: "pendingOwner",
        blockNumber: tier.capturedBlock,
      }),
      client.readContract({
        address: input.tier,
        abi: membershipTierAbi,
        functionName: "creatorProceeds",
        blockNumber: tier.capturedBlock,
      }),
      client.readContract({
        address: input.tier,
        abi: membershipTierAbi,
        functionName: "totalMinted",
        blockNumber: tier.capturedBlock,
      }),
    ]);
    return {
      ...tier,
      data: { ...tier.data, pendingOwner, creatorProceeds, totalMinted },
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
