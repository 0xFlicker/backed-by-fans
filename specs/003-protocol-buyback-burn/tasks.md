# Tasks: Protocol Buyback and Burn With Safe Administration

**Input**: `specs/003-protocol-buyback-burn/` — spec, plan, research, data model, interface contracts, quickstart and acceptance evidence.
**Scope**: Implement the complete disposable environment described in the plan. No public deployment is authorized by this task list.
**Tests**: Required by FR-033. Write focused failing tests before the corresponding implementation; distinguish synthetic, authentic fork, simulated external participation and browser evidence.
**Status**: All 86 tasks are complete on `codex/003-protocol-buyback-burn`. Requirements checklists pass 40/40 and 16/16. Two clean authentic fork runs, full local verification, manual serve/scoped-stop checks and final convergence pass. See `acceptance-evidence.md` for exact source, evidence and public-deployment boundaries.

## Format and paths

Every task uses `- [ ] Tnnn [P?] [USn?] Description with paths`. Paths are repository-relative to `/Users/user/Development/backed-by-fans`; named new files are implementation destinations, not claims that they already exist. `[P]` identifies independent files within the indicated test group after its prerequisites are complete. It does not waive dependencies or authorize concurrent edits to a shared file.

All seven stories have priority P1. The equal-priority phases below put US4 and US6 before US3 so authentic processing has a launched token and authorized configuration. Story numbers retain their meanings from the spec.

## Phase 1: Setup and external evidence preparation

**Purpose**: Reuse the existing monorepo and establish reproducible dependency identities. Do not scaffold another application or treat a discovery observation at `latest` as a pinned fork.

- [X] T001 Review the recorded Pons/Long selection against the implementation source gate and record the complete-testnet search outcome, selected environment, source licenses and outstanding G1–G6 evidence in `specs/003-protocol-buyback-burn/research.md` and `specs/003-protocol-buyback-burn/launchpad-evaluation.md`; retain Pons unless an evidenced mandatory-property failure requires a revised design.
- [X] T002 Pin verified Pons factory/curve/token/hook/escrow/vesting interfaces and required official Uniswap router dependencies in `contracts/src/interfaces/external/` and `contracts/foundry.toml`; preserve upstream licenses and compilation metadata, including deployed anti-sniping/launch-supply behavior missing from the inspected GitHub curve, without handwritten web ABIs.
- [X] T003 Define the retained run/dependency manifest and acceptance-result schema in `scripts/protocol-fork/manifest.schema.json`, covering source commit plus dirty-tree hash, origin block/hash, execution chain, compiler/immutable/runtime identities, Safe roles, asset acquisition, receipts and evidence classes.
- [X] T004 Add read-only `preflight` checks in `scripts/test-protocol-fork.sh` and `scripts/protocol-fork/preflight.ts` for exact archive state, Pons/helpers/Safe/router/WETH wiring, launch availability, authentic USDG/Stock Token/non-stock assets and routes; retain precise failed gates without falling back to latest, mock contracts or invented liquidity.

**Checkpoint**: Dependency inputs and preflight results are explicit. An unavailable external gate remains failed; synthetic accounting development may proceed, but authentic story acceptance cannot pass until its gate is satisfied.

## Phase 2: Foundational contract and test boundaries

**Purpose**: Establish the shared identity, types and minimal earned-fee custody used by every story. Complete this phase before story implementation.

- [X] T005 Add deployment/identity and custody contract tests in `contracts/test/deployment/DeploymentScripts.t.sol` and `contracts/test/ProtocolBuybackVault.t.sol` for immutable token/factory/vault wiring, zero initial inventory, registered-tier-only earned receipts, distinct donations, exact backing and absence of arbitrary withdrawals or calls.
- [X] T006 Define shared types and only the factory/tier/vault interface methods implemented by the foundation in `contracts/src/types/MembershipTypes.sol`, `contracts/src/types/BuybackTypes.sol`, `contracts/src/interfaces/IMembershipFactory.sol`, `contracts/src/interfaces/IMembershipTier.sol` and `contracts/src/interfaces/IProtocolBuybackVault.sol`; introduce later accrual, configuration and execution methods alongside their implementations, without temporary production stubs, caller-selected recipients or generic payloads.
- [X] T007 Implement immutable vault identity, authenticated `recordEarnedFees`, membership/donation source buckets, backing checks, donation synchronization and shared reentrancy protection in `contracts/src/ProtocolBuybackVault.sol`; do not introduce a spending path until the policy/executor stories implement it.
- [X] T008 Wire already-launched token and immutable vault construction through `contracts/src/MembershipFactory.sol`, `contracts/src/MembershipTierDeployer.sol` and `contracts/script/DeployDirectProtocol.s.sol`; remove factory fee-recipient/global-fee/withdrawal APIs and preserve tier identity, media and split-bytecode deployment. Add a dedicated vault deployment helper only if measured deployment limits require it.
- [X] T009 Update `contracts/test/helpers/MembershipTestConfig.sol`, `contracts/test/mocks/MembershipTierHarness.sol` and affected fixture construction sites for the new interfaces, with explicitly synthetic token/executor fixtures separated from authentic fork inputs; preserve existing lifecycle assertions rather than deleting them to accommodate the new deployment.
- [X] T010 Extend the existing generation pipeline in `web/wagmi.config.ts` and `web/scripts/generate-contracts.sh` for contracts/interfaces actually compiled at the foundation checkpoint, regenerate `web/src/contracts.ts`, and align `web/src/contracts/types.ts`; do not require a not-yet-implemented executor artifact. Keep disposable broadcasts outside public deployment discovery and regenerate after each later implemented ABI change.

**Checkpoint**: Foundation tests and generated-binding checks pass. There is no fee-withdrawal compatibility path, unset-token payment deployment or public-network write.

