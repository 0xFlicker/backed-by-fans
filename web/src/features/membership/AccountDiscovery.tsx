"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, isAddress, type Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import {
  accountCacheKey,
  emptyAccountCache,
  loadAccountCache,
  mergeAccountPage,
  saveAccountCache,
  type AccountCache,
} from "@/features/membership/account-cache";
import { discoverAccountPage } from "@/features/membership/account-discovery";
import type { ReadyDeployment } from "@/lib/config";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";
import { useActiveNetwork } from "@/lib/use-active-network";

function DirectTierAccess({ chainId }: { chainId: number }) {
  const [value, setValue] = useState("");
  const valid = isAddress(value.trim());

  return (
    <details className="direct-tier-access">
      <summary>Already have a membership link?</summary>
      <div className="direct-tier-access-body">
        <div>
          <p className="eyebrow">Add a membership</p>
          <h2 className="font-display">Open it by address.</h2>
          <p>
            Paste a membership address to open it directly. This is useful if it
            is not showing in your list yet.
          </p>
        </div>
        <label className="creator-field">
          <span>Membership address</span>
          <input
            aria-describedby="direct-tier-guidance"
            className="font-mono"
            onInput={(event) => setValue(event.currentTarget.value)}
            placeholder="0x…"
            spellCheck={false}
            value={value}
          />
        </label>
        <div>
          <p className="field-guidance" id="direct-tier-guidance">
            {value && !valid
              ? "Enter the complete address, starting with 0x."
              : "We will confirm that this is a Backed By Fans membership before you can make changes."}
          </p>
          {valid ? (
            <Link
              className="button button-dark"
              href={`/chains/${chainId}/tiers/${value.trim()}` as Route}
            >
              Open membership
            </Link>
          ) : (
            <button className="button button-dark" disabled type="button">
              Open membership
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

type ConnectedDiscoveryProps = {
  cacheKey: string;
  deployment: ReadyDeployment;
  wallet: Address;
};

const subscribeToHydration = () => () => undefined;

function ConnectedDiscovery(props: ConnectedDiscoveryProps) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  if (!hydrated) {
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
  wallet,
}: ConnectedDiscoveryProps) {
  const client = usePublicClient({ chainId: deployment.chainId })!;
  const [savedCache, setSavedCache] = useState<AccountCache>(() =>
    loadAccountCache(window.localStorage, cacheKey),
  );
  const [offset, setOffset] = useState(() =>
    savedCache.complete ? 0n : BigInt(savedCache.cursor),
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
  });

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

  function keepCurrentPage() {
    setSavedCache(currentCache);
  }

  function eraseCache() {
    window.localStorage.removeItem(cacheKey);
    const empty = emptyAccountCache();
    setSavedCache(empty);
    setOffset(0n);
    setRequest((value) => value + 1);
  }

  function advance(nextOffset: bigint) {
    keepCurrentPage();
    setOffset(nextOffset);
  }

  const page = discovery.data;
  const hasSkipped = Boolean(page?.skipped.length);

  return (
    <section className="account-results">
      <div className="account-results-heading">
        <div>
          <h2 className="font-display">Your memberships</h2>
          <p>
            The memberships connected to this wallet, including the ones you
            support and the ones you run.
          </p>
        </div>
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
              <p className="eyebrow">Nothing here yet</p>
              <h3>No memberships are connected to this wallet.</h3>
              <p>
                If you have a membership link, you can open it directly below.
              </p>
            </div>
          ) : (
            <ul className="account-tier-list">
              {currentCache.results.map((tier) => (
                <li key={tier.tier}>
                  <div className="account-tier-identity">
                    <strong className="font-display">{tier.name}</strong>
                    <span className="membership-state">
                      {tier.creatorOwned && tier.active
                        ? "You are a member and the creator"
                        : tier.creatorOwned
                          ? "You manage this membership"
                          : tier.tokenId === "0"
                            ? "You have no active membership"
                            : tier.active
                              ? "Your membership is active"
                              : "Your membership has ended"}
                    </span>
                    <details className="membership-reference">
                      <summary>Membership details</summary>
                      <dl>
                        <div>
                          <dt>Membership address</dt>
                          <dd className="font-mono">{tier.tier}</dd>
                        </div>
                      </dl>
                    </details>
                  </div>
                  {(BigInt(tier.claimableReward) > 0n ||
                    BigInt(tier.claimableReferral) > 0n ||
                    BigInt(tier.creatorProceeds) > 0n) && (
                    <dl>
                      {BigInt(tier.claimableReward) > 0n && (
                        <div>
                          <dt>Rewards ready to collect</dt>
                          <dd>
                            {formatUnits(BigInt(tier.claimableReward), 6)} USDG
                          </dd>
                        </div>
                      )}
                      {BigInt(tier.claimableReferral) > 0n && (
                        <div>
                          <dt>Referral earnings ready</dt>
                          <dd>
                            {formatUnits(BigInt(tier.claimableReferral), 6)}{" "}
                            USDG
                          </dd>
                        </div>
                      )}
                      {tier.creatorOwned &&
                        BigInt(tier.creatorProceeds) > 0n && (
                          <div>
                            <dt>Creator earnings ready</dt>
                            <dd>
                              {formatUnits(BigInt(tier.creatorProceeds), 6)}{" "}
                              USDG
                            </dd>
                          </div>
                        )}
                    </dl>
                  )}
                  <div className="account-tier-actions">
                    <Link
                      className="button button-light"
                      href={
                        `/chains/${deployment.chainId}/tiers/${tier.tier}` as Route
                      }
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
                </li>
              ))}
            </ul>
          )}

          <div className="creator-actions">
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
            ) : page.nextOffset !== null ? (
              <button
                className="button button-dark"
                onClick={() => advance(page.nextOffset as bigint)}
                type="button"
              >
                Find more memberships
              </button>
            ) : (
              <button
                className="button button-light"
                onClick={() => {
                  keepCurrentPage();
                  setOffset(0n);
                  setRequest((value) => value + 1);
                }}
                type="button"
              >
                Check again
              </button>
            )}
          </div>

          <details className="account-list-settings">
            <summary>List settings</summary>
            <div>
              <p>
                This list is saved on this device to make future visits faster.
              </p>
              <button
                className="text-button"
                onClick={eraseCache}
                type="button"
              >
                Clear saved list
              </button>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function AccountDiscovery() {
  const account = useAccount();
  const { chainId, deployment } = useActiveNetwork();

  const key =
    deployment.status === "ready" && account.isConnected && account.address
      ? accountCacheKey(chainId, deployment.factoryAddress, account.address)
      : undefined;

  return (
    <div className="account-stack">
      <header className="account-heading">
        <div>
          <p className="eyebrow">Your account</p>
          <h1 className="font-display">Your account.</h1>
        </div>
        <p>
          See the memberships you support, manage the ones you create, and
          collect any earnings waiting for you.
        </p>
      </header>

      {deployment.status !== "ready" ? (
        <ReadStateView
          heading="Memberships unavailable"
          state={unavailableDeploymentState(deployment)}
        />
      ) : !account.isConnected || !account.address ? (
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
          wallet={account.address}
        />
      )}

      <DirectTierAccess chainId={chainId} />
    </div>
  );
}
