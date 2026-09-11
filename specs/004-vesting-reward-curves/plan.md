# Implementation Plan: Vested Allocations and Early-Support Reward Curves

**Branch**: `main` | **Date**: 2026-09-09 | **Spec**: [spec.md](spec.md)

**Feature selection**: `004-vesting-reward-curves` through `.specify/feature.json`. The setup script reports that identifier as `BRANCH`; `git branch --show-current` confirms the actual checkout remains `main`. No branch was created.

**Input**: `specs/004-vesting-reward-curves/spec.md`.

## Summary

Reserve every payment's creator, membership-reward, referral and buyback allocations until its purchased service time is consumed. Attribute member funding to the eligible historical shares at the time it earns. Give creators immutable More / Some / None reward curves with bounded customization. Shares remain upfront and permanent, including after refunds; creator synchronization suspends eligibility, positive payments restore it, and free access preserves existing eligibility without restoring suspended shares.

Use one chronological funding heap entry per funded membership, generation-scoped queues and Q128 cash accounting. A refund cancels one generation in bounded work and uses only its own unearned funding. A cumulative quadratic-then-linear share function makes adjacent purchase partitions telescope exactly. An immutable linked Solidity library keeps the accounting code out of the factory's recursively embedded creation code. The website, independent clients and existing buyback runner all use the same tier accounting API.

## Technical Context

**Language/Version**: Solidity 0.8.36, Cancun EVM; TypeScript 6.0.2, Next.js 16.3.3, React 19.2.8; Bun 1.3.14. Python 3 standard library for independent rational evidence.

**Primary Dependencies**: Existing vendored OpenZeppelin Math/SafeCast/SafeERC20 and access/reentrancy controls; Foundry; wagmi 2.19.5, viem 2.55.19, TanStack Query 5.102.4 and Wagmi CLI 2.9.0. No new runtime package. `VestingLedger` is project code linked immutably at deployment, not an upgradeable service.

**Storage**: Authoritative onchain tier state, including allocation queues, indexed heap, scaled earned/reserved balances, recipient credits and immutable curve terms. No new database, mandatory indexer, transaction journal or privileged collector.

**Testing**: Foundry examples/fuzz/invariants, independent rational history comparison, Vitest, Playwright, Slither 0.11.6 and existing authentic local-fork rehearsal. Source/model, local, browser, target-environment and public-chain evidence are separate.

**Target Platform**: Current Robinhood EVM deployment and payment-token catalog, chain-scoped by protocol version and role; authentic local fork uses chain 31337 with source chain 4663. Public deployment is outside this planning authorization.

**Project Type**: Immutable Solidity membership protocol and Next.js dapp, with deployment and buyback operator CLIs.

**Performance Goals**: At most 25 heap boundaries per direct processing transaction and a shared maximum of 25 accounting boundaries across all tiers per combined advance; O(log M) boundary/cancel work and O(1) queue append/prefix accounting, plus heap insertion when needed. No lifetime scan in purchase, refund, sync or claim. Exercise 10,000 memberships, 100,000 payments and one year idle. Aim for <=15 million gas per maximum processing batch and <=2 million for a claim/release or cancellation excluding bounded catch-up; absolute target-chain limits remain mandatory. Benchmark worst-case cold storage and distinct referrers.

**Constraints**: Lifetime positive gross and enabled curve horizon <=2^112−1 raw units; boost 1.00x–10.00x in 0.01x steps; uint64 duration/timestamp checks. Q=2^128 scaled cash. Immutable terms and permanent shares. Existing exact-transfer token policy. Target runtime <=98,304 bytes, initcode <=196,608, encoded deployment transaction data <=95,000, and tier base creation code <=49,150 across existing two stores. Use actual payloads and deployed artifacts, not relaxed test-harness limits, for these gates.

**Scale/Scope**: Seven user stories, 54 functional requirements and 12 success criteria. Contracts, factory/deployment graph, generated bindings, creator/member/referral views, refund and synchronization flows, combined advance and buyback runner change together. No historical deployment migration, compatibility API, feature flag, new trading policy or share vesting. Worker compensation is deferred to a future pre-release specification.

