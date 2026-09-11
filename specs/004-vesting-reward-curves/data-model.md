# Data Model: Vested Membership Allocations

All concepts live in the existing immutable tier or its explicit `VestingLedger.State` storage. These are design fields, not a parallel offchain database. Cash fields use uint256 Q128 scaled token units unless explicitly marked raw; timestamps/durations use checked uint64. Public addresses are always interpreted with chain and protocol version.

## Entities and Relationships

| Entity | Fields and relationships | Validation and lifetime |
|---|---|---|
| Tier terms | Existing payment token, price, period, split rates; new `uint32 startingBoostBps`, `uint112 earlySupportGross` | Immutable. Boost 10,000–100,000 step100; None requires horizon0; enabled horizon1..C. Fixed-price horizon exact multiple of price and whole-period count1..uint64 max. Allocation rates keep existing constraints. |
| Curve state | `uint112 lifetimeGross`; permanent per-token `sharesOf`; `totalRewardShares` counts eligible shares only | Positive gross increases cursor <=C. F(x+g)-F(x) issued at purchase. Cursor/shares never decrease on refund, expiry or sync. Sum all historic shares=F(lifetimeGross). |
| Membership access | Existing durable tokenId/wallet, checkpoint, paidSeconds, grantSeconds, occupied flag | Preserve paid-first access, capacity and credential rules. Access restoration does not itself enable rewards. |
| Funding generation | tokenId, monotonically increasing generation, funded-lot head/tail indexes, allocated gross/four-allocation totals, completed gross/four-allocation totals | One live generation per token. Cancel invalidates in O(1); old generations remain historical state without live nodes. No array clearing loop. |
| Funded lot | tokenId/generation/index, uint64 start/end, uint112 raw gross/allocations/prefixes, original referrer | Seven storage words; all raw values fit the existing lifetime gross cap C. Only positive gross creates a lot. Ordered nonoverlapping paid intervals. Future start may follow a zero-value gap. Referral identity fixed at payment. Four allocations sum exactly to gross. Public views widen raw values to their existing uint256 types. |
| Scheduled node | tokenId, uint64 timestamp, START/END; heap position lookup | Two storage words; generation/head are read from the member's live funding account. At most one node per member. Keys ordered timestamp then tokenId. Cancellation removes the node before changing generation. Processing verifies the boundary against the current head, then replaces the root with that member's next boundary or removes it. Removal O(log M); no dangling canceled endpoint. |
| Active funding head | Lot reference, four rates/tails or equivalent deterministically computed values | Rate=floor(A*Q/d), tail=A*Q-rate*d. Only one active paid lot per member. Head awaiting START has zero earned funding. |
| Global accounting | accountedThrough, indexed heap, four aggregate active rates, creator/protocol/member/referral aggregate earned/reserved totals | Advance through chronological boundaries. At same timestamp, completeness requires processing every due event, even if time itself already equals now. |
| Referrer ledger | wallet, active scaled rate, credited scaled amount, last settled effective time | Settle at every affected START/END/refund and before reading/claiming against finalized time. Multiple members may refer to one wallet. No membership eligibility requirement. |
| Reward distribution epoch | rewardPerShare index, division carry, total eligible shares | Epoch means unchanged eligible weight vector, not elapsed period. Processing and claims do not end an epoch. Flush remainder only on real vector change. |
| Member earned account | tokenId, eligible flag, last index, creditScaled | Credit retains sub-raw-unit remainder after claim. On suspension settle first; on restoration reset index before restoring historical weight. Durable wallet can claim after NFT burn. |
| Protected reserves | Four unearned allocation totals, four cancellation-rounding totals, unassigned earned member funding, reward-index distribution dust, fractional earned credits | Each unit has one owner/purpose. Cancellation dust and unassigned funds have no administrative withdrawal. Fractional earned credit remains claimable when enough further credit accumulates. |
| Transfer counters | Received gross, creator/member/referrer paid, protocol released, refunds, external donations | Raw transfer counters plus scaled balances reconcile exactly. Donations are distinct from allocated member funding and retain existing surplus policy. |

