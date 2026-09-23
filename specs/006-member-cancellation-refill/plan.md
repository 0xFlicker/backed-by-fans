# Implementation Plan: Member-Controlled Cancellation and Periodic Refill

**Branch**: `codex/006-member-cancellation-refill` | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)

**Input**: `specs/006-member-cancellation-refill/spec.md`, approved by the user before this planning pass.

## Summary

Replace creator-only paid refunds with NFT-owner/operator cancellation. Split unused prepaid funding using a tier retention percentage that can only decrease, preserve earned credit and protected fractions, and retire the canceled position. Then add owner-authorized, permissionless whole-period refill toward a remaining-time target, strictly before expiration. Refill executes independently of mandatory accounting and uses ordinary purchase economics. Keep existing grant authority, live transfer and natural retirement behavior; successful removal of granted time additionally stops the affected refill enrollment.

The parked removal proposal is historical; its deletion of cancellation accounting and ERC-5643 is not carried forward. No hosted keeper, automatic queue, compatibility path, deployment or migration is added. This plan delivers a new immutable implementation and complete product behavior for later validation, without claiming existing deployments change.

## Technical Context

**Language/Version**: Solidity 0.8.36 / Cancun; TypeScript 6.0.2; Python 3 and shell. Bun 1.3.14 from the existing package pin.

**Primary Dependencies**: Existing Foundry, vendored OpenZeppelin, linked VestingLedger, Next.js 16.3.3, React 19.2.8, wagmi 2.19.5, viem 2.55.19, Wagmi CLI 2.9.0. No dependency additions or upgrades.

**Storage**: Existing immutable tier/ledger state plus tier policy and per-position enrollment. No database, hosted queue or embedded wallet.

**Testing**: Foundry units/fuzz/invariants, independent rational-history model and Solidity replay, existing Fizz coverage, Vitest, Playwright, Slither 0.11.6, linked build and lifecycle-owned local fork.

**Target Platform**: Existing Robinhood EVM deployment configuration; desktop/mobile web; disposable Anvil chain 31337 for local acceptance.

**Project Type**: Solidity protocol and Next.js application with operator/verification scripts.

**Performance Goals**: Caller-bounded accounting; constant-time policy/enrollment changes and refill calculations; no loops over funding lots, owners or positions for cancellation/refill. Preserve resumable standalone maintenance and paginated discovery. Measure linked bytecode/gas against configured target-chain limits; do not claim savings before measurement.

**Constraints**: Preserve scaled conservation, payment-time referral locking, strict expiration, paid-seconds-only cap with the approved exclusive (N + 1)-period limit across all paid additions, exact token movement, fresh re-entry and receipt-owned transaction lifecycle. Creator retention is an intentionally mutable, monotonic term. Existing grant-revocation authority/accounting remain; successful nonzero revocation additionally clears refill enrollment.

**Scale/Scope**: One tier implementation and ledger, shared config/factory/deployment consumers, generated bindings, member/creator/protocol views, accounting models and fork scenarios. Preserve existing 101-position/nine-tier discovery evidence; test historical backlogs exceeding the standard adapter's 25-step budget. Do not add new hard-coded work ceilings to native paths.

## Constitution Check

| Principle / gate | Before research | After design | Design consequence |
| --- | --- | --- | --- |
| I. Creator/member rights | Pass | Pass | Member chooses exit; creator may improve terms; enrollment is separate from allowance. Grant revocation remains explicitly outside the protection. |
| II. Contract fidelity | Pass | Pass | One cancellation core, exact execution-time authority, generated ABI and receipt evidence; new immutable deployment required. |
| III. MIT/open source | Pass | Pass | Modify project-owned code; no archive copying or vendored edits. |
| IV. Plain language | Pass | Pass | Separate stop/cancel actions, explicit refund split and non-guaranteed refill, shared-fund estimates and paused controls. |
| V. Smallest working layers | Pass | Pass | Cancellation first; refill uses ordinary purchase and independent accounting; no queue service or compatibility layer. |
| Workflow/authorization | Pass | Pass | Approved specification used in place; no commits, source implementation or public actions. This pass ends after design. |

