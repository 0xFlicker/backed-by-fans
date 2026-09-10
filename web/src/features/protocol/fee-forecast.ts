import type { Address, PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";

/** Constant-size settled accounting snapshot. Reserved funds include backlog;
 * no current-time or future payout is inferred from unprocessed schedules. */
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
  const [reserves, earnedHeld] = await Promise.all([
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "reserveState",
      blockNumber: block.number,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "protocolFeeEarnedHeld",
      blockNumber: block.number,
    }),
  ]);
  return {
    blockNumber: block.number,
    timestamp: block.timestamp,
    accounting: reserves.status,
    earnedHeld,
    reservedScaled: reserves.unearnedScaled[3],
    cancellationScaled: reserves.cancellationScaled[3],
    reserved: reserves.unearnedScaled[3] / (1n << 128n),
  };
}