## Constitution Check

| Principle or workflow gate | Before research | After design |
|---|---|---|
| I: Creator ownership and durable membership | Pass: scope preserves identity and creator terms | Pass: curves immutable; share weight distinguished from promised payouts; no investment framing |
| II: Onchain fidelity and chain-scoped identity | Pass: immutable replacement version, no migration | Pass: generated ABI, deterministic linked dependency, receipt-derived outcomes, existing wallet lifecycle |
| III: MIT and open source | Pass | Pass: existing dependencies and project library, no licensing change |
| IV: Plain language and honest UX | Pass: disclose permanent economic choices | Pass: earned versus reserved, incomplete accounting, actual issued shares and claim amounts have explicit UI contracts |
| V: Smallest complete slice and scoped evidence | Pass: no speculative services or flags | Pass: one accounting engine replaces old fee/upfront paths; ordered complete slices and separate evidence gates |
| Spec before implementation | Pass | Pass: design only; no application code implemented |
| Clarify/checklist/tasks/analyze/converge | Pass: spec explicitly resolves lifecycle assumptions | Pass: separate clarify pass omitted because no additional product decision is needed to choose this design; risk checklist, tasks, analyze and converge remain required |
| Dirty work and external authorization | Pass: untracked feature files came from this task | Pass: no commit, push, deployment or unrelated edits |

No constitutional exception is needed. Mathematical behavior, numeric input bounds, and performance/deployment verification remain explicit implementation obligations, not claimed successes. Per-asset economic calibration and approval are outside this feature. Any change to accepted economic behavior must be explicit in the specification.

## Project Structure

### Documentation (this feature)

```text
specs/004-vesting-reward-curves/
├── spec.md
├── plan.md
├── research.md
├── calibration.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tier-api.md
│   └── frontend.md
├── evidence/
│   ├── curve-calibration.py
│   └── accounting-arithmetic.py
└── checklists/requirements.md
```

`tasks.md` belongs to the later speckit-tasks phase and is not created by this plan.

### Source Code (repository root)

```text
contracts/
├── src/
│   ├── MembershipTier.sol
│   ├── MembershipFactory.sol
│   ├── MembershipTierDeployer.sol
│   ├── ProtocolBurnRouter.sol
│   ├── libraries/VestingLedger.sol             # new linked leaf library
│   ├── libraries/RewardCurve.sol               # new small pure internal library
│   ├── types/MembershipTypes.sol
│   └── interfaces/IMembershipTier.sol
├── scripts/deploy-protocol.sh
├── script/                                   # deterministic deployment consumers
└── test/
    ├── models/                               # independent interval oracle
    ├── invariants/
    ├── deployment/
    ├── fork/
    └── e2e/
web/
├── src/contracts.ts                          # generated only
├── src/features/creator/
├── src/features/membership/
├── src/features/protocol/
├── src/lib/                                  # canonical reads and discovery
├── scripts/run-buybacks.ts
├── scripts/buyback-rehearsal.ts
└── tests/e2e/
scripts/protocol-fork/                        # linked dependency/runtime evidence
```

**Structure Decision**: Extend the existing contracts/web split. Keep ledger storage and arithmetic in one library; the tier retains identity, access control, token custody and transfers. A small pure curve helper remains internal to the linked ledger. Deploy the two existing STOP-prefixed tier bytecode stores in separate canonical CREATE2 transactions and pass their verified immutable references, total length and expected reconstructed hash into the factory constructor and its factory-bound tier deployer. The factory and tier deployer must not embed `MembershipTier.creationCode`. The deployer validates exact chunk sizes, STOP prefixes and reconstructed hash at construction, pins both runtime hashes and revalidates them at tier creation. No setter, upgrade authority or compatibility constructor exists. The creator still creates a fully initialized tier in one factory transaction.

