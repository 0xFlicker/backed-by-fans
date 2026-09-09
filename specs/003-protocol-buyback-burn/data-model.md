# Data model: Protocol buyback and burn

All addresses are chain-scoped. Amounts are unsigned raw units. ERC-8056 display multipliers are
presentation data and never modify these balances. This document describes the new deployment only.

## Factory and protocol identity

- `factory`: existing official-tier registry and single authority source.
- `owner`, `pendingOwner`: existing two-step authority, constrained to validated Safe accounts.
- `protocolToken`, `buybackVault`, `executor`: immutable deployment identities, discoverable onchain.
- Existing `mediaStoreFactory`, renderer schema, creator salts and tier identity mappings survive.
- Payment-token records retain address, listed index and enabled flag. Disablement is not deletion.
- Remove global `protocolFeeBps`, `feeRecipient` and factory fee-withdrawal records/APIs.

Create the protocol token before constructing the factory/vault; paid membership collection cannot
begin with an unset or replaceable token. Runtime metadata includes source/creation hash, immutable
arguments and deployment transaction. Initial fee inventory is zero.

## Membership tier and allocation

Add immutable `protocolFeeBps:uint16` to existing tier configuration and emitted terms. Range100–10,000;
protocol+reward+referral≤10,000. Payment token, price, period and existing economic identities stay fixed.
Creator ownership transfer carries artwork/control rights but cannot rewrite economics. Vault identity
is snapshotted at construction.

For each positive gross payment, independently floor protocol, reward and applicable referral
amounts; creator receives the residual. Absent referral allocation remains creator residual. Zero gross
has no fee. Keep membership time, gross refund entitlement, supporter reward shares and referral locks
intact. Reserve the protocol allocation inside the tier and earn it continuously over consumed paid
time. At100% all other splits are zero; unearned protocol reserves fully fund unused-time gross refunds.

## Fee accrual and refund backing

Each member has a consumed-paid clock and current generation of fee lots: paid-clock start/end,
allocated fee and cumulative fee prefix. Earn each lot as floor(fee×consumed/duration), with full fee
at full consumption. Checkpoint cumulative entitlement, never independently rounded deltas. Ordered
lot endpoints and prefixes support O(log n) projection; zero-fee paid intervals still advance the clock,
while free grants do not. Renewals/gifts queue paid duration under existing paid-first rules.

Tier fields separately track total protected protocol holdings H, checkpointed earned-held fees E,
allocated totals, released totals, reserve-funded refunds and cancellation rounding. Uncheckpointed
paid-time earnings P(t) and current unearned reserve U(t) are projected views, not continuously updated
storage. Stored conservation is `allocated = H + released + reserve-funded refunds`; at one timestamp
and matching population, `H = U(t) + P(t) + E`. Total earned awaiting release is `E + P(t)`, while only
E is immediately releasable. Cancellation rounding is included once in E/released, separately reported
and never included in P(t). Partial member projections cannot be reconciled against full-tier totals.
Public checkpoints are bounded; release sends only checkpointed earned-held funds to the vault.
Expired/burned credentials remain collectible.
Logical generation reset isolates canceled history and replaces unbounded variable-refund array cleanup.

Refund protocolContribution=min(unearned,grossRefund), then consume creator proceeds and owner top-up.
Any unused protocol remainder after cancellation is at most one raw unit under the stated rules and is
explicit cancellation rounding credited to earned-held funds. No earned fee is reclaimed. The full
formulas and storage/operation boundaries are in [fee-accrual.md](contracts/fee-accrual.md).

## Fee inventory

Key: `(chainId, vault, asset, sourceBucket)`; asset zero denotes native ETH inside vault custody only.
`sourceBucket` is `membership` or `donation`.

Fields:

- Available raw inventory.
- Cumulative earned releases, accepted only from registered tiers in the original payment asset; these
  are transfers of previously allocated fees, not new membership payments.
- Cumulative synchronized donations, separately identified.
- Cumulative conversion input spent/output received, by actual asset.
- Cumulative direct protocol-token burns and purchased protocol-token burns, by source bucket.

Per-asset conservation: opening inventory + earned releases + donations + conversion outputs = closing
inventory + conversion inputs + direct burns. A swap's input includes venue fees; do not debit fees
again. Purchased protocol output is reconciled separately to supply reduction. Each event attributes
both sides of a conversion and the settlement identity. Native ETH refunds reduce actual spend.

