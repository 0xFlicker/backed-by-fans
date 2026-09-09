import {
  BaseError,
  ContractFunctionRevertedError,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
  protocolBurnRouterAbi,
} from "@/contracts";

/** Fresh, bounded discovery only. The router rechecks all purchase eligibility at execution. */
export async function prepareBurn(client: PublicClient, factory: Address) {
  const block = await client.getBlock();
  const blockNumber = block.number;
  const [router, vault, protocolToken, tierCount, tokenCount] =
    await Promise.all([
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "burnRouter",
        blockNumber,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "buybackVault",
        blockNumber,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "protocolToken",
        blockNumber,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "tierCount",
        blockNumber,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "paymentTokenCount",
        blockNumber,
      }),
    ]);
  if (tokenCount > 100n)
    throw new Error(
      "This protocol exceeds the browser's discovery limit. Use the execution runner.",
    );
  // Advance member pages once per tier-page cycle so later membership IDs
  // remain reachable even when the tier and member page counts share factors.
  const tierPages = tierCount === 0n ? 1n : (tierCount + 99n) / 100n;
  const tierOffset = (blockNumber % tierPages) * 100n;
  const tierLength =
    tierCount - tierOffset < 100n ? tierCount - tierOffset : 100n;
  const tiers =
    tierCount === 0n
      ? []
      : await client.readContract({
          address: factory,
          abi: membershipFactoryAbi,
          functionName: "tiers",
          args: [tierOffset, tierLength],
          blockNumber,
        });
  const tokens = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "paymentTokens",
    args: [0n, tokenCount],
    blockNumber,
  });
  const canonical = await Promise.all(
    [zeroAddress, protocolToken, ...tokens].map((asset) =>
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "canonicalAsset",
        args: [asset],
        blockNumber,
      }),
    ),
  );
  const assets = [
    ...new Set(canonical.map((asset) => asset.toLowerCase() as Address)),
  ];
  if (assets.length > 32)
    throw new Error(
      "This protocol exceeds the browser's 32-currency batch limit.",
    );
  const counts = await Promise.all(
    tiers.map((address) =>
      client.readContract({
        address,
        abi: membershipTierAbi,
        functionName: "totalMinted",
        blockNumber,
      }),
    ),
  );
  const memberPageSize = BigInt(
    Math.min(100, Math.floor(1000 / Math.max(tiers.length, 1))),
  );
  const incompleteDiscovery =
    BigInt(tiers.length) < tierCount ||
    counts.some((count) => count > memberPageSize);
  const candidates: { tier: Address; id: bigint; priority: bigint }[] = [];
  const heldTiers: Address[] = [];
  // Bound simultaneous tier discovery, while held fees and member states
  // within each group share a single RPC latency phase.
  for (let start = 0; start < tiers.length; start += 4) {
    const discovered = await Promise.all(
      tiers.slice(start, start + 4).map(async (tier, index) => {
        const count = counts[start + index];
        const memberPages = (count + memberPageSize - 1n) / memberPageSize;
        const offset =
          memberPages === 0n
            ? 0n
            : ((blockNumber / tierPages) % memberPages) * memberPageSize;
        const length = Number(
          count - offset < memberPageSize ? count - offset : memberPageSize,
        );
        const [held, states] = await Promise.all([
          client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "protocolFeeEarnedHeld",
            blockNumber,
          }),
          Promise.all(
            Array.from({ length }, (_, i) =>
              client.readContract({
                address: tier,
                abi: membershipTierAbi,
                functionName: "protocolFeeState",
                args: [offset + BigInt(i) + 1n],
                blockNumber,
              }),
            ),
          ),
        ]);
        return { tier, offset, held, states };
      }),
    );
    // Promise.all preserves registry ordering regardless of response timing.
    for (const { tier, offset, held, states } of discovered) {
      if (held > 0n) heldTiers.push(tier);
      states.forEach((state, i) => {
        if (state.uncheckpointedEarned > 0n)
          candidates.push({
            tier,
            id: offset + BigInt(i) + 1n,
            // Prioritize the most overdue share, independent of currency decimals.
            priority:
              (state.uncheckpointedEarned * 10n ** 18n) /
              (state.uncheckpointedEarned + state.unearned),
          });
      });
    }
  }
  candidates.sort((a, b) =>
    a.priority > b.priority ? -1 : a.priority < b.priority ? 1 : 0,
  );
  const grouped = new Map<Address, bigint[]>(
    heldTiers.map((tier) => [tier, []]),
  );
  for (const candidate of candidates) {
    const ids = grouped.get(candidate.tier) ?? [];
    ids.push(candidate.id);
    grouped.set(candidate.tier, ids);
  }
  const collections: { tier: Address; tokenIds: bigint[] }[] = [];
  let members = 0;
  let unavailableCollections = 0;
  for (const [tier, ids] of grouped) {
    if (collections.length === 8 || members === 100) break;
    const collection = { tier, tokenIds: ids.slice(0, 100 - members) };
    try {
      // Read-only self-call simulation keeps failed currencies from occupying
      // every collection slot and starving independently healthy tiers.
      const result = await client.simulateContract({
        address: router,
        abi: protocolBurnRouterAbi,
        functionName: "collect",
        args: [collection],
        account: router,
        blockNumber,
      });
      if (result.result === 0n) continue;
      collections.push(collection);
      members += collection.tokenIds.length;
    } catch (error) {
      const reverted =
        error instanceof BaseError &&
        error.walk((cause) => cause instanceof ContractFunctionRevertedError);
      if (!(reverted instanceof ContractFunctionRevertedError)) throw error;
      unavailableCollections++;
    }
  }
  const purchases = await Promise.all(
    assets.map(async (asset) => {
      const [revision, lastBuy] = await Promise.all([
        client.readContract({
          address: vault,
          abi: protocolBuybackVaultAbi,
          functionName: "revision",
          args: [asset],
          blockNumber,
        }),
        client.readContract({
          address: vault,
          abi: protocolBuybackVaultAbi,
          functionName: "lastAssetBuyAt",
          args: [asset],
          blockNumber,
        }),
      ]);
      return { asset, revision, lastBuy };
    }),
  );
  // Give currencies waiting longest the first opportunity under a global cooldown.
  purchases.sort((a, b) =>
    a.lastBuy < b.lastBuy ? -1 : a.lastBuy > b.lastBuy ? 1 : 0,
  );
  return {
    router,
    collections,
    unavailableCollections,
    purchases: purchases.map(({ asset, revision }) => ({ asset, revision })),
    deadline: block.timestamp + 300n,
    moreCollections:
      incompleteDiscovery ||
      members < candidates.length ||
      heldTiers.some((tier) => !collections.some((c) => c.tier === tier)),
  };
}
