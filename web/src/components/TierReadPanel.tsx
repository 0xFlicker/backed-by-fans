"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { MembershipExperience } from "@/features/membership/MembershipExperience";
import { readTierSupporterState } from "@/features/membership/membership-read";
import { getDeployment, publicConfig } from "@/lib/config";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";

export function TierReadPanel({
  chainId,
  tierAddress,
}: {
  chainId: 4663 | 46630 | 31337;
  tierAddress: Address;
}) {
  const deployment = getDeployment(publicConfig, chainId);
  const account = useAccount();
  const client = usePublicClient({ chainId });
  const tier = useQuery({
    queryKey: ["tier-supporter", chainId, tierAddress, account.address],
    enabled: deployment.status === "ready" && Boolean(client),
    queryFn: () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      if (!client) throw new Error("No public client is available.");
      return readTierSupporterState(client, {
        tier: tierAddress,
        deployment,
        wallet: account.address,
      });
    },
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }
  if (tier.isError) {
    const classified = classifyReadError(tier.error);
    return (
      <ReadStateView
        onRetry={() => void tier.refetch()}
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
  if (tier.isLoading || !tier.data) {
    return (
      <ReadStateView
        state={{
          status: "loading",
          label:
            "Checking factory registration, USDG binding, and membership interfaces.",
        }}
      />
    );
  }

  if (tier.data.status === "valid") {
    return (
      <MembershipExperience
        capturedBlock={tier.data.capturedBlock}
        expectedChainId={chainId}
        fresh
        key={`${chainId}:${tierAddress}:${account.address ?? "disconnected"}`}
        onRefresh={async () => (await tier.refetch()).data}
        snapshot={tier.data.data}
      />
    );
  }

  return (
    <ReadStateView onRetry={() => void tier.refetch()} state={tier.data}>
      {(snapshot) => (
        <MembershipExperience
          capturedBlock={
            tier.data?.status === "valid" || tier.data?.status === "stale"
              ? tier.data.capturedBlock
              : 0n
          }
          fresh={tier.data?.status === "valid"}
          key={`${chainId}:${tierAddress}:${account.address ?? "disconnected"}`}
          onRefresh={async () => (await tier.refetch()).data}
          snapshot={snapshot}
          expectedChainId={chainId}
        />
      )}
    </ReadStateView>
  );
}
