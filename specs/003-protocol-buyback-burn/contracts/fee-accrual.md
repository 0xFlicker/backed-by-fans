# Continuous protocol-fee accrual and refunds

**Decision**: User-approved extension to this feature. Protocol allocations earn over consumed paid
membership time; periodic collection and buybacks use only earned fees. Creator, reward and referral
allocation/claim timing remains unchanged. This replaces upfront fee transfer, not Pons's swap/burn flow.

## Custody and lifecycle

At payment, calculate `F = floor(gross × protocolFeeBps / 10_000)` exactly as specified. Keep F in the
tier as a protected protocol reserve. Issue all purchased membership time immediately. Do not transfer
F to the buyback vault, expose it to creator claims or call any market during payment/refund.

As paid time is consumed, F transitions from unearned to earned. Earning is mathematical entitlement
at the current chain timestamp; no scheduled transaction or running keeper is needed for time to count.
Permissionless checkpoints materialize that entitlement. A separate public release transfers earned
held fees to the immutable vault. Buyback pauses and expired policies do not block checkpoint/release.
An external transfer failure may block release but must not block local accounting or refund logic.

The vault receives only earned releases. It cannot spend or refund tier-held reserves. Its existing
process/price/pause/budget model remains unchanged. Donations sent to the vault have no membership
schedule. A protocol-token membership also earns over time; only released tokens can burn directly.

## Per-member paid clock and lots

Each membership has a current accounting generation, consumed-paid clock C and append-only fee lots.
A purchase lot stores `startPaid`, `endPaid`, fee F, and cumulative allocated-fee prefix. One fixed-price
purchase of 12 periods creates one lot of duration `12 × periodDuration`; a variable contribution creates
one period with its own gross and fee. Preserve per-purchase fee rounding rather than merging gross
amounts and calculating a different fee later.

Before time additions, refunds, expiry synchronization or any existing time checkpoint, derive consumed
paid seconds through the existing paid-first membership clock. Increment C by consumed paid seconds only.
Free grant consumption does not advance C. A zero-gross contribution does add paid duration: record a
zero-fee lot or preserve its explicit start/end gap; later paid fees must not earn during that gap.
New paid time is queued after existing paid time and before complimentary time, preserving current behavior.

For a lot with duration D and consumed portion `c = clamp(C − startPaid, 0, D)`:

- `earnedTotal = floor(F × c / D)`; at c=D the result is exactly F.
- `unearned = F − earnedTotal`.
- Newly recognized earnings are the difference between cumulative entitlement and already recognized
  entitlement, not the sum of independently rounded time increments.

For each generation, binary-search ordered lot ends. Prefix fees account for all completed lots; at
most one lot is partially consumed. Future lots earn zero. This gives O(log n) projection/checkpoint
rather than a loop over the member's entire purchase history. Checked arithmetic and exact raw units
apply. UI multipliers never enter the calculation.

Maintain a tier-level checkpointed earned-held balance, total protected protocol holdings, cumulative
allocated, cumulative released, cumulative protocol refund contributions and cumulative cancellation rounding.
The available tier balance must cover creator proceeds, reward/referral liabilities and **all** protocol
holdings, even when some earnings have not been checkpointed. Do not derive spendable funds from a bare
balance. Projection cannot mutate balances; checkpoints update earned-held without external calls.

Use these distinct accounting quantities:

- **Protected holdings H**: all protocol fees still held in the tier, stored independently of its bare token balance.
- **Checkpointed earned-held E**: recognized earnings still held and immediately available for release,
  including explicitly attributed cancellation rounding.
- **Uncheckpointed earnings P(t)**: additional paid-time earnings projected at timestamp t beyond what
  has already been recognized. This is a calculated view, not continuously updated storage.
- **Unearned reserve U(t)**: `H − E − P(t)`, the current unused-time protection. Time alone reduces
  this projected reserve and increases P(t), without changing stored H or E.

