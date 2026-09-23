# Feature Specification: Member-Controlled Cancellation and Periodic Refill

**Feature Branch**: `codex/006-member-cancellation-refill` (created from main at user request on 2026-09-22)

**Created**: 2026-09-21

**Status**: Draft — specification quality review complete; ready for clarification or planning

**Input**: Replace creator-initiated refunds with NFT-owner/operator cancellation. The creator selects the share of unused prepaid funding retained by the creator and can only lower it, including for existing positions. Preserve earned claims and end future participation on cancellation. Add optional, holder-authorized periodic refill toward a target amount of remaining time, paid in whole periods from available balance and allowance, executable by anyone before strict expiration. Specify cancellation first and refill second; no automated keeper service in this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cancel under improving exit terms (Priority: P1)

A member voluntarily ends a live membership, receives the disclosed share of unused funding and retains everything already earned. A creator can improve exit terms but cannot cancel another person's paid membership merely by controlling the tier.

**Why this priority**: This is a complete member-controlled exit that works without periodic refill.

**Independent Test**: Create paid, sponsored, transferred and complimentary positions; partially accrue and claim earnings; cancel as owner/operator; reconcile payouts, retirement and rejection of unauthorized creator actions.

**Acceptance Scenarios**:

1. **Given** exactly 10 payment units of unused funding and 30% creator retention, **When** the owner cancels, **Then** 7 units go to the owner and 3 become creator cancellation proceeds; earned claims survive, access ends, the NFT burns and future reward weight ends.
2. **Given** a live membership, **When** a currently approved token operator or owner-wide operator cancels, **Then** the same settlement occurs and the refund goes only to the current owner, never the operator or original payer.
3. **Given** a creator without ownership or holder approval, **When** the creator attempts cancellation or an alternate paid-time refund, **Then** it fails without changing funds, time, ownership or weight.
4. **Given** existing positions and 70% retention, **When** the creator lowers retention to 20%, **Then** existing and future positions use 20% on subsequent cancellation; increases fail, including after tier administration changes.
5. **Given** retention of 100% or 0%, **When** authorized cancellation succeeds, **Then** all unused funding goes to the creator or owner respectively, with identical earned-claim preservation and retirement rules.
6. **Given** a complimentary or mixed-time live position, **When** its owner cancels, **Then** all remaining time ends; only actual unused paid funding is split and no refund is created for complimentary time.
7. **Given** cancellation after claims with fractional earnings remaining, **When** the final owner claims later or buys a new membership, **Then** earned credit remains claimable and the new position cannot recover the retired identity or early reward weight.

### User Story 2 - Keep a chosen membership funded before expiration (Priority: P2)

A holder explicitly enrolls a selected position and chooses a positive target for remaining time. Anyone can execute an authorized refill while it is active. Funds stay in the wallet until purchased, and timely execution is not guaranteed.

**Why this priority**: Refill builds on ordinary purchases and the completed cancellation flow without weakening expiration or granting creators spending authority.

**Independent Test**: On a fixed-price 30-day tier, vary targets, balances and allowances and have another person execute refills before, at and after expiration. Verify exact whole-period purchases, ordinary allocations and strict retirement boundaries.

**Acceptance Scenarios**:

1. **Given** a 7-day target and 6 days remaining, **When** adequately funded refill executes, **Then** one 30-day period is purchased and 36 days remain.
2. **Given** a 45-day target and 10 days remaining, **When** adequately funded refill executes, **Then** two periods are purchased and 70 days remain; with a 60-day target and exactly 60 days remaining, no purchase is due.
3. **Given** a two-period shortfall but balance or allowance sufficient for only one period, **When** refill executes, **Then** one period is purchased. Less than one whole affordable period causes no purchase or partial-period charge.
4. **Given** creator enablement after members joined with existing spending approvals, **When** periodic capability becomes available, **Then** no member is enrolled or charged without an explicit current-owner opt-in for a selected position.
5. **Given** an enrolled position below target, **When** unrelated or repeated callers trigger refill, **Then** purchases follow only current owner authorization and shortfall; callers cannot alter the target, redirect money or overfill beyond the whole-period target.
6. **Given** attempts one second before expiration, at expiration and one second afterward, **When** refill executes, **Then** only the first can purchase for the position. Waiting work, allowance and wallet funds do not preserve or resurrect an expired NFT; returning uses a fresh position and current reward curve.
7. **Given** manual renewal, sponsorship or a grant extending time, **When** refill is evaluated, **Then** it uses the new expiration and avoids unnecessary purchases.
8. **Given** insufficient funds, revoked allowance or a rejected transfer, **When** refill is attempted, **Then** no incomplete purchase changes funds, time or weight; unrelated maintenance and claims remain independently processable and the reason is visible.

