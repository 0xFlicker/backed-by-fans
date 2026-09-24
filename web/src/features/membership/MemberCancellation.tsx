"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import type { CancellationQuote } from "@/contracts/types";
import { decodeTransactionError } from "@/lib/transaction-state";
import { formatMembershipDate } from "./date";

type Review = { quote: CancellationQuote; authorized: boolean };
type Outcome = { ownerRefund: bigint; creatorRetained: bigint; owner: Address };

export function MemberCancellation({
  initialTokenId,
  membershipName,
  expiration,
  membershipPicker,
  chainTimestamp,
  canOperate,
  pending,
  paymentLabel,
  onReview,
  onCancel,
}: {
  initialTokenId?: bigint;
  membershipName?: string;
  expiration?: bigint;
  membershipPicker?: ReactNode;
  chainTimestamp?: bigint;
  canOperate: boolean;
  pending: boolean;
  paymentLabel: (raw: bigint) => string;
  onReview: (tokenId: bigint) => Promise<Review>;
  onCancel: (quote: CancellationQuote) => Promise<Outcome | undefined>;
}) {
  const [changing, setChanging] = useState(false);
  const [review, setReview] = useState<Review>();
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome & { tokenId: bigint }>();
  const [elapsed, setElapsed] = useState(0n);
  const version = useRef(0);
  const [previousTokenId, setPreviousTokenId] = useState(initialTokenId);
  if (previousTokenId !== initialTokenId) {
    setPreviousTokenId(initialTokenId);
    setReview(undefined);
    setConfirmed(false);
    setLoading(false);
    setError(undefined);
    setChanging(false);
  }
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
  const tokenId =
    initialTokenId && initialTokenId > 0n ? initialTokenId : undefined;
  const quote = review?.quote;
  const expired =
    quote !== undefined &&
    (quote.asOf + elapsed > quote.deadline ||
      (chainTimestamp !== undefined && chainTimestamp > quote.deadline));
  const positionExpired =
    quote?.cancellationEligible &&
    chainTimestamp !== undefined &&
    chainTimestamp >= quote.asOf + quote.paidSeconds + quote.grantSeconds;
  const usable =
    quote?.cancellationEligible &&
    quote.quoteAvailable &&
    quote.complete &&
    review?.authorized &&
    !expired &&
    !positionExpired;
  async function read() {
    if (tokenId === undefined) return;
    const current = ++version.current;
    setLoading(true);
    setError(undefined);
    setReview(undefined);
    setConfirmed(false);
    setOutcome(undefined);
    try {
      const result = await onReview(tokenId);
      if (current !== version.current) return;
      setElapsed(0n);
      setReview(result);
    } catch (error) {
      if (current === version.current) setError(decodeTransactionError(error));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }
  async function cancel() {
    if (!quote || !usable || !confirmed || !canOperate || pending) return;
    try {
      const result = await onCancel(quote);
      if (result) {
        setOutcome({ ...result, tokenId: quote.tokenId });
        setReview(undefined);
        setConfirmed(false);
      }
    } catch (error) {
      setError(decodeTransactionError(error));
    }
  }
  return (
    <section
      className="control-group"
      aria-label="Cancel membership"
      aria-busy={pending || loading}
    >
      <h2>Cancel membership</h2>
      <p>
        Permanently end this NFT’s access and reward weight. The current owner
        receives the refundable share of unused funding; earned rewards remain
        claimable.
      </p>
      <div className="cancellation-membership">
        {tokenId !== undefined ? (
          <>
            <strong>
              {membershipName ? `${membershipName} · ` : ""}Membership #
              {tokenId.toString()}
            </strong>
            {expiration !== undefined && (
              <span>
                {chainTimestamp !== undefined && expiration <= chainTimestamp
                  ? "Expired"
                  : "Active through"}{" "}
                {formatMembershipDate(expiration)}
              </span>
            )}
          </>
        ) : (
          <p>Select one of your memberships to cancel.</p>
        )}
        {membershipPicker && (
          <button
            type="button"
            className="button button-outline"
            disabled={pending}
            onClick={() => setChanging(!changing)}
            aria-expanded={changing}
          >
            Change membership
          </button>
        )}
        {changing && membershipPicker}
      </div>
      <button
        type="button"
        className="button button-outline"
        disabled={!canOperate || pending || loading || tokenId === undefined}
        onClick={() => void read()}
      >
        Review cancellation
      </button>
      {error && <p role="alert">{error}</p>}
      {quote && (!quote.cancellationEligible || positionExpired) && (
        <p role="status">
          This membership has {quote.lifecycle === 2 ? "retired" : "expired"}{" "}
          and cannot be canceled.
        </p>
      )}
      {quote?.cancellationEligible &&
        (!quote.complete || !quote.quoteAvailable) && (
          <p role="status">
            Advance membership accounting, then review cancellation again.
          </p>
        )}
      {quote?.cancellationEligible && !review?.authorized && (
        <p role="status">
          Only the current owner or approved operator can cancel.
        </p>
      )}
      {expired && !positionExpired && (
        <p role="status">This quote expired. Review cancellation again.</p>
      )}
      {usable && quote && (
        <>
          <dl className="refund-preview" aria-live="polite">
            <div>
              <dt>Unused funding</dt>
              <dd>{paymentLabel(quote.canceledGross)}</dd>
            </div>
            <div>
              <dt>Owner refund share</dt>
              <dd>
                {(10000 - quote.creatorRetentionBps) / 100}% of unused funding
              </dd>
            </div>
            <div>
              <dt>Estimated refund</dt>
              <dd>{paymentLabel(quote.ownerRefund)}</dd>
            </div>
            <div>
              <dt>Minimum refund</dt>
              <dd>{paymentLabel(quote.minOwnerRefund)}</dd>
            </div>
            <div>
              <dt>Creator keeps</dt>
              <dd>
                {quote.creatorRetentionBps / 100}% of unused funding ·{" "}
                {paymentLabel(quote.creatorRetained)}
              </dd>
            </div>
            <div>
              <dt>Refund recipient</dt>
              <dd>{quote.owner}</dd>
            </div>
            <div>
              <dt>Paid time ending</dt>
              <dd>{quote.paidSeconds.toLocaleString()} seconds</dd>
            </div>
            <div>
              <dt>Gifted time ending</dt>
              <dd>{quote.grantSeconds.toLocaleString()} seconds</dd>
            </div>
            <div>
              <dt>Confirm by</dt>
              <dd>{formatMembershipDate(quote.deadline)}</dd>
            </div>
          </dl>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            End membership #{quote.tokenId.toString()} and all remaining time.
          </label>
          <button
            type="button"
            className="button button-outline"
            disabled={!confirmed || !canOperate || pending}
            onClick={() => void cancel()}
          >
            Cancel membership #{quote.tokenId.toString()}
          </button>
        </>
      )}
      {outcome && (
        <p role="status">
          Canceled membership #{outcome.tokenId.toString()}. Refunded{" "}
          {paymentLabel(outcome.ownerRefund)} to{" "}
          <span style={{ overflowWrap: "anywhere" }}>{outcome.owner}</span>;
          creator retained {paymentLabel(outcome.creatorRetained)}.
        </p>
      )}
    </section>
  );
}
