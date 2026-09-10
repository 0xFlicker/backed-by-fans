"use client";
import { readRewardUsdPrices, formatRewardUsd } from "@/lib/reward-usd";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import {
  BaseError,
  ContractFunctionRevertedError,
  parseEventLogs,
  type Address,
} from "viem";
import { membershipFactoryAbi, protocolBurnRouterAbi } from "@/contracts";
import type { ReadyDeployment } from "@/lib/config";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { decodeTransactionError } from "@/lib/transaction-state";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { receiptAdvance } from "@/features/protocol/buyback-reconciliation";

export function AccountRewards({
  deployment,
  wallet,
  tiers,
  complete,
  formatAmount,
}: {
  deployment: ReadyDeployment;
  wallet: Address;
  tiers: readonly { tier: Address; name: string; paymentToken: Address }[];
  complete: boolean;
  formatAmount: (amount: bigint, token: Address) => string;
}) {
  const { chainId, factoryAddress } = deployment;
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(tiers.length / 8));
  const currentPage = Math.min(page, pages - 1);
  const batch = tiers.slice(currentPage * 8, currentPage * 8 + 8);
  const addresses = batch.map((item) => item.tier);
  const config = useConfig();
  const account = useHydratedAccount();
  const client = usePublicClient({ chainId });
  const write = useWriteContract();
  const cache = useQueryClient();
  async function previewClaims() {
    try {
      const simulation = await simulateContract(config, {
        chainId,
        account: wallet,
        address: factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "claimEverything",
        args: [addresses],
      });
      return { simulation, blocked: undefined };
    } catch (error) {
      const reverted =
        error instanceof BaseError &&
        error.walk((cause) => cause instanceof ContractFunctionRevertedError);
      if (reverted instanceof ContractFunctionRevertedError) {
        const args = reverted.data?.args;
        if (reverted.data?.errorName === "ClaimAccountingBehind" && args) {
          const index = Number(args[0]);
          const tier = args[1] as Address;
          if (batch[index]?.tier.toLowerCase() === tier.toLowerCase())
            return {
              simulation: undefined,
              blocked: { tier, name: batch[index].name },
            };
        }
        if (reverted.data?.errorName === "ClaimFailed" && args)
          throw new Error(
            `${batch[Number(args[0])]?.name ?? args[1]}: ${decodeTransactionError(error)}`,
          );
      }
      throw error;
    }
  }
  const preview = useQuery({
    queryKey: [
      "account-rewards",
      chainId,
      factoryAddress,
      wallet,
      ...addresses,
    ],
    queryFn: previewClaims,
    enabled: Boolean(client) && addresses.length > 0,
    retry: false,
    refetchInterval: 30_000,
  });
  const action = useMutation({
    retry: false,
    mutationFn: async (advanceTier: Address | undefined) => {
      if (
        !client ||
        account.address?.toLowerCase() !== wallet.toLowerCase() ||
        account.chainId !== chainId
      )
        throw new Error("Connect this wallet on the membership network.");
      const fresh = await previewClaims();
      if (fresh.blocked?.tier.toLowerCase() !== advanceTier?.toLowerCase()) {
        await preview.refetch();
        throw new Error(
          "Rewards updated. Review the next action before continuing.",
        );
      }
      let hash: `0x${string}`;
      let router: Address | undefined;
      if (fresh.blocked) {
        router = await client.readContract({
          address: factoryAddress,
          abi: membershipFactoryAbi,
          functionName: "burnRouter",
        });
        const simulation = await simulateContract(config, {
          chainId,
          account: wallet,
          address: router,
          abi: protocolBurnRouterAbi,
          functionName: "advanceAccounting",
          args: [[{ tier: fresh.blocked.tier, maxAccountingSteps: 25n }]],
        });
        await assertSufficientGas(client, wallet, simulation.request);
        hash = await write.writeContractAsync(simulation.request);
      } else {
        if (
          !fresh.simulation.result.some(
            (item) => item.reward + item.referral + item.creator > 0n,
          )
        )
          throw new Error("No rewards are available to claim.");
        await assertSufficientGas(client, wallet, fresh.simulation.request);
        hash = await write.writeContractAsync(fresh.simulation.request);
      }
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
          "The transaction reverted. Your funds remain available.",
        );
      if (router) {
        const outcome = receiptAdvance(receipt, { router, caller: wallet });
        if (
          !outcome?.accounting.some(
            (item) =>
              item.tier.toLowerCase() === fresh.blocked!.tier.toLowerCase(),
          )
        )
          throw new Error(
            "The receipt does not confirm this accounting advance.",
          );
      } else {
        const events = parseEventLogs({
          abi: membershipFactoryAbi,
          logs: receipt.logs,
          eventName: "EverythingClaimed",
        });
        if (
          !events.some(
            (event) =>
              event.address.toLowerCase() === factoryAddress.toLowerCase() &&
              event.args.beneficiary.toLowerCase() === wallet.toLowerCase() &&
              event.args.tierCount === BigInt(addresses.length),
          )
        )
          throw new Error("The receipt does not confirm these claims.");
      }
      const refresh = await Promise.allSettled([
        cache.invalidateQueries(
          { queryKey: ["account-rewards", chainId, factoryAddress, wallet] },
          { throwOnError: true },
        ),
        cache.invalidateQueries(
          { queryKey: ["account-discovery"] },
          { throwOnError: true },
        ),
        cache.invalidateQueries(
          { queryKey: ["protocol", chainId] },
          { throwOnError: true },
        ),
      ]);
      return {
        advanced: Boolean(router),
        refreshFailed: refresh.some((result) => result.status === "rejected"),
      };
    },
  });
  const totals = new Map<Address, bigint>();
  preview.data?.simulation?.result.forEach((result, index) => {
    const token = batch[index].paymentToken;
    const amount = result.reward + result.referral + result.creator;
    if (amount > 0n) totals.set(token, (totals.get(token) ?? 0n) + amount);
  });
  const tokens = [...totals.keys()];
  const usd = useQuery({
    queryKey: ["account-reward-usd", chainId, factoryAddress, ...tokens],
    queryFn: () => readRewardUsdPrices(client!, factoryAddress, tokens),
    enabled:
      Boolean(client) &&
      tokens.length > 0 &&
      (chainId === 31337 || chainId === 4663),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const blocked = preview.data?.blocked;
  return (
    <section aria-label="Rewards" className="account-rewards protocol-section">
      <div className="account-rewards-heading">
        <p className="eyebrow">
          {totals.size > 0 ? "Ready to collect" : "Earnings"}
        </p>
        <h2 className="font-display">Your rewards</h2>
      </div>
      <div aria-live="polite" className="account-reward-balances">
        {addresses.length === 0 ? (
          "No rewards found yet."
        ) : preview.isPending ? (
          "Checking rewards…"
        ) : blocked ? (
          <>
            Advance{" "}
            <Link href={`/chains/${chainId}/tiers/${blocked.tier}`}>
              {blocked.name}
            </Link>{" "}
            to claim.
          </>
        ) : preview.isError ? (
          <span role="alert">{decodeTransactionError(preview.error)}</span>
        ) : totals.size === 0 ? (
          "All claimed."
        ) : (
          [...totals].map(([token, amount]) => (
            <div className="account-reward-balance" key={token}>
              <p className="account-reward-amount">
                {formatAmount(amount, token)}
              </p>
              <p className="account-reward-usd">
                {(() => {
                  const quote = usd.data?.find((item) => item.token === token);
                  return quote
                    ? `≈ ${formatRewardUsd(amount, quote.price, navigator.language)}`
                    : usd.isError
                      ? "USD estimate unavailable"
                      : " ";
                })()}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="creator-actions">
        <button
          className="button button-dark"
          type="button"
          disabled={
            action.isPending ||
            preview.isError ||
            (!blocked && totals.size === 0) ||
            account.chainId !== chainId
          }
          onClick={() => action.mutate(blocked?.tier)}
        >
          {action.isPending
            ? "Working…"
            : blocked
              ? "Advance accounting"
              : pages > 1
                ? "Claim this batch"
                : "Claim everything"}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={
            action.isPending || preview.isFetching || addresses.length === 0
          }
          onClick={() => {
            void preview.refetch();
            void usd.refetch();
          }}
        >
          Refresh
        </button>
        {pages > 1 && (
          <>
            <button
              className="text-button"
              type="button"
              disabled={action.isPending || currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Batch {currentPage + 1} of {pages}
            </span>
            <button
              className="text-button"
              type="button"
              disabled={action.isPending || currentPage + 1 === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </>
        )}
      </div>
      {!complete && (
        <p className="small-copy">
          Check the remaining memberships below to include all rewards.
        </p>
      )}
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {action.data && (
        <p role="status">
          {action.data.advanced ? "Accounting advanced." : "Rewards claimed."}
          {action.data.refreshFailed && " Refresh to update the balances."}
        </p>
      )}
    </section>
  );
}
