import type { Address, PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";
import type { EarningsStream } from "@/lib/streaming-amount";
import {
  readAccountRewards,
  rewardScale,
  type TierClaimSelection,
} from "./account-rewards-read";

/** Add display rates to exact claim amounts, all at the claim preview's block. */
export async function readAccountRewardStreams(
  client: PublicClient,
  wallet: Address,
  tiers: readonly TierClaimSelection[],
) {
  const claims = await readAccountRewards(client, wallet, tiers);
  const results = await Promise.all(
    tiers.map(async (tier, index) => {
      const claim = claims.results[index];
      const common = {
        address: tier.tier,
        abi: membershipTierAbi,
        blockNumber: claims.blockNumber,
      } as const;
      const [owner, previews] = await Promise.all([
        client.readContract({ ...common, functionName: "owner" }),
        Promise.all(
          (tier.tokenIds.length ? tier.tokenIds : [0n]).map((tokenId) =>
            client.readContract({
              ...common,
              functionName: "previewAccounting",
              args: [tokenId, wallet, wallet, 25n],
            }),
          ),
        ),
      ]);
      const stream = (
        credit: bigint,
        rate: bigint,
        preview = previews[0],
      ): EarningsStream => ({
        raw: credit / rewardScale,
        fractional: credit % rewardScale,
        rate,
        asOf: claim.through,
        nextBoundary: preview.current.status.nextBoundary,
        complete:
          claim.complete &&
          preview.current.status.complete &&
          preview.asOf === claim.asOf,
      });
      const positions = claim.positions.map((position, i) => ({
        ...position,
        stream: stream(
          position.creditScaled,
          previews[i].ratesScaled[1],
          previews[i],
        ),
      }));
      const retiredStream = stream(claim.retiredCreditScaled, 0n);
      const referralStream = stream(
        claim.referralCreditScaled,
        previews[0].ratesScaled[2],
      );
      const creatorStream = stream(
        claim.creatorCreditScaled,
        owner.toLowerCase() === wallet.toLowerCase()
          ? previews[0].ratesScaled[0]
          : 0n,
      );
      return {
        ...claim,
        positions,
        retiredStream,
        referralStream,
        creatorStream,
        streams: [
          ...positions.map((position) => position.stream),
          retiredStream,
          referralStream,
          creatorStream,
        ],
      };
    }),
  );
  return { ...claims, results };
}
