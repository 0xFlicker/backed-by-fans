---
description: "Dependency-ordered implementation tasks for vested allocations and reward curves"
---

# Tasks: Vested Allocations and Early-Support Reward Curves

**Input**: Design artifacts in `/Users/user/Development/backed-by-fans/specs/004-vesting-reward-curves/`.
**Prerequisites**: [specification](/Users/user/Development/backed-by-fans/specs/004-vesting-reward-curves/spec.md), [plan](/Users/user/Development/backed-by-fans/specs/004-vesting-reward-curves/plan.md), research, data model, both interface contracts, calibration, quickstart and the completed economics requirements checklist. Cross-artifact analysis must pass before implementation starts.
**Tests**: Required by FR-046–047, SC-001–012 and constitution V. Write feature assertions before the corresponding implementation; verify failures represent missing behavior, then make them pass. Existing tests that assume upfront cash or fee-only accounting must be replaced, not bypassed.
**Organization**: Shared accounting and deployment foundations precede seven user-story phases in specification priority order. Story phases finish their integration and acceptance; they do not each introduce a separate accounting engine.
**Paths**: All task paths are relative to `/Users/user/Development/backed-by-fans/`. Existing files are extended; paths explicitly described as new are intentional additions. `web/src/contracts.ts` is generated only.
**Format**: `- [ ] Tnnn [P?] [USn?] Action with exact file paths`. `[P]` applies only to the explicitly described same-phase parallel groups after their common prerequisites. Unmarked tasks run sequentially. All checkboxes are initially unchecked.

**Scope rules**: Keep permanent shares and a nondecreasing gross cursor, creator-sync suspension, positive-only restoration, free preservation, original referral attribution and current-owner creator claims. All four cash allocations vest. No worker compensation, economic approval workflow, new asset-onboarding mechanism, historical migration, compatibility API, feature flag, mandatory indexer or custom wallet lifecycle. Implementation work does not authorize public deployment, push or external communications. Preserve dirty work; inspect again before implementation rather than assuming this task-generation snapshot is current.

## Phase 1: Setup and Evidence Fixtures

**Purpose**: Reuse the existing Foundry/Next.js project and establish reproducible feature evidence without changing its runtime architecture.

- [X] T001 Confirm active feature, checkout and pinned toolchain; read `.specify/memory/constitution.md`, `web/AGENTS.md` and the installed Next.js guides before UI edits; record revision, tools and relevant existing failures in new `specs/004-vesting-reward-curves/evidence/implementation.md` using the commands in `specs/004-vesting-reward-curves/quickstart.md`.
- [X] T002 [P] Define deterministic scenario/history inputs and a test-only rational interval/cohort reference model in new `contracts/test/models/vesting_reference.py`; use exact fractions, explicit funding intervals and eligibility histories, not a copy of the production heap/index; include the 120-token and 22.5/7.5 examples.
- [X] T003 [P] Add reusable fixed/PWYW, original-referrer, token-precision and clock fixtures in `contracts/test/helpers/MembershipTestConfig.sol` and new `contracts/test/helpers/VestingFixtures.sol`; preserve existing exact-transfer and access authority assumptions.

**Checkpoint**: Reference inputs and fixtures are reproducible; no feature completion is inferred from passing old tests.

## Phase 2: Shared Accounting and Deployment Foundation

**Purpose**: Build the common ledger once. All stories depend on chronological attribution, protected reserves and the same claim/refund boundary. Complete the small working slice first; only then extend it into the shared engine. Do not leave a second production ledger or a special one-lot mode behind.

### Small working slice — must pass before scheduler expansion

**Architecture revision authorized during implementation:** T081–T085 below precede the remaining history/frontend work. T009/T010 describe the passing initial foundation; their earlier five-transaction measurements are historical and do not close the revised deployment acceptance.

- [X] T081 Split existing immutable tier code stores into independent deployments; update `contracts/src/MembershipTierDeployer.sol`, `contracts/src/MembershipFactory.sol`, `contracts/src/types/MembershipTypes.sol` and new `contracts/script/TierCodeDeployment.sol`. Verify references, sizes, STOP prefixes and exact linked creation/runtime hashes; preserve factory-only deployment, immutable bindings and atomic creator tier creation. Resolve the ledger→stores→factory address dependency without setters or compatibility paths.
- [X] T082 Update direct/local/fork deployment scripts, the seven-transaction resumable journal, operational manifest generation and source verification in `contracts/scripts/deploy-protocol.sh`; pin exact constructor arguments/payload sizes and reject conflicting partial state or obsolete schemas without public broadcasting.
- [X] T083 Extend `contracts/test/deployment/DeploymentScripts.t.sol`, factory fixtures and shell deployment mocks/tests for independently predeployed stores, interrupted/resumed A/B deployment, wrong/reordered/truncated/executable stores, deterministic address parity, unchanged authority and one-transaction tier creation. Check each exact payload, complete graph and unchanged gas/size limits, with substantial factory headroom.
- [X] T084 Update `scripts/protocol-fork/manifest.schema.json`, runtime/source/evidence verification, fork bootstrap and `web/scripts/protocol-fork-fixture.ts` for exact linked library/store/deployer identities and parent transaction attribution. Verify content-addressed raw store bytes separately from Solidity runtime metadata; never mask differing library links or stores.
- [X] T085 Record the revised graph, seven payload measurements, dependency resolution, journal/source verification and local tests in `specs/004-vesting-reward-curves/evidence/implementation.md`; reconcile quickstart and final deployment gates, then resume T020 and the remaining vesting/reward-curve tasks. No public deployment, commit or push is authorized.

