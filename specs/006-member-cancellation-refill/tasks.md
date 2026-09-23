---
description: "Dependency-ordered implementation and validation tasks for member cancellation and periodic refill"
---

# Tasks: Member-Controlled Cancellation and Periodic Refill

**Input**: `specs/006-member-cancellation-refill/` — approved spec, plan, research, data model, interface/product contracts and quickstart.
**Branch**: `codex/006-member-cancellation-refill`
**Created**: 2026-09-22
**Prerequisites**: Implementation checklist and cross-artifact analysis must complete before source edits. No configured before/after tasks hooks exist.
**Tests**: Required by the approved acceptance scenarios and conservation/lifecycle requirements. Write focused tests before the corresponding behavior; confirm a meaningful failing assertion once the test compiles, then implement. A missing symbol alone is not behavioral proof.
**Organization**: Setup → foundation → US1 cancellation → US2 refill purchase → US3 complete controls → cross-cutting acceptance. T001 is complete as document creation only; its reviewer-owned checklist has now been reviewed and all 40 criteria resolved through the recorded user decisions; this is requirements approval only. Implementation progress is tracked below; cancellation evidence is in `evidence/cancellation-progress.md`. Unchecked tasks remain pending.

## Format and paths

Tasks use `- [ ] Tnnn [P?] [USn?] description with paths`. Paths are repository-relative. New files are explicitly labeled. `[P]` means disjoint work within the stated dependency boundary, not authorization to launch agents or run destructive tests concurrently. Shared production files and generated bindings are edited serially. Keep existing dependency pins and preserve unrelated work.

## Phase 1: Setup

**Purpose**: Establish the evidence baseline and required design gates without changing product behavior.

- [x] T001 Create the implementation-readiness checklist at `specs/006-member-cancellation-refill/checklists/implementation.md` (new), covering consent, cancellation conservation, strict expiry, refill failure isolation, UI states and funded acceptance; distinguish it from the existing specification-quality `checklists/requirements.md`.
- [X] T002 Run the repository cross-artifact analysis workflow over `specs/006-member-cancellation-refill/{spec,plan,research,data-model,tasks}.md` and `contracts/` strictly read-only, returning its report in the conversation without writing files or task markers. Outside that skill invocation, separately authorized follow-up work may persist the report to `specs/006-member-cancellation-refill/analysis.md` and apply approved remediation. Preserve the approved scope and resolve blocking findings before implementation; after material edits, rerun read-only analysis on the reconciled artifacts before closing this gate.
- [X] T003 Record the exact source baseline, dirty-file inventory, configured runtime/tool versions and existing review lifecycle/listeners in `specs/006-member-cancellation-refill/evidence/baseline.md` (new); inspect `scripts/verify-local.sh` and `AGENTS.md` without restarting services or exposing private configuration.

## Phase 2: Foundational prerequisites

**Purpose**: Resolve shared constructor/ABI and receipt dependencies before implementing stories. Requires T001–T003.

- [X] T004 Inventory every config encoder, deployment/test constructor, refund/preview event consumer, receipt parser and generated binding affected by `contracts/src/types/MembershipTypes.sol` and `contracts/src/interfaces/IMembershipTier.sol`; record exact edit targets in `specs/006-member-cancellation-refill/evidence/consumer-inventory.md` (new), including `contracts/script/`, `contracts/test/` and `web/src/` consumers found by search.
- [X] T005 Define the approved tier policy/config additions, cancellation preview/result and refill enrollment/preview/result shapes and events in `contracts/src/types/MembershipTypes.sol` and `contracts/src/interfaces/IMembershipTier.sol`; preserve `contracts/src/interfaces/IERC5643.sol` and bind all semantics to `contracts/membership-interface.md` in this feature.
- [X] T006 Thread explicit retention/capability config through `contracts/src/MembershipTier.sol`, `contracts/src/MembershipFactory.sol` and every exact constructor/fixture from T004, including linked deployment consumers in `contracts/scripts/build-linked-protocol.sh`; validate retention range and unsupported periodic pricing without adding default creator decisions or compatibility constructors.

