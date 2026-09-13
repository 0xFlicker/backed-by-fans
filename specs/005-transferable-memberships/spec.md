# Feature Specification: Transferable Membership Positions and Permanent Retirement

**Feature Branch**: `codex/005-transferable-memberships`  
**Created**: 2026-09-11  
**Status**: Open — scope amended 2026-09-12; implementation and validation pending. Feature 005 has not been accepted as validated.

## Input and scope

Make membership NFTs transferable and retire expired memberships through checkpoint maintenance. Transfer the entire live token position, settle expiration at its actual timestamp, permanently burn expired credentials and weight, preserve earned fractional rewards for the final owner, and start returning members with fresh identities. Maintenance must be permissionless, bounded, resumable, deterministic, and available while paused. Every time mutation and the complete application, contract, test, and whitepaper surface must follow this lifecycle. Allow multiple independent memberships per wallet per tier, explicit creation versus renewal, token-ID targets, and bounded discovery and claims.

This specification records the supplied requirements because the repository's previous active feature, `004-vesting-reward-curves`, describes the superseded persistent-credential lifecycle. This work creates a separate feature rather than rewriting that feature's historical evidence. This backfill completes specification quality review for the existing feature; implementation and release remain separate work.

## Scope amendment — 2026-09-12

This work remains **feature 005**. Do not create a successor feature for the deployment/claims refactor. Earlier implementation checks and deployment records are historical evidence for their exact source; they do not establish validation or acceptance of this amended feature. The current convergence verdict is reopened.

The following requirements supersede earlier numeric work-cap, manual-only claim and A/B deployment decisions in this feature's supporting artifacts. Those artifacts must be reconciled before implementation. Existing lifecycle, authorization, economics, fractional conservation and accessibility requirements remain binding.

- **FR-018**: Use one membership factory that directly creates standard, non-upgradeable ERC-1167 clones of one separately deployed, fixed implementation. Remove tier A/B stores and the separate tier deployer. Initialize each clone atomically once, lock implementation initialization, and preserve independently fixed tier terms and isolated state. Use Robinhood-native deployment limits, not Ethereum's 24,576-byte runtime ceiling or speculative extra limits.
- **FR-019**: Remove hard-coded iteration, batch and pagination ceilings across all protocol batch paths, including membership accounting/claims/previews/discovery, allocation history, protocol fee collection and purchases, registry pages and batched execution-limit updates. Use caller-supplied work/page bounds or explicit request arrays; preserve iterative progress, exact chronology and atomic failure behavior. Economic bounds, input-format constraints and actual native chain limits remain.
- **FR-020**: Restore **Claim all** as the default reward action, with optional manual selection. Discover positions and beneficiary balances automatically; simulate and estimate feasible batches, show progress and additional wallet confirmations, and support interruption/resumption without silent omissions or duplicate liabilities. Revalidate ownership and accounting before each submission.
- **FR-021**: Replace the existing owned fork and web app with the amended implementation after local validation, retaining RPC port 18557, execution chain 31337 and web port 3110. Use the existing private origin RPC/pin and preserve prior evidence. Public source verification and automatic clone recognition are checks for the **next authorized testnet deployment**, not prerequisites for the next fork.

Additional acceptance criteria:

- **SC-008**: Factory-created tiers have standard ERC-1167 runtime, the intended fixed implementation, independent state and immutable economic behavior; initialization cannot be repeated, and failed initialization leaves no registered tier. Report measured deployment and operation gas against equivalent earlier scenarios.
- **SC-009**: Successful tests exceed the former 32-position, eight-tier, 25-event, 256-preview-event and 100-item page ceilings and the corresponding other protocol batch ceilings. Small repeated maintenance calls produce the same exact result as larger calls. Oversized failed transactions leave state unchanged and smaller calls remain usable.
- **SC-010**: Claim all succeeds in one transaction where feasible and across resumable batches otherwise, including maintenance, wallet rejection, ownership changes, retired-only balances and incomplete discovery. It does not indefinitely chase new positions or ongoing accrual.
- **SC-011**: The replacement fork and web app expose the amended graph/interfaces and pass focused local/browser acceptance under Robinhood-native limits. Explorer verification remains explicitly deferred to testnet and is not claimed from fork results.

## Clarifications

### Session 2026-09-11