- [X] T004 [P] Add new `contracts/test/RewardCurve.t.sol` assertions for canonical None, cumulative F(x+g)-F(x), taper/window crossing, exact adjacent partition telescoping, zero/minimum/max input and boost/horizon validation; expected values come from the independent formula rather than calling the implementation twice.
- [X] T005 [P] Add new `contracts/test/VestingLedger.t.sol` assertions for one 120-token/12-period lot at 80/10/5/5: zero earned at purchase, 24/3/1.5/1.5 earned after three periods, exact totals at the end, claims followed by a fully funded 90-token refund, and fractional-credit retention.
- [X] T006 Implement new `contracts/src/libraries/RewardCurve.sol` with the documented cumulative function, C=2^112−1, checked uint64 time bounds and 1.00x–10.00x step-0.01 validation; use existing OpenZeppelin arithmetic helpers and pass `contracts/test/RewardCurve.t.sol` without a runtime oracle or external price input.
- [X] T007 Implement new immutable linked leaf `contracts/src/libraries/VestingLedger.sol` with explicit `State storage`, Q=2^128, one-lot rates/tails, four earned/unearned totals, fractional claims and purpose-preserving cancellation; connect it to new `contracts/test/mocks/VestingLedgerHarness.sol` and pass T005 with token custody/transfers in the harness/tier, never in the library.
- [X] T008 Wire the designated ledger storage and compiler-generated library calls into `contracts/src/MembershipTier.sol`; add curve tuple fields/getters/constants, tier/factory validation and `TierRewardCurveConfigured` in `contracts/src/types/MembershipTypes.sol`, `contracts/src/interfaces/IMembershipTier.sol`, `contracts/src/interfaces/IMembershipFactory.sol` and `contracts/src/MembershipFactory.sol`; update constructor/test consumers coherently, initially using canonical None in unrelated fixtures.
- [X] T009 Implement deterministic two-stage linking in `contracts/scripts/deploy-protocol.sh`, `contracts/script/DeployDirectProtocol.s.sol`, `contracts/script/DeployForkProtocol.s.sol` and `contracts/script/DeployForkProtocolNoToken.s.sol`: preserve exact leaf artifacts, derive the CREATE2 address, link consumers to that sole approved mapping, verify runtime before factory deployment, and update component ordering, hashes, verification arguments and broadcast metadata; reject arbitrary environment link targets.
- [X] T010 Extend `contracts/test/deployment/DeploymentScripts.t.sol` and `contracts/scripts/test-deploy-protocol.sh` with exact-link/runtime rejection and clean whole-creation-graph measurements including `contracts/src/MembershipTierDeployer.sol`; record the passing small slice and encoded payload sizes in `specs/004-vesting-reward-curves/evidence/implementation.md` before continuing. Enforce tier base creation ≤49,150 bytes, runtime ≤98,304, initcode ≤196,608 and transaction data ≤95,000; relaxed Forge limits and cached artifacts do not satisfy this checkpoint.

### Grow the shared engine on the passing slice

- [X] T011 [P] Add scheduler assertions in new `contracts/test/VestingScheduler.t.sol` for one live node/member, indexed removal, timestamp/tokenId ordering, equal-time boundaries, adjacent END/START, positive lots separated by zero-value gaps, no nodes for free periods, and bounded resumable processing with no repeated finalized work.
- [X] T012 [P] Extend `contracts/test/models/vesting_reference.py` with multiple originating streams, original referrals, grants/free gaps, ownership, refunds and eligible-cohort changes; compare exact scaled frequency replay separately from ideal rational attribution and track the published error bound by funded lots and real vector changes.
- [X] T013 Implement generation-scoped funded queues, prefixes, indexed heap and START/END processing in `contracts/src/libraries/VestingLedger.sol`; append in O(1), insert/remove boundaries in O(log M), recognize endpoint tails exactly, checkpoint original-referrer rates at effective event times, and advance the final interval only when no due node remains.
- [X] T014 Implement the shared reward index, unchanged-vector division carry, vector-change dust, durable member credits and protected empty-vector funding in `contracts/src/libraries/VestingLedger.sol`; settle before actual weight changes, retain fractional credits and prove T011/T012 examples without any current-cohort backfill.
- [X] T015 Implement generation cancellation and refund primitives in `contracts/src/libraries/VestingLedger.sol`; use allocation/completion prefixes plus at most one active head, cancel one node without scanning future lots, fund raw unused gross via creator/member/referral/protocol scaled waterfall, and retain per-purpose residuals below the documented bound.
- [X] T016 Replace upfront cash allocation and old fee-only/variable-refund state in `contracts/src/MembershipTier.sol` with the shared ledger on every positive purchase/gift/contribution; preserve paid-first access and original referral locking, issue execution-time permanent curve shares immediately, reserve all four splits and retain zero-value purchased gaps without funded events.
- [X] T017 Wire all funding/weight mutations in `contracts/src/MembershipTier.sol` to bounded catch-up through now before mutation, and to settle-before-suspend/restore/cancel ordering; cover synchronization, grant-only revocation, refund and positive reactivation while keeping free access unable to restore suspended weight. Incomplete mutation must revert atomically with `AccountingBehind`.
- [X] T018 Replace tier claim/release/refund plumbing in `contracts/src/MembershipTier.sol` and `contracts/src/interfaces/IMembershipTier.sol`: settle finalized credit, retain fractional remainders, pay existing fixed beneficiaries, allow settled claims while behind/paused, preserve zero-payout behavior, remove owner top-up, and route creator-authorized ERC-5643 `cancelSubscription` through the same reserved refund path.
- [X] T019 Implement `previewShares`, permissionless `processAccounting`, `accountingStatus`, `earnedBalances`, `allocationState`, bounded `allocationLots`, `reserveState`, refund preview and progress/lot/cancellation events in `contracts/src/MembershipTier.sol`, `contracts/src/types/MembershipTypes.sol` and `contracts/src/interfaces/IMembershipTier.sol`; preserve useful settled raw views, distinguish accessAsOf/accountingAsOf, expose actual progress and protect all fractional liabilities in solvency totals without unbounded views.
- [X] T020 Add differential-history execution and failed-seed retention in new `contracts/test/models/run_vesting_histories.py` and new `contracts/test/VestingHistoryReplay.t.sol`; compare real Solidity actions/state to the independent model, cover the public lifecycle and all curves, and require nonzero transition coverage. Run a focused reproducible corpus before frontend work; the full SC-002 run remains T076. Record the concrete runner command in `specs/004-vesting-reward-curves/quickstart.md`.
- [X] T021 Implement the shared combined `advance` contract boundary in `contracts/src/ProtocolBurnRouter.sol` and `contracts/test/ProtocolBurnRouter.t.sol`: replace old burn/Collection inputs, validate unique registered tiers/currencies and 8-tier/32-purchase/shared-25-step limits before work, isolate accounting/release/trades and burn-measurement reads, bound stage gas/diagnostics and preserve useful partial success. Return/emit caller, actual progress and per-asset outcomes; reject idle/no-work attempts and add no worker entitlement. US7 supplies the exhaustive policy/failure/runner acceptance.
- [X] T022 Update linked-library parity and the disposable local fixture in `scripts/protocol-fork/manifest.schema.json`, `scripts/protocol-fork/verify-runtime.ts`, `scripts/protocol-fork/verify-sources.ts`, `web/scripts/protocol-fork-fixture.ts` and `contracts/test/fork/ProtocolForkDeployment.t.sol`; verify the new full contract API in local tests and regenerate `web/src/contracts.ts` through Wagmi CLI. This starts the inseparable binding-and-consumer integration block below; do not treat regeneration alone as a working frontend checkpoint. No handwritten ABI, address map or actual public broadcast is part of this task.
- [X] T023 Migrate every tier ABI consumer alongside T022 in `web/src/features/creator/config.ts`, `web/src/features/creator/CreateTierWizard.tsx`, `web/src/features/creator/TierManagement.tsx`, `web/src/features/protocol/registry-reconciliation.ts`, `web/src/features/protocol/payout-reconciliation.ts`, `web/src/features/membership/state.ts`, `web/src/features/membership/MembershipExperience.tsx`, `web/src/features/membership/membership-read.ts`, `web/src/lib/direct-read.ts`, `web/src/lib/membership-interfaces.ts` and `web/scripts/protocol-fork-fixture.ts`; update creation tuples with the approved defaults and canonical conversion, bounded read/preview shapes and timestamps, refund arguments/events and removal of top-up controls/allowances, share and payout receipt semantics (remove gross-equals-shares, stale-preview and permanently-zero-balance success predicates), plus affected mocks/tests. Follow imported consumers beyond this initial list until none depends on removed shapes. Preserve working existing flows; do not defer required conversions to US3/US5/US6, add compatibility shims or weaken type checking. Later stories add complete controls, explanations and broader behavior evidence.
- [X] T024 Migrate every removed fee/router API consumer alongside T022 in `web/src/features/protocol/prepare-burn.ts`, `web/src/features/protocol/ReleaseTierFees.tsx`, `web/src/features/protocol/fee-forecast.ts`, `web/src/features/protocol/buyback-reconciliation.ts`, `web/src/lib/buyback-settings/read.ts`, `web/scripts/run-buybacks.ts` and `web/scripts/buyback-rehearsal.ts`, including affected helpers/mocks/tests; replace old burn/Collection and fee state/lot/accrual calls with generated `advance` and bounded tier-global reads, preserve existing trading policy, construct valid shared budgets, report actual outcomes and remove lifetime token-ID scans. Follow all imports/call sites so no runtime or type-level reference to a removed ABI member survives. US7 extends recovery UX, fairness and exhaustive failure acceptance rather than first introducing callable replacements.
- [X] T025 Close the T022–T024 binding-and-consumer integration checkpoint by running `bun run generate:check`, `bun run typecheck`, `bun run build` and focused tests for affected consumers from `web/`; update assertions and fixtures in `web/src/features/creator/config.test.ts`, `web/src/features/protocol/prepare-burn.test.ts`, `web/src/features/protocol/fee-forecast.test.ts`, `web/src/features/protocol/ReleaseTierFees.test.tsx`, `web/scripts/run-buybacks.test.ts` and `web/scripts/buyback-rehearsal.test.ts` as needed to verify the new interfaces. Record commands/results in `specs/004-vesting-reward-curves/evidence/implementation.md`. All runnable consumers must use the new ABI before any story frontend checkpoint; passing generation alone, suppressed errors or retained obsolete ABIs cannot close this task.


