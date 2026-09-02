import "server-only";

import {
  readCatalogSnapshot,
  type CatalogInitialState,
} from "@/lib/catalog-read";
import type { SupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";
import { getServerPublicClient } from "@/lib/server-rpc";

export async function readServerCatalogState(
  chainId: SupportedChainId = publicConfig.defaultChainId,
): Promise<CatalogInitialState> {
  const deployment = getDeployment(publicConfig, chainId);
  if (deployment.status !== "ready") {
    return {
      status: "failed",
      chainId,
      state: unavailableDeploymentState(deployment),
    };
  }
  try {
    return {
      status: "ready",
      chainId,
      data: await readCatalogSnapshot(
        getServerPublicClient(chainId),
        deployment,
      ),
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return {
      status: "failed",
      chainId,
      state:
        classified.status === "rate-limited"
          ? classified
          : {
              status: "unavailable",
              reason: "rpc-unavailable",
              label:
                "The membership catalog could not be loaded by the server. Try again from this browser.",
            },
    };
  }
}