- Q: Should pausing a tier also prevent members from transferring their live membership NFTs? → A: Allow transfers during a pause; live transfers remain subject to ownership, approval and timestamp-based expiration checks. Confirmed follow-up: live transfers do not run or require checkpoint catch-up, regardless of pending maintenance.
- Q: Who should be able to initiate a membership refund after the NFT becomes transferable? → A: Creator only; the refund is paid to the current NFT owner.
- Q: Should NFT transfer approvals also let the approved address renew the membership and claim its rewards for the owner? → A: Transfer only; NFT approval grants no owner-only renewal, reward claim or creator-operation authority.

## User Scenarios & Testing

### User Story 1 — Transfer a complete live membership (P1)

A member transfers one selected position to another wallet, including a wallet already holding other memberships in the same tier. **Why P1**: Owners need to move their membership without losing its benefits or earned rewards.

**Independent test**: Create two positions with different expirations and referral choices; transfer one after rewards accrue. Compare every position field and exercise each wallet's rights.

1. Given a live NFT with paid and granted time, shares, reward credit, funding history and a locked referral, when ownership changes, then all those values stay with the same token ID and the recipient gains access and owner-only claim/renew rights. This succeeds with a backlog exceeding the maintenance budget, including while paused, without processing any checkpoints or changing stored token accounting.
2. Given a transferred NFT, when its former owner or former token-approved spender attempts an owner-only action, then it fails. Only the creator may initiate a refund, and it pays the current NFT owner; owning the NFT or holding its transfer approval does not authorize a refund.
3. Given an already-expired NFT still awaiting maintenance, when any transfer entry point is used, then it fails even if the caller is approved.
4. Given an approved address that does not own the NFT, when it calls an owner-only renewal or reward claim, then it fails even if a claim would pay the owner. Its approval permits transfer only; independently permissionless sponsorship remains available under the sponsorship rules.

### User Story 2 — Retire at the correct boundary without losing rewards (P1)

Anyone catches up a tier after inactivity. Expired positions earn only through their expiration and their earned rewards survive the NFT burn. **Why P1**: Retirement must release capacity and stop future earnings without losing rewards already earned.

**Independent test**: Replay an identical funding history with punctual maintenance, delayed maintenance, and every batch split around equal timestamps; compare ownership, weight, capacity, and liabilities including all earned fractions exactly.

1. Given funding ending at an expiration timestamp, when maintenance reaches that timestamp, then funding through that boundary, including rounding tails, is distributed before expiring weight is removed.
2. Given insufficient work budget, when maintenance returns incomplete, then its progress persists and the next call continues without double settlement or skipping a retirement.
3. Given retirement, then the NFT is burned, its shares are zero, it has no live membership rights, capacity is released once, and all earned credit including fractions belongs to the owner at expiration.
4. Given several fractional retired credits belonging to one owner, when their sum reaches a whole payment unit, then that unit is claimable; claims preserve the remaining fraction.

### User Story 3 — Renew deliberately or start fresh (P1)

A wallet can hold several independent positions, extend a selected live one, or create another. **Why P1**: Members need predictable renewal and return behavior without restoring expired benefits.

**Independent test**: Renew A before expiration while B is unchanged; allow A to expire; create C and prove it has a new ID, new referral state and only newly issued weight.

1. Given a live target, renewal extends that ID and preserves its existing economics and locked referral choice.
2. At or after expiration, the old ID cannot be renewed, reminted, or regain its old shares. A separate create operation catches up retirement before accepting new membership time.
3. Creation always creates a new ID, even if the recipient owns other live positions. Tier capacity counts positions, not wallets.
4. Retirement and refunds never reduce lifetime gross accepted; new weight is issued from the then-current immutable curve cursor.

### User Story 4 — Manage every membership and reward balance (P2)

Members discover and act on all their positions, and former members can claim retirement balances without owning an NFT. **Why P2**: Portfolio management builds on the core lifecycle and remains required for the complete feature.

**Independent test**: Browse more than one discovery page and claim more than one transaction's position limit, with transfers between reads and submission.

1. Every position has a distinct identity in lists, caches, previews and transaction targets. Incomplete pages or accounting are explicitly labeled.
2. Gifts and grants distinguish creating a position from adding time to a selected token. Targeted sponsorship validates the expected owner and referral state at execution.
3. A paused tier still permits live membership transfers, maintenance and claims; access remains timestamp-based. No application flow assumes a burned ID can rejoin.

### Edge Cases