No constitutional deviation is needed. A separate clarification pass is omitted because the user approved the specification and its explicit assumptions; the subsequent implementation checklist, tasks and cross-artifact analysis remain required.

## Project Structure

### Documentation (this feature)

```text
specs/006-member-cancellation-refill/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── membership-interface.md
    └── product-contract.md
```

`tasks.md` belongs to the later task-generation pass and is not created here.

### Source Code (repository root)

```text
contracts/src/
  MembershipTier.sol
  MembershipFactory.sol
  interfaces/{IMembershipTier,IERC5643}.sol
  types/MembershipTypes.sol
  libraries/VestingLedger.sol
contracts/test/
  RefundsAndOwnership.t.sol, StandardsInterfaces.t.sol
  Vesting*.t.sol, MembershipRetirement.t.sol, AccountingPreview.t.sol
  models/, invariants/, fizz/, vesting/, deployment/, fork/, e2e/
contracts/script/ and contracts/scripts/
web/src/
  contracts.ts, contracts/types.ts
  features/creator/{config,management-read}.ts
  features/creator/{CreateTierWizard,TierManagement}.tsx
  features/membership/{MembershipExperience,membership-read,VestingSummary}.*
  features/membership/MemberCancellation.tsx          (new)
  features/membership/PeriodicRefill.tsx              (new)
  features/protocol/{payment-flow,payout-reconciliation}.*
web/tests/e2e/
scripts/{verify-local.sh,protocol-fork/}
docs/whitepaper/
```

**Structure Decision**: Keep custody and accounting in existing modules. Add focused view components and read/action helpers at existing ownership boundaries; no generic payment framework. Enrollment is target-only state with owner/referral intent, not a scheduling subsystem.

## Delivery Sequence

1. **Cancellation contract/accounting slice:** Add tier config policy, monotonic setter, owner/operator cancellation, exact split and earned creator credit. Preserve generations/residues and existing retirement; replace creator refund selector and event/report meanings together. Route ERC-5643 to the same core. Update linked build and all config constructors/fixtures.
2. **Cancellation product/proof slice:** Move exit controls to members, add creator retention settings, regenerate bindings, update previews/receipts/reporting, independent model, fuzz and invariant coverage. Verify transferred/operator/paused/fractional cases and complete cancellation end to end before adding refill.
3. **Refill contract slice:** Add tier enablement, owner enrollment/stop, pending referral choice, preview and single-position execution. Reuse ordinary purchase economics, bounded catch-up and exact transfer checks. Clear enrollment on transfer/retirement. Mandatory accounting must contain no refill call.
4. **Refill product/proof slice:** Add target and allowance controls, partial whole-period preview, manual permissionless execution and stop/restart states. Test arithmetic, shared funds, concurrency, transfer, pause, failures, late execution and fresh re-entry in contract/model/browser evidence.
5. **Integrated acceptance:** Update fork scenario producers/verifiers, protocol totals and whitepaper together. Run full local verification and a changed-contract fork with funded review fixtures. Retain evidence tied to source/runtime hashes, and leave the final review environment usable. Source/CI/fork proof does not approve public release.

## Validation and Traceability

| Requirements | Design / evidence |
| --- | --- |
| FR-001–008 | Cancellation contract and product contracts; authority matrix, BPS endpoints/decreases, current-owner payout, fractional conservation, paused exit and retirement tests. |
| FR-009–014 | Enrollment/preview model; target equality, overshoot, cap headroom, balance/allowance limits, pending referral choice and duplicate attempts. |
| FR-015–017 | Strict T-1/T/T+1 tests, no backdated funding, failed-transfer rollback and separate successful maintenance with backlogs. |
| FR-018–021 | Stop without catch-up, cancellation/refill both orderings, transfer callback/reentrancy, pause/unpause and revoked allowance histories. |
| FR-022–023, FR-026 | Member/creator browser journeys, shared-wallet 55/40/20 estimate, incomplete reads, keyboard/narrow layouts, confirmed receipt reconciliation. |
| FR-024–025 | Independent rational model and conservation invariants, generated ABI/event consumers, protocol totals and whitepaper reconciliation. |

All SC-001–007 are represented in these evidence groups and detailed in [quickstart.md](quickstart.md). Review is design-only at this stage.

