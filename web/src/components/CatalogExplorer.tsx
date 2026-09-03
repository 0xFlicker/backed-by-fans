"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { CatalogTierSummary } from "@/contracts/types";
import { ReadStateView } from "@/components/ReadState";
import {
  readCatalogSnapshot,
  type CatalogInitialState,
  type CatalogSnapshot,
} from "@/lib/catalog-read";
import {
  classifyReadError,
  type ReadState,
  unavailableDeploymentState,
} from "@/lib/read-state";
import type { AcceptedPaymentToken } from "@/lib/payment-token-read";
import { formatRawTokenAmount } from "@/lib/token-amount";
import { useActiveNetwork } from "@/lib/use-active-network";

function summariesFromState(
  state: ReadState<CatalogTierSummary[]>,
): CatalogTierSummary[] {
  if (state.status === "valid" || state.status === "stale") return state.data;
  return state.status === "partial" && Array.isArray(state.data)
    ? (state.data as CatalogTierSummary[])
    : [];
}

function CatalogArtwork({
  chainId,
  tier,
  eager,
}: {
  chainId: number;
  tier: CatalogTierSummary;
  eager: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = `/api/chains/${chainId}/tiers/${tier.address}/artwork?v=${tier.artworkRevision}`;

  return (
    <div className="catalog-card-artwork">
      {!failed && (
        <Image
          alt={`${tier.name} collection artwork`}
          className="catalog-card-image"
          fetchPriority={eager ? "high" : "auto"}
          fill
          loading={eager ? "eager" : "lazy"}
          onError={() => setFailed(true)}
          sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
          src={src}
          unoptimized
        />
      )}
      {failed && (
        <span className="catalog-card-artwork-fallback">
          Artwork unavailable
        </span>
      )}
    </div>
  );
}

function tierPrice(
  tier: CatalogTierSummary,
  tokenData: readonly AcceptedPaymentToken[],
) {
  const token = tokenData.find(
    (candidate) =>
      candidate.address.toLowerCase() === tier.paymentToken.toLowerCase(),
  );
  if (tier.pricePerPeriod === 0n) return "Choose your support";
  return token
    ? `${formatRawTokenAmount({
        raw: tier.pricePerPeriod,
        decimals: token.decimals,
        multiplier: token.uiMultiplier,
      })} ${token.symbol}`
    : "Payment token unavailable";
}

export function CatalogExplorer({
  initialState,
  presentation = "list",
}: {
  initialState?: CatalogInitialState;
  presentation?: "list" | "tiles";
}) {
  const { chainId, client, deployment } = useActiveNetwork();
  const [pageRequest, setPageRequest] = useState<{
    chainId: number;
    offset: bigint;
    capturedBlock?: bigint;
  }>({ chainId, offset: 0n });
  const activePageRequest =
    pageRequest.chainId === chainId
      ? pageRequest
      : { chainId, offset: 0n, capturedBlock: undefined };
  const catalog = useQuery({
    queryKey: [
      "catalog",
      chainId,
      activePageRequest.offset.toString(),
      activePageRequest.capturedBlock?.toString(),
    ],
    enabled: deployment.status === "ready" && Boolean(client),
    queryFn: (): Promise<CatalogSnapshot> => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      if (!client) throw new Error("No public client is available.");
      return readCatalogSnapshot(client, deployment, {
        offset: activePageRequest.offset,
        capturedBlock: activePageRequest.capturedBlock,
      });
    },
    initialData:
      initialState?.status === "ready" &&
      initialState.chainId === chainId &&
      activePageRequest.offset === 0n &&
      activePageRequest.capturedBlock === undefined
        ? initialState.data
        : undefined,
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }

  if (catalog.isLoading) {
    if (initialState?.status === "failed" && initialState.chainId === chainId) {
      return (
        <ReadStateView
          onRetry={() => void catalog.refetch()}
          state={initialState.state}
        />
      );
    }
    return (
      <ReadStateView
        state={{
          status: "loading",
          label: "Capturing one block and reading the factory registry.",
        }}
      />
    );
  }

  if (catalog.error) {
    const classified = classifyReadError(catalog.error);
    return (
      <ReadStateView
        onRetry={() => void catalog.refetch()}
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

  if (!catalog.data) return null;
  const { page, summaries: summaryState, paymentTokens } = catalog.data;
  const summaries = summariesFromState(summaryState);
  const tokenData =
    paymentTokens.status === "valid" || paymentTokens.status === "partial"
      ? paymentTokens.data
      : [];

  return (
    <div className="catalog-stack">
      <div className="catalog-meta">
        <p>
          {page.total.toString()} membership{page.total === 1n ? "" : "s"}
        </p>
        <p className="font-mono">Block {page.capturedBlock.toString()}</p>
      </div>

      {summaries.length === 0 ? (
        <div className="empty-room">
          <h2>No memberships.</h2>
        </div>
      ) : presentation === "tiles" ? (
        <ul className="catalog-grid">
          {summaries.map((tier, index) => (
            <li key={tier.address}>
              <Link
                className="catalog-card"
                href={`/chains/${chainId}/tiers/${tier.address}` as Route}
              >
                <CatalogArtwork
                  chainId={chainId}
                  eager={index === 0}
                  tier={tier}
                />
                <span className="catalog-card-copy">
                  <span className="catalog-card-heading">
                    <strong className="font-display">{tier.name}</strong>
                    <span aria-hidden="true">↗</span>
                  </span>
                  <span className="catalog-card-meta">
                    <span>{tier.symbol}</span>
                    <span>{tierPrice(tier, tokenData)}</span>
                  </span>
                  {tier.paused && (
                    <span className="catalog-card-status">
                      Membership paused
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="tier-list">
          {summaries.map((tier, index) => {
            return (
              <li key={tier.address}>
                <Link
                  className="tier-row"
                  href={`/chains/${chainId}/tiers/${tier.address}` as Route}
                >
                  <span className="tier-number font-mono">
                    {String(Number(page.offset) + index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong className="font-display">{tier.name}</strong>
                    <small>{tier.symbol}</small>
                  </span>
                  <span className="tier-price">
                    {tierPrice(tier, tokenData)}
                  </span>
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label="Membership catalog pages" className="pagination">
        <button
          className="text-button"
          disabled={page.offset === 0n}
          onClick={() =>
            setPageRequest({
              chainId,
              offset:
                page.offset > BigInt(page.limit)
                  ? page.offset - BigInt(page.limit)
                  : 0n,
              capturedBlock: page.capturedBlock,
            })
          }
          type="button"
        >
          Previous page
        </button>
        <button
          className="text-button"
          disabled={page.nextOffset === null}
          onClick={() =>
            page.nextOffset !== null &&
            setPageRequest({
              chainId,
              offset: page.nextOffset,
              capturedBlock: page.capturedBlock,
            })
          }
          type="button"
        >
          Next page
        </button>
      </nav>
    </div>
  );
}
