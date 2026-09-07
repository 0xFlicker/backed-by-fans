# Protocol interface contract

These are planned external surfaces and semantics, not compiled ABIs. Implementation must generate
application bindings from actual Foundry artifacts through the existing Wagmi pipeline. Changes replace
the old deployment interface; no backward compatibility methods are required.

## Membership interfaces

- Extend `TierConfig` with `uint16 protocolFeeBps`, and `TierTermsConfigured` with its published value.
- Tier `protocolFeeBps()` becomes an immutable-value `view` getter, not the current constant `pure` getter.
- Expose factory `minProtocolFeeBps=100`, `maxProtocolFeeBps=10_000` only if useful to existing clients;
  never expose a misleading single protocol rate. Client validation cannot replace contract validation.
- Factory `buybackVault()` and `protocolToken()` identify immutable destinations; tier exposes its
  snapshotted vault. Existing `createTier`, registry, ownership and membership actions remain.
- Remove factory `feeRecipient`, `setFeeRecipient`, `withdrawProtocolFees` and related obsolete events,
  errors, CLI actions, reconciliation and UI state. Keep unrelated creator/referral/reward withdrawal paths.
- Retain `setPaymentTokenEnabled`, listed/enabled getters and paginated enumeration. Only the Safe may
  change eligibility. Disabling affects new publication only.

## Earned fee collection

The tier retains protocol allocations and exposes bounded accrual/collection and funding previews
specified in [fee-accrual.md](fee-accrual.md). `accrueProtocolFees(tokenIds)` checkpoints1–100 members;
`releaseProtocolFees()` exact-transfers only checkpointed earned-held fees to the immutable vault.
Add `protocolFeeState`, paginated current fee lots and refund-component preview. Keep existing gross
refund/top-up outputs but calculate top-up after reserve contribution; emit protocol/creator/top-up
funding components. The current ERC721 owner requirement does not apply to fee collection from expired
or synchronized historical member IDs. No payment directly releases unearned fees.

## Vault public surface

| Proposed call | Authority | Contract outcome |
| --- | --- | --- |
| `recordEarnedFees(uint256 amount)` | Registered tier only | Derive calling tier's payment asset; record backed exact transfer of earned fees atomically with release |
| `syncDonation(address asset)` | Anyone | Credit only unaccounted backing balance as donation; no source relabeling or custody movement |
| `inventory(address asset, SourceBucket bucket)` | Read | Available raw amount and cumulative attributable accounting |
| `process(address asset, SourceBucket bucket, uint256 amountIn, uint64 expectedRevision, uint64 deadline)` | Anyone | One bounded atomic conversion/purchase/burn or complete revert |
| `processingStatus(address asset, SourceBucket bucket)` | Read | Non-market eligibility, current revision, available inventory, pause/policy/lifecycle conditions |
| `route(address asset)` / `policy(address asset)` | Read | Typed route, per-leg floors, validity, budget consumed, evidence hash |
| `setRoute(address asset, TypedRoute route)` | Factory's current Safe | Validate supported pool identities, increment revision, invalidate old policy |
| `setPolicy(address asset, ExecutionPolicy policy)` | Factory's current Safe | Validate hard bounds, authorize explicit new revision/budget, emit complete policy identity |
| `setBuybacksPaused(bool paused)` | Factory's current Safe | Global processing control, preserving accounting/revision/budget |
| `setAssetBuybacksPaused(address asset, bool paused)` | Factory's current Safe | Per-asset processing control, independent of onboarding |

`SourceBucket` has exactly `Membership` and `Donation`. Zero asset is native ETH vault inventory only;
zero address is never accepted as a tier ERC-20 payment asset. Direct protocol-token processing has no
route requirement; use revision zero and enforce the explicit direct-burn branch's pause/balance checks.
No caller recipient, generic router payload, custom arbitrary target or refund address is accepted.

`processingStatus` must not promise that an external swap will succeed; market estimates/simulation
remain potentially stale. Do not convert missing RPC data into a benign contract status.

## Fixed execution boundary

The immutable executor exposes a typed vault-only execution entrypoint returning measured consumption,
leg outputs and residuals. Its constructor fixes protocol token, Pons factory, verified exchange/router
and WETH wiring; validates code and relationships. Deployment uses one fixed supported implementation.
Safe route updates change validated pools and policies, not code or arbitrary target addresses.