In this document, stored `earned-held` means E. Total earned awaiting release is `E + P(t)`;
only E can be released before another checkpoint. Recognition moves P(t) into E without changing H.
Release decreases H and E equally and increases cumulative releases. Cancellation rounding is not
paid-time earning and must never be added to P(t).

## Refund sequence

Preserve the existing gross unused-paid-time refund G, recipient, owner-only refund authority and
caller ceilings. At the same execution timestamp:

1. Checkpoint consumed time and protocol earnings locally; calculate the generation's unearned U.
2. Calculate `protocolContribution = min(U, G)`.
3. Calculate `creatorContribution = min(creatorProceeds, G − protocolContribution)`.
4. Calculate `ownerTopUp = G − protocolContribution − creatorContribution`; apply existing gross/top-up
   caller ceilings to these current values.
5. Cancel the remaining paid/grant time and close the generation. Remove the complete U liability,
   allocating protocolContribution to the refund and any `U − protocolContribution` to explicitly
   labeled cancellation rounding. Under FIFO/current gross rules the latter is at most one raw unit;
   prove this property in the independent model. Rounding is not reported as time-consumed earnings.
6. Keep already earned-held or released fees dedicated to burns. Pull only ownerTopUp, send exactly G
   to the existing refund recipient, and emit all funding components. Any failure reverts every change.

At 100%, fee equals gross for every lot. Conservative earned rounding leaves enough reserve to cover
the existing floor-rounded gross refund, so ownerTopUp is zero for unused paid time. At lower rates,
creator/reward/referral allocations retain their old timing; the reserve reduces the remaining funding
need but does not guarantee a zero top-up. No earned-fee clawback is introduced merely because the
runner has not collected yet.

Example: gross120, duration12 periods, fee12 at10%. After3 periods, earned3/unearned9. Gross refund90
uses9 protocol reserve and81 creator proceeds/top-up. At100%, earned30/unearned90; reserve funds all90.
For half-period cancellation, apply the same consumed-seconds formula rather than a period-end cliff.

## Generation reset and bounded work

Refund/rejoin starts a new logical generation; old lots cannot accrue or release again. Reset indices
and counters logically, retaining history under prior generation keys instead of clearing an unbounded
storage array. Apply the same generation isolation to the existing variable-contribution gross-prefix
refund storage: `_appendZeroRefundLot` currently deletes its prior dynamic array and must not remain
an unbounded refund→rejoin cleanup path. Preserve the existing gross refund results.

Collecting earned fees does not require a currently owned/live NFT. Expired or synchronized/burned
credentials still have paid-time accounting and may have uncollected earnings. Renewal after complete
consumption checkpoints old earnings before starting another schedule; no earned-held balance is lost.

Proposed interfaces:

| Call | Semantics |
| --- | --- |
| `protocolFeeState(uint256 tokenId)` | Project allocated, current unearned, total earned entitlement, refunded/rounding totals and generation at current block |
| `protocolFeeLots(uint256 tokenId,uint256 offset,uint256 limit)` | Current generation's bounded lot page; limit≤100; full starts/ends/prefixes for forecast |
| `accrueProtocolFees(uint256[] tokenIds)` | Anyone; length1–100, O(log lots) each; idempotent local accounting, no external calls |
| `releaseProtocolFees()` | Anyone; exact-transfer all checkpointed earned-held amount in this tier to its immutable vault, then authenticated `recordEarnedFees(amount)`; no member scan |
| Existing `previewRefund` | Retain existing gross/top-up outputs with revised top-up; add a component preview for explicit protocol/creator/top-up display |

Member views report earned entitlement; earned-held and released totals are tier-level because one
release transfers aggregate earned funds without visiting members. Do not invent per-member transfer
attribution or add a release-time member scan.

Vault `recordEarnedFees` accepts only registered tiers, derives the asset and verifies credited backing.
It emits `EarnedFeesReceived`, not a second membership-payment event. Release transfer and receipt are
atomic. An amount of zero is a no-op with no fabricated fee receipt. All mutations retain reentrancy and
exact-transfer checks. A stale caller cannot bypass entitlement by requesting a larger release.

