"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { useAccount } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { MembershipExperience } from "@/features/membership/MembershipExperience";
import { readTierSupporterState } from "@/features/membership/membership-read";
import { publicConfig } from "@/lib/config";
import { createDirectReadClient } from "@/lib/direct-read";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";

export function TierReadPanel({ tierAddress }: { tierAddress: Address }) {
  const deployment = publicConfig.deployment;
  const account = useAccount();
  const client = useMemo(() => createDirectReadClient(), []);
  const tier = useQuery({
    queryKey: ["tier-supporter", tierAddress, account.address],
    enabled: deployment.status === "ready",
    queryFn: () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
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
          onRefresh={async () => (await tier.refetch()).data}
          snapshot={snapshot}
        />
      )}
    </ReadStateView>
  );
}
