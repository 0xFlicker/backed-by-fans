# Implementation Plan: Transferable Memberships and Permanent Retirement

**Branch**: `codex/005-transferable-memberships` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)

**Input**: User lifecycle requirements recorded in `specs/005-transferable-memberships/spec.md`.

## Current scope and acceptance status — 2026-09-12

**Feature 005 remains open and unvalidated.** The following amendment is part of 005, not a new feature. It supersedes the earlier fixed numeric work limits and deployment approach below. Existing test results remain evidence only for the earlier source snapshot. Reconcile the supporting API/data-model/research/quickstart documents and repeat affected analysis before implementing this amendment; do not alter reviewer-owned checklist markers to imply approval.

### Deployment and initialization

Deploy one locked membership implementation separately and supply its address immutably to the membership factory. The factory directly uses standard OpenZeppelin ERC-1167 clones, without appended immutable arguments, and initializes them atomically before registration. Use deterministic clones with creator/tier-salt-derived salts, preserving identity and duplicate-salt semantics. Remove tier A/B stores, TierCodeConfig and MembershipTierDeployer and their active deployment checks. Retain unrelated buyback dependencies.

Replace constructor-based tier setup with one-time initialize(config), recording the calling factory/vault, creator, NFT metadata, economic terms and accounting state. Use matching pinned OpenZeppelin initializable enumeration/ownership components, disable implementation initialization and expose no upgrade, reinitialization or fixed-economic setters. Each clone has separate storage and a permanently fixed implementation. Use the Robinhood profile (98,304-byte runtime, 196,608-byte initcode, configured 100M gas ceiling), with actual network restrictions distinguished from test budgets. Update public verification tooling for the next authorized testnet deployment; explorer recognition is deferred to that deployment.

### Caller-bounded work and interfaces

Remove hard-coded batch/page/step maxima across all protocol batch paths, including factory, tier, ledger, protocol router, registry/media pagination and batch execution-limit updates. Preserve economic and format bounds. Arrays bound selected operations; maintenance and projections use maxSteps; pages use offset/limit. Custom mutations that currently hide 25-step catch-up gain a caller-supplied accounting budget. Factory claims become claimEverything(requests, maxAccountingSteps), sharing actual consumed steps across tiers. Require sorted unique tier/asset addresses and token IDs where appropriate so duplicate validation is linear; migrate all callers. Remove obsolete maximum getters and compatibility signatures.

Successful standalone maintenance preserves partial chronological progress. Atomic mutation failure rolls back attempted catch-up. Zero-budget operations may settle continuous accrual but cannot cross queued events; standard ERC-5643 signatures require separate maintenance when necessary. Clamp pages against remaining items before arithmetic/allocation. Preserve funding-before-expiration ordering, permanent retirement, fractional credit and every existing authority boundary.

### Claim all and replacement fork

Restore Claim all as the primary action and keep manual selection optional. Use block-pinned discovery, capture the invocation's membership scope, and avoid chasing ongoing accrual/new incoming memberships. Simulate/estimate with headroom, split only for resource constraints, and surface actual authorization/accounting/payment errors. Revalidate each batch, explain ownership changes, correctly include beneficiary categories across split tiers, and retain successful progress on rejection/failure. Continue using wagmi's transaction lifecycle without a new persistent transaction subsystem.

After implementation and relevant local checks, replace only the owned services with a fresh uniquely identified fork using the existing private RPC/pinned origin. Keep RPC 18557, chain 31337 and web 3110; regenerate bindings/fixtures, invalidate obsolete local query state, preserve previous evidence and leave the new services running. No public transaction or explorer acceptance is required for this fork.

### Validation and handoff

Re-run lifecycle/authority/conservation/model suites through clones; test locked/atomic initialization and independent fixed terms; exercise values above every removed cap; prove repeated small maintenance equals larger batches and oversized failures are atomic. Measure equivalent deployment and operation gas, including combined multi-tier claims with accounting work. Run interface generation, tooling/build and focused fork/browser Claim all and lifecycle scenarios. Update integration docs and whitepaper/PDF. Re-run convergence for **005** only after the amended work and required validation finish. No commit, push, public deployment or migration is inferred.

