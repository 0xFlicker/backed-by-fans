# Backed By Fans — whitepaper outline

Status: working outline for review, not publication copy or a deployment attestation.
Source scope: current transferable-membership contract sources and `specs/005-transferable-memberships/`; attach the release revision and deployment evidence when publishing.

## Editorial scope

Membership-first. Explain a prepaid subscription that fans renew manually: creators set the terms, fans fund membership time, and payments accrue to participants as that time is consumed. No automatic billing is implied.

Fans receive an independent transferable membership NFT and, when enabled by the creator, member rewards. A wallet can hold several positions in the same tier; each token ID carries its own time and economics. Creators supply any access, content, or community benefits. The protocol supplies membership records, accounting, and interfaces that other applications can use.

Use “protocol token” until it has a name. Its supporting role is fee-funded buyback/burn and intended availability as a membership payment currency. Exclude speculative tier-creation burns, creator/fan token incentives, and other undecided utility. Do not imply that ordinary membership rewards are paid in the protocol token.

Target: 8–12 pages of main text, with a technical appendix. Markdown is the source; PDF layout and static diagrams follow content approval.

## 1. Membership as ongoing support

**Reader takeaway:** a membership sustains a relationship over time rather than ending with a purchase.

- Introduce creators, fans, and tiers without opening with token economics.
- A creator may publish multiple tiers with separate terms.
- A payment creates a new position or renews an explicitly selected live token ID. Creation never merges with another membership owned by the wallet.
- Benefits can include Discord, websites, communities, or recognition of support. These are creator-defined examples, not protocol-provided entitlements.
- Describe a live NFT as transferable proof of membership that carries the entire position. Access ends at expiration; chronological maintenance permanently burns the expired token. Historical funding evidence remains available.

Sources: [S1] `createMembership`, `createContributionMembership`, `renewMembership`, `renewSubscription`, `transferFrom`, `_update`; [S2] `createTier`.

## 2. What a tier promises—and what its creator can change

**Reader takeaway:** distinguish immutable economic terms from ongoing creator authority.

| Fixed at creation | Meaning for a fan |
| --- | --- |
| Tier name and symbol | No creator setter changes these labels. |
| Payment token | Each tier uses one currency; it cannot later switch to another. |
| Price per period and period duration | Fixed-price renewals use the same base terms. A zero price selects the contribution model. |
| Minimum positive payment | The factory minimum is snapshotted into the tier; later factory changes do not rewrite it. |
| Member-reward, referral, and protocol percentages | Future payments follow the same allocation rules. |
| Starting reward-weight boost and early-support horizon | The reward-weight curve cannot be changed after creation. |
| Tier identity and factory/vault connections | The deployed tier has fixed protocol identity and accounting destinations. |

| Creator can change or do later | Boundary to explain |
| --- | --- |
| Description and external URL | Copy and linked benefits can change. |
| Renderer, art settings, and media | Presentation can change for existing NFTs as well as new ones, subject to validation. |
| Pause/unpause | Blocks new membership time; live transfers, approvals, maintenance and claims remain available. Time and earned value continue under the same rules. |
| Supply cap | Counts independent positions, not wallets; zero is uncapped. Retirement releases capacity once, and capacity-sensitive changes catch up first. A nonzero cap cannot be below occupied supply. |
| Maximum prepaid periods | Changes the limit on subsequent time additions; does not erase existing paid time. |
| Grant or revoke grant time | Create or extend a selected position explicitly. Complimentary time has no payment backing. Revocation preserves remaining paid time; no remaining time causes retirement. |
| Refund | Current creator authority alone initiates cancellation. Pay the current NFT owner, cancel remaining funding, clear paid/grant time and retire permanently; NFT ownership or approval does not confer refund authority. |
| Transfer tier ownership | Two-step transfer changes the creator authority; it does not rewrite immutable terms. |
| Withdraw earned creator proceeds | Only earned proceeds are available; unearned funding and other protected liabilities are distinct. |

Protocol fee is **at least 1%, not universally exactly 1%**: creation validates `protocolFeeBps >= 100` and the three explicit cuts must total no more than 100%. Creator proceeds receive the remainder. Member and referral rates may be zero.

Permissionless maintenance is not a creator-only control. Any caller can process both funding and expiration checkpoints, including while paused.

Sources: [S1] immutable declarations, constructor, creator setters, `refund`, `processAccounting`, `processExpirations`, `transferOwnership`; [S2] `createTier`; [S3] `TierConfig`.

## 3. The membership lifecycle

**Reader takeaway:** NFT existence, active access, and reward eligibility are related but different states.

