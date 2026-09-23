# Research: Member cancellation and periodic refill

Date: 2026-09-22. Source baseline: main at 2f43c4f9. This is design research, not implementation evidence.

## 1. Preserve the cancellation ledger; replace its authority and payout

**Decision:** Reuse `VestingLedger.cancelFunding`, including funding generations and cancellation residues. Settle first, split its returned raw gross, credit retained raw funds to existing earned creator credit, retire, and pay the owner. Replace creator-only refund entrypoints with owner/operator cancellation.

**Rationale:** `MembershipTier._refund` already settles current time, cancels funding and retires. `VestingLedger._cancellation` computes a raw gross refund from scaled balances and leaves protected fractional residues; splitting all scaled unearned funding instead would consume earned fractions or protected reserves. Retained proceeds belong in `earnedScaled[0]` and can use existing creator withdrawal. Change `refundedRaw` to record actual owner payout, not canceled gross; track retained proceeds as an informational cumulative subset, never an additional liability.

**Alternatives considered:** Deleting cancellation generations as in the parked removal plan is incompatible with early exits. Paying the creator immediately couples member exit to a second external transfer and is unnecessary. Reallocating retained proceeds as a purchase creates shares/fees twice.

**Evidence:** `contracts/src/libraries/VestingLedger.sol` cancellation, creator credit and reporting; `contracts/src/MembershipTier.sol` `_refund`, `_retire`, withdrawal; `contracts/test/RefundsAndOwnership.t.sol`, `VestingLedger.t.sol`, `VestingHistoryReplay.t.sol`.

## 2. Keep one member-authorized cancellation implementation

**Decision:** Retain the ERC-5643 signature as an adapter to the same cancellation core. Add a bounded native cancellation action with expected owner, a conservative minimum refund through a short deadline and explicit rejection after that deadline. This resolves CHK028 by user choice on 2026-09-22; the current estimate alone is not the minimum. Both use current ERC-721 owner/token/operator authorization, reject native value and preserve pause-independent exit. The standard adapter retains the existing `ERC5643_ACCOUNTING_STEPS` budget; callers can advance accounting independently first. Remove the old creator `refund` signature and its consumers rather than maintaining an alias.

