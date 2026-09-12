"use client";
import { formatMembershipDate } from "./date";

import Link from "next/link";
import { AccountRewards } from "./AccountRewards";
import type { Route } from "next";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { ResilientArtworkImage } from "@/components/ResilientArtworkImage";
import {
  accountCacheKey,
  emptyAccountCache,
  loadAccountCache,
  mergeAccountPage,
  mergeOwnerPage,
  type AccountTierResult,
  type CachedAccountTier,
  saveAccountCache,
  type AccountCache,
} from "@/features/membership/account-cache";
import {
  discoverAccountPage,
  readAccountOwnerPage,
} from "@/features/membership/account-discovery";
import type { AccountDiscoveryPage } from "@/features/membership/account-discovery";
import {
  getDeployment,
  publicConfig,
  type ReadyDeployment,
} from "@/lib/config";
import {
  readAcceptedPaymentTokens,
  type AcceptedPaymentTokenReadState,
} from "@/lib/payment-token-read";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";
import { useActiveNetwork } from "@/lib/use-active-network";
import { formatLocalizedTokenAmount } from "@/lib/token-amount";

type ConnectedDiscoveryProps = {
  cacheKey: string;
  deployment: ReadyDeployment;
  initialPage?: AccountDiscoveryPage;
  initialPaymentTokens?: AcceptedPaymentTokenReadState;
  wallet: Address;
};

type AccountDiscoveryProps = {
  initialDiscovery?: {
    chainId: ReadyDeployment["chainId"];
    wallet: Address;
    page: AccountDiscoveryPage;
    paymentTokens: AcceptedPaymentTokenReadState;
  };
};

const subscribeToHydration = () => () => undefined;

function AccountArtwork({
  chainId,
  eager,
  name,
  tier,
}: {
  chainId: number;
  eager: boolean;
  name: string;
  tier: Address;
}) {
  const src = `/api/chains/${chainId}/tiers/${tier}/artwork`;

  return (
    <span className="account-card-artwork">
      <ResilientArtworkImage
        alt={`${name} collection artwork`}
        className="account-card-image"
        fallback={
          <span className="account-card-artwork-fallback">
            Artwork temporarily unavailable
          </span>
        }
        fetchPriority={eager ? "high" : "auto"}
        fill
        loading={eager ? "eager" : "lazy"}
        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
        src={src}
        unoptimized
      />
    </span>
  );
}

function ConnectedDiscovery(props: ConnectedDiscoveryProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  if (!hydrated && !props.initialPage) {
    return (
      <ReadStateView
        state={{
          status: "loading",
          label: "Preparing the local discovery cursor.",
        }}
      />
    );
  }

  return <HydratedDiscovery {...props} />;
}

