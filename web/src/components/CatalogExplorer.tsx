"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";

import type { TierSummary } from "@/contracts/types";
import { ReadStateView } from "@/components/ReadState";
import { publicConfig } from "@/lib/config";
import {
  catalogPageLimit,
  createDirectReadClient,
  readCatalogPage,
  readTierSummaries,
} from "@/lib/direct-read";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";

function summariesFromState(
  state: Awaited<ReturnType<typeof readTierSummaries>>,
): TierSummary[] {
  if (state.status === "valid" || state.status === "stale") return state.data;
  return state.status === "partial" && Array.isArray(state.data)
    ? (state.data as TierSummary[])
    : [];
}

export function CatalogExplorer() {
  const [pageRequest, setPageRequest] = useState<{
    offset: bigint;
    capturedBlock?: bigint;
  }>({ offset: 0n });
  const client = useMemo(() => createDirectReadClient(), []);
  const deployment = publicConfig.deployment;
  const catalog = useQuery({
    queryKey: [
      "catalog",
      pageRequest.offset.toString(),
      pageRequest.capturedBlock?.toString(),
    ],
    enabled: deployment.status === "ready",
    queryFn: async () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      const page = await readCatalogPage(client, deployment.factoryAddress, {
        offset: pageRequest.offset,
        limit: catalogPageLimit,
        blockNumber: pageRequest.capturedBlock,
      });
      const summaries = await readTierSummaries(
        client,
        page.addresses,
        page.capturedBlock,
      );
      return { page, summaries };
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
  const { page, summaries: summaryState } = catalog.data;
  const summaries = summariesFromState(summaryState);

  return (
    <div className="catalog-stack">
      <ReadStateView
        onRetry={() => void catalog.refetch()}
        state={summaryState}
      />
      <div className="catalog-meta">
        <p>
          {page.total.toString()} membership{page.total === 1n ? "" : "s"}
        </p>
        <p className="font-mono">Block {page.capturedBlock.toString()}</p>
      </div>

      {summaries.length === 0 ? (
        <div className="empty-room">
          <p className="eyebrow">The room is quiet</p>
          <h2>No memberships are registered at this captured block.</h2>
        </div>
      ) : (
        <ul className="tier-list">
          {summaries.map((tier, index) => (
            <li key={tier.address}>
              <Link className="tier-row" href={`/tiers/${tier.address}`}>
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
                    : `${formatUnits(tier.pricePerPeriod, 6)} USDG`}
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Membership catalog pages" className="pagination">
        <button
          className="text-button"
          disabled={page.offset === 0n}
          onClick={() =>
            setPageRequest({
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
