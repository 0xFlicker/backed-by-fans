"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import type { RefillQuote } from "@/contracts/types";
import { parseTokenId } from "@/features/creator/management";
import { decodeTransactionError } from "@/lib/transaction-state";
import { refillReasonLabel } from "./periodic-refill-read";
import { refillAllowanceAmount } from "./refill-allowance";
import { formatMembershipDate } from "./date";

type Review = { quote: RefillQuote; isOwner: boolean; referralStatus: number };
export type RefillOutcome = { periods: bigint; gross: bigint };
const uint64Max = (1n << 64n) - 1n;
function days(seconds: bigint) {
  return formatUnits((seconds * 1_000_000n) / 86400n, 6);
}
function targetSeconds(value: string) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) return undefined;
  const scaled = parseUnits(value, 6) * 86400n;
  if (scaled % 1_000_000n !== 0n) return undefined;
  const seconds = scaled / 1_000_000n;
  return seconds > 0n && seconds <= uint64Max ? seconds : undefined;
}

export function PeriodicRefill({
  initialTokenId,
  chainTimestamp,
  canOperate,
  pending,
  periodicEnabled,
  paused,
  price,
  periodDuration,
  maxPrepaidPeriods,
  paymentLabel,
  walletAllowance,
  onReview,
  onTarget,
  onStop,
  onRefill,
  onAllowance,
}: {
  initialTokenId?: bigint;
  chainTimestamp: bigint;
  canOperate: boolean;
  pending: boolean;
  periodicEnabled: boolean;
  paused: boolean;
  price: bigint;
  periodDuration: bigint;
  maxPrepaidPeriods: bigint;
  paymentLabel: (raw: bigint) => string;
  onReview: (tokenId: bigint) => Promise<Review>;
  onTarget: (
    tokenId: bigint,
    seconds: bigint,
    referral: Address,
  ) => Promise<boolean>;
  onStop: (tokenId: bigint) => Promise<boolean>;
  walletAllowance?: bigint;
  onAllowance: (amount: bigint) => Promise<boolean>;
  onRefill: (quote: RefillQuote) => Promise<RefillOutcome | undefined>;
}) {
  const id = useId();
  const [selection, setSelection] = useState(initialTokenId?.toString() ?? "");
  const [previousTokenId, setPreviousTokenId] = useState(initialTokenId);
  const [review, setReview] = useState<Review>();
  const [target, setTarget] = useState("");
  const [referral, setReferral] = useState("");
  const [approvalMode, setApprovalMode] = useState("");
  const [approvalPeriods, setApprovalPeriods] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<string>();
  const version = useRef(0);
  const [elapsed, setElapsed] = useState(0n);
  useEffect(() => {
    if (!review) return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(BigInt(Math.floor((Date.now() - start) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, [review]);
  useEffect(
    () => () => {
      version.current += 1;
    },
    [initialTokenId],
  );
  if (previousTokenId !== initialTokenId) {
    setBusy(false);
    setPreviousTokenId(initialTokenId);
    if (selection === "" && initialTokenId !== undefined)
      setSelection(initialTokenId.toString());
    if (review?.quote.tokenId === previousTokenId) setReview(undefined);
  }
  const tokenId = parseTokenId(selection);
  const quote = review?.quote;
  const live =
    quote?.lifecycle === 0 &&
    chainTimestamp < quote.expiration &&
    quote.asOf + elapsed < quote.expiration;
  const enrolled = quote && quote.enrollment.authorizingOwner !== zeroAddress;
  const seconds = targetSeconds(target);
  const validTarget =
    seconds !== undefined &&
    seconds <= uint64Max - chainTimestamp &&
    (maxPrepaidPeriods === 0n || seconds <= maxPrepaidPeriods * periodDuration);
  const referralAddress = referral.trim() || zeroAddress;
  const targetChanged =
    quote &&
    (target !== days(quote.enrollment.targetSeconds || periodDuration) ||
      referralAddress.toLowerCase() !== quote.effectiveReferral.toLowerCase());
  let approvalAmount: bigint | undefined;
  let approvalError: string | undefined;
  try {
    approvalAmount = refillAllowanceAmount(
      approvalMode,
      approvalPeriods,
      price,
    );
  } catch (cause) {
    approvalError =
      cause instanceof Error ? cause.message : "Choose an approval amount.";
  }
  const disabled = !canOperate || pending || busy;
  const mutationDisabled = disabled || Boolean(error);
  async function read() {
    if (tokenId === undefined) return;
    const current = ++version.current;
    setBusy(true);
    setError(undefined);
    setOutcome(undefined);
    try {
      const next = await onReview(tokenId);
      if (version.current !== current) return;
      setElapsed(0n);
      setReview(next);
      setTarget(days(next.quote.enrollment.targetSeconds || periodDuration));
      setReferral(
        next.quote.effectiveReferral === zeroAddress
          ? ""
          : next.quote.effectiveReferral,
      );
    } catch (cause) {
      if (version.current === current) setError(decodeTransactionError(cause));
    } finally {
      if (version.current === current) setBusy(false);
    }
  }
  async function act(action: () => Promise<string | undefined>) {
    const current = ++version.current;
    setBusy(true);
    setError(undefined);
    setOutcome(undefined);
    try {
      const result = await action();
      if (version.current !== current) return;
      if (result) {
        setOutcome(result);
        setReview(undefined);
      }
    } catch (cause) {
      if (version.current === current) setError(decodeTransactionError(cause));
    } finally {
      if (version.current === current) setBusy(false);
    }
  }
  return (
    <section
      className="control-group periodic-refill"
      aria-label="Periodic refill"
      style={{ overflowWrap: "anywhere" }}
      aria-busy={busy || pending}
    >
      <h2>Periodic refill</h2>
      <p>Keep a target amount of membership time.</p>
      <div className="periodic-refill-layout">
        <div className="periodic-refill-review">
          <div className="periodic-refill-selection">
            <div className="creator-field">
              <label htmlFor={`${id}-token`}>Refill membership NFT</label>
              <input
                id={`${id}-token`}
                inputMode="numeric"
                value={selection}
                disabled={pending || busy}
                onChange={(event) => {
                  ++version.current;
                  setSelection(event.target.value);
                  setReview(undefined);
                  setOutcome(undefined);
                  setError(undefined);
                }}
              />
            </div>
            <button
              type="button"
              className="button button-outline"
              disabled={disabled || tokenId === undefined}
              onClick={() => void read()}
            >
              Review periodic refill
            </button>
          </div>
          {error && (
            <p role="alert">
              {error}
              {quote
                ? " Displayed refill information is stale. Review again."
                : ""}
            </p>
          )}
          {outcome && <p role="status">{outcome}</p>}
          {quote && (
            <>
              <h3>
                {!live && quote.lifecycle === 0
                  ? "Membership expired"
                  : paused && live && enrolled
                    ? "Tier paused"
                    : refillReasonLabel(quote.reason)}
              </h3>
              <dl className="terms-list">
                <div>
                  <dt>Owner</dt>
                  <dd style={{ overflowWrap: "anywhere" }}>{quote.owner}</dd>
                </div>
                <div>
                  <dt>Prepaid time</dt>
                  <dd>
                    {days(quote.paidSeconds)} days paid ·{" "}
                    {days(quote.grantSeconds)} days gifted
                  </dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{formatMembershipDate(quote.expiration)}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>
                    {enrolled
                      ? `${days(quote.enrollment.targetSeconds)} days`
                      : "Periodic refill off"}
                  </dd>
                </div>
                <div>
                  <dt>Owner balance</dt>
                  <dd>{paymentLabel(quote.balance)}</dd>
                </div>
                <div>
                  <dt>Tier allowance</dt>
                  <dd>
                    {quote.allowance === (1n << 256n) - 1n
                      ? "Unlimited"
                      : paymentLabel(quote.allowance)}
                  </dd>
                </div>
                <div>
                  <dt>Collectible now</dt>
                  <dd>
                    {quote.periods.toString()} whole periods ·{" "}
                    {paymentLabel(quote.gross)}
                  </dd>
                </div>
                <div>
                  <dt>Referral</dt>
                  <dd style={{ overflowWrap: "anywhere" }}>
                    {quote.effectiveReferral === zeroAddress
                      ? "None"
                      : quote.effectiveReferral}
                  </dd>
                </div>
              </dl>
              {price > 0n && (
                <div>
                  <p>
                    {formatUnits((quote.balance * 1_000_000n) / price, 6)}{" "}
                    balance-equivalent periods
                  </p>
                  <p>
                    {quote.allowance === (1n << 256n) - 1n
                      ? "Unlimited allowance"
                      : `${formatUnits((quote.allowance * 1_000_000n) / price, 6)} allowance-equivalent periods`}
                  </p>
                </div>
              )}
              <p>
                Other memberships share this balance and tier allowance. No
                funds are reserved.
              </p>
              {quote.periods > 0n && !quote.accounting.complete && (
                <p>Refill will update membership accounting first.</p>
              )}
              {paused && live && (
                <p>
                  Payments are paused. Still-live enrolled memberships can
                  refill after unpause.
                </p>
              )}
              {review.isOwner && live && periodicEnabled && price > 0n && (
                <>
                  <div className="creator-field">
                    <label htmlFor={`${id}-target`}>Refill target (days)</label>
                    <input
                      id={`${id}-target`}
                      inputMode="decimal"
                      value={target}
                      disabled={pending || busy}
                      onChange={(event) => setTarget(event.target.value)}
                    />
                  </div>
                  <div className="creator-field">
                    <label htmlFor={`${id}-referral`}>
                      Refill referral (optional)
                    </label>
                    <input
                      id={`${id}-referral`}
                      value={referral}
                      disabled={pending || busy || review.referralStatus !== 0}
                      onChange={(event) => setReferral(event.target.value)}
                    />
                  </div>
                  <p>
                    {review.referralStatus === 0
                      ? "This choice locks on the first successful paid purchase."
                      : "This membership’s referral choice is already locked."}
                  </p>
                  <p>
                    Saving a target moves no funds. Token approval is separate.
                  </p>
                  {!validTarget && (
                    <p>
                      Enter a positive target within this tier’s prepayment
                      limit.
                    </p>
                  )}
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={
                      mutationDisabled ||
                      !validTarget ||
                      !isAddress(referralAddress)
                    }
                    onClick={() =>
                      void act(async () =>
                        (await onTarget(
                          quote.tokenId,
                          seconds!,
                          referralAddress as Address,
                        ))
                          ? "Refill target saved. Review current readiness before a payment."
                          : undefined,
                      )
                    }
                  >
                    {enrolled
                      ? "Update refill target"
                      : "Enable periodic refill for this NFT"}
                  </button>
                  {enrolled && (
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={mutationDisabled}
                      onClick={() =>
                        void act(async () =>
                          (await onStop(quote.tokenId))
                            ? "Periodic refill off. Prepaid time is unchanged."
                            : undefined,
                        )
                      }
                    >
                      Stop periodic refill
                    </button>
                  )}
                </>
              )}
              {live && periodicEnabled && enrolled && !paused && (
                <p>Refill manually before your membership expires.</p>
              )}
              {live && periodicEnabled && (
                <button
                  type="button"
                  className="button"
                  disabled={
                    mutationDisabled ||
                    paused ||
                    quote.periods === 0n ||
                    Boolean(targetChanged)
                  }
                  onClick={() =>
                    void act(async () => {
                      const result = await onRefill(quote);
                      return result
                        ? result.periods > 0n
                          ? `Purchased ${result.periods} periods for ${paymentLabel(result.gross)}.`
                          : "No refill payment was needed or possible. Review current readiness."
                        : undefined;
                    })
                  }
                >
                  Refill {quote.periods.toString()} periods
                </button>
              )}
            </>
          )}
        </div>
        {periodicEnabled && price > 0n && walletAllowance !== undefined && (
          <div
            className="periodic-refill-approval"
            aria-label="Your payment approval"
          >
            <h3>Your payment approval</h3>
            <p>
              Your wallet’s tier allowance:{" "}
              {walletAllowance === (1n << 256n) - 1n
                ? "Unlimited"
                : paymentLabel(walletAllowance)}
              .
            </p>
            <div className="creator-field">
              <label htmlFor={`${id}-approval`}>Refill approval</label>
              <select
                id={`${id}-approval`}
                value={approvalMode}
                disabled={pending || busy}
                onChange={(event) => setApprovalMode(event.target.value)}
              >
                <option value="">Choose approval</option>
                <option value="finite">Finite amount</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>
            {approvalMode === "finite" && (
              <div className="creator-field">
                <label htmlFor={`${id}-approval-periods`}>
                  Approval periods
                </label>
                <input
                  id={`${id}-approval-periods`}
                  inputMode="numeric"
                  value={approvalPeriods}
                  disabled={pending || busy}
                  onChange={(event) => setApprovalPeriods(event.target.value)}
                />
              </div>
            )}
            {approvalMode && approvalError && <p>{approvalError}</p>}
            {approvalAmount !== undefined && (
              <p>
                {approvalMode === "unlimited"
                  ? "Unlimited tier allowance"
                  : `Tier allowance: ${paymentLabel(approvalAmount)}`}
                . Restoring allowance permits still-live enrolled memberships to
                refill.
              </p>
            )}
            {walletAllowance > 0n &&
              approvalAmount !== undefined &&
              approvalAmount > 0n &&
              approvalAmount !== walletAllowance && (
                <p>
                  Changing this allowance takes two approvals: reset to zero,
                  then set the new amount.
                </p>
              )}
            <div className="creator-actions">
              <button
                type="button"
                className="button button-outline"
                disabled={disabled || approvalAmount === undefined}
                onClick={() =>
                  void act(async () =>
                    (await onAllowance(approvalAmount!))
                      ? "Tier allowance updated. Enrollment is unchanged."
                      : undefined,
                  )
                }
              >
                Set tier allowance
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={disabled || walletAllowance === 0n}
                onClick={() =>
                  void act(async () =>
                    (await onAllowance(0n))
                      ? "Tier allowance revoked. Enrollment is unchanged; restoring allowance can resume still-live enrollments."
                      : undefined,
                  )
                }
              >
                Revoke tier allowance
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
