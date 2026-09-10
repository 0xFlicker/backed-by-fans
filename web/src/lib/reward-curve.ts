import type { TierPublicationConfig } from "@/features/protocol/registry-reconciliation";

export type RewardCurveTerms = Pick<
  TierPublicationConfig,
  "startingBoostBps" | "earlySupportGross" | "pricePerPeriod"
>;

export function rewardCurveLabel(boost: number) {
  return boost === 10000
    ? "None"
    : boost === 15000
      ? "Some"
      : boost === 30000
        ? "More"
        : "Custom";
}

/** Presentation arithmetic only. Transactions use the contract's execution-time issuance. */
export function previewRewardShares(
  terms: RewardCurveTerms,
  gross: bigint,
  cursor = 0n,
): bigint {
  const cap = (1n << 112n) - 1n;
  if (gross < 0n || cursor < 0n || gross + cursor > cap)
    throw new RangeError("Reward preview exceeds the supported payment range.");
  const boost = terms.startingBoostBps;
  const horizon = terms.earlySupportGross;
  if (
    !Number.isInteger(boost) ||
    boost < 10000 ||
    boost > 100000 ||
    boost % 100 !== 0 ||
    (boost === 10000 ? horizon !== 0n : horizon <= 0n || horizon > cap)
  ) {
    throw new RangeError("Reward preview needs valid published curve terms.");
  }
  const cumulative = (value: bigint) => {
    if (boost === 10000) return value;
    const u = value < horizon ? value : horizon;
    return (
      value +
      (BigInt(boost - 10000) * u * (2n * horizon - u)) / (20000n * horizon)
    );
  };
  return cumulative(cursor + gross) - cumulative(cursor);
}