**Checkpoint**: Shared types/config compile with existing pinned dependencies. Do not advertise refill in the product before its controls and acceptance are complete.

## Phase 3: User Story 1 — Cancel under improving exit terms (P1, MVP)

**Goal**: A complete member/operator exit, improving tier terms and preserved earned balances, without requiring periodic refill.
**Independent test**: Given 10 units unused and 30% creator retention, cancel as owner/operator to pay 7 to current owner, credit 3 to creator, burn once and preserve earned fractions. Creator-only cancellation fails; policy decreases apply to existing positions.

### Tests

- [X] T007 [P] [US1] Replace creator-only refund expectations with owner/token-operator/owner-wide-operator authorization, expected-owner/minimum-refund/deadline protection (normal delay, deadline equality, late rejection and expiry-truncated window), retention endpoints/decreases, pause and current-owner payout tests in `contracts/test/RefundsAndOwnership.t.sol`; include sponsor, mixed/grant time, revoked approval and creator independently authorized as an operator.
- [X] T008 [P] [US1] Add raw-gross split, one-unit rounding, protected residue, prior-claim and retained-credit withdrawal conservation tests in `contracts/test/VestingLedger.t.sol` and `contracts/test/vesting/RefundsEntry.t.sol`, explicitly preventing retained-proceeds double counting.
- [X] T009 [P] [US1] Update standard adapter authority, zero-value/event semantics and 0/1/25/26-step rollback/recovery tests in `contracts/test/ERC5643Adapters.t.sol`; verify separate maintenance recovers from AccountingBehind and canceled IDs remain invalid.
- [X] T010 [P] [US1] Add component acceptance tests in `web/src/features/membership/MemberCancellation.test.tsx` (new) for owner/operator selection, complete/incomplete quotes, explicit expired-pending/retired status without a zero-refund action, unknown-ID errors, paused exit, stale review, current estimate versus conservative deadline-floor display, expired quote renewal and pending/failure/receipt states and current-owner payout; no creator-pause prerequisite.

### Implementation and integration

