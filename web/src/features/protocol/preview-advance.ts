import { earningsStream, type EarningsStream } from "@/lib/streaming-amount";
import { zeroAddress, type Address, type PublicClient } from "viem";
import { membershipTierAbi, protocolBuybackVaultAbi } from "@/contracts";
import type { AdvanceMode } from "./advance-call";

export type PreviewPlan = {
  vault: Address;
  blockNumber: bigint;
  tiers: readonly { tier: Address; maxAccountingSteps: bigint }[];
  purchases: readonly { asset: Address; revision: bigint }[];
};

/** Read-only projection of the exact accounting budget and available buyback funds.
 * Eligibility is per currency; swaps, output prices and later cooldowns are not executed. */
export async function previewAdvance(
  client: PublicClient,
  plan: PreviewPlan,
  mode: AdvanceMode,
) {
  const releases = new Map<
    Address,
    { amount: bigint; delta: bigint; streams: EarningsStream[] }
  >();
  let processedSteps = 0n;
  let earnedScaled = 0n;
  let complete = true;
  if (mode !== "buyback") {
    const tiers = await Promise.all(
      plan.tiers.map(async (item) => {
        const common = {
          address: item.tier,
          abi: membershipTierAbi,
          blockNumber: plan.blockNumber,
        } as const;
        const [preview, token] = await Promise.all([
          client.readContract({
            ...common,
            functionName: "previewAccounting",
            args: [0n, zeroAddress, zeroAddress, item.maxAccountingSteps],
          }),
          client.readContract({ ...common, functionName: "paymentToken" }),
        ]);
        const asset = await client.readContract({
          address: plan.vault,
          abi: protocolBuybackVaultAbi,
          functionName: "canonicalAsset",
          args: [token],
          blockNumber: plan.blockNumber,
        });
        return { ...item, preview, asset: asset.toLowerCase() as Address };
      }),
    );
    for (const { preview, asset, maxAccountingSteps } of tiers) {
      const projected =
        maxAccountingSteps > 0n ? preview.current : preview.settled;
      if (maxAccountingSteps > 0n) {
        processedSteps += preview.processedSteps;
        earnedScaled += preview.earnedDeltaScaled.reduce(
          (sum, value) => sum + value,
          0n,
        );
        complete &&= preview.current.status.complete;
      }
      const previous = releases.get(asset) ?? {
        amount: 0n,
        delta: 0n,
        streams: [],
      };
      const stream = earningsStream(preview, 3);
      if (maxAccountingSteps === 0n) {
        stream.raw = preview.settled.protocol;
        stream.rate = 0n;
        stream.fractional = preview.settled.fractionalScaled[3];
      }
      releases.set(asset, {
        streams: [...previous.streams, stream],
        amount: previous.amount + projected.protocol,
        delta: previous.delta + projected.protocol - preview.settled.protocol,
      });
    }
  }
  const currencies =
    mode === "accounting"
      ? []
      : await Promise.all(
          plan.purchases.map(async ({ asset }) => {
            const additional =
              mode === "both"
                ? (releases.get(asset.toLowerCase() as Address)?.amount ?? 0n)
                : 0n;
            const states = await Promise.all(
              ([0, 1] as const).map((bucket) =>
                client.readContract({
                  address: plan.vault,
                  abi: protocolBuybackVaultAbi,
                  functionName: "previewProcessing",
                  args: [asset, bucket, bucket === 0 ? additional : 0n],
                  blockNumber: plan.blockNumber,
                }),
              ),
            );
            return {
              asset,
              ready: states.some((state) => state.status === 0),
              available: states.reduce(
                (sum, state) => sum + state.available,
                0n,
              ),
            };
          }),
        );
  const purchases = BigInt(currencies.filter((item) => item.ready).length);
  return {
    processedSteps,
    purchases,
    complete,
    currencies,
    funds: [...releases].map(([asset, value]) => ({ asset, ...value })),
    ready:
      processedSteps > 0n ||
      purchases > 0n ||
      (mode === "accounting" && earnedScaled > 0n),
    useful:
      processedSteps > 0n ||
      earnedScaled > 0n ||
      purchases > 0n ||
      (mode === "both" &&
        [...releases.values()].some((item) => item.amount > 0n)),
  };
}
