import {
  BaseError,
  ContractFunctionRevertedError,
  type Address,
  type PublicClient,
} from "viem";
import type { ReadyDeployment } from "@/lib/config";
import { membershipTierAbi } from "@/contracts";
import { discoverAccountPage, readAccountOwnerPage } from "./account-discovery";
import {
  sortClaimSelection,
  type TierClaimSelection,
} from "./account-rewards-read";

export type ClaimAllScope = {
  wallet: Address;
  chainId: number;
  factory: Address;
  queue: TierClaimSelection[];
  completed: number;
  removedPositions: number;
};

/** Freeze discovery to one block. A run never extends its scope to new positions. */
export async function discoverClaimAll(
  client: PublicClient,
  deployment: ReadyDeployment,
  wallet: Address,
  report: (message: string) => void,
): Promise<ClaimAllScope> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const queue: TierClaimSelection[] = [];
  let offset = 0n;
  while (true) {
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset,
      blockNumber,
    });
    if (page.skipped.length)
      throw new Error(
        `Claim all discovery is incomplete. ${page.skipped.join(" ")}`,
      );
    for (const tier of page.results) {
      const tokenIds = tier.positions.map((position) => position.tokenId);
      let ownerPage = tier;
      while (!ownerPage.ownerComplete) {
        const previous = ownerPage.nextOwnerOffset;
        ownerPage = await readAccountOwnerPage(client, {
          deployment,
          wallet,
          tier: tier.tier,
          offset: previous,
          blockNumber,
        });
        if (!ownerPage.ownerComplete && ownerPage.nextOwnerOffset <= previous)
          throw new Error(
            "Membership discovery did not advance. Refresh before claiming.",
          );
        tokenIds.push(
          ...ownerPage.positions.map((position) => position.tokenId),
        );
      }
      queue.push({ tier: tier.tier, name: tier.name, tokenIds });
    }
    report(
      `Checking rewards: ${page.scannedTo} of ${page.total} tiers checked.`,
    );
    if (page.nextOffset === null) break;
    if (page.nextOffset <= offset)
      throw new Error("Tier discovery did not advance.");
    offset = page.nextOffset;
  }
  return {
    wallet,
    chainId: deployment.chainId,
    factory: deployment.factoryAddress,
    queue: sortClaimSelection(queue),
    completed: 0,
    removedPositions: 0,
  };
}

/** Recheck captured IDs after maintenance or external transfers. Burned and moved
 * positions leave the scope; newly received IDs are never added. */
export async function refreshClaimScope(
  client: PublicClient,
  wallet: Address,
  selection: readonly TierClaimSelection[],
) {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const refreshed: TierClaimSelection[] = [];
  for (const tier of selection) {
    const tokenIds: bigint[] = [];
    for (const tokenId of tier.tokenIds) {
      try {
        const owner = await client.readContract({
          address: tier.tier,
          abi: membershipTierAbi,
          functionName: "ownerOf",
          args: [tokenId],
          blockNumber,
        });
        if (owner.toLowerCase() === wallet.toLowerCase())
          tokenIds.push(tokenId);
      } catch (error) {
        const revert =
          error instanceof BaseError
            ? error.walk(
                (cause) => cause instanceof ContractFunctionRevertedError,
              )
            : undefined;
        if (
          !(revert instanceof ContractFunctionRevertedError) ||
          revert.data?.errorName !== "ERC721NonexistentToken"
        )
          throw error;
      }
    }
    refreshed.push({ ...tier, tokenIds });
  }
  return refreshed;
}

export function claimUnits(selection: readonly TierClaimSelection[]) {
  return selection.reduce(
    (sum, tier) => sum + Math.max(1, tier.tokenIds.length),
    0,
  );
}
export function claimPrefix(
  selection: readonly TierClaimSelection[],
  units: number,
): TierClaimSelection[] {
  const result: TierClaimSelection[] = [];
  for (const tier of selection) {
    if (units <= 0) break;
    const tokenIds = tier.tokenIds.slice(0, units);
    result.push({ ...tier, tokenIds });
    units -= Math.max(1, tokenIds.length);
  }
  return result;
}
export function removeClaimed(
  scope: ClaimAllScope,
  batch: readonly TierClaimSelection[],
) {
  for (const claimed of batch) {
    const tier = scope.queue.find(
      (item) => item.tier.toLowerCase() === claimed.tier.toLowerCase(),
    );
    if (!tier) throw new Error("Claim scope changed unexpectedly.");
    const ids = new Set(claimed.tokenIds);
    tier.tokenIds = tier.tokenIds.filter((id) => !ids.has(id));
    if (!tier.tokenIds.length)
      scope.queue = scope.queue.filter((item) => item !== tier);
  }
}

/** Only resource/admission failures justify trying a smaller request. */
export function canReduceClaim(error: unknown): boolean {
  const reverted =
    error instanceof BaseError
      ? error.walk((cause) => cause instanceof ContractFunctionRevertedError)
      : undefined;
  // viem also wraps node resource errors as reverted errors. Preserve actual
  // contract revert data, but allow explicit resource failures without it.
  if (
    reverted instanceof ContractFunctionRevertedError &&
    (reverted.data || (reverted.raw && reverted.raw !== "0x"))
  )
    return false;
  return /out of gas|gas (?:required|limit|exceeds)|exceeds.*gas|request.*(?:large|limit)|response.*(?:large|limit)|execution.*limit|transaction.*(?:large|limit)/i.test(
    `${error instanceof Error ? error.message : String(error)} ${reverted instanceof ContractFunctionRevertedError ? reverted.message : ""}`,
  );
}
