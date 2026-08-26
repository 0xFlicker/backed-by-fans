"use client";

import type {
  TransactionPhase,
  TransactionState,
} from "@/lib/transaction-state";

const phases: { phase: TransactionPhase; label: string }[] = [
  { phase: "simulation", label: "Simulation" },
  { phase: "approval", label: "Approval" },
  { phase: "signature", label: "Signature" },
  { phase: "submission", label: "Submission" },
  { phase: "confirmation", label: "Confirmation" },
  { phase: "reconciliation", label: "Reconciliation" },
];

export function TransactionFlow({
  state,
  onRetry,
  onReconcile,
}: {
  state: TransactionState;
  onRetry?: () => void;
  onReconcile?: () => void;
}) {
  const activeIndex = phases.findIndex(({ phase }) => phase === state.phase);
  const retryable = ["cancelled", "reverted", "retry"].includes(state.phase);

  return (
    <section className="transaction-flow" aria-labelledby="transaction-title">
      <div className="transaction-heading">
        <div>
          <p className="eyebrow">Transaction status</p>
          <h2 id="transaction-title">Clear from check to reconciliation</h2>
        </div>
        <span className="transaction-phase-label">
          {state.phase === "idle" ? "Ready" : state.phase}
        </span>
      </div>

      <ol className="transaction-steps">
        {phases.map(({ phase, label }, index) => {
          const current = phase === state.phase;
          const complete =
            state.phase === "confirmed" ||
            (activeIndex >= 0 && index < activeIndex);
          return (
            <li
              aria-current={current ? "step" : undefined}
              className={current ? "is-current" : complete ? "is-complete" : ""}
              key={phase}
            >
              <span aria-hidden="true">{complete ? "✓" : index + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      <div
        aria-live="polite"
        className={`transaction-message transaction-${state.phase}`}
        role={state.phase === "reverted" ? "alert" : "status"}
      >
        <p>{state.message}</p>
        {state.error && <p className="transaction-error">{state.error}</p>}
        {state.hash && <code>{state.hash}</code>}
        {state.replacementHash && <code>{state.replacementHash}</code>}
      </div>

      {retryable && onRetry && (
        <button className="button button-dark" onClick={onRetry} type="button">
          Retry from simulation
        </button>
      )}
      {state.phase === "uncertain" && onReconcile && (
        <button
          className="button button-dark"
          onClick={onReconcile}
          type="button"
        >
          Recheck onchain outcome
        </button>
      )}
      {state.phase === "uncertain" && (
        <p className="small-copy">
          Keep this page open and recheck the exact postcondition. Never resend
          this action only because a receipt or read timed out.
        </p>
      )}
      {state.phase === "replacement" && (
        <p className="small-copy">
          The replacement must confirm and reconcile before success is shown.
        </p>
      )}
    </section>
  );
}
