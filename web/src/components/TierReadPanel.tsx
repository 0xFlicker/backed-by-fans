"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";

import { ReadStateView } from "@/components/ReadState";
import type { TierSupporterSnapshot } from "@/contracts/types";
import { MembershipExperience } from "@/features/membership/MembershipExperience";
import { readTierSupporterState } from "@/features/membership/membership-read";
import { getDeployment, publicConfig } from "@/lib/config";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import {
  classifyReadError,
  type ReadState,
  unavailableDeploymentState,
} from "@/lib/read-state";
import { useWalletPublicClient } from "@/lib/use-wallet-public-client";

export function TierReadPanel({
  chainId,
  tierAddress,
  initialState,
}: {
  chainId: 4663 | 46630 | 31337;
  tierAddress: Address;
  initialState?: ReadState<TierSupporterSnapshot>;
}) {
  const deployment = getDeployment(publicConfig, chainId);
  const account = useHydratedAccount();
  const client = useWalletPublicClient(chainId);
  const tier = useQuery({
    queryKey: ["tier-supporter", chainId, tierAddress, account.address],
    enabled:
      deployment.status === "ready" &&
      Boolean(client) &&
      account.chainId === chainId,
    queryFn: () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      if (!client) throw new Error("No public client is available.");
      return readTierSupporterState(client, {
        tier: tierAddress,
        deployment,
        wallet: account.address,
      });
    },
    initialData: initialState,
    placeholderData: (previous) => previous ?? initialState,
    staleTime: 0,
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }
  if (tier.isError && !tier.data) {
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
  if (!tier.data) {
    return (
      <ReadStateView
        state={{
          status: "loading",
          label:
            "Checking factory registration, payment terms, and membership interfaces.",
        }}
      />
    );
  }

  if (tier.data.status === "valid" || tier.data.status === "stale") {
    return (
      <MembershipExperience
        capturedBlock={tier.data.capturedBlock}
        expectedChainId={chainId}
        fresh={
          tier.isFetchedAfterMount && !tier.isError && !tier.isPlaceholderData
        }
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
          fresh={
            tier.isFetchedAfterMount &&
            !tier.isError &&
            !tier.isPlaceholderData &&
            tier.data?.status === "valid"
          }
          key={`${chainId}:${tierAddress}:${account.address ?? "disconnected"}`}
          onRefresh={async () => (await tier.refetch()).data}
          snapshot={snapshot}
          expectedChainId={chainId}
        />
      )}
    </ReadStateView>
  );
}