One call processes one bucket. Unused converted ETH retains its original source bucket. Creator,
reward/referral liabilities and unearned protocol reserves live in tiers and are never part of the
vault budget. Tier releases link the accrual ledger to vault custody without double-counting revenue. Bare balances
are not automatically membership receipts; untracked balances can be synchronized as donations only
when not reserved by an active settlement. No withdrawal entity exists.

## Route and policy

Key: `(vault, inputAsset)` with strictly increasing revision and explicit configuration history.

- Typed conversion path: zero to two supported verified exchange legs into native ETH.
- Pool identities: manager, ordered currencies, fee, tick spacing and hook as applicable.
- Final Pons lifecycle integration is fixed; protocol token and destination recipient are not configurable.
- Per-leg positive raw reference numerator/denominator and tolerance.
- Validity interval, batch cap, finite input budget and spent budget.
- Evidence hash and published evidence reference; public Safe transaction provenance.
- Global and per-asset processing pauses, independent of payment-token onboarding.

Validation and initial/hard limits are defined once in [buyback policy](contracts/buyback-policy.md).
Budget is monotonic within a revision. Pause/resume does not reset it. New explicit economic revision
can authorize a new budget; lifetime spending remains observable. Route replacement invalidates old
policy and in-flight expected revisions. Direct protocol-token burns need no market rate.

## Processing settlement

Identity: chain, vault and monotonically increasing settlement sequence, linked to transaction hash.
Inputs: asset, source bucket, bounded offered input, expected revision, caller deadline.
Outputs: actual input consumption, each conversion leg, original/intermediate residuals, protocol
tokens acquired, protocol tokens burned, lifecycle, source attribution and revision.

State transition is atomic: available → executing → committed, or complete rollback. `executing` is
transient reentrancy-protected state, not a durable queue item. Pending inventory remains available
until an executable transaction settles; there is no per-member buyback job or guaranteed burn date.

Events support independent reconciliation. Current status is computed from active policy, lifecycle,
inventory and simulation; a revert creates no persistent success/failure record in vault storage.

## Launch and external compensation

Launch identity includes Pons factory/version, preset, token, curve, actual ETH pairing, launch fee,
expected economics hash, developer purchase consideration/output and launch timestamps. Discover
addresses from authentic events and reads, never a naming convention.

Lifecycle: `Bonding` → `Ready` → `Swept` → `PoolActive`. Crossing buy may advance some phases itself;
read current state, do not infer from a purchase receipt alone. Failure can leave a retryable earlier
state. Pool key includes native ETH currency and actual Pons hook. Launch tax is recipient-sensitive.

Pons compensation is a separate external read model: creator recipient, external owner/operator,
buyback-enabled state, trading fees awaiting sweep, creator ETH escrow, vault vested/unvested balances,
release schedule, both beneficiaries' released amounts and claimed amounts. Later vesting tokens are
not initial purchased holdings or membership burns. External recipient/toggle changes are history,
not changes to BBF membership custody.

## Environment evidence

Run identity: source commit + tool/dependency pins + origin chain/block/hash + local chain ID + run ID.
Record archive-read results, exact runtime hashes/constructor data, external roles, Safe owners/threshold,
local deployments, launch/configuration/graduation/processing receipts, independent ledgers and supply
checks, runner funding/actions and successful browser traces/screenshots.

Artifact classes are `source`, `synthetic`, `authentic-fork`, `simulated-external-participant` and
`browser`. Distinguish failure injections from untouched market/permission state. Retained artifacts
outlive the fork. Never include real private keys, archive credentials or temporary public broadcasts.


## Deferred token binding (approved replacement)

The vault address and burn purpose are fixed at deployment. `protocolToken` and
`executor` are both zero until a one-time Safe-authorized factory call binds a
validated token and creates its executor atomically. The factory token getter
reads the vault; there is no duplicate token registry. Both values are nonzero
after successful binding and cannot be changed again. A mixed pair is invalid.
Existing constructor deployment with a nonzero valid token binds immediately.

Unbound status is `TokenNotLaunched`. Native ETH's zero-address asset identity
must never be mistaken for the absent protocol token. Collection and inventory
accounting work before binding; all market and direct-burn processing is blocked.
Route configuration waits for a bound integration. Historical statements above
requiring token launch before all membership payments are superseded by this
section and [the approved scope](deferred-token-launch.md).
