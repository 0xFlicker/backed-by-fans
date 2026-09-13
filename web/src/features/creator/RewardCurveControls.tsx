"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CreatorForm, CreatorFormResult } from "@/features/creator/config";
import type { AcceptedPaymentToken } from "@/lib/payment-token-read";
import { displayedToRaw, formatRawTokenAmount } from "@/lib/token-amount";
import {
  previewRewardShares,
  rewardCurveLabel,
  type RewardCurveTerms,
} from "@/lib/reward-curve";

function rewardCurveCopy({
  terms,
  token,
  label,
}: {
  terms: RewardCurveTerms;
  token?: AcceptedPaymentToken;
  label?: string;
}) {
  const boost = terms.startingBoostBps / 10000;
  const defaultWindow =
    terms.pricePerPeriod > 0n
      ? terms.pricePerPeriod * 1000n
      : token
        ? displayedToRaw({
            displayed: "10000",
            decimals: token.decimals,
            multiplier: token.uiMultiplier,
          })
        : undefined;
  const summaryLabel =
    boost === 1 || terms.earlySupportGross === defaultWindow
      ? rewardCurveLabel(terms.startingBoostBps)
      : "Custom";
  const window =
    terms.pricePerPeriod > 0n
      ? `${(terms.earlySupportGross / terms.pricePerPeriod).toLocaleString()} purchased periods`
      : token
        ? `${formatRawTokenAmount({ raw: terms.earlySupportGross, decimals: token.decimals, multiplier: token.uiMultiplier })} ${token.symbol} in total contributions`
        : `${terms.earlySupportGross.toString()} raw payment-token units in total contributions`;
  const exampleGross =
    terms.pricePerPeriod > 0n
      ? terms.pricePerPeriod
      : terms.earlySupportGross / 100n || 1n;
  const average =
    Number((previewRewardShares(terms, exampleGross) * 10000n) / exampleGross) /
    10000;
  const example =
    terms.pricePerPeriod > 0n
      ? "one purchased period"
      : token
        ? `a contribution of ${formatRawTokenAmount({ raw: exampleGross, decimals: token.decimals, multiplier: token.uiMultiplier })} ${token.symbol}`
        : `a contribution of ${exampleGross.toString()} raw payment-token units`;
  return {
    label: label ?? summaryLabel,
    description:
      boost === 1
        ? "Every positive payment earns normal linear weight: 1×, with no early-support bonus."
        : `Reward weight starts at ${boost}× and tapers to the normal 1× rate across ${window}.`,
    example: `At launch, ${example} receives ${average.toLocaleString(undefined, { maximumFractionDigits: 4 })}× average weight. ${boost === 1 ? "Every purchase earns the same rate." : "Larger purchases span more of the taper."}`,
    defaultWindow,
  };
}

export function RewardCurveSummary({
  terms,
  token,
  label,
  reservePresets = false,
}: {
  terms: RewardCurveTerms;
  token?: AcceptedPaymentToken;
  label?: string;
  reservePresets?: boolean;
}) {
  const copy = rewardCurveCopy({ terms, token, label });
  // Invisible copies share each text row, so its height follows the longest
  // preset at the actual font size and available width, without fixed heights.
  const alternatives = reservePresets
    ? [10000, 15000, 30000].map((startingBoostBps) =>
        rewardCurveCopy({
          terms: {
            ...terms,
            startingBoostBps,
            earlySupportGross:
              startingBoostBps === 10000
                ? 0n
                : (copy.defaultWindow ?? terms.earlySupportGross),
          },
          token,
        }),
      )
    : [];
  return (
    <div className="reward-curve-summary">
      <p className="reward-curve-copy-row">
        <span>
          <strong>{copy.label}.</strong> {copy.description}
        </span>
        {alternatives.map((alternative) => (
          <span
            key={alternative.label}
            className="reward-curve-copy-reserve"
            aria-hidden="true"
          >
            <strong data-copy={`${alternative.label}.`} />{" "}
            <span data-copy={alternative.description} />
          </span>
        ))}
      </p>
      <p className="reward-curve-copy-row">
        <span>{copy.example}</span>
        {alternatives.map((alternative) => (
          <span
            key={alternative.label}
            className="reward-curve-copy-reserve"
            aria-hidden="true"
            data-copy={alternative.example}
          />
        ))}
      </p>
      <p className="small-copy">
        Weight determines a member’s share of rewards earned while eligible. It
        is not a cash payout or a promised return.
      </p>
    </div>
  );
}

