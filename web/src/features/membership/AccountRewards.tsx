"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
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
  receiptRetiredReward,
  receiptSelectedRewards,
} from "@/features/protocol/payout-reconciliation";
import {
  readAccountRewards,
  type TierClaimSelection,
} from "./account-rewards-read";
import { RetiredRewardClaim } from "./RetiredRewardClaim";
import type { CachedAccountTier } from "./account-cache";

function EndedRewards({
  tier,
  wallet,
  chainId,
  pending,
  canClaim,
  onClaim,
  formatAmount,
}: {
  tier: CachedAccountTier;
  wallet: Address;
  chainId: ReadyDeployment["chainId"];
  pending: boolean;
  canClaim: boolean;
  onClaim: () => void;
  formatAmount: (amount: bigint, token: Address) => string;
}) {
  const client = usePublicClient({ chainId });
  const credit = useQuery({
    queryKey: ["retired-credit", chainId, tier.tier, wallet],
    enabled: Boolean(client),
    retry: false,
    queryFn: () =>
      client!.readContract({
        address: tier.tier,
        abi: membershipTierAbi,
        functionName: "claimableRetiredReward",
        args: [wallet],
      }),
  });
  return (
    <RetiredRewardClaim
      credit={credit.data}
      canClaim={canClaim}
      onClaim={onClaim}
      paymentLabel={(raw) => formatAmount(raw, tier.paymentToken)}
      loading={credit.isPending}
      pending={pending}
      stale={credit.isError}
      error={credit.error ? decodeTransactionError(credit.error) : undefined}
    />
  );
}

type ClaimAction =
  | { kind: "claim" }
  | { kind: "maintenance"; tier: Address }
  | { kind: "retired"; tier: Address };
