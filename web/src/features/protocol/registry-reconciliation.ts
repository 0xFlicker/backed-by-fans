import {
  getAddress,
  parseEventLogs,
  type Address,
  type PublicClient,
} from "viem";

import { membershipTierAbi, robinhoodMembershipFactoryAbi } from "@/contracts";
import type { TierConfig } from "@/features/creator/config";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

async function matchesLaunchTerms(
  client: PublicClient,
  tier: Address,
  config: TierConfig,
  blockNumber: bigint,
) {
  const [
    owner,
    name,
    symbol,
    price,
    duration,
    rewardBps,
    referralBps,
    supplyCap,
    maxPrepaidPeriods,
    description,
    imageURI,
    externalURI,
  ] = await Promise.all([
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "owner",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "name",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "symbol",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "pricePerPeriod",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "periodDuration",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "rewardBps",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "referralBps",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "supplyCap",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "maxPrepaidPeriods",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "description",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "imageURI",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "externalURI",
      blockNumber,
    }),
  ]);

  return (
    isSameAddress(getAddress(owner), config.creator) &&
    name === config.name &&
    symbol === config.symbol &&
    price === config.pricePerPeriod &&
    duration === config.periodDuration &&
    rewardBps === config.rewardBps &&
    referralBps === config.referralBps &&
    supplyCap === config.supplyCap &&
    maxPrepaidPeriods === config.maxPrepaidPeriods &&
    description === config.metadata.description &&
    imageURI === config.metadata.imageURI &&
    externalURI === config.metadata.externalURI
  );
}

export async function reconcileCreatedTier(
  client: PublicClient,
  input: {
    factory: Address;
    config: TierConfig;
    receipt: SuccessfulWriteReceipt;
  },
): Promise<Address | undefined> {
  const events = parseEventLogs({
    abi: robinhoodMembershipFactoryAbi,
    eventName: "TierCreated",
    logs: input.receipt.logs,
    strict: true,
  }).filter(
    (event) =>
      isSameAddress(event.address, input.factory) &&
      isSameAddress(event.args.creator, input.config.creator) &&
      event.args.name === input.config.name &&
      event.args.symbol === input.config.symbol,
  );
  if (events.length !== 1) return undefined;

  const tier = getAddress(events[0].args.tier);
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  if (blockNumber < input.receipt.blockNumber) return undefined;
  const registered = await client.readContract({
    address: input.factory,
    abi: robinhoodMembershipFactoryAbi,
    functionName: "tiers",
    args: [events[0].args.tierIndex, 1n],
    blockNumber,
  });
  if (registered.length !== 1 || !isSameAddress(registered[0], tier)) {
    return undefined;
  }

  return (await matchesLaunchTerms(client, tier, input.config, blockNumber))
    ? tier
    : undefined;
}