**Deployment dependency order (user revision, 2026-09-09):** independently compile the ledger → derive its immutable CREATE2 address → compile linked tier bytecode → split bytes into A/B and derive both store addresses → encode the factory constructor with these store references → derive the factory address. Tier bytecode has no constructor-specific factory address; that address is supplied only when a creator creates a tier. The factory constructs its vault, router and tier deployer with `address(this)`, so there is no circular address dependency or nonce reservation. Public wrapper order is ledger, media factory, renderer, preview harness, store A, store B, factory. Stores may already exist at their exact deterministic addresses; validate them before reuse. The resumable journal pins seven exact initcode/runtime hashes, constructor arguments and raw CREATE2 payload sizes. Reject missing/corrupted stores and old journal schemas; never migrate an old deployment. Measure every deployment transaction and the complete child graph under unchanged size and gas gates, with substantial factory payload headroom rather than byte shaving.

## Phase 0: Research Decisions

[research.md](research.md) records decisions, rationale, rejected alternatives, formulas, numerical bounds and source references. [calibration.md](calibration.md) contains mathematical behavior evidence and clearly separates it from economic suitability claims, which are outside this feature.

Resolved questions include dynamic recipient attribution, zero-value service gaps, constant-size cancellation, payout identities, zero-eligible reserves, rounding ownership, catch-up liveness, overflow-safe curves, UI authority and deployment composition. The subsequent requirements review tracks remaining clarifications; CHK035 is resolved at requirements level: callers choose bounded work, progress is resumable, and implementation discovery measures gas and recovery throughput.

## Phase 1: Design Outputs

- [data-model.md](data-model.md): storage concepts, lifecycle ordering, equations and invariants.
- [contracts/tier-api.md](contracts/tier-api.md): public ABI changes, errors, events, read completeness and buyback collection semantics.
- [contracts/frontend.md](contracts/frontend.md): creator controls, previews, receipt reconciliation, earned/reserved views and independent-client parity.
- [quickstart.md](quickstart.md): runnable evidence commands and required scenarios; commands for future implementation are identified as such.

## Implementation Sequence for Task Generation

1. **Arithmetic, oracle and deployment foundation.** Implement the pure curve and slow rational history oracle; prototype the linked ledger with one lot and all four allocations. Wire deterministic library linking and immediately measure the whole creation graph. Prove the 120-token example, zero cash at purchase, exact final vesting and a partial refund after claims. Freeze the numeric input bounds from this plan. This slice must compile and run before extending the scheduler.
2. **Chronological scheduling and cancellation.** Add funded queues, indexed heap, delayed START gaps, generation cancellation, scaled referrer/creator/protocol credits and protected cancellation reserves. Exercise multiple memberships, same-time boundaries, zero-value intervals and long queues. Replace fee-only accounts and the redundant variable-refund machinery.
3. **Dynamic member attribution and lifecycle.** Add index/carry epochs, eligible-vector settlement, permanent curve shares, positive-only reactivation, sync cutoff and final grant-only revocation. Update refunds to settle then cancel then suspend. Integrate all three beneficiary claims and earned-only protocol release. Run independent differential histories and frequency replays before frontend work.
4. **Public interface and combined advance.** Update factory/config/events/interfaces and regenerated bindings. Replace old per-token collection and the router's old burn entry point with one permissionless advance. Isolate accounting, release and purchase stages; any completed useful work makes the call successful. Apply a shared accounting-step budget across tiers, measure combined gas including external operations, and preserve market policies and per-currency failures. Cover accounting-only progress, failed release after accounting, failed trade/measurement after progress, and idle/no-work calls. Worker compensation remains future scope. Update deployment/fork manifests and generated-source checks for the linked library.
5. **Creator and supporter flows.** Use the documented initial defaults and valid customization ranges; no per-asset default approval gate is required. Add preset/custom curve preview and immutable review; update canonical quotes, access restoration, all balances, claims, refunds and catch-up UI. Use supplied successful receipts for actual outcomes. Apply FR-052–054: accessible summary/controls without chart traversal, usable focus/errors/statuses, ordinary default animation, reduced motion and high contrast. Reuse existing frontend foundations and verify SC-012 in the changed flows. Each completed UI slice must work against the local new protocol, without a feature flag or alternate legacy path.
6. **Capacity, adversarial verification and release evidence.** Complete 10,000 x 100-action differential histories with coverage; the 10k-member/100k-payment/year-idle test; exact deploy-size/gas gates; browser journeys; static/security review; target-environment rehearsal and convergence. Record results for the actual implementation revision. Public deployment requires separate authorization.