## Phase 3: US1 — Publish a Membership With a Chosen Protocol Allocation (P1)

**Goal**: Publish immutable per-tier allocation terms with accurate creator/supporter review.
**Independent test**: Publish 1%, an intermediate two-decimal percentage and 100%; reject invalid totals/rates and later economic changes. Verify raw splits and zero creator proceeds at 100% in contract and browser-facing tests.

### Tests first

- [X] T011 [P] [US1] Extend `contracts/test/FactoryAndFees.t.sol` with factory and direct-tier validation for 100–10,000 bps, combined rates, independent floor rounding, absent-referral remainder, tiny/zero gross and immutability after ownership transfer.
- [X] T012 [P] [US1] Extend `web/src/features/creator/config.test.ts` and `web/src/features/creator/CreateTierWizard.test.tsx` for default 1%, exact two-decimal percentage parsing, draft restoration, invalid totals, 100% review and continuous earning/refund-backing copy.

### Implementation

- [X] T013 [US1] Implement immutable tier `protocolFeeBps`, matching factory/tier validation and `TierTermsConfigured` changes in `contracts/src/MembershipFactory.sol` and `contracts/src/MembershipTier.sol`; retain payment-token eligibility and ownership-independent published economics.
- [X] T014 [US1] Replace upfront factory fee transfers with protected tier allocation and explicit `ProtocolFeeAllocated` attribution in `contracts/src/MembershipTier.sol`; retain existing creator/reward/referral allocation timing and exact raw-unit split arithmetic, with collection unavailable until US2 earning is implemented.
- [X] T015 [US1] Add allocation input, restored draft validation and full split preview in `web/src/features/creator/config.ts` and `web/src/features/creator/CreateTierWizard.tsx`; explain immediate access, continuous fee earning, periodic buybacks and zero creator proceeds/refund reserves at 100%.
- [X] T016 [US1] Read the immutable published allocation through `web/src/features/membership/membership-read.ts` and show asset/gross/allocation in `web/src/features/membership/MembershipExperience.tsx`; remove global 1% assumptions without falling back to obsolete published-tier interfaces.
- [X] T017 [US1] Extend `web/tests/e2e/create-tier.spec.ts` with wallet-backed 1%, intermediate and 100% publication, invalid totals, keyboard fee entry and narrow-screen review, asserting receipt-derived onchain terms with existing wagmi/viem test tooling.
- [X] T018 [US1] Regenerate `web/src/contracts.ts`, run the focused publication/creator tests and record results in `specs/003-protocol-buyback-burn/acceptance-evidence.md`; label this synthetic/local checkpoint and keep authentic browser acceptance pending US7.

## Phase 4: US2 — Use Memberships Without Depending on a Buyback (P1)

**Goal**: Preserve the complete membership lifecycle while fees earn over paid time and unearned reserves reduce refund funding.
**Independent test**: With collection/markets unavailable, exercise all membership actions; verify the 120-token example, 100% refund backing, fractional periods, stopped collection and refund/release ordering against an independent model.

### Tests first

- [X] T019 [P] [US2] Extend the independent model in `contracts/test/models/MembershipModel.sol` with per-purchase floors, consumed-paid-time entitlement, protocol-first refund funding and explicit cancellation rounding; model stored `allocated = protected holdings + releases + reserve-funded refunds` separately from projected `protected holdings = unearned + uncheckpointed earnings + checkpointed earned-held`, using simple reference lot traversal rather than production checkpoint logic.
- [X] T020 [P] [US2] Add `contracts/test/ProtocolFeeAccrual.t.sol` for the 12-period example, fractional periods, checkpoint-frequency independence, gifts/renewals, varying contributions, free grants, zero-gross paid gaps, expiry/burned credentials and batch limits; assert the documented 12/9/3/0 protected/unearned/uncheckpointed/checkpointed balances before collection and both equations after checkpoint/release at the same timestamp, including a previously released-earned-fee fixture.
- [X] T021 [P] [US2] Extend `contracts/test/RefundsAndOwnership.t.sol` with current-time preview/execution parity, reserve→creator→bounded-top-up funding, 100% zero top-up, failed transfers, refund/release orderings, cancel/rejoin and cancellation residual at most one raw unit.

### Implementation