The executor internally encodes exact-input swaps with fixed recipients and refunds. It takes only the
currently reserved vault budget. Verify exact transfer into/out of executor; return all unused assets
in the same transaction. Reentrancy guard, callback sender/context checks and exact balance postconditions
apply across all legs. Disable command-level partial failure. No funds may persist in executor/router
as the result of a completed settlement. Clear ERC-20 and Permit2 allowances after execution where used;
a retained authorization is a failed postcondition even if current balances are zero.

Curve entrypoint: verified `buy(uint256 quoteIn,uint256 minTokensOut,address recipient)` payable.
Use actual recipient-sensitive launch tax; wait while penalty is nonzero. Ordinary fees remain.
Graduation: verified factory `graduate(address token)`, then `createGraduatedPool(address token)` as
needed. Anyone may call these directly; the runner invokes only when canonical state requires them.
Return to a fresh lifecycle read before buying. No privileged graduation route or rewritten external check.

Interface artifact imports must follow verified deployed source, including actual `TokenParams`,
`previewLaunchEconomics`, lifecycle getters and pool descriptors. GitHub's currently incomplete curve
must not be copied into a substitute interface test that omits deployed tax/launch supply behavior.

## Events and accounting contract

Provide events for:

- Tier `ProtocolFeeAllocated`: member/generation/lot, asset, fee and paid-clock schedule.
- Tier `ProtocolFeesAccrued`: member/generation, newly recognized and cumulative earned amount.
- Tier `ProtocolFeesReleased`: asset and exact earned amount transferred.
- Tier refund funding: protocol reserve contribution, creator contribution, owner top-up and any
  cancellation rounding; current generation closes atomically.
- Vault `EarnedFeesReceived`: tier, original asset, exact released amount. This is not a new payment.
- `DonationRecorded`: asset and newly recognized amount.
- `RouteConfigured`: asset, new revision, complete typed route or complete data plus content hash.
- `PolicyConfigured`: asset, revision, limits, expiry, per-leg rate identity and evidence hash.
- Global and per-asset pause changes.
- `ConversionSettled`: settlement sequence, source bucket, input/output assets, actual consumption,
  output and residual, route revision.
- `BuybackBurned`: settlement sequence, source bucket, input attribution, purchased amount, burned
  amount, actual lifecycle, protocol token and revision.
- `DirectBurned`: asset/protocol token, source bucket and amount.

Do not derive cumulative member fee receipts from bare balances or conversion outputs. Event ordering
must support independent reconciliation when a single call emits several conversions and one burn.
Supply reduction is measured; the burn event is not its own proof. Reverted calls emit no durable outcome.

## Public product contract

Creator Studio exposes a percentage input from1–100, default1, two decimal percentage places. The
preview displays creator/reward/referral/protocol shares before publication; rejects invalid totals;
100% explains zero creator proceeds and reserved backing for unused-time gross refunds. Explain
continuous earning, periodic collection/buybacks and that membership access starts immediately. Stored drafts restore the selected
fee or require an explicit new valid value; no obsolete global fee fallback for published tiers.

The public protocol route identifies chain, Safe, token and current read block. Separate per-asset
allocated fees, unearned reserves, earned-unreleased/released inventory, refunds, donations, actual burned tokens and external Pons compensation.
Earned awaiting release includes projected uncheckpointed earnings plus checkpointed earned-held;
show the checkpointed amount immediately releasable distinctly. Stored and projected conservation use
the definitions in [fee-accrual.md](fee-accrual.md), with a common block and matching population coverage.
Show conditional24h/7d/30d earning forecasts in original payment units with read timestamp and
pagination coverage; never promise a future number of tokens burned. Configuration/history is readable without a wallet; processing requires the normal wallet transaction
flow. A successful membership receipt means membership success regardless of pending burns.

Pagination and completeness/error states are explicit. Pons-only vesting data can be unavailable without
hiding verified BBF inventory. Browser tests include accessibility via the existing axe harness,
keyboard fee entry, narrow-screen review, wrong network and transaction rejection/replacement.