**Checkpoint**: T004–T010 passed before T013. The extended shared engine compiles and passes focused chronology, cancellation, attribution and integration tests; the whole deployment graph still fits. T022–T025 is one integration checkpoint: the public ABI and all generated frontend/runner consumers build and their focused tests pass together before story work. The public ABI is usable by direct compatible clients. Shared support for every lifecycle exists, but no story's browser acceptance is claimed yet.

## Phase 3: User Story 1 — All Four Allocations Earn Over Time (P1)

**Goal**: A real payment grants access/weight immediately while all four cash portions earn only over its actual service interval.
**Independent test**: On a canonical None tier, execute the 120-token example through partial/final vesting and collection using public tier methods, including queued fixed-price and PWYW/free intervals.

- [X] T026 [P] [US1] Replace upfront expectations in `contracts/test/PaymentsAndTime.t.sol` with public-entry-point tests for zero cash at purchase, all-four partial/final vesting, grants excluded from paid order, renewal queues, free gaps and large PWYW payments vesting over one actual period.
- [X] T027 [P] [US1] Replace fee-only acceptance in `contracts/test/ProtocolFeeAccrual.t.sol` with earned-only vault release, repeated release, reserved-fund protection, 100% protocol splits, zero-sized allocations and exact end-of-lot totals; rename the suite/file to new `contracts/test/VestedAllocations.t.sol` and remove the obsolete file after its relevant cases are preserved.
- [X] T028 [US1] Complete payment split/lot integration in `contracts/src/MembershipTier.sol` and `contracts/src/libraries/VestingLedger.sol` against T026/T027, including unused referral and initial split dust to creator, exact-transfer rejection and actual `PaymentProcessed`/`PaymentAllocated`/`SharesIssued`/funded-lot event semantics.
- [X] T029 [US1] Update authoritative reads and tests in `web/src/lib/direct-read.ts`, `web/src/lib/direct-read.test.ts`, `web/src/features/membership/membership-read.ts` and `web/src/features/membership/membership-read.test.ts` for settled four-purpose balances, status, fractional reserves and bounded lot reads; expose incomplete state rather than pretending it is zero.
- [X] T030 [US1] Record the public-API 120-token trace, renewals and zero/PWYW gap evidence in `contracts/test/e2e/LocalLifecycleEvidence.t.sol` and `specs/004-vesting-reward-curves/evidence/implementation.md`; verify cash totals independently and document that beneficiary UI follows in US6.

**Checkpoint**: The smallest demonstrable economic increment works through a direct client: buy time, advance, inspect four allocations and collect only earned value. This is a local protocol MVP, not a release of the entire feature.

## Phase 4: User Story 2 — Attribute Rewards to Eligible Intervals (P1)

**Goal**: Delayed accounting cannot let a later or returning member capture earlier funding.
**Independent test**: The tracked one-token/day stream produces 22.5/7.5 on a halfway equal-weight join and 20/10 across the specified suspension; count concurrent funding separately.

