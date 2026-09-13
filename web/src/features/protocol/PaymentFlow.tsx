"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import type { SupportedChainId } from "@/lib/chains";
import { formatLocalizedTokenAmount } from "@/lib/token-amount";
import {
  aggregatePaymentFlow,
  paymentFlowStream,
  readPaymentFlowPage,
} from "./payment-flow";
import { StreamingAmount } from "@/components/StreamingAmount";
import styles from "./PaymentFlow.module.css";

const purposes = ["Creators", "Member rewards", "Referrals", "Protocol"];
export function PaymentFlow({
  chainId,
  factory,
}: {
  chainId: SupportedChainId;
  factory: Address;
}) {
  const client = usePublicClient({ chainId });
  const [currency, setCurrency] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["protocol", chainId, "payment-flow", factory],
    enabled: Boolean(client),
    initialPageParam: {
      offset: 0n,
      blockNumber: undefined as bigint | undefined,
    },
    queryFn: ({ pageParam }) =>
      readPaymentFlowPage(client!, chainId, factory, pageParam),
    getNextPageParam: (last) =>
      last.nextOffset === undefined
        ? undefined
        : { offset: last.nextOffset, blockNumber: last.blockNumber },
    refetchInterval: 15_000,
    retry: false,
  });
  const currencies = aggregatePaymentFlow(query.data?.pages ?? []);
  const selected =
    currencies.find((c) => c.token.address.toLowerCase() === currency) ??
    currencies[0];
  const format = (raw: bigint) =>
    selected
      ? `${formatLocalizedTokenAmount({ raw, decimals: selected.token.decimals, multiplier: selected.token.uiMultiplier })} ${selected.token.symbol}`
      : "—";
  const amount = (key: string, raw: bigint) => (
    <StreamingAmount
      identity={`${chainId}:${factory}:${selected?.token.address}:${key}`}
      streams={[]}
      base={raw}
      format={format}
      refresh={() => query.refetch()}
    />
  );
  const flowing = (kind: "earned" | "pending", category?: number, base = 0n) =>
    selected && (
      <StreamingAmount
        identity={`${chainId}:${factory}:${selected.token.address}:${kind}:${category ?? "total"}`}
        streams={[paymentFlowStream(selected, kind, category)]}
        base={base}
        format={format}
        active={!query.isError}
        refresh={() => query.refetch()}
      />
    );
  const partial = query.hasNextPage || (selected && !selected.complete);
  return (
    <section
      className={`protocol-section ${styles.flow}`}
      aria-labelledby="payment-flow-title"
    >
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">Funded by fans</p>
          <h2 id="payment-flow-title" className="font-display">
            Where membership payments go
          </h2>
          <p>
            Membership funding accrues over time. See what’s still accruing,
            earned and paid out.
          </p>
        </div>
        {currencies.length > 1 && (
          <label className={styles.currency}>
            Currency
            <select
              value={selected?.token.address.toLowerCase()}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {currencies.map((c) => (
                <option
                  key={c.token.address}
                  value={c.token.address.toLowerCase()}
                >
                  {c.token.symbol}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {query.isError && (
        <p role="alert">
          Payment totals could not be refreshed.
          {selected ? " Showing the previous snapshot." : ""}{" "}
          <button className="text-button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {query.isPending ? (
        <p role="status">Reading membership payments…</p>
      ) : !selected ? (
        query.isError ? null : (
          <p>No membership payments yet.</p>
        )
      ) : (
        <>
          {partial && (
            <p role="status" className="small-copy">
              Partial totals:{" "}
              {query.hasNextPage
                ? "more memberships remain below."
                : "some membership accounting still needs to catch up."}
            </p>
          )}
          <div className={styles.source}>
            <span>Membership payments received</span>
            <strong>{amount("gross", selected.gross)}</strong>
            {selected.refunded > 0n && (
              <span className="small-copy">
                {amount("refunded", selected.refunded)} refunded
              </span>
            )}
            <p>
              <b>{flowing("pending")}</b> still accruing over membership time
            </p>
          </div>
          <div className={styles.branches} aria-hidden="true">
            <svg viewBox="0 0 1000 64" preserveAspectRatio="none">
              <path d="M500 0 V25 M125 64 V35 Q125 25 135 25 H865 Q875 25 875 35 V64 M375 25 V64 M625 25 V64" />
            </svg>
          </div>
          <div className={styles.destinations}>
            {purposes.map((name, index) => (
              <div className={styles.destination} key={name}>
                <h3>{name}</h3>
                <dl>
                  <div>
                    <dt>
                      {index === 3 ? "Spent on buybacks" : "Total paid out"}
                    </dt>
                    <dd className={styles.paid}>
                      {amount(
                        `paid-${index}`,
                        index === 3
                          ? selected.buybackSpent
                          : selected.paid[index],
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {index === 3
                        ? "Available for buybacks"
                        : "Earned, unclaimed"}
                    </dt>
                    <dd>
                      {flowing(
                        "earned",
                        index,
                        index === 3 ? selected.buybackAvailable : 0n,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Still accruing</dt>
                    <dd>{flowing("pending", index)}</dd>
                  </div>
                </dl>
                {index === 3 && (
                  <a href="#inventory-title" className={styles.continue}>
                    Buybacks & burns ↓
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className={`small-copy ${styles.note}`}>
            Paid out means withdrawn to wallets. Member rewards include earnings
            kept after a membership ends. Currencies are shown separately.
          </p>
        </>
      )}
      {query.hasNextPage && (
        <button
          className="text-button"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Include more memberships
        </button>
      )}
    </section>
  );
}
