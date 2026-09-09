"use client";

import { useMutation } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, type Address } from "viem";
import { formatRawTokenAmount, tokenMultiplierScale } from "@/lib/token-amount";
import { protocolBuybackVaultAbi } from "@/contracts";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { decodeTransactionError } from "@/lib/transaction-state";
import { receiptBuyback } from "./buyback-reconciliation";

export const buybackStatusLabels = [
  "Ready to process",
  "No released inventory",
  "Buybacks paused",
  "Route needed",
  "Batch settings needed",
  "Waiting for the minimum batch amount",
  "Waiting for the next eligible buy",
  "Launch penalty active",
  "Graduation pending",
  "Protocol token has not been deployed",
];

export function ProcessBuyback({
  chainId,
  vault,
  asset,
  bucket,
  status,
  amount,
  nextEligibleAt,
  fresh,
  onProcessed,
  protocolTokenSymbol,
}: {
  chainId: SupportedChainId;
  vault: Address;
  asset: Address;
  bucket: 0 | 1;
  status?: number;
  amount: bigint;
  nextEligibleAt?: bigint;
  fresh: boolean;
  onProcessed: () => Promise<unknown>;
  protocolTokenSymbol?: string;
}) {
  const account = useHydratedAccount(),
    config = useConfig(),
    client = usePublicClient({ chainId }),
    write = useWriteContract();
  const action = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!client || !account.address || account.chainId !== chainId || !fresh)
        throw new Error(
          "Connect a wallet on this network and refresh the protocol state.",
        );
      const current = await client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "processingStatus",
        args: [asset, bucket],
      });
      if (current.status !== 0 || current.maxInput === 0n)
        throw new Error(
          buybackStatusLabels[current.status] ?? "Processing is unavailable.",
        );
      const now = (await client.getBlock()).timestamp;
      const simulation = await simulateContract(config, {
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "process",
        args: [asset, bucket, current.maxInput, current.revision, now + 120n],
        chainId,
        account: account.address,
        ...(chainId === 31337 ? { gasPrice: 2_000_000_000n } : {}),
      });
      const hash = await write.writeContractAsync(simulation.request);
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled = replacement.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled this transaction.");
      if (receipt.status !== "success")
        throw new Error(
          "The transaction reverted. Inventory and cooldowns were unchanged.",
        );
      const result = receiptBuyback(receipt, {
        vault,
        asset,
        bucket,
        amount: current.maxInput,
        revision: current.revision,
      });
      if (!result)
        throw new Error(
          "This receipt does not show the requested burn. Refresh the public inventory.",
        );
      // A failed follow-up read cannot undo a receipt-confirmed burn.
      const refreshed = await Promise.allSettled([
        client.readContract({
          address: vault,
          abi: protocolBuybackVaultAbi,
          functionName: "inventory",
          args: [asset, bucket],
          blockNumber: receipt.blockNumber,
        }),
        onProcessed(),
      ]);
      return {
        receipt,
        result,
        refreshUnavailable: refreshed.some(
          (item) => item.status === "rejected",
        ),
      };
    },
  });
  const blocked =
    !fresh ||
    !account.isConnected ||
    account.chainId !== chainId ||
    status !== 0 ||
    amount === 0n;
  const burned = action.data?.result.burned;
  const burnedAmount =
    burned === undefined
      ? undefined
      : formatRawTokenAmount({
          raw: burned,
          decimals: 18,
          multiplier: tokenMultiplierScale,
        }).replace(/^(\d+)/, (whole) => BigInt(whole).toLocaleString("en-US"));
  const tokenLabel = protocolTokenSymbol || "protocol tokens";
  const hash = action.data?.receipt.transactionHash ?? write.data;
  const explorer = getSupportedChain(chainId).blockExplorers?.default.url;
  return (
    <div className="buyback-action">
      <button
        type="button"
        className="button button-dark"
        disabled={blocked || action.isPending}
        onClick={() => action.mutate()}
      >
        {action.isPending
          ? "Processing…"
          : bucket === 0
            ? "Process membership fees"
            : "Process donation"}
      </button>
      <p className="small-copy">
        {!account.isConnected
          ? "Connect a wallet to process. You pay network gas."
          : account.chainId !== chainId
            ? "Switch your wallet to this network."
            : status === undefined
              ? "Market eligibility is unavailable."
              : buybackStatusLabels[status]}
      </p>
      {status === 6 && nextEligibleAt !== undefined && nextEligibleAt > 0n && (
        <p className="small-copy">
          Next eligible buy:{" "}
          {new Date(Number(nextEligibleAt) * 1000).toLocaleString()} (chain
          time).
        </p>
      )}
      {action.isPending && (
        <p role="status">
          {write.isPending
            ? "Confirm in your wallet."
            : "Waiting for the network and checking the burn."}
        </p>
      )}
      {action.error && (
        <p role="alert" className="inline-status">
          {decodeTransactionError(action.error)}
        </p>
      )}
      {action.data && (
        <p role="status">
          Burn complete.{" "}
          <span
            title={`${formatUnits(action.data.result.burned, 18)} ${tokenLabel}`}
          >
            {burnedAmount} {tokenLabel}
          </span>{" "}
          permanently removed from supply.
          {action.data.refreshUnavailable &&
            " The updated inventory is unavailable; refresh activity to try again."}
        </p>
      )}
      {hash &&
        (explorer ? (
          <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
            View transaction
          </a>
        ) : (
          <details className="technical-details">
            <summary>Transaction ID</summary>
            <code>{hash}</code>
          </details>
        ))}
    </div>
  );
}
