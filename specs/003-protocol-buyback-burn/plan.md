# Implementation Plan: Protocol Buyback and Burn With Safe Administration

**Current implementation (2026-09-08):** [Standing permissionless buybacks](operating-model-proposal.md)
replaces recurring approvals and delegated price signing with standing time/size
controls and an admin calculator. The replacement is implemented and has fresh-fork
execution evidence and passing final source checks; the clean personal-wallet
handoff is being completed. See [current evidence](standing-buybacks-evidence.md).
The original requirements and acceptance below are retained as history; their
expiring-policy details do not govern this replacement. No further price-protection
approval, oracle or required price-signing service is part of the approved scope.


**Historical extension (2026-09-08), now superseded by standing settings:** [Local policy tools](local-policy-tools-plan.md)
adds operator price-history storage and local review/signing. It supersedes the earlier
no-admin-screen/no-database exclusions for that bounded workflow; the membership product
still has no mandatory indexer or custodial backend. Historical acceptance below is separate.

**Branch**: `codex/003-protocol-buyback-burn`; Spec Kit feature selector: `003-protocol-buyback-burn`  
**Date**: 2026-09-07  
**Spec**: [spec.md](spec.md)  
**Status**: Standing replacement implemented with fresh-fork evidence; final convergence and personal-wallet handoff pending. The initial design and its historical gates follow.

## Summary

Replace fixed protocol fees and discretionary withdrawals with an immutable per-tier allocation of
100–10,000 basis points, reserved in each tier and earned continuously over consumed paid time.
Release earned amounts periodically into a dedicated protocol-token buyback vault. Keep the existing
Safe-controlled payment-token registry and membership accounting. Launch one ETH-paired Pons v2 token
with purchased initial developer holdings, vested trading buybacks enabled and additional creator tax
zero. Unearned fees back unused-time refunds; earned membership-funded purchases burn immediately; Pons trading compensation stays separate.

The Safe administers typed routes, expiring economic limits and buyback pauses through documented
transactions and scripts. Anyone can execute an eligible buyback, including a separately gas-funded
Bun/viem runner. No custom administration screen, DAO, upgrade proxy, arbitrary execution registry,
fee withdrawal, database, mandatory indexer or second launchpad implementation is added.

Deliver the complete creator/supporter product and authentic launch→bonding→graduation→pool integration
on a reproducible disposable fork, unless a complete faithful testnet is verified first. Extend existing
Foundry, independent accounting models, Anvil and Playwright infrastructure. Preserve evidence before
teardown and reproduce two clean runs. [Research decisions](research.md) govern external integrations;
[interface contracts](contracts/protocol-interfaces.md) and [validation guide](quickstart.md) define delivery.

## Technical Context

**Language/Version**: Solidity 0.8.36, Cancun, optimizer 200 for BBF; TypeScript 6.0.2,
Next.js 16.3.3, React 19.2.8, Bun 1.3.14. Pons runtime verification uses its own recorded compiler,
optimizer, via-IR and immutable settings; do not recompile it with BBF settings and claim equivalence.

**Primary Dependencies**: Existing OpenZeppelin Contracts, forge-std, Foundry, wagmi 2.19.5,
viem 2.55.19, TanStack Query 5.102.4, RainbowKit 2.2.11. Add only pinned official Uniswap
interface/encoding dependencies needed for constrained swaps, plus verified Pons/Safe interface
artifacts. Safe v1.5.0 L2 fixture follows existing canonical deployment validation.

**Storage**: Onchain raw-unit inventory, configuration and events; generated Foundry/Wagmi interfaces;
versioned deployment manifests; temporary local test artifacts exported into retained evidence.
No transaction journal or custodial offchain accounting.

**Testing**: Foundry unit/fuzz/stateful invariants and independent models; shell CLI/deployment tests;
Vitest; Playwright with real local wallet/RPC; authentic pinned fork and separately labeled faults.
Existing Slither and local verification checks remain required for implementation.

**Target Platform**: Robinhood origin mainnet 4663; local Anvil execution chain 31337 with recorded
origin block number/hash. Verify external chain-ID behavior. Mainnet readiness is implemented but no
public deployment occurs. Testnet 46630 counts only with complete verified external dependencies.

**Project Type**: Existing Solidity/Next.js monorepo with one small public execution script.