- [X] T022 [US2] Implement fee-lot paid-clock intervals, cumulative prefixes and O(log lot count) entitlement projection in `contracts/src/MembershipTier.sol`; checkpoint before every paid-time mutation, recognize cumulative differences, preserve zero-fee intervals and exclude consumed grant time.
- [X] T023 [US2] Add logical fee/refund generations in `contracts/src/MembershipTier.sol`; replace `_appendZeroRefundLot`'s unbounded old-array deletion, isolate canceled history and preserve existing gross refund outputs, renewal behavior and previously earned balances.
- [X] T024 [US2] Implement current-time reserve-backed refund preview/execution and component events in `contracts/src/MembershipTier.sol`; fund from unearned reserve then creator proceeds then bounded owner top-up, close the generation atomically and credit any cancellation rounding once to earned-held funds without clawing back earned fees.
- [X] T025 [US2] Implement `protocolFeeState`, fee-lot pages up to 100, public accrual batches of 1–100 historical member IDs and aggregate `releaseProtocolFees` in `contracts/src/MembershipTier.sol`; release only checkpointed earned-held funds via exact transfer plus atomic `recordEarnedFees`, with zero release a no-op and no NFT ownership requirement or member scan. Add the matching accrual/collection/refund-preview methods in `contracts/src/interfaces/IMembershipTier.sol` with their implementations and regenerate `web/src/contracts.ts` before dependent web work.
- [X] T026 [US2] Extend `contracts/test/invariants/AccountingInvariant.t.sol` and `contracts/test/invariants/MembershipInvariant.t.sol` against T019 for arbitrary payment/claim/accrual/release/refund orderings, stored and projected fee conservation even before checkpointing, liability isolation, donated balances, generation resets and no duplicate release; assert cancellation rounding is included once in checkpointed earned-held/releases, never uncheckpointed paid-time earnings, and release is not new revenue.
- [X] T027 [US2] Add bounded-work regression cases in `contracts/test/ProtocolFeeAccrual.t.sol` for large lot histories, logarithmic projections, maximum batches, constant-work release and refund/rejoin without storage-array clearing; record gas measurements rather than relying only on generous test limits.
- [X] T028 [US2] Update refund component reads and review in `web/src/features/creator/management-read.ts`, `web/src/features/creator/TierManagement.tsx` and `web/src/features/membership/MembershipExperience.tsx`, with tests in `web/src/features/creator/management.test.ts` and `web/src/features/membership/MembershipExperience.test.tsx`; show current reserve contribution/top-up and keep payment success independent of buyback status.
- [X] T029 [US2] Extend `web/tests/e2e/claims-refunds.spec.ts`, `web/tests/e2e/join-renew-gift.spec.ts` and `web/tests/e2e/creator-operations.spec.ts` for offline collection, grants/contributions, refund backing and preserved reward/referral/ownership/artwork operations; use canonical post-receipt reads.
- [X] T030 [US2] Run focused model, invariant, accrual, refund and lifecycle checks, regenerate `web/src/contracts.ts`, and record source/synthetic results in `specs/003-protocol-buyback-burn/acceptance-evidence.md`; keep actual burned-fee refund proof for US3/US7.

## Phase 5: US4 — Launch With Purchased Holdings and Earn Trading Revenue (P1)

**Goal**: Establish an authentic ETH-paired token and separate purchased developer holdings from native Pons trading compensation.
**Independent test**: Fresh launch at the verified origin; reconcile launch fee, developer ETH purchase/output, zero free allocations, enabled vested buybacks and zero extra creator tax. Prove native bonding compensation/vesting separately; pool compensation is completed in US5.

**Prerequisites**: Foundation and a passing G1 preflight. US1/US2 are not prerequisites for isolated launch tests, but must pass before deploying the working membership fixture in T034.

### Tests first

- [X] T031 [P] [US4] Add authentic launch tests in `contracts/test/fork/PonsLaunch.t.sol` for verified `TokenParams`, nonzero expected economics, fresh salt, ETH pair, launch fee/purchase separation, initial holdings, no continuing mint/free allocation, creator recipient, vesting toggle and zero additional creator tax.
- [X] T032 [P] [US4] Add native compensation tests in `contracts/test/fork/PonsCompensation.t.sol` for eligible bonding sweeps, creator ETH claims, real vault deposits, partial/additional/final vesting, both beneficiary shares and unauthorized release; label required operator/beneficiary participation and retain authorization checks.

### Implementation

- [X] T033 [US4] Add the local fresh-launch sequence in `contracts/script/DeployForkProtocol.s.sol`, reading `previewLaunchEconomics` and authoritative launch state, recording disclosed developer-funded ETH purchase and actual recipient tax treatment, with Pons vested buybacks enabled and creator tax zero.
- [X] T034 [US4] Extend `contracts/script/DeployForkProtocol.s.sol` to deploy the new BBF factory/vault only after discovering the launched token, preserving canonical dependency relationships and separate developer versus BBF Safe identities; write disposable deployment outputs through `scripts/protocol-fork/manifest.schema.json` outside public broadcasts.
- [X] T035 [US4] Implement the separate external compensation read model in `web/src/features/protocol/pons-read.ts` and tests in `web/src/features/protocol/pons-read.test.ts`, exposing current roles/toggle, pending sweeps, creator ETH, vested/released/claimed amounts and external override history without counting them as membership revenue or burns.
- [X] T036 [US4] Add native fallback/control scenarios in `contracts/test/fork/PonsCompensation.t.sol`: unavailable operator, impact/allocation fallback payouts and labeled recipient/toggle changes; prove BBF custody identities stay fixed and make pool/graduation-dependent scenarios explicit for T068.
- [X] T037 [US4] Execute the authentic launch and bonding compensation scenarios and record receipts, supply/holdings, actual Pons terms and simulated-participant labels in `specs/003-protocol-buyback-burn/acceptance-evidence.md`; complete the launch portion of G2 and bonding portion of G5 only when those artifacts exist.

## Phase 6: US6 — Administer Configuration Through the Protocol Safe (P1)

**Goal**: Deliver bounded Safe configuration and reproducible scripts, with no fee custody withdrawal or custom administration screen.
**Independent test**: Actual threshold-signed Safe calls onboard/disable a token, configure/replace routes and policies, pause/resume and transfer authority to a validated successor. Reject unauthorized, stale and out-of-bound changes; verify inner outcomes and immutable terms. Route-repair processing is integrated in T061.

### Tests first

- [X] T038 [P] [US6] Add authority/configuration tests in `contracts/test/BuybackAdministration.t.sol` for factory-owner-only vault authority, disabled renunciation, validated Safe successor two-step transfer, no deployer/token-holder privilege, typed route validation, policy hard bounds, monotonic revisions and pauses that never reset spending budgets.
- [X] T039 [P] [US6] Extend `contracts/test/fork/RobinhoodSafe.t.sol` with canonical 2-of-3 test-only signatures and real `execTransaction`, checking nonce, inner `ExecutionSuccess`/`ExecutionFailure` and target postconditions for valid, insufficient-signature and forbidden changes; preserve the existing public Safe signer policy.
- [X] T040 [P] [US6] Extend `contracts/scripts/test-manage-payment-tokens.sh` and add `contracts/scripts/test-manage-buybacks.sh` for read/prepare-only CLI behavior, chain/version/code/nonce checks, invalid raw amounts/bounds, decoded payloads and refusal of obsolete withdrawal or direct EOA administration.