### User Story 3 - Control future charges and understand coverage (Priority: P2)

A member distinguishes stopping future refills from canceling immediately, understands coverage and retains control through pauses, transfers and concurrent actions.

**Why this priority**: Informed consent and working stop controls must ship with periodic refill.

**Independent Test**: Use member and creator journeys with multiple positions, pauses, transfers, competing cancellation/refill attempts and shared balances; compare displayed terms with actual outcomes.

**Acceptance Scenarios**:

1. **Given** enrollment, **When** the owner stops refill, **Then** future charges stop without shortening existing time, refunding funds or removing weight; restart requires an explicit owner action.
2. **Given** enrollment and unused allowance, **When** owner/operator cancellation succeeds, **Then** enrollment ends and Story 1 settlement applies; allowance cannot resurrect the position.
3. **Given** competing cancellation and refill, **When** cancellation succeeds first, **Then** refill fails; when refill succeeds first, later cancellation includes the resulting unused funding. Cancellation itself never purchases time.
4. **Given** an enrolled NFT, **When** transfer succeeds, **Then** enrollment clears while time, weight, credit and referral terms transfer normally; neither owner's wallet is subsequently charged without fresh recipient enrollment.
5. **Given** a paused tier, **When** members manage payments, **Then** refill fails but stopping enrollment, reducing/revoking token allowance, cancellation and earned claims remain available. Expiration continues normally.
6. **Given** a 20-unit period price, 55-unit balance and 40-unit allowance, **When** coverage is displayed, **Then** it shows 2.75 balance-equivalent periods, 2 approved periods and at most 2 currently collectible whole periods; the balance remainder is not promised as a partial renewal.
7. **Given** multiple positions sharing funds or allowance, **When** coverage is displayed or refill executes, **Then** shared funds are disclosed and execution rechecks availability rather than promising the same funds to every position.
8. **Given** pending, rejected or reverted actions, **When** outcomes appear, **Then** enrollment, cancellation, revocation and refill are not reported complete before confirmed success.

### Edge Cases

- Cancellation immediately after purchase, after accrual/claims, while paused, after transfer and at expiration; zero and smallest-unit refunds.
- Sponsored, contribution-priced, complimentary and mixed-time positions; multiple NFTs per wallet; creator acting as an ordinary NFT owner/operator.
- Token-specific versus owner-wide approval; revoked approval and ownership changes before execution; operator cancellation does not imply recurring spending enrollment.
- Retention endpoints, repeated decreases, attempted increases, administration transfer and terms improving after preview.
- Earned fractions, original referral/protocol entitlements, unrelated protected reserves and unassigned member funding.
- Targets below/equal/above one period, exact target equality, whole-period overshoot, paid-time prepayment limits and granted time affecting total remaining time and expiration headroom.
- Balance/allowance changes after preview, rejected token transfers, shared wallet funds, duplicate attempts and caller-limited partial refills.
- Equal-timestamp events, stale work, delayed accounting, expiration while awaiting execution, pause/unpause and restored allowance.
- No retroactive charge, grace period, backdated access or restoration of retired weight.

## Requirements *(mandatory)*

### Functional Requirements

**Member-controlled cancellation**