1. **Publish a tier:** establish the creator’s fixed economic terms.
2. **Create a membership:** issue a new monotonically increasing token ID, even when the recipient already owns memberships in the tier. Initialize its own time, reward and referral state.
3. **Accrue:** all four payment allocations are earned over their funded interval. Each live position participates with its accumulated eligible weight.
4. **Renew:** the owner selects an existing ID before expiration. Paid time follows remaining paid time; paid seconds are consumed before grant seconds. Referral choice and existing weight remain attached to that position.
5. **Transfer:** owner or approved caller moves the entire live position: time, shares, eligibility, unclaimed member rewards, funding history and referral lock. Ownership/approval/enumeration change without checkpoint catch-up, including while paused or with more than 25 due events. The recipient can already own other positions.
6. **Expire:** access, transfer and extension end exactly at the expiration timestamp. An expired-awaiting-maintenance NFT may still exist, but cannot regain time or historic weight.
7. **Retire:** anyone processes funding through the historical expiration before removing weight. Burn the NFT permanently, clear live membership/referral association, release capacity once, and transfer exact earned credit to the final owner’s separate retired balance. Keep funding history.
8. **Return:** create a different token ID with fresh state and new weight under the current curve. Retirement and refunds never rewind lifetime gross; a new NFT neither consumes nor inherits retired credit.

Distinguish ownership authority from original funding provenance. Current ownership grants access, owner-only claims and renewal. Token and operator approvals permit transfer only; they grant no claim, owner-only renewal or creator authority. A token-specific approval clears on transfer and burn.

Include a small sidebar on gifts and contributions:

- A fixed-price gift can create a new recipient position or sponsor renewal of a specified live ID. Sponsorship validates expected owner and referral state. It does not select a new referral.
- Contribution-mode creation or renewal adds one period, including zero-value contributions. Positive contributions meet the minimum and fund accrual; zero contributions create no funded allocation, shares or referral lock.
- Grant creation and targeted grant extension add complimentary access without funding or shares. Every position, including a zero-contribution or grant-only one, has an expiration schedule entry.

**Figure 1:** show a transferable live position, expiration, chronological retirement, separately retained owner credit, and a new identity on return. Distinguish the historical effective expiration from the later maintenance transaction. No arrow returns a retired ID to the live state.

Sources: [S1] `createMembership`, `renewMembership`, `createContributionMembership`, `renewContributionMembership`, `giftMembership`, `giftRenewal`, `grantMembership`, `addGrantTime`, `_timeBalancesAt`, `_retire`, `_update`; [S4] `issueShares`, `retireMember`; [S8] indexed expiration schedule.

## 4. Where a payment goes

**Reader takeaway:** allocation at payment is different from earning and claiming.

- The payment is allocated to creator proceeds, the member pool, an attributed referrer, and protocol fees.
- All four allocations begin unearned and accrue over the payment's funded interval.
- The creator receives the unused referral allocation when no referrer is recorded, plus split rounding remainder.
- Member rewards and referral rewards are denominated in the tier's payment token.
- Earning is not an automatic token transfer every second. Claims and fee release require transactions; bounded accounting may need to catch up first.
- Distinguish allocated, unearned, earned, and claimed balances consistently throughout the paper.

**Figure 2:** static payment-flow diagram: creator configures tier; fan funds tier; tier branches into creator, members, referrer, and protocol; earned protocol fees lead to a separately executed buyback/burn. Use time annotations along the branches, not arrows implying instant payouts.

### Worked example: one 100-unit payment for 30 days

Illustrative fixed-price tier: 70% creator, 20% members, 5% referral, 5% protocol. A valid referrer is recorded. These percentages are an example, not defaults. Assume no existing paid time, refund, or other change to the funding interval.

| Elapsed funded time | Creator earned | Member pool earned | Referrer earned | Protocol earned | Still unearned |
| --- | ---: | ---: | ---: | ---: | ---: |
| At payment | 0 | 0 | 0 | 0 | 100 |
| 15 days | 35 | 10 | 2.5 | 2.5 | 50 |
| 30 days | 70 | 20 | 5 | 5 | 0 |

The member column is a pool total, not one fan's reward. Individual rewards depend on eligible weight during each accrual interval. Display values are idealized; contract base-unit rounding and fractional reserves belong in the appendix.

With no recorded referrer, the example becomes 75/20/0/5. A creator-authorized refund halfway through would pay the current NFT owner the unused funded amount, subject to integer rounding, cancel future accrual, and retire the position. Already earned allocations are not clawed back.

Sources: [S1] `_applyPayment`, `_refund`, claims, `releaseProtocolFees`; [S4] `append`, `_integrate`, `_distribute`, `cancelFunding`.

## 5. Optional member rewards and referrals

**Reader takeaway:** a funded position’s earnings belong to its current owner, including after transfer, and depend on its eligible weight during each earning interval.

