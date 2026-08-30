import "server-only";

import type { Address } from "viem";

import type {
  TierManagementSnapshot,
  TierSupporterSnapshot,
} from "@/contracts/types";
import { readTierManagementState } from "@/features/creator/management-read";
import { readTierSupporterState } from "@/features/membership/membership-read";
import type { SupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import {
  classifyReadError,
  type ReadState,
  unavailableDeploymentState,
} from "@/lib/read-state";
import { getServerPublicClient } from "@/lib/server-rpc";

function serverReadFailure(error: unknown): ReadState<never> {
  const classified = classifyReadError(error);
  return classified.status === "rate-limited"
    ? classified
    : {
        status: "unavailable",
        reason: "rpc-unavailable",
        label:
          "Onchain state could not be loaded by the server. Connect a wallet to try its RPC provider.",
      };
}

export async function readServerTierSupporterState(
  chainId: SupportedChainId,
  tier: Address,
): Promise<ReadState<TierSupporterSnapshot>> {
  const deployment = getDeployment(publicConfig, chainId);
  if (deployment.status !== "ready") {
    return unavailableDeploymentState(deployment);
  }
  try {
    return await readTierSupporterState(getServerPublicClient(chainId), {
      deployment,
      tier,
    });
  } catch (error) {
    return serverReadFailure(error);
  }
}

export async function readServerTierManagementState(
  chainId: SupportedChainId,
  tier: Address,
): Promise<ReadState<TierManagementSnapshot>> {
  const deployment = getDeployment(publicConfig, chainId);
  if (deployment.status !== "ready") {
    return unavailableDeploymentState(deployment);
  }
  try {
    return await readTierManagementState(getServerPublicClient(chainId), {
      deployment,
      tier,
    });
  } catch (error) {
    return serverReadFailure(error);
  }
}
