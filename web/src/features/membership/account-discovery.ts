import type { Address, PublicClient } from "viem";

import { tierAbi } from "@/contracts/abis";
import type { AccountTierResult } from "@/features/membership/account-cache";
import { verifyTierAuthenticity } from "@/lib/authenticity";
import { isSameAddress } from "@/lib/address";
import { readCatalogPage } from "@/lib/direct-read";

export const accountDiscoveryPageLimit = 12;

export type AccountDiscoveryPage = {
  capturedBlock: bigint;
  total: bigint;
  offset: bigint;
  scannedTo: bigint;
  nextOffset: bigint | null;
  results: AccountTierResult[];
  skipped: string[];
};

async function inspectTier(
  client: PublicClient,
  input: {
    tier: Address;
    factory: Address;
    paymentToken: Address;
    wallet: Address;
    blockNumber: bigint;
  },
): Promise<{ result?: AccountTierResult; skipped?: string }> {
  const authenticity = await verifyTierAuthenticity(client, {
    factory: input.factory,
    tier: input.tier,
    expectedPaymentToken: input.paymentToken,
    blockNumber: input.blockNumber,
  });
  if (authenticity.status !== "verified") {
    return { skipped: `${input.tier}: ${authenticity.label}` };
  }

  try {
    const [name, tokenId, claimableReferral, owner] = await Promise.all([
      client.readContract({
        address: input.tier,
        abi: tierAbi,
        functionName: "name",
        blockNumber: input.blockNumber,
      }),
      client.readContract({
        address: input.tier,
        abi: tierAbi,
        functionName: "tokenOf",
        args: [input.wallet],
        blockNumber: input.blockNumber,
      }),
      client.readContract({
        address: input.tier,
        abi: tierAbi,
        functionName: "claimableReferral",
        args: [input.wallet],
        blockNumber: input.blockNumber,
      }),
      client.readContract({
        address: input.tier,
        abi: tierAbi,
        functionName: "owner",
        blockNumber: input.blockNumber,
      }),
    ]);
    const [active, claimableReward, creatorProceeds] = await Promise.all([
      tokenId === 0n
        ? false
        : client.readContract({
            address: input.tier,
            abi: tierAbi,
            functionName: "isActiveToken",
            args: [tokenId],
            blockNumber: input.blockNumber,
          }),
      tokenId === 0n
        ? 0n
        : client.readContract({
            address: input.tier,
            abi: tierAbi,
            functionName: "claimableReward",
            args: [tokenId],
            blockNumber: input.blockNumber,
          }),
      isSameAddress(owner, input.wallet)
        ? client.readContract({
            address: input.tier,
            abi: tierAbi,
            functionName: "creatorProceeds",
            blockNumber: input.blockNumber,
          })
        : 0n,
    ]);
    if (tokenId === 0n && claimableReferral === 0n && creatorProceeds === 0n) {
      return {};
    }
    return {
      result: {
        tier: input.tier,
        name,
        tokenId,
        active,
        claimableReward,
        claimableReferral,
        creatorProceeds,
      },
    };
  } catch (error) {
    return {
      skipped: `${input.tier}: ${
        error instanceof Error ? error.message : "claim reads unavailable"
      }`,
    };
  }
}

export async function discoverAccountPage(
  client: PublicClient,
  input: {
    factory: Address;
    paymentToken: Address;
    wallet: Address;
    offset: bigint;
  },
): Promise<AccountDiscoveryPage> {
  const page = await readCatalogPage(client, input.factory, {
    offset: input.offset,
    limit: accountDiscoveryPageLimit,
  });
  const inspected = await Promise.all(
    page.addresses.map((tier) =>
      inspectTier(client, {
        ...input,
        tier,
        blockNumber: page.capturedBlock,
      }),
    ),
  );
  return {
    capturedBlock: page.capturedBlock,
    total: page.total,
    offset: page.offset,
    scannedTo: page.offset + BigInt(page.addresses.length),
    nextOffset: page.nextOffset,
    results: inspected.flatMap(({ result }) => (result ? [result] : [])),
    skipped: inspected.flatMap(({ skipped }) => (skipped ? [skipped] : [])),
  };
}
