# Feature Specification: Vested Membership Allocations and Early-Support Reward Curves

**Feature Branch**: `main` (specification created in place; feature selection is independent of branch naming)

**Feature Directory**: `specs/004-vesting-reward-curves`

**Created**: 2026-09-09

**Status**: Draft — requirements and design recorded; implementation evidence remains outstanding

**Input**: Implement vesting for all membership payment allocations and creator-configurable reward curves. Creator proceeds, membership reward funding, referral commissions, and protocol buyback funding earn over consumed purchased time. Membership rewards belong to whoever is eligible during the earning interval. Keep upfront, permanent reward shares; creator synchronization suspends expired memberships; positive payments reactivate suspended weight. Measure early support by cumulative purchased time weighted by price, offer More / Some / None presets with customizable defaults, and make published economic settings immutable.

**Scope replacement**: For the new protocol version, this specification replaces feature 003's upfront creator, membership-reward, and referral allocation-to-claim timing. It extends the existing time-earned buyback funding model without changing the standing permissionless buyback operating model, payment-token administration, market execution, or burn destination. It also replaces linear-only share issuance with an immutable configurable early-support curve. Existing deployments are not modified or migrated, and this feature introduces no compatibility layer or feature flag.

**Delivery boundary**: This phase produces a specification and requirements-quality checklist. Implementation must later deliver complete purchase, vesting, distribution, claim, refund, and creator-publication flows with the evidence below. Specification approval, the exploratory mathematical model, and local checks do not constitute implementation completion or public deployment authorization.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Support a Creator While All Payment Allocations Earn Over Time (Priority: P1)

A supporter purchases membership access immediately. The money allocated to the creator, members, referrer, and buybacks becomes earned as the purchased service time is consumed. Unused-time funding stays reserved, and nobody has to visit the website to make time pass or establish an entitlement.

**Why this priority**: This establishes the new economic behavior and the funding available for refunds.

**Independent Test**: Use a tier without an early bonus to purchase prepaid time, advance through complete and partial periods, and independently compare all four earned and reserved balances before and after collection.

**Acceptance Scenarios**:

1. **Given** a 120-token purchase for 12 equal periods, split 80% creator / 10% member rewards / 5% referral / 5% buybacks, **When** three periods have been consumed, **Then** 24, 3, 1.5, and 1.5 tokens respectively are earned; 90 tokens remain reserved for unused time, assuming sufficient token precision.
2. **Given** the same purchase at its start, **When** no purchased time has been consumed, **Then** access and new reward shares exist but none of this purchase's cash allocations is yet earned.
3. **Given** an active prepaid membership, **When** additional time is purchased, **Then** the added payment earns over its own service interval after the existing purchased-time queue, without restarting or stretching previous earnings schedules.
4. **Given** a pay-what-you-want membership granting one period per contribution, **When** a supporter pays a large amount, **Then** its cash allocations earn over that one actual period; price-weighted equivalent time affects the reward curve only.
5. **Given** complimentary time or a zero-contribution period, **When** time passes, **Then** that interval contributes no new money; the existing paid-first service order and zero-value purchased intervals remain correctly represented.

---

### User Story 2 - Earn Rewards for the Intervals in Which a Member Is Eligible (Priority: P1)

A member shares in reward funding as it becomes earned, in proportion to their eligible historical weight at that time. Later arrivals and returning members cannot capture money earned while they were ineligible, even when accounting has not been processed recently.

**Why this priority**: Delaying reward funding is only fair if processing timing cannot change its recipients.

**Independent Test**: Feed the same purchase, funding, and eligibility history to an independent reference calculation and the delivered system, varying only claim and accounting-processing frequency.

**Acceptance Scenarios**:

1. **Given** one tracked funding stream of one token per day for 30 days, Alice eligible throughout, and Bob joining after 15 days with equal weight, **When** the interval is complete, **Then** the reference attribution from that stream is 22.5 tokens to Alice and 7.5 to Bob, including when processing was delayed until day 30. Any other concurrent funding is accounted for separately when comparing aggregate claims.
2. **Given** the same tracked funding stream with Alice and Bob initially equally eligible, **When** Bob is suspended after day 10 and reactivated after day 20, **Then** that stream contributes 20 tokens to Alice and 10 to Bob; Bob receives none of its rewards from his suspension interval.
3. **Given** several purchases with different funding start and end times, **When** accounting is processed frequently, irregularly, or after the final interval, **Then** member entitlements agree within the published raw-unit rounding bound.
4. **Given** an interval with earned reward funding but no eligible weight, **When** it is processed, **Then** its funding remains separately protected and is not retrospectively awarded to a later joiner, creator, or referrer.
5. **Given** a share or eligibility change, **When** it takes effect, **Then** all preceding funding is attributed using the preceding eligible weights and all subsequent funding uses the changed weights.

