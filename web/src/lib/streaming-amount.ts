export const ACCOUNTING_SCALE = 1n << 128n;
export type EarningsStream = {
  raw: bigint;
  fractional: bigint;
  rate: bigint;
  asOf: bigint;
  nextBoundary: bigint;
  complete: boolean;
};
export function projectedAmount(
  stream: EarningsStream,
  elapsedMs: number,
): bigint {
  const boundaryMs =
    stream.nextBoundary === 0n
      ? 30_000
      : Number(
          stream.nextBoundary > stream.asOf
            ? stream.nextBoundary - stream.asOf
            : 0n,
        ) * 1000;
  const elapsed = stream.complete
    ? Math.max(0, Math.min(30_000, boundaryMs, elapsedMs))
    : 0;
  return (
    stream.raw +
    (stream.fractional + (stream.rate * BigInt(Math.floor(elapsed))) / 1000n) /
      ACCOUNTING_SCALE
  );
}
export function earningsStream(
  preview: {
    asOf: bigint;
    ratesScaled: readonly bigint[];
    current: {
      creator: bigint;
      member: bigint;
      referral: bigint;
      protocol: bigint;
      fractionalScaled: readonly bigint[];
      status: { complete: boolean; nextBoundary: bigint };
    };
  },
  category: 0 | 1 | 2 | 3,
): EarningsStream {
  return {
    raw: [
      preview.current.creator,
      preview.current.member,
      preview.current.referral,
      preview.current.protocol,
    ][category],
    fractional: preview.current.fractionalScaled[category],
    rate: preview.ratesScaled[category],
    asOf: preview.asOf,
    nextBoundary: preview.current.status.nextBoundary,
    complete: preview.current.status.complete,
  };
}