- [X] T031 [P] [US2] Replace upfront distribution assertions in `contracts/test/Rewards.t.sol` with tracked-stream recipient attribution, simultaneous endpoints, equal-total/different-vector changes, dense/sparse processing, repeated claims and retained fractional credits; compare scaled payouts-plus-credit exactly across frequency variants.
- [X] T032 [P] [US2] Extend `contracts/test/invariants/AccountingInvariant.t.sol` with eligible-sum, protected carry/dust, active-rate sums and exact scaled conservation; prove positive reward funding with zero eligible weight is unreachable under valid public transitions, and separately inject that state in `contracts/test/mocks/VestingLedgerHarness.sol` to test protected unassigned funds.
- [X] T033 [US2] Complete member-index and epoch integration in `contracts/src/MembershipTier.sol` and `contracts/src/libraries/VestingLedger.sol` against T031/T032; preserve carry only for an unchanged vector, checkpoint affected members before changes, and exclude historical suspended intervals on restoration.
- [X] T034 [US2] Extend `contracts/test/models/run_vesting_histories.py` and `contracts/test/VestingHistoryReplay.t.sol` with dense/irregular/sparse processing and claim schedules over identical economic actions; check recipient bounds `2*L*(2^64−1)/Q + E*10*C/Q`, scaled conservation and exact frequency identity as separate assertions.
- [X] T035 [US2] Add recipient-attribution evidence to `specs/004-vesting-reward-curves/evidence/implementation.md` and correct obsolete upfront assumptions in `contracts/test/models/MembershipModel.sol`; keep the independent rational model separate from the production scheduler and record any deliberately synthetic empty-vector test.

**Checkpoint**: Conservation and recipient attribution both pass; neither is used as a substitute for the other.

## Phase 5: User Story 3 — Publish Permanent Early-Support Settings (P1)

**Goal**: Creators can publish More/Some/None or custom immutable terms; supporters can understand and verify actual share issuance.
**Independent test**: Publish every preset and custom values in fixed/PWYW modes, cross a horizon, move the quote before inclusion and attempt forbidden changes through direct clients and ownership transfer.

- [X] T036 [P] [US3] Extend `contracts/test/FactoryAndFees.t.sol` with factory/direct-tier parameter rejection, exact fixed-period horizon conversion, immutable curve/rate terms, ownership/default changes, maximum lifetime gross and rejected-payment atomicity while existing claims/refunds/free access remain usable.
- [X] T037 [P] [US3] Extend `web/src/features/creator/config.test.ts` and `web/src/features/creator/CreateTierWizard.test.tsx` for presets, Custom state, 1x normalization, both window units, scaled/zero-after-conversion values, token/price changes and immutable review; fail on silent clamping or a per-asset approval requirement.
- [X] T038 [US3] Verify and complete curve publication readback in `contracts/src/MembershipFactory.sol`, `contracts/src/MembershipTier.sol`, `web/src/features/protocol/registry-reconciliation.ts` and `web/src/features/protocol/registry-reconciliation.test.ts` against T036/T037; the foundation already supplies valid creation tuples and generated consumers. Check actual curve event/tuple values and migrate affected consumers alongside any subsequent binding regeneration.
- [X] T039 [US3] Complete creator customization and input handling around the foundation defaults in `web/src/features/creator/config.ts`: Some 1.5x selected, More 3x, None 1x, fixed horizon 1,000 periods and PWYW 10,000 display-token units; exercise exact canonical conversion, require valid creator input for unrepresentable defaults and preserve published canonical economics across display changes.
- [X] T040 [US3] Add preset/custom controls, curve preview and permanent review in `web/src/features/creator/CreateTierWizard.tsx` and read-only terms in `web/src/features/creator/TierManagement.tsx`; show starting/taper/window/example average weight separately from cash, lock published economics and disclose all-four vesting, permanent shares and creator-sync cutoff.
- [X] T041 [US3] Extend quote presentation and actual-issued-share reconciliation in `web/src/features/membership/state.ts`, `web/src/features/membership/state.test.ts`, `web/src/features/membership/MembershipExperience.tsx` and `web/src/features/membership/MembershipExperience.test.tsx`; the foundation already removes gross-equals-shares and stale-preview success predicates. Cover changed curve position at inclusion, execution-time actual issuance and concurrent canonical history updates using only the supplied successful receipt.
- [X] T042 [US3] Implement accessible preset/custom inputs and visible summaries in `web/src/features/creator/CreateTierWizard.tsx` with styling in `web/src/app/globals.css`: labels/units/errors, keyboard and focus, summary-based boost/window/example decisions, no assistive chart traversal or chart-exclusive interaction; retain default animation, respect reduced motion including any JS animation, and support high contrast without adding a separate accessibility mode.
- [X] T043 [US3] Extend observed publication/payment journeys in `web/tests/e2e/create-tier.spec.ts` and `web/tests/e2e/join-renew-gift.spec.ts` for all presets/custom, immutable readback, horizon crossing and another purchase changing the quote before inclusion; record receipt-derived shares and canonical settings in `specs/004-vesting-reward-curves/evidence/implementation.md`.
- [X] T044 [US3] Update `specs/004-vesting-reward-curves/calibration.md` and `specs/004-vesting-reward-curves/evidence/curve-calibration.py` to compare actual Solidity outputs with concentrated/gradual/churn/refund/zero/tiny scenarios, initial defaults and extreme supported settings; report weight separately from cash attribution, with no economic suitability approval gate.

**Checkpoint**: Publication and curve decisions work without reading a graph; actual issuance, not an old quote, determines success. The shared lifecycle was already integrated in Phase 2; US4/US5 add exhaustive story acceptance rather than enabling previously unsafe UI paths.

## Phase 6: User Story 4 — Preserve and Reactivate Historical Support (P1)

**Goal**: Access, historical shares, reward eligibility and already-earned cash remain distinct through every lapse/free/paid transition.
**Independent test**: Expire at day 10, sync at day 15, restore with minimum-positive payment; compare free renewals/grants before and after sync, gifts and final grant-only revocation.

- [X] T045 [P] [US4] Extend `contracts/test/ExpiredMembershipSync.t.sol` with delayed creator-only/bounded sync, pause, duplicate sync, settle-through-transaction cutoff, durable post-burn claims and no natural-expiry suspension.
- [X] T046 [P] [US4] Extend `contracts/test/GrantsAndCapacity.t.sol` with free preservation even after expiry, repeated free extensions, suspended free/grant non-restoration, minimum-positive purchase/gift restoration during free or granted access, and final grant-only revocation with/without paid time.
- [X] T047 [US4] Complete lifecycle transitions in `contracts/src/MembershipTier.sol` against T045/T046 and `contracts/test/invariants/MembershipInvariant.t.sol`; keep generic access restoration separate from reward activation, retain all historic shares/cursor and previously earned claims, and do not backfill suspension intervals.
- [X] T048 [US4] Update eligibility/restoration display and reconciliation in `web/src/features/membership/MembershipExperience.tsx`, `web/src/features/membership/state.ts` and `web/src/features/creator/ExpiredMembershipSyncControl.tsx`; show old weight restored versus new issuance and zero-payment consequences using canonical reads and wagmi-owned transaction states.
- [X] T049 [US4] Extend `web/tests/e2e/join-renew-gift.spec.ts` and `web/tests/e2e/creator-operations.spec.ts` with paid/free/grant/expiry/sync transitions, meaningful status announcements and reachable earned claims after suspension; record access, weight, eligibility and cash independently in `specs/004-vesting-reward-curves/evidence/implementation.md`.

