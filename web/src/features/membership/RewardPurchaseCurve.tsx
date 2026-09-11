import type { RewardCurveTerms } from "@/lib/reward-curve";

type Quote = { grossBefore: bigint; grossAfter: bigint; sharesAdded: bigint };

export function RewardPurchaseCurve({
  terms,
  quote,
}: {
  terms: RewardCurveTerms;
  quote?: Quote;
}) {
  const horizon = terms.earlySupportGross;
  const end = [
    horizon,
    terms.pricePerPeriod,
    quote?.grossAfter ?? 0n,
    1n,
  ].reduce((a, b) => (a > b ? a : b));
  const boost = terms.startingBoostBps / 10000;
  const top = Math.max(boost, 1.25);
  const x = (gross: bigint) =>
    40 + (Number((gross * 10000n) / end) / 10000) * 368;
  const multiplier = (gross: bigint) =>
    horizon === 0n || gross >= horizon
      ? 1
      : 1 +
        ((boost - 1) * Number(((horizon - gross) * 10000n) / horizon)) / 10000;
  const y = (value: number) => 140 - ((value - 1) / (top - 1)) * 100;
  const bend = horizon > 0n && horizon < end ? `${x(horizon)},${y(1)} ` : "";
  const highlighted = quote && quote.grossAfter > quote.grossBefore;
  return (
    <div className="reward-purchase-curve">
      <p className="small-copy">
        {boost === 1
          ? "Every purchase earns 1× reward weight."
          : `Early support earns up to ${boost.toLocaleString()}× reward weight, tapering to 1×.`}
        {highlighted ? " Your purchase is highlighted." : ""}
      </p>
      <svg viewBox="0 0 448 190" aria-hidden="true" focusable="false">
        <text x="40" y="16">
          Reward multiplier
        </text>
        <path className="reward-curve-baseline" d="M40 140H408" />
        <text x="12" y="144">
          1×
        </text>
        {boost > 1 && (
          <text x="8" y="44">
            {boost}×
          </text>
        )}
        {highlighted && (
          <g
            data-purchase-start={quote.grossBefore.toString()}
            data-purchase-end={quote.grossAfter.toString()}
          >
            <rect
              className="reward-purchase-span"
              x={x(quote.grossBefore)}
              y="30"
              width={x(quote.grossAfter) - x(quote.grossBefore)}
              height="120"
            />
            <path
              className="reward-purchase-marker"
              d={`M${x(quote.grossBefore)} 30V150M${x(quote.grossAfter)} 30V150`}
            />
            <circle
              className="reward-purchase-point"
              cx={x(quote.grossBefore)}
              cy={y(multiplier(quote.grossBefore))}
              r="4"
            />
          </g>
        )}
        <polyline
          className="reward-curve-line"
          points={`40,${y(boost)} ${bend}${x(end)},${y(multiplier(end))}`}
        />
        <text x="40" y="180">
          Purchased support →
        </text>
      </svg>
    </div>
  );
}
