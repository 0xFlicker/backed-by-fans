import { type Address, type PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";

/** One block for every identity and projection; no transaction simulation. */
export async function readAccountRewards(
  client: PublicClient,
  wallet: Address,
  tiers: readonly { tier: Address; name: string }[],
) {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const results = await Promise.all(
    tiers.map(async ({ tier }) => {
      const common = {
        address: tier,
        abi: membershipTierAbi,
        blockNumber,
      } as const;
      const [tokenId, owner] = await Promise.all([
        client.readContract({
          ...common,
          functionName: "tokenOf",
          args: [wallet],
        }),
        client.readContract({ ...common, functionName: "owner" }),
      ]);
      const preview = await client.readContract({
        ...common,
        functionName: "previewAccounting",
        args: [tokenId, wallet, 256n],
      });
      return {
        reward: preview.current.member,
        referral: preview.current.referral,
        creator:
          owner.toLowerCase() === wallet.toLowerCase()
            ? preview.current.creator
            : 0n,
        processedSteps: preview.processedSteps,
        complete: preview.current.status.complete,
        through: preview.current.status.accountedThrough,
      };
    }),
  );
  let remaining = 25n;
  let blocked: { tier: Address; name: string } | undefined;
  results.forEach((result, index) => {
    if (!blocked && (!result.complete || result.processedSteps > remaining))
      blocked = tiers[index];
    remaining -= result.processedSteps;
  });
  return {
    results,
    blocked,
    complete: results.every((item) => item.complete),
    blockNumber,
  };
}
