"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery, useMutation } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { type Address, type PublicClient } from "viem";
import { membershipFactoryAbi, membershipTierAbi } from "@/contracts";
import { ReadStateView } from "@/components/ReadState";
import { getDeployment, publicConfig } from "@/lib/config";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { ProcessBuyback } from "./ProcessBuyback";
import { Burn } from "./Burn";
import { ReleaseTierFees } from "./ReleaseTierFees";
import {
  readPublicBuybacks,
  readProtocolActivityPage,
  type PublicBuybacks,
} from "./protocol-read";
import {
  readFeeForecastPage,
  reconcileTierFees,
  readNextFeeLotPage,
  forecastMemberFees,
  type MemberFeeProjection,
} from "./fee-forecast";
import { readAcceptedPaymentToken } from "@/lib/payment-token-read";
import { formatRawTokenAmount } from "@/lib/token-amount";

type State = Awaited<ReturnType<typeof readPublicBuybacks>>;
function Amount({
  raw,
  decimals = 18,
  symbol = "",
  multiplier = 10n ** 18n,
}: {
  raw: bigint;
  decimals?: number;
  symbol?: string;
  multiplier?: bigint;
}) {
  return (
    <span title={`${raw} raw units`}>
      {formatRawTokenAmount({ raw, decimals, multiplier })}
      {symbol ? ` ${symbol}` : ""}
    </span>
  );
}
function AddressValue({
  value,
  chainId,
}: {
  value: Address;
  chainId: SupportedChainId;
}) {
  const explorer = getSupportedChain(chainId).blockExplorers?.default.url;
  return explorer ? (
    <a
      className="protocol-address"
      href={`${explorer}/address/${value}`}
      target="_blank"
      rel="noreferrer"
    >
      {value}
    </a>
  ) : (
    <code className="protocol-address">{value}</code>
  );
}

