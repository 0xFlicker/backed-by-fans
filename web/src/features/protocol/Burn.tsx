"use client";
import { StreamingAmount } from "@/components/StreamingAmount";

import { useState } from "react";
import { type AdvanceMode } from "./advance-call";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, zeroAddress, type Address, type PublicClient } from "viem";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { decodeTransactionError } from "@/lib/transaction-state";
import {
  formatLocalizedTokenAmount,
  tokenMultiplierScale,
} from "@/lib/token-amount";
import { receiptAdvance, buybackSkipReason } from "./buyback-reconciliation";
import { prepareAdvance } from "./prepare-burn";
import { previewAdvance } from "./preview-advance";
import { readTokenDisplay } from "@/lib/payment-token-read";
import { simulateAdvance } from "./simulate-advance";
import { assertSufficientGas } from "./gas-readiness";

export function Burn({
  chainId,
  factory,
  symbol,
}: {
  chainId: SupportedChainId;
  factory: Address;
  symbol?: string;
  tokenLaunched?: boolean;
}) {
  const [mode, setMode] = useState<AdvanceMode>("both");
  const [selectedTier, setSelectedTier] = useState("");
  const account = useHydratedAccount();
  const client = usePublicClient({ chainId });
  const config = useConfig();
  const write = useWriteContract();
  const cache = useQueryClient();
  async function checkAdvance(requestedMode: AdvanceMode = mode) {
    if (!client) throw new Error("The network is unavailable.");
    if (requestedMode !== "buyback" && selectedTier && !isAddress(selectedTier))
      throw new Error("Enter a valid membership contract address.");
    const plan = await prepareAdvance(
      client as PublicClient,
      factory,
      requestedMode !== "buyback" && selectedTier
        ? (selectedTier as Address)
        : undefined,
    );
    const projection = await previewAdvance(
      client as PublicClient,
      plan,
      requestedMode,
    );
    const funds = await Promise.all(
      projection.funds
        .filter((item) => item.amount > 0n)
        .map(async (item) => {
          const display =
            item.asset === zeroAddress
              ? {
                  symbol: "ETH",
                  decimals: 18,
                  uiMultiplier: tokenMultiplierScale,
                  newUIMultiplier: tokenMultiplierScale,
                  effectiveAt: 0n,
                }
              : await readTokenDisplay(
                  client as PublicClient,
                  item.asset,
                  plan.blockNumber,
                );
          const multiplier =
            display.effectiveAt > 0n && display.effectiveAt <= plan.timestamp
              ? display.newUIMultiplier
              : display.uiMultiplier;
          return {
            ...item,
            display,
            multiplier,
            label: `${formatLocalizedTokenAmount({ raw: item.amount, decimals: display.decimals, multiplier })} ${display.symbol}`,
            deltaLabel: `${formatLocalizedTokenAmount({ raw: item.delta, decimals: display.decimals, multiplier })} ${display.symbol}`,
          };
        }),
    );
    return { plan, projection, funds };
  }
  const preview = useQuery({
    queryKey: [
      "protocol",
      chainId,
      "advance-preview",
      factory,
      account.address,
      mode,
      selectedTier,
    ],
    queryFn: () => checkAdvance(),
    enabled: Boolean(client),
    refetchInterval: 15_000,
    retry: false,
  });
  const action = useMutation({
    retry: false,
    mutationFn: async (manual: boolean) => {
      if (!client || !account.address || account.chainId !== chainId)
        throw new Error("Connect your wallet on this network.");
      write.reset();
      // Recheck immediately before signing; never submit a stale preview request.
      const { plan, projection } = await checkAdvance(
        manual ? "accounting" : mode,
      );
      if (manual ? !projection.useful : !projection.ready) {
        await preview.refetch();
        throw new Error("Nothing needs advancing right now.");
      }
      const simulation = await simulateAdvance(
        config,
        chainId,
        account.address,
        manual ? "accounting" : mode,
        plan,
      );
      if (!simulation || (!manual && !simulation.ready))
        throw new Error("Nothing needs advancing right now.");
      await assertSufficientGas(
        client as PublicClient,
        account.address,
        simulation.request,
      );
      const hash = await write.writeContractAsync(simulation.request);
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled ||= replacement.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled this transaction.");
      if (receipt.status !== "success")
        throw new Error(
          "The transaction reverted. No changes were retained. Choose Advance accounting to catch up independently of buybacks.",
        );
      const outcome = receiptAdvance(receipt, {
        router: plan.router,
        caller: account.address,
      });
      if (!outcome)
        throw new Error(
          "This receipt does not confirm a completed accounting and buyback batch. Refresh activity to check.",
        );
      const refresh = await Promise.allSettled([
        cache.invalidateQueries(
          { queryKey: ["protocol", chainId] },
          { throwOnError: true },
        ),
      ]);
      return {
        ...outcome.completed,
        receipt,
        more: outcome.accounting.some((item) => !item.complete),
        accountingCoverageIncomplete:
          mode !== "buyback" && plan.accountingCoverageIncomplete,
        unavailable: plan.unavailableTiers,
        skipped: [
          ...new Set(
            outcome.skipped.map((item) => buybackSkipReason(item.reason)),
          ),
        ],
        refreshFailed: refresh.some((result) => result.status === "rejected"),
      };
    },
  });
  const result = action.data;
  const burnedAmount =
    result &&
    formatLocalizedTokenAmount({
      raw: result.burned,
      decimals: 18,
      multiplier: tokenMultiplierScale,
    });
  const explorer = getSupportedChain(chainId).blockExplorers?.default.url;
  return (
    <div className="protocol-burn">
      <label className="creator-field">
        <span>Action</span>
        <select
          value={mode}
          disabled={action.isPending}
          onChange={(event) => setMode(event.target.value as AdvanceMode)}
        >
          <option value="accounting">Advance accounting</option>
          <option value="buyback">Buyback and burn</option>
          <option value="both">Both</option>
        </select>
      </label>
      {mode !== "buyback" && (
        <details>
          <summary>Choose membership</summary>
          <label className="creator-field">
            <span>Membership contract address</span>
            <input
              value={selectedTier}
              disabled={action.isPending}
              onChange={(event) => setSelectedTier(event.target.value.trim())}
              placeholder="0x…"
            />
          </label>
          <p className="small-copy">
            Leave blank for automatic selection. Each transaction shares up to
            25 checkpoints across selected memberships.
          </p>
        </details>
      )}
      <button
        type="button"
        className="button button-dark"
        disabled={
          !preview.data?.projection?.ready ||
          preview.isError ||
          action.isPending ||
          !account.isConnected ||
          account.chainId !== chainId
        }
        onClick={() => action.mutate(false)}
      >
        {action.isPending
          ? "Working…"
          : mode === "accounting"
            ? "Advance accounting"
            : mode === "buyback"
              ? "Buyback and burn"
              : "Advance and burn"}
      </button>
      <p className="small-copy">
        {!account.isConnected
          ? "Connect a wallet to continue."
          : account.chainId !== chainId
            ? "Switch your wallet to this network."
            : mode === "accounting"
              ? "Settle up to 25 checkpoints. You pay the network fee."
              : mode === "buyback"
                ? "Buy and burn using funds already released to the vault. You pay the network fee."
                : "Settle rewards and run eligible buybacks. You pay the network fee."}
      </p>
      <details>
        <summary>Accounting details</summary>
        <div
          className="small-copy"
          aria-live="polite"
          style={{ minHeight: "5rem" }}
        >
          {preview.isPending ? (
            "Checking…"
          ) : preview.isError ? (
            <span role="alert">{decodeTransactionError(preview.error)}</span>
          ) : (
            <>
              {mode !== "buyback" && (
                <div>
                  {preview.data?.projection?.processedSteps
                    ? `${preview.data.projection.processedSteps} checkpoints ready.`
                    : preview.data?.plan.accountingCoverageIncomplete ||
                        preview.data?.plan.unavailableTiers
                      ? "No checkpoints ready in the checked memberships."
                      : "Accounting is up to date."}
                </div>
              )}
              {mode !== "accounting" && (
                <div>
                  {preview.data?.projection?.purchases
                    ? `${preview.data.projection.purchases} currencies ready for buyback.`
                    : "No buyback ready. Waiting for funds or eligibility."}
                </div>
              )}
              {mode !== "buyback" &&
                preview.data?.funds.map((item) => (
                  <div key={item.asset} className="protocol-funding-preview">
                    <strong>
                      <StreamingAmount
                        identity={`${chainId}:${factory}:${item.asset}:${mode}`}
                        streams={item.streams}
                        format={(raw) =>
                          `${formatLocalizedTokenAmount({ raw, decimals: item.display.decimals, multiplier: item.multiplier })} ${item.display.symbol}`
                        }
                        refresh={() => preview.refetch()}
                        active={!preview.isError}
                      />
                    </strong>{" "}
                    {mode === "both"
                      ? "ready to release"
                      : "earned protocol funding"}
                    {item.delta > 0n && (
                      <span className="small-copy">
                        {" "}
                        · +
                        <StreamingAmount
                          identity={`${chainId}:${factory}:${item.asset}:${mode}:delta`}
                          streams={item.streams}
                          base={item.delta - item.amount}
                          format={(raw) =>
                            `${formatLocalizedTokenAmount({ raw, decimals: item.display.decimals, multiplier: item.multiplier })} ${item.display.symbol}`
                          }
                          refresh={() => preview.refetch()}
                          active={!preview.isError}
                        />{" "}
                        since last settlement
                      </span>
                    )}
                  </div>
                ))}
              {!preview.data?.projection?.ready && (
                <div>Nothing needs advancing in this batch.</div>
              )}
            </>
          )}
        </div>
        <p className="small-copy">
          Rewards accrue between checkpoints. Settle them here to make newly
          earned funds available.
        </p>
        <button
          type="button"
          className="text-button"
          disabled={action.isPending || preview.isFetching}
          onClick={() => void preview.refetch()}
        >
          Refresh status
        </button>
        {mode !== "buyback" && (
          <button
            type="button"
            className="text-button"
            disabled={
              action.isPending ||
              preview.isError ||
              !preview.data?.projection.useful ||
              !account.isConnected ||
              account.chainId !== chainId
            }
            onClick={() => action.mutate(true)}
          >
            Settle accrued rewards
          </button>
        )}
        {(preview.data?.plan.accountingCoverageIncomplete ||
          Boolean(preview.data?.plan.unavailableTiers)) && (
          <p className="small-copy">
            This preview covers a limited batch. Choose a membership to check it
            directly.
          </p>
        )}
      </details>
      {action.isPending && (
        <p role="status">
          {write.isPending
            ? "Confirm in your wallet."
            : write.data
              ? "Waiting for confirmation…"
              : "Checking available fees and purchases…"}
        </p>
      )}
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {result && (
        <div role="status">
          <p>
            {result.burned > 0n
              ? `${burnedAmount} ${symbol || "protocol tokens"} burned.`
              : result.releasedTiers > 0n
                ? "Earned fees released to the buyback vault."
                : "Membership accounting advanced."}
            {result.processedSteps > 0n &&
              ` ${result.processedSteps} accounting checkpoints completed.`}
            {!result.burnMeasured &&
              result.purchases > 0n &&
              " Purchases completed; the burn amount could not be measured."}
            {result.releasedTiers > 0n &&
              result.burned > 0n &&
              ` Fees collected from ${result.releasedTiers} membership${result.releasedTiers === 1n ? "" : "s"}.`}
          </p>
          {result.more && (
            <p className="small-copy">
              More checkpoints remain. Advance again to continue.
            </p>
          )}
          {(result.accountingCoverageIncomplete || result.unavailable > 0) && (
            <p className="small-copy">
              Some memberships weren’t checked in this batch.
            </p>
          )}
          {result.purchases === 0n && result.skipped.length > 0 && (
            <p className="small-copy">
              Buybacks skipped: {result.skipped.join(", ")}.
            </p>
          )}
          {result.refreshFailed && (
            <p className="small-copy">
              Refresh activity to load the updated balances.
            </p>
          )}
          {explorer ? (
            <a
              href={`${explorer}/tx/${result.receipt.transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          ) : (
            <details>
              <summary>Transaction ID</summary>
              <code className="protocol-address">
                {result.receipt.transactionHash}
              </code>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