- [X] T011 [US1] Implement monotonic `creatorRetentionBps` changes in `contracts/src/MembershipTier.sol`, validating creation and rejecting increases across administration transfer while applying current policy to every existing position.
- [X] T012 [US1] Refactor cancellation settlement in `contracts/src/libraries/VestingLedger.sol` to preserve its generations/residues, split only raw cancellable gross, record actual owner payout in refunded totals and credit retained raw amount times ledger scale to existing earned creator credit; expose retained proceeds only as an informational cumulative subset.
- [X] T013 [US1] Replace creator `refund` with bounded member-authorized cancellation in `contracts/src/MembershipTier.sol`, share its core with `cancelSubscription`, check current authorization and expected owner, enforce the approved deadline and minimum refund, settle/retire/pay atomically and preserve zero-refund exits and exact-transfer failure rollback.
- [X] T014 [US1] Replace gross-only cancellation projections/events/reporting semantics in `contracts/src/libraries/VestingLedger.sol`, `contracts/src/types/MembershipTypes.sol` and `contracts/src/interfaces/IMembershipTier.sol`; remove old selectors, distinguish canceled gross from actual payout, return known expired/retired cancellation-unavailable status before live quote checks without changing mutation rules, and retain earned/protected fractions and incomplete-projection status; project a conservative refund floor through the selected deadline using scheduled vesting boundaries rather than a flat-rate shortcut.
- [X] T015 [US1] Extend cancellation/retirement histories and fuzz actions in `contracts/test/models/run_vesting_histories.py`, `contracts/test/models/vesting_reference.py`, `contracts/test/VestingHistoryReplay.t.sol`, `contracts/test/invariants/AccountingInvariant.t.sol` and `contracts/test/fizz/handlers/MembershipTierHandler.sol`; compare identical executed histories across accounting delays and prove fresh re-entry cannot restore early weight.
- [X] T016 [US1] Rebuild linked artifacts and regenerate `web/src/contracts.ts` and `web/src/contracts/types.ts` through `web/scripts/generate-contracts.sh`; update remaining cancellation tuple/event consumers from T004 and require `bun run generate:check` to pass without hand-written ABI fallbacks.
- [X] T017 [US1] Update explicit creation retention input and monotonic management controls in `web/src/features/creator/config.ts`, `web/src/features/creator/CreateTierWizard.tsx` and `web/src/features/creator/TierManagement.tsx`; remove creator paid-refund controls while preserving grant/revocation authority and describing its distinction from paid cancellation; disclose that removing gifted time stops an enrolled position's periodic refill.
- [X] T018 [US1] Implement current owner/operator cancellation projections and receipt reconciliation in `web/src/features/membership/membership-read.ts` and the exact receipt-consumer paths recorded by T004; remove pause-confirm-refund assumptions from `web/src/features/creator/management-read.ts`.
- [X] T019 [US1] Implement `web/src/features/membership/MemberCancellation.tsx` (new) and integrate it into `web/src/features/membership/MembershipExperience.tsx`, including selected NFT access for approved non-owners, preserved-claims disclosure, owner-approved minimum-refund/deadline review and a separate accounting catch-up action using the existing wallet lifecycle.
- [X] T020 [US1] Update cancellation-related funding displays and reconciliation in `web/src/features/membership/VestingSummary.tsx`, `web/src/features/protocol/payment-flow.ts` and `web/src/features/protocol/payout-reconciliation.ts`; show actual refunds and retained creator proceeds without adding their informational subset twice.
- [X] T021 [US1] Update/add focused read, creator config and protocol accounting tests in `web/src/features/membership/membership-read.test.ts`, `web/src/features/creator/config.test.ts`, `web/src/features/protocol/payment-flow.test.ts` and `web/src/features/protocol/payout-reconciliation.test.ts`; run them with T010 after the component integration.
- [X] T022 [US1] Add and execute the complete cancellation browser journey in `web/tests/e2e/member-cancellation.spec.ts` (new), including operator selection, creator rejection, transferred beneficiary, paused cancellation, rejected payout, accessible controls and receipt-based final-owner claims.
- [X] T023 [US1] Reconcile current cancellation instructions in `README.md`, `docs/whitepaper/whitepaper.md` and supported integration examples identified by T004; document the member/operator policy, decreasing retention and preserved grant authority with the approved refill-stop consequence so the MVP does not retain contradictory creator-refund guidance.
- [X] T024 [US1] Run linked cancellation/adapter/retirement/model checks and focused web/browser checks, recording exact commands, source hashes and results in `specs/006-member-cancellation-refill/evidence/cancellation-acceptance.md` (new); require all US1 independent criteria before starting refill behavior.

**Checkpoint**: Cancellation is a working end-to-end increment. It does not depend on US2/US3. Local validation does not authorize public deployment.

## Phase 4: User Story 2 — Keep a chosen membership funded (P2)

**Goal**: Owner-enrolled, permissionless whole-period purchases before strict expiration, with bounded work and no mandatory queue coupling.
**Independent test**: On a 30-day tier, target/remaining pairs 7/6 and 45/10 buy one and two periods; 60/60 buys none. Partial funding buys only whole periods. T-1 may succeed, T and T+1 cannot. An independent caller executes without choosing payer or referral.

### Tests

- [X] T025 [P] [US2] Add `contracts/test/PeriodicRefill.t.sol` (new) covering owner-only enrollment, late tier enablement, approval-not-consent, target equality/overshoot, partial affordability, caller limits, exclusive less-than-(N + 1)-period paid caps for N=1 and larger N, zero/unlimited behavior, one-second-below/exact-limit boundaries across manual purchases/sponsorships/contributions/refills, paid-cap versus grant-time headroom, cap reductions below remaining paid time, preserved oversized enrollment, later cap-increase resumption and numeric limits; write assertions for the approved 7/6, 45/10 and 60/60 examples.
- [X] T026 [P] [US2] Add `contracts/test/PeriodicRefillIsolation.t.sol` (new) for strict T-1/T/T+1 execution, long accounting backlogs, rejected/inexact token transfers and independent successful claims/maintenance after failure; ensure no attempted catch-up is falsely retained on revert.
- [X] T027 [P] [US2] Add `web/src/features/membership/periodic-refill-read.test.ts` (new) for current due/blocked/no-work quotes, partial whole-period counts, existing referral locks and read failures distinguished from zero funds.

