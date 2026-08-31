"use client";

import type {
  TransactionPhase,
  TransactionState,
} from "@/lib/transaction-state";

const phases: { phase: TransactionPhase; label: string }[] = [
  { phase: "simulation", label: "Check" },
  { phase: "approval", label: "Approval" },
  { phase: "signature", label: "Wallet" },
  { phase: "submission", label: "Sent" },
  { phase: "confirmation", label: "Confirmed" },
  { phase: "reconciliation", label: "Finish" },
];

const phaseLabels: Record<TransactionPhase, string> = {
  idle: "Ready",
  simulation: "Checking",
  approval: "Approval",
  signature: "Wallet",
  submission: "Sending",
  confirmation: "Waiting",
  reconciliation: "Finishing",
  confirmed: "Complete",
  replacement: "Replaced",
  uncertain: "Check wallet",
  cancelled: "Cancelled",
  reverted: "Rejected",
  retry: "Try again",
};

export function TransactionFlow({
  state,
  onRetry,
}: {
  state: TransactionState;
  onRetry?: () => void;
}) {
  if (state.phase === "idle") return null;

  const activeIndex = phases.findIndex(({ phase }) => phase === state.phase);
  const retryable = ["cancelled", "reverted", "retry"].includes(state.phase);

  return (
    <section className="transaction-flow" aria-labelledby="transaction-title">
      <div className="transaction-heading">
        <div>
          <h2 id="transaction-title">Progress</h2>
        </div>
        <span className="transaction-phase-label">
          {phaseLabels[state.phase]}
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
        {state.hash || state.replacementHash ? (
          <details className="technical-details">
            <summary>Transaction ID</summary>
            {state.hash ? <code>{state.hash}</code> : null}
            {state.replacementHash ? (
              <code>{state.replacementHash}</code>
            ) : null}
          </details>
        ) : null}
      </div>

      {retryable && onRetry && (
        <button className="button button-dark" onClick={onRetry} type="button">
          Try again
        </button>
      )}
      {state.phase === "uncertain" && (
        <p className="small-copy">Check your wallet before trying again.</p>
      )}
      {state.phase === "replacement" && (
        <p className="small-copy">Waiting for the replacement to finish.</p>
      )}
    </section>
  );
}