- **FR-001**: Only the current NFT owner or its currently approved token/operator authority MUST be able to cancel a live position. Tier administration alone MUST NOT authorize cancellation or an alternate refund of unused paid time. Authorization MUST be checked at execution.
- **FR-002**: Creators MUST explicitly choose a retention percentage from 0% through 100% at tier creation. It MUST subsequently only decrease or remain unchanged, including across administration transfers. The current percentage MUST apply to existing and future positions alike.
- **FR-003**: Cancellation MUST settle accounting through execution time before splitting only the position's unused prepaid funding. Earned creator, member, referral and protocol entitlements MUST NOT be clawed back. Unrelated and already-unassigned protected balances MUST remain protected.
- **FR-004**: The owner refund MUST equal unused funding multiplied by the member refund percentage, rounded down to the smallest payment unit; the remainder MUST become creator cancellation proceeds. Their sum MUST equal canceled unused funding exactly. Cancellation proceeds MUST NOT issue shares, advance the purchase curve or undergo ordinary purchase allocations again.
- **FR-005**: Refunds MUST go only to the current NFT owner, regardless of caller, sponsor or original payer. First-party cancellation MUST bind the reviewed owner, a minimum refund and a short deadline. The minimum MUST conservatively cover normal time-based consumption through that deadline, not equal the instantaneous estimate. A successful cancellation MUST pay at least that minimum; a late transaction or insufficient refund MUST fail atomically and require renewed review. Failure of required settlement or payout MUST leave cancellation unapplied, including enrollment, time and finances.
- **FR-006**: Successful cancellation MUST clear enrollment, end all paid/complimentary time, burn and retire the NFT, remove future weight and release capacity once. Earned member credit including fractions MUST remain claimable by the final owner without a live NFT.
- **FR-007**: Cancellation MUST remain available while paused and at both retention endpoints. Expired positions MUST use normal retirement; fresh entry MUST use a new identity and current reward curve. Cancellation MUST NOT roll back lifetime accepted totals or reward-curve progression.
- **FR-008**: Purchase and cancellation reviews MUST show current refund/retention percentages and the unused-funding basis. Cancellation MUST explain loss of remaining access and future weight while preserving earned claims, and show the current estimate, guaranteed minimum on success and deadline before approval. For known expired-awaiting-retirement or retired positions, the preview MUST instead return an explicit lifecycle status and cancellation-unavailable reason, not an actionable zero-refund quote. Explain preserved earned claims and the applicable settlement/claim route; neither state may offer refill or reactivation of that NFT.

**Holder-authorized periodic refill**

- **FR-009**: Creators MUST be able to enable periodic capability at creation or later without enrolling holders. Only a current owner may enroll each selected position and choose its positive remaining-time target. NFT approval or payment-token allowance alone MUST NOT constitute enrollment.
- **FR-010**: Periodic refill MUST initially support only fixed positive per-period prices. Contribution-priced and zero-price tiers MUST retain manual actions and cancellation without offering unsupported periodic enrollment.
- **FR-011**: The target MUST refer to total remaining active time, including grants. At or above target, no refill is due. Below target, the desired purchase MUST be the smallest whole number of periods reaching or exceeding target; whole-period overshoot and exact prepayment-cap semantics MUST be documented in the whitepaper and technical docs, without adding explanatory disclaimers to ordinary experience pages.
- **FR-012**: Actual purchases MUST be limited by desired periods, current wallet balance, spending allowance, existing tier time limits and caller-selected work/purchase bounds. Partial refill MUST buy only the whole periods currently affordable and permitted and report any shortfall. Zero affordable/permitted periods MUST cause no charge or extension.
- **FR-013**: For a finite configured maximum N and period duration D, every paid-time addition MUST leave remaining paid time strictly below (N + 1) × D; this applies consistently to manual purchases, renewals, sponsorships, contributions and periodic refills. The zero/unlimited setting remains unlimited subject to existing numeric/time limits. At enrollment or target update, a positive refill target MUST be at most N × D for finite N. Later creator cap changes MUST preserve existing enrollment and its target without shortening paid time. Refill MUST use nonnegative remaining paid-time capacity under the current cap: no purchase at or above the cap, otherwise only the whole periods currently permitted. An oversized existing target MUST NOT itself disable enrollment or require owner revision; later cap increases may resume purchases toward that target. Granted time affects the remaining-time target and expiration headroom, not the paid-time cap. Execution MUST revalidate limits and remaining time after intervening purchases/grants. Preparing or queuing work MUST NOT charge funds.
- **FR-014**: Anyone MUST be able to trigger a selected position's authorized refill without controlling its payer, recipient or policy. Every attempt MUST re-evaluate current ownership, enrollment, time, funds and allowance; duplicate or concurrent attempts MUST NOT exceed the current target rounded to whole periods.
- **FR-015**: Refill MUST execute strictly before expiration, after required chronological accounting catch-up, using an ordinary additional purchase with existing allocations, curve issuance, referral rules and vesting. No payment, access or rewards may be backdated to an earlier due time.
- **FR-016**: Queued or failed refill MUST NOT extend access, delay retirement, reserve capacity beyond normal expiry or resurrect a position. No grace period or automatic new-position purchase is introduced.
- **FR-017**: Refill work MUST be optional and separable from mandatory accounting/expiration work. Failed collection or unprocessable refill MUST NOT obstruct independently executing unrelated maintenance, retirement or claims. Work MUST remain caller-bounded; incomplete and failed outcomes MUST not misrepresent rolled-back progress as committed.

**Lifecycle, controls and reporting**