Equal-time funding START/END and many expirations; a batch ending in each phase; no eligible members; grant-only and zero-contribution positions; partial grant revocation leaving paid time; full cancellation leaving no time; same-owner transfers; transfers to a receiver contract; stale spender approval; transfer after preview but before sponsorship/refund submission; owner with several live and retired positions; a retired fraction less than one raw payment unit; a paused tier with expired capacity; maximum prepaid and lifetime gross limits; complete batches followed by newly elapsed time.

## Requirements

### Functional Requirements

- **FR-001**: Support standard NFT transfers and approvals for live positions, including while the tier is paused. NFT approvals grant transfer permission only, not owner-only renewal, reward claims or creator operations. Pause state must not independently reject a transfer; normal ownership, approval and timestamp-based expiration checks still apply. Transfers must not run accounting catch-up or require completed maintenance; pending funding or retirement work cannot block an otherwise valid live transfer. Remove the nontransferable membership restriction and stop requiring memberships to advertise that restriction.
- **FR-002**: Keep remaining paid/granted time, accumulated weight, eligibility, unclaimed reward credit, funding history, and referral lock token-scoped across transfer.
- **FR-003**: Resolve membership access, owner-only claims and self-funded renewals from current token ownership. Only the tier creator authority may initiate refunds or subscription cancellations; route refunds to the current position owner. NFT ownership or transfer approval alone grants no refund authority. Preserve creator-only grant revocation.
- **FR-004**: Treat a membership as expired at its expiration timestamp and afterward, immediately for access, transfer and renewal, independently of maintenance progress.
- **FR-005**: Process funding and expirations in chronological order; distribute all funding through timestamp T before removing any weight expiring at T.
- **FR-006**: Permanently retire by burning the NFT, zeroing weight and eligibility, removing its schedule and live membership association, and releasing one occupied slot exactly once.
- **FR-007**: Move all earned member credit including fractions to a separately claimable balance of the final owner without per-position rounding loss or duplicate liability. No new NFT is required to claim it.
- **FR-008**: Renew only a live, explicitly selected token. Returning after expiration uses explicit creation with a new monotonically increasing ID, fresh position accounting and referral state, and new weight at the current curve cursor.
- **FR-009**: Keep lifetime gross monotonic through transfers, retirement, claims, grant changes and refunds.
- **FR-010**: Provide permissionless maintenance with a caller-supplied work bound, committed partial progress, deterministic equal-timestamp ordering and accurate completion status. Make it available while paused.
- **FR-011**: Every create/renew purchase, gift, contribution (including zero), grant, revocation and refund must update expiration scheduling. Schedule every extant position, including zero-weight complimentary ones.
- **FR-012**: Require catch-up before mutations that change membership time, weight or funding, or calculate newly earned payouts, so those operations cannot cross unresolved historical expirations. NFT transfers and approvals do not require catch-up: live transfers change only ownership, approval and owner listings and enforce expiration directly by timestamp. Withdrawal of already-settled retired credit also does not require catch-up; it only debits and pays that balance, without advancing accounting, changing weights or assigning new earnings. Failed atomic mutations must not be described as having saved attempted maintenance.
- **FR-013**: Permit multiple independent NFTs per wallet per tier, without automatic wallet-based targeting or position merging.
- **FR-014**: Bound onchain discovery, account aggregation and claims across tiers and positions. Pagination must not silently omit positions after transfers or burns; claims revalidate ownership.
- **FR-015**: Make previews simulate the same chronological lifecycle and report incomplete projections. Include retired owner credit and distinguish live, expired-awaiting-maintenance and retired states.
- **FR-016**: Keep public integrations, batch claims, approvals, discovery, membership/account/creator journeys, transaction outcomes, validation scenarios, simulations, protocol documentation and published whitepaper consistent with the new lifecycle. All affected controls must support keyboard use, clear focus and labels, accessible status/error announcements and narrow-screen layouts, as detailed in the application requirements.
- **FR-017**: Preserve exact payment-token amounts, immutable economic terms, original referral beneficiaries, refund-reserve rules, and creator/protocol liabilities.

### Key Entities

- Membership position: token identity, current owner, time balances, expiration, weight, eligibility, referral choice and funding account.
- Expiration checkpoint: ordered timestamp/token pair, independent of whether the position has funding.
- Retired reward balance: tier/payment-asset scoped scaled credit owned by an address, with no live membership rights.
- Maintenance cursor: chronological accounting boundary, pending work and bounded completion state.
- Position page and claim selection: chain/tier/token identities with bounded traversal and execution-time authorization.

