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
  if (tokenCount > 100n)
    throw new Error(
      "This protocol exceeds the browser's discovery limit. Use the execution runner.",
    );
  const tierPages = tierCount === 0n ? 1n : (tierCount + 7n) / 8n;
  const tierOffset = (blockNumber % tierPages) * 8n;
  const tierLength = tierCount - tierOffset < 8n ? tierCount - tierOffset : 8n;
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
      (!item.value.status.complete && item.value.status.scheduledMembers > 0n))
      ? [item.value]
      : [],
  );
  const accountingCount = ready.filter(
    (item) => !item.status.complete && item.status.scheduledMembers > 0n,
  ).length;
  let remaining = 25n;
  let remainingTiers = accountingCount;
  const advanceTiers = ready.map((item) => {
    const maxAccountingSteps =
      !item.status.complete && item.status.scheduledMembers > 0n
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
    tiers: advanceTiers,
    unavailableTiers,
    purchases: purchases.map(({ asset, revision }) => ({ asset, revision })),
    deadline: block.timestamp + 300n,
    moreAccounting:
      (!selectedTier && BigInt(tiers.length) < tierCount) ||
      ready.some((item) => !item.status.complete),
  };
}