function CurveChart({ terms }: { terms: RewardCurveTerms }) {
  // Relative horizontal scale: one complete early window, or one period for None.
  const end = terms.earlySupportGross || terms.pricePerPeriod || 1000n;
  const maximum = previewRewardShares(terms, end);
  const points = Array.from({ length: 41 }, (_, i) => {
    const gross = (end * BigInt(i)) / 40n;
    const y =
      maximum === 0n
        ? 0
        : Number((previewRewardShares(terms, gross) * 10000n) / maximum) /
          10000;
    return `${24 + i * 10},${148 - y * 124}`;
  });
  const linearEnd =
    maximum === 0n
      ? 148
      : 148 - (Number((end * 10000n) / maximum) / 10000) * 124;
  const line = useRef<SVGPolylineElement>(null);
  const baseline = useRef<SVGPathElement>(null);
  const current = useRef<number[] | undefined>(undefined);
  const targetKey = `${points.map((point) => point.split(",")[1]).join(",")},${linearEnd}`;
  useLayoutEffect(() => {
    const target = targetKey.split(",").map(Number);
    const from = current.current ?? target;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function draw(values: number[]) {
      current.current = values;
      line.current?.setAttribute(
        "points",
        values
          .slice(0, 41)
          .map((y, i) => `${24 + i * 10},${y}`)
          .join(" "),
      );
      baseline.current?.setAttribute("d", `M24 148L424 ${values[41]}`);
    }
    function finish() {
      cancelAnimationFrame(frame);
      draw(target);
    }
    if (motion.matches || from.every((value, i) => value === target[i])) {
      finish();
    } else {
      const start = performance.now();
      draw(from);
      function tick(now: number) {
        const progress = Math.min(1, (now - start) / 320);
        const eased = 1 - (1 - progress) ** 3;
        draw(from.map((value, i) => value + (target[i] - value) * eased));
        if (progress < 1) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }
    const onMotionChange = () => {
      if (motion.matches) finish();
    };
    motion.addEventListener("change", onMotionChange);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", onMotionChange);
    };
  }, [targetKey]);
  return (
    <div className="reward-curve-chart" aria-hidden="true">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 448 180">
        <path className="reward-curve-axis" d="M24 20V148H424" />
        <path
          ref={baseline}
          className="reward-curve-baseline"
          d={`M24 148L424 ${linearEnd}`}
        />
        <polyline
          ref={line}
          className="reward-curve-line"
          points={points.join(" ")}
        />
        <text x="24" y="173">
          Purchased support →
        </text>
        <text x="26" y="14">
          Cumulative reward weight
        </text>
      </svg>
    </div>
  );
}