- **FR-018**: Owners MUST be able to stop refill without changing existing time/claims, revoking payment allowance or completing accounting catch-up, including while paused. Only the owner may enroll, change its target or restart refill. A successful creator revocation that removes granted time MUST clear that position's refill enrollment atomically; restoring funds, changing limits or unpausing MUST NOT restart it. Re-enablement requires an explicit current-owner action. A failed or zero-time revocation MUST NOT clear enrollment.
- **FR-019**: Successful cancellation MUST prevent subsequent refill. Cancellation processing MUST NOT refill the position being canceled. Purchases completed before cancellation MUST participate in normal cancellation settlement. Failed cancellation MUST NOT be reported as having stopped refill.
- **FR-020**: Transfer MUST clear enrollment without adding accounting prerequisites to valid live transfers. Neither former nor new owner may be charged afterward without new-owner enrollment. Time, weight, credit and referral terms MUST otherwise transfer unchanged.
- **FR-021**: Pause MUST block refill payments while allowing creator capability enablement and current-owner enrollment, target changes and explicit re-enablement on still-live eligible positions. These configuration actions MUST NOT move funds. Enrollment-stop, allowance-management tools, cancellation, maintenance and claims MUST remain available. Expiration MUST continue; after unpause, still-live explicitly enrolled positions may refill, but unpause MUST NOT re-enroll stopped positions or resurrect expired ones.
- **FR-022**: Member tools MUST separately expose stopping refill and canceling now, plus target configuration, spending approval, approval reduction/revocation at any time, enrollment status and execution of an eligible selected-position refill.
- **FR-023**: Coverage MUST distinguish balance, allowance, collectible whole periods, fractional equivalents and already-prepaid time. Shared funds, stale/incomplete reads and due/unavailable/stopped/blocked status MUST be disclosed without promising reserved funds, partial renewals or execution guarantees.
- **FR-024**: Every accepted payment unit MUST remain attributable to payouts, earned liabilities, unused funding, cancellation refunds, creator cancellation proceeds or protected reserves without duplication. Fractions MUST survive; identical executed histories MUST yield identical totals across accounting batch sizes/delays. Different refill execution times may legitimately change purchases and earnings.
- **FR-025**: Supported interfaces, standards-facing cancellation, integrations, previews, reports and whitepaper MUST agree on authority and economics. Creator-only paid-refund paths MUST be removed rather than retained as alternate or dormant controls. Subscription cancellation MUST use the same member-authorized behavior, not an always-reverting substitute.
- **FR-026**: Interfaces MUST distinguish pending, failed and confirmed actions and support keyboard access, labeled controls, accessible status/errors and narrow screens. They MUST NOT promise automatic execution or fixed future rewards.

### Key Entities *(include if feature involves data)*

- **Cancellation policy**: Tier-wide creator retention and complementary member refund percentages; terms improve monotonically for members.
- **Membership position**: NFT, owner/approvals, remaining paid/granted time, expiration, weight, funding and referral terms.
- **Cancellation settlement**: Preserved earned claims, canceled unused funding, owner refund, creator proceeds and final-owner retired credit.
- **Refill enrollment**: Selected position, authorizing owner, enabled state and target; distinct from token spending approval.
- **Refill opportunity**: Live enrollment below target, currently purchasable whole periods and blocking reasons; not a reservation or guarantee.
- **Coverage estimate**: Prepaid time, shared balance/allowance, collectible whole periods and fractional equivalents at an observed state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across covered ownership, approval, pause and administration-change scenarios, zero unauthorized cancellations/enrollments succeed; every refund reaches the current owner.
- **SC-002**: Every covered retention decrease applies to existing positions and zero increases succeed. At 0%, 30%, 100% and smallest-unit boundaries, 100% of canceled unused funding reconciles to owner refunds plus creator proceeds, preserving earned claims/fractions.
- **SC-003**: Every successful cancellation ends access/weight, releases capacity once and permits claims without a live NFT. Zero canceled/expired identities can refill or recover retired weight.
- **SC-004**: Every refill matches current whole-period shortfall and available authorization/funds/time limits. Execution succeeds only before expiration across the T-1/T/T+1 boundary; repeated attempts produce no excess purchase.
- **SC-005**: Every covered failed-refill history leaves unrelated accounting, retirement and claims independently processable. Identical executed histories produce identical beneficiary totals across prompt/delayed accounting, including fractions.
- **SC-006**: Member journeys distinguish stop from cancel, clear enrollment on transfer, preserve paused controls and correctly report transaction states. Coverage examples, including 55/40/20 balance/allowance/price, match execution and disclose shared funds.
- **SC-007**: Every supported purchase, cancellation and enrollment review shows relevant financial/lifecycle consequences; current product and public guidance contain zero contradictory creator-refund instructions or guaranteed-refill claims.

