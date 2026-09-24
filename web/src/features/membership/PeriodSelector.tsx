"use client";
import { useId } from "react";
import { parseUint64Input } from "@/features/creator/management";

export function PeriodSelector({
  label = "Periods",
  value,
  onChange,
  periodDuration,
  maxPrepaidPeriods,
  paidSeconds = 0n,
  periodLabel,
  priceLabel,
  summary,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  periodDuration: bigint;
  maxPrepaidPeriods: bigint;
  paidSeconds?: bigint;
  periodLabel: string;
  priceLabel: string;
  summary?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const count = parseUint64Input(value, { allowZero: false });
  const limit =
    maxPrepaidPeriods === 0n
      ? (1n << 64n) - 1n
      : ((maxPrepaidPeriods + 1n) * periodDuration - 1n - paidSeconds) /
        periodDuration;
  const max = limit > 0n ? limit : 0n;
  function step(direction: bigint) {
    const next = count === undefined ? 1n : count + direction;
    if (next >= 1n && next <= max) onChange(next.toString());
  }
  return (
    <div className="period-selector">
      <label htmlFor={id}>{label}</label>
      <div className="period-selector-row">
        <div className="period-stepper">
          <button
            type="button"
            aria-label={`Decrease ${label.toLowerCase()}`}
            disabled={disabled || count === undefined || count <= 1n}
            onClick={() => step(-1n)}
          >
            −
          </button>
          <input
            id={id}
            inputMode="numeric"
            value={value}
            disabled={disabled}
            aria-invalid={value !== "" && (count === undefined || count > max)}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                step(event.key === "ArrowUp" ? 1n : -1n);
              }
            }}
          />
          <button
            type="button"
            aria-label={`Increase ${label.toLowerCase()}`}
            disabled={
              disabled || max < 1n || (count !== undefined && count >= max)
            }
            onClick={() => step(1n)}
          >
            +
          </button>
        </div>
        <div className="period-selection-readout">
          <strong aria-live="polite">
            {count !== undefined ? summary : "Choose whole periods"}
          </strong>
          <small>
            {periodLabel} / period · {priceLabel} each
          </small>
        </div>
      </div>
    </div>
  );
}
