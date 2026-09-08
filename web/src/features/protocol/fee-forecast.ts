import type { Address, PublicClient, ContractFunctionReturnType } from "viem";
import { membershipTierAbi } from "@/contracts";

export type FeeState = ContractFunctionReturnType<
  typeof membershipTierAbi,
  "view",
  "protocolFeeState"
>;
export type FeeLot = ContractFunctionReturnType<
  typeof membershipTierAbi,
  "view",
  "protocolFeeLots"
>[number];
export type MemberFeeProjection = {
  id: bigint;
  generation: bigint;
  state: FeeState;
  lots: readonly FeeLot[];
  lotOffset: bigint;
  completeLots: boolean;
};
export type TierFeeLedger = {
  blockNumber: bigint;
  timestamp: bigint;
  totalMembers: bigint;
  allocated: bigint;
  holdings: bigint;
  earnedHeld: bigint;
  released: bigint;
  refunded: bigint;
  cancellationRounding: bigint;
};
export type FeeCoverage = {
  blockNumber: bigint;
  timestamp: bigint;
  totalMembers: bigint;
  offset: bigint;
  members: readonly MemberFeeProjection[];
};

function entitlement(lot: FeeLot, consumed: bigint) {
  if (lot.endPaid <= lot.startPaid) throw new Error("Invalid paid fee lot");
  if (consumed <= lot.startPaid) return 0n;
  if (consumed >= lot.endPaid) return lot.fee;
  return (lot.fee * (consumed - lot.startPaid)) / (lot.endPaid - lot.startPaid);
}

/** Existing paid schedules only; future refunds and market execution are conditional. */
export function forecastMemberFees(member: MemberFeeProjection) {
  if (member.generation !== member.state.generation)
    throw new Error("Fee lot generation mismatch");
  const incremental = (seconds: bigint) =>
    member.lots.reduce(
      (sum, lot) =>
        sum +
        entitlement(lot, member.state.consumedPaid + seconds) -
        entitlement(lot, member.state.consumedPaid),
      0n,
    );
  return {
    next24h: incremental(86400n),
    next7d: incremental(7n * 86400n),
    next30d: incremental(30n * 86400n),
    complete: member.completeLots,
  };
}

export function reconcileTierFees(
  ledger: TierFeeLedger,
  coverage: FeeCoverage,
) {
  const complete =
    ledger.blockNumber === coverage.blockNumber &&
    ledger.timestamp === coverage.timestamp &&
    ledger.totalMembers === coverage.totalMembers &&
    coverage.offset === 0n &&
    BigInt(coverage.members.length) === ledger.totalMembers &&
    coverage.members.every((member, index) => member.id === BigInt(index) + 1n);
  const unearned = complete
    ? coverage.members.reduce((sum, member) => sum + member.state.unearned, 0n)
    : null;
  const uncheckpointed = complete
    ? coverage.members.reduce(
        (sum, member) => sum + member.state.uncheckpointedEarned,
        0n,
      )
    : null;
  return {
    complete,
    storedConserved:
      ledger.allocated === ledger.holdings + ledger.released + ledger.refunded,
    projectedConserved: complete
      ? ledger.holdings === unearned! + uncheckpointed! + ledger.earnedHeld
      : null,
    unearned,
    uncheckpointed,
    earnedAwaitingRelease:
      uncheckpointed === null ? null : uncheckpointed + ledger.earnedHeld,
    immediatelyReleasable: ledger.earnedHeld,
  };
}

export async function readFeeForecastPage(
  client: PublicClient,
  tier: Address,
  options: { blockNumber?: bigint; offset?: bigint; limit?: number } = {},
) {
  const offset = options.offset ?? 0n,
    limit = options.limit ?? 100;
  if (offset < 0n || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Fee pages require 1–100 members and a nonnegative offset");
  const block = await client.getBlock(
    options.blockNumber === undefined
      ? {}
      : { blockNumber: options.blockNumber },
  );
  const blockNumber = block.number;
  const names = [
    "totalMinted",
    "totalProtocolFeeAllocated",
    "protocolFeeHoldings",
    "protocolFeeEarnedHeld",
    "totalProtocolFeeReleased",
    "totalProtocolFeeRefunded",
    "totalProtocolFeeCancellationRounding",
  ] as const;
  const [
    totalMembers,
    allocated,
    holdings,
    earnedHeld,
    released,
    refunded,
    cancellationRounding,
  ] = await Promise.all(
    names.map((functionName) =>
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName,
        blockNumber,
      }),
    ),
  );
  const count =
    offset >= totalMembers
      ? 0
      : Number(
          totalMembers - offset < BigInt(limit)
            ? totalMembers - offset
            : BigInt(limit),
        );
  const members = await Promise.all(
    Array.from(
      { length: count },
      async (_, index): Promise<MemberFeeProjection> => {
        const id = offset + BigInt(index) + 1n;
        const state = await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "protocolFeeState",
          args: [id],
          blockNumber,
        });
        const lots = await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "protocolFeeLots",
          args: [id, 0n, 100n],
          blockNumber,
        });
        if (
          BigInt(lots.length) !==
          (state.lotCount < 100n ? state.lotCount : 100n)
        )
          throw new Error("Incomplete protocol fee lot page");
        return {
          id,
          generation: state.generation,
          state,
          lots,
          lotOffset: 0n,
          completeLots: state.lotCount <= 100n,
        };
      },
    ),
  );
  const ledger: TierFeeLedger = {
    blockNumber,
    timestamp: block.timestamp,
    totalMembers,
    allocated,
    holdings,
    earnedHeld,
    released,
    refunded,
    cancellationRounding,
  };
  const coverage: FeeCoverage = {
    blockNumber,
    timestamp: block.timestamp,
    totalMembers,
    offset,
    members,
  };
  const forecasts = members.map(forecastMemberFees);
  return {
    ...coverage,
    ledger,
    reconciliation: reconcileTierFees(ledger, coverage),
    nextOffset:
      offset + BigInt(count) < totalMembers ? offset + BigInt(count) : null,
    forecast: {
      next24h: forecasts.reduce((sum, item) => sum + item.next24h, 0n),
      next7d: forecasts.reduce((sum, item) => sum + item.next7d, 0n),
      next30d: forecasts.reduce((sum, item) => sum + item.next30d, 0n),
      complete:
        offset === 0n &&
        BigInt(count) === totalMembers &&
        forecasts.every((item) => item.complete),
    },
  };
}

/** Continue a member's current generation at the original captured block. */
export async function readNextFeeLotPage(
  client: PublicClient,
  tier: Address,
  blockNumber: bigint,
  member: MemberFeeProjection,
): Promise<MemberFeeProjection> {
  if (member.lotOffset !== 0n || member.generation !== member.state.generation)
    throw new Error("Fee lot coverage or generation mismatch");
  const offset = BigInt(member.lots.length);
  if (offset >= member.state.lotCount) return member;
  const [state, lots] = await Promise.all([
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "protocolFeeState",
      args: [member.id],
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "protocolFeeLots",
      args: [member.id, offset, 100n],
      blockNumber,
    }),
  ]);
  if (
    state.generation !== member.generation ||
    state.lotCount !== member.state.lotCount ||
    state.consumedPaid !== member.state.consumedPaid
  )
    throw new Error("Fee lot snapshot changed");
  const remaining = state.lotCount - offset;
  if (BigInt(lots.length) !== (remaining < 100n ? remaining : 100n))
    throw new Error("Incomplete protocol fee lot page");
  return {
    ...member,
    lots: [...member.lots, ...lots],
    completeLots: offset + BigInt(lots.length) === state.lotCount,
  };
}