### Implementation

- [X] T041 [US6] Constrain ownership transfer to validated Safe successors and retain payment-token enablement semantics in `contracts/src/MembershipFactory.sol`; implement vault authorization using the current factory owner in `contracts/src/ProtocolBuybackVault.sol`, with no duplicated owner registry or residual deployer power.
- [X] T042 [US6] Implement typed pool/route validation, revision invalidation, expiring per-leg policy storage and global/asset processing pauses in `contracts/src/ProtocolBuybackVault.sol`; enforce positive uint128-bounded rates/caps/budgets, tolerance at most 100 bps, lifetime at most 24 hours, finite explicit budgets and no interleaving configuration/donation changes during settlement.
- [X] T043 [US6] Extend `contracts/scripts/manage-payment-tokens.sh` and implement `contracts/scripts/manage-buybacks.sh` per `specs/003-protocol-buyback-burn/contracts/operations-and-evidence.md`; emit reviewable Safe Call payloads with chain/Safe nonce/target/code/revisions/evidence/postconditions and no secrets or implicit submission.
- [X] T044 [US6] Extend `contracts/script/DeployForkProtocol.s.sol` and `scripts/protocol-fork/safe-transactions.ts` to initialize and exercise genuine test-Safe configuration, authentic token onboarding and policies with documented initial 15-minute lifetime, 100-bps tolerance, at most 0.01 ETH-equivalent budget and at most 0.001 ETH-equivalent batches; derive references independently of runner spot quotes.
- [X] T045 [US6] Update `contracts/src/RobinhoodProtocolConfig.sol`, `contracts/scripts/deploy-protocol.sh`, `contracts/scripts/test-deploy-protocol.sh` and `contracts/test/deployment/DeploymentScripts.t.sol` for immutable launch identity, Safe ownership and verified multi-token configuration, removing USDG-only/factory-withdrawal assumptions while preserving public release gates and the applicable 95,000-byte serialized-transaction guard.
- [X] T046 [US6] Write exact operator commands, payload inspection, signature/execution steps, expected inner outcomes and authority limitations in `specs/003-protocol-buyback-burn/quickstart.md` and `specs/003-protocol-buyback-burn/contracts/operations-and-evidence.md`; run CLI and actual Safe tests, recording G6's configuration evidence separately from later browser proof.

## Phase 7: US3 — Turn Membership Fees Into Verifiable Burns (P1)

**Goal**: Collect earned fees and process them permissionlessly into genuine burns, with bounded pricing, isolated inventory and a replaceable gas-funded runner.
**Independent test**: Two unrelated callers collect/process earned fees under the same Safe policy; validate direct, WETH and authentic non-ETH bonding burns against supply deltas, raw-unit ledgers and rejection cases. Stop A and let B complete the next eligible controlled action within two 30-second intervals.

**Prerequisites**: US1/US2 accounting, US4 fresh launch and US6 policy authority. Authentic conversion requires G3 assets/routes; failure remains failed acceptance rather than a mock substitution.

### Tests first

- [X] T047 [P] [US3] Add an independent arithmetic/settlement model in `contracts/test/models/BuybackModel.sol` and policy tests in `contracts/test/BuybackPolicy.t.sol` for one final upward-rounded floor, uint128 boundaries, per-leg units, tolerance/time limits, actual-spend budgets, one-raw-unit undercuts, expired/early/stale revisions and pause/budget replay.
- [X] T048 [P] [US3] Extend `contracts/test/ProtocolBuybackVault.t.sol` and add `contracts/test/PonsBuybackExecutor.t.sol` for direct/market burns, exact supply destruction, authenticated earned receipts, source buckets, malformed venues/recipients, partial-fill refunds, residual ETH, allowances, callbacks and failed/no-op burns using explicitly synthetic fault fixtures.
- [X] T049 [P] [US3] Add runner integration-boundary tests in `web/scripts/run-buybacks.test.ts` for finite captured discovery ranges, round-robin cursor advancement/wraparound across multiple tiers and more than 100 members, eligible expired IDs on later pages, blocked assets, new arrivals and restart without duplicate release; assert the documented finite tier-visit bound, retained scheduled progress, one-shot sweep semantics and library-owned transaction handling without replay of unresolved writes. Keep the small two-interval replacement fixture separate.
- [X] T050 [P] [US3] Add canonical activity/forecast tests in `web/src/features/protocol/protocol-read.test.ts` and `web/src/features/protocol/fee-forecast.test.ts` for stored/projected per-asset conservation, no duplicate payment/release counts, lot schedules, canceled generations, 24h/7d/30d conditional forecasts, partial coverage and unavailable RPC/Pons data; show 3 earned awaiting release but 0 immediately releasable before the example's checkpoint, and reject full-tier reconciliation using partial member projections or mismatched blocks.

### Implementation