---

### User Story 3 - Publish a Membership With Permanent Early-Support Settings (Priority: P1)

A creator chooses More, Some, or None, previews the effect, and optionally customizes the starting boost and early-support window. Supporters can inspect those permanent terms before purchasing.

**Why this priority**: The curve recognizes early commitment while giving creators control over its strength and duration.

**Independent Test**: Publish each preset and custom settings, compare illustrative and actual share issuance, try boundary values, and attempt to modify published terms.

**Acceptance Scenarios**:

1. **Given** None, **When** a positive payment is accepted, **Then** new shares equal the gross payment amount under the existing share-unit convention; cash allocations still vest.
2. **Given** a fixed-price membership, **When** one supporter purchases 12 periods or 12 supporters consecutively purchase one period at the same price and time with no intervening purchases, **Then** both purchase sequences advance the curve equally and issue the same total weight within the published rounding bound.
3. **Given** a pay-what-you-want tier with an illustrative reference of 10 tokens per period, **When** contributions are 0, 0.01, 5, 10, and 100 tokens, **Then** their curve progression is equivalent to 0, 0.001, 0.5, 1, and 10 reference periods respectively. Each contribution still buys only its actual configured access period.
4. **Given** a purchase spanning the end of the early-support window, **When** shares are issued, **Then** the earlier portion receives the remaining bonus and the later portion receives normal weight; the starting boost is not applied to the whole purchase.
5. **Given** published curve terms, **When** the creator, successor owner, protocol operator, or updated preset catalog attempts to change them, **Then** those terms remain unchanged.
6. **Given** customized or unsupported parameter values, **When** the creator reviews publication, **Then** valid custom values are clearly identified and invalid values cannot publish through either the website or another client.

---

### User Story 4 - Keep Historical Support Through Lapses and Reactivate Through Payment (Priority: P1)

A supporter retains their historical reward weight and already-earned claims. Creator synchronization suspends future participation. A later positive payment restores that weight without filling the suspended interval.

**Why this priority**: This preserves recognition of early support without letting reactivation capture earlier earnings.

**Independent Test**: Exercise expiration, delayed synchronization, positive renewals, paid gifts, free renewals, and creator grants against a member who already has historical shares.

**Acceptance Scenarios**:

1. **Given** a membership that expires at day 10 and is synchronized at day 15, **When** rewards are earned between those times, **Then** its historical shares still participate through the synchronization transaction; expiration alone does not suspend them.
2. **Given** a synchronized member with 1,000 historical shares and 20 tokens already earned, **When** a positive payment restores membership, **Then** the old shares reactivate, the 20 tokens remain claimable, new shares use the curve's current position, and no rewards are added for the suspended interval.
3. **Given** suspended historical shares, **When** a zero contribution or creator grant restores access, **Then** the shares remain suspended. A later positive contribution or positive paid gift reactivates them.
4. **Given** an already-eligible member, **When** free time extends access before synchronization, including after natural expiration, **Then** existing reward eligibility remains enabled without new shares or curve progression. Repeated free extensions are deliberately allowed.
5. **Given** a positive payment while previously granted or free access remains, **When** it succeeds, **Then** historical weight reactivates immediately; cash vesting still follows the actual purchased-time service order.
6. **Given** eligible historical shares and only creator-granted access remaining, **When** the creator revokes the final grant-only time, **Then** earned rewards are settled and future participation is suspended as today; the historical shares remain recorded.

---

### User Story 5 - Refund Unused Time From Its Reserved Allocations (Priority: P1)

The creator can refund the existing unused-time gross entitlement using the canceled purchase portions still reserved across all four allocations. Already-earned claims and historical reward weight survive.

**Why this priority**: Vesting should improve refund funding without exposing one person's earnings to another person's cancellation.

**Independent Test**: Refund complete future periods and partial current periods after arbitrary creator, supporter, referral, and buyback collections; compare against the independent unused-time calculation.

**Acceptance Scenarios**:

1. **Given** Story 1's 120-token purchase after three periods, **When** the creator refunds the remaining nine periods, **Then** the supporter receives 90 tokens from the four unvested allocations without an owner top-up; the 30 tokens already earned remain allocated to their proper recipients or buyback purpose.
2. **Given** a variable-contribution membership with zero and differently priced periods, **When** a refund occurs partway through the queue, **Then** its amount follows the gross actually paid for the unused time, not the most recent contribution or the curve's equivalent-time measure.
3. **Given** a refunded purchase that created early bonus shares, **When** a subsequent positive payment reactivates the member, **Then** the refunded purchase's historical shares still exist and the global curve has not moved backwards. This economic consequence is accepted in scope.
4. **Given** canceled future funding, **When** time advances, collection runs again, or the member rejoins, **Then** the canceled portion never becomes earned or refundable a second time.
5. **Given** a failed refund transfer, **When** the refund attempt fails, **Then** membership time, eligibility, reserves, and earned entitlements remain unchanged.

---

### User Story 6 - Claim Creator and Referral Earnings Without Losing Accrued Rights (Priority: P2)

Creators, referrers, and supporters see balances growing as service time is consumed and claim what is earned. Their claim rights do not depend on visiting the website on a schedule.

**Why this priority**: The user-facing result must make earned value and reserved future funding understandable and usable.

**Independent Test**: Inspect and claim each beneficiary's balance after partial vesting, ownership transfer, membership suspension, and delayed accounting processing.

**Acceptance Scenarios**:

1. **Given** a locked referrer who is not a member or whose own membership has expired, **When** a referred purchase's time is consumed, **Then** that referrer earns the purchase's recorded referral allocation and can claim it independently of membership eligibility.
2. **Given** a gift made before the recipient locks a referrer, **When** the recipient later chooses one, **Then** the gift's original allocation remains unchanged; attribution changes do not create commissions on earlier purchases.
3. **Given** a tier ownership transfer, **When** creator earnings are claimed, **Then** the current tier owner receives the tier's unclaimed creator earnings, including those from earlier purchases; economic terms remain fixed.
4. **Given** continuing accrual during a claim, **When** a successful claim is displayed, **Then** the interface confirms the actual paid amount and shows any subsequently earned balance rather than requiring a permanently zero balance to recognize success.
5. **Given** a paused tier or suspended membership, **When** an authorized beneficiary claims earned value, **Then** the claim remains available. Claims do not reactivate membership rewards or advance the curve.

---

### User Story 7 - Recover Correctly After Long Inactivity and Growing History (Priority: P2)

Creators and supporters can continue using a long-lived membership even when no collector or website user has processed accounting for an extended interval.

**Why this priority**: Correctness and usability must survive realistic history growth and delayed processing.

**Independent Test**: Populate large purchase histories, allow a long idle interval, and complete bounded accounting progress followed by purchases, synchronization, refunds, and claims.

**Acceptance Scenarios**:

1. **Given** a year without collection and many funding boundaries, **When** processing resumes, **Then** earnings reflect the original earning intervals and no stale amount is distributed using newly changed weights.
2. **Given** work exceeding one permitted transaction, **When** processing advances in resumable portions, **Then** completed work is not repeated and the caller can reach a correct actionable state without a privileged or continuously available operator.
3. **Given** equal histories differing only in processing and claim frequency, **When** they reach the same economic state, **Then** claims plus remaining earned balances match within the explicit rounding bound, and all funds remain accounted for.

4. **Given** a permissionless advance that processes accounting but has no eligible buyback, **When** the action completes, **Then** progress is retained and the action succeeds.
5. **Given** accounting or funding release succeeds before another selected operation fails, **When** a valid, sufficiently resourced advance completes, **Then** successful work remains committed, the failed operation changes no state of its own, and the result distinguishes the outcomes.
6. **Given** no accounting, release, or buyback/burn work completes, **When** a valid advance finishes its attempts, **Then** it reverts for no useful work; merely selecting a tier or refreshing an idle timestamp does not qualify.

### Edge Cases

