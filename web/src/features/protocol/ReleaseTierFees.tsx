"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import { parseEventLogs, type Address } from "viem";
import { membershipTierAbi } from "@/contracts";
import type { SupportedChainId } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { decodeTransactionError } from "@/lib/transaction-state";
import { assertSufficientGas } from "./gas-readiness";

export function ReleaseTierFees({
  chainId,
  tier,
  blockNumber,
}: {
  chainId: SupportedChainId;
  tier: Address;
  blockNumber: bigint;
}) {
  const account = useHydratedAccount();
  const config = useConfig();
  const client = usePublicClient({ chainId });
  const write = useWriteContract();
  const cache = useQueryClient();
  const [offset, setOffset] = useState(0n);
  async function readPage() {
    if (!client) throw new Error("The network is unavailable.");
    const block = await client.getBlockNumber();
    const [total, held, limit] = await Promise.all([
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "totalMinted",
        blockNumber: block,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "protocolFeeEarnedHeld",
        blockNumber: block,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "MAX_SYNC_BATCH_SIZE",
        blockNumber: block,
      }),
    ]);
    const end = total < offset + limit ? total : offset + limit;
    const ids = Array.from(
      { length: Number(end > offset ? end - offset : 0n) },
      (_, i) => offset + BigInt(i) + 1n,
    );
    const states = await Promise.all(
      ids.map((id) =>
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "protocolFeeState",
          args: [id],
          blockNumber: block,
        }),
      ),
    );
    return {
      total,
      held,
      limit,
      end,
      eligible: ids.filter((_, i) => states[i].uncheckpointedEarned > 0n),
    };
  }
  const page = useQuery({
    queryKey: [
      "protocol",
      chainId,
      "fee-actions",
      tier,
      offset.toString(),
      blockNumber.toString(),
    ],
    enabled: Boolean(client),
    queryFn: readPage,
    retry: false,
  });
  const action = useMutation({
    retry: false,
    mutationFn: async (kind: "accrue" | "release") => {
      if (!client || !account.address || account.chainId !== chainId)
        throw new Error("Connect your wallet on this network.");
      const current = await readPage();
      if (kind === "accrue" && current.eligible.length === 0)
        throw new Error(
          "No fees await accrual in this batch. Refresh or check the next batch.",
        );
      if (kind === "release" && current.held === 0n)
        throw new Error("No earned fees await release. Accrue fees first.");
      const request =
        kind === "accrue"
          ? (
              await simulateContract(config, {
                account: account.address,
                chainId,
                address: tier,
                abi: membershipTierAbi,
                functionName: "accrueProtocolFees",
                args: [current.eligible],
              })
            ).request
          : (
              await simulateContract(config, {
                account: account.address,
                chainId,
                address: tier,
                abi: membershipTierAbi,
                functionName: "releaseProtocolFees",
              })
            ).request;
      await assertSufficientGas(client, account.address, request);
      const hash =
        request.functionName === "accrueProtocolFees"
          ? await write.writeContractAsync(request)
          : await write.writeContractAsync(request);
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled ||= replacement.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled this transaction.");
      if (receipt.status !== "success")
        throw new Error("The fee transaction reverted.");
      const events = parseEventLogs({
        abi: membershipTierAbi,
        logs: receipt.logs,
      }).filter((log) => log.address.toLowerCase() === tier.toLowerCase());
      const confirmed =
        kind === "accrue"
          ? events.some(
              (log) =>
                log.eventName === "ProtocolFeesAccrued" &&
                current.eligible.includes(log.args.tokenId) &&
                log.args.amount > 0n,
            )
          : events.some(
              (log) =>
                log.eventName === "ProtocolFeesReleased" &&
                log.args.amount > 0n,
            );
      if (!confirmed)
        throw new Error(
          "The receipt does not confirm the requested fee action. Refresh activity.",
        );
      const refresh = await Promise.allSettled([
        cache.invalidateQueries(
          { queryKey: ["protocol", chainId] },
          { throwOnError: true },
        ),
      ]);
      return {
        kind,
        hash: receipt.transactionHash,
        refreshFailed: refresh.some((item) => item.status === "rejected"),
      };
    },
  });
  const blocked =
    !account.isConnected ||
    account.chainId !== chainId ||
    action.isPending ||
    page.isFetching ||
    page.isError;
  return (
    <section aria-label="Release tier fees" className="protocol-section">
      <h3>Move earned fees into the buyback vault</h3>
      <p>
        Anyone can accrue and release fees. You pay network gas; the funds
        always go to the protocol buyback vault.
      </p>
      <p>
        First accrue elapsed membership fees, then release them. Afterwards, use
        Process membership fees in the USDG or other payment-token section
        above.
      </p>
      {page.data && (
        <p className="small-copy">
          Membership IDs{" "}
          {page.data.end > offset ? (offset + 1n).toString() : "0"}–
          {page.data.end.toString()} of {page.data.total.toString()}.{" "}
          {page.data.eligible.length} have fees awaiting accrual. Release
          includes all fees already accrued for this tier.
        </p>
      )}
      <div className="creator-actions">
        <button
          type="button"
          className="button button-dark"
          disabled={blocked || !page.data?.eligible.length}
          onClick={() => action.mutate("accrue")}
        >
          Accrue fees
        </button>
        <button
          type="button"
          className="button button-dark"
          disabled={blocked || !page.data?.held}
          onClick={() => action.mutate("release")}
        >
          Release earned fees
        </button>
        <button
          type="button"
          className="button button-light"
          disabled={action.isPending || page.isFetching}
          onClick={() => void page.refetch()}
        >
          Refresh fee eligibility
        </button>
        {offset > 0n && page.data && (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => setOffset(offset - page.data!.limit)}
          >
            Previous membership batch
          </button>
        )}
        {page.data && page.data.end < page.data.total && (
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => setOffset(page.data!.end)}
          >
            Next membership batch
          </button>
        )}
      </div>
      {!account.isConnected ? (
        <p>Connect a wallet to continue.</p>
      ) : account.chainId !== chainId ? (
        <p>Switch your wallet to this network.</p>
      ) : null}
      {page.isError && (
        <p role="alert">
          Fee eligibility could not be read. Refresh to try again.
        </p>
      )}
      {action.isPending && (
        <p role="status">
          {write.isPending
            ? "Confirm in your wallet."
            : "Checking fees and waiting for confirmation…"}
        </p>
      )}
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {action.data && (
        <p role="status">
          {action.data.kind === "accrue"
            ? "Fees accrued. Release earned fees next."
            : "Fees released. You can now process them in the payment-token section above."}
          {action.data.refreshFailed &&
            " Refresh activity to load the updated totals."}
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