**Performance Goals**: Membership settlement performs no market/oracle calls or member scans;
fee accrual/refund projection is O(log purchase lots) per member, collection batches≤100 member IDs
and lot pages≤100. Generation resets never clear unbounded arrays;
process one asset per transaction with at most two conversion legs plus one protocol-token purchase;
token enumeration pages ≤100 and activity pages ≤50 records. Runner scans at 30-second intervals by
default; controlled runner replacement completes within two intervals after prerequisites hold.
Collector discovery uses finite sweep-start ranges, forward in-memory cursors and round-robin tier
visits, one member page per visit; scheduled rounds retain progress. The finite visit bound, restart
behavior and one-shot full-sweep semantics are specified in `contracts/operations-and-evidence.md`.
The two-interval target applies to its small fixture, not a population-wide collection deadline.
Use bounded log windows (initial 2,000 blocks, surfaced errors on provider rejection), incremental
pagination and captured-block reads. These are engineering defaults, not production throughput claims.

**Constraints**: Exact transfers and raw units; immutable tier terms/token/burn purpose; all actual
purchased output burns atomically; pending inventory survives pauses and failures; no gas payment from
inventory; price floors rely on disclosed Safe judgment. Maintain Robinhood deployment size/gas gates,
including existing 95,000-byte serialized-transaction guard where applicable. Generous test limits do
not establish public deployability. wagmi/viem owns all wallet and receipt lifecycle behavior.

**Scale/Scope**: One Pons v2 token; USDG, authentic Stock Token, WETH/liquid non-stock asset and protocol
token membership coverage; complete existing membership/artwork lifecycle; one public protocol page;
script-based administration and replaceable runner. No speculative multi-chain rollout or launchpad framework.

## Constitution Check

Checked before research and after design against constitution v2.0.0.

| Gate | Design evidence | Result |
| --- | --- | --- |
| Creator ownership | Immutable tier economics, exact gross refunds, owner artwork controls preserved | Pass |
| Onchain and chain-scoped fidelity | Verified deployment-specific Pons sources; origin/local chain identities; generated ABIs; library-owned receipts | Pass in design; authentic execution remains gated |
| MIT/open source | BBF additions remain MIT; external source/dependency licenses preserved individually | Pass; dependency license inventory required before vendoring |
| Honest UX | Separate membership burns, Pons vesting, developer earnings and Safe economic authority | Pass |
| Smallest complete slice | Reuse registry/models/wallet/harness; fixed integration and bounded typed configuration | Pass |
| Evidence and authorization | No public writes; local test-only keys; source, fault, integration and browser results separate | Pass |
| Spec Kit scope | Phase 1 design only; checklist/tasks/analyze/implement/converge follow | Pass |

No constitutional exception is requested. A failed external gate is not an approved exception and
must not be hidden by mocks or relaxed external authorization checks.

## Architecture and Implementation Strategy

### 1. Preserve tier economics and move fees out of the factory

Add `protocolFeeBps` to `MembershipTypes.TierConfig`, validate 100–10,000 and total ≤10,000 in factory
and tier, and store it as a tier immutable. Extend `TierTermsConfigured`; replace all global-100-bps
reads and copy. Existing independent floor rounding, unused-referral remainder, reward weights and
gross refund entitlement remain unchanged. Unearned protocol reserves fund refunds first, then creator
proceeds and a bounded owner top-up. At 100%, reward/referral rates are zero and reserves cover the
entire unused-time gross refund. Other allocation/claim timing is unchanged.

Retain factory token enumeration/enablement, official tier identity and `Ownable2Step`. Remove
`feeRecipient`, its setter/events, protocol withdrawals and the fixed factory fee getter. Construct a
`ProtocolBuybackVault` with the factory's own address and the already launched protocol token, making
both immutable. Keep `MembershipTierDeployer`'s existing bytecode separation and recheck creation sizes.
If adding vault construction exceeds deployment limits, use an analogous dedicated deployment helper;
do not introduce an upgrade proxy or mutable initialization escape hatch.

Keep each allocated fee inside its tier as protected unearned reserve. Track per-payment fee lots
against the existing consumed-paid-time clock and calculate cumulative earned entitlement with
frequency-independent rounding. Ordered lot endpoints and cumulative fee prefixes permit logarithmic
projection; logical generations prevent unbounded cleanup and canceled lots earning after rejoin.
Existing variable-contribution refund prefixes must use the same bounded generation reset.