This is sequencing guidance, not a generated task list or claim of implementation completion.

## Verification and Traceability

| Requirements | Main implementation seam | Required evidence |
|---|---|---|
| FR-001–008 | Payment lots, scaled cash, known beneficiaries | Story 1/6; all four partial/full entitlements, paid-first queues, pause and transfer |
| FR-009–014 | Scheduler and reward-index epochs | Story 2; rational attribution, empty pool, carry and frequency identity |
| FR-015–026 | Curve helper, publication and quotes | Story 3; exact telescoping, max inputs, immutable terms, calibration |
| FR-027–031 | Access versus reward-eligibility transitions | Story 4; sync cutoff, free preserve, positive restore, grants, durable claims |
| FR-032–037 | Generation cancellation and protected reserves | Story 5; no top-up after all claims, residual bound, rollback and exact transfers |
| FR-038–043 | Canonical read models and receipt reconciliation | Stories 3/6/7; observed browser and independent-client operations |
| FR-044–051 | Combined advance, bounded recovery, deployment and reference model | Story 7; SC-002/003/004/007/009/010/011, atomic rollback and unavailable-buyback skips, no worker payout, and unchanged buyback policy |
| FR-052–054 | Accessible summaries, controls, statuses and visual preferences | SC-012; keyboard/screen-reader journeys, zoom/reflow, contrast and default/reduced motion |

Every retained raw or scaled unit must have a named ledger purpose. Exact conservation is necessary but insufficient: compare each beneficiary's lifetime payouts plus remaining earned credit and verify exclusion during suspension. Repeated processing/claims must produce identical scaled state after equal economic histories; ideal continuous attribution is compared with the explicit research bound.

## Material Risks and Stop Conditions

- **Chronology and cancellation:** Incorrect END/START ordering or generation accounting can transfer one payment's funds to another cohort. Stop progression to UI until the independent oracle passes these paths.
- **Scale and liveness:** CHK035 selects a combined permissionless advance and the existing runner for recovery; worker compensation is future scope. Callers choose maxAccountingSteps within the protocol cap. Total gas and recovery throughput are implementation-discovery measurements, not a pending product-approval gate. Capacity measurements select a cap of 25: cold combined calls with 10,000 members and all four allocations peak below 15 million gas. The initial 100-step proposal exceeded that budget. A mathematically bounded step can still be expensive. Measure cold-storage, equal-timestamp and distinct-referrer maxima; finalized boundaries must never be repeated. Recheck the 25-step cap on the final revision, retaining the same gas limits and bounded resumable semantics.
- **Deployment:** The linked library and complete factory payload must satisfy all real target limits. Relaxing Forge flags is not a repair. Failure requires a revised design, not a deployment attempt.
- **Token units and presets:** Exact raw-unit bounds can reject high-decimal nominal values even when display input looks small. Do not clamp; require a valid creator-entered amount. SC-009 covers mathematical behavior and input bounds. Per-asset economic optimization and approval are outside scope; creators choose their immutable terms before publication.
- **Accepted economics:** Refunded early weight survives and tiny positive payments restore all historic shares. Free extensions preserve eligibility. Disclose and test these behaviors rather than silently “fixing” them.

## Complexity Tracking

No constitution violations. The heap is required by time-ordered funding with bounded recovery; the linked library is required by the existing deployment-size constraint. No compatibility layer, new service or generic scheduling framework is proposed.

## Planning Completion

Phase 0 research and Phase 1 design are complete. The pre/post constitutional gates pass at design level. `.specify/extensions.yml` is absent, so no before/after-plan hooks apply. The existing requirements checklist checks specification quality; the next workflow stage should create the accounting/security/UX risk checklist, then generate tasks and run cross-artifact analysis before implementation.