- Zero contribution with no historical shares; zero contribution while eligible; free access restored while suspended; and positive payment while free access remains.
- Expiration without synchronization, synchronization while paused, duplicate synchronization, refund suspension before natural expiration, and later restoration of the same membership record.
- Renewals before the existing paid queue ends, zero-value periods between positive purchases, complimentary grants, revocation of the final grant-only time, and multiple purchases at one timestamp.
- Funding starts, finishes, refund cancellations, and eligibility changes at the same timestamp. Time contributes no earnings during a zero-length interval, but actual purchase ordering still determines curve position.
- Payments that cross the early-window boundary, minimal raw payments, maximum supported amounts, long durations, and splits that individually round to zero.
- A refunded early purchase retaining historical weight, and a new payment restoring that weight without resetting curve position or restoring canceled funding.
- No eligible weight, zero reward allocation, zero referral allocation, no referrer, and 100% buyback allocation with zero creator/member/referral portions.
- A referrer selected after earlier unattributed gifts, a referrer without membership, and creator ownership transfer while balances remain partly unvested.
- Frequent versus delayed processing, partial catch-up, repeated claims, canceled funding processed again, and growth of the earned balance while a claim is confirming.
- Different payment-token precisions and display scaling; display changes must not alter the canonical economics of a published tier.
- Failed or inexact transfers, attempts to claim another recipient's balance, and attempts to spend reserved or already-earned funds for an unrelated purpose.

## Requirements *(mandatory)*

### Functional Requirements

**Payment allocation and time earning**

- **FR-001**: Every positive membership payment MUST reserve its creator, membership-reward, applicable referral, and buyback portions at purchase and make them earned only as the corresponding purchased service time is consumed.
- **FR-002**: Purchased access and reward shares MUST take effect at purchase; cash vesting MUST NOT vest access rights or defer share issuance.
- **FR-003**: The payment's existing immutable allocation rates and applicable referral attribution MUST determine its amounts at purchase, with unused referral allocation and initial split rounding assigned to the creator as today.
- **FR-004**: Each payment MUST earn over its actual service interval in the existing paid-first time model; renewals MUST NOT restart, accelerate, or stretch older payment schedules, and zero-value purchased intervals MUST retain their place in the queue.
- **FR-005**: Complimentary and zero-contribution time MUST create no new cash allocations, shares, or curve progression; price-weighted equivalent time MUST NOT replace the actual duration used for vesting or refunds.
- **FR-006**: Unearned funding MUST remain protected from withdrawals, reward or referral claims, buyback execution, and unrelated refunds until earned or returned for its own unused-time cancellation.
- **FR-007**: Creator earnings MUST remain payable to the current tier owner, including after ownership transfer, and referral earnings MUST remain payable to the referrer recorded for the originating payment without requiring that referrer to have an eligible membership.
- **FR-008**: Time-based earning MUST continue while the tier or buyback execution is paused and while collectors or the website are unavailable; collection and market execution MUST NOT determine when entitlement is earned.

**Membership reward distribution**

- **FR-009**: Earned membership reward funding MUST be distributed proportionally among the historical shares eligible during its earning interval, rather than among a purchase-time cohort or the members eligible only when processing occurs.
- **FR-010**: A change to shares, reward eligibility, or funding MUST preserve attribution through its effective time before the changed state participates in subsequent earnings; zero elapsed time MUST create no new earnings.
- **FR-011**: Processing and claim frequency MUST NOT change entitlements beyond an explicit, independently validated raw-unit rounding bound; frequent processing MUST NOT allow extraction of extra rounded claims or loss growing without a documented bound.
- **FR-012**: Earned reward funds with no eligible recipient MUST remain separately protected and MUST NOT be retroactively assigned to a later joiner or redirected to the creator, referrers, or buybacks.
- **FR-013**: Total eligible reward weight MUST equal the sum of the historical shares of reward-eligible memberships; suspended shares MUST remain recorded but excluded from that total.
- **FR-014**: Distributed but unclaimed rewards MUST remain the recipient's claimable entitlement after suspension, expiration, synchronization, refund, pause, or ownership transfer.

**Early-support curve and creator controls**

