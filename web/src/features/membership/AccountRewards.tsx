"use client";
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccount, simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import type { Address } from "viem";
import { membershipTierAbi, membershipFactoryAbi } from "@/contracts";
import type { ReadyDeployment } from "@/lib/config";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { decodeTransactionError } from "@/lib/transaction-state";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import {
  invalidateMembershipReads,
  isSuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";
import {
  receiptMembershipMaintenance,
  receiptSelectedRewards,
} from "@/features/protocol/payout-reconciliation";
import { readAccountRewards } from "./account-rewards-read";
import {
  canReduceClaim,
  claimPrefix,
  claimUnits,
  discoverClaimAll,
  refreshClaimScope,
  removeClaimed,
  type ClaimAllScope,
} from "./claim-all";
export function AccountRewards({
  deployment,
  wallet,
  onRefresh,
  children,
}: {
  deployment: ReadyDeployment;
  wallet: Address;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  const { chainId, factoryAddress } = deployment;
  const config = useConfig();
  const account = useHydratedAccount();
  const client = usePublicClient({ chainId });
  const write = useWriteContract();
  const cache = useQueryClient();
  const walletReady =
    account.chainId === chainId &&
    account.address?.toLowerCase() === wallet.toLowerCase();
  const allScope = useRef<ClaimAllScope | null>(null);
  const [canResumeAll, setCanResumeAll] = useState(false);
  const [allProgress, setAllProgress] = useState("");
  const allAction = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!client || !walletReady)
        throw new Error("Connect this wallet on the membership network.");
      const current = allScope.current;
      if (
        !current ||
        current.wallet.toLowerCase() !== wallet.toLowerCase() ||
        current.chainId !== chainId ||
        current.factory.toLowerCase() !== factoryAddress.toLowerCase()
      ) {
        allScope.current = await discoverClaimAll(
          client,
          deployment,
          wallet,
          setAllProgress,
        );
      }
      const scope = allScope.current!;
      setCanResumeAll(scope.queue.length > 0);
      const ensureWallet = () => {
        const connected = getAccount(config);
        if (
          connected.address?.toLowerCase() !== wallet.toLowerCase() ||
          connected.chainId !== chainId
        )
          throw new Error("Wallet or network changed. Reconnect to resume.");
      };
      while (scope.queue.length) {
        ensureWallet();
        const previousCount = scope.queue.reduce(
          (sum, tier) => sum + tier.tokenIds.length,
          0,
        );
        scope.queue = await refreshClaimScope(client, wallet, scope.queue);
        scope.removedPositions +=
          previousCount -
          scope.queue.reduce((sum, tier) => sum + tier.tokenIds.length, 0);
        let units = claimUnits(scope.queue);
        let maintenanceBudget = 25n;
        while (true) {
          const batch = claimPrefix(scope.queue, units);
          let fresh;
          try {
            fresh = await readAccountRewards(client, wallet, batch);
          } catch (error) {
            if (units > 1 && canReduceClaim(error)) {
              units = Math.max(1, Math.floor(units / 2));
              continue;
            }
            throw error;
          }
          const blocked = fresh.blocked;
          if (
            !blocked &&
            !fresh.results.some(
              (item) =>
                item.reward + item.retired + item.referral + item.creator > 0n,
            )
          ) {
            removeClaimed(scope, batch);
            break;
          }
          let request;
          try {
            const simulation = blocked
              ? await simulateContract(config, {
                  chainId,
                  account: wallet,
                  address: blocked.tier,
                  abi: membershipTierAbi,
                  functionName: "processAccounting",
                  args: [maintenanceBudget],
                })
              : await simulateContract(config, {
                  chainId,
                  account: wallet,
                  address: factoryAddress,
                  abi: membershipFactoryAbi,
                  functionName: "claimEverything",
                  args: [
                    batch.map(({ tier, tokenIds }) => ({ tier, tokenIds })),
                    25n,
                  ],
                });
            request = simulation.request;
            const [gas, block] = await Promise.all([
              client.estimateContractGas(request as never),
              client.getBlock(),
            ]);
            if (gas * 5n > block.gasLimit * 4n)
              throw new Error(
                "Estimated gas exceeds the transaction gas limit.",
              );
          } catch (error) {
            if (blocked && maintenanceBudget > 1n && canReduceClaim(error)) {
              maintenanceBudget /= 2n;
              continue;
            }
            if (!blocked && units > 1 && canReduceClaim(error)) {
              units = Math.max(1, Math.floor(units / 2));
              continue;
            }
            throw error;
          }
          await assertSufficientGas(client, wallet, request);
          ensureWallet();
          setAllProgress(
            `${scope.completed} transactions confirmed. ${blocked ? `Updating accounting for ${blocked.name}` : `Claiming ${batch.reduce((n, tier) => n + tier.tokenIds.length, 0)} memberships across ${batch.length} tiers`}. Confirm in your wallet.`,
          );
          // Narrow the generated ABI union for wagmi without casting the request.
          const hash =
            request.functionName === "processAccounting"
              ? await write.writeContractAsync(request)
              : await write.writeContractAsync(request);
          let cancelled = false;
          const receipt = await client.waitForTransactionReceipt({
            hash,
            onReplaced: (replacement) => {
              cancelled ||= replacement.reason === "cancelled";
            },
          });
          if (cancelled || !isSuccessfulWriteReceipt(receipt))
            throw new Error(
              "This transaction was cancelled or reverted. Resume to claim remaining rewards.",
            );
          if (blocked) {
            const progress = receiptMembershipMaintenance(
              receipt,
              blocked.tier,
            );
            if (
              !progress ||
              (progress.processedSteps === 0n && !progress.complete)
            )
              throw new Error(
                "Maintenance did not confirm progress. Refresh before resuming.",
              );
          } else {
            receiptSelectedRewards(receipt, {
              factory: factoryAddress,
              owner: wallet,
              selection: batch,
            });
            removeClaimed(scope, batch);
          }
          scope.completed++;
          await Promise.all(
            batch.map((tier) =>
              invalidateMembershipReads(cache, receipt, {
                chainId,
                tier: tier.tier,
                owners: [wallet],
              }),
            ),
          );
          onRefresh?.();
          break;
        }
      }
      const message = scope.completed
        ? `All rewards claimed. ${scope.completed} transactions confirmed.`
        : "No whole rewards are available. Fractional credit remains preserved.";
      allScope.current = null;
      setCanResumeAll(false);
      setAllProgress(
        message +
          (scope.removedPositions
            ? ` ${scope.removedPositions} captured membership${scope.removedPositions === 1 ? "" : "s"} ended or changed owner. Preserved rewards belonging to you were included.`
            : ""),
      );
      return message;
    },
  });
  return (
    <section
      aria-label="Rewards"
      className="account-rewards protocol-section"
      aria-busy={allAction.isPending}
    >
      <div className="account-rewards-heading">
        <h2 className="font-display">Your rewards</h2>
      </div>
      {children}
      <div className="creator-actions">
        <button
          className="button button-dark"
          type="button"
          disabled={!walletReady || !client || allAction.isPending}
          onClick={() => allAction.mutate()}
        >
          {allAction.isPending
            ? "Claiming…"
            : canResumeAll
              ? "Resume claim all"
              : "Claim all"}
        </button>
      </div>
      {allProgress && <p role="status">{allProgress}</p>}
      {allAction.error && (
        <p role="alert">
          {decodeTransactionError(allAction.error)}{" "}
          {canResumeAll
            ? "Confirmed transactions remain completed. Resume to continue."
            : "Try Claim all again."}
        </p>
      )}
    </section>
  );
}