### Implementation and integration

- [X] T028 [US2] Implement one-way tier enablement, owner enrollment/target updates and owner stop without catch-up in `contracts/src/MembershipTier.sol`; use the enrollment fields in `contracts/src/types/MembershipTypes.sol`, reject unsupported pricing, preserve intent through pause and never infer enrollment from allowance.
- [X] T029 [US2] Implement shared preview/execution whole-period arithmetic in `contracts/src/MembershipTier.sol`, dividing headroom before multiplication and bounding by balance, allowance, target, caller count, paid-time limit, accepted-gross capacity and timestamp/duration headroom; apply the exclusive (N + 1)-period paid limit consistently in shared paid-time addition paths as well as refill, permit target admission through N periods, treat grants as total remaining time but not paid-cap consumption, floor headroom at zero and preserve existing enrolled targets across cap changes instead of reapplying enrollment-admission rejection.
- [X] T030 [US2] Implement permissionless `refillMembership` and preview in `contracts/src/MembershipTier.sol` and `contracts/src/interfaces/IMembershipTier.sol`, returning explicit expected no-work results, using current owner as payer/recipient and ordinary `_purchaseFixed` economics after bounded catch-up; keep `_processAccounting` free of refill calls and propagate exceptional token failures.
- [X] T031 [US2] Integrate pending owner-selected referral choice with existing purchase-time locking in `contracts/src/MembershipTier.sol`: do not lock at enrollment, honor intervening manual locks, revalidate self-referral rules and prevent executors from selecting attribution; add the corresponding scenarios to `contracts/test/PeriodicRefill.t.sol`.
- [X] T032 [US2] Clear enrollment on every retirement and before all transfer receiver callbacks in `contracts/src/MembershipTier.sol`, including self-transfer, successful nonzero grant revocation and grant-only retirement; retain grant-revocation detail in transaction history without stored stop-reason state, preserve enrollment on failed/zero-time revocation, while preserving live transfer without catch-up and rollback on failed enclosing actions; cancellation must never invoke refill.
- [X] T033 [US2] Extend actual refill purchase, enrollment and bounded-failure histories in `contracts/test/models/run_vesting_histories.py`, `contracts/test/VestingHistoryReplay.t.sol`, `contracts/test/invariants/MembershipInvariant.t.sol` and `contracts/test/fizz/handlers/MembershipTierHandler.sol`; distinguish changed execution time from accounting-only delay and retain monotonic lifetime gross.
- [X] T034 [US2] Rebuild linked artifacts, regenerate `web/src/contracts.ts` and `web/src/contracts/types.ts`, and update refill/config consumers found in T004 through `web/scripts/generate-contracts.sh`; pass generated-binding checks before UI consumers use the new types.
- [X] T035 [US2] Implement bounded current-state refill reads and quote/error mapping in `web/src/features/membership/periodic-refill-read.ts` (new), including effective referral, current ownership, due/blocked/no-work reasons and accounting readiness; no persistent scheduler or fund reservation.
- [X] T036 [US2] Add explicit tier periodic-capability configuration and later enablement to `web/src/features/creator/CreateTierWizard.tsx`, `web/src/features/creator/TierManagement.tsx` and `web/src/features/creator/config.ts`, with fixed-positive-price eligibility, enablement allowed while paused and disclosure that enablement neither charges nor enrolls existing holders.
- [X] T037 [US2] Add the initial `web/src/features/membership/PeriodicRefill.tsx` (new) and integrate into `web/src/features/membership/MembershipExperience.tsx` with explicit owner target/referral enrollment, working stop, approval readiness and a selected-NFT refill action for any executor; use existing wallet/receipt lifecycle and do not promise background execution.
- [X] T038 [US2] Add and execute the initial refill browser journey in `web/tests/e2e/periodic-refill.spec.ts` (new), proving owner enrollment, third-party execution, exact whole-period purchase, manual-prepayment target adjustment and failure at expiration against the changed contract.
- [X] T039 [US2] Run linked refill/isolation/model checks and focused read/browser tests, recording source, transactions and outcomes in `specs/006-member-cancellation-refill/evidence/refill-acceptance.md` (new); preserve passing US1 evidence and require the US2 independent criteria.

