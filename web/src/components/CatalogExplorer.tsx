"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { TierSummary } from "@/contracts/types";
import { ReadStateView } from "@/components/ReadState";
import {
  catalogPageLimit,
  readCatalogPage,
  readTierSummaries,
} from "@/lib/direct-read";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";
import { readAcceptedPaymentTokens } from "@/lib/payment-token-read";
import { formatRawTokenAmount } from "@/lib/token-amount";
import { useActiveNetwork } from "@/lib/use-active-network";

function summariesFromState(
  state: Awaited<ReturnType<typeof readTierSummaries>>,
): TierSummary[] {
  if (state.status === "valid" || state.status === "stale") return state.data;
  return state.status === "partial" && Array.isArray(state.data)
    ? (state.data as TierSummary[])
    : [];
}

export function CatalogExplorer() {
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
    queryFn: async () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      if (!client) throw new Error("No public client is available.");
      const page = await readCatalogPage(client, deployment.factoryAddress, {
        offset: activePageRequest.offset,
        limit: catalogPageLimit,
        blockNumber: activePageRequest.capturedBlock,
      });
      const summaries = await readTierSummaries(
        client,
        page.addresses,
        page.capturedBlock,
      );
      const paymentTokens = await readAcceptedPaymentTokens(client, {
        chainId: deployment.chainId,
        factory: deployment.factoryAddress,
        blockNumber: page.capturedBlock,
      });
      return { page, summaries, paymentTokens };
    },
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }

  if (catalog.isLoading) {
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
      ) : (
        <ul className="tier-list">
          {summaries.map((tier, index) => {
            const token = tokenData.find(
              (candidate) =>
                candidate.address.toLowerCase() ===
                tier.paymentToken.toLowerCase(),
            );
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
                    {tier.pricePerPeriod === 0n
                      ? "Choose your support"
                      : token
                        ? `${formatRawTokenAmount({
                            raw: tier.pricePerPeriod,
                            decimals: token.decimals,
                            multiplier: token.uiMultiplier,
                          })} ${token.symbol}`
                        : "Payment token unavailable"}
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
