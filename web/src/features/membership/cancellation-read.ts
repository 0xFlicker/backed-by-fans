import { zeroAddress, type Address, type PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";
import { isSameAddress } from "@/lib/address";

/** One chain/block snapshot. A quote never implies operator authority. */
export async function readCancellation(
  client: PublicClient,
  tier: Address,
  tokenId: bigint,
  actor: Address,
) {
  const block = await client.getBlock({ blockTag: "latest" });
  const common = {
    address: tier,
    abi: membershipTierAbi,
    blockNumber: block.number,
  } as const;
  // Resolve lifecycle first, including burned IDs, without ownerOf on a retired token.
  const deadline = block.timestamp + 120n;
  const time = await client.readContract({
    ...common,
    functionName: "timeBalances",
    args: [tokenId],
  });
  const remaining = time[0] + time[1];
  const liveDeadline =
    remaining > 0n && remaining <= 120n
      ? block.timestamp + remaining - 1n
      : deadline;
  if (remaining === 1n)
    throw new Error(
      "No time remains to review a protected cancellation before expiration.",
    );
  const quote = await client.readContract({
    ...common,
    functionName: "previewCancellation",
    args: [tokenId, liveDeadline, 25n],
  });
  if (!quote.cancellationEligible || quote.owner === zeroAddress)
    return { quote, authorized: false };
  const [approved, operator] = await Promise.all([
    client.readContract({
      ...common,
      functionName: "getApproved",
      args: [tokenId],
    }),
    client.readContract({
      ...common,
      functionName: "isApprovedForAll",
      args: [quote.owner, actor],
    }),
  ]);
  return {
    quote,
    authorized:
      isSameAddress(actor, quote.owner) ||
      isSameAddress(actor, approved) ||
      operator,
  };
}