**Checkpoint**: Refill works through real user actions with a working stop control. US3 completes the broader management, shared-funding and concurrency experience before final acceptance; it is not permission to ship incomplete controls.

## Phase 5: User Story 3 — Control charges and understand coverage (P2)

**Goal**: Complete stop/cancel, allowance, shared-funding, transfer, pause and transaction-state behavior for the integrated product.
**Independent test**: With price 20, balance 55 and allowance 40, show 2.75 balance-equivalent periods and two collectible periods. Stop preserves time; transfer clears enrollment; paused controls work; competing transactions honor their execution order.

### Tests

- [X] T040 [P] [US3] Add `contracts/test/PeriodicRefillLifecycle.t.sol` (new) for stop/restart, pause/unpause, allowance restoration, cancel/refill both orderings, transfer/self-transfer/callbacks, stale ownership, grant-revocation stop/re-enablement (including failed and zero-time cases) and shared-wallet competing purchases; verify all retirement routes clear intent and token operators cannot enroll.
- [X] T041 [P] [US3] Add `web/src/features/membership/PeriodicRefill.test.tsx` (new) for 55/40/20 coverage, shared balance/allowance disclosure, stop versus revoke, paused enablement/enrollment/target-update availability without payments, unpause resumption only for live enrolled positions, current owner versus executor controls and pending/failed/no-work/confirmed results.
- [X] T042 [P] [US3] Add allowance-management behavior tests in `web/src/features/membership/refill-allowance.test.ts` (new), including finite/unlimited explicit choice, supported zero-then-set sequences, reduction/revocation while paused and allowance failures without claiming enrollment changed.

### Implementation and integration

- [X] T043 [US3] Implement the tested payment-token allowance actions in `web/src/features/membership/refill-allowance.ts` (new) using existing approval/transaction utilities from `web/src/features/membership/MembershipExperience.tsx`; only the paying wallet may sign and allowance changes must not silently change enrollment.
- [X] T044 [US3] Complete coverage and stop/revoke/restart controls in `web/src/features/membership/PeriodicRefill.tsx`, with fractional equivalents separated from collectible whole periods, already-prepaid time, concise shared-fund context and paused controls; label restoration/unpause resumption explicitly, and show “Periodic refill off” when enrollment is absent, with eligible owner-only re-enablement rather than automatic restart; keep reason details in transaction history and detailed cap/overhang explanations in whitepaper/docs, not experience-page disclaimers.
- [X] T045 [US3] Integrate transfer-clears-enrollment and new-recipient opt-in disclosures in `web/src/features/membership/TransferMembership.tsx` and refresh enrollment after confirmed transfers in `web/src/features/membership/membership-read.ts`; preserve cached content while marking transient read failures stale.
- [X] T046 [US3] Complete execution-time refresh, ownership/chain/target review invalidation and receipt reconciliation across `web/src/features/membership/MemberCancellation.tsx`, `web/src/features/membership/PeriodicRefill.tsx` and `web/src/features/membership/MembershipExperience.tsx`; never conflate no-work with payment or failed cancellation with stopped refill.
- [X] T047 [US3] Resolve any contract lifecycle failures found by T040 in `contracts/src/MembershipTier.sol`, preserving no-catch-up stop/transfer and mandatory accounting isolation; rerun affected cancellation/refill suites and regenerate `web/src/contracts.ts` only if ABI changes.
- [X] T048 [US3] Expand `web/tests/e2e/periodic-refill.spec.ts` and `web/tests/e2e/member-cancellation.spec.ts` for both transaction orderings, transfer, gifted-time-revocation stop with creator/member disclosures, paused approval revocation, explicit restart, stale reviews, multiple positions and shared allowance; assert actual owner balances, time, enrollment and receipt outcomes.
- [X] T049 [US3] Verify keyboard access, labeled percentage/target fields, focus, accessible status/errors and narrow layouts in `web/src/features/membership/MemberCancellation.tsx` and `web/src/features/membership/PeriodicRefill.tsx`; record tested viewports and any limits in `specs/006-member-cancellation-refill/evidence/accessibility.md` (new).
- [X] T050 [US3] Reconcile creator/member/protocol reporting and supported action surfaces using `web/src/features/protocol/payment-flow.ts`, `web/src/features/protocol/payout-reconciliation.ts` and T004's exact integration inventory; remove contradictory cancellation authority and guaranteed-refill instructions without touching unrelated refund mechanisms.
- [X] T051 [US3] Run the full integrated lifecycle and controls acceptance set from `specs/006-member-cancellation-refill/quickstart.md`, recording US3 results in `specs/006-member-cancellation-refill/evidence/controls-acceptance.md` (new); require unchanged passing US1/US2 behavior.

