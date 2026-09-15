"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { membershipFactoryAbi, protocolBurnRouterAbi } from "@/contracts";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { type SupportedChainId } from "@/lib/chains";
import { decodeTransactionError } from "@/lib/transaction-state";
import { formatRawTokenAmount } from "@/lib/token-amount";
import { receiptAdvance } from "@/features/protocol/buyback-reconciliation";

export function ReleaseOperatorFees({
  chainId,
  factory,
  tiers,
  display,
  onReleased,
  onBusy,
  disabled,
}: {
  chainId: SupportedChainId;
  factory: Address;
  tiers: readonly Address[];
  display: { symbol: string; decimals: number; multiplier: bigint };
  onReleased: () => void;
  onBusy: (busy: boolean) => void;
  disabled: boolean;
}) {
  const client = usePublicClient({ chainId }),
    config = useConfig(),
    account = useHydratedAccount(),
    write = useWriteContract(),
    cache = useQueryClient();
  const action = useMutation({
    retry: false,
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    mutationFn: async () => {
      if (!client || !account.address || account.chainId !== chainId)
        throw new Error("Connect your wallet on this network to release fees.");
      const selected = [...tiers]
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .slice(0, 8);
      if (!selected.length)
        throw new Error("Refresh funds to check for newly earned fees.");
      const router = await client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "burnRouter",
      });
      const block = await client.getBlock();
      // Shared, bounded accounting work. An empty purchase list never performs a market trade.
      const plans = selected.map((tier, i) => ({
        tier,
        maxAccountingSteps: BigInt(
          Math.floor(25 / selected.length) + (i < 25 % selected.length ? 1 : 0),
        ),
      }));
      const simulation = await simulateContract(config, {
        address: router,
        abi: protocolBurnRouterAbi,
        functionName: "advance",
        args: [plans, [], block.timestamp + 120n],
        chainId,
        account: account.address,
        ...(chainId === 31337 ? { gasPrice: 100_000_000n } : {}),
      });
      onReleased();
      const hash = await write.writeContractAsync(simulation.request);
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (r) => {
          cancelled = r.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled fee release.");
      if (receipt.status !== "success")
        throw new Error("Fee release reverted. Refresh funds before retrying.");
      const result = receiptAdvance(receipt, {
        router,
        caller: account.address,
      });
      if (
        !result ||
        result.completed.purchases !== 0n ||
        result.completed.burned !== 0n
      )
        throw new Error(
          "The receipt does not confirm the requested fee release.",
        );
      const amount = result.releases
        .filter((r) =>
          selected.some((tier) => tier.toLowerCase() === r.tier.toLowerCase()),
        )
        .reduce((sum, r) => sum + r.amount, 0n);
      await Promise.allSettled([
        cache.invalidateQueries({ queryKey: ["protocol", chainId] }),
      ]);
      return { amount, display };
    },
  });
  return (
    <div>
      <button
        type="button"
        className="button button-light"
        disabled={
          disabled ||
          action.isPending ||
          !account.isConnected ||
          account.chainId !== chainId ||
          tiers.length === 0
        }
        onClick={() => action.mutate()}
      >
        {action.isPending ? "Releasing fees…" : "Release earned fees"}
      </button>
      <p className="small-copy">
        Move earned membership fees into the buyback balance. Your wallet signs
        this release first, then you review the buyback. Large backlogs may need
        another release.
      </p>
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {action.data && (
        <p role="status">
          {action.data.amount > 0n
            ? `Released ${formatRawTokenAmount({ raw: action.data.amount, ...action.data.display })} ${action.data.display.symbol}. Funds are ready for a buyback.`
            : "Accounting advanced. Refresh funds and release the remaining earned fees."}
        </p>
      )}
    </div>
  );
}
