"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import {
  BaseError,
  ContractFunctionRevertedError,
  parseEventLogs,
  type Address,
  type PublicClient,
} from "viem";
import { protocolBurnRouterAbi } from "@/contracts";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { decodeTransactionError } from "@/lib/transaction-state";
import { formatRawTokenAmount, tokenMultiplierScale } from "@/lib/token-amount";
import { isSameAddress } from "@/lib/address";
import { prepareBurn } from "./prepare-burn";
import { assertSufficientGas } from "./gas-readiness";

export function Burn({
  chainId,
  factory,
  symbol,
}: {
  chainId: SupportedChainId;
  factory: Address;
  symbol?: string;
}) {
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
      const plan = await prepareBurn(client as PublicClient, factory);
      let simulation;
      try {
        simulation = await simulateContract(config, {
          chainId,
          account: account.address,
          address: plan.router,
          abi: protocolBurnRouterAbi,
          functionName: "burn",
          args: [plan.collections, plan.purchases, plan.deadline],
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
            plan.unavailableCollections > 0
              ? "Some fee collections are unavailable, and no other work is ready. Check the membership details below."
              : "Nothing is ready to burn or collect right now. Try again as fees earn and cooldowns finish.",
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
          "The transaction reverted. Press Burn to check the latest available work.",
        );
      const events = parseEventLogs({
        abi: protocolBurnRouterAbi,
        logs: receipt.logs,
      }).filter((event) => isSameAddress(event.address, plan.router));
      const completed = events.find(
        (event) =>
          event.eventName === "BurnCompleted" &&
          isSameAddress(event.args.caller, account.address!),
      );
      if (!completed || completed.eventName !== "BurnCompleted")
        throw new Error(
          "This receipt does not confirm a completed burn batch. Refresh activity to check.",
        );
      const refresh = await Promise.allSettled([
        cache.invalidateQueries(
          { queryKey: ["protocol", chainId] },
          { throwOnError: true },
        ),
      ]);
      return {
        ...completed.args,
        receipt,
        more: plan.moreCollections,
        failures:
          plan.unavailableCollections +
          events.filter(
            (event) =>
              event.eventName === "CollectionFailed" ||
              event.eventName === "PurchaseFailed",
          ).length,
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
        {action.isPending ? "Working…" : "Burn"}
      </button>
      <p className="small-copy">
        {!account.isConnected
          ? "Connect a wallet to burn."
          : account.chainId !== chainId
            ? "Switch your wallet to this network."
            : "Collect earned fees and burn in one transaction. You pay the network fee."}
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
              : "Earned fees collected. Purchases will proceed when eligible."}
            {result.releasedTiers > 0n &&
              result.burned > 0n &&
              ` Fees collected from ${result.releasedTiers} membership${result.releasedTiers === 1n ? "" : "s"}.`}
          </p>
          {(result.more || result.failures > 0) && (
            <p className="small-copy">
              Some work remains. Press Burn to check what can run next.
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