### Implementation finding: refund review on a progressing clock

A local public-entry regression demonstrated that one elapsed second changed unused gross from 120 to 119 while the historical refund view still reported 120 with `complete=false`. Requiring a settled-to-current-block cursor for every review/click would force repeated catch-up even without a due checkpoint. Use the already permitted constant-work projection for `previewRefund` only: append `fundingAsOf` and `projected`; when no global boundary is due, compute cancellation from the unchanged active head and prefixes at now. Keep settled completeness, claimable balances and all storage unchanged. At any pending boundary return historical financial amounts and require bounded processing. UI labels projection explicitly and always performs fresh refund simulation with the original maximum. Verify projected versus actually processed funding/residue equality, unrelated/global END boundaries, zero/waiting heads and numeric bounds. Regenerate bindings and repeat exact linked deployment graph/payload and unchanged gas/size gates because library bytecode determines every dependent CREATE2 address. No migration or compatibility path is added.

### Combined-advance caller gas (authentic integration discovery)

The earlier partial-success design allowed native estimation to underfund later stages. Atomic advancement now propagates attempted failures, so the website and runner use native estimation and forward the exact simulated request. Remove the fixed 15M submission override and affordability padding. The existing 15M measured whole-call acceptance target remains unchanged; it is a test limit, not a mandatory transaction gas limit.

### Restored local review clock

A saved Anvil state includes a block timestamp, but interval mining after `--load-state` starts from wall time. Restore review forks to one second after the greater of the saved timestamp and the node’s current timestamp before serving the app. Fail visibly when saved clock metadata is missing or invalid. This preserves the ledger’s monotonic-clock invariant; restored review continues to be excluded from fresh acceptance.

## Approved implementation revision (2026-09-10)

FR-050 is replaced by atomic failure propagation. This section supersedes earlier isolated-stage and gas-override instructions above. Shared internal typed calls implement accounting-only, buyback-only and combined entrypoints; no gas-capped self calls or swallowed attempted failures. Known unavailable buybacks emit skip outcomes; revision mismatch reverts. Keep bounded budgets and next-source fairness. Update callers, generated ABI, tests and deployment/runtime graph together.

Add a factory currency minimum, passed authoritatively into immutable tier terms. Require configured positive minima before enablement, validate fixed per-period publication and positive PWYW input; retain zero access. USDG floor is 1e6; volatile token floors use dated calibration with no oracle. Existing deployments remain untouched. Fixed UI batch 25; protocol default auto-selection plus explicit tier selection. No catch-up at publication. All earlier size/gas limits remain gates.

### Publication minimum review

TierConfig includes the reviewed raw `minimumPayment`. The factory compares it with the current registry value and reverts `MinimumPaymentChanged(expected, actual)` if administration changed it before inclusion. The immutable tier binding uses that same value. The frontend refreshes review instead of silently accepting changed terms.

## Account-wide settlement and claims (2026-09-10)

`MembershipTier.claimAll()` settles up to 25 checkpoints and pays the caller's member, referral and current-owner proceeds in one exact token transfer. Individual settled-only claims remain usable while accounting is behind. Fractional credit and per-category events are preserved. `claimAllFor(beneficiary,maxSteps)` is restricted to the immutable factory and pays the beneficiary directly.

`MembershipFactory.claimEverything(tiers)` accepts 1–8 unique registered tiers and shares 25 actual checkpoint operations. A depleted budget permits continuous integration only when no checkpoint is due. All claims and advances roll back on failure. `ClaimAccountingBehind(batchIndex,tier,accountedThrough,nextCheckpoint)` identifies the first blocked tier; `ClaimFailed(batchIndex,tier,reason)` retains other underlying errors. The factory is nonreentrant, has no claim custody and deploys no additional helper. Existing deployment bindings, source verification and payload/gas limits remain unchanged.