## Earlier lifecycle design baseline

The remaining sections describe the original lifecycle plan. Their fixed numeric caps and deployment assumptions are superseded by the amendment above, while unaffected accounting and product requirements continue to apply.

## Summary

Make each membership NFT an independent transferable position. Replace wallet-based identity reuse with explicit creation and token-ID renewal, and retire expired positions permanently at their actual expiration boundary. A tier coordinator combines the existing funding schedule with a new indexed expiration schedule, settles funding before removing shares, and moves exact earned credit to a separately claimable owner balance before burning. Product flows, discovery, claims, previews, generated interfaces and the whitepaper adopt the same lifecycle.

Remove obsolete soulbound, single-position and historical-weight restoration paths. Existing immutable deployments require a replacement release; no migration, compatibility adapter or deployment is included in this planning run.

## Technical Context

**Language/Version**: Solidity 0.8.36, Cancun; TypeScript 6.0.2; Bun 1.3.14 package manager.

**Primary Dependencies**: Vendored OpenZeppelin ERC721/ERC721Enumerable, Ownable2Step, SafeERC20 and ReentrancyGuardTransient; existing linked VestingLedger/RewardCurve; Next 16.3.3, React 19.2.8, wagmi 2.19.5, viem 2.55.19, TanStack Query 5.102.4, Wagmi CLI 2.9.0.

**Storage**: Tier state: token positions, indexed funding and expiration heaps, retired-owner scaled credit and OpenZeppelin ownership enumeration. No new backend, indexer or persistent transaction storage.

**Testing**: Foundry 1.7.1 in CI; unit/fuzz/invariants and independent history model; Vitest, Playwright/Anvil, Slither 0.11.6; existing linked builds and whitepaper generator. Implement accessibility per the application contract; use available automated/interactive checks, allowing static analysis and source review when those checks are unavailable. Record unverified behavior and tooling limits without claiming a runtime pass; this exception applies to accessibility verification only.

**Target Platform**: Existing Robinhood-profile EVM contracts and responsive web dapp; disposable local fixtures and existing configured fork harness for integration.

**Project Type**: Smart-contract protocol and web application.

**Performance Goals**: At most 25 combined events per maintenance call, 100 positions per discovery page, 256 events per preview and 32 selected IDs across 8 tiers per claim transaction with 25 aggregate accounting events. Indexed updates cost O(log N). No operation scans all historical IDs or an entire portfolio. Benchmark 10,000 scheduled positions, identical expiration timestamps and maximum batch shapes.

**Constraints**: Exact 2^128-scaled credit conservation; existing uint112 lifetime-gross cap and immutable curve; no revival/remint; no unbounded equal-time loop; no beneficiary payout during retirement. Runtime size and transaction gas must fit the intended profile (configured 98,304-byte runtime and 100,000,000 gas), independently of permissive test-runner limits. These are configured local targets, not a claim about current live chain limits.

**Scale/Scope**: All membership mutation/read paths, factory claims, generated web interfaces, account/membership/creator flows, simulator/fixture inputs, protocol docs and whitepaper/PDF. No wallet-position cap beyond tier supply capacity.

## Constitution Check

| Principle / gate | Before research | After Phase 1 design |
|---|---|---|
| I. Creator ownership and durable membership | Pass: creator-support relationship and intelligible terms | Pass: token represents live ownership; historical funding and earned credit survive burn; no investment framing |
| II. Contract fidelity and chain-scoped identity | Pass: source/generated ABI define behavior | Pass: chain/tier/token keys, current owner authority, replacement immutable release, native wagmi/viem transaction boundary |
| III. MIT and open source | Pass | Pass: existing licensed dependencies, no new external service |
| IV. Plain language and honest UX | Pass | Pass: explicit new/renew/transfer and ended-membership rewards; accurate partial progress |
| V. Smallest complete slice and evidence | Pass: separate feature, clean initial checkout | Pass: indexed expiration where necessary; no keeper, migration, fallback or feature flag; evidence classes separated |
| Spec Kit workflow | Pass: user requirements recorded before design | Pass for planning: Phase 0/1 complete; checklist, tasks, analysis and convergence remain subsequent gates |