- [X] T051 [US3] Implement full-precision upward-rounded per-leg minimum calculations in `contracts/src/libraries/BuybackPolicyMath.sol` using established math primitives, and apply execution-time revision/deadline/policy/budget/inventory checks in `contracts/src/ProtocolBuybackVault.sol`; ordinary callers cannot supply replacement prices or renew budgets.
- [X] T052 [US3] Implement vault-only constrained execution in `contracts/src/PonsBuybackExecutor.sol`: immutable verified dependencies, exact-input official router commands, at most two asset conversion legs, fixed recipients/refunds, WETH unwrap, no allow-revert/arbitrary calls, exact approvals and complete ERC-20/Permit2 cleanup. Introduce matching implemented methods in `contracts/src/interfaces/IPonsBuybackExecutor.sol`; complete the bonding path in T053 before requiring its compiled executable bindings, without production stubs.
- [X] T053 [US3] Implement the bonding path in `contracts/src/PonsBuybackExecutor.sol`, reading authoritative curve state and recipient-specific penalty, waiting until penalty is zero, applying ordinary costs and actual ETH-spent floors, returning all residuals and rejecting zero-output/conversion-only settlement.
- [X] T054 [US3] Complete atomic `process` and observable status/events in `contracts/src/ProtocolBuybackVault.sol`: burn every newly acquired token with measured supply/balance postconditions, direct-burn released protocol-token inventory at revision zero, debit actual source spend, preserve returned assets in the same bucket and roll back spending/budget on failure. Add the implemented execution/status methods in `contracts/src/interfaces/IProtocolBuybackVault.sol`, register compiled executor/vault bindings in `web/wagmi.config.ts` and regenerate `web/src/contracts.ts` before runner/UI integration.
- [X] T055 [US3] Add `contracts/test/invariants/BuybackInvariant.t.sol` against T047, exercising arbitrary caller order, manipulated prices, reentrancy, fee-on-transfer/no-op burns, donation timing, duplicated calls and the 100-units→1-ETH→0.6-spent/0.4-residual example; prove protected tier liabilities and unearned reserves are unreachable.
- [X] T056 [US3] Implement `web/scripts/run-buybacks.ts` with canonical identity checks, in-memory forward cursors and round-robin pages of at most 100 historical IDs per tier visit over finite sweep-start discovery ranges, following `specs/003-protocol-buyback-burn/contracts/operations-and-evidence.md`; retain progress across 30-second scheduled rounds, wrap to new arrivals after the sweep and let `--once` finish one finite sweep. Process eligible fees between pages; blocked assets do not reset traversal. Restart may reset discovery while canonical reads prevent duplicate releases. Use accrue→release→process ordering, exact viem simulation requests/receipts and externally funded gas without a journal, private privilege or uncertain-write retry.
- [x] T057 [US3] Implement captured-block public reads and conditional fee forecasts in `web/src/features/protocol/protocol-read.ts` and `web/src/features/protocol/fee-forecast.ts`, with token/lot pages at most 100, activity pages at most 50, bounded log windows initially 2,000 blocks and separate tier/vault/Pons ledgers; distinguish total earned awaiting release from checkpointed immediately releasable funds, and require matching timestamp/population coverage for projected reconciliation with explicit partial states.
- [x] T058 [US3] Build `web/src/app/chains/[chainId]/protocol/page.tsx`, `web/src/features/protocol/ProtocolActivity.tsx` and `web/src/features/protocol/ProcessBuyback.tsx`, showing wallet-free configuration/history, unearned/earned/released/refunded/donated/pending/burned amounts and conditional forecasts, plus normal wagmi processing and receipt links; distinguish policy, market and automation conditions without claiming an onchain heartbeat.
- [X] T059 [US3] Add authentic bonding/asset tests in `contracts/test/fork/ProtocolBuybacks.t.sol` for USDG, real Stock Token, WETH/liquid non-stock conversions and earned protocol-token direct burns, funded by actual membership payments; acquire authentic assets by real transfers/trades and label any holder participation without patching balances or permissions.
- [x] T060 [US3] Exercise replacement collection/processing in `web/tests/e2e/protocol-runner.spec.ts` and the fork harness using independently funded A/B callers, a bounded eligible fixture and two configured intervals; prove entitlement advances while collection stops and capture actual released/burned amounts plus gas/policy prerequisites.
- [X] T061 [US3] Run bonding burns, Safe route repair/resume, independent illiquid-asset handling and a 100% unused-time refund after earlier earned fees actually burn in `contracts/test/fork/ProtocolBuybacks.t.sol`; reconcile supply, original-asset raw ledgers and per-leg venue costs in `specs/003-protocol-buyback-burn/acceptance-evidence.md` to complete G2/G3 only with authentic evidence.

## Phase 8: US5 — Continue Through Graduation and External Failures (P1)

**Goal**: Preserve memberships and inventory through real graduation, public recovery and post-pool trading without requiring a normal Safe route change.
**Independent test**: Cross the actual threshold, retain partial-fill refunds, exercise intermediate states/recovery, create the authentic pool and burn a later purchase. Compare reserve-based graduation with and without buyer burns; isolate external faults from the authentic success run.

### Tests first

- [X] T062 [P] [US5] Add `contracts/test/fork/PonsGraduation.t.sol` for actual threshold crossing, ready/swept/pool-absent states, public `graduate`/`createGraduatedPool`, partial fills, no routine Safe route update and equal reserve-derived graduation/seedability for equivalent purchases with and without holder burns.
- [X] T063 [P] [US5] Add `contracts/test/fork/ProtocolExternalFailures.t.sol` for labeled graduation failures, frozen assets, missing liquidity, stopped external operators, stale policy/price movement and malformed dependencies; assert membership operations and other eligible assets remain functional.

### Implementation

