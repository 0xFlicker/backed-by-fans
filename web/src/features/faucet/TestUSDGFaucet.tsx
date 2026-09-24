"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEventLogs, type Address } from "viem";
import { testUsdgAbi } from "@/contracts";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { type SupportedChainId } from "@/lib/chains";
import { decodeTransactionError } from "@/lib/transaction-state";
import {
  formatLocalizedTokenAmount,
  tokenMultiplierScale,
} from "@/lib/token-amount";
import { robinhoodTestnetFaucetUrl } from "@/lib/testnet-funding";

export function TestUSDGFaucet({
  chainId,
  address,
}: {
  chainId: SupportedChainId;
  address: Address;
}) {
  const account = useHydratedAccount();
  const client = usePublicClient({ chainId });
  const config = useConfig();
  const write = useWriteContract();
  const cache = useQueryClient();
  const queryKey = ["test-usdg-faucet", chainId, address, account.address];
  const state = useQuery({
    queryKey,
    enabled: Boolean(client && account.address),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!client || !account.address) throw new Error("Connect your wallet.");
      const block = await client.getBlock();
      const common = { address, abi: testUsdgAbi, blockNumber: block.number };
      const [nextClaimAt, balance, gas] = await Promise.all([
        client.readContract({
          ...common,
          functionName: "nextClaimAt",
          args: [account.address],
        }),
        client.readContract({
          ...common,
          functionName: "balanceOf",
          args: [account.address],
        }),
        client.getBalance({
          address: account.address,
          blockNumber: block.number,
        }),
      ]);
      return { nextClaimAt, balance, gas, timestamp: block.timestamp };
    },
  });
  const action = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!client || !account.address || account.chainId !== chainId)
        throw new Error("Connect your wallet on this network.");
      const claimant = account.address;
      const simulation = await simulateContract(config, {
        address,
        abi: testUsdgAbi,
        functionName: "claim",
        chainId,
        account: claimant,
        ...(chainId === 31337 ? { gasPrice: 2_000_000_000n } : {}),
      });
      const hash = await write.writeContractAsync(simulation.request);
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (r) => {
          cancelled = r.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("The claim was cancelled.");
      if (receipt.status !== "success")
        throw new Error(
          "The claim reverted. Refresh to check your next claim time.",
        );
      const claimed = parseEventLogs({
        abi: testUsdgAbi,
        eventName: "Claimed",
        logs: receipt.logs,
      }).find(
        (event) =>
          event.address.toLowerCase() === address.toLowerCase() &&
          event.args.account.toLowerCase() === claimant.toLowerCase() &&
          event.args.amount === 100_000_000n,
      );
      if (!claimed)
        throw new Error("The receipt did not confirm a faucet claim.");
      await cache.invalidateQueries({
        queryKey: ["test-usdg-faucet", chainId, address],
      });
      return claimant;
    },
  });
  const ready = state.data && state.data.timestamp >= state.data.nextClaimAt;
  return (
    <section className="control-group" aria-label="bUSD faucet">
      <h1>Get test bUSD</h1>
      <p>
        Claim 100 bUSD every 24 hours to try memberships. You pay the network
        fee in test ETH.
      </p>
      <ConnectButton />
      {state.data && (
        <>
          <p>
            Your balance:{" "}
            {formatLocalizedTokenAmount({
              raw: state.data.balance,
              decimals: 6,
              multiplier: tokenMultiplierScale,
            })}{" "}
            bUSD
          </p>
          {!ready && (
            <p>
              Next claim:{" "}
              {new Date(Number(state.data.nextClaimAt) * 1000).toLocaleString()}
            </p>
          )}
        </>
      )}
      <div className="faucet-actions">
        {account.address && (
          <button
            className="button button-outline"
            type="button"
            disabled={
              !ready ||
              state.isError ||
              !state.data?.gas ||
              account.chainId !== chainId ||
              action.isPending
            }
            onClick={() => action.mutate()}
          >
            {action.isPending ? "Claiming…" : "Claim 100 bUSD"}
          </button>
        )}
        <a
          className="button button-outline"
          href={robinhoodTestnetFaucetUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Get test ETH ↗
        </a>
      </div>
      {state.isLoading && account.address && (
        <p role="status">Checking your faucet balance…</p>
      )}
      {state.error && (
        <p role="alert">
          {decodeTransactionError(state.error)}{" "}
          <button type="button" onClick={() => void state.refetch()}>
            Retry
          </button>
        </p>
      )}
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {action.data === account.address && action.data && (
        <p role="status">100 bUSD received.</p>
      )}
    </section>
  );
}
