"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import {
  BaseError,
  ContractFunctionRevertedError,
  zeroAddress,
  type Address,
} from "viem";
import {
  membershipTierAbi,
  membershipFactoryAbi,
  protocolBurnRouterAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";
import type { SupportedChainId } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { decodeTransactionError } from "@/lib/transaction-state";
import { assertSufficientGas } from "./gas-readiness";
import { receiptAdvance, buybackSkipReason } from "./buyback-reconciliation";
import { formatMembershipDate } from "@/features/membership/date";

import { advanceCall, type AdvanceMode } from "./advance-call";

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
  async function readStatus() {
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
    return { status, held, router, purchases, timestamp: block.timestamp };
  }
  const state = useQuery({
    queryKey: [
      "protocol",
      chainId,
      "accounting-actions",
      tier,
      blockNumber.toString(),
    ],
    enabled: Boolean(client),
    queryFn: readStatus,
    retry: false,
  });
  const action = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!client || !account.address || account.chainId !== chainId)
        throw new Error("Connect your wallet on this network.");
      const current = await readStatus();
      let simulation;
      try {
        simulation = await simulateContract(config, {
          account: account.address,
          chainId,
          address: current.router,
          abi: protocolBurnRouterAbi,
          ...advanceCall(
            mode,
            [{ tier, maxAccountingSteps: 25n }],
            current.purchases,
            current.timestamp + 300n,
          ),
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
            "Nothing is ready to advance, release or buy back. Refresh as paid time is used or buybacks become eligible.",
          );
        throw error;
      }
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
      const next = await readStatus();
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
      <p>
        Anyone can settle earned allocations, release protocol funding and
        attempt eligible buybacks for this payment asset in one transaction. You
        pay the network fee. Accounting processes up to 25 checkpoints per call.
        Buyback-only uses funds already released to the vault. Both also
        releases newly earned protocol funding.
      </p>
      {state.data && (
        <p className="small-copy">
          Accounting through{" "}
          {formatMembershipDate(state.data.status.accountedThrough)}.
          {state.data.status.complete
            ? " All due checkpoints are complete."
            : state.data.status.scheduledMembers === 0n
              ? " No funding checkpoints remain."
              : state.data.status.nextBoundary > state.data.timestamp
                ? " No checkpoints are due. New paid time may be waiting to settle."
                : " More accounting remains."}{" "}
          Already-settled claims remain available.
        </p>
      )}
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
          disabled={blocked}
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
        <button
          type="button"
          className="button button-light"
          disabled={action.isPending || state.isFetching}
          onClick={() => void state.refetch()}
        >
          Refresh accounting
        </button>
      </div>
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
        <p role="alert">
          {decodeTransactionError(action.error)} No changes from a reverted
          transaction are retained. Choose Advance accounting to catch up
          independently of buybacks.
        </p>
      )}
      {action.data && (
        <p role="status">
          {action.data.processedSteps.toString()} checkpoints completed.
          Protocol funds released from {action.data.releasedTiers.toString()}{" "}
          membership tiers. {action.data.purchases.toString()} buyback actions
          completed.
          {action.data.status.complete
            ? " Accounting is caught up."
            : action.data.status.scheduledMembers === 0n
              ? " No funding checkpoints remain."
              : action.data.status.nextBoundary > action.data.timestamp
                ? " All due checkpoints are processed. Refresh your membership action to continue."
                : " More remains. Advance again to continue."}
          {action.data.skipped.length > 0 &&
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