- Member rewards are optional per tier. Positive payments issue token-scoped accounting shares using the tier’s immutable curve. Shares accumulate in a live position and are destroyed at retirement.
- “Shares” are accounting weight that moves only with the whole NFT position. They are not separately transferable assets or ownership of the creator’s business.
- Early payments can receive more weight per unit. The boost tapers toward normal weight according to cumulative gross paid into that tier. A large payment crossing the curve receives integrated weight, not the initial boost on its entire amount.
- Creation, renewal and gift payments contribute to the pool. A position’s own funding can contribute to its earnings. Its current holder need not have made any of its historical payments.
- New weight does not receive rewards already earned before its issuance. It can participate in subsequent accrual from funding already underway, as well as its own new funding.
- Retirement destroys shares permanently. Natural retirement takes economic effect at expiration, after funding through that boundary; refunds retire at the cancellation timestamp. Neither action reduces lifetime gross or reopens the earlier curve.
- Exact accrued credit moves to the owner at retirement and remains separately claimable without an NFT. Aggregate fractions from multiple retired positions before rounding; retain the remainder after payment. This payout requires no global catch-up and remains available while paused.
- A referral choice locks on the position’s first qualifying positive owner payment. Renewal and transfer preserve it, even if the recipient is the recorded referrer. A new gift position starts Unset regardless of other NFTs in that wallet; sponsorship follows the selected position’s lock. Fresh IDs start fresh referral state.
- No eligible weight: member allocations remain protected as unassigned amounts rather than becoming creator proceeds. Do not advertise a future redistribution mechanism that does not exist.

**Figure 3:** optional two-fan timeline separating share issuance from later accrual. Use equal weights first; introduce the early-support curve only afterward.

Sources: [S1] `_lockReferralChoice`, `_validateReferralChoice`, `_applyPayment`, `claimReward`, `claimRetiredRewards`; [S4] `issueShares`, `retireMember`, `takeRetired`, `_distribute`; [S5] `validate`, `quote`, `cumulative`.

## 6. A supporting protocol token

**Reader takeaway:** membership is useful independently; token participation is optional.

- Describe the mechanism as connecting community membership activity to the protocol token through earned-fee-funded buybacks and burns. Avoid implying a guaranteed market-price outcome.
- Separate fee accrual, fee release to the vault, market execution, and burning. Execution is not automatic at each payment or each second. Available buyback funds include unspent vault fees and earned fees awaiting release, which can be released within the buyback transaction; unearned funding is excluded.
- Token binding, available inventory, configured routes/limits, pauses, and market conditions determine whether execution is possible.
- Intended use as a tier payment currency requires payment-token enablement and a configured minimum. Binding the protocol token does not itself enable it for tier creation.
- Creators who want that currency would create tiers denominated in it. Existing tiers cannot switch currency.
- Earned fees already denominated in the protocol token can be burned directly rather than buying that same token first.

Sources: [S2] `bindProtocolToken`, `setPaymentTokenEnabled`, `setMinimumPayment`; [S6] `_bindProtocolToken`, `_processingStatus`, `process`, `_burn`, `recordEarnedFees`; [S7] `advance`, `buyback`.

## 7. Trust boundaries and integrations

**Reader takeaway:** know what the contracts enforce and who controls the rest.

- Creators control mutable benefits, metadata/art, grants/revocations, refunds and tier ownership as listed above. Expiration maintenance is permissionless, so cleanup does not depend on creator availability.
- Protocol authority controls token admission/minima for new tiers, one-time protocol-token binding, and buyback configuration/pauses. Do not equate creator-owned memberships with the absence of administrative powers.
- Integrations check both current ownership and active status for the selected token ID. Timestamp-expired NFTs provide no access even before burn. Identify positions by chain, tier and ID, not a wallet-to-single-token lookup.
- Live NFT transfers move the position between wallets without financial catch-up; token approvals authorize only that movement. Original payer/referral records do not become ownership fallback or recovery authority.
- Contract bugs, payment-token restrictions, chain/RPC availability, external applications, and buyback liquidity/execution are dependencies to explain plainly.
- Accounting may be stale until processed; a projected amount and a settled withdrawable amount should be distinguished.
- Reward weight does not promise a particular reward amount. Creator benefits are not enforced merely because membership ownership is onchain.

Sources: [S1] `isActiveToken`, `ownerOf`, transfers/approvals, owner methods, `processAccounting`, `processExpirations`; [S2] owner methods; [S6] authority modifier and setters; [S7] execution entrypoints.

## 8. Managing multiple positions and bounded work

**Reader takeaway:** a large portfolio remains usable through paged discovery, Claim all and resumable maintenance; partial results must be labeled.

