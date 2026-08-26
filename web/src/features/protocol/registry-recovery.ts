import { getAddress, type Address, type PublicClient } from "viem";

import { factoryAbi, tierAbi } from "@/contracts/abis";
import type { TierConfig } from "@/features/creator/config";

export type RegistryRecovery =
  | { status: "not-found"; currentCount: bigint }
  | { status: "found"; currentCount: bigint; tier: Address }
  | { status: "ambiguous"; currentCount: bigint; tiers: Address[] };

function sameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}

async function matchesImmutableTerms(
  client: PublicClient,
  tier: Address,
  config: TierConfig,
  blockNumber: bigint,
) {
  const [owner, name, symbol, price, duration, rewardBps, referralBps] =
    await Promise.all([
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "owner",
        blockNumber,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "name",
        blockNumber,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "symbol",
        blockNumber,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "pricePerPeriod",
        blockNumber,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "periodDuration",
        blockNumber,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "rewardBps",
        blockNumber,
      }),
      client.readContract({
        address: tier,
        abi: tierAbi,
        functionName: "referralBps",
        blockNumber,
      }),
    ]);

  return (
    sameAddress(getAddress(owner), config.creator) &&
    name === config.name &&
    symbol === config.symbol &&
    price === config.pricePerPeriod &&
    duration === config.periodDuration &&
    rewardBps === config.rewardBps &&
    referralBps === config.referralBps
  );
}

export async function recoverCreatedTier(
  client: PublicClient,
  input: {
    factory: Address;
    fromIndex: bigint;
    config: TierConfig;
  },
): Promise<RegistryRecovery> {
  const blockNumber = await client.getBlockNumber();
  const currentCount = await client.readContract({
    address: input.factory,
    abi: factoryAbi,
    functionName: "tierCount",
    blockNumber,
  });
  if (currentCount <= input.fromIndex) {
    return { status: "not-found", currentCount };
  }

  const added = currentCount - input.fromIndex;
  if (added > 100n) {
    throw new RangeError(
      "More than 100 tiers were added while deployment was uncertain; review the registry manually before retrying.",
    );
  }
  const candidates = await client.readContract({
    address: input.factory,
    abi: factoryAbi,
    functionName: "tiers",
    args: [input.fromIndex, added],
    blockNumber,
  });
  const matches: Address[] = [];
  for (const tier of candidates) {
    if (await matchesImmutableTerms(client, tier, input.config, blockNumber)) {
      matches.push(getAddress(tier));
    }
  }

  if (matches.length === 1) {
    return { status: "found", currentCount, tier: matches[0] };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", currentCount, tiers: matches };
  }
  return { status: "not-found", currentCount };
}