**Rationale:** [ERC-5643](https://eips.ethereum.org/EIPS/eip-5643) specifies cancellation and expiration updates, not refund economics. Its reference implementation permits owner/operator cancellation. Refund terms are our explicit product policy. On cancellation emit expiration zero before burn; post-burn ownership/expiration reads follow existing invalid-token behavior. Do not claim the complete standard's conformance solely from matching its selector.

**Alternatives considered:** Always reverting cancellation defeats the approved behavior. An unbounded standard adapter could force arbitrary work. Expanding approved operators to enrollment or recurring spending is not authorized.

## 3. Refill is a permissionless ordinary purchase, separate from accounting

**Decision:** Add a per-NFT refill action and lightweight preview. No new onchain refill heap, scheduler, catch-and-dispatch framework or keeper service. Mandatory `_processAccounting` never invokes refill. Use current `_purchaseFixed` economics with owner as payer and recipient after checking enrollment and current owner. Share internal validation/commit helpers only where needed to avoid nested reentrancy guards or duplicate catch-up.

**Rationale:** `_processAccounting` settles chronological history and retires due NFTs. Executing contingent payments there would couple unrelated claims to token transfers and could charge at historical timestamps. `_requireLive` already rejects `now >= expiration`. A failed refill reverts its own transaction; independent bounded `processAccounting` remains usable. No catch is needed to conceal a failed transfer.

**Alternatives considered:** Expiry-triggered collection violates strict expiration. A refill queue without a keeper adds persistent scheduling state but no execution guarantee. Batch failure isolation is unnecessary for the selected single-position surface.

**Evidence:** `MembershipTier._processAccounting`, `_catchUp`, `_requireLive`, `_purchaseFixed`, `_pullExact`, `_transferLive` and `_retire`.

## 4. Whole-period arithmetic and existing limits

**Decision:** Use checked wide arithmetic and bound period count before multiplication. With period D, price P, target T and remaining time R: desired = zero when R >= T, otherwise `1 + (T - R - 1) / D`. Actual count is capped by desired, caller bound, balance/P, allowance/P, remaining lifetime-gross headroom/P, paid-time-cap headroom/D and expiration/duration representability. Zero affordable count returns an explicit no-purchase result.

**Rationale:** Fixed positive pricing makes the maximum spend inferable without a second recurring-price policy. Existing accepted gross is bounded by uint112; timestamps/durations use uint64. At enrollment, maximum discrete-second overshoot is `T + D - 1`; the approved finite limit is exclusive `(N + 1) * D`, allowing targets through `N * D`. Even unlimited configured prepayment retains numeric headroom checks.

**Existing-policy distinction:** The current prepayment cap limits remaining **paid** seconds. Grants count toward R and total expiration headroom, not the paid-time cap. Preserve this distinction; the specification's references to granted time affecting capacity do not change ordinary grant or purchase rules.

**Alternatives considered:** Fractional periods contradict scope. Charging the full shortfall when only some whole periods are funded misses the approved partial-refill behavior.

## 5. Consent, ownership and referral attribution

**Decision:** Enrollment stores authorizing owner, positive target seconds and an owner-selected pending referral choice when the position is not yet referral-locked. Zero/deleted enrollment means stopped. Clear enrollment on transfer (including self-transfer) before receiver callbacks and on every retirement. Tier enablement is one-way and only valid for fixed-positive-price tiers.

**Rationale:** [ERC-20 allowance](https://eips.ethereum.org/EIPS/eip-20#allowance) grants spending permission, not a schedule or position selection. Existing approvals cannot silently become subscriptions. Current safe exact-transfer checks remain necessary even after balance/allowance reads.

**Referral decision:** Do not lock referral identity merely by enrolling. On the first successful refill use the owner's stored choice if referral state is still unset; an intervening paid purchase's existing locked referral takes precedence and is shown in the preview. Existing self-referral validation still applies. Refill callers never supply referral attribution. Clearing enrollment deletes the pending choice, not an already-locked referral. This preserves purchase-time locking and avoids a new creator or executor referral power.

**Alternatives considered:** Locking at enrollment changes historical referral semantics before any payment. Letting executors choose referrals creates an unauthorized benefit. Allowance-only enrollment charges wallets without per-position consent.

## 6. UI, evidence and scope

**Decision:** Reuse existing wagmi/viem receipt-driven transaction flows, token approval utilities, chain/tier identity, position selection and bounded reads. Extract focused member cancellation/refill components rather than growing the existing experience file indiscriminately. Creator settings manage retention reductions and enabling refill; creator paid-refund controls disappear. Preserve grant revocation and disclose its separate authority.

**Rationale:** Existing creator refund UI assumes pause-confirm-preview, which is unsuitable for member exit. Member cancellation uses a current projection and execution bounds; pause is never a prerequisite. Read failures must remain unavailable/stale rather than authoritative zeros. UI must distinguish allowance revocation from stopping enrollment because restoring allowance/unpausing can resume a still-live enrollment.

**Alternatives considered:** New embedded wallets, persisted scheduler state, recurring contribution amounts, subsidies and notifications exceed the approved scope.

**Evidence:** `web/src/features/creator/{CreateTierWizard,TierManagement}.tsx`, `creator/config.ts`, `membership/{MembershipExperience,membership-read}.ts*`, `features/protocol/{payment-flow,payout-reconciliation}.ts`, `scripts/verify-local.sh`.

All design unknowns above have a selected approach. User approval of the specification covers its explicit defaults; no new product clarification is required for this plan. Primary standards sources were checked on 2026-09-22. Existing dependency versions are read from local pinned configuration, not upgraded.

## 7. Existing enrollment after a cap change — resolved 2026-09-22

**Decision:** User chose to retain enrollment/target and clamp purchases to current nonnegative paid-time headroom. Cap increases may resume refill without re-enrollment. Target-admission checks apply to enrollment/updates, not as an invalidation rule for existing intent.

**Rationale:** Respect both current creator purchase limits and the holder's existing instruction without shortening purchased time or introducing another enrollment lifecycle. Grants count toward target and expiration headroom, not the paid-time cap.

**Alternative considered:** Disable enrollment after an incompatible cap change and require renewed opt-in; user did not select it.

## 8. Revocation must not accelerate recurring spending

**Decision:** User chose to stop enrollment whenever a successful grant revocation removes time. Explicit owner re-enablement is required.

**Rationale:** Revoked complimentary time returns no funds and should not unexpectedly bring an authorized refill charge forward. Existing cleanup clears intent. The later U2 decision uses a generic off state and transaction history, avoiding extra stop-reason storage.

**Alternative considered:** Leave enrollment active and disclose potential acceleration at enrollment. The user preferred the safer stop behavior after discussing its modest expected implementation cost; no measured implementation result is claimed.

## 9. Configuration while paused

**Decision:** User chose A on 2026-09-23: allow non-paying creator/holder configuration while blocking refill payments.

**Rationale:** Pause contains money movement without preventing preparation or owner control. Authority and live-position requirements remain unchanged; unpause is not enrollment.

**Alternative considered:** Block enablement and target changes during pause; not selected.

## 10. Lifecycle-aware cancellation preview

**Decision:** User chose A on 2026-09-23: known expired/retired positions return an explicit non-actionable lifecycle status. Unknown IDs remain errors.

**Rationale:** Expiration during review is a normal lifecycle outcome; the read should explain settlement/claims without offering an invalid zero-value exit. Live cancellation authority and strict expiration stay unchanged.

**Alternative considered:** Reject the preview and reconstruct status through separate reads; not selected.

## 11. Analysis resolutions: cap overhang and generic off state

**Decision:** Permit paid time strictly below N + 1 periods for a finite configured maximum N, consistently across all paid-time additions. Targets may be up to N periods. Use generic “Periodic refill off” without new stop-reason state.

**Rationale:** A paid-only position can now add one full period before expiry even with N = 1. Existing enrollment already determines whether refill is off; transaction history carries the reason without extra state.

**Alternatives considered:** Excluding one-period tiers, weakening expiry, or retaining a stored stop reason were not selected. Detailed cap semantics belong in the whitepaper/docs, not wordy experience-page disclaimers.
