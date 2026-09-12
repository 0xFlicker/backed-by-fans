export function RetiredRewardClaim({
  credit,
  canClaim,
  onClaim,
  paymentLabel,
  loading = false,
  stale = false,
  pending = false,
  error,
}: {
  credit?: readonly [bigint, bigint];
  canClaim: boolean;
  onClaim: () => void;
  paymentLabel: (raw: bigint) => string;
  loading?: boolean;
  stale?: boolean;
  pending?: boolean;
  error?: string;
}) {
  return (
    <section
      className="control-group"
      aria-label="Ended membership rewards"
      aria-busy={pending || loading}
    >
      <h2>Ended membership rewards</h2>
      <p>
        Already-earned rewards stay yours after a membership ends. These settled
        rewards can be claimed while paused or while maintenance remains.
      </p>
      {loading ? (
        <p role="status">Loading ended membership rewards…</p>
      ) : (
        credit && (
          <>
            <p>
              {credit[0] === 0n && credit[1] === 0n
                ? "No ended membership rewards."
                : paymentLabel(credit[0])}
            </p>
            {credit[1] > 0n && (
              <p>
                Fractional credit is preserved and combines with future ended
                membership rewards.
              </p>
            )}
          </>
        )
      )}
      {stale && <p>Refresh this balance before claiming.</p>}
      {error && <p role="alert">{error}</p>}
      {pending && <p role="status">Waiting for reward confirmation…</p>}
      <button
        className="button button-outline"
        type="button"
        disabled={
          !canClaim ||
          !credit ||
          credit[0] === 0n ||
          loading ||
          stale ||
          pending ||
          Boolean(error)
        }
        onClick={onClaim}
      >
        Claim ended membership rewards
      </button>
    </section>
  );
}
