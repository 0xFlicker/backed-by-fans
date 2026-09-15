"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import {
  useAccount,
  useConfig,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import {
  SafeProvider,
  generateEIP712Signature,
} from "@safe-global/protocol-kit";
import {
  encodeFunctionData,
  formatUnits,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  iSafeAbi,
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";
import { WalletControl } from "@/components/WalletControl";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import { formatRawTokenAmount } from "@/lib/token-amount";
import { readCalculator, estimateAsset } from "@/lib/buyback-settings/read";
import {
  draftLimits,
  intervalSeconds,
  recommendLimits,
  type LimitDraft,
} from "@/lib/buyback-settings/calculator";
import { decodeTransactionError } from "@/lib/transaction-state";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { buybackStatusLabels } from "@/features/protocol/ProcessBuyback";
import {
  addOwnerSignatures,
  settingsSafeTransaction,
  readSafeApproval,
  safeExecutionArgs,
  validateSignatureFile,
  verifySettingsReceipt,
  type SettingsSafePayload,
  type SignatureFile,
} from "./safe-settings";
import styles from "./PolicyReview.module.css";
import { OperatorBuyback } from "./OperatorBuyback";

type Snapshot = Awaited<ReturnType<typeof readCalculator>>;
type Rehearsal = {
  summary: string;
  capturedBlock: string;
  simulatedUntil: string;
  truncated: boolean;
  totals: { burnedRaw: string; gasWei: string; batches: number };
  rows: {
    asset: Address;
    inputRaw: string;
    burnedRaw: string;
    gasWei: string;
    status: string;
    note: string;
    estimate?: { inputRaw: string; nativeValueWei: string; gasWei: string };
  }[];
};
const fullAmount = (raw: bigint, decimals: number, multiplier: bigint) =>
  formatUnits(raw * multiplier, decimals + 18);

export function BuybackSettings({ chainId }: { chainId: SupportedChainId }) {
  return (
    <>
      <header className="protocol-heading">
        <p className="eyebrow">Protocol operations</p>
        <h1>Manage buybacks</h1>
        <p>
          Submit operator purchases or configure public buyback settings through
          your Safe.
        </p>
        <WalletControl />
      </header>
      <LoadSettings key={chainId} chainId={chainId} />
    </>
  );
}
function LoadSettings({ chainId }: { chainId: SupportedChainId }) {
  const client = usePublicClient({ chainId });
  const query = useQuery({
    queryKey: ["protocol", chainId, "calculator"],
    enabled: Boolean(client),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: () =>
      readCalculator(
        client! as PublicClient,
        getDeployment(publicConfig, chainId),
      ),
  });
  return (
    <>
      {query.isPending && (
        <p role="status">
          Reading vault funds, membership earnings and current settings…
        </p>
      )}
      {query.error && <p role="alert">{decodeTransactionError(query.error)}</p>}
      {!query.data && (
        <button
          type="button"
          className="button button-light"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry
        </button>
      )}
      {query.data && (
        <button
          type="button"
          className="text-button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing funds…" : "Refresh funds"}
        </button>
      )}
      {query.data &&
        (query.data.data.executionMode === 0 ? (
          <>
            <OperatorBuyback
              chainId={chainId}
              snapshot={query.data.data}
              fees={query.data.fees}
              releaseTiers={query.data.releaseTiers}
            />
            <details>
              <summary>Permissionless buyback settings</summary>
              <p>
                These settings govern public execution only. Saving them does
                not change execution mode.
              </p>
              <SettingsEditor
                key={`${query.data.capturedBlock}-${query.data.data.vault}`}
                chainId={chainId}
                snapshot={query.data}
                refresh={() => query.refetch()}
              />
            </details>
          </>
        ) : (
          <SettingsEditor
            key={`${query.data.capturedBlock}-${query.data.data.vault}`}
            chainId={chainId}
            snapshot={query.data}
            refresh={() => query.refetch()}
          />
        ))}
    </>
  );
}
function SettingsEditor({
  chainId,
  snapshot,
  refresh,
}: {
  chainId: SupportedChainId;
  snapshot: Snapshot;
  refresh: () => Promise<unknown>;
}) {
  const client = usePublicClient({ chainId });
  const [targetPercent, setTarget] = useState(100);
  const [horizonHours, setHorizon] = useState(24);
  const [preferredBatches, setBatches] = useState(4);
  const [maxGasPercent, setGas] = useState(2.5);
  const [globalMinutes, setGlobal] = useState(
    (Number(snapshot.data.globalMinInterval) / 60).toString(),
  );
  const assets = snapshot.data.assets.filter(
    (item) =>
      item.status === "valid" &&
      (snapshot.data.protocolToken === zeroAddress ||
        item.asset.toLowerCase() !== snapshot.data.protocolToken.toLowerCase()),
  );
  const [drafts, setDrafts] = useState<Record<string, LimitDraft>>(() =>
    Object.fromEntries(
      assets.flatMap((item) => {
        if (item.status !== "valid" || !item.data.metadata) return [];
        const m = item.data.metadata;
        return [
          [
            item.asset,
            {
              asset: item.asset,
              minimum: fullAmount(
                item.data.limits.minInput,
                m.decimals,
                m.uiMultiplier,
              ),
              maximum: fullAmount(
                item.data.limits.maxInput,
                m.decimals,
                m.uiMultiplier,
              ),
              intervalMinutes: (
                Number(item.data.limits.minInterval) / 60
              ).toString(),
              decimals: m.decimals,
              multiplier: m.uiMultiplier,
            },
          ],
        ];
      }),
    ),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<{
    data: Hex;
    rows: LimitDraft[];
    globalMinutes: string;
  }>();
  const [inputError, setInputError] = useState<string>();
  const estimates = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!client) throw new Error("The network is unavailable.");
      const results = await Promise.all(
        assets.map(async (item) => {
          if (item.status !== "valid")
            return [item.asset, { error: item.label }] as const;
          const available =
            item.data.membership.available +
            item.data.donation.available +
            (snapshot.fees.get(item.asset.toLowerCase())?.earned ?? 0n);
          try {
            return [
              item.asset,
              {
                quote: await estimateAsset(
                  client as PublicClient,
                  snapshot.data,
                  item,
                  snapshot.capturedBlock,
                  available,
                ),
              },
            ] as const;
          } catch (error) {
            return [
              item.asset,
              { error: decodeTransactionError(error) },
            ] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
  });
  const request = () => {
    if (
      !selected.length &&
      globalMinutes ===
        (Number(snapshot.data.globalMinInterval) / 60).toString()
    )
      throw new Error(
        "Select currencies to update, or change the global interval.",
      );
    if (selected.length > 32)
      throw new Error("Save up to 32 currencies in one Safe transaction.");
    const rows = selected
      .map((asset) => drafts[asset])
      .sort((a, b) =>
        a.asset.toLowerCase().localeCompare(b.asset.toLowerCase()),
      );
    const limits = rows.map(draftLimits);
    const globalMinInterval = intervalSeconds(globalMinutes);
    return {
      rows,
      limits,
      globalMinInterval,
      data: encodeFunctionData({
        abi: protocolBuybackVaultAbi,
        functionName: "setExecutionLimits",
        args: [globalMinInterval, rows.map((row) => row.asset), limits],
      }),
    };
  };
  const rehearsal = useMutation({
    retry: false,
    mutationFn: async () => {
      const current = request();
      if (!client)
        throw new Error("Network connection is unavailable. Try again.");
      const capturedBlock = await client.getBlockNumber({ cacheTime: 0 });
      const response = await fetch("/api/local/buybacks/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          action: "limits-only",
          factory: snapshot.data.factory,
          vault: snapshot.data.vault,
          capturedBlock: capturedBlock.toString(),
          globalMinInterval: current.globalMinInterval.toString(),
          assets: current.rows.map((row, i) => ({
            asset: row.asset,
            minInput: current.limits[i].minInput.toString(),
            maxInput: current.limits[i].maxInput.toString(),
            minInterval: current.limits[i].minInterval.toString(),
          })),
          targetPercent,
          horizonHours,
          maxGasPercent,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "The local rehearsal failed.");
      return { report: result as Rehearsal };
    },
  });
  const priceFor = (asset: string) => {
    const measured = rehearsal.data?.report.rows
      .filter((row) => row.asset.toLowerCase() === asset.toLowerCase())
      .flatMap((row) =>
        row.estimate
          ? [
              {
                amount: BigInt(row.estimate.inputRaw),
                nativeValueWei: BigInt(row.estimate.nativeValueWei),
                gasWei: BigInt(row.estimate.gasWei),
              },
            ]
          : [],
      )
      .filter((quote) => quote.amount > 0n && quote.nativeValueWei > 0n);
    // Use the most expensive measured gas-to-input ratio when several buys were tested.
    if (measured?.length)
      return measured.reduce((worst, quote) =>
        quote.gasWei * quote.amount * worst.nativeValueWei >
        worst.gasWei * worst.amount * quote.nativeValueWei
          ? quote
          : worst,
      );
    const estimate = estimates.data?.[asset];
    return estimate && "quote" in estimate ? estimate.quote : undefined;
  };
  const recommendationFor = (asset: (typeof assets)[number]) => {
    if (asset.status !== "valid") throw new Error("Currency unavailable.");
    const price = priceFor(asset.asset);
    return recommendLimits({
      available:
        asset.data.membership.available +
        asset.data.donation.available +
        (snapshot.fees.get(asset.asset.toLowerCase())?.earned ?? 0n),
      targetPercent,
      horizonHours,
      preferredBatches,
      maxGasPercent,
      gasWei: price?.gasWei,
      nativeValueWei: price?.nativeValueWei,
      quotedAmount: price?.amount,
    });
  };
  const applyRecommendation = (
    asset: string,
    recommendation: ReturnType<typeof recommendLimits>,
  ) => {
    if (recommendation.status === "defer") return;
    const row = drafts[asset];
    setDrafts((old) => ({
      ...old,
      [asset]: {
        ...row,
        minimum: fullAmount(
          recommendation.limits.minInput,
          row.decimals,
          row.multiplier,
        ),
        maximum: fullAmount(
          recommendation.limits.maxInput,
          row.decimals,
          row.multiplier,
        ),
        intervalMinutes: (
          Number(recommendation.limits.minInterval) / 60
        ).toString(),
      },
    }));
    setSelected((old) => (old.includes(asset) ? old : [...old, asset]));
    setInputError(undefined);
    rehearsal.reset();
  };
  const applyAll = () => {
    try {
      const next = { ...drafts };
      const picked: string[] = [];
      for (const item of assets) {
        if (item.status !== "valid" || !item.data.metadata || !next[item.asset])
          continue;
        const result = recommendationFor(item);
        if (result.status === "defer") continue;
        const m = item.data.metadata;
        next[item.asset] = {
          ...next[item.asset],
          minimum: fullAmount(
            result.limits.minInput,
            m.decimals,
            m.uiMultiplier,
          ),
          maximum: fullAmount(
            result.limits.maxInput,
            m.decimals,
            m.uiMultiplier,
          ),
          intervalMinutes: (Number(result.limits.minInterval) / 60).toString(),
        };
        picked.push(item.asset);
      }
      setDrafts(next);
      setSelected(picked);
      rehearsal.reset();
      setInputError(
        picked.length
          ? undefined
          : "No currencies currently have economical funds to schedule.",
      );
    } catch (error) {
      setInputError(decodeTransactionError(error));
    }
  };
  const busy = rehearsal.isPending || Boolean(review);
  const change = (
    asset: string,
    field: keyof Pick<LimitDraft, "minimum" | "maximum" | "intervalMinutes">,
    value: string,
  ) => {
    rehearsal.reset();
    setDrafts((current) => ({
      ...current,
      [asset]: { ...current[asset], [field]: value },
    }));
    setInputError(undefined);
  };
  return (
    <>
      <p className="small-copy">
        {getSupportedChain(chainId).name} · Snapshot block{" "}
        {snapshot.capturedBlock.toString()}. ETH and WETH share one currency.
        {snapshot.data.executionMode === 0
          ? " Market purchases are controlled by the trusted operator using off-chain policy. Public settings below do not govern those purchases."
          : " Anyone may execute purchases within the public route and price limits. Policies without expiry remain in force until changed."}
      </p>
      <button
        type="button"
        className="button button-light"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh funds and discard unsaved suggestions
      </button>
      <section className="protocol-section" aria-label="Buyback planning">
        <h2>Choose a pace</h2>
        <p>
          These targets help calculate limits. They do not create a spending
          period, expiry or new approval requirement.
        </p>
        <fieldset disabled={busy} className={styles.controls}>
          <label>
            Spend % of currently earned funds
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={targetPercent}
              onChange={(e) => {
                setTarget(Number(e.target.value));
                rehearsal.reset();
              }}
            />
          </label>
          <label>
            Over hours
            <input
              type="number"
              min="1"
              max="720"
              value={horizonHours}
              onChange={(e) => {
                setHorizon(Number(e.target.value));
                rehearsal.reset();
              }}
            />
          </label>
          <label>
            Preferred purchases per currency
            <input
              type="number"
              min="1"
              max="64"
              value={preferredBatches}
              onChange={(e) => {
                setBatches(Number(e.target.value));
                rehearsal.reset();
              }}
            />
          </label>
          <label>
            Maximum gas % of purchase value
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.1"
              value={maxGasPercent}
              onChange={(e) => {
                setGas(Number(e.target.value));
                rehearsal.reset();
              }}
            />
          </label>
          <label>
            Minimum minutes between any two buys
            <input
              type="number"
              min="0"
              step="any"
              value={globalMinutes}
              onChange={(e) => {
                setGlobal(e.target.value);
                rehearsal.reset();
              }}
            />
          </label>
        </fieldset>
        <p className="small-copy">
          The calculator reduces purchase counts when gas is expensive.
          Unreleased earned fees are included; future membership fees are shown
          separately. Global spacing applies across every currency and both fee
          sources.
        </p>
        <button
          type="button"
          className="button button-light"
          disabled={busy || estimates.isPending}
          onClick={() => estimates.mutate()}
        >
          {estimates.isPending ? "Estimating…" : "Estimate all currencies"}
        </button>
        <button
          type="button"
          className="button button-light"
          disabled={busy || estimates.isPending}
          onClick={applyAll}
        >
          Apply calculated sizes across currencies
        </button>
        {estimates.error && (
          <p role="alert">{decodeTransactionError(estimates.error)}</p>
        )}
      </section>
      <section className="protocol-section" aria-label="Currency settings">
        <h2>Set sensible batches</h2>
        <p>
          Select the currencies you want to update. Publishing saves only the
          selected rows and the global interval.
        </p>
        {snapshot.data.assets
          .filter((item) => item.status !== "valid")
          .map((item) => (
            <p key={item.asset} role="alert">
              {item.asset}: {item.label}
            </p>
          ))}
        {assets.map((item) => {
          if (item.status !== "valid") return null;
          const row = drafts[item.asset],
            metadata = item.data.metadata;
          if (!row || !metadata)
            return (
              <p role="alert" key={item.asset}>
                Token display information unavailable for {item.asset}. This
                currency cannot be edited.
              </p>
            );
          const fees = snapshot.fees.get(item.asset.toLowerCase());
          const released =
            item.data.membership.available + item.data.donation.available;
          const estimate = estimates.data?.[item.asset];
          const quote =
            estimate && "quote" in estimate ? estimate.quote : undefined;
          let recommendation: ReturnType<typeof recommendLimits> | undefined;
          let recommendationError: string | undefined;
          try {
            recommendation = recommendationFor(item);
          } catch (error) {
            recommendationError = decodeTransactionError(error);
          }
          const amount = (raw: bigint) =>
            `${formatRawTokenAmount({ raw, decimals: metadata.decimals, multiplier: metadata.uiMultiplier })} ${metadata.symbol}`;
          const status = item.data.eligibility[0];
          return (
            <article className={styles.currency} key={item.asset}>
              <div className={styles.currencyHeading}>
                <h3>
                  {metadata.symbol}
                  {item.asset === zeroAddress ? " · ETH + WETH" : ""}
                </h3>
                <label>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={selected.includes(item.asset)}
                    onChange={(e) => {
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, item.asset]
                          : old.filter((a) => a !== item.asset),
                      );
                      rehearsal.reset();
                    }}
                  />{" "}
                  Update this currency
                </label>
              </div>
              <dl className={styles.summary}>
                <div>
                  <dt>Released funds</dt>
                  <dd>{amount(released)}</dd>
                </div>
                <div>
                  <dt>
                    Earned, awaiting release
                    {fees?.previewComplete === false ? " · partial" : ""}
                  </dt>
                  <dd>{amount(fees?.earned ?? 0n)}</dd>
                </div>
                <div>
                  <dt>
                    {fees?.previewComplete === false
                      ? "Reserved funding · includes unprocessed time"
                      : "Future membership fees"}
                  </dt>
                  <dd>{amount((fees?.reservedScaled ?? 0n) / (1n << 128n))}</dd>
                </div>
                <div>
                  <dt>Membership accounting</dt>
                  <dd>
                    {!fees
                      ? "No membership funding"
                      : !fees.previewComplete
                        ? "Preview incomplete. Calculations use the earnings shown; advance accounting and refresh to include the rest."
                        : fees.checkpointsDue
                          ? "Checkpoints are due. Advance accounting to catch up."
                          : "No checkpoints are due."}
                  </dd>
                </div>
                <div>
                  <dt>Membership buyback</dt>
                  <dd>
                    {status.status === "valid"
                      ? buybackStatusLabels[status.data.status]
                      : status.label}
                    {status.status === "valid" && status.data.status === 6
                      ? ` · ${new Date(Number(status.data.nextEligibleAt) * 1000).toLocaleString()}`
                      : ""}
                  </dd>
                </div>
              </dl>
              <fieldset disabled={busy} className={styles.controls}>
                <label>
                  Minimum batch · {metadata.symbol}
                  <input
                    inputMode="decimal"
                    value={row.minimum}
                    onChange={(e) =>
                      change(item.asset, "minimum", e.target.value)
                    }
                  />
                </label>
                <label>
                  Maximum batch · {metadata.symbol}
                  <input
                    inputMode="decimal"
                    value={row.maximum}
                    onChange={(e) =>
                      change(item.asset, "maximum", e.target.value)
                    }
                  />
                </label>
                <label>
                  Minimum minutes between {metadata.symbol} buys
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.intervalMinutes}
                    onChange={(e) =>
                      change(item.asset, "intervalMinutes", e.target.value)
                    }
                  />
                </label>
              </fieldset>
              {quote && (
                <p>
                  Quoting all currently earned funds: approximately{" "}
                  {formatUnits(quote.burned, 18)} protocol tokens.{" "}
                  {quote.gasWei !== undefined && (
                    <>
                      Estimated gas per current eligible buy:{" "}
                      {formatUnits(quote.gasWei, 18)} ETH.{" "}
                    </>
                  )}
                  {quote.gasNote}
                </p>
              )}
              {estimate && "error" in estimate && (
                <p className="small-copy">
                  Quote unavailable: {estimate.error}
                </p>
              )}
              {recommendation && <p>{recommendation.reason}</p>}
              {recommendationError && <p role="alert">{recommendationError}</p>}
              {recommendation && recommendation.status !== "defer" && (
                <button
                  type="button"
                  className="button button-light"
                  disabled={busy}
                  onClick={() =>
                    applyRecommendation(item.asset, recommendation)
                  }
                >
                  {recommendation.status === "unpriced"
                    ? "Use starting sizes"
                    : "Use recommendation"}{" "}
                  · {recommendation.batches} buys
                </button>
              )}
              <details>
                <summary>Current standing settings</summary>
                <p>
                  Public output rates:{" "}
                  {item.data.policy.rates.length
                    ? item.data.policy.rates
                        .map((rate) => `${rate.numerator}/${rate.denominator}`)
                        .join(", ")
                    : "not configured"}{" "}
                  (raw output per raw input, in route order). Expiry:{" "}
                  {item.data.policy.expiresAt === 0n
                    ? "none"
                    : new Date(
                        Number(item.data.policy.expiresAt) * 1000,
                      ).toLocaleString()}
                  . Remaining budget:{" "}
                  {item.data.policy.budgetLimited
                    ? amount(item.data.policy.remainingBudget)
                    : "unlimited"}
                  .
                </p>
                <p>
                  {amount(item.data.limits.minInput)} minimum;{" "}
                  {amount(item.data.limits.maxInput)} maximum;{" "}
                  {item.data.limits.minInterval.toString()} seconds between
                  purchases. Last purchase:{" "}
                  {item.data.lastBuyAt === 0n
                    ? "none"
                    : new Date(
                        Number(item.data.lastBuyAt) * 1000,
                      ).toLocaleString()}
                  .
                </p>
                <code>{item.asset}</code>
              </details>
            </article>
          );
        })}
      </section>
      <section className="protocol-section" aria-label="Review settings">
        <h2>Rehearse, review, save</h2>
        <p>
          Preview purchases in order, including their cooldowns. Simulation uses
          a fresh snapshot and leaves your memberships and vault unchanged.
        </p>
        <div className="protocol-actions">
          <button
            type="button"
            className="button button-light"
            disabled={busy}
            onClick={() => rehearsal.mutate()}
          >
            {rehearsal.isPending
              ? "Rehearsing sequential purchases…"
              : "Rehearse selected settings"}
          </button>
          <button
            type="button"
            className="button button-dark"
            disabled={busy}
            onClick={() => {
              try {
                const current = request();
                setInputError(undefined);
                setReview({
                  data: current.data,
                  rows: current.rows,
                  globalMinutes,
                });
              } catch (error) {
                setInputError(decodeTransactionError(error));
              }
            }}
          >
            Review {selected.length}{" "}
            {selected.length === 1 ? "currency" : "currencies"}
          </button>
        </div>
        {inputError && <p role="alert">{inputError}</p>}
        {rehearsal.error && (
          <p role="alert">{decodeTransactionError(rehearsal.error)}</p>
        )}
        {rehearsal.data && (
          <div className={styles.preview}>
            <h3>Purchase preview</h3>
            <p>{rehearsal.data.report.summary}</p>
            {assets
              .filter((item) =>
                rehearsal.data!.report.rows.some(
                  (row) =>
                    row.asset.toLowerCase() === item.asset.toLowerCase() &&
                    row.status === "gas-deferred",
                ),
              )
              .map((item) => {
                if (item.status !== "valid" || !item.data.metadata) return null;
                const suggestion = recommendationFor(item);
                const metadata = item.data.metadata;
                const amount = (raw: bigint) =>
                  `${formatRawTokenAmount({ raw, decimals: metadata.decimals, multiplier: metadata.uiMultiplier })} ${metadata.symbol}`;
                return (
                  <div key={item.asset} role="status" className={styles.notice}>
                    {suggestion.status === "ready" ? (
                      <>
                        <p>
                          Combine {metadata.symbol} into {suggestion.batches}{" "}
                          larger{" "}
                          {suggestion.batches === 1 ? "purchase" : "purchases"}:{" "}
                          {amount(suggestion.limits.maxInput)} each, with a{" "}
                          {amount(suggestion.limits.minInput)} minimum to meet
                          your {maxGasPercent}% gas target.
                        </p>
                        <button
                          type="button"
                          className="button button-light"
                          disabled={busy}
                          onClick={() =>
                            applyRecommendation(item.asset, suggestion)
                          }
                        >
                          Use {suggestion.batches} larger {metadata.symbol}{" "}
                          {suggestion.batches === 1 ? "purchase" : "purchases"}
                        </button>
                        <p className="small-copy">
                          Applies the suggested sizes and spacing. Rehearse
                          again to check them before saving.
                        </p>
                      </>
                    ) : suggestion.status === "defer" &&
                      suggestion.economicMinimum !== undefined ? (
                      <p>
                        Wait for a larger {metadata.symbol} purchase: at least{" "}
                        {amount(suggestion.economicMinimum)} at this gas price.
                        Your selected funds are {amount(suggestion.shortfall!)}{" "}
                        short of that amount.
                      </p>
                    ) : (
                      <p>{suggestion.reason}</p>
                    )}
                  </div>
                );
              })}

            <details>
              <summary>Simulation details</summary>
              <p>
                {rehearsal.data.report.totals.batches} purchases ·{" "}
                {formatUnits(
                  BigInt(rehearsal.data.report.totals.burnedRaw),
                  18,
                )}{" "}
                protocol tokens burned ·{" "}
                {formatRawTokenAmount({
                  raw: BigInt(rehearsal.data.report.totals.gasWei),
                  decimals: 18,
                  multiplier: 10n ** 18n,
                })}{" "}
                ETH in simulated network fees, including settings and fee
                collection.
              </p>
              {rehearsal.data.report.truncated && (
                <p>
                  Rehearsal stopped at its execution limit. This is a partial
                  projection.
                </p>
              )}
              <p className="small-copy">
                Captured block {rehearsal.data.report.capturedBlock}. Results
                describe the settings submitted for that run; edits require a
                new rehearsal.
              </p>
              <div className="protocol-table-scroll">
                <table className="protocol-table">
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Input</th>
                      <th>Burned tokens</th>
                      <th>Gas · ETH</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rehearsal.data.report.rows.map((r, i) => {
                      const asset = assets.find(
                        (a) => a.asset.toLowerCase() === r.asset.toLowerCase(),
                      );
                      const m =
                        asset?.status === "valid"
                          ? asset.data.metadata
                          : undefined;
                      return (
                        <tr key={i}>
                          <td>{m?.symbol ?? r.asset}</td>
                          <td>
                            {m
                              ? formatRawTokenAmount({
                                  raw: BigInt(r.inputRaw),
                                  decimals: m.decimals,
                                  multiplier: m.uiMultiplier,
                                })
                              : r.inputRaw}
                          </td>
                          <td>{formatUnits(BigInt(r.burnedRaw), 18)}</td>
                          <td>
                            {formatRawTokenAmount({
                              raw: BigInt(r.gasWei),
                              decimals: 18,
                              multiplier: 10n ** 18n,
                            })}
                          </td>
                          <td>
                            {r.status === "gas-deferred"
                              ? "Purchase skipped. "
                              : ""}
                            {r.note}
                            {r.estimate && r.status === "gas-deferred" && (
                              <>
                                {" "}
                                Estimated network fee:{" "}
                                {formatRawTokenAmount({
                                  raw: BigInt(r.estimate.gasWei),
                                  decimals: 18,
                                  multiplier: 10n ** 18n,
                                })}{" "}
                                ETH for a{" "}
                                {m
                                  ? `${formatRawTokenAmount({ raw: BigInt(r.estimate.inputRaw), decimals: m.decimals, multiplier: m.uiMultiplier })} ${m.symbol}`
                                  : r.estimate.inputRaw}{" "}
                                purchase.
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </section>
      {review && (
        <PublishSettings
          key={review.data}
          chainId={chainId}
          snapshot={snapshot}
          review={review}
          close={() => setReview(undefined)}
          onPublished={refresh}
        />
      )}
      <p>
        <a href={`/chains/${chainId}/protocol`}>Open protocol activity</a>
      </p>
    </>
  );
}

function PublishSettings({
  chainId,
  snapshot,
  review,
  close,
  onPublished,
}: {
  chainId: SupportedChainId;
  snapshot: Snapshot;
  review: { data: Hex; rows: LimitDraft[]; globalMinutes: string };
  close: () => void;
  onPublished: () => Promise<unknown>;
}) {
  const account = useAccount(),
    client = usePublicClient({ chainId }),
    config = useConfig(),
    write = useWriteContract(),
    cache = useQueryClient();
  const [signatures, setSignatures] = useState<SignatureFile["signatures"]>([]);
  const approval = useQuery({
    queryKey: [
      "settings-approval",
      chainId,
      snapshot.data.vault,
      snapshot.capturedBlock.toString(),
      review.data,
    ],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: Boolean(client),
    queryFn: async () => {
      const nonce = await client!.readContract({
        address: snapshot.data.safe,
        abi: iSafeAbi,
        functionName: "nonce",
      });
      const payload: SettingsSafePayload = {
        chainId,
        safe: snapshot.data.safe,
        safeNonce: nonce.toString(),
        to: snapshot.data.vault,
        data: review.data,
        value: "0",
        operation: 0,
        safeTxGas: "0",
        baseGas: "0",
        gasPrice: "0",
        gasToken: zeroAddress,
        refundReceiver: zeroAddress,
      };
      return {
        payload,
        safe: await readSafeApproval(client as PublicClient, payload),
      };
    },
  });
  const action = useMutation({
    retry: false,
    mutationFn: async (kind: "sign" | "publish") => {
      if (
        !client ||
        !account.address ||
        account.chainId !== chainId ||
        !approval.data
      )
        throw new Error(
          "Connect your wallet on the selected network and wait for Safe checks.",
        );
      const { payload } = approval.data;
      const [safe, factoryOwner, factoryVault] = await Promise.all([
        readSafeApproval(client as PublicClient, payload),
        client.readContract({
          address: snapshot.data.factory,
          abi: membershipFactoryAbi,
          functionName: "owner",
        }),
        client.readContract({
          address: snapshot.data.factory,
          abi: membershipFactoryAbi,
          functionName: "buybackVault",
        }),
      ]);
      if (
        factoryOwner.toLowerCase() !== payload.safe.toLowerCase() ||
        factoryVault.toLowerCase() !== payload.to.toLowerCase()
      )
        throw new Error("Protocol authority changed. Refresh the calculator.");
      if (safe.hash !== approval.data.safe.hash)
        throw new Error(
          "The Safe transaction changed. Review the settings again.",
        );
      if (kind === "sign") {
        if (
          !account.connector ||
          !safe.owners.some(
            (owner) => owner.toLowerCase() === account.address!.toLowerCase(),
          )
        )
          throw new Error("Connect a current owner of this protocol Safe.");
        if (
          signatures.some(
            (signature) =>
              signature.signer.toLowerCase() === account.address!.toLowerCase(),
          )
        )
          throw new Error("This owner has already signed.");
        const code = await client.getBytecode({ address: account.address });
        if (code && code !== "0x")
          throw new Error("Connect an EOA Safe owner to sign these settings.");
        const provider = await account.connector.getProvider({ chainId });
        const signature = await generateEIP712Signature(
          new SafeProvider({
            provider: provider as ConstructorParameters<
              typeof SafeProvider
            >[0]["provider"],
            signer: account.address,
          }),
          {
            safeAddress: payload.safe,
            safeVersion: safe.version,
            chainId: BigInt(chainId),
            data: settingsSafeTransaction(payload).data,
          },
          "v4",
        );
        const next = [
          ...signatures,
          { signer: signature.signer as Address, data: signature.data as Hex },
        ];
        await validateSignatureFile(
          {
            format: "bbf-settings-signatures-v1",
            proposalDigest: safe.hash,
            safeTransactionHash: safe.hash,
            signatures: next,
          },
          safe.hash,
          safe.hash,
          safe.owners,
        );
        setSignatures(next);
        return { kind: "signed" as const };
      }
      if (signatures.length < safe.threshold)
        throw new Error(`This Safe needs ${safe.threshold} owner signatures.`);
      await validateSignatureFile(
        {
          format: "bbf-settings-signatures-v1",
          proposalDigest: safe.hash,
          safeTransactionHash: safe.hash,
          signatures,
        },
        safe.hash,
        safe.hash,
        safe.owners,
      );
      const transaction = addOwnerSignatures(
        settingsSafeTransaction(payload),
        signatures,
      );
      const simulation = await simulateContract(config, {
        address: payload.safe,
        abi: iSafeAbi,
        functionName: "execTransaction",
        args: safeExecutionArgs(transaction),
        account: account.address,
        chainId,
      });
      if (!simulation.result)
        throw new Error(
          "Safe simulation reported an inner failure. Nothing was submitted.",
        );
      await assertSufficientGas(client, account.address, simulation.request);
      const hash = await write.writeContractAsync(simulation.request);
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled = replacement.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled this transaction.");
      await verifySettingsReceipt(
        client as PublicClient,
        receipt,
        payload,
        safe.hash,
      );
      await cache.invalidateQueries({
        queryKey: ["protocol", chainId, "snapshot"],
      });
      return { kind: "published" as const, hash: receipt.transactionHash };
    },
  });
  const owner = approval.data?.safe.owners.some(
    (value) => value.toLowerCase() === account.address?.toLowerCase(),
  );
  const signed = signatures.some(
    (value) => value.signer.toLowerCase() === account.address?.toLowerCase(),
  );
  const ready = Boolean(
    approval.data &&
    !approval.isFetching &&
    !approval.isError &&
    account.address &&
    account.chainId === chainId &&
    !action.isPending &&
    action.data?.kind !== "published",
  );
  return (
    <section className="protocol-section" aria-label="Save standing settings">
      <h2>Save standing settings</h2>
      <p>
        Global minimum: {review.globalMinutes} minutes between purchases. These
        settings do not expire; they do not reset purchase clocks or spend any
        inventory.
      </p>
      <ul>
        {review.rows.map((row) => (
          <li key={row.asset}>
            {(() => {
              const asset = snapshot.data.assets.find(
                (a) => a.asset === row.asset,
              );
              return asset?.status === "valid"
                ? (asset.data.metadata?.symbol ?? row.asset)
                : row.asset;
            })()}
            : {row.minimum} minimum, {row.maximum} maximum;{" "}
            {row.intervalMinutes} minutes apart.
          </li>
        ))}
      </ul>
      <p className="small-copy">
        Safe: <code>{snapshot.data.safe}</code>
      </p>
      {approval.isFetching && (
        <p role="status">Checking Safe owners and nonce…</p>
      )}
      {approval.error && (
        <p role="alert">{decodeTransactionError(approval.error)}</p>
      )}
      {approval.data && (
        <p>
          {signatures.length} of {approval.data.safe.threshold} owner signatures
          collected.{" "}
          {owner
            ? "Your wallet is an owner."
            : "Connect an owner wallet to sign."}
        </p>
      )}
      <div className="protocol-actions">
        <button
          type="button"
          className="button button-light"
          disabled={
            action.isPending ||
            approval.isFetching ||
            action.data?.kind === "published"
          }
          onClick={() => {
            setSignatures([]);
            action.reset();
            void approval.refetch();
          }}
        >
          Refresh approval
        </button>
        <button
          type="button"
          className="button button-light"
          disabled={action.isPending}
          onClick={close}
        >
          Back to settings
        </button>
        <button
          type="button"
          className="button button-light"
          disabled={!ready || !owner || signed}
          onClick={() => action.mutate("sign")}
        >
          Sign settings
        </button>
        <button
          type="button"
          className="button button-dark"
          disabled={
            !ready ||
            signatures.length < (approval.data?.safe.threshold ?? Infinity)
          }
          onClick={() => action.mutate("publish")}
        >
          Save through Safe
        </button>
      </div>
      {action.isPending && (
        <p role="status">
          {write.isPending
            ? "Confirm in your wallet."
            : "Checking approvals or waiting for the network…"}
        </p>
      )}
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {action.data?.kind === "published" && (
        <div role="status">
          <p>
            Standing settings saved and verified. Anyone can execute eligible
            buybacks.
          </p>
          <button
            type="button"
            className="button button-light"
            onClick={() => void onPublished()}
          >
            Refresh funds and settings
          </button>
        </div>
      )}
      {(action.data?.kind === "published" ? action.data.hash : write.data) && (
        <details>
          <summary>Transaction ID</summary>
          <code>
            {action.data?.kind === "published" ? action.data.hash : write.data}
          </code>
        </details>
      )}
    </section>
  );
}