- [X] T064 [US5] Complete authoritative lifecycle selection and native-ETH hook-aware graduated pool execution in `contracts/src/PonsBuybackExecutor.sol`; validate the actual pool key, distinguish Ready/Swept from tradable states and preserve the same immutable destination and per-leg settlement protections.
- [X] T065 [US5] Extend `web/scripts/run-buybacks.ts` and `web/scripts/run-buybacks.test.ts` for supported public graduation/pool-creation calls followed by fresh lifecycle reads and normal simulations; do not infer pool readiness from a crossing receipt or require administrator authority.
- [x] T066 [US5] Extend `web/src/features/protocol/protocol-read.ts`, `web/src/features/protocol/ProtocolActivity.tsx` and their tests for intermediate lifecycle/pending states and independent Pons-data failure, preserving known membership inventory and surfacing unavailable reads rather than invented success.
- [X] T067 [US5] Execute authentic crossing/recovery/pool burns in `contracts/test/fork/PonsGraduation.t.sol` and `contracts/test/fork/ProtocolBuybacks.t.sol`; retain authoritative transition receipts, real pool/hook identity, actual residuals and supply deltas to complete G4.
- [X] T068 [US5] Complete `contracts/test/fork/PonsCompensation.t.sol` with real pool-trading deposits, curve-graduation earmarks paid as creator revenue, eligible sweep versus fallback accounting, additional deposits and final beneficiary claims; reconcile Pons costs once and complete G5 without counting vesting/LP locks as burns.
- [X] T069 [US5] Run `contracts/test/fork/ProtocolExternalFailures.t.sol` on separately labeled fault branches, proving processing recovery when causes change and perpetual pending for untransferable assets without rescue authority; record external administrator/operator/issuer powers and exact injected changes in `specs/003-protocol-buyback-burn/acceptance-evidence.md`.

## Phase 9: US7 — Reproduce the Complete Product in a Disposable Environment (P1)

**Goal**: Deliver the entire application, scripts, runner and authentic protocol on one reproducible local environment with retained evidence.
**Independent test**: Two clean runs from the same pinned origin pass every mandatory acceptance scenario, with genuine Safe signatures, authentic assets/markets, successful browser traces and reconciled ledgers; `serve` supports manual review and scoped `stop` preserves evidence.

### Tests first

- [x] T070 [P] [US7] Add CLI lifecycle/guard tests in `scripts/test-protocol-fork-cli.sh` for `preflight|run|serve|stop --run-id`, matching block hash, loopback-only writes, private upstream credentials, independent retained evidence location, failure/signal cleanup and refusing to stop another run's processes.
- [X] T071 [P] [US7] Extend `web/tests/e2e/anvil-membership.spec.ts`, `web/tests/e2e/payment-token-selection.spec.ts` and `web/tests/e2e/supporter-account.spec.ts` with the complete authentic asset/member/artwork lifecycle matrix, 1%/100% publication, raw/display-unit assertions, reserved refunds and account discovery against the shared launched token.
- [X] T072 [P] [US7] Add `web/tests/e2e/protocol-activity.spec.ts` for wallet-free Safe/history visibility, actual signed configuration changes, accrual/forecast pages, pending/completed burns, separate native compensation, timestamp/coverage and accessible keyboard/narrow-screen review.
- [X] T073 [P] [US7] Extend `web/tests/e2e/rpc-recovery.spec.ts` and `web/tests/e2e/join-renew-gift.spec.ts` for wrong network, rejected/replaced wallet transactions, insufficient asset/gas, unavailable routes and RPC failure while preserving accurate completed-membership status; exercise the library boundary without implementing a receipt recovery subsystem.

### Implementation and integrated acceptance

- [X] T074 [US7] Complete `scripts/test-protocol-fork.sh` lifecycle modes and reuse shared bootstrap from `scripts/test-web-anvil.sh` via `scripts/protocol-fork/bootstrap.sh`; run isolated RPC 31337, fresh Safe/token/BBF, funded runner and production-built web, guarding all writes from origin 4663 and recording external chain-ID compatibility.
- [x] T075 [US7] Extend `web/src/lib/config.ts`, `web/src/lib/server-rpc-config.ts`, `web/src/lib/authenticity.ts` and `web/src/lib/payment-token-read.ts` for chain/version-scoped new deployment discovery and enabled-token visibility; support generated public mappings only when actual deployments exist, local ephemeral factory injection and preserved Stock Token display scaling without public fork addresses or feature flags.
- [X] T076 [US7] Update `web/tests/e2e/helpers/anvil.ts` and `web/playwright.config.ts` to reuse the same strict fork deployments/test wallets and retain successful as well as failed traces/screenshots, distinguishing authentic asset acquisition from synthetic scaling/freeze injections and forbidding an implicit mock bootstrap for authentic tests.
- [X] T077 [US7] Implement artifact export and manifest validation in `scripts/protocol-fork/export-evidence.ts`, retaining preflight, receipts, source/dependency hashes, Safe inner outcomes, tier lots/generations, vault/Pons ledgers, supply deltas, runner replacement and browser traces before success/failure/termination cleanup; redact credentials and omit keys.
- [X] T078 [US7] Implement independent run reconciliation and the full named scenario checklist in `scripts/protocol-fork/verify-evidence.ts`, mapping every row of `specs/003-protocol-buyback-burn/acceptance-evidence.md` and SC-001–SC-012 to pass/fail artifacts; reject absent authentic Stock routes, graduation, vesting or browser proof even if synthetic suites pass.
- [X] T079 [US7] Run the complete production-built browser/runner/Safe/fork matrix through `scripts/test-protocol-fork.sh run` and fix failures in their owning modules; export the first clean retained run and verify every mandatory scenario through `scripts/protocol-fork/verify-evidence.ts`.
- [X] T080 [US7] Reproduce a second clean bootstrap from the identical origin block/hash through `scripts/test-protocol-fork.sh run`, compare independent outcomes and document incidental address/timestamp differences; exercise `serve` and scoped `stop` and verify both evidence directories survive teardown.
- [X] T081 [US7] Replace planned commands with tested prerequisites/start/reset/manual-review/teardown commands and pass/fail evidence references in `specs/003-protocol-buyback-burn/quickstart.md` and `specs/003-protocol-buyback-burn/acceptance-evidence.md`; report G1–G6 and all mandatory scenarios honestly, including any blocked integration.