- **FR-015**: Tier creation MUST offer More / Some / None presets and optional customization of starting boost and early-support window, with a live share-weight preview and clear identification of custom values.
- **FR-016**: The supported curve MUST start at the selected boost and taper continuously and linearly in marginal weight to the normal rate across the early-support window; purchases beyond that window MUST receive normal weight.
- **FR-017**: Curve progression MUST measure cumulative purchased time weighted by price within one tier; equivalent total positive support MUST advance it equally regardless of the number of purchasers or payment grouping.
- **FR-018**: For a fixed-price tier, price-weighted curve progression MUST equal actual purchased time; for a pay-what-you-want tier, progression MUST be proportional to gross contribution and the equivalent early window MUST be expressible directly in payment-token units without a separate creator normalization setting.
- **FR-019**: None MUST issue shares equal to gross payment under the current share-unit convention and MUST NOT disable cash vesting or the selected membership reward allocation.
- **FR-020**: New shares MUST reflect the complete interval a purchase occupies on the curve; splitting a purchase without intervening purchases MUST preserve aggregate issued weight within the explicit rounding bound. This does not require identical cash splits when per-payment rounding or the purchased service history differs.
- **FR-021**: Positive purchases MUST issue their full calculated shares immediately to the recipient's historical membership record, including paid gifts; existing historical shares MUST NOT be recalculated at later curve positions.
- **FR-022**: Issued shares MUST remain permanent through refunds and suspension, and cumulative curve progression MUST never decrease because of refund, expiration, synchronization, claim, or ownership transfer.
- **FR-023**: A later positive renewal MUST receive new shares at its then-current curve position in addition to any historical shares it restores; the member's original starting boost MUST NOT apply to every future payment.
- **FR-024**: Published curve settings, allocation rates, and vesting behavior MUST be immutable for that tier, including against changes by successor owners, protocol operators, or later preset releases.
- **FR-025**: Default and customizable parameter ranges MUST be published, identical across supported clients, and validated before tier creation; invalid, unrepresentable, or unsupported settings MUST fail before publication and before funds are accepted.
- **FR-026**: Curve previews MUST label multipliers as reward weight rather than promised payouts, expose the early-window measure, and distinguish an estimate before payment from the weight actually issued at execution.

**Eligibility and reactivation**

- **FR-027**: Natural expiration alone MUST NOT suspend reward eligibility; the creator's successful expiration synchronization MUST settle earned rewards through its effective time and then remove historical weight from future participation.
- **FR-028**: A successful positive purchase, contribution, or paid gift MUST reactivate suspended historical shares immediately; no earnings from the suspended interval may be backfilled.
- **FR-029**: Zero contributions and creator grants MUST NOT reactivate suspended shares, even when they restore access or the membership credential; granting access and granting reward eligibility MUST be separate outcomes.
- **FR-030**: Free extensions MUST preserve already-enabled reward eligibility, including after expiration but before synchronization; repeated free extensions may maintain that eligibility indefinitely without new shares or curve progression. Revoking the final grant-only access MUST suspend eligibility as today when no purchased time remains.
- **FR-031**: Claims and accounting processing MUST NOT reactivate shares or advance the curve, and a member's earlier earned balance MUST remain claimable without renewing or meeting a claim deadline.

**Refunds and protected balances**

- **FR-032**: Refunds MUST preserve the existing creator-only authority, fixed recipient, and gross unused-paid-time entitlement; variable contributions MUST use their actual paid amounts and consumed service intervals.
- **FR-033**: The four unvested allocations belonging to canceled unused time MUST fund its gross refund without requiring creator earnings or an owner top-up, subject to exact token transfer and a conservation-preserving rounding policy.
- **FR-034**: Refund completion MUST cancel future accrual from refunded time and suspend the member's eligible weight without changing historical shares, curve progression, or amounts already earned by any beneficiary.
- **FR-035**: Refunded future funding MUST never earn, release, or refund again after later processing, renewal, or reactivation; already-earned protected value MUST not be reclaimed merely because it has not yet been claimed or collected.
- **FR-036**: Every raw unit remaining from allocation, accrual, distribution, or cancellation rounding MUST retain an explicit owner or protected purpose; rounding MUST NOT manufacture claims, leave an unexplained balance, or make the supporter or creator fund a refund shortfall.
- **FR-037**: Failed payments, refunds, claims, or releases MUST leave the corresponding money, membership, and eligibility outcomes unchanged; no operation may spend another recipient's protected funds.

**Creator and supporter experience**

- **FR-038**: Publication review MUST explain the permanent curve settings, all four vesting allocations, the upfront permanent nature of shares, and the creator-sync eligibility cutoff before the creator commits.
- **FR-039**: Creator, member, and referral views MUST distinguish earned claimable value from still-reserved funding; aggregate unvested member reward funding MUST NOT be presented as a guaranteed personal future reward.
- **FR-040**: Purchase and renewal views MUST show actual access time separately from price-weighted reward effects, explain any restoration of historical shares, and reconcile success against the actual payment and issued weight.
- **FR-041**: Claims MUST confirm the actual amount paid and refresh current balances without requiring the remaining balance to stay zero while further earnings accrue.
- **FR-042**: Earned claims MUST be accessible while paused and after membership suspension through both the website and an independent compatible client; no website visit, artificial waiting period, or claim deadline may be required to retain earned value.
- **FR-043**: When delayed processing prevents an immediately executable action, the interface MUST distinguish incomplete accounting from zero earnings and provide an understandable, resumable route to completion.

