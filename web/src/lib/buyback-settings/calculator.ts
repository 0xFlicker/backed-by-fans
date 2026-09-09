import type { Address } from "viem";
import { exactAmount } from "../buyback-policy/math";

export type ExecutionLimits = {
  minInput: bigint;
  maxInput: bigint;
  minInterval: bigint;
};
export type LimitDraft = {
  asset: Address;
  minimum: string;
  maximum: string;
  intervalMinutes: string;
  decimals: number;
  multiplier: bigint;
};
export const maxUint128 = (1n << 128n) - 1n;
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;

/** Round down to hundredths of a percent consistently across calculator and execution tools. */
export function percentageBps(percent: number): bigint {
  if (!Number.isFinite(percent) || percent < 0.01 || percent > 100)
    throw new Error("Percentage must be between 0.01 and 100.");
  return BigInt(Math.floor(percent * 100 + 1e-9));
}

export function intervalSeconds(minutes: string) {
  const value = Number(minutes);
  const seconds = Math.round(value * 60);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(seconds) ||
    Math.abs(value * 60 - seconds) > 1e-9
  )
    throw new Error(
      "Intervals must be nonnegative minutes, with whole-second precision.",
    );
  return BigInt(seconds);
}
export function draftLimits(draft: LimitDraft): ExecutionLimits {
  const minInput = exactAmount(draft.minimum, draft.decimals, draft.multiplier);
  const maxInput = exactAmount(draft.maximum, draft.decimals, draft.multiplier);
  if (minInput > maxInput)
    throw new Error("The minimum batch cannot exceed the maximum.");
  return {
    minInput,
    maxInput,
    minInterval: intervalSeconds(draft.intervalMinutes),
  };
}

/** Offchain planning only. Neither the target nor gas preference authorizes spending. */
export function recommendLimits(input: {
  available: bigint;
  targetPercent: number;
  horizonHours: number;
  preferredBatches: number;
  maxGasPercent: number;
  gasWei?: bigint;
  nativeValueWei?: bigint;
  quotedAmount?: bigint;
}) {
  const {
    available,
    targetPercent,
    horizonHours,
    preferredBatches,
    maxGasPercent,
    gasWei,
    nativeValueWei,
    quotedAmount = available,
  } = input;
  if (
    !Number.isFinite(targetPercent) ||
    targetPercent <= 0 ||
    targetPercent > 100 ||
    !Number.isFinite(horizonHours) ||
    horizonHours <= 0 ||
    horizonHours > 720 ||
    !Number.isInteger(preferredBatches) ||
    preferredBatches < 1 ||
    preferredBatches > 64 ||
    !Number.isFinite(maxGasPercent) ||
    maxGasPercent <= 0 ||
    maxGasPercent > 100
  )
    throw new Error(
      "Choose 0–100% of funds, a horizon up to 30 days, 1–64 buys, and a positive gas percentage.",
    );
  const target = (available * percentageBps(targetPercent)) / 10000n;
  if (target <= 0n)
    return {
      status: "defer" as const,
      reason: "No earned funds to schedule.",
      target,
    };
  if (
    gasWei === undefined ||
    nativeValueWei === undefined ||
    quotedAmount <= 0n ||
    gasWei <= 0n ||
    nativeValueWei <= 0n
  )
    return {
      status: "unpriced" as const,
      reason:
        "Starting sizes from your target; gas has not been priced. Rehearse these settings before treating them as economical.",
      target,
      batches: preferredBatches,
      limits: {
        minInput: ceil(target, BigInt(preferredBatches)),
        maxInput: ceil(target, BigInt(preferredBatches)),
        minInterval: BigInt(
          Math.max(1, Math.floor((horizonHours * 3600) / preferredBatches)),
        ),
      },
    };
  const gasBps = percentageBps(maxGasPercent);
  if (gasBps === 0n) throw new Error("Gas preference must be at least 0.01%.");
  const affordable =
    (nativeValueWei * target * gasBps) / (quotedAmount * gasWei * 10000n);
  const economicMinimum = ceil(
    gasWei * quotedAmount * 10000n,
    nativeValueWei * gasBps,
  );
  if (affordable < 1n)
    return {
      status: "defer" as const,
      reason: "Combine more funds into one purchase to meet your gas target.",
      target,
      economicMinimum,
      shortfall: economicMinimum - target,
    };
  const batches = Number(
    affordable < BigInt(preferredBatches)
      ? affordable
      : BigInt(preferredBatches),
  );
  const maxInput = ceil(target, BigInt(batches));
  const minInput = economicMinimum > maxInput ? maxInput : economicMinimum;
  if (maxInput > maxUint128)
    throw new Error("The recommended batch exceeds the contract amount limit.");
  return {
    status: "ready" as const,
    target,
    batches,
    limits: {
      minInput,
      maxInput,
      minInterval: BigInt(
        Math.max(1, Math.floor((horizonHours * 3600) / batches)),
      ),
    },
    reason: `${batches} purchase${batches === 1 ? "" : "s"} estimated to fit your gas target. Rehearse to check the adjusted sizes.`,
  };
}