Anyone can checkpoint≤100 member IDs and separately release checkpointed earned-held fees. Release
exact-transfers to the immutable vault and calls `recordEarnedFees(amount)` atomically; only registered
tiers can credit earned receipts. Ordinary payment/refund paths perform local accrual accounting and
never depend on a vault transfer or market being available. Keep unearned and earned-held reserves
separate from creator/reward/referral liabilities. Donations cannot masquerade as membership earnings.
Stored conservation is `allocated = protected holdings + releases + reserve-funded refunds`.
At a common timestamp and matching population, protected holdings decompose into projected unearned
reserve, uncheckpointed earnings and checkpointed earned-held. Public earned-awaiting-release includes
both earned components; only checkpointed funds are immediately releasable. Projections are views,
not continuously updated storage, and partial member coverage cannot establish full-tier reconciliation.
The full formulas, refund funding order, lot/generation structure and rounding rule are defined in
[fee-accrual.md](contracts/fee-accrual.md).

### 2. Keep configuration authority singular and fee custody restricted

Vault configuration authorizes the factory's current Safe owner; no second owner registry can drift.
The existing owner-transfer path must accept only a validated Safe successor, with two-step acceptance;
owner renunciation remains disabled. Ordinary Safe signer rotation occurs inside Safe. Validate the
selected public Safe under existing deployment policy; a 2-of-3 local fixture is test coverage, not a
change to the user's public signer policy.

The vault exposes per-asset **earned released** inventory, donation totals, active typed route/policy revision, global and
per-asset processing pauses. Safe can enable/disable new-tier payment assets independently of routes.
Neither disablement nor processing pause blocks existing tier payments/claims/refunds.

The immutable integration knows Pons and approved exchange contracts; Safe configures pool identities,
not arbitrary executable addresses or calldata. All recipients are vault/executor custody, approvals
are exact and cleared, and no `delegatecall`, arbitrary rescue or persistent adapter balance is permitted.
A constrained executor can be a separate immutable contract to keep code size and custody concerns
separate; it has no administrative or payout key.

### 3. Use explicit economic policies instead of a fabricated price oracle

Use expiring Safe-approved raw-unit minimum exchange rates for every conversion leg and the final
protocol-token purchase, together with a finite nonrenewing policy spending budget. Safe publishes
its reference evidence and fixes rates before ordinary callers execute. Current pool quotes estimate
execution only; they cannot lower the stored floor. The design and initial bounds are specified in
[buyback policy](contracts/buyback-policy.md).

This is an administered limit-order policy. It does not promise fair market value, eliminate MEV or
protect against a Safe choosing bad economics. It prevents callers from supplying their own permissive
spending rules and bounds exposure under each authorized policy. No fresh privileged signature is
needed per burn, and no custom TWAP accumulator or unsupported new-token oracle is invented.

### 4. Route atomically through the actual launch lifecycle

The fixed Pons integration reads verified factory/curve state. While bonding it buys through the
actual ETH curve entrypoint and waits while the executor has a nonzero launch-window penalty.
Include ordinary fees and recipient-sensitive behavior in execution estimates.
After graduation it uses the actual factory-created V4 pool key, including hook. During closed/swept
but unseeded states it reports pending; public `graduate` and `createGraduatedPool` recovery remain
available independently. Normal graduation changes lifecycle selection without a Safe transaction.

For supported assets, internally encode exact-input conversion routes through verified exchange
infrastructure; prefer official Universal Router encoding instead of recreating V4 settlement logic.
Start with the shortest verified route for the mandatory real assets. No generic external router
calldata is exposed. See the route feasibility gate below before committing to any particular pool.

All conversions and final purchase/burn occur in one transaction. Partial curve fills can leave ETH
rather than the original payment asset: return it to the vault and record a conversion into ETH
inventory with original membership/donation attribution; never call this a burn or new fee. Track each
leg's actual consumed input and net received output. Measure and burn only newly acquired protocol
tokens; failures restore all previous transfers, inventory, allowances and policy consumption.
Protocol-token fees/donations burn directly under the relevant pause/amount controls, with no market policy.

### 5. Reuse web and operational interfaces

Extend Creator Studio's decimal-to-bps parser and split preview; default 1%, show permanence and the
continuous fee earning and how reserved fees back refunds, including full backing at100%. Replace global fee reads with tier values in creator/supporter/account views.
Preserve artwork, raw-token display scaling and receipt-based success reconciliation.

