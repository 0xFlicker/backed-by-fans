import { type Address, type PublicClient } from "viem";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";
import {
  readAcceptedPaymentToken,
  type AcceptedPaymentToken,
} from "@/lib/payment-token-read";
import type { SupportedChainId } from "@/lib/chains";
import { ACCOUNTING_SCALE, type EarningsStream } from "@/lib/streaming-amount";

export async function readPaymentFlowPage(
  client: PublicClient,
  chainId: SupportedChainId,
  factory: Address,
  options: {
    offset?: bigint;
    blockNumber?: bigint;
    limit?: bigint;
    accountingSteps?: bigint;
  } = {},
) {
  const offset = options.offset ?? 0n,
    limit = options.limit ?? 50n;
  if (offset < 0n || limit <= 0n)
    throw new Error("Invalid payment discovery page.");
  const block = await client.getBlock(
    options.blockNumber === undefined
      ? {}
      : { blockNumber: options.blockNumber },
  );
  const total = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "tierCount",
    blockNumber: block.number,
  });
  const tiers = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "tiers",
    args: [offset, limit],
    blockNumber: block.number,
  });
  const expected =
    offset >= total ? 0n : total - offset < limit ? total - offset : limit;
  if (BigInt(tiers.length) !== expected)
    throw new Error("Membership discovery was incomplete.");
  const results = [];
  for (let i = 0; i < tiers.length; i += 10) {
    results.push(
      ...(await Promise.all(
        tiers.slice(i, i + 10).map(async (tier) => {
          const [token, totals] = await Promise.all([
            client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "paymentToken",
              blockNumber: block.number,
            }),
            client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "previewPaymentTotals",
              args: [options.accountingSteps ?? 256n],
              blockNumber: block.number,
            }),
          ]);
          return { tier, token, totals };
        }),
      )),
    );
  }
  const vault = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "buybackVault",
    blockNumber: block.number,
  });
  const tokens = await Promise.all(
    [...new Set(results.map((r) => r.token.toLowerCase() as Address))].map(
      async (address) => {
        const [token, buyback] = await Promise.all([
          readAcceptedPaymentToken(client, {
            chainId,
            factory,
            address,
            registryIndex: 0,
            blockNumber: block.number,
          }),
          client.readContract({
            address: vault,
            abi: protocolBuybackVaultAbi,
            functionName: "inventory",
            args: [address, 0],
            blockNumber: block.number,
          }),
        ]);
        return { ...token, buyback };
      },
    ),
  );
  const nextOffset = offset + BigInt(tiers.length);
  return {
    results,
    tokens,
    total,
    blockNumber: block.number,
    timestamp: block.timestamp,
    nextOffset: nextOffset < total ? nextOffset : undefined,
  };
}

export type PaymentFlowPage = Awaited<ReturnType<typeof readPaymentFlowPage>>;
export function aggregatePaymentFlow(pages: PaymentFlowPage[]) {
  const currencies = new Map<
    string,
    {
      token: AcceptedPaymentToken;
      gross: bigint;
      refunded: bigint;
      paid: bigint[];
      earned: bigint[];
      pending: bigint[];
      complete: boolean;
      asOf: bigint;
      nextBoundary: bigint;
      allocationRates: bigint[];
      earnedRates: bigint[];
      buybackAvailable: bigint;
      buybackSpent: bigint;
    }
  >();
  const seen = new Set<string>();
  for (const page of pages) {
    if (page.blockNumber !== pages[0].blockNumber)
      throw new Error("Payment totals must share one snapshot.");
    for (const result of page.results) {
      if (seen.has(result.tier.toLowerCase()))
        throw new Error("Duplicate membership in payment totals.");
      seen.add(result.tier.toLowerCase());
      const key = result.token.toLowerCase();
      const token = page.tokens.find((t) => t.address.toLowerCase() === key);
      if (!token) throw new Error("Payment currency is unavailable.");
      const value = currencies.get(key) ?? {
        token,
        gross: 0n,
        refunded: 0n,
        paid: [0n, 0n, 0n, 0n],
        earned: [0n, 0n, 0n, 0n],
        pending: [0n, 0n, 0n, 0n],
        complete: true,
        asOf: page.timestamp,
        nextBoundary: 0n,
        allocationRates: [0n, 0n, 0n, 0n],
        earnedRates: [0n, 0n, 0n, 0n],
        // Vault totals are per currency, not per tier or discovery page.
        buybackAvailable: token.buyback.available,
        buybackSpent: token.buyback.totalSpent,
      };
      value.gross += result.totals.grossReceived;
      value.refunded += result.totals.refunded;
      value.complete &&= result.totals.status.complete;
      const boundary = result.totals.status.nextBoundary;
      if (
        boundary > 0n &&
        (value.nextBoundary === 0n || boundary < value.nextBoundary)
      )
        value.nextBoundary = boundary;
      for (let i = 0; i < 4; i++) {
        value.paid[i] += result.totals.paidRaw[i];
        value.earned[i] += result.totals.earnedScaled[i];
        value.pending[i] += result.totals.unearnedScaled[i];
        value.allocationRates[i] += result.totals.allocationRatesScaled[i];
        if (i !== 1 || result.totals.hasEligibleMembers)
          value.earnedRates[i] += result.totals.allocationRatesScaled[i];
      }
      currencies.set(key, value);
    }
  }
  return [...currencies.values()];
}

/** Project the currency together so fractional balances are summed before rounding.
 * Stop all its counters at the earliest boundary, then refresh the pinned snapshot. */
export function paymentFlowStream(
  currency: ReturnType<typeof aggregatePaymentFlow>[number],
  kind: "earned" | "pending",
  category?: number,
): EarningsStream {
  const sum = (values: bigint[]) =>
    category === undefined
      ? values.reduce((a, b) => a + b, 0n)
      : values[category];
  const scaled = sum(currency[kind]);
  return {
    raw: scaled / ACCOUNTING_SCALE,
    fractional: scaled % ACCOUNTING_SCALE,
    rate:
      kind === "pending"
        ? -sum(currency.allocationRates)
        : sum(currency.earnedRates),
    asOf: currency.asOf,
    nextBoundary: currency.nextBoundary,
    complete: currency.complete,
  };
}