**Scope, capacity, and evidence**

- **FR-044**: The new earning model MUST feed the existing buyback destination and standing execution policy using only earned funds; this feature MUST NOT alter trading controls, external trading-fee vesting, or burn accounting. Currency onboarding additionally requires the minimum payment configuration in FR-055.
- **FR-045**: Accounting progress MUST be permissionless, bounded, and resumable without a privileged continuously available operator; lifecycle and claim actions MUST NOT require an unbounded scan or rewrite of lifetime member or payment history.
- **FR-046**: The delivered behavior MUST be checked against an independent reference model over complete histories of purchases, elapsed time, funding boundaries, free periods, eligibility changes, refunds, claims, and all supported curve settings.
- **FR-047**: Validation MUST distinguish conserved totals from correct recipient attribution and MUST test both; passing aggregate conservation alone is insufficient.
- **FR-048**: Existing published tiers MUST NOT be mutated or automatically migrated. The new protocol version MUST replace obsolete implementation paths without introducing speculative compatibility layers, feature flags, or changes to wallet transaction ownership.

**Combined permissionless advancement**

- **FR-049**: Any caller MUST be able to perform one bounded advance action that can advance membership accounting, release earned buyback funding, and perform eligible buyback/burn work, including accounting-only and buyback-only advances. The caller MUST be able to request an upper bound on accounting checkpoints processed, subject to a protocol maximum; the action may process fewer if less work is due. The action MUST report actual progress, respect existing market policies, and must not require completing an entire backlog.
- **FR-050**: Every attempted accounting, release, status read, measurement, transfer or trade failure MUST revert the entire advance. Known buyback ineligibility MUST be reported and skipped; a stale requested configuration revision MUST revert. Useful bounded accounting progress may leave a backlog. NothingToDo applies only when no useful accounting, release or trade occurs. Accounting-only MUST perform no token transfer or trade.
- **FR-051**: Advance outcomes MUST attribute the actual caller and report completed accounting work, newly recognized earnings, released funding, and buyback/burn results without treating empty attempts, idle timestamp changes, or the call itself as useful work. Worker compensation, reimbursement, and compensation funding rules are deferred to a future pre-release specification and MUST NOT be introduced by this feature.

**Accessibility and motion**

- **FR-052**: New and changed creator, supporter and operator flows MUST provide standard accessible controls and content: semantic labels and selected states, keyboard operation, logical reading/focus order, visible unobscured focus, associated instructions and actionable validation errors, and meaningful status announcements without moving focus unexpectedly. Text and controls MUST remain usable with zoom/reflow and sufficient contrast; color alone MUST NOT communicate state. Continuously accruing balances MUST NOT cause repeated unsolicited announcements.
- **FR-053**: Curve decisions MUST be understandable and editable using visible text summaries and ordinary controls without accessing a graph. Summaries MUST identify More / Some / None / Custom and explain the configured starting boost, taper to normal, window with units, and any displayed example purchase's average boost; distinguish reward weight from cash payouts. None MUST explain the normal linear rate. Charts MUST be supplemental, excluded from the assistive reading and keyboard focus flow, and contain no exclusive information or required interaction. Point-by-point chart navigation, data tables and chart-specific assistive interfaces are not required.
- **FR-054**: Normal product animation MUST remain the default. New and changed UI, including charts, MUST respect reduced-motion preferences with a stable equivalent that preserves information and actions, and support high-contrast/forced-colors presentation with distinguishable text, controls and plotted marks. Motion or animation MUST NOT be required to understand values or complete actions. CSS and JavaScript-driven animation both fall within this requirement.

### Key Entities *(include if feature involves data)*