## Phase 10: Polish and cross-cutting verification

**Prerequisites**: All story implementation and authentic acceptance tasks. Focused fixes belong to their original modules; do not add a backend, DAO, compatibility deployment, arbitrary adapter registry or custom administration UI.

- [X] T082 Remove obsolete fee-recipient/global-rate/withdrawal remnants from `web/src/features/protocol/authority.ts`, `web/src/features/protocol/withdrawal-reconciliation.ts`, associated tests and `contracts/test/mocks/ReentrantFeeRecipient.sol` only where no surviving feature uses them; preserve creator/reward/referral payout paths and regenerate `web/src/contracts.ts`.
- [X] T083 Review new public copy in `web/src/features/creator/CreateTierWizard.tsx`, `web/src/features/membership/MembershipExperience.tsx`, `web/src/features/protocol/ProtocolActivity.tsx` and `specs/003-protocol-buyback-burn/quickstart.md` against the constitution: disclose Safe/external powers, conditional forecasts and ordinary Pons developer compensation, without full-decentralization, investment-return or Stock Token legal-clearance claims.
- [X] T084 Run `scripts/verify-local.sh` with updated focused CLI tests wired in, including Foundry formatting/build/tests, Slither, generated-binding drift, frozen web dependencies, format/lint/type/build/unit/browser checks; record actual deployment bytecode/gas/serialized-size measurements and any remaining gate failures in `specs/003-protocol-buyback-burn/acceptance-evidence.md`.
- [X] T085 Perform a final custody/accounting/authority and wallet-boundary review of `contracts/src/MembershipTier.sol`, `contracts/src/ProtocolBuybackVault.sol`, `contracts/src/PonsBuybackExecutor.sol` and `web/scripts/run-buybacks.ts`; resolve actionable findings, rerun affected checks and rerun authentic scenarios when the final source change invalidates their recorded evidence.
- [X] T086 Run `speckit-converge` against `specs/003-protocol-buyback-burn/tasks.md` and the final evidence, recording exact source/environment scope and remaining work in `specs/003-protocol-buyback-burn/acceptance-evidence.md`; mark tasks complete only from actual outcomes and do not equate a fork deliverable with a public launch.

## Dependencies and execution order

```text
Setup T001–T004 → Foundation T005–T010
  → US1 T011–T018 → US2 T019–T030
  → US4 T031–T037 (authentic launch needs G1; T034 also needs US2)
  → US6 T038–T046 (authentic configured fixture uses US4)
US2 + US4 + US6 → US3 T047–T061
US3 → US5 T062–T069
US1 + US2 + US3 + US4 + US5 + US6 → US7 T070–T081
All stories → Polish T082–T086 → final convergence
```

The sequential phase order is the default implementation order. Independent tests can be authored before dependent integrations are available, but cannot claim those integrations passed. All test groups marked `[P]` are authored together after their phase prerequisites, then the implementation steps run in sequence; T026 and T055 additionally depend on their independent models. Introduce interface methods alongside their owning implementations: foundation methods in T006–T008, allocation in T013, refund/accrual/collection in T024–T025, configuration in T041–T042 and execution in T052–T054. Each checkpoint compiles without temporary production stubs. Generate only available compiled artifacts at T010 and regenerate after each implemented ABI change before dependent web work.

Each contract increment uses a fresh disposable deployment of its current compiled sources. T034 develops the bootstrap sequence; full executor wiring and funded processing are exercised after T052–T054 by rebuilding that fixture. Do not try to upgrade an earlier immutable fixture, attach an executor through a mutable escape hatch or reuse old addresses as evidence for changed bytecode. T037's launch/compensation evidence can run independently of the not-yet-complete processing deployment.

US4's pool compensation assertions are written with its native compensation suite and executed after US5 supplies an actual pool (T068). US6's repair/resume execution proof finishes in T061; its public browser evidence finishes in T072/T079. These acceptance dependencies are explicit; isolated tests do not make the dependent complete story pass early.

External gates attach to authentic acceptance, not to mathematical unit development:

| Gate | Required task evidence |
| --- | --- |
| G1: exact environment/source/dependencies | T001–T004, T031, T074 |
| G2: fresh launch and ordinary bonding burn | T033–T037, T053, T059–T061 |
| G3: authentic multi-asset conversion and policy | T004, T044, T051–T052, T059–T061 |
| G4: threshold/public recovery/pool burn | T062, T064–T067 |
| G5: genuine native compensation/vesting/fallback | T032, T035–T037, T068 |
| G6: Safe/browser/two clean runs | T039–T046, T070–T081 |

## Parallel execution examples

These are opportunities during a later authorized implementation, not agent dispatch instructions for tasks generation. Shared production files such as `MembershipTier.sol`, the vault, generated bindings and the runner have one writer at a time.

| Story | Independent test work after prerequisites | Subsequent join point |
| --- | --- | --- |
| US1 | T011 contract cases alongside T012 creator parsing/review tests | T013–T018 implement and validate |
| US2 | T019 independent model, T020 accrual tests and T021 refund tests | T022–T025; then T026 uses T019 |
| US3 | T047 math/model, T048 custody/executor, T049 runner and T050 public reads | T051–T054; then model-backed T055 |
| US4 | T031 launch tests alongside T032 compensation tests | T033–T037; pool cases wait for T068 |
| US5 | T062 authentic graduation cases alongside T063 labeled fault cases | T064–T069 |
| US6 | T038 authority tests, T039 signed Safe tests and T040 CLI tests | T041–T046 |
| US7 | T070 CLI guards, T071 lifecycle/asset suite, T072 activity suite and T073 wallet/RPC failures | T074–T081 shared harness and full runs |