C=`2^112−1`, Q=`2^128`. No separate normalization price, automatic-expiry queue, purchase-time recipient snapshot, per-member future guaranteed reward, compatibility generation, or refund-top-up account is introduced.

## Payment and Queue Semantics

1. Validate pricing mode, input capacity, timestamp/prepayment limits and curve bounds before accepting funds. Bring accounting through now before changing funding or weights. All due events at now precede the mutation.
2. Checkpoint the recipient's existing access. Capture remaining paid seconds before appending. The new lot's start is now plus those seconds; grants do not delay purchased service.
3. Validate/lock referral under existing rules, perform exact transfer, and split gross: protocol/reward/referral floor by BPS; unused referral and initial split residue go to creator. Capture original referral destination in this lot.
4. End the old reward epoch once for the resulting eligible-vector change, settle the affected member, restore historical eligibility if positive, and issue the new permanent shares. No new money has yet earned at this timestamp.
5. Append the funded lot/prefix totals and reserve all four allocations. If no current node exists, activate a lot starting now or insert its future START. An active or waiting predecessor retains its schedule.
6. Zero contributions append access only, issue no shares, and do not restore suspended eligibility. They can create a gap before a subsequent funded lot. Grants remain separate access time.

A positive payment during granted access starts purchased service now. A positive payment during an existing free purchased period waits behind that period. Both restore suspended reward weight immediately, as required.

## Chronological Processing

For the next boundary t, integrate aggregate rates from accountedThrough to t. Update creator/protocol totals and the member index; aggregate referral earned totals also advance. Referrer-specific credits are lazy, but their rate changes settle at t using the old rate first.

At START activate rates. At END recognize all four tails, credit the original referrer, remove old rates, mark completed prefixes and select the next funded lot. A next lot starting at t activates immediately; a later lot gets a START node. Same-time events earn no additional elapsed-time money. A bounded call can stop between equal-time events, but economic mutations remain blocked until all events due through now are complete.

After the last permitted boundary, either report incomplete or, if no due event remains, integrate the last interval through now. Free periods have no rates and no nodes. A processed endpoint is removed/replaced, so a later call never repeats finalized work.

Within one processing call, accumulate the four interval/tail totals in memory and commit global liabilities once before returning. There are no external calls or eligibility changes during processing. With constant eligible shares W, distributing the sum with the existing carry yields exactly the same quotient and remainder as distributing each interval in order. Referrer clocks and rates still settle at each affected boundary. Partial batches commit only the work actually completed; they do not integrate beyond an unprocessed due boundary.

## Eligibility Transitions

| Trigger | Historic shares | Eligible weight | Previously earned claims |
|---|---|---|---|
| Positive purchase/contribution/allowed paid gift | Add current curve issuance | Restore old shares and include new shares | Settle/preserve; no suspended-interval backfill |
| Natural expiration | Preserve | No change | Continue earning until an explicit suspension |
| Creator sync of expired membership | Preserve | Settle through transaction time, then remove | Preserve after credential burn |
| Refund | Preserve | Settle, cancel future funding, suspend | Preserve all beneficiaries' earned value |
| Zero contribution or grant while suspended | Preserve | Remain suspended | Preserve |
| Free extension while eligible | Preserve | Remain eligible, even after natural expiry | Preserve and continue earning |
| Final grant-only revocation with no paid time | Preserve | Settle then suspend | Preserve |
| Claim, accounting processing, ownership change, pause | Preserve | No change | Claim transfers whole earned units; remainder survives |

Ending an epoch means (1) accrue prior funding, (2) protect remaining index division carry, (3) settle changed member(s), (4) change vector and initialize relevant indexes. For a batch at one timestamp, no money earns between its changes. Unchanged total W is insufficient to preserve carry if the identity/weight vector changes.

## Refund Transition and Conservation

Catch up through now. A waiting head is entirely future funding. Otherwise compute active unused gross using floor division, then add complete future gross from prefixes. This is the existing gross unused-paid-time entitlement, including variable PWYW payments.