## Success Criteria

### Measurable Outcomes

- **SC-001**: With more than 25 due checkpoints, owners and approved callers can transfer a live membership without performing maintenance, including while paused. All membership time, weight, reward eligibility, unclaimed rewards, funding history and referral choice remain attached to the same identity; accounting progress and unrelated positions do not change. The recipient gains owner rights and the former owner loses them. Approved non-owners cannot renew or claim, even if a claim would pay the owner. Only the creator can initiate refunds, and the current member receives the payment.
- **SC-002**: The same funding history produces exactly the same earned amounts, including fractions, whether expiration is processed promptly or later, across maintenance batches of 1–25 checkpoints and every split of simultaneous events.
- **SC-003**: Each expired membership is permanently retired exactly once, has zero remaining reward weight, releases one occupied slot, and preserves every earned reward fraction for its final owner. Combined fractions become claimable when they reach one payment unit; claims preserve any remaining fraction.
- **SC-004**: Checks one second before expiration, at expiration and one second afterward allow renewal and transfer only before expiration. Returning after expiration creates a distinct membership identity and cannot restore historical weight.
- **SC-005**: A member can discover and claim across at least 101 positions in one tier and 9 tiers through bounded pages and claim batches. No position is silently omitted, merged or overwritten; incomplete results remain clearly labeled.
- **SC-006**: Every purchase, renewal, gift, contribution, grant, revocation and refund maintains the correct expiration. Owners and approved callers can transfer live memberships during a pause with more than 25 due checkpoints and no cleanup prerequisite; expired transfers fail. Application journeys demonstrate position selection, paused transfer, fresh return and claims after retirement.
- **SC-007**: Public integrations, member/creator journeys, simulations and the published whitepaper agree on the lifecycle and permissions. Validation demonstrates these outcomes and reports the intended deployment resource limits and the evidence available for each claim. Accessibility is implemented for keyboard use, focus, labels, announcements and narrow screens. When automated or interactive accessibility testing is unavailable, static analysis and source review are accepted with the limitation and untested behavior explicitly recorded; that limitation alone does not block acceptance and must not be reported as a runtime accessibility pass.

## Assumptions

- NFT approvals are confirmed transfer-only: neither token approval nor owner-wide operator approval authorizes owner-only renewal, reward claims (even when paid to the owner), or creator operations. Other wallets may add time through explicit sponsorship calls independently of NFT approval.
- Refund/cancellation is confirmed creator-only. Transfer changes its payout beneficiary to the current NFT owner, not who holds tier administration rights.
- A full refund or grant revocation leaving zero total time retires immediately after current accounting settles. Partial grant revocation keeps the surviving position and its weight; time-only grants issue no new shares.
- Pausing blocks new membership time. Live transfers, maintenance, approvals/revocation of approvals, already-earned claims, and creator cancellation remain usable. Live transfer availability during a pause is confirmed in Clarifications.
- A transferred locked referral may equal the new owner's address; it stays locked. Transfer does not rewrite original referral liabilities.
- Existing deployed non-upgradeable contracts do not acquire this behavior. A replacement release is required; deployment and migration are outside this planning run.
- The three initial clarification answers and subsequent transfer, UI-state, maintenance and accessibility decisions remain binding. Existing pricing, payment assets, time limits and creator authority are dependencies of this lifecycle change; no new economic terms or deployment authority are introduced.

### Protocol reporting and funded review fork amendment

- FR-022: Expose read-only, caller-bounded tier-wide payment reporting: lifetime receipts, refunds, cumulative payouts by purpose, and exact projected earned, unearned, and reserved amounts. Use the existing funding/expiration chronology; report incomplete projections and remain readable while paused. Preserve accounting precision and distinguish member liabilities from unassigned funding and rounding reserves.
- FR-023: Display the protocol's payment flow across tiers, separately by currency, using the About visual language and plain-language accrued-versus-paid distinctions. Discovery must be bounded and incomplete or failed reads must never appear as authoritative zero/full totals.
- FR-024: Replace the disposable review fork on RPC 18557 / chain 31337 and webpage 3110 with the reporting implementation, fund both supplied user wallets, restore the designated Safe signer, and seed at least 250 USDG of first-month protocol fees through real membership purchases. Preserve previous deployment evidence.