No constitutional exception is required. Durable membership records do not require permanently unburned credentials: this specification preserves funding provenance and earned rewards. Clarification is complete after three answered questions: live transfers remain available during a pause; refunds are creator-only and pay the current NFT owner; NFT approvals grant transfer permission only. A confirmed follow-up removes checkpoint catch-up from live transfers; pending maintenance cannot block them. The specification, interface, application and validation artifacts reflect these confirmed decisions. A requirements checklist is not omitted from the remaining workflow. Plan completion does not authorize deployment.

## Project Structure

### Feature artifacts

```text
specs/005-transferable-memberships/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── tier-api.md
    └── application-flows.md
```

`tasks.md` belongs to the subsequent speckit-tasks phase and is intentionally not generated here.

### Source areas

```text
contracts/src/
├── MembershipTier.sol
├── MembershipFactory.sol
├── interfaces/{IMembershipTier,IMembershipFactory,IERC5643,IERC5192}.sol
├── types/MembershipTypes.sol
└── libraries/{VestingLedger,RewardCurve}.sol
contracts/src/libraries/ExpirationSchedule.sol  # planned bounded heap module
contracts/test/                               # lifecycle/accounting/claims/models/invariants
contracts/scripts/build-linked-protocol.sh
web/src/contracts.ts                          # generated
web/src/contracts/types.ts
web/src/lib/                                  # membership/account reads, cache, interfaces
web/src/features/{membership,account,creator,protocol}/
web/tests/e2e/
web/scripts/                                  # receipt-ID fixtures, whitepaper generation
web/wagmi.config.ts
docs/protocol/integration.md
docs/whitepaper/{whitepaper.md,outline.md,assets/}
web/public/backed-by-fans-whitepaper.pdf
scripts/                                      # local verification and configured fork acceptance
```

**Structure Decision**: Keep ERC-721 ownership/authorization and the chronological coordinator in the tier, financial calculations and retired credit in the linked ledger, and the expiration heap in a small internal library. Reuse the installed enumerable NFT extension. Update existing UI/data flows rather than adding a service or general transaction abstraction.

## Phase 0 — Research

[research.md](research.md) resolves identity/authority, independent expiration scheduling, equal-time accounting, scaled credit, time mutations, bounded discovery/claims, preview parity and evidence. Read-only accounting and product research ran independently and was consolidated against source and primary standards. No unresolved technical clarification remains.

## Phase 1 — Design

[data-model.md](data-model.md) defines state, invariants, retirement and cursor semantics. [tier-api.md](contracts/tier-api.md) defines the breaking interfaces, authority, limits, errors and events. [application-flows.md](contracts/application-flows.md) defines product behavior and native wallet integration. [quickstart.md](quickstart.md) defines implementation acceptance scenarios and commands.

### Implementation sequence for later task generation

1. **Complete the lifecycle kernel and a local vertical slice.** Add indexed expiration, chronology, exact retired credit, permanent burn and explicit multi-position create/renew/transfer in the tier and independent model. Prove two users transferring a live position, retiring it and claiming after burn. Update interfaces and minimal generated consumer calls coherently; do not publish an intermediate incompatible release.
2. **Cover every mutation and authority boundary.** Wire purchase, gift, contribution, grant, zero-value paths, partial/full revocation, refunds, ERC-5643 and guarded receiver callbacks. Assert schedule invariants and stale-expiry rejection. Remove identity restoration/suspension compatibility paths.
3. **Complete bounded reads and claims.** Add owner pages, retired-credit reads, variable-denominator projections, selected-ID claims and factory aggregate budgets. Extend fractional conservation and preview/write equivalence before consumers rely on the results.
4. **Complete web journeys.** Replace singular snapshot/cache shapes, add explicit intent/ID selectors, safe transfer/approval actions, account pages/claim selections and shared permissionless maintenance. Update simulator, reconciliation and fixtures; retain wagmi ownership of transaction lifecycle.
5. **Complete documentation and proof.** Rewrite lifecycle docs and whitepaper assets, regenerate PDF, run contract/web integration and relevant browser suites, then measure compiled bytecode and bounded worst-case gas. Cross-artifact task analysis precedes implementation; convergence follows it. Deployment remains separate.

