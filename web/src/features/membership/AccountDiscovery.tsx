"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, isAddress, type Address } from "viem";
import { useAccount } from "wagmi";

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
import { publicConfig } from "@/lib/config";
import { createDirectReadClient } from "@/lib/direct-read";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";

function DirectTierAccess() {
  const [value, setValue] = useState("");
  const valid = isAddress(value.trim());

  return (
    <section className="direct-claim-access surface-card">
      <div>
        <p className="eyebrow">Direct claim access</p>
        <h2 className="font-display">Open a membership by address.</h2>
        <p>
          This route reads the tier directly. It never depends on the local
          discovery cache.
        </p>
      </div>
      <label className="creator-field">
        <span>Tier contract</span>
        <input
          aria-describedby="direct-tier-guidance"
          className="font-mono"
          onChange={(event) => setValue(event.target.value)}
          placeholder="0x…"
          spellCheck={false}
          value={value}
        />
      </label>
      <div>
        <p className="field-guidance" id="direct-tier-guidance">
          {value && !valid
            ? "Enter a complete EVM address."
            : "The contract must pass factory and interface checks before writes."}
        </p>
        {valid ? (
          <Link className="button button-dark" href={`/tiers/${value.trim()}`}>
            Read this tier
          </Link>
        ) : (
          <button className="button button-dark" disabled type="button">
            Read this tier
          </button>
        )}
      </div>
    </section>
  );
}

type ConnectedDiscoveryProps = {
  cacheKey: string;
  factory: Address;
  paymentToken: Address;
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
  factory,
  paymentToken,
  wallet,
}: ConnectedDiscoveryProps) {
  const client = useMemo(() => createDirectReadClient(), []);
  const [savedCache, setSavedCache] = useState<AccountCache>(() =>
    loadAccountCache(window.localStorage, cacheKey),
  );
  const [offset, setOffset] = useState(() => BigInt(savedCache.cursor));
  const [request, setRequest] = useState(0);
  const discovery = useQuery({
    queryKey: ["account-discovery", cacheKey, offset.toString(), request],
    queryFn: () =>
      discoverAccountPage(client, {
        factory,
        paymentToken,
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
    <section className="account-results surface-card">
      <div className="account-results-heading">
        <div>
          <p className="eyebrow">Verified direct reads</p>
          <h2 className="font-display">Memberships and claims</h2>
          <p>
            Discovery scans at most 12 registered tiers per request. Saved
            progress is convenience only; every result is reread from chain.
          </p>
        </div>
        <button className="text-button" onClick={eraseCache} type="button">
          Erase saved scan
        </button>
      </div>

      {discovery.isLoading && (
        <ReadStateView
          state={{
            status: "loading",
            label: `Scanning the factory from registry offset ${offset.toString()}.`,
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
          <div className="account-scan-meta">
            <p className="font-mono">
              Block {page.capturedBlock.toString()} · scanned{" "}
              {page.offset.toString()}–{page.scannedTo.toString()} of{" "}
              {page.total.toString()}
            </p>
            {hasSkipped && (
              <p className="warning-copy" role="alert">
                {page.skipped.length} tier read
                {page.skipped.length === 1 ? " was" : "s were"} unavailable. The
                cursor remains on this page so none are silently skipped.
              </p>
            )}
          </div>

          {currentCache.results.length === 0 ? (
            <div className="empty-room">
              <p className="eyebrow">Nothing verified yet</p>
              <h3>No membership or claim was found in the scanned pages.</h3>
            </div>
          ) : (
            <ul className="account-tier-list">
              {currentCache.results.map((tier) => (
                <li key={tier.tier}>
                  <div>
                    <strong className="font-display">{tier.name}</strong>
                    <span className="font-mono">{tier.tier}</span>
                    <span>
                      {tier.tokenId === "0"
                        ? "No credential"
                        : tier.active
                          ? `Active credential #${tier.tokenId}`
                          : `Historical credential #${tier.tokenId}`}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Reward</dt>
                      <dd>
                        {formatUnits(BigInt(tier.claimableReward), 6)} USDG
                      </dd>
                    </div>
                    <div>
                      <dt>Referral</dt>
                      <dd>
                        {formatUnits(BigInt(tier.claimableReferral), 6)} USDG
                      </dd>
                    </div>
                    <div>
                      <dt>Creator</dt>
                      <dd>
                        {formatUnits(BigInt(tier.creatorProceeds), 6)} USDG
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className="button button-light"
                    href={`/tiers/${tier.tier}`}
                  >
                    Open membership
                  </Link>
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
                Retry this page
              </button>
            ) : page.nextOffset !== null ? (
              <button
                className="button button-dark"
                onClick={() => advance(page.nextOffset as bigint)}
                type="button"
              >
                Scan next page
              </button>
            ) : (
              <button
                className="button button-light"
                onClick={() => {
                  keepCurrentPage();
                  setOffset(page.scannedTo);
                  setRequest((value) => value + 1);
                }}
                type="button"
              >
                Check newly registered tiers
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function AccountDiscovery() {
  const account = useAccount();
  const deployment = publicConfig.deployment;

  const key =
    deployment.status === "ready" && account.isConnected && account.address
      ? accountCacheKey(
          publicConfig.chainId,
          deployment.factoryAddress,
          account.address,
        )
      : undefined;

  return (
    <div className="account-stack">
      <header className="account-heading">
        <div>
          <p className="eyebrow">Your side of the room</p>
          <h1 className="font-display">Memberships that stay yours.</h1>
        </div>
        <p>
          Read credentials, rewards, referrals, and creator proceeds directly
          from the registry. No indexer or account database sits in the middle.
        </p>
      </header>

      <DirectTierAccess />

      {deployment.status !== "ready" ? (
        <ReadStateView state={unavailableDeploymentState(deployment)} />
      ) : !account.isConnected || !account.address ? (
        <ReadStateView
          state={{
            status: "unavailable",
            reason: "rpc-unavailable",
            label: "Connect a wallet to scan the bounded factory registry.",
          }}
        />
      ) : (
        <ConnectedDiscovery
          cacheKey={key as string}
          factory={deployment.factoryAddress}
          key={key}
          paymentToken={deployment.usdgAddress}
          wallet={account.address}
        />
      )}
    </div>
  );
}