For each purpose i, compute `U_i = allocated_i*Q - completed_i*Q - activeEarned_iScaled`. Remove the active rates and one node, invalidate the generation, and reset paid/grant access under existing refund behavior. Deduct refund*Q from U in the defined creator/member/referral/protocol order. Protect any residual by original purpose, suspend eligibility, then transfer to the fixed recipient. Any failure reverts all effects.

The four refund components are scaled bookkeeping values; their sum is exactly raw refund times Q. The token transfer is one raw integer amount. Client displays may floor individual components but must not imply their independently rounded displays are the exact sum. Expose canonical scaled values and Q for independent reconciliation.

A completed cancellation has no live rates/node/future liability for that generation. Historical event/lot records and shares remain. No owner allowance, top-up or another membership's balance participates.

Refund previews distinguish current-block access (`accessAsOf`), settled accounting (`accountingAsOf`) and financial quote time (`fundingAsOf`). With no global boundary due, `projected=true` computes only the selected member's refund at the current block using its unchanged head/prefixes. Settled completeness and all earned/reserved storage remain unchanged. At a pending boundary, projected=false and fundingAsOf=accountingAsOf; financial amounts are historical and require catch-up. Free/grant changes can update access while accounting is behind; current access cannot be reconstructed at an older cursor from the access checkpoint alone.

## Core Invariants

- Every lot: sum(allocation raw)=gross; rate_i*d+tail_i=A_i*Q; recognized never exceeds allocated.
- Every generation: completed lots precede the head; future lots do not overlap; only the head may be partially consumed.
- Heap node count <= memberships with live funded service; indexed positions and generation/head references agree.
- Aggregate active rates equal the sum of active head rates. Referrer rates equal their originating active lot rates.
- Eligible total equals sum of eligible permanent shares. Reward-index carry is less than W when W>0; carry is zero when W=0.
- Issuance equals the difference of the canonical cumulative function; lifetime gross never decreases and never exceeds C.
- At every finalized time: received gross*Q equals completed payouts/refunds/releases*Q plus all unearned amounts, earned credits/liabilities, index carry, distribution dust, unassigned funding and cancellation reserves. Do not double-count a member credit and its aggregate reward reserve: the former decomposes the latter.
- Contract token balance*Q covers all current internal liabilities; external donations explain any surplus separately. Protocol transfers to the vault reduce tier liabilities and increase vault liabilities once.
- No claim or release spends unearned or protected cancellation funding. No canceled generation earns again.
- Economic-equivalent histories with different processing/claim frequency have identical scaled entitlements plus prior payouts. Ideal continuous attribution differs only within the bound in research.md.

## Combined Advance Outcome

The router orchestrates existing tier/vault state; it introduces no second accounting cursor. Calls share a bounded accounting-step budget. Every attempted failure reverts the whole transaction. Known buyback ineligibility is skipped with a reason. Separate accounting-only and buyback-only entrypoints allow independent progress. Count completed funded boundaries, positive newly recognized earnings, positive releases and completed eligible purchases. Idle cursor motion is not useful work. Report the actual caller and monetary amounts by asset. Worker entitlements, reimbursement and incentive balances are outside this version.

## Data Removal and Version Boundary

Replace old `FeeAccount`, protocol-only lot handling, redundant zero-price refund cursor and upfront creator/member/referral credits in the new implementation. Existing public tiers are immutable and remain untouched. Preserve useful public concepts such as durable token identity and the vault's earned-fund transfer interface; do not preserve obsolete method signatures as adapters. Generate all frontend ABI/types from the new artifacts.

## Currency minimums

Factory currency records contain a positive uint112 raw minimum controlled by the existing owner. A tier captures the current value immutably at publication. No per-purchase oracle or retroactive minimum changes exist. Fixed prices are checked per period; positive PWYW is checked per contribution before catch-up or transfer.

### Read-only projections

`AccountingPreview` contains `asOf`, `processedSteps`, `earnedDeltaScaled[4]`, `settled`, and `current`. Both balance snapshots retain whole raw amounts, fractional remainders and accounting status. `current.status.complete` means the read reached `asOf`; it does not mean storage was advanced. Partial results are accurate only through their returned cursor. Allocation deltas precede member reward distribution rounding and are not interchangeable with personal payout deltas. No preview writes storage or transfers tokens.