## Phase 7: User Story 5 — Refund Only Reserved Unused Funding (P1)

**Goal**: Refund gross unused paid time without owner allowance, earned-value clawback, curve rewind or canceled funding earning again.
**Independent test**: Claim all earned portions of the 120-token lot at three periods, then refund 90; repeat with mixed-price/free queues, a partially consumed head and a waiting head.

- [X] T050 [P] [US5] Replace top-up assertions in `contracts/test/RefundsAndOwnership.t.sol` with complete/partial/queued/free-gap refunds, claimed and unclaimed earnings, fixed recipient/creator authority, max-gross rejection, retained shares/cursor, no double accrual/refund and full rollback on bad transfers.
- [X] T051 [P] [US5] Extend `contracts/test/StandardsInterfaces.t.sol` for creator-authorized ERC-5643 cancellation through the same reserved refund path, including AccountingBehind and canceled paid/grant time; preserve standard support while removing obsolete top-up signatures.
- [X] T052 [US5] Complete refund/cancellation integration in `contracts/src/MembershipTier.sol` and `contracts/src/libraries/VestingLedger.sol` against T050/T051; prove the scaled waterfall sum equals rawRefund*Q, protect residuals per purpose, remove one heap node and invalidate the generation without a future-lot scan. Add the refund-only constant-work projection (`fundingAsOf`, `projected`) before the next global boundary, with historical fallback at pending boundaries and no mutation/claimable projection; compare projected and processed values and repeat generated bindings, linked graph and unchanged deployment payload/gas limits.
- [X] T053 [US5] Complete refund review presentation and validation feedback around the already-migrated refund signature in `web/src/features/creator/TierManagement.tsx` and `web/src/features/protocol/payout-reconciliation.ts`; show fixed recipient and gross, distinguish current accessAsOf from historical accountingAsOf, require catch-up for historical quotes, label current pre-boundary projections separately from settled balances, use fresh simulation before execution and reconcile actual refund/canceled-access receipt values plus canonical generation progress without requiring later access to stay zero or historical shares to decrease. The foundation already removes owner top-up fields, allowance handling and old event shapes.
- [X] T054 [US5] Extend `web/tests/e2e/claims-refunds.spec.ts` with partial refund after all prior beneficiary collections, mixed PWYW periods, stale-preview rejection followed by direct permissionless processing/fresh quote, and failed transfer; verify no owner approval/top-up flow and record protected reserves alongside the actual refund in `specs/004-vesting-reward-curves/evidence/implementation.md`. Use the compatible-client processing route for this checkpoint; combined website recovery is verified after its T066 integration in T068.

## Phase 8: User Story 6 — Claim Earned Creator, Member and Referral Value (P2)

**Goal**: Every beneficiary sees settled versus reserved funding and can collect durable earned rights while balances continue to accrue.
**Independent test**: Claim each beneficiary at partial vesting, after creator ownership transfer, while paused/suspended and while accounting is incomplete; positive claims may leave a new positive balance.

- [X] T055 [P] [US6] Extend `contracts/test/ClaimsAndWithdrawals.t.sol` with fractional-credit retention, settled claims while behind/paused/suspended, durable wallet identity after credential burn, current-owner creator entitlement, zero payout without transfer/event and atomic rollback on transfer failure.
- [X] T056 [P] [US6] Extend `contracts/test/Referrals.t.sol` with original-referrer earning across service intervals, no membership requirement, earlier gifts unaffected by a later referral lock, multiple streams to one referrer and claim/rate-change checkpoint ordering.
- [X] T057 [US6] Complete creator/member/referrer claim and earned-only protocol release behavior in `contracts/src/MembershipTier.sol` and `contracts/src/libraries/VestingLedger.sol` against T055/T056; preserve fixed payout identities, no reactivation/cursor movement and full protected-liability coverage.
- [X] T058 [US6] Update creator/member/referral balances and claim actions in `web/src/features/creator/TierManagement.tsx`, `web/src/features/membership/MembershipExperience.tsx` and `web/src/features/membership/membership-read.ts`; label settled/reserved/status and member-wide future pool without a personal promise, and keep earned claims accessible after pause/suspension.
- [X] T059 [US6] Validate and extend the foundation-migrated payout reconciliation in `web/src/features/protocol/payout-reconciliation.ts` and `web/src/features/protocol/payout-reconciliation.test.ts`; explicitly test actual supplied payout events with a positive refreshed balance, preserve wagmi/viem ownership, and announce meaningful outcomes without repeated live announcements of every accruing value. The obsolete zero-balance success predicate is already removed in T023.
- [X] T060 [US6] Extend `web/tests/e2e/claims-refunds.spec.ts` and `web/tests/e2e/supporter-account.spec.ts` for all three beneficiaries, ownership transfer and ongoing accrual during confirmation; record actual paid amounts and newly accrued balances in `specs/004-vesting-reward-curves/evidence/implementation.md`.

## Phase 9: User Story 7 — Resume Accounting and Buybacks Permissionlessly (P2)

**Goal**: One bounded advance can commit accounting, funding release and eligible buyback work, preserving independent successes; anybody can continue the cursor.
**Independent test**: Recover after a year idle with 10,000 members/100,000 payments; exercise accounting-only, release-only, buyback-only, mixed-success, no-work and invalid calls, then complete purchase/sync/refund/claim.

