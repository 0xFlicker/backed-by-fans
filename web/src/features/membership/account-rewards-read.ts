import { type Address, type PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";
export const rewardScale = 1n << 128n;
export type TierClaimSelection = {
  tier: Address;
  name: string;
  tokenIds: readonly bigint[];
};
/** Preview exactly the selected transaction, at one block and with one shared work budget. */
export async function readAccountRewards(
  client: PublicClient,
  wallet: Address,
  tiers: readonly TierClaimSelection[],
  maxAccountingSteps = 25n,
) {
  const tierKeys = new Set(tiers.map((tier) => tier.tier.toLowerCase()));
  if (
    tierKeys.size !== tiers.length ||
    tiers.some(
      (tier) =>
        new Set(tier.tokenIds).size !== tier.tokenIds.length ||
        tier.tokenIds.some((id) => id <= 0n),
    )
  )
    throw new Error("Select unique memberships in unique tiers.");
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  let remaining = maxAccountingSteps;
  let blocked: TierClaimSelection | undefined;
  const results = [];
  for (const tier of tiers) {
    const common = {
      address: tier.tier,
      abi: membershipTierAbi,
      blockNumber,
    } as const;
    const [preview, settledRetired] = await Promise.all([
      client.readContract({
        ...common,
        functionName: "previewClaimRewards",
        args: [wallet, tier.tokenIds, remaining],
      }),
      client.readContract({
        ...common,
        functionName: "claimableRetiredReward",
        args: [wallet],
      }),
    ]);
    if (preview.processedSteps > remaining)
      throw new Error("The reward preview exceeded its accounting budget.");
    remaining -= preview.processedSteps;
    if (!blocked && !preview.complete) blocked = tier;
    results.push({
      reward: preview.positions.reduce(
        (sum, position) => sum + position.creditScaled / rewardScale,
        0n,
      ),
      retired: preview.retiredCreditScaled / rewardScale,
      referral: preview.referralCreditScaled / rewardScale,
      creator: preview.creatorCreditScaled / rewardScale,
      positions: preview.positions,
      retiredCreditScaled: preview.retiredCreditScaled,
      settledRetired,
      processedSteps: preview.processedSteps,
      complete: preview.complete,
      through: preview.accountedThrough,
    });
  }
  return {
    results,
    blocked,
    complete: results.every((item) => item.complete),
    blockNumber,
  };
}

/** Match the contracts' canonical, linear duplicate validation. */
export function sortClaimSelection(
  tiers: readonly TierClaimSelection[],
): TierClaimSelection[] {
  return tiers
    .map((tier) => ({
      ...tier,
      tokenIds: [...tier.tokenIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    }))
    .sort((a, b) => a.tier.toLowerCase().localeCompare(b.tier.toLowerCase()));
}
