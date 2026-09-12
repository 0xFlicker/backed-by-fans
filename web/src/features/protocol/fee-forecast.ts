import { earningsStream } from "@/lib/streaming-amount";
import { zeroAddress, type Address, type PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";

/** Bounded current earnings with an explicit completion flag for large backlogs. */
export async function readTierFunding(
  client: PublicClient,
  tier: Address,
  options: { blockNumber?: bigint } = {},
) {
  const block = await client.getBlock(
    options.blockNumber === undefined
      ? {}
      : { blockNumber: options.blockNumber },
  );
  const [reserves, preview] = await Promise.all([
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "reserveState",
      blockNumber: block.number,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewAccounting",
      args: [0n, zeroAddress, zeroAddress, 256n],
      blockNumber: block.number,
    }),
  ]);
  return {
    stream: earningsStream(preview, 3),
    blockNumber: block.number,
    timestamp: block.timestamp,
    accounting: preview.current.status,
    earnedHeld: preview.current.protocol,
    settledHeld: preview.settled.protocol,
    newlyEarned: preview.current.protocol - preview.settled.protocol,
    reservedScaled: reserves.unearnedScaled[3] - preview.earnedDeltaScaled[3],
    cancellationScaled: reserves.cancellationScaled[3],
    reserved:
      (reserves.unearnedScaled[3] - preview.earnedDeltaScaled[3]) /
      (1n << 128n),
  };
}