### Time mutation matrix

| Operation | Before mutation | Schedule after mutation |
|---|---|---|
| New fixed purchase/gift | Catch up both queues; validate capacity/payment/recipient | Insert new ID at new expiration |
| Fixed owner/sponsored renewal | Validate live entry state; catch up; owner/referral revalidation | Update that ID's key |
| Contribution create/renew, including zero | Catch up regardless of gross; pricing and ID intent | Insert/update; zero gross still schedules expiration |
| New grant / add grant | Catch up; creator authorization; explicit new/target identity | Insert/update without issuing weight |
| Revoke grant | Catch up before time change; validate target | Shorten key; retire now if no time remains |
| Refund / ERC-5643 cancel | Catch up; creator authorization; current-owner payout; cancel funding | Remove key, settle credit, burn and free capacity now |
| Passive time checkpoint | Normalize paid-first time | Absolute expiry unchanged |
| Transfer | Check ERC-721 authority and `now < expiration`; no catch-up or maintenance prerequisite, including while paused | Same ID/time/key and stored accounting; owner/approval/enumeration change only |

### Acceptance coverage

| Requirements | Required proof |
|---|---|
| FR-001–004, FR-013 | ERC-721 owner/operator/receiver tests; token-field conservation and zero checkpoint processing despite backlog beyond 25 steps; multiple same-tier positions; exact expiry rejection; browser transfer |
| FR-005–007, FR-009–012 | Independent chronology model, same-time split tests, scaled conservation, zero-weight expiration and paused permissionless progress |
| FR-008 | Live renewal preserves ID; expired ID never regains weight; fresh creation advances ID and lifetime curve |
| FR-014–015 | 101-position and 9-tier pagination/claim cases; fixed-block reads; stale ownership rejection; per-budget preview/write parity |
| FR-016–017 | Generated ABI checks, affected web/contract tests, reserved funding/original referrer regression, docs/PDF visual checks |

### Material implementation risks and gates

- Existing batched credit assumes constant shares. Exact punctual/delayed and batch-split equivalence, including allocation tails, is a release gate.
- Burn inside catch-up invalidates captured owners/storage references. Validate entry-state expiry and post-catch-up authority; use historical stored eligibility to settle credit.
- Safe transfer overloads can double-enter guards or expose partial state in callbacks. Test exact owner/operator/receiver behavior.
- Projection must simulate denominator/carry/retirement changes without full heap copies. Measure bounded work with large schedules.
- Owner enumeration reorders on burn/transfer. Block-pinned pages and explicit IDs are mandatory; cache tests must preserve same-tier positions.
- The broad local test script enlarges size/gas allowances. Obtain separate intended-profile deployability and gas evidence before declaring release readiness.

## Complexity Tracking

No constitution violations or exceptions. The expiration heap is necessary for funding-free memberships; owner enumeration uses the installed standard extension. Retired credit is one existing-ledger mapping, not an additional reward system.

## Planning validation and handoff

Planning validation covers document links, requirement coverage, phase ordering, matching limits and `git diff --check`. Solidity, generated bindings, application implementation, deployment records and the whitepaper PDF remain implementation work. Next: requirements checklist, tasks and cross-artifact analysis. Collect implementation evidence against actual code rather than inferring it from this plan.

Completed planning checks: all seven artifact links/fences and FR-001–FR-017 identifiers validated; no unresolved template placeholders; `git diff --check` passed. Accounting and product research agents checked the design for contradictions, and corrections cover final-step completion, historical eligibility, expired-target error classification and per-tier preview aggregation. No `.specify/extensions.yml` exists, so before/after-plan hooks do not apply. Runtime tests were not run for this documentation-only change.
