import { zeroAddress, type Address, type PublicClient } from "viem";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";

/** Fresh, bounded discovery only. The router rechecks all purchase eligibility at execution. */
export async function prepareAdvance(
  client: PublicClient,
  factory: Address,
  selectedTier?: Address,
  bounds: {
    tierOffset?: bigint;
    tierLimit?: bigint;
    assetOffset?: bigint;
    assetLimit?: bigint;
    maxAccountingSteps?: bigint;
  } = {},
) {
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
  const tierLimit = bounds.tierLimit ?? 8n;
  const assetLimit = bounds.assetLimit ?? 100n;
  const accountingBudget = bounds.maxAccountingSteps ?? 25n;
  if (tierLimit <= 0n || assetLimit <= 0n || accountingBudget < 0n)
    throw new Error(
      "Use positive discovery page sizes and a nonnegative work budget.",
    );
  const tierPages =
    tierCount === 0n ? 1n : (tierCount + tierLimit - 1n) / tierLimit;
  const tierOffset = bounds.tierOffset ?? (blockNumber % tierPages) * tierLimit;
  const assetPages =
    tokenCount === 0n ? 1n : (tokenCount + assetLimit - 1n) / assetLimit;
  const assetOffset =
    bounds.assetOffset ?? (blockNumber % assetPages) * assetLimit;
  if (tierOffset < 0n || assetOffset < 0n)
    throw new Error("Discovery offsets cannot be negative.");
  const tierLength =
    tierOffset >= tierCount
      ? 0n
      : tierCount - tierOffset < tierLimit
        ? tierCount - tierOffset
        : tierLimit;
  if (
    selectedTier &&
    !(await client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "isRegisteredTier",
      args: [selectedTier],
      blockNumber,
    }))
  )
    throw new Error("This membership is not registered with this protocol.");
  const tiers = selectedTier
    ? [selectedTier]
    : tierCount === 0n
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
    args: [assetOffset, assetLimit],
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
  const discovery = await Promise.allSettled(
    tiers.map(async (tier) => {
      const [status, held] = await Promise.all([
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "accountingStatus",
          blockNumber,
        }),
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "protocolFeeEarnedHeld",
          blockNumber,
        }),
      ]);
      return { tier, status, held };
    }),
  );
  if (selectedTier && discovery[0]?.status === "rejected")
    throw discovery[0].reason;
  const ready = discovery.flatMap((item) =>
    item.status === "fulfilled" &&
    (item.value.held > 0n ||
      (!item.value.status.complete && item.value.status.nextBoundary > 0n))
      ? [item.value]
      : [],
  );
  const accountingCount = ready.filter(
    (item) => !item.status.complete && item.status.nextBoundary > 0n,
  ).length;
  let remaining = accountingBudget;
  let remainingTiers = accountingCount;
  const advanceTiers = ready.map((item) => {
    const maxAccountingSteps =
      !item.status.complete && item.status.nextBoundary > 0n
        ? remaining / BigInt(remainingTiers--)
        : 0n;
    remaining -= maxAccountingSteps;
    return { tier: item.tier, maxAccountingSteps };
  });
  const unavailableTiers = discovery.filter(
    (item) => item.status === "rejected",
  ).length;
  const purchases = await Promise.all(
    (protocolToken === zeroAddress ? [] : assets).map(async (asset) => {
      const revision = await client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "revision",
        args: [asset],
        blockNumber,
      });
      return { asset, revision };
    }),
  );
  return {
    router,
    vault,
    blockNumber,
    timestamp: block.timestamp,
    tiers: advanceTiers.sort((a, b) =>
      a.tier.toLowerCase().localeCompare(b.tier.toLowerCase()),
    ),
    unavailableTiers,
    purchases: purchases
      .map(({ asset, revision }) => ({ asset, revision }))
      .sort((a, b) =>
        a.asset.toLowerCase().localeCompare(b.asset.toLowerCase()),
      ),
    deadline: block.timestamp + 300n,
    nextTierOffset:
      tierOffset + tierLength < tierCount ? tierOffset + tierLength : null,
    nextAssetOffset:
      assetOffset + BigInt(tokens.length) < tokenCount
        ? assetOffset + BigInt(tokens.length)
        : null,
    purchaseCoverageIncomplete: BigInt(tokens.length) < tokenCount,
    accountingCoverageIncomplete:
      !selectedTier && BigInt(tiers.length) < tierCount,
  };
}