## Assumptions

- This feature supersedes creator-only refund/cancellation authority in features 004/005 and the parked removal proposal. The latter remains historical on `codex/park-refund-removal` at `08e458da`, not an implementation dependency. Feature 005 governs unaffected transfers, exact expiration, accounting, retirement and fresh entry.
- Deliver cancellation and its complete user/accounting evidence first, then refill and its controls. This invocation creates a specification only; design, tasks and implementation follow separately.
- Fixed-positive-price refill is the initial scope because contribution tiers have no agreed recurring payment amount. Cancellation still uses their actual unused funding. Recurring contribution selection is outside scope.
- Existing creator authority and time-removal rules for grant revocation are preserved, with the added requirement that successful removal of granted time stops the affected position's refill enrollment. The parked proposal's unconfirmed grant-irrevocability assumption is not adopted. This feature does not promise protection from revoking complimentary time or removal of positions surviving only on grants; it removes unilateral cancellation of paid time. A broader grant-policy change requires a separate explicit decision.
- UI terms express member refund and complementary creator retention; creators explicitly choose their initial rate. Rounding favors retaining the final indivisible remainder with creator proceeds, while preserving exact total conservation.
- Revoking payment allowance alone blocks collection but leaves enrollment configured; restoring allowance can resume eligible refills. Pause likewise retains enrollment, and still-active enrolled positions may refill after unpause. Stopping enrollment, transfer or successful cancellation clears it. These distinctions must be disclosed.
- Tier capability may be enabled at creation or later. A separate permanent disable policy is not introduced; existing pause and member stop controls provide specified stopping behavior.
- Total remaining time includes grants and sponsorships. Shared funds are not reserved and there is no priority guarantee among a wallet's positions.
- NFT approval now intentionally authorizes cancellation as well as transfer, but not enrollment, target changes or restart. Revoking payment-token allowance requires the paying wallet's authorization, not NFT operator authority.
- Anyone may trigger refill, but someone must submit and fund execution. Hosted keepers, schedulers, subsidies, notifications and execution guarantees are outside scope. Optional discovery must not be required for per-position execution or mandatory accounting.
- No embedded NFT wallet, delegated recurring payer, automatic enrollment, post-expiration purchase, grace interval or retrospective charge is introduced.
- Existing immutable deployments do not change through source edits. Public transactions, deployment, migration, push and release approval are outside this pass.
- Constitution alignment: understandable terms, explicit spending consent, preserved earned ownership, honest lifecycle reporting and layered delivery. No deviation is proposed; spec review is not implementation or production validation.

## Clarifications

### Session 2026-09-22

- Q: How should cancellation tolerate refund decay while awaiting confirmation? A: Use a minimum refund plus a short deadline. Calculate the minimum conservatively through the deadline, show both terms for approval, and reject late inclusion rather than silently relax the minimum. Earned claims remain unaffected.

- Q: What happens when a creator changes the prepayment cap after enrollment? A: Keep enrollment and the holder target; clamp purchases to current available paid-time capacity, with zero usable headroom at/above the effective exclusive limit. A later cap increase can resume refill without re-enrollment. Existing paid time is never shortened.

- Q: Should revoking granted time leave periodic refill active and potentially bring a charge forward? A: No. Successful removal of granted time stops enrollment for that position; the current owner must explicitly re-enable it. Revocation itself returns no funds. Show this consequence in creator review and explain the stopped state to the member.

### Session 2026-09-23

- Q: May creators enable periodic capability and holders configure refill while paused? A: Yes. Allow non-paying configuration under ordinary authority and eligibility rules while blocking all refill payments. Explicitly enrolled, still-live positions may refill after unpause; stopped or expired positions do not restart automatically.

- Q: What should cancellation previews return after expiration or retirement? A: An explicit lifecycle status and cancellation-unavailable reason. Explain normal settlement and preserved earned claims rather than present a zero-value exit. Neither state offers refill or reactivation.

- Q: How should a one-period cap allow refill before expiration? A: For any finite maximum N, permit remaining paid time strictly below N + 1 periods after any paid-time addition. Targets may be up to N periods; zero remains unlimited. Preserve strict expiration. Explain the exact rule in the whitepaper/technical docs, not wordy disclaimers on ordinary experience pages.
- Q: Must the member view remember why periodic refill stopped? A: No. Show “Periodic refill off” and offer owner re-enablement only when otherwise eligible. Keep grant-revocation details in transaction history; add no stored stop-reason value.