## Phase 6: Polish and cross-cutting acceptance

**Purpose**: Reconcile all evidence and deliver a usable local candidate after US1–US3 pass.

- [X] T052 [P] Update `docs/whitepaper/whitepaper.md`, relevant diagrams under `docs/whitepaper/assets/`, `README.md` and identified integration guidance; build through `web/scripts/build-whitepaper.ts`, render/inspect `web/public/backed-by-fans-whitepaper.pdf` and ensure claims distinguish grant revocation, earned funds and non-guaranteed periodic execution; document the exact exclusive (N + 1)-period paid cap, all paid-addition paths, N=1 refill example, target bound and unlimited setting here instead of adding wordy experience-page disclaimers.
- [X] T053 [P] Update `scripts/protocol-fork/export-evidence.ts`, `scripts/protocol-fork/verify-evidence.ts` and exact scenario producers from T004 to reconcile owner refunds versus retained proceeds and verify enrollment/refill/retirement receipts; extend `scripts/protocol-fork/manifest.schema.json` only where required by evidence fields.
- [X] T054 Run `scripts/verify-local.sh` with the current linked candidate, including required Slither, generated bindings, independent model replay, invariants/Fizz and browser coverage; measure runtime size/gas against the configured Robinhood limits and record results in `specs/006-member-cancellation-refill/evidence/local-verification.md` (new), fixing failures before proceeding.
- [X] T055 Run a separate disposable destructive fork through `scripts/test-protocol-fork.sh` and `scripts/protocol-fork/lifecycle.py`, following `AGENTS.md`; retain exact run records in `artifacts/protocol-fork/` and verify canceled/expired positions cannot revive and failed payments do not obstruct other accounting. Preserve existing review services and data.
- [X] T056 Prepare the changed-contract manual review environment via `scripts/protocol-fork/lifecycle.py` and `web/scripts/seed-protocol-review.ts`, preserving prior evidence and using chain 31337/RPC 18557/web 3110; restore both supplied wallets, threshold-one Safe signer and required funded memberships/first-month fees, verify actual balances/ownership/readiness and keep OperatorGuarded behavior and the final environment running.
- [X] T057 Execute all applicable quickstart scenarios on the retained candidate, including owner/operator cancellation and third-wallet refill, and record source/runtime hashes, deployment/link manifest and browser/funding evidence in `specs/006-member-cancellation-refill/evidence/final-acceptance.md` (new); separately state source, model, browser and fork proof and any incomplete scope.
- [X] T058 Run the repository convergence workflow against `specs/006-member-cancellation-refill/` and the exact tested source, writing `specs/006-member-cancellation-refill/convergence.md` (new); resolve remaining mandatory findings and repeat only checks invalidated by fixes before marking acceptance complete.
- [X] T059 Reconcile completed task/checklist evidence in `specs/006-member-cancellation-refill/tasks.md` and `checklists/implementation.md`, check `git diff --check`, and produce the manual-review handoff in `specs/006-member-cancellation-refill/evidence/handoff.md` (new) with usable URLs and honest limitations; no push, merge, public deployment or migration is authorized by this task list.

## Dependencies and execution order

```text
T001 checklist → T002 cross-artifact analysis → T003 baseline
  → T004 inventory → T005 shared types → T006 constructors
  → US1 tests → cancellation contracts → bindings → product → T024 acceptance
  → US2 tests → enrollment/arithmetic/execution → lifecycle clearing → bindings/product → T039
  → US3 tests → controls/races/accessibility → T051
  → T052 + T053 → T054 → T055 → T056 → T057 → T058 → T059
```