export function ProtocolActivity({
  chainId,
  initialState,
}: {
  chainId: SupportedChainId;
  initialState?: State;
}) {
  const client = usePublicClient({ chainId }),
    deployment = getDeployment(publicConfig, chainId);
  const [assetOffset, setAssetOffset] = useState(0);
  const query = useQuery({
    queryKey: ["protocol", chainId, "snapshot", assetOffset],
    enabled: Boolean(client),
    queryFn: () => readPublicBuybacks(client!, deployment, { assetOffset }),
    initialData: assetOffset === 0 ? initialState : undefined,
    staleTime: 0,
  });
  const state = query.data;
  const protocolAsset =
    state?.status === "valid"
      ? state.data.assets.find(
          (item) =>
            item.asset.toLowerCase() === state.data.protocolToken.toLowerCase(),
        )
      : undefined;
  const protocolTokenSymbol =
    protocolAsset?.status === "valid"
      ? protocolAsset.data.metadata?.symbol
      : undefined;
  const refresh = async () => {
    await query.refetch();
  };
  return (
    <>
      <header className="protocol-heading settle-in">
        <p className="eyebrow">
          Backed By Fans · {getSupportedChain(chainId).name}
        </p>
        <h1>Protocol activity</h1>
        <p>
          Fees earn as membership time is used. Released fees buy and burn the
          protocol token.
        </p>
        {deployment.status === "ready" && (
          <Burn
            chainId={chainId}
            factory={deployment.factoryAddress}
            symbol={protocolTokenSymbol}
          />
        )}
        <button
          type="button"
          className="button button-light"
          onClick={() => void refresh()}
          disabled={query.isFetching}
        >
          Refresh activity
        </button>
      </header>
      {query.isError && (
        <p className="inline-status" role="alert">
          The latest read failed. Displayed amounts are from the previous
          snapshot.
        </p>
      )}
      {!state ? (
        <p role="status">Loading public protocol data…</p>
      ) : state.status !== "valid" ? (
        <ReadStateView state={state} onRetry={() => void refresh()} />
      ) : (
        <>
          <p className="small-copy">
            Snapshot block {state.capturedBlock.toString()} ·{" "}
            {new Date(Number(state.data.timestamp) * 1000)
              .toISOString()
              .replace("T", " ")
              .replace(".000Z", " UTC")}
          </p>
          {state.data.buybacksPaused && (
            <p className="inline-status" role="status">
              The protocol Safe has paused buybacks. Membership time continues
              to earn fees.
            </p>
          )}
          <section
            aria-labelledby="inventory-title"
            className="protocol-section"
          >
            <h2 id="inventory-title">Released fees & burns</h2>
            <p>
              ETH and WETH share one balance and batch settings. Other
              currencies and fee sources stay separate. A conversion moves
              existing fees; it does not create additional revenue.
            </p>
            {state.data.assets.map((item) =>
              item.status !== "valid" ? (
                <p className="inline-status" key={item.asset}>
                  {item.asset}: {item.label}
                </p>
              ) : (
                <article className="protocol-asset" key={item.asset}>
                  <header>
                    <h3>{item.data.metadata?.symbol ?? "Token"}</h3>
                    <AddressValue value={item.asset} chainId={chainId} />
                  </header>
                  {!item.data.conserved && (
                    <p className="inline-status" role="alert">
                      Inventory conservation check failed. Processing is
                      unavailable.
                    </p>
                  )}
                  <div
                    className="protocol-table-scroll"
                    tabIndex={0}
                    aria-label={`${item.data.metadata?.symbol ?? "Token"} inventory`}
                  >
                    <table className="protocol-table">
                      <thead>
                        <tr>
                          <th scope="col">Recorded amount</th>
                          <th scope="col">Membership fees</th>
                          <th scope="col">Donations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            ["Received", "totalReceived"],
                            ["Converted in", "totalConvertedIn"],
                            ["Spent or directly burned", "totalSpent"],
                            ["Available to process", "available"],
                            ["Burned", "totalBurned"],
                          ] as const
                        ).map(([label, key]) => (
                          <tr key={key}>
                            <th scope="row">{label}</th>
                            {[item.data.membership, item.data.donation].map(
                              (bucket, i) => (
                                <td key={i}>
                                  <Amount
                                    raw={bucket[key]}
                                    decimals={
                                      key === "totalBurned"
                                        ? 18
                                        : (item.data.metadata?.decimals ?? 0)
                                    }
                                    multiplier={
                                      key === "totalBurned"
                                        ? 10n ** 18n
                                        : item.data.metadata?.uiMultiplier
                                    }
                                    symbol={
                                      key === "totalBurned"
                                        ? "protocol tokens"
                                        : item.data.metadata
                                          ? ""
                                          : "raw units"
                                    }
                                  />
                                </td>
                              ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="protocol-actions">
                    {([0, 1] as const).map((bucket) => (
                      <ProcessBuyback
                        key={bucket}
                        chainId={chainId}
                        vault={state.data.vault}
                        protocolTokenSymbol={protocolTokenSymbol}
                        asset={item.asset}
                        bucket={bucket}
                        status={
                          item.data.eligibility[bucket].status === "valid"
                            ? item.data.eligibility[bucket].data.status
                            : undefined
                        }
                        amount={
                          item.data.eligibility[bucket].status === "valid"
                            ? item.data.eligibility[bucket].data.maxInput
                            : 0n
                        }
                        nextEligibleAt={
                          item.data.eligibility[bucket]?.status === "valid"
                            ? item.data.eligibility[bucket].data.nextEligibleAt
                            : undefined
                        }
                        fresh={
                          query.isFetchedAfterMount &&
                          !query.isError &&
                          !query.isFetching &&
                          item.data.conserved
                        }
                        onProcessed={refresh}
                      />
                    ))}
                  </div>
                  <details className="technical-details">
                    <summary>Route, batch settings and raw units</summary>
                    <p>
                      Revision {item.data.revision.toString()} ·{" "}
                      {item.data.route.pools.length} conversion pools ·{" "}
                      {item.data.paused ? "Asset paused" : "Asset unpaused"}
                    </p>
                    <p>
                      Batch minimum{" "}
                      <Amount
                        raw={item.data.limits.minInput}
                        decimals={item.data.metadata?.decimals}
                        symbol={item.data.metadata?.symbol}
                        multiplier={item.data.metadata?.uiMultiplier}
                      />{" "}
                      · Maximum{" "}
                      <Amount
                        raw={item.data.limits.maxInput}
                        decimals={item.data.metadata?.decimals}
                        symbol={item.data.metadata?.symbol}
                        multiplier={item.data.metadata?.uiMultiplier}
                      />
                    </p>
                    <p>
                      Minimum interval:{" "}
                      {item.data.limits.minInterval.toString()} seconds for this
                      currency; {state.data.globalMinInterval.toString()}{" "}
                      seconds across the protocol.
                    </p>
                    <pre>
                      {JSON.stringify(
                        {
                          route: item.data.route,
                          membership: item.data.membership,
                          donation: item.data.donation,
                        },
                        (_, v) => (typeof v === "bigint" ? v.toString() : v),
                        2,
                      )}
                    </pre>
                  </details>
                </article>
              ),
            )}
            {assetOffset > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() => setAssetOffset(Math.max(0, assetOffset - 100))}
              >
                Previous assets
              </button>
            )}
            {state.data.assetCoverage.nextOffset !== null && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setAssetOffset(state.data.assetCoverage.nextOffset!)
                }
              >
                Next assets
              </button>
            )}
          </section>
          {client && (
            <TierForecasts
              client={client}
              snapshot={state.data}
              blockNumber={state.capturedBlock}
            />
          )}
          {client && (
            <ActivityHistory
              client={client}
              snapshot={state.data}
              blockNumber={state.capturedBlock}
            />
          )}
          <section className="protocol-section" aria-labelledby="safe-title">
            <h2 id="safe-title">Protocol configuration</h2>
            <p>
              The protocol Safe can onboard payment tokens, configure routes and
              standing batch sizes and cooldowns, and pause buybacks. It cannot
              withdraw fee inventory, replace the protocol token, or accelerate
              earning.
            </p>
            <p>
              <a href="/tools/buybacks">
                Calculate and configure buyback settings
              </a>
            </p>
            <dl className="protocol-identities">
              <dt>Protocol Safe</dt>
              <dd>
                <AddressValue value={state.data.safe} chainId={chainId} />
              </dd>
              <dt>Approval threshold</dt>
              <dd>
                {state.data.threshold.toString()} of {state.data.owners.length}{" "}
                owners
              </dd>
              <dt>Protocol token</dt>
              <dd>
                <AddressValue
                  value={state.data.protocolToken}
                  chainId={chainId}
                />
              </dd>
              <dt>Buyback vault</dt>
              <dd>
                <AddressValue value={state.data.vault} chainId={chainId} />
              </dd>
              <dt>Executor</dt>
              <dd>
                <AddressValue value={state.data.executor} chainId={chainId} />
              </dd>
            </dl>
            <details>
              <summary>Safe owners</summary>
              <ul>
                {state.data.owners.map((owner) => (
                  <li key={owner}>
                    <AddressValue value={owner} chainId={chainId} />
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <PonsCompensation snapshot={state.data} />
        </>
      )}
    </>
  );
}

function TierForecasts({
  client,
  snapshot,
  blockNumber,
}: {
  client: PublicClient;
  snapshot: PublicBuybacks;
  blockNumber: bigint;
}) {
  const [tierOffset, setTierOffset] = useState(0n),
    [selected, setSelected] = useState<Address>();
  const tiers = useQuery({
    queryKey: [
      "protocol",
      snapshot.chainId,
      "tiers",
      blockNumber.toString(),
      tierOffset.toString(),
    ],
    queryFn: async () => {
      const addresses = await client.readContract({
        address: snapshot.factory,
        abi: membershipFactoryAbi,
        functionName: "tiers",
        args: [tierOffset, 100n],
        blockNumber,
      });
      return Promise.all(
        addresses.map(async (address) => ({
          address,
          name: await client.readContract({
            address,
            abi: membershipTierAbi,
            functionName: "name",
            blockNumber,
          }),
        })),
      );
    },
  });
  const tier = selected ?? tiers.data?.[0]?.address;
  return (
    <section className="protocol-section" aria-labelledby="forecast-title">
      <h2 id="forecast-title">Fees earning over time</h2>
      <p>
        Existing paid memberships only. Future refunds reduce these estimates.
        Gas, liquidity, routes and standing batch settings determine when
        released fees can buy tokens.
      </p>
      {tiers.isError ? (
        <p className="inline-status">Tier discovery is unavailable.</p>
      ) : tiers.isPending ? (
        <p role="status">Loading tiers…</p>
      ) : tiers.data.length === 0 ? (
        <p>No creator tiers in this page.</p>
      ) : (
        <>
          <label className="protocol-tier-picker">
            Creator tier
            <select
              value={tier}
              onChange={(e) => setSelected(e.target.value as Address)}
            >
              {tiers.data.map((item) => (
                <option key={item.address} value={item.address}>
                  {item.name} · {item.address.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          {tier && (
            <ReleaseTierFees
              key={tier}
              chainId={snapshot.chainId}
              tier={tier}
              blockNumber={blockNumber}
            />
          )}
          {tier && (
            <TierForecast
              key={`${snapshot.chainId}:${tier}:${blockNumber}`}
              client={client}
              tier={tier}
              blockNumber={blockNumber}
              snapshot={snapshot}
            />
          )}
        </>
      )}
      <div className="creator-actions">
        {tierOffset > 0n && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSelected(undefined);
              setTierOffset(tierOffset - 100n);
            }}
          >
            Previous tiers
          </button>
        )}
        {tierOffset + 100n < snapshot.tierCount && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setSelected(undefined);
              setTierOffset(tierOffset + 100n);
            }}
          >
            Next tiers
          </button>
        )}
      </div>
    </section>
  );
}

