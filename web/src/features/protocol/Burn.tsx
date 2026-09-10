"use client";

import { useState } from "react";
import { advanceCall, type AdvanceMode } from "./advance-call";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import {
  BaseError,
  isAddress,
  ContractFunctionRevertedError,
  type Address,
  type PublicClient,
} from "viem";
import { protocolBurnRouterAbi } from "@/contracts";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { decodeTransactionError } from "@/lib/transaction-state";
import { formatRawTokenAmount, tokenMultiplierScale } from "@/lib/token-amount";
import { receiptAdvance, buybackSkipReason } from "./buyback-reconciliation";
import { prepareAdvance } from "./prepare-burn";
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
  const action = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!client || !account.address || account.chainId !== chainId)
        throw new Error("Connect your wallet on this network.");
      write.reset();
      if (mode !== "buyback" && selectedTier && !isAddress(selectedTier))
        throw new Error("Enter a valid membership contract address.");
      const plan = await prepareAdvance(
        client as PublicClient,
        factory,
        mode !== "buyback" && selectedTier
          ? (selectedTier as Address)
          : undefined,
      );
      let simulation;
      try {
        simulation = await simulateContract(config, {
          chainId,
          account: account.address,
          address: plan.router,
          abi: protocolBurnRouterAbi,
          ...advanceCall(mode, plan.tiers, plan.purchases, plan.deadline),
          ...(chainId === 31337 ? { gasPrice: 2_000_000_000n } : {}),
        });
      } catch (error) {
        const reverted =
          error instanceof BaseError &&
          error.walk((cause) => cause instanceof ContractFunctionRevertedError);
        if (
          reverted instanceof ContractFunctionRevertedError &&
          reverted.data?.errorName === "NothingToDo"
        )
          throw new Error(
            plan.unavailableTiers > 0
              ? "Some membership accounting is unavailable, and no other work is ready. Check the membership details below."
              : "Nothing is ready to advance or burn right now. Try again as fees earn and cooldowns finish.",
          );
        throw error;
      }
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
        more: plan.moreAccounting,
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
    formatRawTokenAmount({
      raw: result.burned,
      decimals: 18,
      multiplier: tokenMultiplierScale,
    }).replace(/^\d+/, (whole) => BigInt(whole).toLocaleString("en-US"));
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
          <summary>Choose a membership instead of automatic selection</summary>
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
          action.isPending ||
          !account.isConnected ||
          account.chainId !== chainId
        }
        onClick={() => action.mutate()}
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
              ? "Settle up to 25 checkpoints without trading. You pay the network fee."
              : mode === "buyback"
                ? "Buy and burn using funds already released to the vault. You pay the network fee."
                : "Advance accounting, release earned fees and execute eligible buybacks in one transaction. An execution failure rolls back the transaction."}
      </p>
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
          {(result.more || result.unavailable > 0) && (
            <p className="small-copy">
              Some work remains. Run another batch or choose a membership to
              advance.
            </p>
          )}
          {result.skipped.length > 0 && (
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
