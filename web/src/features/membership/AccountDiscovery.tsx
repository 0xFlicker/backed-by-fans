"use client";
import { StreamingAmount } from "@/components/StreamingAmount";

import Link from "next/link";
import { AccountRewards } from "./AccountRewards";
import { readAccountRewards } from "./account-rewards-read";
import type { Route } from "next";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { ResilientArtworkImage } from "@/components/ResilientArtworkImage";
import {
  accountCacheKey,
  emptyAccountCache,
  loadAccountCache,
  mergeAccountPage,
  saveAccountCache,
  type AccountCache,
} from "@/features/membership/account-cache";
import { discoverAccountPage } from "@/features/membership/account-discovery";
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
    initialPage
      ? mergeAccountPage(emptyAccountCache(), {
          resumeOffset:
            initialPage.skipped.length > 0
              ? initialPage.offset
              : initialPage.scannedTo,
          complete:
            initialPage.nextOffset === null && initialPage.skipped.length === 0,
          capturedBlock: initialPage.capturedBlock,
          scannedTiers: initialPage.scannedTiers,
          results: initialPage.results,
        })
      : loadAccountCache(window.localStorage, cacheKey),
  );
  const [offset, setOffset] = useState(
    () =>
      initialPage?.offset ??
      (savedCache.complete ? 0n : BigInt(savedCache.cursor)),
  );
  const [request, setRequest] = useState(0);
  const discovery = useQuery({
    queryKey: ["account-discovery", cacheKey, offset.toString(), request],
    queryFn: () =>
      discoverAccountPage(client, {
        deployment,
        wallet,
        offset,
      }),
    initialData: initialPage?.offset === offset ? initialPage : undefined,
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
      ? `${formatLocalizedTokenAmount({
          raw,
          decimals: token.decimals,
          multiplier: token.uiMultiplier,
        })} ${token.symbol}`
      : "Payment token unavailable";
  }

  const currentCache = useMemo(() => {
    if (!discovery.data) return savedCache;
    const hasSkipped = discovery.data.skipped.length > 0;
    return mergeAccountPage(savedCache, {
      resumeOffset: hasSkipped
        ? discovery.data.offset
        : discovery.data.scannedTo,
      complete: discovery.data.nextOffset === null && !hasSkipped,
      capturedBlock: discovery.data.capturedBlock,
      scannedTiers: discovery.data.scannedTiers,
      results: discovery.data.results,
    });
  }, [discovery.data, savedCache]);

  useEffect(() => {
    if (discovery.data) {
      saveAccountCache(window.localStorage, cacheKey, currentCache);
    }
  }, [cacheKey, currentCache, discovery.data]);

  const earnings = useQuery({
    queryKey: [
      "account-rewards",
      deployment.chainId,
      deployment.factoryAddress,
      wallet,
      ...currentCache.results.map((tier) => tier.tier),
    ],
    queryFn: () => readAccountRewards(client, wallet, currentCache.results),
    enabled: currentCache.results.length > 0,
    retry: false,
    refetchInterval: 15_000,
  });

  function keepCurrentPage() {
    setSavedCache(currentCache);
  }

  function advance(nextOffset: bigint) {
    keepCurrentPage();
    setOffset(nextOffset);
  }

  const page = discovery.data;
  const hasSkipped = Boolean(page?.skipped.length);

  return (
    <section className="account-results">
      <AccountRewards
        deployment={deployment}
        wallet={wallet}
        tiers={currentCache.results}
        complete={currentCache.complete}
        formatAmount={claimLabel}
      />
      <div className="account-results-heading">
        <div>
          <h2 className="font-display">Your memberships</h2>
          <p>
            The memberships connected to this wallet, including the ones you
            support and the ones you run.
          </p>
        </div>
        <button
          aria-label="Refresh memberships"
          className="account-refresh"
          disabled={discovery.isFetching}
          onClick={() => {
            keepCurrentPage();
            setOffset(0n);
            setRequest((value) => value + 1);
          }}
          type="button"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={18} weight="bold" />
          <span>{discovery.isFetching ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>

      {discovery.isLoading && (
        <ReadStateView
          state={{
            status: "loading",
            label: "Looking for memberships connected to this wallet.",
          }}
        />
      )}
      {discovery.error && (
        <ReadStateView
          onRetry={() => void discovery.refetch()}
          state={(() => {
            const state = classifyReadError(discovery.error);
            return state.status === "rate-limited"
              ? state
              : {
                  ...state,
                  reason: "rpc-unavailable" as const,
                };
          })()}
        />
      )}
      {page && (
        <>
          {hasSkipped && (
            <p className="warning-copy" role="alert">
              We could not check {page.skipped.length} membership
              {page.skipped.length === 1 ? " yet" : "s yet"}. Your saved list
              has not been changed.
            </p>
          )}

          {currentCache.results.length === 0 ? (
            <div className="empty-room">
              <h3>No memberships are connected to this wallet.</h3>
              <p>Explore memberships to find a creator to support.</p>
              <Link className="button button-dark" href="/">
                Explore memberships
              </Link>
            </div>
          ) : (
            <ul className="account-tier-list">
              {currentCache.results.map((tier, index) => {
                const current = earnings.isError
                  ? undefined
                  : earnings.data?.results[index];
                const reward = current?.reward ?? 0n;
                const referral = current?.referral ?? 0n;
                const creator = current?.creator ?? 0n;
                const hasClaim = reward > 0n || referral > 0n || creator > 0n;
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
                          <span className="membership-state">
                            {tier.creatorOwned && tier.active
                              ? "Member and creator"
                              : tier.creatorOwned
                                ? "You are the creator"
                                : tier.tokenId === "0"
                                  ? "Not currently a member"
                                  : tier.active
                                    ? "Membership active"
                                    : "Membership ended"}
                          </span>
                        </div>

                        {earnings.isError && (
                          <p className="small-copy">Earnings unavailable.</p>
                        )}
                        {current && !current.complete && (
                          <p className="small-copy">
                            Earnings preview is partial.
                          </p>
                        )}
                        {hasClaim && (
                          <dl className="account-card-balances">
                            {reward > 0n && (
                              <div>
                                <dt>Rewards ready</dt>
                                <dd>
                                  {
                                    <StreamingAmount
                                      identity={`${deployment.chainId}:${wallet}:${tier.tier}:rewardStream`}
                                      streams={
                                        current?.rewardStream
                                          ? [current.rewardStream]
                                          : []
                                      }
                                      format={(raw) =>
                                        claimLabel(raw, tier.paymentToken)
                                      }
                                      refresh={() => earnings.refetch()}
                                      active={!earnings.isError}
                                    />
                                  }
                                </dd>
                              </div>
                            )}
                            {referral > 0n && (
                              <div>
                                <dt>Referral earnings</dt>
                                <dd>
                                  {
                                    <StreamingAmount
                                      identity={`${deployment.chainId}:${wallet}:${tier.tier}:referralStream`}
                                      streams={
                                        current?.referralStream
                                          ? [current.referralStream]
                                          : []
                                      }
                                      format={(raw) =>
                                        claimLabel(raw, tier.paymentToken)
                                      }
                                      refresh={() => earnings.refetch()}
                                      active={!earnings.isError}
                                    />
                                  }
                                </dd>
                              </div>
                            )}
                            {tier.creatorOwned && creator > 0n && (
                              <div>
                                <dt>Creator earnings</dt>
                                <dd>
                                  {
                                    <StreamingAmount
                                      identity={`${deployment.chainId}:${wallet}:${tier.tier}:creatorStream`}
                                      streams={
                                        current?.creatorStream
                                          ? [current.creatorStream]
                                          : []
                                      }
                                      format={(raw) =>
                                        claimLabel(raw, tier.paymentToken)
                                      }
                                      refresh={() => earnings.refetch()}
                                      active={!earnings.isError}
                                    />
                                  }
                                </dd>
                              </div>
                            )}
                          </dl>
                        )}

                        <div className="account-tier-actions">
                          <Link
                            className={`button ${tier.creatorOwned ? "button-light" : "button-dark"}`}
                            href={viewHref}
                          >
                            View membership
                          </Link>
                          {tier.creatorOwned && (
                            <Link
                              className="button button-dark"
                              href={
                                `/chains/${deployment.chainId}/tiers/${tier.tier}/manage` as Route
                              }
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
          )}

          {(hasSkipped || page.nextOffset !== null) && (
            <div className="account-pagination-actions">
              {hasSkipped ? (
                <button
                  className="button button-dark"
                  onClick={() => {
                    keepCurrentPage();
                    setRequest((value) => value + 1);
                  }}
                  type="button"
                >
                  Try again
                </button>
              ) : (
                <button
                  className="button button-dark"
                  onClick={() => advance(page.nextOffset as bigint)}
                  type="button"
                >
                  Find more memberships
                </button>
              )}
            </div>
          )}
        </>
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