function TierForecast({
  client,
  tier,
  blockNumber,
  snapshot,
}: {
  client: PublicClient;
  tier: Address;
  blockNumber: bigint;
  snapshot: PublicBuybacks;
}) {
  const [lotMembers, setLotMembers] = useState<
    Record<string, MemberFeeProjection>
  >({});
  const moreLots = useMutation({
    retry: false,
    mutationFn: (member: MemberFeeProjection) =>
      readNextFeeLotPage(client, tier, blockNumber, member),
    onSuccess: (member) =>
      setLotMembers((previous) => ({
        ...previous,
        [member.id.toString()]: member,
      })),
  });
  const token = useQuery({
    queryKey: [
      "protocol",
      snapshot.chainId,
      "forecast-token",
      tier,
      blockNumber.toString(),
    ],
    queryFn: async () => {
      const address = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "paymentToken",
        blockNumber,
      });
      return readAcceptedPaymentToken(client, {
        chainId: snapshot.chainId,
        factory: snapshot.factory,
        address,
        registryIndex: snapshot.paymentTokens.findIndex(
          (item) => item.toLowerCase() === address.toLowerCase(),
        ),
        blockNumber,
      });
    },
  });
  const pages = useInfiniteQuery({
    queryKey: [
      "protocol",
      snapshot.chainId,
      "forecast",
      tier,
      blockNumber.toString(),
    ],
    initialPageParam: 0n,
    queryFn: ({ pageParam }) =>
      readFeeForecastPage(client, tier, { blockNumber, offset: pageParam }),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  if (pages.isError)
    return (
      <p className="inline-status">
        Fee schedules are unavailable. No zero forecast was assumed.
      </p>
    );
  if (!pages.data) return <p role="status">Loading fee schedules…</p>;
  const first = pages.data.pages[0],
    members = pages.data.pages
      .flatMap((page) => page.members)
      .map((member) => lotMembers[member.id.toString()] ?? member);
  const reconciliation = reconcileTierFees(first.ledger, { ...first, members });
  const sum = (key: "next24h" | "next7d" | "next30d") =>
    members.reduce(
      (total, member) => total + forecastMemberFees(member)[key],
      0n,
    );
  const pendingLots = members.find((member) => !member.completeLots);
  const display = (raw: bigint | null) =>
    raw === null ? (
      "Partial coverage"
    ) : token.data ? (
      <span title={`${raw} raw units`}>
        {formatRawTokenAmount({
          raw,
          decimals: token.data.decimals,
          multiplier: token.data.uiMultiplier,
        })}{" "}
        {token.data.symbol}
      </span>
    ) : (
      `${raw} raw units`
    );
  return (
    <div className="protocol-forecast">
      <p className="small-copy">
        {members.length} of {first.totalMembers.toString()} historical
        memberships ·{" "}
        {members.every((m) => m.completeLots)
          ? "All loaded fee lots"
          : "Partial lot coverage"}{" "}
        · Block {blockNumber.toString()}
      </p>
      {!reconciliation.storedConserved && (
        <p role="alert">Stored fee reconciliation failed.</p>
      )}
      {reconciliation.projectedConserved === false && (
        <p role="alert">Projected fee reconciliation failed.</p>
      )}
      <dl className="protocol-ledger">
        <div>
          <dt>Allocated fees</dt>
          <dd>{display(first.ledger.allocated)}</dd>
        </div>
        <div>
          <dt>Protected holdings</dt>
          <dd>{display(first.ledger.holdings)}</dd>
        </div>
        <div>
          <dt>Unearned reserve</dt>
          <dd>{display(reconciliation.unearned)}</dd>
        </div>
        <div>
          <dt>Earned awaiting release</dt>
          <dd>{display(reconciliation.earnedAwaitingRelease)}</dd>
        </div>
        <div>
          <dt>Immediately releasable</dt>
          <dd>{display(reconciliation.immediatelyReleasable)}</dd>
        </div>
        <div>
          <dt>Released</dt>
          <dd>{display(first.ledger.released)}</dd>
        </div>
        <div>
          <dt>Refunded from fee reserve</dt>
          <dd>{display(first.ledger.refunded)}</dd>
        </div>
      </dl>
      <p className="small-copy">
        {token.data ? (
          <>
            Payment token:{" "}
            <AddressValue
              value={token.data.address}
              chainId={snapshot.chainId}
            />
            . Display scaling is captured at the same block; exact raw units are
            available on each amount.
          </>
        ) : (
          "Payment token display data is unavailable; amounts use raw units."
        )}
      </p>
      <dl className="protocol-forecast-horizons">
        <div>
          <dt>Next 24 hours</dt>
          <dd>{display(sum("next24h"))}</dd>
        </div>
        <div>
          <dt>Next 7 days</dt>
          <dd>{display(sum("next7d"))}</dd>
        </div>
        <div>
          <dt>Next 30 days</dt>
          <dd>{display(sum("next30d"))}</dd>
        </div>
      </dl>
      <p>
        {reconciliation.complete && members.every((m) => m.completeLots)
          ? "Complete coverage of existing paid schedules."
          : "Partial forecast: only loaded members and fee lots are included."}{" "}
        These are estimated earnings, not scheduled or guaranteed buybacks.
      </p>
      {moreLots.isError && (
        <p role="alert">
          Additional fee lots are unavailable. The forecast remains partial.
        </p>
      )}
      {pendingLots && (
        <button
          type="button"
          className="button button-light"
          disabled={moreLots.isPending}
          onClick={() => moreLots.mutate(pendingLots)}
        >
          Load next 100 fee lots for membership #{pendingLots.id.toString()}
        </button>
      )}
      {pages.hasNextPage && (
        <button
          type="button"
          className="button button-light"
          disabled={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
        >
          Load next 100 memberships
        </button>
      )}
    </div>
  );
}

function ActivityHistory({
  client,
  snapshot,
  blockNumber,
}: {
  client: PublicClient;
  snapshot: PublicBuybacks;
  blockNumber: bigint;
}) {
  const history = useInfiniteQuery({
    queryKey: [
      "protocol",
      snapshot.chainId,
      "history",
      snapshot.vault,
      blockNumber.toString(),
    ],
    initialPageParam: { toBlock: blockNumber } as {
      toBlock: bigint;
      beforeLogIndex?: number;
    },
    queryFn: ({ pageParam }) =>
      readProtocolActivityPage(client, {
        factory: snapshot.factory,
        vault: snapshot.vault,
        fromBlock: 0n,
        limit: 10,
        ...pageParam,
      }),
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const explorer = getSupportedChain(snapshot.chainId).blockExplorers?.default
    .url;
  const rows = history.data?.pages.flatMap((page) => page.rows) ?? [];
  return (
    <section className="protocol-section" aria-labelledby="history-title">
      <h2 id="history-title">Activity & configuration history</h2>
      <p>
        Fee releases, donations, conversions, burns and Safe changes. Pons
        trading compensation has its own ledger below.
      </p>
      {history.isError && (
        <p role="alert" className="inline-status">
          Activity history is unavailable.
        </p>
      )}
      {history.isPending ? (
        <p role="status">Loading history…</p>
      ) : rows.length === 0 ? (
        <p>No events in the loaded range.</p>
      ) : (
        <ol className="protocol-history">
          {rows.map((row) => (
            <li key={`${row.transactionHash}:${row.logIndex}`}>
              <strong>
                {row.eventName.replace(/([a-z])([A-Z])/g, "$1 $2")}
              </strong>
              <span>Block {row.blockNumber.toString()}</span>
              {explorer ? (
                <a
                  href={`${explorer}/tx/${row.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Transaction
                </a>
              ) : (
                <code>{row.transactionHash}</code>
              )}
              <details>
                <summary>Amounts & details</summary>
                <pre>
                  {JSON.stringify(
                    row.args,
                    (_, v) => (typeof v === "bigint" ? v.toString() : v),
                    2,
                  )}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      )}
      {history.data && (
        <p className="small-copy">
          {rows.length} events loaded in bounded windows. Earlier activity is{" "}
          {history.hasNextPage
            ? "not yet loaded"
            : "fully traversed to the start of the requested range"}
          .
        </p>
      )}
      {history.hasNextPage && (
        <button
          type="button"
          className="button button-light"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          Load earlier activity
        </button>
      )}
    </section>
  );
}

function PonsCompensation({ snapshot }: { snapshot: PublicBuybacks }) {
  const pons = snapshot.pons;
  return (
    <section className="protocol-section" aria-labelledby="pons-title">
      <h2 id="pons-title">Pons trading compensation</h2>
      <p>
        Ordinary Pons trading fees can pay the developer and fund Pons’s vested
        buybacks. Membership-fee purchases burn immediately and never enter that
        vesting balance.
      </p>
      {pons.status !== "valid" ? (
        <p className="inline-status">
          Pons data is unavailable. Membership inventory above remains
          independently visible.
        </p>
      ) : (
        <>
          <p>
            Launch phase:{" "}
            {pons.data.phase === 0 && pons.data.curveReady
              ? "Graduation ready — awaiting public completion"
              : ([
                  "Bonding curve",
                  "Graduation pending — pool not created",
                  "Graduated pool",
                  "External rescue",
                ][pons.data.phase] ?? "Unknown")}
            . Vested buybacks{" "}
            {pons.data.buybackEnabled ? "enabled" : "disabled"}.
          </p>
          <dl className="protocol-ledger">
            <div>
              <dt>Curve trading fees pending (ETH)</dt>
              <dd>
                <Amount raw={pons.data.bondingPending.tradingFees} />
              </dd>
            </div>
            <div>
              <dt>Curve buyback earmark (ETH)</dt>
              <dd>
                <Amount raw={pons.data.bondingPending.buybackEarmark} />
              </dd>
            </div>
            <div>
              <dt>Tokens deposited into vesting</dt>
              <dd>
                <Amount raw={pons.data.vesting.deposited} />
              </dd>
            </div>
            <div>
              <dt>Tokens released from vesting</dt>
              <dd>
                <Amount raw={pons.data.vesting.released} />
              </dd>
            </div>
            <div>
              <dt>Tokens still unvested</dt>
              <dd>
                <Amount raw={pons.data.vesting.unvested} />
              </dd>
            </div>
            <div>
              <dt>Vested tokens available to release</dt>
              <dd>
                <Amount raw={pons.data.vesting.releasable} />
              </dd>
            </div>
          </dl>
          <p>
            Vesting is not a burn. External administrators can change Pons
            configuration and redirect creator compensation under Pons’s rules;
            some fee conversions require its operator. Payment-token issuers can
            restrict transfers. These dependencies can leave buybacks pending.
          </p>
          <details>
            <summary>External roles and shared compensation balances</summary>
            <p>
              <a href="/tools/buybacks">
                Calculate and configure buyback settings
              </a>
            </p>
            <dl className="protocol-identities">
              <dt>Pons administrator</dt>
              <dd>
                <AddressValue
                  value={pons.data.externalOwner}
                  chainId={snapshot.chainId}
                />
              </dd>
              <dt>Fee conversion operator</dt>
              <dd>
                <AddressValue
                  value={pons.data.sweepOperator}
                  chainId={snapshot.chainId}
                />
              </dd>
              <dt>Creator recipient</dt>
              <dd>
                <AddressValue
                  value={pons.data.creator}
                  chainId={snapshot.chainId}
                />
              </dd>
            </dl>
            <p>
              Shared creator escrow:{" "}
              <Amount raw={pons.data.creatorEscrow.nativeETH} symbol="ETH" />{" "}
              and <Amount raw={pons.data.creatorEscrow.protocolTokens} />{" "}
              protocol tokens. The ETH balance can include other launches.
            </p>
            <pre>
              {JSON.stringify(
                {
                  poolPending: pons.data.poolPending,
                  vesting: pons.data.vesting,
                  pendingRecipientOverride: pons.data.pendingRecipientOverride,
                },
                (_, v) => (typeof v === "bigint" ? v.toString() : v),
                2,
              )}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