Add `web/src/app/chains/[chainId]/protocol/page.tsx` and focused protocol read components. Show token
lifecycle; per-asset unearned reserves, earned-unreleased and released inventory; protocol-funded
refunds; projected fee releases for24h/7d/30d with coverage/refund conditions; donations; actual burns;
Pons trading fees/vesting/developer compensation; Safe, policy revisions, routes and pauses. Display
source blocks and paginated event history. Never use historical scans to recover a pending wallet receipt.
The public processing button uses existing wagmi simulate/write/receipt/refetch flow. There is no admin UI.

Extend `manage-payment-tokens.sh` and add a focused buyback configuration script to emit reviewed Safe
payloads, decoded arguments and expected state changes. Remove obsolete withdrawal and direct EOA-admin
paths. Safe execution success requires its inner success event and target postconditions, not only
an outer successful receipt. Fork operation needs no hosted Safe Transaction Service.

Add `web/scripts/run-buybacks.ts`, reusing pinned viem and generated ABIs, with one-shot and scheduled
modes. The runner holds only its separately funded gas key. It checkpoints member fee entitlements
in bounded pages, releases tier-earned balances, reads current policy, simulates and submits eligible
transactions, awaits viem receipts, then verifies domain results. It does not sign
admin policy, earn inventory bounties, maintain nonce journals or implement receipt polling.
Use the finite discovery/round-robin traversal and restart rules in the operations contract. A blocked
asset cannot restart the sweep or monopolize collection; process eligible inventory between pages.

### 6. Build a reproducible authentic environment

Extend the existing Anvil bootstrap's shared setup/teardown rather than duplicate wallet/server code.
Add a `scripts/test-protocol-fork.sh` entrypoint for strict integration: required origin block/hash,
private upstream RPC, loopback-only transaction RPC, authentic assets, fresh Pons launch, local Safe,
BBF contracts and retained artifacts. Keep existing synthetic fixtures clearly separate.

Fresh Safe fixture uses canonical deployed code and test signers; actual signed `execTransaction`
configures tokens/routes/limits. Fresh Pons launch uses test ETH and local developer beneficiary.
Drive graduation through real buys and public calls. Time travel tests vesting separately from the
normal lifecycle; any simulated Pons operator action is explicitly labeled external participation.
Do not fund Stock Token balances with storage edits in authentic acceptance; acquire via verified
transfers/trades and label any existing-holder participation. Fault-only fixtures may alter state.

Export receipts, raw ledgers, supply deltas, runtime/code hashes, Safe transactions, run logs and
successful browser traces before teardown, including failed runs. Reproduce two clean origins and
compare invariant outcomes, not transaction hashes or incidental addresses. See [quickstart](quickstart.md).

## External Feasibility Gates

These are required engineering evidence, not missing product choices. Planning has not performed
an authenticated archive-fork run; implementation must stop its integration branch at any failed gate.

| Gate | Required exit evidence | Failure behavior |
| --- | --- | --- |
| G1 Environment and deployed versions | Origin block/hash; archive reads for all dependencies; verified source/ABI/runtime/immutables; chain-ID-sensitive paths understood | Report exact missing read/code dependency; no latest-state or source-copy substitution |
| G2 Fresh launch and bonding | Ordinary test account launches ETH token; actual fee/tax/buyback configuration; genuine membership-funded curve burn | Stop Pons integration if public launch is unavailable; do not patch permissions |
| G3 Mandatory asset routes | Authentic USDG/Stock/non-stock holdings, valid exchange pools and per-leg policies; net output and true burn | Leave unsupported asset pending but mark required asset acceptance failed |
| G4 Graduation and pool | Actual threshold crossing, Swept interval, public pool creation, correct hook and post-pool burn | No completed-lifecycle claim until verified |
| G5 Trading compensation | Actual vault deposits, partial/final vesting and developer claims; operator outage isolated | Label simulated external participant; missing real contracts is failure |
| G6 Safe and browser | Genuine signed Safe changes plus complete browser journeys on same deployment, two retained runs | Source/mock green cannot replace integration evidence |

Pons remains the selected implementation target. Long has insufficient evidenced APIs; do not add a
second integration to fill an evidence gap. If Pons fails a mandatory property, investigate Long and
revise the design explicitly before dependent implementation continues.

