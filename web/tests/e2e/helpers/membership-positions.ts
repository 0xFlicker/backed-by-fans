import { expect } from "@playwright/test";
import {
  parseEventLogs,
  keccak256,
  toBytes,
  zeroAddress,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import {
  membershipFactoryAbi,
  membershipTierAbi,
} from "../../../src/contracts";

/** Assert the fixture really has one position; never silently choose among siblings. */
export async function expectSingleOwnedPosition(
  client: PublicClient,
  tier: Address,
  owner: Address,
) {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const page = await client.readContract({
    address: tier,
    abi: membershipTierAbi,
    functionName: "tokensOfOwner",
    args: [owner, 0n, 100n],
    blockNumber,
  });
  expect(page.complete).toBe(true);
  expect(page.balance).toBe(1n);
  expect(page.tokenIds).toHaveLength(1);
  expect(
    (
      await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "ownerOf",
        args: [page.tokenIds[0]],
        blockNumber,
      })
    ).toLowerCase(),
  ).toBe(owner.toLowerCase());
  return page.tokenIds[0];
}
export async function hasLiveOwnedPosition(
  client: PublicClient,
  tier: Address,
  owner: Address,
) {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const page = await client.readContract({
    address: tier,
    abi: membershipTierAbi,
    functionName: "tokensOfOwner",
    args: [owner, 0n, 100n],
    blockNumber,
  });
  expect(page.complete).toBe(true);
  const live = await Promise.all(
    page.tokenIds.map((tokenId) =>
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "isActiveToken",
        args: [tokenId],
        blockNumber,
      }),
    ),
  );
  return live.some(Boolean);
}
export function mintedPosition(
  receipt: TransactionReceipt,
  tier: Address,
  owner: Address,
) {
  expect(receipt.status).toBe("success");
  const mint = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "Transfer",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      event.address.toLowerCase() === tier.toLowerCase() &&
      event.args.from === zeroAddress &&
      event.args.to.toLowerCase() === owner.toLowerCase(),
  );
  expect(mint).toBeDefined();
  return mint!.args.tokenId;
}

/** Create a local portfolio fixture with the canonical renderer/art already deployed. */
export async function createPortfolioTier(name: string) {
  const {
    anvilPublicClient,
    requiredAnvilAddress,
    sendContract,
    expectSuccessfulReceipt,
  } = await import("./anvil");
  const client = anvilPublicClient();
  const creator = requiredAnvilAddress("creator");
  const factory = requiredAnvilAddress("factory");
  const source = requiredAnvilAddress("tier");
  const paymentToken = requiredAnvilAddress("paymentToken");
  const [renderer, art, media, minimumPayment, count] = await Promise.all([
    client.readContract({
      address: source,
      abi: membershipTierAbi,
      functionName: "renderer",
    }),
    client.readContract({
      address: source,
      abi: membershipTierAbi,
      functionName: "artConfig",
    }),
    client.readContract({
      address: source,
      abi: membershipTierAbi,
      functionName: "mediaConfig",
    }),
    client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "minimumPayment",
      args: [paymentToken],
    }),
    client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "tierCount",
    }),
  ]);
  const price = minimumPayment > 1_000_000n ? minimumPayment : 1_000_000n;
  expectSuccessfulReceipt(
    await sendContract({
      account: creator,
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "createTier",
      args: [
        {
          creator,
          tierSalt: keccak256(toBytes(name)),
          renderer,
          paymentToken,
          name,
          symbol: "PAGE",
          pricePerPeriod: price,
          minimumPayment,
          periodDuration: 86_400n,
          protocolFeeBps: 500,
          rewardBps: 1000,
          referralBps: 500,
          startingBoostBps: 10000,
          earlySupportGross: 0n,
          supplyCap: 0n,
          maxPrepaidPeriods: 0n,
          metadata: {
            description: "Local multi-position portfolio acceptance",
            externalURI: "",
          },
          art,
          media,
        },
      ],
    }),
  );
  const [tier] = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "tiers",
    args: [count, 1n],
  });
  return { tier, price, name };
}
