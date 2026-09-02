"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import type { TierManagementSnapshot } from "@/contracts/types";
import { ArtworkManagementStudio } from "@/features/creator/ArtworkManagementStudio";
import { readTierManagementState } from "@/features/creator/management-read";
import { getDeployment, publicConfig } from "@/lib/config";
import {
  classifyReadError,
  type ReadState,
  unavailableDeploymentState,
} from "@/lib/read-state";

export function ArtworkManagement({
  chainId,
  tierAddress,
  initialState,
}: {
  chainId: 4663 | 46630 | 31337;
  tierAddress: Address;
  initialState?: ReadState<TierManagementSnapshot>;
}) {
  const deployment = getDeployment(publicConfig, chainId);
  const client = usePublicClient({ chainId });
  const management = useQuery({
    queryKey: ["tier-artwork-management", chainId, tierAddress],
    enabled: deployment.status === "ready" && Boolean(client),
    queryFn: () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      if (!client) throw new Error("No public client is available.");
      return readTierManagementState(client, { tier: tierAddress, deployment });
    },
    initialData: initialState,
    placeholderData: (previous) => previous ?? initialState,
    staleTime: 0,
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }
  if (management.isError && !management.data) {
    const classified = classifyReadError(management.error);
    return (
      <ReadStateView
        onRetry={() => void management.refetch()}
        state={
          classified.status === "rate-limited"
            ? classified
            : {
                status: "unavailable",
                reason: "rpc-unavailable",
                label: classified.label,
              }
        }
      />
    );
  }
  if (!management.data) {
    return (
      <ReadStateView
        state={{ status: "loading", label: "Loading the current artwork." }}
      />
    );
  }

  return (
    <ReadStateView
      onRetry={() => void management.refetch()}
      state={management.data}
    >
      {(snapshot) => (
        <ArtworkManagementStudio
          deployment={deployment}
          onRefresh={async () => {
            const refreshed = (await management.refetch()).data;
            return refreshed?.status === "valid" ? refreshed.data : undefined;
          }}
          snapshot={snapshot}
        />
      )}
    </ReadStateView>
  );
}
