import {
  parseEventLogs,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";

import { membershipTierAbi } from "@/contracts";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

export type TierGrantBaseline = {
  tier: Address;
  recipient: Address;
  tokenId: bigint;
  baselineTimestamp: bigint;
  baselinePaidSeconds: bigint;
  baselineGrantSeconds: bigint;
  grantedSeconds: bigint;
};

function balancesAt(
  baseline: TierGrantBaseline,
  timestamp: bigint,
): { paidSeconds: bigint; grantSeconds: bigint } | undefined {
  if (timestamp < baseline.baselineTimestamp) return undefined;
  const elapsed = timestamp - baseline.baselineTimestamp;
  const total = baseline.baselinePaidSeconds + baseline.baselineGrantSeconds;
  if (elapsed >= total) return { paidSeconds: 0n, grantSeconds: 0n };
  if (elapsed < baseline.baselinePaidSeconds) {
    return {
      paidSeconds: baseline.baselinePaidSeconds - elapsed,
      grantSeconds: baseline.baselineGrantSeconds,
    };
  }
  return {
    paidSeconds: 0n,
    grantSeconds:
      baseline.baselineGrantSeconds - (elapsed - baseline.baselinePaidSeconds),
  };
}

export async function reconcileTierGrant(
  client: PublicClient,
  baseline: TierGrantBaseline,
  receipt: SuccessfulWriteReceipt,
) {
  const mint = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "Transfer",
    logs: receipt.logs,
    strict: true,
  }).find(
    (event) =>
      isSameAddress(event.address, baseline.tier) &&
      isSameAddress(event.args.from, zeroAddress) &&
      isSameAddress(event.args.to, baseline.recipient),
  );
  const tokenId = baseline.tokenId || mint?.args.tokenId;
  if (!tokenId) return undefined;
  const [owner, balances, block] = await Promise.all([
    client.readContract({
      address: baseline.tier,
      abi: membershipTierAbi,
      functionName: "ownerOf",
      args: [tokenId],
      blockNumber: receipt.blockNumber,
    }),
    client.readContract({
      address: baseline.tier,
      abi: membershipTierAbi,
      functionName: "timeBalances",
      args: [tokenId],
      blockNumber: receipt.blockNumber,
    }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  if (!isSameAddress(owner, baseline.recipient)) return undefined;

  const previous = balancesAt(baseline, block.timestamp);
  if (!previous) return undefined;
  const paidSeconds = previous.paidSeconds;
  const grantSeconds = previous.grantSeconds + baseline.grantedSeconds;
  const expiration = block.timestamp + paidSeconds + grantSeconds;
  const proven = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "MembershipTimeUpdated",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, baseline.tier) &&
      event.args.tokenId === tokenId &&
      event.args.paidSeconds === paidSeconds &&
      event.args.grantSeconds === grantSeconds &&
      event.args.expiration === expiration,
  );

  return proven && balances[0] === paidSeconds && balances[1] === grantSeconds
    ? { tokenId, paidSeconds, grantSeconds, expiration }
    : undefined;
}

export function receiptProvesGrantRevocation(
  receipt: SuccessfulWriteReceipt,
  input: { tier: Address; tokenId: bigint },
) {
  return parseEventLogs({
    abi: membershipTierAbi,
    eventName: "MembershipTimeUpdated",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      event.args.tokenId === input.tokenId &&
      event.args.grantSeconds === 0n,
  );
}
