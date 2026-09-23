# Membership Interface Contract

These are proposed signatures/types for implementation, not existing callable APIs. Update generated bindings from compiled contracts; do not hand-maintain ABIs.

## Creator configuration

- TierConfig adds `uint16 creatorRetentionBps` and `bool periodicEnabled`.
- `setCreatorRetentionBps(uint16 nextBps)`: creator-only, range 0–10000, reject increases, equal value is no-op. No pause requirement. Emit old/new BPS on change.
- `enablePeriodicRefill()`: creator-only, fixed positive price only, idempotent and allowed while paused. No payment or enrollment side effect. Emit capability enablement only on transition.
- Public policy reads expose current retention and capability. No per-member policy snapshot and no capability-disable API.

## Cancellation

- `cancelMembership(uint256 tokenId, address expectedOwner, uint256 minOwnerRefund, uint64 deadline, uint256 maxAccountingSteps)` returns `(uint256 ownerRefund, uint256 creatorRetained)`.
- `previewCancellation(uint256 tokenId, uint64 deadline, uint256 maxAccountingSteps)` returns the lifecycle-aware preview defined in [data-model.md](../data-model.md): a complete/incomplete protected quote for a live position, or explicit cancellation-unavailable status for a known expired/retired position.
- `cancelSubscription(uint256 tokenId)` retains the payable ERC-5643 signature, rejects nonzero native value and delegates to the same cancellation implementation with current owner, zero minimum refund and existing standard accounting budget. It cannot increase that budget to bypass bounded work.

Both mutations require current live NFT owner/token-approved/operator authority and remain callable while paused. Capture/revalidate owner and authorization before mutation; catch up chronologically; require actual owner refund >= minOwnerRefund; cancel and retire atomically. The native action rejects block time greater than deadline; deadline must be strictly before position expiration. Equality with deadline is allowed while still live. Compute the quote minimum from the same unused-funding and rounding rules projected through deadline at current retention, preserving future scheduled vesting changes; do not use a flat-rate shortcut. Current estimate and deadline-floor must be separate. Incomplete projection cannot produce an approved minimum. Improved retention or added funding may increase the actual refund; the bound remains enforced. Expected owner protects against transfer. The standard adapter lacks those caller-selected protections; native action is the first-party UI path.

Remove old `refund`, old gross-only preview and creator-specific refund event assumptions together. Proposed `MembershipCanceled` event includes tokenId, owner, operator/caller, funding generation, canceled gross, owner refund, creator retention amount/BPS and canceled paid/grant time. Preserve zero-expiration `SubscriptionUpdate`, metadata and retirement events. Funding cancellation events must distinguish canceled funding from actual payout. Earned claims and all referral/protocol destinations remain unchanged.

## Enrollment and execution

- `setRefillTarget(uint256 tokenId, uint64 targetSeconds, address referralChoice)`: current live owner only; enroll/update. Reject zero target (use stop), unsupported pricing, disabled capability, invalid target/headroom and invalid pending referral. When already referral-locked, require the displayed existing choice; do not rewrite the lock. No payment or accounting catch-up, and callable while paused because it cannot charge until unpaused.
- `stopRefill(uint256 tokenId)`: current owner only, idempotent, no catch-up/pause prerequisite. Clears pending referral intent too.
- `refillEnrollment(uint256 tokenId)`: stored intent, with lifecycle/owner reads used to interpret whether it can execute.
- `previewRefill(uint256 tokenId, uint256 maxPeriods)`: read-only current quote and accounting readiness. Does not walk unbounded history, mutate enrollment or reserve funds.
- `refillMembership(uint256 tokenId, uint256 maxPeriods, uint256 maxAccountingSteps)`: permissionless, non-reentrant, returns RefillResult. Caller supplies no payer, payout destination, referral or target. Reject zero caller bounds. Current NFT owner is payer and recipient; use only valid enrollment.

At-target or no-affordable-whole-period calls return an explicit no-purchase result without attempting catch-up. Disabled/not-enrolled/paused/expired cases are visible as preview reasons and fail mutation with typed errors. For a positive executable purchase: complete bounded catch-up, recheck current position/enrollment/limits and execute ordinary fixed purchase through shared internals. AccountingBehind or token read/transfer failures revert observably; independent processAccounting remains available. No empty catches, persistent retry counter, queue or external self-call isolation layer.

Emit enrollment-set/stopped events and a `MembershipRefilled` event with tokenId, owner, executor, periods, gross and new expiration. Ordinary payment/time/vesting events still describe the purchase. Transfers and retirement emit or otherwise clearly report enrollment clearing through their supplied receipt events; no stale enrollment can survive.

## Error/read contract

Errors distinguish unauthorized/owner-changed, invalid retention increase, unsupported pricing, invalid target, expired, paused, unenrolled, insufficient accounting budget and transfer failure. Zero-work results distinguish at-target, balance, allowance and economic/time headroom limitations. No successful no-work result may be reconciled as a payment.

Expose cancellation and refill read types through MembershipTypes/IMembershipTier. Update factory/deployment encoders, all tuple consumers, receipt parsers and link artifacts in the same delivery slice. No legacy address/ABI fallback is added. Standards tests must check authorization, expiration update, invalid-token reads and 25-step adapter recovery separately from interface discovery.

Native deadline design: the first-party default review window is two minutes of chain time, shortened to expiration minus one second when necessary. If no future live deadline remains, do not offer a protected quote. The standard ERC-5643 signature has no caller deadline/minimum fields; retain its disclosed zero-minimum behavior without fabricating user-approved protection. Both routes share settlement and existing accounting bounds.

## Existing enrollment after cap changes

Changing the paid-time cap preserves enrollment, target and existing paid time. Target-admission validation applies only to enrollment/target updates; an already-enrolled oversized target does not cause execution to reject solely for being oversized. For finite N, all paid-time additions require resulting paid time < (N + 1) * D. Compute available whole periods as floor(max(0, (N + 1) * D - 1 - currentPaidSeconds) / D), using wide arithmetic and clamping before unsigned subtraction. Zero configured maximum stays unlimited subject to numeric/time bounds. New/updated targets are limited to N * D, while existing enrolled targets survive cap changes. No room returns a no-purchase time-headroom reason; partial room permits partial refill. A later cap increase may resume refill without new consent because the owner target is unchanged. Grants do not consume this paid-time cap.

## Grant revocation stops refill

After a successful nonzero removal of granted time, clear the affected enrollment and pending referral intent atomically; retain the grant-revocation detail in transaction history. Preserve existing grant revocation authority and paid-time accounting. If the operation fails or removes zero time, preserve enrollment. Do not purchase time or return funds as a consequence of grant revocation. Stop happens before any resulting retirement; do not emit duplicate stop transitions. A live owner may explicitly re-enroll, while a retired position cannot. The member status reads only whether enrollment is configured and shows “Periodic refill off” when absent. No stored stop-reason field, getter or separate reason-bearing state is added; ordinary transaction events supply historical detail.

## Non-live cancellation previews

Resolve known-token lifecycle first. ExpiredPending and Retired return explicit status, cancellationEligible=false and quoteAvailable=false even when the supplied quote deadline is no longer usable. Their amount fields must not represent a valid zero-value cancellation. Never-minted IDs remain errors. A retired preview does not require a current NFT owner or expose fictitious token-scoped earned credit; use existing final-owner claim/history surfaces. Cancellation mutations and standard invalid-token behavior remain unchanged: the structured read does not authorize an expired/retired exit, refill or resurrection.