export function RewardCurveControls({
  form,
  result,
  token,
  onChange,
}: {
  form: CreatorForm;
  result: CreatorFormResult;
  token?: AcceptedPaymentToken;
  onChange: (
    patch: Pick<CreatorForm, "startingBoost" | "earlySupportWindow">,
  ) => void;
}) {
  const id = useId();
  const [custom, setCustom] = useState(false);
  const [previewCurve, setPreviewCurve] = useState(result.curve);
  if (result.curve && result.curve !== previewCurve)
    setPreviewCurve(result.curve);
  const pwyw = result.curve
    ? result.curve.pricePerPeriod === 0n
    : /^0+(?:\.0+)?$/.test(form.displayedPrice.trim());
  const defaultWindow = pwyw ? "10000" : "1000";
  const inferred = rewardCurveLabel(Number(form.startingBoost) * 10000);
  const selected = custom
    ? "Custom"
    : inferred === "None"
      ? "None"
      : form.earlySupportWindow !== "" &&
          form.earlySupportWindow !== defaultWindow
        ? "Custom"
        : inferred;
  const showCustom = custom || selected === "Custom";
  function preset(value: string) {
    setCustom(value === "Custom");
    if (value !== "Custom")
      onChange({
        startingBoost: value === "None" ? "1" : value === "More" ? "3" : "1.5",
        earlySupportWindow: "",
      });
  }
  return (
    <section className="reward-curve-controls" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Reward early supporters</h3>
      <p>
        Earlier purchased support receives more weight. One person buying
        several periods advances the window as much as several people buying the
        same total.
      </p>
      <fieldset className="reward-curve-presets">
        <legend className="sr-only">Early-support reward strength</legend>
        {(
          [
            ["None", "1×"],
            ["Some", "1.5×"],
            ["More", "3×"],
            ["Custom", "Your terms"],
          ] as const
        ).map(([name, description]) => (
          <label key={name}>
            <input
              type="radio"
              name={`${id}-preset`}
              checked={selected === name}
              onChange={() => preset(name)}
            />
            <span>
              <strong>{name}</strong>
              <small>{description}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {!showCustom && result.errors.earlySupportWindow && (
        <p role="alert">
          {result.errors.earlySupportWindow} Choose Custom to set a supported
          window.
        </p>
      )}
      {previewCurve && (
        <>
          <CurveChart terms={previewCurve} />
          <RewardCurveSummary
            reservePresets
            terms={previewCurve}
            token={token}
            label={selected}
          />
        </>
      )}
      <p className="small-copy">
        Boost and window are permanent when published. A zero contribution adds
        access only, with no new weight or funded rewards. Expired memberships
        retire permanently; returning creates a new position.
      </p>
      {showCustom && (
        <div className="creator-field-grid reward-curve-custom">
          <div className="creator-field">
            <label htmlFor={`${id}-boost`}>Starting boost (×)</label>
            <input
              id={`${id}-boost`}
              inputMode="decimal"
              value={form.startingBoost}
              aria-invalid={Boolean(result.errors.startingBoost)}
              aria-describedby={`${id}-boost-hint ${id}-boost-error`}
              onChange={(event) => {
                setCustom(true);
                onChange({
                  startingBoost: event.target.value,
                  earlySupportWindow: form.earlySupportWindow,
                });
              }}
            />
            <p className="field-hint" id={`${id}-boost-hint`}>
              1–10, in steps of 0.01. A boost of 1 means None.
            </p>
            <p
              className="field-error"
              id={`${id}-boost-error`}
              role={result.errors.startingBoost ? "alert" : undefined}
            >
              {result.errors.startingBoost}
            </p>
          </div>
          <div className="creator-field">
            <label htmlFor={`${id}-window`}>
              Early-support window (
              {pwyw ? (token?.symbol ?? "payment tokens") : "purchased periods"}
              )
            </label>
            <input
              id={`${id}-window`}
              inputMode={pwyw ? "decimal" : "numeric"}
              value={form.earlySupportWindow}
              placeholder={defaultWindow}
              aria-invalid={Boolean(result.errors.earlySupportWindow)}
              aria-describedby={`${id}-window-hint ${id}-window-error`}
              onChange={(event) => {
                setCustom(true);
                onChange({
                  startingBoost: form.startingBoost,
                  earlySupportWindow: event.target.value,
                });
              }}
            />
            <p className="field-hint" id={`${id}-window-hint`}>
              {pwyw
                ? "Total positive contributions, in displayed token units."
                : "A positive whole number of purchased membership periods."}{" "}
              Default: {Number(defaultWindow).toLocaleString()}. None has no
              window.
            </p>
            <p
              className="field-error"
              id={`${id}-window-error`}
              role={result.errors.earlySupportWindow ? "alert" : undefined}
            >
              {result.errors.earlySupportWindow}
            </p>
          </div>
        </div>
      )}
      {previewCurve && !result.curve && (
        <p role="status">
          Showing the last valid curve. Complete the custom fields to update it.
        </p>
      )}
    </section>
  );
}