- [X] T061 [P] [US7] Extend `contracts/test/ProtocolBurnRouter.t.sol` with exhaustive advance outcomes: caller-selected maximum versus actual steps, zero-step release, shared cross-tier cap, duplicate/input validation before work, equal-time partial progress, accounting-only and mixed-stage success, no-op repeat/empty requests and no worker payout.
- [X] T062 [P] [US7] Extend `contracts/test/mocks/BuybackFaults.sol` and `contracts/test/fork/ProtocolExternalFailures.t.sol` for release failure after accounting, trade/supply-read failure after prior success, gas-consuming stages and oversized revert data; assert own-stage rollback and survival of independent work under sufficient outer gas.
- [X] T063 [US7] Complete `contracts/src/ProtocolBurnRouter.sol` against T061/T062, retaining bounded stage gas/diagnostics and finalization reserve; update `contracts/test/invariants/BuybackInvariant.t.sol` to cover earned-only input, existing market revisions/cooldowns/source rotation/currency isolation and useful-work accounting without mixed-asset monetary sums.
- [X] T064 [US7] Extend the foundation-converted advance callers in `web/src/features/protocol/prepare-burn.ts`, `web/src/features/protocol/prepare-burn.test.ts`, `web/src/features/protocol/buyback-reconciliation.ts` and `web/src/features/protocol/buyback-reconciliation.test.ts`; verify actual per-stage outcomes and retained partial successes from supplied receipts. No old burn or token-ID collection call survives until this phase.
- [X] T065 [US7] Complete settled-funding forecasts and incomplete-accounting presentation in `web/src/features/protocol/fee-forecast.ts`, `web/src/features/protocol/fee-forecast.test.ts`, `web/src/lib/buyback-settings/read.ts` and `web/src/lib/buyback-settings/read.test.ts` using the bounded tier-global reads introduced in the foundation; test their completeness/as-of semantics without an unbounded heap projection or false backlog percentage.
- [X] T066 [US7] Complete the common resumable advance experience around the already-migrated action in `web/src/features/protocol/ReleaseTierFees.tsx` and wire recovery entry points into `web/src/features/membership/MembershipExperience.tsx`, `web/src/features/creator/TierManagement.tsx` and `web/src/features/creator/ExpiredMembershipSyncControl.tsx`; distinguish incomplete accounting/zero/no-work/mixed success, refresh status and resimulate after each ordinary transaction, preserve settled claims and add no automatic signatures or custom retry engine.
- [X] T067 [US7] Complete and validate fair tier selection across calls and repeated recovery in the foundation-converted `web/scripts/run-buybacks.ts` and `web/scripts/buyback-rehearsal.ts`; use bounded caller budgets and accounting-only/buyback-only operation, preserve existing trading eligibility/pacing policy and verify no lifetime token-ID scans remain.
- [X] T068 [US7] Extend `web/scripts/run-buybacks.test.ts`, `web/scripts/buyback-rehearsal.test.ts`, `web/tests/e2e/protocol-runner.spec.ts`, `web/tests/e2e/protocol-burn.spec.ts` and `web/tests/e2e/claims-refunds.spec.ts` and new `web/tests/e2e/vesting-recovery.spec.ts` for repeated bounded progress, next-call fairness, partial success and retained standing policy; complete the combined website advance/resimulation journeys for blocked purchase, sync and refund after T066, including fresh refund quotes and still-available settled claims. Show actual cursor/work/asset outcomes without worker reward claims.
- [X] T069 [US7] Add new `contracts/test/VestingCapacity.t.sol` with 10,000 members/100,000 payments/year idle, cold storage, identical endpoints, distinct referrers, long queues and cancellation; measure total recovery transactions/gas and complete-call gas while time advances, actual steps and eventual mutations. Record results in `specs/004-vesting-reward-curves/evidence/implementation.md`; enforce chain limits, target ≤15M gas/25-step processing and ≤2M settled claim/release/cancellation excluding catch-up, and validate or coherently lower the measured 25-step cap in contracts, callers and feature docs before release.

**Checkpoint**: Progress is permissionless, bounded and resumable; a useful successful stage survives unrelated later failures in a valid sufficiently resourced call. No total recovery-cost promise or worker compensation is introduced.

## Phase 10: Cross-Cutting Acceptance and Delivery Evidence

**Purpose**: Verify the complete new protocol and its UI; a checked requirements checklist does not satisfy any implementation gate below.

- [X] T070 [P] Add new `web/tests/e2e/vesting-accessibility.spec.ts` for keyboard operation, semantic summaries, focus/error associations, no chart focus/assistive traversal and meaningful non-repetitive status changes; cover publication/custom input, correction, claims and catch-up, plus default/reduced motion, high-contrast/forced-colors, 200% text zoom and 320 CSS-pixel reflow.
- [X] T071 [P] Document C/Q, boost/horizon bounds, raw/display conversion, cumulative payment volume versus token supply, failed-capacity consequences and permanent cursor in NatSpec in `contracts/src/libraries/RewardCurve.sol`, `contracts/src/interfaces/IMembershipTier.sol` and new `contracts/docs/vesting-and-reward-curves.md`; provide asset-compatibility guidance without a new creator capacity UI or onboarding approval workflow.
- [X] T072 [P] Extend static review coverage in `contracts/test/invariants/AccountingInvariant.t.sol` for exact scaled cash conservation, all protected purposes, donation surplus separation, cross-recipient isolation and no canceled funding reuse; include minimum raw amounts, maximum C/Q/uint64 bounds and adversarial exact-transfer/reentrancy cases using `contracts/test/mocks/AdversarialERC20.sol`.
- [X] T073 Regenerate `web/src/contracts.ts` for final artifacts, run generated drift checks and verify all new-version consumers/fixtures remain current; audit for obsolete fee-only API/top-up/old-router assumptions across `contracts/src/interfaces/IMembershipTier.sol`, `web/src/lib/membership-interfaces.ts`, `web/scripts/protocol-fork-fixture.ts` and related tests without deleting ERC-5643 cancellation or adding compatibility adapters. Known consumer conversions belong to the foundation binding block; this final audit must not be their first implementation.
- [ ] T074 Run and record a named browser/screen-reader session for SC-012 in `specs/004-vesting-reward-curves/evidence/implementation.md`, following `specs/004-vesting-reward-curves/contracts/frontend.md`; verify actual configured summary values, custom input/errors, focus, claims/catch-up announcements, default animation and visual preferences. Fix observed feature-flow gaps in their owning components; automated semantic tests alone do not close this task.
- [X] T075 Re-run clean linked deployment and full-call gas measurements using `contracts/test/deployment/DeploymentScripts.t.sol`, `contracts/test/VestingCapacity.t.sol` and `contracts/scripts/test-deploy-protocol.sh`; update linked source/runtime evidence handling in `scripts/protocol-fork/export-evidence.ts` and `scripts/protocol-fork/verify-evidence.ts` so exact final artifacts and per-stage/cash outcomes are checked, not cached early measurements.
- [X] T076 Run the final SC-002 corpus using `contracts/test/models/run_vesting_histories.py` against the delivered Solidity revision: at least 10,000 reproducible histories of at least 100 economic actions each, nonzero required transition coverage, failed-seed capture, exact scaled conservation/frequency identity and bounded rational recipient attribution; retain the command/results in `specs/004-vesting-reward-curves/evidence/implementation.md`. Rerun affected cases if later fixes change accounting behavior.
- [X] T077 Run the complete contract, web and generated-source checks from `specs/004-vesting-reward-curves/quickstart.md`, record commands/revision/results in `specs/004-vesting-reward-curves/evidence/implementation.md`, and update `.github/workflows/contracts.yml` and `.github/workflows/web.yml` only where needed to run the new deterministic checks and supported linker build; do not weaken existing required checks.
- [X] T078 Extend and run authentic local-fork journeys via `scripts/verify-local.sh`, `contracts/test/e2e/LocalLifecycleEvidence.t.sol` and `web/tests/e2e/helpers/protocol-fork.ts`; include publication, quote movement, free/positive restoration, refunds after claims, every beneficiary claim and combined advance. Record origin/local chain IDs, exact revision, receipts, canonical reads and library/runtime parity; missing private-origin access is a reported blocker, not a reason to call mocks authentic evidence.
- [X] T079 Perform accounting/security and integration review of `contracts/src/libraries/VestingLedger.sol`, `contracts/src/MembershipTier.sol`, `contracts/src/ProtocolBurnRouter.sol`, deployment linking and changed frontend transaction boundaries; run the pinned Slither checks, resolve findings and record scoped results in `specs/004-vesting-reward-curves/evidence/implementation.md`. Do not use unauthenticated Claude review; any external review follows the repository's authorized tooling rules.
- [X] T080 Run the required post-implementation convergence workflow from `.agents/skills/speckit-converge/SKILL.md` and reconcile remaining feature work against `specs/004-vesting-reward-curves/tasks.md`; keep failed/unrun acceptance tasks open and retain exact evidence boundaries. Do not mark the feature complete or deploy solely because tasks or requirements were checked.