## Risks and Resolutions

- **Fractional reserve theft/double counting:** Split only raw cancellable gross; creator retention is earned credit, not a second liability. Preserve existing scaled cancellation residues. Report retained totals as an informational subset.
- **Implicit recurring consent:** Per-position owner enrollment; old ERC-20 allowances and NFT operator approval cannot enroll a wallet. Clear intent before transfer receiver callbacks and every retirement.
- **Stale previews:** Native cancellation binds expected owner, a conservatively projected minimum refund and a short deadline; ordinary time decay inside the window is covered, and expired quotes require fresh review. Refill recalculates all limits; zero-work status never pretends a payment occurred. Existing standard adapter lacks native bounds and must be documented.
- **Referral manipulation:** Only owner selects pending attribution; first actual payment locks it. Existing locks prevail after intervening manual payments. Executors cannot alter attribution.
- **Blocked mandatory accounting:** No refill invocation from checkpoints. Each exceptional refill failure reverts its own call; independent maintenance commits progress.
- **Shared environment:** Do not restart current services during planning. Later acceptance uses owned lifecycle records and disposable destructive tests; preserve existing manual-review state until an authorized replacement is ready.
- **Feature identity:** Planning began on `main`; the user subsequently requested `codex/006-member-cancellation-refill` before task generation. `.specify/feature.json` remains the active-feature authority. The removal proposal remains on its parked branch.

## Complexity Tracking

No constitutional exceptions. Retained cancellation accounting is required by the approved exit behavior; per-NFT enrollment is required to distinguish consent from allowance. An automatic scheduler or new queue would add unnecessary complexity and is excluded.

## Cap-change resolution — 2026-09-22

Preserve enrolled targets across creator cap changes; compute paid headroom with a zero floor and permit only currently available whole periods. Existing paid time remains intact. Target-admission validity is checked at enrollment/update, not used to invalidate existing intent during refill. Cap increases can resume purchases. This resolves CHK036 and reconciles grant-versus-paid-cap wording for CHK011.

## Grant-revocation resolution — 2026-09-22

User chose B: nonzero successful grant revocation clears refill enrollment atomically, without refunding funds or changing paid-time rules. Failed/zero-time revocation preserves intent. Use the ordinary “Periodic refill off” state, retain details in transaction history, and include concise creator pre-revocation disclosure and member owner-only re-enablement. No stored stop-reason value is required. This is a targeted addition to existing enrollment cleanup, not a new grant accounting mechanism. CHK037 is resolved.

## Paused configuration resolution — 2026-09-23

User chose A: allow creator capability enablement and owner refill configuration while paused; block payments. Preserve ordinary live-position eligibility and explicit enrollment consent. Unpause permits still-live enrolled positions to refill without reviving stopped/expired ones. CHK038 is resolved.

## Non-live cancellation preview resolution — 2026-09-23

User chose A: return explicit expired-pending/retired status with cancellation unavailable, rather than rejecting the preview or presenting a valid-looking zero quote. Resolve lifecycle before live quote deadline checks. Reuse existing identity/claims/history; no additional retired-owner storage or token-specific claim accounting is required. CHK039 is resolved.

## Analysis resolutions U1/U2 — 2026-09-23

U1: apply a strict less-than-(N + 1)-period bound to all paid-time additions for finite configured N; permit enrollment targets up to N periods. Zero remains unlimited. This allows a paid-only position with a one-period setting to refill before expiry. Preserve grant exclusion, strict expiry and enrollment retention across cap changes. Keep detailed cap wording in whitepaper/technical docs.

U2: absent enrollment reads “Periodic refill off.” Grant-revocation details stay in transaction history; do not add stop-reason state or read fields. Existing enrollment-clearing behavior and owner-only restart remain required.

## Analysis workflow resolution I2 — 2026-09-23

T002 invokes speckit-analyze strictly read-only and receives the report in the conversation. Optional report persistence and approved remediation are separate, explicitly authorized follow-up actions outside that skill invocation. The analysis invocation must not write analysis.md or task markers. Material remediation is followed by a fresh read-only analysis before the gate is closed. This resolves I2 without changing feature behavior or claiming a new analysis has run.
