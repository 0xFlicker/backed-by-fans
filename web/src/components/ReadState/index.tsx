import type { ReactNode } from "react";

import type { ReadState } from "@/lib/read-state";

type ReadStateViewProps<T> = {
  state: ReadState<T>;
  children?: (data: T) => ReactNode;
  heading?: string;
  onRetry?: () => void;
};

const statusCopy = {
  loading: "Reading onchain",
  valid: "Current onchain state",
  stale: "Refresh required",
  partial: "Partial onchain state",
  "wrong-chain": "Wrong network",
  unavailable: "Onchain state unavailable",
  "rate-limited": "Public RPC is busy",
  "invalid-address": "Invalid tier address",
  "interface-mismatch": "Unverified contract",
} as const;

export function ReadStateView<T>({
  state,
  children,
  heading,
  onRetry,
}: ReadStateViewProps<T>) {
  const canRenderData =
    (state.status === "valid" || state.status === "stale") && children;
  const canRetry =
    onRetry &&
    ["stale", "partial", "unavailable", "rate-limited"].includes(state.status);
  const label =
    "label" in state && state.label ? state.label : statusCopy[state.status];

  return (
    <section
      aria-busy={state.status === "loading"}
      aria-live="polite"
      className={`read-state read-state-${state.status}`}
      data-read-state={state.status}
    >
      <div className="read-state-heading">
        <span aria-hidden="true" className="status-glyph">
          {state.status === "valid"
            ? "✓"
            : state.status === "loading"
              ? "…"
              : "!"}
        </span>
        <div>
          <p className="eyebrow">{heading ?? statusCopy[state.status]}</p>
          <p>{label}</p>
        </div>
      </div>

      {state.status === "interface-mismatch" && (
        <ul className="read-state-list">
          {state.failedChecks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      )}
      {state.status === "partial" && state.missing.length > 0 && (
        <details>
          <summary>Missing reads</summary>
          <ul className="read-state-list">
            {state.missing.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </details>
      )}
      {canRetry && (
        <button className="text-button" onClick={onRetry} type="button">
          Retry direct read
        </button>
      )}
      {canRenderData && (
        <div className="read-state-content">{children(state.data)}</div>
      )}
    </section>
  );
}