Within each story, production tasks run in listed order unless explicitly permitted below. T007–T010 depend only on foundation and may be authored together; T011–T014 provide behavior they verify. T015 requires the cancellation semantics, T016 requires finalized contract ABI, and all component integrations require T016. T024 requires every US1 task.

US2 starts only after T024. T025–T027 may be authored together. T028–T033 share contract/model files and run serially; T034 follows ABI stabilization; T035–T038 follow bindings. US3 starts after T039. T040–T042 may be authored together; T043–T051 then integrate their scenarios. If T047 changes ABI, bindings and affected clients must be reconciled before T048/T051.

The stories are incrementally testable, not independent parallel releases: US1 is standalone; US2 builds on its cancellation semantics; US3 validates and completes the integrated controls. No refill feature is considered finished without its owner stop and management tools.

## Parallel examples

- **US1:** After T006, T007 (authority tests), T008 (ledger tests), T009 (adapter tests) and T010 (component tests) touch separate files and can be authored together. Do not run broad formatters across others' changes.
- **US2:** After T024, T025 (refill arithmetic), T026 (failure isolation) and T027 (read-model tests) are disjoint. Implementation changes in MembershipTier remain serial.
- **US3:** After T039, T040 (contract races), T041 (component states) and T042 (allowance tests) are disjoint. T043/T044 consume these tests in sequence.
- **Final:** After T051, T052 (publication artifacts) and T053 (fork evidence tooling) can proceed together. Fork/server mutation and acceptance runs remain serial and lifecycle-owned.

## Requirement traceability

| Requirements | Tasks |
| --- | --- |
| FR-001–002 | T007, T009, T011, T013, T017–T019, T022 |
| FR-003–007 | T008, T012–T015, T020–T024 |
| FR-008 | T010, T017–T023, T049 |
| FR-009–010 | T006, T025, T028, T036–T038 |
| FR-011–014 | T025, T027, T029–T031, T035, T037–T039 |
| FR-015–017 | T026, T030, T032–T033, T038–T040, T055 |
| FR-018–021 | T028, T032, T037, T040–T048 |
| FR-022–023 | T027, T035–T038, T041–T046, T048–T049 |
| FR-024 | T008, T012, T014–T015, T020–T021, T033, T050, T053–T057 |
| FR-025–026 | T009, T016–T023, T034–T038, T043–T054 |

SC-001–003 are proved first by T024; SC-004–005 by T039 and integrated lifecycle checks; SC-006 by T051; SC-007 by T050/T052 and final acceptance. T057 reconciles all seven against one candidate.

## Implementation strategy

MVP is US1 through T024: complete member cancellation and improving terms, with earned-claim conservation and a working UI. Preserve it while adding refill in US2, then complete integrated controls in US3. No speculative queue, background keeper, embedded wallet, contribution-price policy, compatibility alias or new grant accounting rule is introduced; nonzero grant revocation stops refill enrollment as explicitly approved.

A tested local slice can be reviewed without publishing it. Public deployment, commit/push/merge and changing buyback authority require their own user instructions; this task list does not infer them. Update checkboxes only when linked evidence proves completion. Task markers below are the completion record; intermediate proof does not close story acceptance. All 40 checklist criteria have subsequently been reviewed and resolved; the reconciled artifacts have passed pre-implementation analysis, implementation validation and final convergence. See `evidence/final-acceptance.md` and `convergence.md`.

## Phase 7: Crash recovery and bounded local state

- [X] T060 Bound Anvil historical-state retention for both fresh and restored lifecycle runs, verify recent reads/snapshot restoration/old receipts without persisted chainstate, and preserve the policy in `scripts/protocol-fork/README.md`; prevents recurrence of the observed 745 GB temporary-state exhaustion.

- [X] T061 Make the connected wallet's tier allowance controls independent of live NFT ownership/review per FR-022, preserving owner-only enrollment and adding post-retirement/transfer revocation coverage.