The account page shows three-category totals by currency from a simulated factory claim. Larger collections use explicit batches. Discovery coverage is labelled; `hasClaimInterest` includes active referral streams before first settlement. A behind error yields a named tier link and a separate permissionless advance. Writes use fresh wagmi simulations unchanged. Changed claim/advance intent requires review before signing. Receipts confirm success, then canonical reads refresh. No transaction journal or compatibility path is introduced.

Newly deployed immutable contracts are required. Existing fork state is not rewritten to imitate the new interface.

## Gas optimization pass (2026-09-10)

Measure cold execution against `5e01826` using the same fixtures and compiler settings. Optimize storage and repeated accounting work first: pack bounded raw lot amounts into seven words, reduce each heap node to two words, derive its generation/head from the live funding account, and sift the replacement boundary directly. Accumulate global vesting totals in memory during each bounded batch and distribute once with the same carried remainder. Keep referrer settlement at each boundary and preserve all scaled conservation identities.

Combine catch-up and three-category collection inside the existing linked ledger for `claimAll`; the tier still authorizes identity/ownership and transfers funds, and the factory still bounds and contextualizes the batch. Preserve public events, selectors, return values, atomic rollback, and individual settled-only claims. Avoid writes for empty referral claims and zero debits. Use the already vendored OpenZeppelin transient reentrancy guard in tier/factory/router under the existing Cancun target; EIP-1153 support is required. The only new unchecked arithmetic is payment splitting, with the existing uint112 gross and constructor-validated total BPS bounds documented at the block.

Retain 25 checkpoints, eight claim targets, the 15M combined-call ceiling, 7.5M tier-creation ceiling, and every deployment payload/runtime limit. Verify maximum numeric inputs, event identity, referral restarts, cancellation after root replacement, randomized heap ordering, stateful conservation, independent history replay, and the full capacity workload. Record reproducible measurements and final linked hashes in [gas-optimization evidence](evidence/gas-optimization.md). Regenerate frontend bindings through the existing generator. This is a new immutable build, with no compatibility layer, state migration, public deployment, or automatic restart of the review fork.

## Read-only earnings previews (2026-09-10)

Replace the settled-only `earnedBalances` endpoint with `previewAccounting(tokenId, referrer, maxSteps)`. Return the stored balances, projected balances and accounting status, requested block timestamp, actual checkpoint count, and four newly vested scaled allocations. A zero budget reports the stored baseline and may project continuous time only when no boundary is due. Read budgets are capped at 256; execution remains capped at 25. Incomplete projections expose their actual cursor and next boundary and must never be labeled current.

Use an in-memory priority frontier over the stored heap: expose two children only when consuming their parent, and enqueue each consumed member's next funding boundary. The frontier is at most `2 * maxSteps + 1`, independent of the live membership count, and reads no historical prefix beyond the needed lots. Integrate the same floored rates, final tails, referral changes, and member carried division as execution. Keep the implementation in the already linked immutable ledger; share status/event encoding there to preserve the existing tier creation ceiling. No new deployment dependency, compatibility path, or mutable binding.

Account pages read beneficiary identity and previews at a single block, show all three earnings categories by payment currency, and identify the first tier exceeding the claim's shared 25-step budget. Membership pages show projected earnings with one `claimAll` action, which settles those earnings before paying. Refresh previews every 15 seconds without clearing balances or resetting inputs. Partial reads retain amounts with an explicit partial label and an advance action.

Protocol pages show the exact bounded accounting delta and earned fees available to release. `previewProcessing` shares the vault's existing eligibility logic with an additional hypothetical inventory amount; it performs no swap and does not promise an output price or that all independently eligible currencies will execute under global cooldowns. Donation inventory does not receive projected membership fees. Page reads never simulate transactions. Immediately before an explicitly requested write, retain native wagmi simulation, request forwarding, receipt handling and domain reconciliation.

Verify read/write equality with randomized heap ordering, adjacent and gapped lots, fractional tails, referrals, claims, cancellation, suspension, empty heaps, zero budgets and exhausted budgets. Enforce static reads and bounded storage access on a 1,000-member heap. Keep all execution and deployment gates unchanged, verify generated bindings, and redeploy the local immutable graph for browser verification.
