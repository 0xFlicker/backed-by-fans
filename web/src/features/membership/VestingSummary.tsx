import type { TierManagementSnapshot } from "@/contracts/types";
import { formatMembershipDate } from "@/features/membership/date";

/** Settled ledger values only. Member reserves belong to the future pool. */
export function VestingSummary({
  reserves,
  paymentLabel,
  creator = false,
}: {
  reserves: TierManagementSnapshot["reserves"];
  paymentLabel: (raw: bigint) => string;
  creator?: boolean;
}) {
  const amount = (scaled: bigint) =>
    scaled > 0n && scaled < 1n << 128n
      ? `Less than ${paymentLabel(1n)}`
      : paymentLabel(scaled / (1n << 128n));
  return (
    <section
      className="control-group vesting-summary"
      aria-label="Vesting and accounting"
    >
      <h2>Rewards over time</h2>
      <p>
        Payments earn as membership time is used. Unused time stays reserved for
        refunds.
      </p>
      <dl className="refund-preview">
        {creator && (
          <div>
            <dt>Reserved creator funding</dt>
            <dd>{amount(reserves.unearnedScaled[0])}</dd>
          </div>
        )}
        <div>
          <dt>Reserved for all members</dt>
          <dd>{amount(reserves.unearnedScaled[1])}</dd>
        </div>
        <div>
          <dt>Accounting settled through</dt>
          <dd>{formatMembershipDate(reserves.status.accountedThrough)}</dd>
        </div>
      </dl>
      <p>This pool is shared by eligible members as rewards earn.</p>
      <p>
        {reserves.status.complete
          ? "Accounting is up to date at this read."
          : reserves.status.scheduledMembers === 0n
            ? "No funding checkpoints remain. Already-settled claims remain available."
            : "Claiming rewards settles new earnings automatically."}
      </p>
    </section>
  );
}