## Requirement-to-task index

This is a proposed implementation allocation for the subsequent analysis, **not** a completed requirements-quality review or proof of coverage. `checklists/protocol.md` remains reviewer-owned and unchecked unless separately evaluated with evidence.

| Requirements | Implementation and verification tasks |
| --- | --- |
| FR-001–FR-005 | T011–T017, T024, T038–T045, T071 |
| FR-006–FR-008 | T014, T019–T030, T055, T061, T071–T073 |
| FR-009–FR-010 | T005–T010, T031–T034, T038–T046, T082, T085 |
| FR-011–FR-014 | T007, T025, T047–T061, T067–T068, T077–T078 |
| FR-015–FR-019 | T038–T044, T047–T055, T057–T061, T063–T069 |
| FR-020–FR-022 | T001–T004, T031, T033–T034, T037 |
| FR-023 | T032, T035–T037, T068, T072, T078, T083 |
| FR-024–FR-026 | T053, T059, T061–T069, T083 |
| FR-027 | T012, T015–T017, T028–T029, T071, T083 |
| FR-028 | T025, T035, T050, T057–T058, T066, T072, T077–T078 |
| FR-029–FR-030 | T006, T010, T025, T043, T056–T058, T073, T075, T083, T085 |
| FR-031–FR-035 | T001–T004, T031–T037, T059–T061, T067–T081, T084–T086 |
| FR-036–FR-037 | T038–T046, T048, T055, T061, T072, T083, T085 |
| FR-038–FR-040 | T019–T030, T049–T050, T055–T061, T071–T072, T077–T078 |
| SC-001 | T011–T018, T071 |
| SC-002 | T019–T030, T047–T048, T055, T059–T061, T067–T068, T078–T080 |
| SC-003 | T048, T053–T055, T059–T061, T062, T067 |
| SC-004 | T020–T030, T063, T069, T071–T073 |
| SC-005 | T049, T056, T060, T077, T079–T080 |
| SC-006 | T031–T037, T038–T046, T068, T078 |
| SC-007 | T017, T029, T071–T073, T076, T079–T080 |
| SC-008 | T003–T004, T070, T074, T076–T081 |
| SC-009 | T032, T035–T037, T068, T078–T080 |
| SC-010 | T038–T046, T061, T072, T079–T081 |
| SC-011 | T019–T030, T061, T071, T078 |
| SC-012 | T020–T030, T049–T050, T056–T061, T072, T077–T080 |

## Implementation strategy

1. Run cross-artifact analysis first and resolve material gaps against the spec, plan, interface contracts and user-approved checklist intent. This file does not assert that analysis has passed.
2. Deliver the first complete membership increment as US1 + US2: publish configurable terms, buy time immediately, earn fees continuously, collect only earned amounts and refund from protected reserves. US1 alone is a publication checkpoint; it is not a release-ready fee system without US2.
3. Establish the fresh launch and Safe policy fixture, then complete US3 with direct and ordinary bonding burns. This is the smallest working buyback demonstration; it still lacks the mandatory graduation and full-product acceptance stages.
4. Add actual graduation/public recovery/pool burns and finish native Pons compensation evidence. Keep the working membership lifecycle passing at each layer.
5. Integrate the complete browser product and scripts, retain two clean fork runs and complete final review/convergence. Every P1 story and mandatory evidence gate is required for this feature's deliverable; no intermediate slice authorizes public deployment.

Do not perform commits, pushes, public signing or deployment solely because a task checkpoint passes. A missing authentic dependency is recorded with its failed acceptance scenario, not concealed by a passing unit fixture.

## Approved local policy tools extension (2026-09-08)

Authority and acceptance: [local-policy-tools-plan.md](local-policy-tools-plan.md).
Earlier completed tasks and checklist markers remain historical; these tasks record new work.

- [x] T082 Shared proposal validation, scaled human amounts, sampled reference math and SQLite history.
- [x] T083 Observe/generate/report/review/submit-fork CLI using existing administration checks.
- [x] T084 Optional owned-fork sequential rehearsal with receipts, residuals and cleanup guards.
- [x] T085 Existing-app proposal import/review and Safe wallet signature collection/submission.
- [x] T086 Focused unit, CLI, fork and browser evidence plus executable quickstart instructions.

Extension acceptance: [local-policy-tools-evidence.md](local-policy-tools-evidence.md).


## Approved standing-buyback replacement (2026-09-08)

Authority: [Simple permissionless buybacks](operating-model-proposal.md).
Evidence: [standing-buybacks-evidence.md](standing-buybacks-evidence.md).
The checked items above remain historical; the expiring-policy workflow is replaced,
not maintained alongside this implementation.

- [x] T087 Replace expiring policies with standing minimum/maximum inputs and global/per-currency intervals; regenerate contract bindings.
- [x] T088 Unify ETH/WETH denomination, inventory and clocks while retaining independent fee/donation books and actual-settlement accounting.
- [x] T089 Provide human-unit multi-currency calculations and one combined Safe settings review/save using existing wallet libraries.
- [x] T090 Implement bounded sequential child-fork rehearsal and a one-shot gas-aware runner; prove sequential burns, gas deferral and source isolation.
- [x] T091 Centralize the origin pin, verify a fresh candidate against existing source locks and routes, and document repeatable repinning/restart requirements.
- [x] T092 Exercise authentic shared-currency/global pacing and a browser settings save through a 1-of-1 test Safe.
- [x] T093 Close final UI review findings and verify regressions for stale rehearsal results and stale Safe approvals.
- [x] T094 Complete final contract/web checks and generated-interface verification; retain exact results for this replacement.
- [x] T095 Start the clean final manual fork, verify one personal-wallet Safe owner/threshold, fund that wallet and record the single-server handoff.