- **Tier economic terms**: Immutable price, service period, payment asset, allocation rates, vesting rules, starting boost, and early-support window for one membership.
- **Purchase allocation**: A payment's gross amount, service interval, four monetary portions, applicable referral destination, consumed portion, and refundable future portion.
- **Historical reward weight**: Permanent shares issued to a membership, including early-purchase bonuses, regardless of current eligibility or later refunds.
- **Reward eligibility**: Whether historical shares participate in new earnings; independent of credential existence, access status, and already-earned claims.
- **Curve position**: Cumulative positive price-weighted support for the tier, independent of currently eligible shares and never reduced by refunds or expiration.
- **Earned entitlement**: Creator, member, referral, or buyback value earned through a particular time, whether or not processing, transfer, or market execution has occurred.
- **Reserved funding**: Payment value still attributable to unused service time, plus separately identified protected distribution or rounding balances.
- **Claim or release**: Transfer of earned value to its fixed beneficiary or buyback purpose without changing membership eligibility or curve position.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All stated acceptance scenarios pass for fixed-price and pay-what-you-want memberships where applicable, including zero, minimum-positive, and maximum-supported inputs.
- **SC-002**: At least 10,000 reproducible generated histories of at least 100 actions each agree with the independent entitlement model within a documented raw-unit rounding bound; each required lifecycle transition has recorded nonzero coverage.
- **SC-003**: Every tested history accounts for all received funds as earned claims, earned buyback funding, completed payouts, refunds, or explicitly protected remaining balances, with no unexplained deficit or surplus.
- **SC-004**: Replaying the same economic history under frequent, irregular, and delayed processing produces equivalent recipient entitlements within the declared bound, and no member earns from an interval in which their weight was suspended.
- **SC-005**: Every supported unused-time refund is fully funded by its remaining reserved allocations without an owner top-up, including after all previously earned balances have been collected.
- **SC-006**: None matches linear share issuance; equivalent purchase partitions match curve progression and aggregate weight; all supported nonzero boosts taper to normal weight and never move the curve backwards after refunds or synchronization.
- **SC-007**: Representative tiers with 10,000 membership records, 100,000 purchase records, and one year without collection can resume bounded processing and complete purchases, synchronization, refunds, and claims within the target chain's transaction limits, without restarting completed catch-up work.
- **SC-008**: Observed browser journeys cover publishing every preset and a custom curve, purchasing both pricing modes, positive and free access restoration, claims during ongoing accrual, and a partial refund. Displayed terms and successful amounts match authoritative results in every journey.
- **SC-009**: A reproducible behavior report compares the initial defaults and permitted extreme settings across concentrated prepayment, many small supporters, gradual growth, churn/reactivation, zero or tiny contributions, and creator-approved refunds. It records share concentration and reward allocation outcomes separately and identifies the tested settings and numeric bounds. Economic optimization of defaults, per-asset suitability approval, and a separate default-approval workflow are outside this feature.
- **SC-010**: Release evidence identifies the exact reviewed revision and separates mathematical-model, local accounting, browser, target-environment, and public-chain results; a passing specification checklist or exploratory model is never reported as production validation.

- **SC-011**: Accounting-only, release-only, buyback-only, mixed eligible/ineligible buybacks, failed-release, failed-trade, empty-tier, repeated-no-work, and invalid-input advance scenarios have explicit outcomes: every attempted failure rolls back the entire transaction, ordinary unavailable buybacks are skipped, separate accounting remains usable when trading fails, requests stay within a shared work budget, existing buyback policies hold, and no worker payout is created. Recorded outcomes distinguish actual progress from elapsed time or attempted work.

- **SC-012**: Browser acceptance records keyboard-only and screen-reader journeys for preset/custom publication, invalid-input correction, claims and catch-up/retry; all required decisions and actions are available without chart navigation. Verify summaries match configured values, meaningful status announcements do not repeat with routine accrual, focus remains usable, and changed content works with 200% text zoom, 320 CSS-pixel reflow, reduced motion and high-contrast/forced-colors modes. Verify default animation remains present. Record browser/assistive-technology versions and observed limitations; automated checks alone do not establish this outcome.

## Assumptions

- A combined permissionless advance is the normal worker/runner route for CHK035. Direct tier processing remains available. A possible future worker payout needs a separate pre-release specification covering funding, eligibility, and manipulation resistance; no payment mechanism or placeholder reward balance is added here. Gas cost, the validated protocol batch cap, and recovery throughput are implementation discovery and acceptance work, not additional product decisions required before task generation. Benchmarks must record total recovery work on the stated workloads; no fixed total cost or elapsed-time target is required by this specification.