function HydratedDiscovery({
  cacheKey,
  deployment,
  initialPage,
  initialPaymentTokens,
  wallet,
}: ConnectedDiscoveryProps) {
  const client = usePublicClient({ chainId: deployment.chainId })!;
  const [savedCache, setSavedCache] = useState<AccountCache>(() =>
    loadAccountCache(window.localStorage, cacheKey),
  );
  const [offset, setOffset] = useState(0n);
  const [blockNumber, setBlockNumber] = useState<bigint>();
  const [request, setRequest] = useState(0);
  const [ownerPages, setOwnerPages] = useState<
    { result: AccountTierResult; block: bigint }[]
  >([]);
  const discovery = useQuery({
    queryKey: ["account-discovery", cacheKey, offset.toString(), request],
    queryFn: () =>
      discoverAccountPage(client, { deployment, wallet, offset, blockNumber }),
    initialData:
      request === 0 && initialPage?.offset === offset ? initialPage : undefined,
    retry: false,
  });
  const paymentTokens = useQuery({
    queryKey: [
      "account-payment-tokens",
      deployment.chainId,
      deployment.factoryAddress,
      wallet,
    ],
    queryFn: () =>
      readAcceptedPaymentTokens(client, {
        chainId: deployment.chainId,
        factory: deployment.factoryAddress,
        wallet,
      }),
    initialData: initialPaymentTokens,
  });
  const tokenData =
    paymentTokens.data?.status === "valid" ||
    paymentTokens.data?.status === "partial"
      ? paymentTokens.data.data
      : [];
  function claimLabel(raw: bigint, paymentToken: Address) {
    const token = tokenData.find(
      (candidate) =>
        candidate.address.toLowerCase() === paymentToken.toLowerCase(),
    );
    return token
      ? `${formatLocalizedTokenAmount({ raw, decimals: token.decimals, multiplier: token.uiMultiplier })} ${token.symbol}`
      : "Payment token unavailable";
  }
  const currentCache = useMemo(() => {
    const page = discovery.data;
    const base = page
      ? mergeAccountPage(savedCache, {
          resumeOffset: page.skipped.length ? page.offset : page.scannedTo,
          complete: page.nextOffset === null && page.skipped.length === 0,
          capturedBlock: page.capturedBlock,
          scannedTiers: page.scannedTiers,
          results: page.results,
        })
      : savedCache;
    // Owner enumeration can reorder after a transfer or burn. A refreshed tier
    // starts at its new first page; discard continuations from older blocks.
    return ownerPages.reduce(
      (cache, page) =>
        cache.results.some(
          (tier) =>
            tier.tier.toLowerCase() === page.result.tier.toLowerCase() &&
            tier.capturedBlock === page.block.toString(),
        )
          ? mergeOwnerPage(cache, page.result, page.block)
          : cache,
      base,
    );
  }, [discovery.data, savedCache, ownerPages]);
  useEffect(() => {
    if (discovery.data)
      saveAccountCache(window.localStorage, cacheKey, currentCache);
  }, [cacheKey, currentCache, discovery.data]);
  const moreOwners = useMutation({
    retry: false,
    mutationFn: (tier: CachedAccountTier) =>
      readAccountOwnerPage(client, {
        deployment,
        wallet,
        tier: tier.tier,
        offset: BigInt(tier.nextOwnerOffset),
        blockNumber: BigInt(tier.capturedBlock),
      }),
    onSuccess: (result, tier) =>
      setOwnerPages((previous) => [
        ...previous,
        { result, block: BigInt(tier.capturedBlock) },
      ]),
  });
  function refresh() {
    setSavedCache(emptyAccountCache());
    setOwnerPages([]);
    setOffset(0n);
    setBlockNumber(undefined);
    setRequest((value) => value + 1);
  }
  const page = discovery.data;
  const complete =
    currentCache.complete &&
    currentCache.results.every((tier) => tier.ownerComplete);
  return (
    <section className="account-results">
      <AccountRewards
        deployment={deployment}
        wallet={wallet}
        tiers={currentCache.results}
        complete={complete}
        formatAmount={claimLabel}
        onRefresh={refresh}
      />
      <div className="account-results-heading">
        <div>
          <h2 className="font-display">Your memberships</h2>
          <p>
            Each membership is an independent position. Ownership and balances
            below are captured at the displayed block.
          </p>
        </div>
        <button
          aria-label="Refresh memberships"
          className="account-refresh"
          disabled={discovery.isFetching || moreOwners.isPending}
          onClick={refresh}
          type="button"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={18} weight="bold" />
          <span>{discovery.isFetching ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>
      {discovery.isPending && (
        <p role="status">Looking for memberships connected to this wallet.</p>
      )}
      {(discovery.isError || !discovery.isFetchedAfterMount) &&
        currentCache.results.length > 0 && (
          <p role="status">
            Saved memberships are outdated until refreshed. Reward claims verify
            current ownership separately.
          </p>
        )}
      {discovery.error && (
        <p role="alert">
          {classifyReadError(discovery.error).label}{" "}
          <button type="button" onClick={() => void discovery.refetch()}>
            Retry discovery
          </button>
        </p>
      )}
      {page?.skipped.length ? (
        <p className="warning-copy" role="alert">
          We could not check {page.skipped.length} tiers. Retained results for
          those tiers are outdated.
        </p>
      ) : null}
      {!complete && (
        <p role="status">
          Discovery is incomplete. Loaded position and balance totals cover only
          the pages shown.
        </p>
      )}
      {currentCache.results.length === 0 && page && (
        <div className="empty-room">
          <h3>
            {complete
              ? "No memberships are connected to this wallet."
              : "No memberships found in these pages yet."}
          </h3>
          <p>Explore memberships to find a creator to support.</p>
          <Link className="button button-dark" href="/">
            Explore memberships
          </Link>
        </div>
      )}
      <ul className="account-tier-list">
        {currentCache.results.map((tier, index) => {
          const viewHref =
            `/chains/${deployment.chainId}/tiers/${tier.tier}` as Route;
          return (
            <li key={tier.tier}>
              <article className="account-membership-card">
                <Link
                  aria-label={`View ${tier.name}`}
                  className="account-card-artwork-link"
                  href={viewHref}
                >
                  <AccountArtwork
                    chainId={deployment.chainId}
                    eager={index === 0}
                    name={tier.name}
                    tier={tier.tier}
                  />
                </Link>
                <div className="account-card-copy">
                  <div className="account-card-identity">
                    <strong className="font-display">{tier.name}</strong>
                    {tier.creatorOwned && (
                      <span className="membership-state">
                        You are the creator
                      </span>
                    )}
                  </div>
                  <p className="small-copy">
                    Snapshot block {tier.capturedBlock}. Showing{" "}
                    {tier.positions.length} of {tier.ownerBalance} owned
                    memberships.
                  </p>
                  {tier.positions.length === 0 && (
                    <p>No owned membership NFTs in this snapshot.</p>
                  )}
                  <ul>
                    {tier.positions.map((position) => (
                      <li
                        key={`${deployment.chainId}:${tier.tier}:${position.tokenId}`}
                      >
                        <Link
                          href={
                            `${viewHref}?tokenId=${position.tokenId}` as Route
                          }
                        >
                          Membership #{position.tokenId}
                        </Link>
                        <p>
                          {position.active
                            ? "Membership active"
                            : "Expired — awaiting retirement"}
                        </p>
                        <p>
                          Expires{" "}
                          {formatMembershipDate(BigInt(position.expiration))}
                        </p>
                        <p>
                          Settled position rewards:{" "}
                          {claimLabel(
                            BigInt(position.claimableReward),
                            tier.paymentToken,
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                  {!tier.ownerComplete && (
                    <button
                      className="button button-outline"
                      type="button"
                      disabled={moreOwners.isPending || discovery.isFetching}
                      onClick={() => moreOwners.mutate(tier)}
                    >
                      More memberships in {tier.name}
                    </button>
                  )}
                  {(BigInt(tier.retiredReward) > 0n ||
                    BigInt(tier.retiredFractionalScaled) > 0n) && (
                    <p>
                      Rewards from ended memberships:{" "}
                      {claimLabel(
                        BigInt(tier.retiredReward),
                        tier.paymentToken,
                      )}
                      .{" "}
                      {BigInt(tier.retiredFractionalScaled) > 0n &&
                        "Fractional credit is preserved."}
                    </p>
                  )}
                  {BigInt(tier.claimableReferral) > 0n && (
                    <p>
                      Settled referral rewards:{" "}
                      {claimLabel(
                        BigInt(tier.claimableReferral),
                        tier.paymentToken,
                      )}
                    </p>
                  )}
                  {tier.creatorOwned && (
                    <p>
                      Settled creator rewards:{" "}
                      {claimLabel(
                        BigInt(tier.creatorProceeds),
                        tier.paymentToken,
                      )}
                    </p>
                  )}
                  <div className="account-tier-actions">
                    <Link className="button button-dark" href={viewHref}>
                      View membership
                    </Link>
                    {tier.creatorOwned && (
                      <Link
                        className="button button-dark"
                        href={`${viewHref}/manage` as Route}
                      >
                        Manage membership
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {moreOwners.isPending && (
        <p role="status">Loading another ownership page…</p>
      )}
      {moreOwners.error && (
        <p role="alert">
          {classifyReadError(moreOwners.error).label} Retry the ownership page
          or refresh memberships.
        </p>
      )}
      {page && (page.skipped.length > 0 || page.nextOffset !== null) && (
        <div className="account-pagination-actions">
          <button
            className="button button-dark"
            type="button"
            disabled={discovery.isFetching || moreOwners.isPending}
            onClick={() => {
              if (page.skipped.length) {
                void discovery.refetch();
                return;
              }
              setSavedCache(currentCache);
              setOwnerPages([]);
              setBlockNumber(page.capturedBlock);
              setOffset(page.nextOffset!);
            }}
          >
            {page.skipped.length ? "Try again" : "Find more memberships"}
          </button>
        </div>
      )}
    </section>
  );
}

export function AccountDiscovery({ initialDiscovery }: AccountDiscoveryProps) {
  const account = useAccount();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const active = useActiveNetwork();
  const chainId =
    !hydrated && initialDiscovery ? initialDiscovery.chainId : active.chainId;
  const deployment =
    !hydrated && initialDiscovery
      ? getDeployment(publicConfig, initialDiscovery.chainId)
      : active.deployment;
  const wallet =
    !hydrated && initialDiscovery ? initialDiscovery.wallet : account.address;
  const connected = !hydrated && initialDiscovery ? true : account.isConnected;
  const matchingInitial =
    initialDiscovery &&
    wallet?.toLowerCase() === initialDiscovery.wallet.toLowerCase() &&
    chainId === initialDiscovery.chainId
      ? initialDiscovery
      : undefined;

  const key =
    deployment.status === "ready" && connected && wallet
      ? accountCacheKey(chainId, deployment.factoryAddress, wallet)
      : undefined;

  return (
    <div className="account-stack">
      <header className="account-heading">
        <div>
          <p className="eyebrow">Backed by you</p>
          <h1 className="font-display">Your account.</h1>
        </div>
        <p>Your memberships, creations and earnings.</p>
      </header>

      {deployment.status !== "ready" ? (
        <ReadStateView
          heading="Memberships unavailable"
          state={unavailableDeploymentState(deployment)}
        />
      ) : !connected || !wallet ? (
        <ReadStateView
          heading="Your memberships"
          state={{
            status: "unavailable",
            reason: "rpc-unavailable",
            label: "Connect your wallet to see your memberships.",
          }}
        />
      ) : (
        <ConnectedDiscovery
          cacheKey={key as string}
          deployment={deployment}
          key={key}
          initialPage={matchingInitial?.page}
          initialPaymentTokens={matchingInitial?.paymentTokens}
          wallet={wallet}
        />
      )}
    </div>
  );
}