## Project Structure

### Documentation (this feature)

```text
specs/003-protocol-buyback-burn/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── acceptance-evidence.md
├── launchpad-evaluation.md
├── contracts/
│   ├── fee-accrual.md
│   ├── protocol-interfaces.md
│   ├── buyback-policy.md
│   └── operations-and-evidence.md
└── checklists/requirements.md
```

`tasks.md` is produced by the later tasks phase, not this command.

### Source Code (repository root)

```text
contracts/src/{MembershipFactory,MembershipTier,MembershipTierDeployer,RobinhoodProtocolConfig}.sol
contracts/src/{ProtocolBuybackVault,PonsBuybackExecutor}.sol       # new
contracts/src/types/MembershipTypes.sol
contracts/src/interfaces/                                       # existing + generated-source integration interfaces
contracts/script/{DeployDirectProtocol,CreateSafe}.s.sol
contracts/script/DeployForkProtocol.s.sol                       # new test bootstrap
contracts/scripts/{manage-payment-tokens,manage-buybacks}.sh     # extend / new
contracts/test/{models,invariants,fork,e2e,mocks}/
scripts/{test-web-anvil,test-protocol-fork,verify-local}.sh       # extend / new / extend
web/scripts/run-buybacks.ts                                     # new
web/src/features/{creator,membership,protocol}/
web/src/app/chains/[chainId]/protocol/page.tsx                   # new
web/src/lib/{config,authenticity,direct-read,payment-token-read}.ts
web/src/contracts/types.ts and web/src/contracts.ts            # existing types + generated ABI
web/{wagmi.config.ts,playwright.config.ts,tests/e2e/}
```

**Structure Decision**: Keep the existing monorepo. New modules separate immutable custody from venue
execution; reuse generated bindings, RPC configuration and browser harness. No additional service stack.

## Delivery Layers and Acceptance Mapping

| Layer | Working outcome before adding next layer | Requirements |
| --- | --- | --- |
| 1 | Variable tier bps, continuous accrual, bounded collection, reserve-backed refunds/donations and Safe registry pass independent models | FR001–011,017–019,038–040 |
| 2 | One fresh authentic ETH launch with enabled vesting; protocol-token direct burn and WETH→curve burn | FR013–015,020–024 |
| 3 | Safe policy/pauses, real asset conversion, public runner replacement and adversarial bounds | FR012,015–019,036–037 |
| 4 | Threshold crossing, public graduation/pool creation and post-pool burns; external vesting separately reconciled | FR023–026 |
| 5 | Full Creator Studio, supporter/account journeys and public activity page on the same fork | FR027–030 |
| 6 | Genuine Safe script workflow, complete automated matrix, successful traces, two clean reproducible runs | FR031–035; SC001–012 |

All layers are required for feature completion. Do not trade the existing working membership product
for a launch-only demonstration. Public release, legal assessment and future DAO work remain separate.

## Complexity Tracking

No constitution violations. A fixed executor is justified by the two venue lifecycles and custody
isolation; a plugin router registry, custom oracle, upgrade proxy and custom admin application are unnecessary.


## Deferred launch implementation

Factory deployment accepts a zero token and always creates its fixed vault and
Burn router. The vault is the single token-binding source of truth; the factory
getter delegates to it. `factory.bindProtocolToken(address)` is Safe-only and
calls the factory-only vault binding operation, deploying the existing validated
executor atomically. Nonzero constructor deployment continues to validate/bind
immediately. An explicit TokenNotLaunched status precedes processing checks;
route setup waits for binding, while custody/accrual/release remain usable.

The router supports collection-only transactions without calling ERC20 at zero.
Web dependency verification accepts exactly the legitimate unbound state (both
token and executor zero with valid factory/vault bindings) and omits token/market
reads, while retaining ordinary membership and fee views. A separately named
no-token local deployment entrypoint reuses owned Anvil/web lifecycle and prepares
funded manual memberships without executing the Pons launch branch.

Validation covers Safe-only/one-time/atomic binding, no unbound spending, fee
accrual/release/refund and collection-only router behavior, malformed dependency
pairs, membership browser continuity and visible pending-token status. Existing
full-launch tests remain regression coverage. Source/unit evidence and actual
local deployment/browser evidence are recorded separately; testnet is not deployed.
