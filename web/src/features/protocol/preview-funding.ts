import { earningsStream, type EarningsStream } from "@/lib/streaming-amount";
import { zeroAddress, type Address, type PublicClient } from "viem";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";

/** Aggregate every tier at one block, independently of transaction batch limits. */
export async function previewFunding(
  client: PublicClient,
  snapshot: { factory: Address; vault: Address; tierCount: bigint },
  blockNumber: bigint,
) {
  const totals = new Map<
    string,
    { amount: bigint; complete: boolean; streams: EarningsStream[] }
  >();
  for (let offset = 0n; offset < snapshot.tierCount; offset += 100n) {
    const tiers = await client.readContract({
      address: snapshot.factory,
      abi: membershipFactoryAbi,
      functionName: "tiers",
      args: [offset, 100n],
      blockNumber,
    });
    const expected =
      snapshot.tierCount - offset < 100n ? snapshot.tierCount - offset : 100n;
    if (BigInt(tiers.length) !== expected)
      throw new Error("Incomplete membership discovery");
    // Bound concurrent requests while reading all discovered tiers.
    for (let index = 0; index < tiers.length; index += 10) {
      const values = await Promise.all(
        tiers.slice(index, index + 10).map(async (tier) => {
          const [token, preview] = await Promise.all([
            client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "paymentToken",
              blockNumber,
            }),
            client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "previewAccounting",
              args: [0n, zeroAddress, zeroAddress, 256n],
              blockNumber,
            }),
          ]);
          const asset = await client.readContract({
            address: snapshot.vault,
            abi: protocolBuybackVaultAbi,
            functionName: "canonicalAsset",
            args: [token],
            blockNumber,
          });
          return { asset, preview };
        }),
      );
      for (const { asset, preview } of values) {
        const key = asset.toLowerCase();
        const previous = totals.get(key) ?? {
          amount: 0n,
          complete: true,
          streams: [],
        };
        totals.set(key, {
          streams: [...previous.streams, earningsStream(preview, 3)],
          amount: previous.amount + preview.current.protocol,
          complete: previous.complete && preview.current.status.complete,
        });
      }
    }
  }
  return totals;
}
