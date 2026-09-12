import type { TierSnapshot } from "@/contracts/types";
import { formatMembershipDate } from "./date";

export type MaintenanceOutcome = {
  processedSteps: bigint;
  retiredCount: bigint;
  complete: boolean;
};

export function MembershipMaintenance({
  status,
  canAdvance,
  onAdvance,
  outcome,
  loading = false,
  stale = false,
  pending = false,
  error,
}: {
  status?: TierSnapshot["accounting"];
  canAdvance: boolean;
  onAdvance: () => void;
  outcome?: MaintenanceOutcome;
  loading?: boolean;
  stale?: boolean;
  pending?: boolean;
  error?: string;
}) {
  return (
    <section
      className="control-group"
      aria-label="Membership maintenance"
      aria-busy={pending || loading}
    >
      <h2>Membership maintenance</h2>
      <p>
        Anyone can settle up to 25 funding or expiration boundaries per
        transaction, including while this tier is paused.
      </p>
      {loading ? (
        <p role="status">Loading maintenance status…</p>
      ) : (
        status && (
          <>
            <p>
              Accounting settled through{" "}
              {formatMembershipDate(status.accountedThrough)}.
            </p>
            <p>
              {status.complete
                ? "Accounting is up to date at this read."
                : "Pending work remains. Each confirmed batch preserves its progress."}
            </p>
            <p>
              {status.scheduledExpirations.toString()} memberships scheduled for
              expiration.
            </p>
          </>
        )
      )}
      {stale && <p>Refresh the status before advancing.</p>}
      {error && <p role="alert">{error}</p>}
      {pending ? (
        <p role="status">Waiting for maintenance confirmation…</p>
      ) : (
        outcome && (
          <p role="status">
            {outcome.processedSteps.toString()} boundaries processed;{" "}
            {outcome.retiredCount.toString()} memberships retired.{" "}
            {outcome.complete
              ? "This batch completed the pending work."
              : "More remains. Advance again to continue."}
          </p>
        )
      )}
      <button
        className="button button-outline"
        type="button"
        disabled={
          !canAdvance ||
          !status ||
          status.complete ||
          loading ||
          stale ||
          pending ||
          Boolean(error)
        }
        onClick={onAdvance}
      >
        Advance maintenance
      </button>
    </section>
  );
}