## Dependencies and Execution Order

The foundation is deliberately shared because all four allocations, membership weights and reserved refunds participate in one solvency invariant. It grows in two stages: the running one-lot slice T004–T010, then the common scheduler/lifecycle/claims/refund/advance implementation T011–T021 and inseparable binding/consumer integration T022–T025. No story adds a competing ledger or a temporary production compatibility path.

```text
Setup T001–T003
  → small foundation T004–T010 (must pass before scheduler expansion)
  → shared engine T011–T021 (focused differential pass before frontend)
  → binding + tier/router/runner consumers T022–T024 → build/test gate T025
  → US1 T026–T030 → US2 T031–T035
  → US3 T036–T044 → US4 T045–T049 → US5 T050–T054
  → US6 T055–T060 → US7 T061–T069
  → cross-cutting T070–T075 → full histories T076
  → full suites T077 → authentic rehearsal T078 → review T079 → convergence T080
```

User stories remain in specification priority order. Their independent tests can be run separately after prerequisites, but the shared state makes simultaneous edits to the tier/ledger unsafe. US1/US2 supply the economic acceptance for subsequent UI work. All earlier frontend tasks depend on T025, not on regeneration at T022 alone. T023/T024 include the necessary portions formerly deferred to US3/US5/US6/US7; those story tasks now finish presentation and broader acceptance. Any later ABI change must update its consumers and pass the same build/typecheck gate before continuing. US3–US6 use the shared API introduced in Phase 2; US7 completes the combined runner/recovery UI before the final browser release gate. A stale-accounting flow is not reported complete until US7's common UI is integrated; direct permissionless processing is already supported by the foundation.

Only T002/T003, T004/T005, T011/T012, T026/T027, T031/T032, T036/T037, T045/T046, T050/T051, T055/T056, T061/T062 and T070/T071/T072 are parallel groups. Each group waits for the preceding sequential checkpoint. Their file ownership is disjoint within that group. Changes to `MembershipTier.sol`, `VestingLedger.sol`, `ProtocolBurnRouter.sol`, shared UI components and generated bindings remain serialized. `[P]` authorizes scheduling independent tasks, not spawning agents or separate user tasks without the applicable authorization.

## Parallel Examples by User Story

| Story | Concurrent tasks after prerequisites | Why independent |
|---|---|---|
| US1 | T026 + T027 | Payment/time assertions and earned-only release assertions use different suites |
| US2 | T031 + T032 | Recipient examples versus global invariants/harness injection |
| US3 | T036 + T037 | Factory/tier contract assertions versus creator configuration/UI assertions |
| US4 | T045 + T046 | Expiration synchronization versus grants/free/paid restoration suites |
| US5 | T050 + T051 | Refund behavior versus ERC-5643 public-interface coverage |
| US6 | T055 + T056 | Beneficiary withdrawals versus original referral attribution |
| US7 | T061 + T062 | Router outcome assertions versus adversarial external-stage fixtures |

## Requirements and Outcome Traceability

| Requirements | Implementation and focused evidence |
|---|---|
| FR-001–008 | T007, T013, T016, T018, T026–T030, T055–T057 |
| FR-009–014 | T012, T014, T017, T031–T035, T047, T055 |
| FR-015–020 | T004, T006, T008, T036–T044 |
| FR-021–024 | T016–T017, T036, T038, T041, T045–T047, T050–T052 |
| FR-025–026 | T004, T006, T008, T019, T023–T025, T036–T044, T071 |
| FR-027–031 | T017–T018, T045–T049, T055–T057 |
| FR-032–037 | T005, T007, T015, T018–T019, T023–T025, T050–T054, T072 |
| FR-038–042 | T023–T025, T040–T043, T048–T049, T053–T060, T074 |
| FR-043–045 | T013, T019, T021, T024–T025, T061–T069, T075 |
| FR-046–047 | T002, T012, T020, T031–T035, T072, T076 |
| FR-048 | T008–T010, T016–T025, T038, T064–T067, T073, T075–T080 |
| FR-049–051 | T021, T024–T025, T061–T069, T075 |
| FR-052–054 | T042, T048–T049, T053, T058–T059, T066, T070, T074 |
| SC-001 | All story test tasks plus T077–T078 |
| SC-002–004 | T020, T031–T035, T072, T076 |
| SC-005 | T005, T015, T050–T054, T078 |
| SC-006 | T004, T006, T036, T041, T044, T047, T052 |
| SC-007 | T013, T019, T021, T061–T069, T075 |
| SC-008 | T043, T049, T054, T060, T068, T078 |
| SC-009 | T002, T012, T036, T044, T076 |
| SC-010 | T001, T010, T020, T025, T030, T035, T043, T049, T054, T060, T069, T074–T080 |
| SC-011 | T021, T061–T069, T075, T078 |
| SC-012 | T042, T070, T074 |

## Implementation Strategy

1. Complete T004–T010 as the first runnable engineering slice: pure curve, linked one-lot ledger, 120-token proof, refund after claims and actual deployment-size measurements. Stop expansion on failure; do not defer linking or numeric bounds until frontend completion.
2. Grow the same ledger into the shared engine, validate complete economic histories on a focused corpus, then finish US1 as the local protocol MVP. The MVP is an evidence checkpoint, not a request to ship an incomplete product.
3. Close the T022–T025 generated-binding and consumer gate before any story frontend work. Complete US2 and the remaining story integrations in listed order. Every story has an independent acceptance scenario; preserve earlier working paths as tests become broader. Reuse ordinary wallet primitives and regenerate bindings whenever contract shapes change.
4. Complete the full-history, capacity, browser/accessibility, authentic local-fork and review gates on the delivered revision, then converge. A public deployment needs separate explicit authorization and is not an unchecked task hidden in this list.