- Owner discovery uses caller-selected page sizes, with no fixed contract page maximum. Read all pages/details at one captured block, include expired-awaiting-maintenance status, and restart pagination on refresh because transfers and burns change owner ordering.
- Claim all discovers positions and uses simulation and gas estimates to choose transaction batches. Contracts impose no fixed position or tier count; callers supply the shared accounting work budget. The interface offers Claim all rather than individual position selection. After an interrupted claim, pressing Claim all again claims the remaining rewards. Owner-level retired, referral and creator categories are included once per tier. Empty ID lists can claim owner-level balances without NFTs.
- Revalidate ownership at execution. Reject duplicates and stale selections atomically. A selection retired by its own successful catch-up pays through retired credit; already-burned IDs use the retired route instead.
- Public maintenance accepts a caller-supplied work budget without a fixed contract maximum. A funding START, funding END or one retirement uses a step. Funding through a timestamp, including all equal-time tails, precedes retirements ordered by ID. Save progress across batches; the last permitted event can complete the call.
- Finite backlogs clear through repeated calls. Completion is relative to each transaction’s timestamp; advancing time can make additional work due. Maintenance and claims remain available while paused.
- All time/weight/funding mutations maintain the schedule and catch up before accepting changes. Failed atomic operations do not commit attempted maintenance. Transfers/approvals and already-settled retired withdrawals are exceptions to the catch-up requirement.
- Preview work uses a caller-selected budget. Timestamp, progress, queue counts and completeness qualify results; a complete preview does not prove a later transaction has sufficient gas or accounting budget.
- Loading, empty, failed, stale and incomplete are distinct application states. Displayed partial totals cover only loaded positions. Unavailable reads never imply zero assets or an empty wallet.

Sources: [S1] `tokensOfOwner`, `claimRewards`, `claimRewardsFor`, `previewClaimRewards`, `processAccounting`, `processExpirations`; [S2] `claimEverything`; [S4] `encodedPreview`, `encodedClaimPreview`; [S8] expiration schedule.

## Technical appendix plan

- Gross allocation formulas, rounding, refund reserves and protected liabilities.
- Cumulative reward-weight formula and a crossing-the-horizon example; only positive accepted payments advance lifetime gross, and refunds never reduce it.
- Distinct live, expired-awaiting-maintenance and retired states. Include transfer, refund, gifts, grants, zero contributions and fresh return without a retired-to-live transition.
- Referral states and locking by token ID, independent of a wallet’s other positions or funding history.
- Exact retired credit uses Q = 2^128 subdivisions per raw payment unit. Retirement moves credit without changing member liability; payout subtracts whole units and retains fractions. Global unallocated carry/dust is separate from a member’s earned fraction.
- Combined funding/expiry ordering and partial equal-timestamp batches. Historical settlement uses eligibility at the accounting cursor; public wall-clock eligibility cannot discard unsettled earnings.
- Bounded discovery, claims and previews with captured blocks, completeness and stale-selection failures.
- Contract map, final source revision, deployed addresses/network and verification evidence as of publication. Source/model checks do not establish browser, wallet, deployment or accessibility runtime results.
- Glossary: tier, position, token ID, period, paid time, grant time, allocation, accrual, share, eligibility, checkpoint, retirement, retired credit, claim, buyback, burn.

## Editorial checks for publication

1. **Identity:** every creation has a new ID; renewal names a live ID. Wallets can own multiple independent positions in a tier.
2. **Transfer:** the whole position follows ownership without settlement, including while paused or with pending maintenance. Approvals authorize transfer only.
3. **Expiration:** access/transfer/renewal end immediately at expiry. Late maintenance settles to the historical boundary and burns permanently; it cannot award post-expiry earnings or restore weight.
4. **Conservation:** retirement preserves exact earned fractions for the final owner. New IDs do not inherit old weight, consume retired credit, or rewind lifetime payment volume.
5. **Funding authority:** current ownership governs member rights and refund destination. Only creator authority initiates refunds; historical payment provenance confers no ownership rights.
6. **Evidence:** keep prose, diagrams and contract references aligned; label incomplete reads and distinguish implementation tests from public deployment or browser proof.

## Source map

References name the functions to inspect alongside each section, so line-number changes do not obscure the evidence.

- [S1 — MembershipTier](../../contracts/src/MembershipTier.sol)
- [S2 — MembershipFactory](../../contracts/src/MembershipFactory.sol)
- [S3 — MembershipTypes](../../contracts/src/types/MembershipTypes.sol)
- [S4 — VestingLedger](../../contracts/src/libraries/VestingLedger.sol)
- [S5 — RewardCurve](../../contracts/src/libraries/RewardCurve.sol)
- [S6 — ProtocolBuybackVault](../../contracts/src/ProtocolBuybackVault.sol)
- [S7 — ProtocolBurnRouter](../../contracts/src/ProtocolBurnRouter.sol)
- [S8 — ExpirationSchedule](../../contracts/src/libraries/ExpirationSchedule.sol)
