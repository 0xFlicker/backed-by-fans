# Data Model

## Tier policy

Add `uint16 creatorRetentionBps` (0–10000) and `bool periodicEnabled` to `MembershipTypes.TierConfig` and initialized tier state. Every config encoder, factory validation, deployment fixture and creation UI must provide explicit values. Retention can only decrease; capability can only be enabled, and only on fixed-positive-price tiers. Administration transfer preserves both fields. Existing price, period, allocations and curve terms remain unchanged.

## Position enrollment

Proposed `RefillEnrollment`: `address authorizingOwner`, `uint64 targetSeconds`, `address pendingReferralChoice`. Deleted/zero-target state means stopped. No separate enabled flag or scheduled timestamp is needed.

- Enrollment/update requires live current owner, fixed-positive-price capability, positive representable target and cap validation. Target update replaces enrollment intent; it does not change paid funding or existing referral locks.
- Stop requires current owner but no pause/catch-up prerequisite. Permit stopping an expired-but-unretired owned NFT; retired IDs have no owner and cannot enroll.
- Pause and allowance revocation retain intent. Transfer (including self-transfer), successful grant revocation removing nonzero time, and all retirements delete it. Clear before receiver callbacks; failed enclosing transactions roll back the clearing.
- Execution checks stored owner equals current owner even though transfers clear state.
- Unset referral: store owner choice without locking on enrollment. If still unset at payment, use that choice; if another payment already locked a referral, that immutable lock prevails. A pending choice is never supplied by the executor.

## Cancellation settlement and reporting

Reuse the existing funding generation and cancellation accounting. After catch-up, let G be the raw cancellable gross returned by the existing cancellation computation, B the current retention BPS and Q the existing ledger scale:

- ownerRefund = floor(G * (10000-B) / 10000)
- creatorRetained = G - ownerRefund
- remove the existing purpose-funded amounts totaling G*Q from unearned funding
- preserve existing `cancellationScaled` residues and all earned amounts
- increase actual refunded raw by ownerRefund
- increase creator earned scaled credit by creatorRetained*Q

Track cumulative `creatorCancellationProceedsRaw` for reporting, but label it a subset of creator earnings/payouts, not an additional balance. Canceled gross can be derived from cumulative owner refunds plus cumulative retained proceeds. Existing payouts and outstanding earned creator credit already include retention; do not add the subset again in conservation totals.

On successful cancellation: funding generation ends, time becomes zero, enrollment clears, member weight retires, earned credit moves to the final owner, NFT burns and capacity releases once. Pay nonzero owner refund using existing exact-transfer checks. No transfer is needed for zero refund. Failure reverts the entire cancellation and any attempted catch-up.

## Refill calculation

Read current time, ownership and actual remaining balances. Let D be period duration, P positive fixed price, T target, R total remaining paid+granted time.

- desired = 0 if R >= T; otherwise `1 + (T-R-1)/D`.
- affordable = min(balance/P, allowance/P).
- for finite configured maximum N, compute exclusive paid-time limit E = (N + 1) * D in wide arithmetic; the inclusive integer-second limit is E - 1. Purchasable paid-headroom periods = max(0, E - 1 - remainingPaidSeconds) / D rounded down. Clamp before unsigned subtraction. Zero/unlimited configuration skips this finite cap but retains numeric/time bounds. Lowering the limit below existing paid time creates zero headroom, never lost time or subtraction failure.
- timestamp headroom = `(uint64.max - expiration)/D`; also enforce existing uint64 duration limits before casting.
- gross headroom = remaining accepted-lifetime uint112 capacity divided by P.
- actual = min(desired, affordable, paid headroom, timestamp/duration headroom, gross headroom, caller maxPeriods).

Use wide checked intermediates and divide limits before multiplying. Enrollment and target updates require `0 < T <= N * D` for finite N; the maximum whole-period overshoot `T + D - 1` then remains strictly below `(N + 1) * D`. Apply the same exclusive limit to all paid-time additions, not just refill. Later cap changes do not invalidate or delete existing enrollment or its target: execution clamps purchases to current nonnegative headroom instead of reapplying target-admission rejection. Raising the cap can resume purchases toward the unchanged target without re-enrollment. Grants affect R and expiration headroom, not the existing paid-seconds cap. No new reward/price formula is introduced.

## Read models

`CancellationPreview`: tokenId, lifecycle, cancellationEligible, unavailableReason, quoteAvailable, current owner (absent after retirement), asOf, accountedThrough, complete, current retention BPS, deadline, conservative minimum owner refund through deadline, canceled gross, current estimated owner refund, creator retention, paid/grant time canceled, preserved earned credit and protected-residue information. Incomplete projection is not an executable quote.

`RefillPreview`: tokenId, owner, enrollment owner/target, asOf, expiration, total/paid/granted remainder, effective referral choice, desired/affordable/allowed/actual periods, gross cost, resulting expiration, balance/allowance, blocked reason and accounting readiness. Token read failures are errors, never zero balances. Preview does not reserve funds or promise transfer success.

`RefillResult`: periodsPurchased, grossPaid, resultingExpiration, remainingShortfallPeriods and no-purchase reason when applicable. Expected zero work is distinguishable from a reverted attempt.

## State transitions

| Trigger | Enrollment | Position/funds |
| --- | --- | --- |
| Creator enables | Unchanged | No payment or time change |
| Owner enrolls/updates | New owner intent | No payment, shares or referral lock |
| Owner stops | Deleted | Existing rights intact |
| Refill succeeds before expiry | Retained | Ordinary purchase, extended same NFT |
| No affordable work | Retained | No purchase |
| Transfer succeeds | Deleted | Same position moves, existing referral retained |
| Grant revocation removes time | Deleted | Existing grant-removal rules; no refund; owner must re-enable refill |
| Cancellation succeeds | Deleted | Split, claims preserved, position retired |
| Expiration/grant-only retirement | Deleted | Existing retirement rules |
| Pause/allowance revoke | Retained | Charges blocked, time continues |
| Failed mutation | Prior state | Transaction rollback, including attempted accounting |

## Invariants

No creator-only paid cancellation; no operator enrollment; no post-expiration refill; no backward lifetime gross/curve movement; no resurrected identity; no per-position duplicate capacity release; no financial effect from queued work; no refill invoked by mandatory accounting. Exact conservation includes scaled residues and counts informational retained-proceeds totals only once.

Grant-revocation stop clears pending referral intent but not an already-locked referral. Failed or zero-time revocations leave enrollment untouched. The member view derives “Periodic refill off” from absent enrollment; do not store a stop reason or add one to the enrollment read model. Existing grant-revocation and enrollment-clearing transaction events provide historical context without being a dependency of the normal member status. Natural grant-only retirement still follows the existing burn/earned-credit lifecycle.

Pause blocks collection, not authorized configuration: creator enablement and live-owner enrollment/target changes/re-enablement remain permitted. They do not advance funding or move funds. Unpause does not change enrollment state; a live enrolled position may become collectible again.

Cancellation preview resolves known-token lifecycle before validating live-quote deadlines or projecting cancellation amounts. For ExpiredPending or Retired, return that status with cancellationEligible=false and quoteAvailable=false; no amount field is an actionable quote. ExpiredPending may expose its current owner and settlement readiness; Retired has no current NFT owner and must not call an ownership lookup that rejects burned tokens merely to return its lifecycle. Use existing known-token identity and owner-level claims/history, without inventing a per-retired-token claim balance or retaining extra ownership state solely for this preview. Unknown/never-minted IDs remain explicit errors. Deadline/projection completeness pertains only to live quotes, not to the ability to report known non-live status.