**Handoff**: This file plans implementation; it does not execute the tasks. There are no task-generation extension hooks configured in `.specify/extensions.yml` at generation time. The constitution still requires read-only cross-artifact analysis after generation and convergence after implementation.

## Final integration discovery

- [X] T086 Correct the combined-advance caller gas budget in `web/src/features/protocol/ReleaseTierFees.tsx`, `web/scripts/run-buybacks.ts` and `web/src/features/protocol/gas-readiness.ts` after the authentic runner exposed minimum-success gas estimation starving release. Keep the existing 15M whole-call budget and exact native simulated request; test wallet funding and actual fork release/burn outcomes. Update old browser payout, curve, refund and removed-getter expectations and fixture-only timestamp gas margins; rerun T077–T078 without weakening their gates. Trace: FR-043–045, FR-048, SC-007, SC-011 and the plan’s combined-advance caller-gas decision.

- [X] T087 Preserve the saved block clock in `scripts/protocol-fork/lifecycle.py` when restoring local review state, and cover older/newer wall clocks and malformed saved metadata in `scripts/protocol-fork/test_lifecycle.py`. Keep the restored-review/fresh-acceptance boundary. Trace: FR-048, SC-008, SC-010 and the plan’s restored local review-clock decision; discovered when the authentic browser regression resumed saved vesting state.

## Phase 11: Convergence

- [X] T088 Preserve Custom identification when a creator combines a preset boost with a non-default window in `web/src/features/creator/RewardCurveControls.tsx`, including review and published summaries. Add fixed-price and PWYW regression coverage for complete terms and token display units, then rerun affected frontend checks. Trace: FR-015, FR-038, FR-053; convergence F1 (partial).
- [ ] T089 Verify and record the named screen-reader acceptance evidence produced by T074 for preset/custom publication, error correction, claims and catch-up/retry, including browser/assistive-technology versions and limitations. Keep the feature acceptance incomplete while that observation is unrun; automated semantic checks do not close it. Trace: SC-012, Constitution V; convergence F2 (partial).

## Atomic advancement and minimum payment revision (2026-09-10)

Earlier completed tasks document the previous implementation, not acceptance of this revision.

- [X] T090 Revise requirements/plan/API documents and analyze the approved atomic/minimum-payment scope.
- [X] T091 Implement atomic accounting-only, buyback-only and combined router calls, skip outcomes and failure/rollback/gas estimation regression tests.
- [X] T092 Implement factory-controlled immutable currency minima and fixed/PWYW boundary, authority and snapshot tests.
- [X] T093 Calibrate $1 currency floors; update deployment configuration, administration, journals, manifests and complete source/runtime verification.
- [X] T094 Regenerate ABI and update UI/runner selection, actions, gas estimation, minimum disclosures and catch-up CTA with focused tests.
- [X] T095 Re-run unchanged deployment payload/gas/graph gates, contract/web/browser validation; record scoped evidence and convergence. Preserve running review fork; no public deployment, commit or push.

## Phase 12: Convergence

- [X] T096 Align SC-011 with approved FR-050 atomic rollback and ordinary buyback skip behavior; retain separate accounting/release/buyback recovery scenarios. Source: SC-011, FR-050, Constitution II (contradicts, HIGH). Browser acceptance remains T095 and named screen-reader evidence remains T089, not duplicate tasks.

### Follow-up: account-wide claims

- [X] Add per-tier settle-and-claim across three categories, restricted factory forwarding and active-referral discovery.
- [X] Add atomic factory claimEverything with eight-tier/25-checkpoint bounds and contextual errors; preserve settled-only claims.
- [X] Add account rewards totals, explicit batches, named advance CTA, fresh simulation, receipt confirmation and refresh.
- [X] Test ownership, all categories, multiple currencies, shared budget, rollback, transfer failures and reentrancy; verify unchanged graph limits.
- [X] Complete frontend regression and generated-binding checks and record evidence in `evidence/account-claims.md`.
- [ ] Rehearse account claims against newly deployed local contracts; preserve the current fork until a fresh deployment is selected.

### Follow-up: gas optimization

- [X] Capture cold execution and refund-adjusted baselines for one/three/eight-tier claims, 1/10/25 checkpoints, queued renewals, staggered boundaries, joining/renewing and combined advancement/direct burn.
- [X] Pack existing bounded ledger values, simplify indexed heap updates, batch global accounting writes and combine ledger claim work without changing economics or public behavior.
- [X] Use the existing OpenZeppelin transient guards and document the proof for unchecked allocation arithmetic; retain all numeric and deployment/gas limits.
- [X] Add gas regression ceilings, randomized replacement/gap ordering, referral restart, claim event and stateful combined-claim coverage; pass the full regular contract and invariant suites.
- [X] Complete 10,000 independent accounting histories and full 10,000-member/100,000-payment capacity recovery on the final optimized source.
- [X] Regenerate/check bindings, verify affected frontend consumers and record final hashes, measurements, deployment gates and scope in `evidence/gas-optimization.md`.

### Follow-up: true accounting previews

- [X] Add bounded STATICCALL-safe previews with settled/current balances, allocation deltas, timestamps and completeness; replace the obsolete settled-only tier endpoint.
- [X] Prove preview/write equality for randomized funding schedules, referrals, rounding, cancellation and suspension; verify bounded reads on large heaps and actual claim payout equality.
- [X] Add vault read-only eligibility after hypothetical release, sharing execution policy without executing swaps.
- [X] Use read-only previews for account/membership earnings and protocol deltas; keep native simulation only at submission and show partial reads explicitly.
- [X] Complete final generated-binding, frontend, invariant and unchanged deployment/gas checks; verify the newly deployed local graph and browser flows. Evidence: [accounting previews](evidence/accounting-preview.md).


### Follow-up: streaming earnings

- [X] Expose projected category rates without storage or economics changes; test subsequent-preview parity and unchanged deployment gates.
- [X] Implement a shared presentation clock, bounded bigint estimates, digit rolling, reduced motion and authoritative accessible values.
- [X] Connect account totals/cards, membership earnings and protocol funding; keep historical and transaction amounts authoritative.
- [X] Finish isolated-fork visual verification, final checks and evidence. See [streaming earnings](evidence/streaming-earnings.md).