Runner discovery reuses registered tier and historical member IDs with pages of at most100. Each sweep
fixes a finite discovery range at its starting block and keeps in-memory tier/member cursors. On each
tier visit it advances one page, then rotates round-robin to the next unfinished tier. New tiers and
members outside the captured range join the next sweep; they cannot restart the current sweep.
Expired credentials remain in the traversal. A blocked release or asset is reported without resetting
other cursors. With successful discovery reads and uninterrupted execution, every captured member is
examined within `sum(max(1, ceil(capturedMemberCountPerTier / 100)))` tier visits. A failed discovery
read remains an explicit incomplete page, not a completed sweep. The exact scheduling and restart
contract is in [operations-and-evidence.md](operations-and-evidence.md).

The runner checkpoints pages, releases checkpointed earned-held balances, then processes eligible
vault inventory without waiting for the complete population sweep. No single onchain call scans all
tiers/members; no global mutable per-second loop, calendar scheduler or mandatory indexer is added.
Restart may reset discovery cursors; canonical entitlement and balance reads prevent duplicate releases.
The two-interval replacement target uses its bounded eligible fixture, not a population-wide60-second
collection guarantee. Fairness across a complete sweep assumes the runner remains available.

## Views, forecasts and evidence

Show unearned/reserved U(t), total earned awaiting release `E + P(t)`, the checkpointed amount E
immediately releasable, released awaiting buyback and actual spent/burned amounts separately, per
payment asset. Forecast additional earning over next24h/7d/30d from existing
paid schedules, including a current-block timestamp and page coverage. Future refunds/cancellation
reduce the forecast; it is not guaranteed buyback execution or a token-price projection. Incomplete
pagination must say partial coverage rather than displaying a complete global total.

Independent stored-balance conservation, valid even when no collector runs:

`allocated fees = H + cumulative releases + cumulative protocol refund contributions`

Projected decomposition at one timestamp and for the same accounting population:

`H = U(t) + P(t) + E`

Thus projected conservation includes both uncheckpointed and checkpointed earnings. Cancellation
rounding is already included once in E or cumulative releases; its separate reporting total is not
another term. Full-tier H/E must not be mixed with projections from only a partial member page.
Paginated public views expose projection coverage and do not assert full-tier projected reconciliation
until the complete population is covered at the same block. Per-member views still do not invent
per-member release attribution. Released funds reconcile in the vault's separate conversion/burn ledger;
never add a tier release to a payment again when aggregating protocol revenue.

Required stopped-collector example: gross120,12 periods, fee12 at10%, at the timestamp after3 periods:

| State | H: protected | U(t): unearned | P(t): uncheckpointed earned | E: checkpointed earned-held | Cumulative releases |
| --- | --- | --- | --- | --- | --- |
| Before any checkpoint | 12 | 9 | 3 | 0 | 0 |
| After checkpoint at the same timestamp | 12 | 9 | 0 | 3 | 0 |
| After release at the same timestamp | 9 | 9 | 0 | 0 | 3 |

Before checkpointing, public earned-awaiting-release is3 while immediately releasable is0. Both
equations must hold before and after each operation, not only after a collector materializes earnings.

Required tests: checkpoint-frequency independence;12-period example and fractional periods; zero and
100% raw-fee outcomes; variable contribution lots; gifts/renewals; free-grant and zero-gross clock gaps;
owner/artwork changes; stopped collector; release/refund races; cancellation rounding≤one raw unit;
refund/rejoin generation isolation; no unbounded cleanup; expiry/burned-credential collection; exact
transfer failures; stored/projected conservation and UI values before checkpointing; multi-tier
collector sweeps with more than100 members and eligible expired IDs on later pages; cursor wraparound,
new arrivals and restart without duplicate releases; and previously burned earned fees with fully
backed100% unused-time refunds.
