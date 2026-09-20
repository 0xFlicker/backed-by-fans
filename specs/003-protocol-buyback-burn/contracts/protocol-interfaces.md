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

## Vault and module public surfaces

The current implemented selectors come from generated Foundry bindings. The
permanent vault exposes `recordEarnedFees(uint256)`, `syncDonation(address)`,
`inventory(address,SourceBucket)`, `setBuybacksPaused(bool)`, and
`process(address,SourceBucket,uint256,uint64,uint64,bytes)`. Processing takes
module revision, deadline and opaque module data; it always ends in a measured
burn. Direct token burns use the current module revision and enforce the global
pause. Source buckets remain Membership and Donation; WETH custody is normalized
to native inventory. There is no caller-selected terminal recipient.

`activeModule`, `activeModuleCodeHash`, `moduleRevision`, pending governance
commitments and `moduleReplacementFrozen` expose module identity and replacement
state. The Safe alone proposes/cancels/activates a replacement with a 48-hour
delay, or proposes/cancels/finalizes irreversible replacement freeze with a
seven-day delay. Activation and finalization require paused buybacks. Activation
leaves the vault paused. Full selectors, commitment semantics, economic trust and
freeze consequences are specified in [buyback-policy.md](buyback-policy.md).

The active `IBuybackModule` provides versioned introspection, `trackedAssets`
and a vault-only `execute(caller,asset,bucket,amount,deadline,data)` result with
legs, acquired amount and opaque context. The vault checks actual balances,
unchanged pre-burn supply and final burn itself. It uses normal calls, never
delegatecall. Undeclared intermediate assets and price fairness remain module
review responsibilities.

The initial Pons module owns `processingStatus`, `route`, `limits`, `revision`,
`permissionlessPolicy`, operator/mode configuration, pauses, rates, budgets and
cooldowns. Integrations validate ID/version/runtime before using those methods.
Pons v1 data encodes `(policyRevision,TypedRoute,uint256[] minimumOutputs)`.
Operator mode uses explicit absolute minima; permissionless mode uses stored
actual-spend rates. Missing RPC reads are not benign status values.

## Initial Pons strategy execution

The module validates its fixed native-ETH Pons launch and venue dependencies,
encodes exact-input routes, returns unused assets, and clears ERC-20/Permit2
approvals. Callback context checks and exact balance baselines prevent residual
input/output after settlement. It can be replaced through the vault's delayed
process until replacement is permanently frozen. Its own mutable authorities
are unaffected by that freeze.

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
  output, and module revision.
- `BuybackBurned`: settlement sequence, source bucket, input attribution, purchased amount, burned
  amount, module-defined bytes32 context and module revision.
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
