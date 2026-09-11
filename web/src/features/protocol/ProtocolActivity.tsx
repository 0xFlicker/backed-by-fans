"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { zeroAddress, type Address, type PublicClient } from "viem";
import { membershipFactoryAbi, membershipTierAbi } from "@/contracts";
import { CopyableAddress } from "@/features/membership/RendererDetails";
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
import { readTierFunding } from "./fee-forecast";
import { readAcceptedPaymentToken } from "@/lib/payment-token-read";
import { formatLocalizedTokenAmount } from "@/lib/token-amount";

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
      {formatLocalizedTokenAmount({ raw, decimals, multiplier })}
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
  if (value === zeroAddress)
    return <span className="small-copy">Native ETH</span>;
  return (
    <CopyableAddress address={value} explorerUrl={explorer} label="Contract" />
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
  const cache = useQueryClient();
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
    state?.status === "valid" && state.data.protocolToken !== zeroAddress
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
    await cache.invalidateQueries({ queryKey: ["protocol", chainId] });
  };
  return (
    <>
      <header className="protocol-heading settle-in">
        <p className="eyebrow">{getSupportedChain(chainId).name}</p>
        <h1>Protocol activity</h1>
        <p>
          Memberships fund the protocol. Earned fees buy and burn its token.
        </p>
        {deployment.status === "ready" && (
          <Burn
            chainId={chainId}
            factory={deployment.factoryAddress}
            symbol={protocolTokenSymbol}
            tokenLaunched={
              state?.status === "valid" &&
              state.data.protocolToken !== zeroAddress
            }
          />
        )}
        <button
          type="button"
          className="text-button"
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
          <details className="technical-details snapshot-details">
            <summary>Updated snapshot</summary>
            <p className="small-copy">
              Snapshot block {state.capturedBlock.toString()} ·{" "}
              {new Date(Number(state.data.timestamp) * 1000)
                .toISOString()
                .replace("T", " ")
                .replace(".000Z", " UTC")}
            </p>
          </details>
          {state.data.protocolToken === zeroAddress && (
            <p className="inline-status" role="status">
              The protocol token is coming soon. Membership fees are
              accumulating.
            </p>
          )}
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
            <p>Available funds, spending and protocol tokens burned.</p>
            {state.data.assets.map((item) =>
              item.status !== "valid" ? (
                <p className="inline-status" key={item.asset}>
                  {item.asset}: {item.label}
                </p>
              ) : (
                <article className="protocol-asset" key={item.asset}>
                  <header>
                    <h3>{item.data.metadata?.symbol ?? "Token"}</h3>
                  </header>
                  {!item.data.conserved && (
                    <p className="inline-status" role="alert">
                      Inventory conservation check failed. Processing is
                      unavailable.
                    </p>
                  )}
                  <dl className="asset-highlights">
                    <div>
                      <dt>Available</dt>
                      <dd>
                        <Amount
                          raw={
                            item.data.membership.available +
                            item.data.donation.available
                          }
                          decimals={item.data.metadata?.decimals ?? 0}
                          multiplier={item.data.metadata?.uiMultiplier}
                          symbol={item.data.metadata?.symbol}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>
                        {item.asset.toLowerCase() ===
                        state.data.protocolToken.toLowerCase()
                          ? "Total burned"
                          : "Spent"}
                      </dt>
                      <dd>
                        <Amount
                          raw={
                            item.asset.toLowerCase() ===
                            state.data.protocolToken.toLowerCase()
                              ? item.data.membership.totalBurned +
                                item.data.donation.totalBurned
                              : item.data.membership.totalSpent +
                                item.data.donation.totalSpent
                          }
                          decimals={item.data.metadata?.decimals ?? 0}
                          multiplier={item.data.metadata?.uiMultiplier}
                          symbol={item.data.metadata?.symbol}
                        />
                      </dd>
                    </div>
                  </dl>
                  <details className="technical-details asset-records">
                    <summary>Balances & actions</summary>
                    <AddressValue value={item.asset} chainId={chainId} />
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
                          )
                            .filter(
                              ([, key]) =>
                                key !== "totalBurned" ||
                                item.asset.toLowerCase() ===
                                  state.data.protocolToken.toLowerCase(),
                            )
                            .map(([label, key]) => (
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
                                            : (item.data.metadata?.decimals ??
                                              0)
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
                              ? item.data.eligibility[bucket].data
                                  .nextEligibleAt
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
                      <summary>Route & raw data</summary>
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
                        {item.data.limits.minInterval.toString()} seconds for
                        this currency; {state.data.globalMinInterval.toString()}{" "}
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
          <details
            className="technical-details protocol-section"
            aria-labelledby="safe-title"
          >
            <summary id="safe-title">Protocol configuration</summary>
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
                {state.data.protocolToken === zeroAddress ? (
                  "Not deployed"
                ) : (
                  <AddressValue
                    value={state.data.protocolToken}
                    chainId={chainId}
                  />
                )}
              </dd>
              <dt>Buyback vault</dt>
              <dd>
                <AddressValue value={state.data.vault} chainId={chainId} />
              </dd>
              <dt>Executor</dt>
              <dd>
                {state.data.executor === zeroAddress ? (
                  "Not deployed"
                ) : (
                  <AddressValue value={state.data.executor} chainId={chainId} />
                )}
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
          </details>
          {state.data.protocolToken !== zeroAddress && (
            <PonsCompensation snapshot={state.data} />
          )}
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
    <details
      className="technical-details protocol-section"
      aria-labelledby="forecast-title"
    >
      <summary id="forecast-title">Membership funding</summary>
      <p>Funding from current memberships, earned as paid time is used.</p>
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
    </details>
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
  const funding = useQuery({
    queryKey: [
      "protocol",
      snapshot.chainId,
      "funding",
      tier,
      blockNumber.toString(),
    ],
    queryFn: () => readTierFunding(client, tier, { blockNumber }),
  });
  if (funding.isError)
    return (
      <p role="alert">
        Membership funding could not be read. Refresh to try again.
      </p>
    );
  if (!funding.data) return <p role="status">Loading membership funding…</p>;
  const current = funding.data;
  const display = (raw: bigint) =>
    token.data ? (
      <span title={`${raw} raw units`}>
        {formatLocalizedTokenAmount({
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
        Earnings through{" "}
        {new Date(
          Number(current.accounting.accountedThrough) * 1000,
        ).toLocaleString()}
        .
        {current.accounting.complete
          ? " Current at this block."
          : " Partial preview. Advance accounting to update the rest."}
      </p>
      <dl className="protocol-ledger">
        <div>
          <dt>Earned and ready to release</dt>
          <dd>{display(current.earnedHeld)}</dd>
        </div>
        <div>
          <dt>Reserved protocol funding</dt>
          <dd>{display(current.reserved)}</dd>
        </div>
      </dl>
      <p className="small-copy">
        Reserved funds earn over time and adjust for refunds.
      </p>
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
    <details
      className="technical-details protocol-section"
      aria-labelledby="history-title"
    >
      <summary id="history-title">Activity history</summary>
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
    </details>
  );
}

function PonsCompensation({ snapshot }: { snapshot: PublicBuybacks }) {
  const pons = snapshot.pons;
  return (
    <details
      className="technical-details protocol-section"
      aria-labelledby="pons-title"
    >
      <summary id="pons-title">Trading fees</summary>
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
            Trading fees follow Pons settings. Its vested tokens are separate
            from membership buybacks and burns.
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
    </details>
  );
}
