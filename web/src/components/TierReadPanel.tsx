"use client";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  initialTokenId = 0n,
}: {
  chainId: 4663 | 46630 | 31337;
  tierAddress: Address;
  initialState?: ReadState<TierSupporterSnapshot>;
  initialTokenId?: bigint;
}) {
  const deployment = getDeployment(publicConfig, chainId);
  const account = useHydratedAccount();
  const client = useWalletPublicClient(chainId);
  const queries = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const [selection, setSelection] = useState<{
    wallet?: Address;
    tokenId: bigint;
  }>({ tokenId: initialTokenId });
  // Bind a URL-selected token to the first connected wallet. It must not
  // silently remain selected when a different wallet connects later.
  if (selection.wallet === undefined && account.address) {
    setSelection({ wallet: account.address, tokenId: selection.tokenId });
  }
  const [notice, setNotice] = useState("");
  const tokenId =
    selection.wallet === undefined || selection.wallet === account.address
      ? selection.tokenId
      : 0n;
  const queryKey = (id: bigint) => [
    "tier-supporter",
    chainId,
    tierAddress,
    account.address,
    id.toString(),
  ];
  const selectPosition = (id: bigint) => {
    setSelection({ wallet: account.address, tokenId: id });
    setNotice(
      id === 0n ? "New membership selected." : `Membership #${id} selected.`,
    );
    heading.current?.focus();
  };
  async function read(id: bigint) {
    if (deployment.status !== "ready") throw new Error(deployment.detail);
    if (!client) throw new Error("No public client is available.");
    return readTierSupporterState(client, {
      tier: tierAddress,
      deployment,
      wallet: account.address,
      tokenId: id,
    });
  }
  const tier = useQuery({
    queryKey: queryKey(tokenId),
    enabled:
      deployment.status === "ready" &&
      Boolean(client) &&
      account.chainId === chainId,
    queryFn: () => read(tokenId),
    initialData: tokenId === 0n ? initialState : undefined,
    placeholderData: (previous) => previous ?? initialState,
    staleTime: 0,
  });
  async function refresh(selected?: bigint) {
    if (selected !== undefined && selected !== tokenId) {
      const next = await read(selected);
      queries.setQueryData(queryKey(selected), next);
      selectPosition(selected);
      return next;
    }
    return (await tier.refetch()).data;
  }
  function content() {
    if (deployment.status !== "ready")
      return <ReadStateView state={unavailableDeploymentState(deployment)} />;
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
    if (!tier.data)
      return (
        <ReadStateView
          state={{
            status: "loading",
            label: "Checking the selected membership and its owner.",
          }}
        />
      );
    if (tier.data.status === "valid" || tier.data.status === "stale")
      return (
        <MembershipExperience
          key={`${chainId}:${tierAddress}:${account.address ?? "disconnected"}`}
          onSelectPosition={selectPosition}
          capturedBlock={tier.data.capturedBlock}
          expectedChainId={chainId}
          fresh={
            tier.isFetchedAfterMount && !tier.isError && !tier.isPlaceholderData
          }
          onRefresh={refresh}
          snapshot={tier.data.data}
        />
      );
    return (
      <ReadStateView onRetry={() => void tier.refetch()} state={tier.data} />
    );
  }
  return (
    <section>
      <h2 ref={heading} tabIndex={-1} className="sr-only">
        Membership position
      </h2>
      {notice && <p role="status">{notice}</p>}
      {tokenId !== 0n &&
        tier.data?.status !== "valid" &&
        tier.data?.status !== "stale" && (
          <button
            className="button button-outline"
            type="button"
            onClick={() => selectPosition(0n)}
          >
            New membership
          </button>
        )}
      {content()}
    </section>
  );
}
