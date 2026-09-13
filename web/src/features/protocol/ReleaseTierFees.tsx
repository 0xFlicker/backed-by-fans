"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import { zeroAddress, type Address } from "viem";
import {
  membershipTierAbi,
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";
import type { SupportedChainId } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { decodeTransactionError } from "@/lib/transaction-state";
import { assertSufficientGas } from "./gas-readiness";
import { receiptAdvance, buybackSkipReason } from "./buyback-reconciliation";
import { previewAdvance } from "./preview-advance";
import { simulateAdvance } from "./simulate-advance";

import { type AdvanceMode } from "./advance-call";

export function ReleaseTierFees({
  chainId,
  tier,
  blockNumber,
  onConfirmed,
}: {
  chainId: SupportedChainId;
  tier: Address;
  blockNumber: bigint;
  onConfirmed?: () => Promise<unknown>;
}) {
  const account = useHydratedAccount();
  const config = useConfig();
  const client = usePublicClient({ chainId });
  const write = useWriteContract();
  const cache = useQueryClient();
  const [mode, setMode] = useState<AdvanceMode>("accounting");
  async function readStatus(
    requestedMode: AdvanceMode = mode,
    includePreview = true,
  ) {
    if (!client) throw new Error("The network is unavailable.");
    const block = await client.getBlock();
    const [status, held, factory] = await Promise.all([
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "accountingStatus",
        blockNumber: block.number,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "protocolFeeEarnedHeld",
        blockNumber: block.number,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "factory",
        blockNumber: block.number,
      }),
    ]);
    const [router, vault, protocolToken, paymentToken] = await Promise.all([
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "burnRouter",
        blockNumber: block.number,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "buybackVault",
        blockNumber: block.number,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "protocolToken",
        blockNumber: block.number,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "paymentToken",
        blockNumber: block.number,
      }),
    ]);
    const purchases: { asset: Address; revision: bigint }[] = [];
    if (protocolToken !== zeroAddress) {
      const asset = await client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "canonicalAsset",
        args: [paymentToken],
        blockNumber: block.number,
      });
      const revision = await client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "revision",
        args: [asset],
        blockNumber: block.number,
      });
      purchases.push({ asset, revision });
    }
    const plan = {
      router,
      vault,
      blockNumber: block.number,
      tiers: [{ tier, maxAccountingSteps: 25n }],
      purchases,
      deadline: block.timestamp + 300n,
    };
    const projection = includePreview
      ? await previewAdvance(client, plan, requestedMode)
      : null;
    return {
      status,
      held,
      router,
      purchases,
      timestamp: block.timestamp,
      projection,
      plan,
    };
  }
  const state = useQuery({
    queryKey: [
      "protocol",
      chainId,
      "accounting-actions",
      tier,
      blockNumber.toString(),
      mode,
      account.address,
    ],
    enabled: Boolean(client),
    queryFn: () => readStatus(),
    refetchInterval: 15_000,
    retry: false,
  });
  const action = useMutation({
    retry: false,
    mutationFn: async (manual: boolean) => {
      if (!client || !account.address || account.chainId !== chainId)
        throw new Error("Connect your wallet on this network.");
      const current = await readStatus(manual ? "accounting" : mode);
      if (
        !current.projection ||
        (manual ? !current.projection.useful : !current.projection.ready)
      ) {
        await state.refetch();
        throw new Error("Nothing needs advancing right now.");
      }
      const simulation = await simulateAdvance(
        config,
        chainId,
        account.address,
        manual ? "accounting" : mode,
        current.plan,
      );
      if (!simulation || (!manual && !simulation.ready))
        throw new Error("Nothing needs advancing right now.");
      const { request } = simulation;
      await assertSufficientGas(client, account.address, request);
      const hash = await write.writeContractAsync(request);
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled ||= replacement.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled this transaction.");
      if (receipt.status !== "success")
        throw new Error("The accounting transaction reverted.");
      const outcome = receiptAdvance(receipt, {
        router: current.router,
        caller: account.address,
      });
      if (!outcome)
        throw new Error("The receipt does not confirm this accounting action.");
      const next = await readStatus(mode, false);
      const refresh = await Promise.allSettled([
        cache.invalidateQueries({
          predicate: (query) => query.queryKey.includes(tier),
        }),
        onConfirmed?.() ?? Promise.resolve(),
      ]);
      return {
        ...outcome.completed,
        hash: receipt.transactionHash,
        status: next.status,
        timestamp: next.timestamp,
        skipped: [
          ...new Set(
            outcome.skipped.map((item) => buybackSkipReason(item.reason)),
          ),
        ],
        refreshFailed: refresh.some((item) => item.status === "rejected"),
      };
    },
  });
  const blocked =
    !account.isConnected ||
    account.chainId !== chainId ||
    action.isPending ||
    state.isFetching ||
    state.isError;
  return (
    <section
      aria-label="Advance membership accounting"
      id={`tier-accounting-${tier.toLowerCase()}`}
      className="protocol-section"
    >
      <h3>Advance membership accounting</h3>
      <p>Settle up to 25 checkpoints, run buybacks, or do both.</p>
      <div
        className="small-copy"
        aria-live="polite"
        style={{ minHeight: "5rem" }}
      >
        {state.isPending
          ? "Checking…"
          : state.data && (
              <>
                {mode !== "buyback" && (
                  <div>
                    {state.data.projection?.processedSteps
                      ? `${state.data.projection.processedSteps} checkpoints ready.`
                      : "Accounting is up to date."}
                  </div>
                )}
                {mode !== "accounting" && (
                  <div>
                    {state.data.projection?.purchases
                      ? `${state.data.projection.purchases} buybacks ready.`
                      : "No buyback ready. Waiting for funds or eligibility."}
                  </div>
                )}
                {!state.data.projection?.ready && (
                  <div>Nothing needs advancing.</div>
                )}
              </>
            )}
      </div>
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
      <div className="creator-actions">
        <button
          type="button"
          className="button button-dark"
          disabled={blocked || !state.data?.projection?.ready}
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
        <button
          type="button"
          className="text-button"
          disabled={action.isPending || state.isFetching}
          onClick={() => void state.refetch()}
        >
          Refresh accounting
        </button>
      </div>
      <details>
        <summary>Accounting details</summary>
        <p className="small-copy">
          Rewards accrue between checkpoints. Settle them here to make newly
          earned funds available.
        </p>
        {mode !== "buyback" && (
          <button
            type="button"
            className="text-button"
            disabled={blocked || !state.data?.projection?.useful}
            onClick={() => action.mutate(true)}
          >
            Settle accrued rewards
          </button>
        )}
      </details>
      {!account.isConnected ? (
        <p>Connect a wallet to continue.</p>
      ) : account.chainId !== chainId ? (
        <p>Switch your wallet to this network.</p>
      ) : null}
      {state.isError && (
        <p role="alert">Accounting could not be read. Refresh to try again.</p>
      )}
      {action.isPending && (
        <p role="status">
          {write.isPending
            ? "Confirm in your wallet."
            : "Checking accounting and waiting for confirmation…"}
        </p>
      )}
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {action.data && (
        <p role="status">
          {action.data.status.complete ||
          action.data.status.nextBoundary === 0n ||
          action.data.status.nextBoundary > action.data.timestamp
            ? "Accounting is up to date."
            : "More remains. Advance again to continue."}
          {action.data.processedSteps > 0n &&
            ` ${action.data.processedSteps} checkpoints completed.`}
          {action.data.releasedTiers > 0n && " Protocol funding released."}
          {action.data.purchases > 0n &&
            ` ${action.data.purchases} buyback actions completed.`}
          {action.data.purchases === 0n &&
            action.data.skipped.length > 0 &&
            ` Buybacks skipped: ${action.data.skipped.join(", ")}.`}
          {action.data.refreshFailed &&
            " Refresh the page to load the updated balances."}
        </p>
      )}
      {(action.data?.hash ?? write.data) && (
        <details>
          <summary>Transaction ID</summary>
          <code>{action.data?.hash ?? write.data}</code>
        </details>
      )}
    </section>
  );
}
