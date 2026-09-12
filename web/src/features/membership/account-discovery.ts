import { type Address, type PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";
import type { AccountTierResult } from "./account-cache";
import { verifyTierAuthenticity } from "@/lib/authenticity";
import { isSameAddress } from "@/lib/address";
import type { ReadyDeployment } from "@/lib/config";
import {
  multicall3Address,
  readCatalogPage,
  verifyMulticall3,
} from "@/lib/direct-read";

export const accountDiscoveryPageLimit = 12;
export type AccountDiscoveryPage = {
  capturedBlock: bigint;
  total: bigint;
  offset: bigint;
  scannedTo: bigint;
  nextOffset: bigint | null;
  scannedTiers: Address[];
  results: AccountTierResult[];
  skipped: string[];
};
export async function readAccountOwnerPage(
  client: PublicClient,
  input: {
    deployment: ReadyDeployment;
    wallet: Address;
    tier: Address;
    offset: bigint;
    blockNumber: bigint;
  },
): Promise<AccountTierResult> {
  const authenticity = await verifyTierAuthenticity(client, {
    deployment: input.deployment,
    tier: input.tier,
    blockNumber: input.blockNumber,
  });
  if (authenticity.status !== "verified") throw new Error(authenticity.label);
  const common = {
    address: input.tier,
    abi: membershipTierAbi,
    blockNumber: input.blockNumber,
  } as const;
  const [name, page, claimableReferral, owner, retired, batched] =
    await Promise.all([
      client.readContract({ ...common, functionName: "name" }),
      client.readContract({
        ...common,
        functionName: "tokensOfOwner",
        args: [input.wallet, input.offset, 100n],
      }),
      client.readContract({
        ...common,
        functionName: "claimableReferral",
        args: [input.wallet],
      }),
      client.readContract({ ...common, functionName: "owner" }),
      client.readContract({
        ...common,
        functionName: "claimableRetiredReward",
        args: [input.wallet],
      }),
      verifyMulticall3(client, input.blockNumber),
    ]);
  const contracts = page.tokenIds.flatMap((tokenId) => [
    { ...common, functionName: "ownerOf", args: [tokenId] },
    { ...common, functionName: "isActiveToken", args: [tokenId] },
    { ...common, functionName: "expiresAt", args: [tokenId] },
    { ...common, functionName: "claimableReward", args: [tokenId] },
  ]);
  let values: unknown[];
  if (batched === "verified" && contracts.length) {
    const results = (await client.multicall({
      contracts: contracts as never,
      allowFailure: true,
      blockNumber: input.blockNumber,
      multicallAddress: multicall3Address,
    })) as Array<
      { status: "success"; result: unknown } | { status: "failure" }
    >;
    if (
      results.length !== contracts.length ||
      results.some((result) => result.status !== "success")
    )
      throw new Error("A position read failed. Retry this ownership page.");
    values = results.map((result) =>
      result.status === "success" ? result.result : undefined,
    );
  } else
    values = await Promise.all(
      contracts.map((contract) => client.readContract(contract as never)),
    );
  const positions = page.tokenIds.map((tokenId, index) => {
    const [positionOwner, active, expiration, claimableReward] = values.slice(
      index * 4,
      index * 4 + 4,
    );
    if (
      typeof positionOwner !== "string" ||
      !isSameAddress(positionOwner as Address, input.wallet) ||
      typeof active !== "boolean" ||
      typeof expiration !== "bigint" ||
      typeof claimableReward !== "bigint"
    )
      throw new Error(
        "Membership ownership could not be verified. Refresh memberships.",
      );
    return { tokenId, active, expiration, claimableReward };
  });
  const creatorOwned = isSameAddress(owner, input.wallet);
  const creatorProceeds = creatorOwned
    ? await client.readContract({ ...common, functionName: "creatorProceeds" })
    : 0n;
  return {
    tier: input.tier,
    name,
    paymentToken: authenticity.paymentToken,
    creatorOwned,
    positions,
    ownerBalance: page.balance,
    nextOwnerOffset: page.nextOffset,
    ownerComplete: page.complete,
    claimableReferral,
    creatorProceeds,
    retiredReward: retired[0],
    retiredFractionalScaled: retired[1],
  };
}
export async function discoverAccountPage(
  client: PublicClient,
  input: {
    deployment: ReadyDeployment;
    wallet: Address;
    offset: bigint;
    blockNumber?: bigint;
  },
): Promise<AccountDiscoveryPage> {
  const capturedBlock =
    input.blockNumber ?? (await client.getBlockNumber({ cacheTime: 0 }));
  const page = await readCatalogPage(client, input.deployment.factoryAddress, {
    offset: input.offset,
    limit: accountDiscoveryPageLimit,
    blockNumber: capturedBlock,
  });
  const results: AccountTierResult[] = [];
  const skipped: string[] = [];
  const scannedTiers: Address[] = [];
  for (const tier of page.addresses) {
    try {
      const result = await readAccountOwnerPage(client, {
        ...input,
        tier,
        offset: 0n,
        blockNumber: capturedBlock,
      });
      const interested =
        result.creatorOwned ||
        result.ownerBalance > 0n ||
        result.retiredReward > 0n ||
        result.retiredFractionalScaled > 0n ||
        result.claimableReferral > 0n ||
        (await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "hasClaimInterest",
          args: [input.wallet],
          blockNumber: capturedBlock,
        }));
      if (interested) results.push(result);
      scannedTiers.push(tier);
    } catch (error) {
      skipped.push(
        `${tier}: ${error instanceof Error ? error.message : "Membership reads unavailable"}`,
      );
    }
  }
  return {
    capturedBlock,
    total: page.total,
    offset: page.offset,
    scannedTo: page.offset + BigInt(page.addresses.length),
    nextOffset: page.nextOffset,
    scannedTiers,
    results,
    skipped,
  };
}
