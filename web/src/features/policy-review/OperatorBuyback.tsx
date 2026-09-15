"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";
import {
  formatEther,
  formatUnits,
  parseUnits,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import { protocolBuybackVaultAbi } from "@/contracts";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { decodeTransactionError } from "@/lib/transaction-state";
import { readMarketState, quoteMarket } from "@/lib/buyback-policy/live";
import { operatorRoute } from "@/lib/buyback-policy/operator-route";
import { readTokenDisplay } from "@/lib/payment-token-read";
import {
  displayedToRaw,
  formatRawTokenAmount,
  tokenMultiplierScale,
  rawToDisplayedUnits,
} from "@/lib/token-amount";
import { ReleaseOperatorFees } from "./ReleaseOperatorFees";
import type { PublicBuybacks } from "@/features/protocol/protocol-read";
import { receiptBuyback } from "@/features/protocol/buyback-reconciliation";
import styles from "./PolicyReview.module.css";

function multiplierAt(
  display: {
    uiMultiplier: bigint;
    newUIMultiplier?: bigint;
    effectiveAt?: bigint;
  },
  timestamp: bigint,
) {
  return display.effectiveAt && display.effectiveAt <= timestamp
    ? (display.newUIMultiplier ?? display.uiMultiplier)
    : display.uiMultiplier;
}

export function OperatorBuyback({
  chainId,
  snapshot,
  fees,
  releaseTiers,
}: {
  chainId: SupportedChainId;
  snapshot: PublicBuybacks;
  fees: Map<string, { earned: bigint }>;
  releaseTiers: Map<string, Address[]>;
}) {
  const account = useHydratedAccount();
  const client = usePublicClient({ chainId });
  const config = useConfig();
  const write = useWriteContract();
  const cache = useQueryClient();
  const assets = snapshot.assets.filter(
    (item) =>
      item.status === "valid" &&
      item.data.metadata &&
      item.asset.toLowerCase() !== snapshot.protocolToken.toLowerCase(),
  );
  const [asset, setAsset] = useState<Address>(assets[0]?.asset ?? zeroAddress);
  const [bucket, setBucket] = useState<0 | 1>(0);
  const [amount, setAmount] = useState("");
  const [tolerance, setTolerance] = useState("0.5");
  const [useMax, setUseMax] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const route = operatorRoute(chainId, asset);
  const item = assets.find((item) => item.asset === asset);
  const metadata = item?.status === "valid" ? item.data.metadata : undefined;
  const decimals = metadata?.decimals ?? 18;
  const available =
    item?.status === "valid"
      ? bucket === 0
        ? item.data.membership.available
        : item.data.donation.available
      : 0n;
  const display = {
    symbol: metadata?.symbol ?? "",
    decimals,
    multiplier: metadata
      ? multiplierAt(metadata, snapshot.timestamp)
      : tokenMultiplierScale,
  };
  const earned = fees.get(asset.toLowerCase())?.earned ?? 0n;
  const amountLabel = (raw: bigint) =>
    formatRawTokenAmount({ raw, ...display });
  const authorized = Boolean(
    account.address &&
    account.address.toLowerCase() === snapshot.operator.toLowerCase() &&
    account.chainId === chainId,
  );
  const identity = JSON.stringify([
    asset,
    bucket,
    amount,
    tolerance,
    useMax,
    account.address,
    account.chainId,
  ]);
  const localFee = chainId === 31337 ? { gasPrice: 100_000_000n } : {};
  async function assertOperator() {
    if (!client || !account.address || account.chainId !== chainId)
      throw new Error("Connect the operator wallet on this network.");
    const [operator, mode] = await Promise.all([
      client.readContract({
        address: snapshot.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "operator",
      }),
      client.readContract({
        address: snapshot.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "executionMode",
      }),
    ]);
    if (operator.toLowerCase() !== account.address.toLowerCase())
      throw new Error("This wallet is no longer the authorized operator.");
    if (mode !== 0)
      throw new Error("OperatorGuarded is no longer active. Refresh the page.");
    return account.address;
  }
  const review = useMutation({
    retry: false,
    mutationFn: async () => {
      const signer = await assertOperator();
      if (!metadata)
        throw new Error("Refresh to read this currency's amount information.");
      const block = await client!.getBlock();
      const currentDisplay =
        asset === zeroAddress
          ? { symbol: "ETH", decimals: 18, uiMultiplier: tokenMultiplierScale }
          : await readTokenDisplay(
              client! as PublicClient,
              asset,
              block.number,
            );
      const inputDisplay = {
        symbol: currentDisplay.symbol,
        decimals: currentDisplay.decimals,
        multiplier: multiplierAt(currentDisplay, block.timestamp),
      };
      const inventory = await client!.readContract({
        address: snapshot.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [asset, bucket],
        blockNumber: block.number,
      });
      const raw = useMax
        ? inventory.available
        : displayedToRaw({ displayed: amount, ...inputDisplay });
      if (raw <= 0n)
        throw new Error(
          "Enter an amount to buy with, or release earned fees first.",
        );
      if (raw > inventory.available)
        throw new Error(
          "This amount exceeds the ready balance. Release earned fees or choose a smaller amount.",
        );
      const bps = /^\d+(\.\d{1,2})?$/.test(tolerance)
        ? Number(parseUnits(tolerance, 2))
        : NaN;
      if (
        !tolerance.trim() ||
        !Number.isInteger(bps) ||
        bps < 0 ||
        bps >= 10000
      )
        throw new Error(
          "Slippage must be between 0 and 99.99%, with at most two decimal places.",
        );
      if (!route)
        throw new Error(
          "No supported automatic route is available for this currency yet.",
        );
      const market = await readMarketState(client! as PublicClient, {
        vault: snapshot.vault,
        asset,
        protocolToken: snapshot.protocolToken,
        blockNumber: block.number,
        route: route.pools,
      });
      const quotes = await quoteMarket(client! as PublicClient, market, raw);
      const minima = quotes.map((quote) => {
        const minimum = (quote.outputRaw * BigInt(10000 - bps)) / 10000n;
        if (minimum <= 0n)
          throw new Error(
            "The minimum output rounds to zero. Increase the amount or reduce slippage.",
          );
        return minimum;
      });
      const legDisplays = await Promise.all(
        quotes.map(async (leg) => {
          const token =
            leg.output === zeroAddress
              ? {
                  symbol: "ETH",
                  decimals: 18,
                  uiMultiplier: tokenMultiplierScale,
                }
              : await readTokenDisplay(
                  client! as PublicClient,
                  leg.output,
                  block.number,
                );
          return {
            symbol: token.symbol,
            decimals: token.decimals,
            multiplier: multiplierAt(token, block.timestamp),
          };
        }),
      );
      const deadline = block.timestamp + 120n;
      const args = [
        asset,
        bucket,
        raw,
        { pools: route.pools },
        minima,
        deadline,
      ] as const;
      await simulateContract(config, {
        address: snapshot.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "processOperator",
        args,
        account: signer,
        chainId,
        ...localFee,
      });
      const [gas, gasPrice, balance] = await Promise.all([
        client!.estimateContractGas({
          address: snapshot.vault,
          abi: protocolBuybackVaultAbi,
          functionName: "processOperator",
          args,
          account: signer,
          ...localFee,
        }),
        localFee.gasPrice ?? client!.getGasPrice(),
        client!.getBalance({ address: signer }),
      ]);
      if (balance < gas * gasPrice)
        throw new Error("Fund the operator wallet with ETH for gas.");
      return {
        identity,
        inputDisplay,
        legDisplays,
        args,
        quotes,
        minima,
        deadline,
        gasCost: gas * gasPrice,
        signer,
      };
    },
  });
  const action = useMutation({
    retry: false,
    mutationFn: async () => {
      const quote = review.data;
      if (!quote || quote.identity !== identity)
        throw new Error("Review the current buyback before submitting.");
      const signer = await assertOperator();
      if ((await client!.getBlock()).timestamp >= quote.deadline)
        throw new Error(
          "This quote expired. Review a fresh quote before submitting.",
        );
      if (asset !== zeroAddress) {
        const block = await client!.getBlock();
        const token = await readTokenDisplay(
          client! as PublicClient,
          asset,
          block.number,
        );
        if (
          multiplierAt(token, block.timestamp) !== quote.inputDisplay.multiplier
        )
          throw new Error(
            "The currency display rate changed. Review a fresh quote before submitting.",
          );
      }
      const simulation = await simulateContract(config, {
        address: snapshot.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "processOperator",
        args: quote.args,
        account: signer,
        chainId,
        ...localFee,
      });
      const hash = await write.writeContractAsync(simulation.request);
      let cancelled = false;
      const receipt = await client!.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled = replacement.reason === "cancelled";
        },
      });
      if (cancelled) throw new Error("Your wallet cancelled the buyback.");
      if (receipt.status !== "success")
        throw new Error(
          "The buyback reverted. Review a fresh quote before trying again.",
        );
      const result = receiptBuyback(receipt, {
        vault: snapshot.vault,
        asset: quote.args[0],
        bucket: quote.args[1],
        amount: quote.args[2],
        revision: 0n,
      });
      if (!result)
        throw new Error(
          "The receipt does not contain the requested burn. Inspect the transaction before trying again.",
        );
      review.reset();
      const refreshed = await Promise.allSettled([
        cache.invalidateQueries({ queryKey: ["protocol", chainId] }),
      ]);
      return {
        result,
        hash: receipt.transactionHash,
        refreshUnavailable: refreshed.some((r) => r.status === "rejected"),
      };
    },
  });
  const pending = review.isPending || action.isPending || releasing;
  const quote =
    !review.isPending && review.data?.identity === identity
      ? review.data
      : undefined;
  const explorer = getSupportedChain(chainId).blockExplorers?.default.url;
  return (
    <section
      className={styles.operator}
      aria-labelledby="operator-buyback-title"
    >
      <h2 id="operator-buyback-title">Submit an operator buyback</h2>
      <p>
        Release earned fees, choose how much to spend, and review your buyback.
        Your operator wallet signs the purchase.
      </p>
      <p className={styles.reportCopy}>
        Authorized operator: <code>{snapshot.operator}</code>
      </p>
      {!authorized && (
        <p role="status">
          Connect the authorized operator wallet on this network to review and
          submit.
        </p>
      )}
      {snapshot.buybacksPaused && (
        <p role="status">
          Buybacks are paused. The Safe must unpause them before submission.
        </p>
      )}
      <fieldset className={styles.controls} disabled={pending}>
        <label>
          Funds to use
          <select
            value={bucket}
            onChange={(e) => {
              setBucket(Number(e.target.value) as 0 | 1);
              setUseMax(false);
              setAmount("");
            }}
          >
            <option value="0">Membership fees</option>
            <option value="1">Donations</option>
          </select>
        </label>
        <label>
          Asset
          <select
            value={asset}
            onChange={(e) => {
              setAsset(e.target.value as Address);
              setUseMax(false);
              setAmount("");
            }}
          >
            {assets.map((item) => (
              <option key={item.asset} value={item.asset}>
                {item.status === "valid"
                  ? item.data.metadata?.symbol
                  : item.asset}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <dl className={styles.summary}>
        <div>
          <dt>Ready to buy</dt>
          <dd>
            {amountLabel(available)} {display.symbol}
          </dd>
        </div>
        {bucket === 0 && (
          <div>
            <dt>Earned, not released</dt>
            <dd>
              {amountLabel(earned)} {display.symbol}
            </dd>
          </div>
        )}
      </dl>
      {bucket === 0 && (
        <ReleaseOperatorFees
          key={asset}
          chainId={chainId}
          factory={snapshot.factory}
          tiers={releaseTiers.get(asset.toLowerCase()) ?? []}
          display={display}
          disabled={pending}
          onReleased={() => {
            review.reset();
            action.reset();
          }}
          onBusy={setReleasing}
        />
      )}
      <fieldset className={styles.controls} disabled={pending}>
        <label>
          Amount ({display.symbol})
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setUseMax(false);
            }}
          />
        </label>
        <label>
          Slippage tolerance (%)
          <input
            inputMode="decimal"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
        </label>
      </fieldset>
      <button
        type="button"
        className="text-button"
        disabled={pending || available === 0n}
        onClick={() => {
          setUseMax(true);
          setAmount(
            formatUnits(
              rawToDisplayedUnits(available, display.multiplier),
              decimals,
            ),
          );
        }}
      >
        Max
      </button>
      <p>
        <strong>Route:</strong>{" "}
        {route?.label ?? "No supported automatic route available."}
      </p>
      <p className="small-copy">
        The route is selected automatically and quoted when you review. Slippage
        sets the minimum received at each swap.
      </p>
      <button
        type="button"
        className="button button-dark"
        disabled={
          !authorized ||
          pending ||
          snapshot.buybacksPaused ||
          !route ||
          available === 0n
        }
        onClick={() => {
          action.reset();
          review.mutate();
        }}
      >
        {review.isPending ? "Reviewing…" : "Review buyback"}
      </button>
      {review.error && (
        <p role="alert">{decodeTransactionError(review.error)}</p>
      )}
      {quote && (
        <section className={styles.preview} aria-label="Buyback review">
          <h3>Review buyback</h3>
          <dl className={styles.summary}>
            <div>
              <dt>You spend up to</dt>
              <dd>
                {formatRawTokenAmount({
                  raw: quote.args[2],
                  ...quote.inputDisplay,
                })}{" "}
                {quote.inputDisplay.symbol}
              </dd>
            </div>
            <div>
              <dt>Expected burn</dt>
              <dd>
                {formatRawTokenAmount({
                  raw: quote.quotes.at(-1)!.outputRaw,
                  ...quote.legDisplays.at(-1)!,
                })}{" "}
                {quote.legDisplays.at(-1)!.symbol}
              </dd>
            </div>
            <div>
              <dt>Minimum burn</dt>
              <dd>
                {formatRawTokenAmount({
                  raw: quote.minima.at(-1)!,
                  ...quote.legDisplays.at(-1)!,
                })}{" "}
                {quote.legDisplays.at(-1)!.symbol}
              </dd>
            </div>
            <div>
              <dt>Estimated network fee</dt>
              <dd>{formatEther(quote.gasCost)} ETH</dd>
            </div>
            <div>
              <dt>Quote deadline (chain time)</dt>
              <dd>
                {new Date(Number(quote.deadline) * 1000).toLocaleString()}
              </dd>
            </div>
          </dl>
          <details>
            <summary>Minimum received at each swap</summary>
            <ol>
              {quote.quotes.map((leg, i) => (
                <li key={i} className={styles.reportCopy}>
                  {formatRawTokenAmount({
                    raw: quote.minima[i],
                    ...quote.legDisplays[i],
                  })}{" "}
                  {quote.legDisplays[i].symbol}
                </li>
              ))}
            </ol>
          </details>
          <p>
            Submission uses your wallet’s network connection. This form does not
            provide private transaction delivery.
          </p>
          <button
            type="button"
            className="button button-dark"
            disabled={!authorized || pending}
            onClick={() => action.mutate()}
          >
            {action.isPending ? "Submitting…" : "Submit buyback"}
          </button>
        </section>
      )}
      {action.error && (
        <p role="alert">{decodeTransactionError(action.error)}</p>
      )}
      {action.data && (
        <p role="status">
          Buyback confirmed. Burned {formatUnits(action.data.result.burned, 18)}{" "}
          protocol tokens.{" "}
          {explorer ? (
            <a href={`${explorer}/tx/${action.data.hash}`}>View transaction</a>
          ) : (
            <code>{action.data.hash}</code>
          )}
          {action.data.refreshUnavailable &&
            " Inventory refresh is unavailable; the burn is confirmed."}
        </p>
      )}
    </section>
  );
}