- The supported shape is a bounded taper: marginal weight falls linearly from the starting boost to normal across the window, then remains normal. A curve editor or arbitrary creator-supplied formula is out of scope.
- Initial implementation defaults are None at 1x, Some at 1.5x, and More at 3x, with Some initially selected. These are editable starting values for unpublished creator settings. This feature validates their defined mathematical behavior; it does not require economic calibration or asset-specific approval before implementation. Later default tuning cannot change the terms of already-published tiers.
- The initial fixed-price window is 1,000 configured membership periods. The initial pay-what-you-want window is 10,000 payment-token display units, converted to a fixed canonical amount at publication. This is a contribution threshold, not a fiat valuation or reference-price control. Creators can customize it before publication. An unrepresentable default requires valid creator input; it must not be silently clamped or require a platform asset-approval process.
- The initial supported starting-boost range is 1x through 10x in 0.01x increments. The window must be strictly positive when a bonus is enabled. Concrete numeric window and payment limits are defined in the plan and must be validated across supported inputs. None does not require an active window. These are engineering bounds, not a claim of an economically optimal setting.
- Fixed-price creators see the window in configured periods and an equivalent total time; pay-what-you-want creators see its total-contribution equivalent. These are two presentations of price-weighted cumulative support, not two independent curve clocks.
- Published canonical economic quantities do not change with market prices, token display multipliers, or later default catalogs. Display updates may change presentation but never reprice an existing curve or alter previously issued shares.
- Permanent upfront shares include weight from subsequently refunded purchases. Preserving that weight and never reopening the early curve are accepted economic choices, not defects to silently repair with vesting, decay, slashing, or rollback.
- Free renewals and grants preserve already-enabled eligibility but cannot restore suspended weight. Positive payments must meet the immutable tier currency minimum; no separate positive-payment eligibility clock is introduced.
- Unvested membership reward funding belongs to the future eligible pool, not to a member-specific purchase-time entitlement. Earned value already attributed to a member remains theirs while suspended.
- A zero-eligible earning interval, if reachable, retains its funding as protected unassigned reward reserve; it has no administrative withdrawal or retroactive award to the next entrant. Planning must examine reachability and include the outcome in the independent model.
- Existing referral selection, gift restrictions, membership identity, paid-first time consumption, pause behavior, creator ownership transfer, refund authority, and fixed payout identities apply except where a requirement above explicitly changes vesting or eligibility behavior.
- The existing multi-token and standing buyback behavior from feature 003 remains a dependency. External launchpad trading-fee vesting and external token-market curves are distinct from this feature's membership earning and share-issuance curve.
- The remaining workflow is planning, risk-appropriate requirements checklists, tasks, cross-artifact analysis, implementation, and convergence. Further clarification is necessary only if calibration or feasibility work exposes a product choice that cannot reasonably be resolved within these requirements.
- The project constitution's creator ownership, permanent-term disclosure, chain-scoped identity, MIT/open-source policy, plain-language UX, existing wallet lifecycle, and evidence-bounded delivery requirements apply. No constitutional amendment or exception is requested.
- Public deployment, migration of existing memberships, discretionary clawback of earned rewards, share vesting, automatic expiration-based reward suspension, new notifications, claim deadlines, and changes to buyback trading strategy are outside this feature.
- The lifetime arithmetic bound is documented as a smart-contract and asset-compatibility constraint. CHK011 does not require a dedicated user-facing capacity feature or a change to onboarding. Preserve numeric validation, ordinary error handling, and existing rights if a payment cannot fit. Documentation distinguishes cumulative accepted payments from token supply; the intended asset set is not expected by the product owner to approach the bound in practice.

## Approved revision: atomic advancement and minimum payments (2026-09-10)

- **FR-055**: Factory authority configures a positive raw-unit minimum for every enabled currency, calibrated to $1 (USDG exactly 1,000,000 raw units). Fixed per-period prices must meet the current currency minimum at publication. Each tier captures that minimum immutably; positive PWYW must meet it; zero PWYW and grants remain free. Publication must compare the creator-reviewed minimum with the registry and reject a changed value before creating the tier. Admin changes apply only to future tiers. Volatile currency calibration records its price reference and date, not an onchain dollar oracle.
- **FR-056**: Provide accounting-only, buyback-only (released inventory), and combined accounting/release/trade operations. Preserve standalone earned-fee release. The UI uses fixed 25 checkpoint batches, the contract retains custom bounded budgets. Joining/renewing catch up only their own tier; publication performs no catch-up.
- **FR-057**: Protocol UI defaults to automatic bounded selection and also permits explicit tier selection; registry spam remains a discovery limitation. Surface AccountingBehind with a direct catch-up CTA. Simulate/estimate ordinary atomic execution without a blanket 15M gas override or bespoke affordability margin. Preserve existing transaction/receipt ownership.