export function AccountRewards({
  deployment,
  wallet,
  tiers,
  complete,
  formatAmount,
  onRefresh,
}: {
  deployment: ReadyDeployment;
  wallet: Address;
  tiers: readonly CachedAccountTier[];
  complete: boolean;
  formatAmount: (amount: bigint, token: Address) => string;
  onRefresh?: () => void;
}) {
  const { chainId, factoryAddress } = deployment;
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<TierClaimSelection[]>([]);
  const selectionHeading = useRef<HTMLHeadingElement>(null);
  const pages = Math.max(1, Math.ceil(tiers.length / 8));
  const currentPage = Math.min(page, pages - 1);
  const visible = tiers.slice(currentPage * 8, currentPage * 8 + 8);
  const count = selection.reduce((n, item) => n + item.tokenIds.length, 0);
  const config = useConfig();
  const account = useHydratedAccount();
  const client = usePublicClient({ chainId });
  const write = useWriteContract();
  const cache = useQueryClient();
  const walletReady =
    account.chainId === chainId &&
    account.address?.toLowerCase() === wallet.toLowerCase();
  const preview = useQuery({
    queryKey: [
      "account-rewards",
      chainId,
      factoryAddress,
      wallet,
      selection.map((item) => [item.tier, item.tokenIds.map(String)]),
    ],
    queryFn: () => readAccountRewards(client!, wallet, selection),
    enabled: Boolean(client) && selection.length > 0,
    retry: false,
    refetchInterval: 15_000,
  });
  function select(
    tier: CachedAccountTier,
    id: bigint | undefined,
    checked: boolean,
  ) {
    setSelection((previous) => {
      const current = previous.find(
        (item) => item.tier.toLowerCase() === tier.tier.toLowerCase(),
      );
      const rest = previous.filter((item) => item !== current);
      if (!checked && id === undefined) return rest;
      const tokenIds =
        id === undefined
          ? (current?.tokenIds ?? [])
          : checked
            ? [...(current?.tokenIds ?? []), id]
            : (current?.tokenIds.filter((token) => token !== id) ?? []);
      const next = [...rest, { tier: tier.tier, name: tier.name, tokenIds }];
      return next.length <= 8 &&
        next.reduce((n, item) => n + item.tokenIds.length, 0) <= 32
        ? next
        : previous;
    });
  }
  const action = useMutation({
    retry: false,
    onError: () => {
      void preview.refetch();
    },
    mutationFn: async (intent: ClaimAction) => {
      if (!client || !walletReady)
        throw new Error("Connect this wallet on the membership network.");
      let send: () => Promise<`0x${string}`>;
      if (intent.kind === "retired") {
        const { request } = await simulateContract(config, {
          chainId,
          account: wallet,
          address: intent.tier,
          abi: membershipTierAbi,
          functionName: "claimRetiredRewards",
        });
        await assertSufficientGas(client, wallet, request);
        send = () => write.writeContractAsync(request);
      } else {
        const fresh = await readAccountRewards(client, wallet, selection);
        if (intent.kind === "maintenance") {
          if (fresh.blocked?.tier.toLowerCase() !== intent.tier.toLowerCase())
            throw new Error(
              "Accounting changed. Review the refreshed preview before continuing.",
            );
          const { request } = await simulateContract(config, {
            chainId,
            account: wallet,
            address: intent.tier,
            abi: membershipTierAbi,
            functionName: "processAccounting",
            args: [25n],
          });
          await assertSufficientGas(client, wallet, request);
          send = () => write.writeContractAsync(request);
        } else {
          if (!selection.length || !fresh.complete)
            throw new Error(
              "Update accounting before claiming this selection.",
            );
          if (
            !fresh.results.some(
              (item) =>
                item.reward + item.retired + item.referral + item.creator > 0n,
            )
          )
            throw new Error(
              "No whole rewards are available for this selection.",
            );
          const { request } = await simulateContract(config, {
            chainId,
            account: wallet,
            address: factoryAddress,
            abi: membershipFactoryAbi,
            functionName: "claimEverything",
            args: [selection.map(({ tier, tokenIds }) => ({ tier, tokenIds }))],
          });
          await assertSufficientGas(client, wallet, request);
          send = () => write.writeContractAsync(request);
        }
      }
      const hash = await send();
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled ||= replacement.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled this transaction.");
      if (!isSuccessfulWriteReceipt(receipt))
        throw new Error(
          "The transaction reverted. No claims or maintenance were saved.",
        );
      const paid = new Map<Address, bigint>();
      let outcome: string;
      if (intent.kind === "maintenance") {
        const result = receiptMembershipMaintenance(receipt, intent.tier);
        if (!result)
          throw new Error(
            "The successful receipt did not confirm this maintenance.",
          );
        outcome = `Accounting saved ${result.processedSteps} steps. ${result.complete ? "This tier is caught up." : "More maintenance remains."} Review the selection before claiming.`;
      } else if (intent.kind === "retired") {
        const result = receiptRetiredReward(receipt, {
          tier: intent.tier,
          owner: wallet,
        });
        if (!result)
          throw new Error(
            "The successful receipt did not confirm this ended reward claim.",
          );
        const tier = tiers.find(
          (item) => item.tier.toLowerCase() === intent.tier.toLowerCase(),
        )!;
        paid.set(tier.paymentToken, result.amount);
        outcome = "Ended membership rewards claimed.";
      } else {
        const results = receiptSelectedRewards(receipt, {
          factory: factoryAddress,
          owner: wallet,
          selection,
        });
        for (const result of results) {
          const tier = tiers.find(
            (item) => item.tier.toLowerCase() === result.tier.toLowerCase(),
          );
          if (!tier)
            throw new Error(
              "Refresh the tier's payment token to display this successful payout.",
            );
          const total =
            result.liveReward +
            result.retiredReward +
            result.referral +
            result.creator;
          paid.set(
            tier.paymentToken,
            (paid.get(tier.paymentToken) ?? 0n) + total,
          );
        }
        outcome =
          "Selected rewards claimed. Selection cleared; refresh to select remaining positions.";
        setSelection([]);
      }
      const affectedTiers =
        intent.kind === "claim"
          ? selection.map((item) => item.tier)
          : [intent.tier];
      const refreshed = await Promise.allSettled(
        affectedTiers.map((tier) =>
          invalidateMembershipReads(cache, receipt, {
            chainId,
            tier,
            owners: [wallet],
          }),
        ),
      );
      onRefresh?.();
      selectionHeading.current?.focus();
      return `${outcome} ${[...paid].map(([token, amount]) => `Paid ${formatAmount(amount, token)}.`).join(" ")}${refreshed.some((item) => item.status === "rejected") ? " Refresh to update balances." : ""}`;
    },
  });
  const totals = new Map<Address, bigint>();
  const failure =
    action.error instanceof BaseError
      ? action.error.walk(
          (cause) => cause instanceof ContractFunctionRevertedError,
        )
      : undefined;
  const failedArgs =
    failure instanceof ContractFunctionRevertedError &&
    ["ClaimFailed", "ClaimAccountingBehind"].includes(
      failure.data?.errorName ?? "",
    )
      ? failure.data?.args
      : undefined;
  const failedTier = selection.find(
    (item, index) =>
      BigInt(index) === failedArgs?.[0] &&
      item.tier.toLowerCase() === String(failedArgs?.[1]).toLowerCase(),
  );
  preview.data?.results.forEach((result, index) => {
    const tier = tiers.find(
      (item) =>
        item.tier.toLowerCase() === selection[index]?.tier.toLowerCase(),
    );
    if (tier)
      totals.set(
        tier.paymentToken,
        (totals.get(tier.paymentToken) ?? 0n) +
          result.reward +
          result.retired +
          result.referral +
          result.creator,
      );
  });
  return (
    <section
      aria-label="Rewards"
      className="account-rewards protocol-section"
      aria-busy={action.isPending}
    >
      <h2 ref={selectionHeading} tabIndex={-1} className="font-display">
        Your rewards
      </h2>
      <p>
        Select up to 32 memberships across 8 tiers. Each selected tier includes
        your ended membership, referral and creator rewards once.
      </p>
      <p role="status">
        {count} memberships across {selection.length} tiers selected.
      </p>
      {!complete && (
        <p>
          Discovery is incomplete. These totals cover only the selected
          positions and tier balances.
        </p>
      )}
      {visible.map((tier) => {
        const selected = selection.find(
          (item) => item.tier.toLowerCase() === tier.tier.toLowerCase(),
        );
        return (
          <fieldset
            key={tier.tier}
            disabled={action.isPending}
            className="control-group"
          >
            <legend>{tier.name}</legend>
            <label>
              <input
                type="checkbox"
                checked={Boolean(selected)}
                disabled={!selected && selection.length >= 8}
                onChange={(event) =>
                  select(tier, undefined, event.target.checked)
                }
              />
              Include {tier.name} tier rewards
            </label>
            {tier.positions.map((position) => (
              <label key={position.tokenId} className="creator-field">
                <span>
                  <input
                    type="checkbox"
                    checked={
                      selected?.tokenIds.includes(BigInt(position.tokenId)) ??
                      false
                    }
                    disabled={
                      !selected?.tokenIds.includes(BigInt(position.tokenId)) &&
                      (count >= 32 || (!selected && selection.length >= 8))
                    }
                    onChange={(event) =>
                      select(
                        tier,
                        BigInt(position.tokenId),
                        event.target.checked,
                      )
                    }
                  />
                  {tier.name} membership #{position.tokenId}
                </span>
              </label>
            ))}
            {!tier.ownerComplete && (
              <p>More memberships in this tier are available below.</p>
            )}
            <EndedRewards
              tier={tier}
              wallet={wallet}
              chainId={chainId}
              pending={action.isPending}
              canClaim={walletReady}
              onClaim={() =>
                action.mutate({ kind: "retired", tier: tier.tier })
              }
              formatAmount={formatAmount}
            />
          </fieldset>
        );
      })}
      {selection.length > 0 && (
        <button
          type="button"
          disabled={action.isPending}
          onClick={() => {
            setSelection([]);
            selectionHeading.current?.focus();
          }}
        >
          Clear selection
        </button>
      )}
      {selection.length === 0 ? (
        <p>No rewards selected.</p>
      ) : preview.isPending ? (
        <p role="status">Checking selected rewards…</p>
      ) : preview.isError ? (
        <p role="alert">
          Unable to refresh selected rewards.{" "}
          {decodeTransactionError(preview.error)} Refresh memberships and review
          stale selections.
        </p>
      ) : (
        <>
          {preview.isFetching && <p>Refreshing selected totals…</p>}
          {[...totals].map(([token, amount]) => (
            <p key={token}>
              {preview.data?.complete
                ? "Selected rewards"
                : "Partial selected rewards"}
              : {formatAmount(amount, token)}
            </p>
          ))}
          {preview.data && !preview.data.complete && (
            <p>
              Partial projection. Maintenance remains; this is not a final
              claimable total.
            </p>
          )}
          {preview.data?.complete &&
            [...totals.values()].every((amount) => amount === 0n) && (
              <p>
                No whole rewards for this selection. Fractional credit remains
                preserved.
              </p>
            )}
        </>
      )}
      <div className="button-row">
        <button
          className="button button-dark"
          type="button"
          disabled={
            !walletReady ||
            action.isPending ||
            !selection.length ||
            preview.isPending ||
            preview.isError ||
            !preview.data?.complete ||
            ![...totals.values()].some((amount) => amount > 0n)
          }
          onClick={() => action.mutate({ kind: "claim" })}
        >
          Claim selected rewards
        </button>
        {preview.data?.blocked && (
          <button
            className="button button-outline"
            type="button"
            disabled={!walletReady || action.isPending || preview.isError}
            onClick={() =>
              action.mutate({
                kind: "maintenance",
                tier: preview.data!.blocked!.tier,
              })
            }
          >
            Advance accounting for {preview.data.blocked.name}
          </button>
        )}
        <button
          type="button"
          disabled={action.isPending || preview.isFetching || !selection.length}
          onClick={() => void preview.refetch()}
        >
          Refresh selected rewards
        </button>
        {pages > 1 && (
          <>
            <button
              type="button"
              disabled={action.isPending || currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous reward tiers
            </button>
            <span>
              Tier page {currentPage + 1} of {pages}
            </span>
            <button
              type="button"
              disabled={action.isPending || currentPage + 1 === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              More reward tiers
            </button>
          </>
        )}
      </div>
      {action.isPending && (
        <p role="status">Waiting for wallet confirmation…</p>
      )}
      {action.error && (
        <p role="alert">
          {failedTier ? `${failedTier.name}: ` : ""}
          {decodeTransactionError(action.error)}
        </p>
      )}
      {action.data && <p role="status">{action.data}</p>}
    </section>
  );
}
