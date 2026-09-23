import { zeroAddress, type Address, type PublicClient } from "viem";
import { membershipTierAbi } from "@/contracts";
import { isSameAddress } from "@/lib/address";

export async function readPeriodicRefill(
  client: PublicClient,
  tier: Address,
  tokenId: bigint,
  maxPeriods: bigint,
  actor: Address,
) {
  const block = await client.getBlock({ blockTag: "latest" });
  const quote = await client.readContract({
    address: tier,
    abi: membershipTierAbi,
    functionName: "previewRefill",
    args: [tokenId, maxPeriods],
    blockNumber: block.number,
  });
  const [referralStatus] = await client.readContract({
    address: tier,
    abi: membershipTierAbi,
    functionName: "referralOf",
    args: [tokenId],
    blockNumber: block.number,
  });
  return {
    quote,
    referralStatus,
    isOwner: quote.owner !== zeroAddress && isSameAddress(actor, quote.owner),
  };
}

const reasonLabels = [
  "Ready to refill",
  "Target covered",
  "Balance too low",
  "Allowance too low",
  "Prepayment limit reached",
  "No whole-period headroom",
  "Tier paused",
  "Periodic refill unavailable",
  "Periodic refill off",
  "Membership expired",
  "Membership retired",
] as const;
export function refillReasonLabel(reason: number) {
  const label = reasonLabels[reason];
  if (!label) throw new Error(`Unknown refill status: ${reason}`);
  return label;
}
