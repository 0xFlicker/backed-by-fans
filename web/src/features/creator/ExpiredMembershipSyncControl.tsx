"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Address, PublicClient } from "viem";

import {
  expiredMembershipSyncBatchSize,
  scanExpiredMemberships,
  type ExpiredMembershipScan,
  type ExpiredMembershipScanProgress,
} from "@/features/creator/expired-membership-sync";
import { classifyReadError } from "@/lib/read-state";

type ScanState =
  | { phase: "idle" }
  | {
      phase: "scanning";
      scope: string;
      version: number;
      progress: ExpiredMembershipScanProgress;
    }
  | {
      phase: "ready";
      scope: string;
      version: number;
      result: ExpiredMembershipScan;
    }
  | { phase: "error"; scope: string; version: number; message: string };

export function ExpiredMembershipSyncControl({
  account,
  canSync,
  capturedBlock,
  client,
  owner,
  tier,
  totalMinted,
  walletChainId,
  onSync,
}: {
  account?: Address;
  canSync: boolean;
  capturedBlock: bigint;
  client: PublicClient;
  owner: Address;
  tier: Address;
  totalMinted: bigint;
  walletChainId?: number;
  onSync: (tokenIds: readonly bigint[]) => Promise<bigint | undefined>;
}) {
  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const [continuation, setContinuation] = useState<{
    blockNumber: bigint;
    identityScope: string;
  }>();
  const scanVersion = useRef(0);
  const identityVersion = useRef(0);
  const handledContinuation = useRef<string | undefined>(undefined);
  const identityScope = `${tier}:${owner}:${account ?? "disconnected"}:${walletChainId ?? "disconnected"}`;
  const scope = `${tier}:${capturedBlock}:${owner}:${account ?? "disconnected"}:${walletChainId ?? "disconnected"}`;
  const [renderedScope, setRenderedScope] = useState(scope);
  if (renderedScope !== scope) {
    setRenderedScope(scope);
    setState({ phase: "idle" });
  }
  const visibleState =
    state.phase === "idle" || state.scope === scope
      ? state
      : ({ phase: "idle" } as const);

  const scan = useCallback(async () => {
    const version = ++scanVersion.current;
    setState({
      phase: "scanning",
      scope,
      version,
      progress: { scanned: 0n, total: totalMinted, expired: 0 },
    });
    try {
      const result = await scanExpiredMemberships(client, {
        tier,
        totalMinted,
        capturedBlock,
        onProgress: (progress) => {
          if (version === scanVersion.current) {
            setState({ phase: "scanning", scope, version, progress });
          }
        },
      });
      if (version === scanVersion.current) {
        setState({ phase: "ready", scope, version, result });
      }
    } catch (error) {
      if (version === scanVersion.current) {
        setState({
          phase: "error",
          scope,
          version,
          message: classifyReadError(error).label,
        });
      }
    }
  }, [capturedBlock, client, scope, tier, totalMinted]);

  useLayoutEffect(() => {
    scanVersion.current += 1;
  }, [scan, scope]);

  useLayoutEffect(() => {
    identityVersion.current += 1;
  }, [identityScope]);

  useEffect(() => {
    const continuationKey = continuation
      ? `${continuation.identityScope}:${continuation.blockNumber}`
      : undefined;
    if (
      continuation === undefined ||
      continuation.identityScope !== identityScope ||
      capturedBlock < continuation.blockNumber ||
      handledContinuation.current === continuationKey
    ) {
      return;
    }
    handledContinuation.current = continuationKey;
    const timeout = window.setTimeout(() => void scan(), 0);
    return () => window.clearTimeout(timeout);
  }, [capturedBlock, continuation, identityScope, scan]);

  async function syncNextBatch(tokenIds: readonly bigint[]) {
    const startedIdentityVersion = identityVersion.current;
    const synchronizedBlock = await onSync(tokenIds);
    if (
      synchronizedBlock !== undefined &&
      identityVersion.current === startedIdentityVersion
    ) {
      setContinuation({ blockNumber: synchronizedBlock, identityScope });
    }
  }

  const result =
    visibleState.phase === "ready" ? visibleState.result : undefined;
  const nextBatch =
    result?.tokenIds.slice(0, expiredMembershipSyncBatchSize) ?? [];

  return (
    <section className="control-group" aria-labelledby="expired-sync-title">
      <div>
        <p className="eyebrow">NFT compatibility</p>
        <h2 id="expired-sync-title">Sync expired memberships</h2>
        <p>
          Find expired membership NFTs directly onchain, then burn up to 100 per
          wallet confirmation so ordinary NFT gates reflect current access.
        </p>
      </div>

      {visibleState.phase === "scanning" ? (
        <p className="inline-status" role="status">
          Scanned {visibleState.progress.scanned.toString()} of{" "}
          {visibleState.progress.total.toString()} memberships · found{" "}
          {visibleState.progress.expired.toString()} expired
        </p>
      ) : null}
      {visibleState.phase === "error" ? (
        <p className="inline-status" role="alert">
          The scan was discarded: {visibleState.message}
        </p>
      ) : null}
      {result ? (
        <div aria-live="polite">
          <p className="inline-status" role="status">
            Scanned {result.scanned.toString()} memberships at block{" "}
            {result.capturedBlock.toString()} · found {result.expired} expired
          </p>
          {nextBatch.length > 0 ? (
            <div className="refund-preview">
              <p>
                Confirming burns these NFTs and stops their lifetime shares from
                receiving new rewards. Rewards already earned remain claimable,
                and a later purchase, contribution, gift, or grant restores the
                same token ID and lifetime shares. NFT marketplaces and gates
                may take time to index the burns.
              </p>
              <button
                className="button button-warning"
                disabled={!canSync}
                onClick={() => void syncNextBatch(nextBatch)}
                type="button"
              >
                Sync next {nextBatch.length} expired membership
                {nextBatch.length === 1 ? "" : "s"}
              </button>
            </div>
          ) : (
            <p className="small-copy">
              No expired membership NFTs need syncing.
            </p>
          )}
        </div>
      ) : null}

      <button
        className="button button-outline"
        disabled={!canSync || visibleState.phase === "scanning"}
        onClick={() => void scan()}
        type="button"
      >
        {result ? "Scan again" : "Scan for expired memberships"}
      </button>
    </section>
  );
}
