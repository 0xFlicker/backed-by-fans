# Required implementation evidence

**Feature**: [Protocol buyback and burn](spec.md)  
**Status**: The complete authentic fork acceptance pair, full local verification and manual serve/stop lifecycle pass. Final convergence is recorded below. Earlier dated checkpoints remain historical records and do not describe the current implementation.

## Final complete acceptance — 2026-09-07

The independently reconciled runs are `protocol-verify-20260907-r5` and
`protocol-final-20260907-r6`. Both ran against origin chain 4663, block 57,010,735,
hash `0xdfc65146f32cfd10afd9a620b68c3fc5d02077677ce06c46303e49e80f0a96cf`,
with execution restricted to loopback chain 31337. Both used source snapshot
`9bb748e10c792ce309635ec50bfaf9c6516718da65c45b6090c880baaa27dba5`.

The requested commits were created during verification without changing the tested
file contents. Run 1 records base commit `df85c4f`; run 2 records `935b8f8`.
Their identical 706-entry source inventories include the authorized working-tree
changes. Final documentation and recording already-absent legacy files as Git
deletions are accounted separately in
[source finalization](evidence/source-finalization-20260907.json); they do not
change tested application, contract, runner or test contents.

| Verification | Actual result |
| --- | --- |
| Complete local verification | `scripts/verify-local.sh` exited 0. Deployment/administration/lifecycle CLI checks, Foundry format/build/tests, generated-binding drift, frozen dependencies, web format/lint/type/unit/build/browser checks passed. [Full log](evidence/protocol-verify-20260907-r5-verify-local.log). |
| Local contract suite | 303 passed, 0 failed; eight optional fork cases skipped in the outer unconfigured stage. |
| Authentic contract suites, each run | 348 passed, 0 failed; one legacy optional Safe test skipped. Mandatory Pons, Safe, asset, graduation and failure suites executed. |
| Source/dependency preflight, each run | 88/88 checks passed against pinned historical state and compiled dependency identities. |
| Web units, each run | 484 passed, 0 failed. |
| Standalone browser suite | 82 passed, 0 failed; 131 explicitly fork-only cases skipped in this stage. |
| Authentic production browser, each run | 57 passed, 0 failed, 0 retries; 72 explicit viewport exclusions. Successful traces/screenshots retained. |
| Runner replacement | Actual 30-second cadence; runner B processed within 4,190 ms and 4,192 ms respectively, below the 60-second bound. Both callers completed two sweeps per run, with independent gas and no permission change. |
| Independent acceptance | Both directional peer-verification commands passed. All 34 required scenarios, SC-001–SC-012 and G1–G6 pass. Both manifests are `passed`, with `completeAcceptance: true`. Each run retains 246 receipt records. |
| Accounting | Five actual burn branches per run reconcile purchased/burned output to supply reduction, asset inventory, retained partial-fill input, earned releases and unused-time refunds. Trading-funded vesting and developer compensation remain separate. |
| Deployment measurements | Seven signed bootstrap transactions per run. Maximum serialized size 86,469 bytes; maximum actual gas 17,951,923 across the pair. Factory/vault/executor runtime: 9,395 /17,523 /11,649 bytes; existing renderer: 52,399 bytes under the recorded Robinhood limits. |
| Static analysis | Slither's high-severity gate passed. It reported 80 results across 113 contracts/101 detectors; this is not a zero-findings claim or an independent security audit. Narrow reviewed annotations and upstream/test exclusions remain explicit. |
| Verifier negative checks | Five altered evidence copies were rejected: absent Stock-asset scenario, absent graduation scenario, absent browser report, false supply destruction and inconsistent inventory. Original evidence remained unchanged. |
| Accessibility and final review | Keyboard skip link/main focus/refresh/Safe disclosure passed on both runs; desktop and phone screenshots reviewed. [Source-scoped custody, accounting, authority, wallet and copy review](evidence/final-review-20260907.md). |
| Manual lifecycle | A fresh `serve --run-id manual-review-20260907-stop` reached readiness under `artifacts/protocol-fork/`. Matching scoped `stop` exited 0; both ports closed, owned state was removed, and all retained evidence survived. The intentional-stop lifecycle is `terminated`. |

[Committed acceptance summary](evidence/final-acceptance-20260907.json) retains the
manifests, reconciliation results, source inventory, artifact indexes and measured
outcomes. [Evidence retention](evidence/README.md) distinguishes those committed
records from full receipts and browser traces retained locally in the two run
directories. A fresh clone must generate new runs for raw-artifact verification.

The prior `protocol-verify-20260907-r4` is supplemental only: its runtime suites
passed, but its original verification exit failed because a Markdown delimiter
was mistaken for a scenario. The parser fix and two regressions preceded both
final clean runs. The original failure remains recorded; it is not one of the
accepted pair.

Convergence checked 40 functional requirements, 12 success criteria, 41 user-story
acceptance scenarios, 17 concrete plan decisions and five constitution principles.
The edge cases and all 86 tasks were assessed within their named source scope.
There were zero missing, partial, contradictory or unrequested-work findings, and
zero findings at every severity. No convergence phase was appended; `tasks.md`
remained byte-for-byte unchanged during convergence. T086 was then completed by
returning to the implementation workflow. No extension hooks were registered.

The 17 reviewed decisions cover chain/version identity; immutable tier economics;
bounded accrual/refunds; singular Safe configuration; fixed Pons integration;
native ETH pairing; purchased initial holdings with separate vesting;
at-most-two-leg conversion; finite economic policies; bounded stateless automation;
captured public reads; wagmi/viem transaction ownership; guarded pinned forks;
two-run acceptance; deployment limits; obsolete-path removal; and existing
libraries with upstream licenses preserved.

This delivers the disposable fork implementation. No public deployment, public
Safe execution, independent security audit or Stock Token legal clearance is
claimed. Safe availability and economic policy remain operational dependencies;
Pons, exchanges and token issuers retain their disclosed external powers.

## Initial implementation record — 2026-09-07

Base commit: `df85c4f538392598ba8323ddc37825e023392bb3`, branch
`codex/003-protocol-buyback-burn`, with uncommitted implementation changes.
The separately requested requirements review passes `protocol.md`40/40 and
`requirements.md`16/16. Those markers do not certify implementation.

| Check | Actual result and limit |
| --- | --- |
| Baseline `forge test --summary` | Passed before production edits; the optional Robinhood Safe fork test skipped without fork configuration. Existing accounting/membership invariants passed 256 runs with 128,000 calls per invariant. |
| Pons/Uniswap interface compilation | `forge build` passes with exact-source snapshots and pinned official dependency files. All retained file SHA-256 values match their manifests. This is not independent deployed-bytecode reproduction. |
| Initial vault custody | `forge test --match-contract ProtocolBuybackVaultTest -vv`: 11 passed, including 256 fuzz cases. Synthetic registry/tier fixtures test immutable identity, authenticated backed receipts, separate donations, replay rejection, atomic short-transfer/callback failure, zero/native receipt rejection and absence of withdrawal/arbitrary-call surfaces. |
| Evidence and preflight boundaries | `bun run test scripts/protocol-fork-preflight.test.ts scripts/protocol-fork-manifest.test.ts`: 16 passed. Includes origin/hash checks, pinned reads, private-error redaction, missing-evidence rejection, typed route connectivity and zero-output quote rejection. Mock RPC tests are synthetic. |
| Static checks | Contract formatting, clean-room dependency/license-header checks, web TypeScript and focused ESLint pass. This is not the final T084 verification run. |
| Historical discovery | A read-only probe at origin4663/block57,010,735/hash`0xdfc65146f32cfd10afd9a620b68c3fc5d02077677ce06c46303e49e80f0a96cf` read factory/helper/hook/vault/Safe runtime identities, launch economics, USDG and WETH. It submitted no transaction. |

T001, T003 and T007 are complete at this scope. T002 retains verified Pons source and compiled
interfaces plus official Uniswap pins, but full compiler/constructor/immutable associations and
deployed router compatibility remain open. T004 has read-only checks; full source coverage,
authentic Stock asset/route discovery and remaining dependency validation are incomplete.
T005/T006 have the vault unit fixtures and minimal implemented types/interfaces only.

The new vault is **not wired into the membership factory or payment flow yet**. No spending path,
continuous fee accrual, refund reserve changes, fresh Pons launch, graduation, actual burn,
Safe configuration transaction, runner or feature browser acceptance has been completed.
The historical preflight's failed gates are retained separately from synthetic passes; no G1–G6
gate is promoted by this record. Next implementation work is factory/deployment wiring and its
fixtures, followed by publication and paid-time accrual/refund accounting.

The final setup probe is retained in [setup-preflight-20260907.json](evidence/setup-preflight-20260907.json),
including its source snapshot hash and each historical observation. Its three failed checks are
complete compiler-input/runtime-lock coverage, the USDG conversion route, and an authentic Stock
Token identity. The WETH unwrap route is identified; actual asset acquisition and swap/burn execution
still require the authentic fixture. This preflight performs no launch or signing operation.

The delivered feature is a working creator membership protocol with a launched protocol token and
automated fee processing. A token launch demo or a mocked swap test does not satisfy it.

## Membership implementation checkpoint — 2026-09-07

This supersedes the initial record's unwired-vault status. The factory now deploys one immutable
vault bound to its already-launched token; tiers pin that vault. Fee recipient, global factory fee,
withdrawal APIs and their obsolete web reconciliation code are removed. The generated Foundry/Wagmi
bindings include the vault and the implemented fee surface.

Published tier allocations accept 100–10,000 bps with independent split floors and combined-rate
validation. Membership payments keep their allocation in protected tier holdings. Ordered paid-time
lots, binary-search entitlement, historical-member checkpoints, aggregate exact releases and logical
refund generations implement continuous earning. Refunds consume current unearned reserves before
creator proceeds and bounded top-ups. Cancellation rounding is separately attributed once.

| Check | Executed result |
| --- | --- |
| `forge test --no-match-path 'test/invariants/*'` | 272 passed, 0 failed, 1 optional Safe fork test skipped. Includes unchanged membership/artwork assertions adapted for reserve custody and refund funding. |
| `ProtocolFeeAccrualTest` | 11 cases, including two 256-run fuzz tests: checkpoint frequency, varying lots against the slow oracle, 12/9/3/0 stopped collector, 100% zero-top-up refunds after release, grants/zero-fee gaps, burned credentials, refund/release ordering, cancellation rounding, 100-member batch and 512-lot history. This proves releases, not Pons burns. |
| Accounting invariants | Both invariants passed 256 runs /128,000 calls each, with 14 handler actions including public accrual/release, gifts, refunds, donations and frozen exits. Independent model checks stored and projected conservation before checkpointing and after release/cancellation. |
| Membership lifecycle invariant | Passed 256 runs /128,000 calls with 12 handlers, including public accrual/release and an independent variable-lot fee oracle. Models paid/grant time, zero-gross gaps, refunds/rejoining and stored/projected conservation. A separate regression proves frozen factory/vault addresses do not block payments. |
| Bounded work | Cold projection: 35,723 gas for one lot, 58,459 for512; 512-lot refund208,275; rejoin197,580. Maximum-batch and aggregate-release bounds pass. |
| Deployment limits | Factory initcode is checked against Robinhood's196,608-byte ceiling; the existing95k serialized-transaction gate passes. Helpers and code chunks retain standard runtime checks. The measured tier creation gas increased from the prior6.5m budget to about7.19m; the regression budget is7.5m. No proxy/helper was added to hide size. |
| Web | TypeScript passes; full Vitest suite412 tests across71 files passes. Immutable allocation reads, raw split previews, draft restoration and component refund funding use generated ABIs. |

The local browser harness now deploys a distinct explicitly synthetic protocol token and includes
1%,12.34% and100% wallet publication cases. The full rerun passed 34 cases with one account-switch reconnect race; the corrected
case then passed independently (one desktop pass, two viewport skips). The 40 full-run skips are
explicit viewport exclusions. The 100% browser case buys 12 periods, projects 30 earned/90 unearned
before any collection, releases through an unrelated caller, then executes a reserve-only refund with
zero creator top-up and preserves the released vault balance. The generated production build and
focused 75 web tests pass. No authentic-browser or G1–G6 acceptance is claimed. Safe policy/configuration, Pons launch/compensation, executor, runner,
graduation and two complete retained fork runs remain outstanding.

## Dependency source checkpoint — 2026-09-07

`source-verification-20260907.json` records independent local compilations of 17 dependency records
against runtime read at block57,010,735/hash0xdfc65146f32cfd10afd9a620b68c3fc5d02077677ce06c46303e49e80f0a96cf.
Inputs and original licenses are retained in `contracts/external/verification/4663/sources.json`;
compiler binaries were SHA256-checked against the official Solidity macOS artifact index. Every
executable comparison passes; metadata-only differences are distinguished from exact runtime matches.
Compiler-derived immutable ranges are measured, consistent across occurrences and retained. The three
Safe records and PoolManager use canonical Ethereum source inputs compared to actual Robinhood code.
The launch locker and graduation guard use the exact Pons factory compilation closure. PositionManager
required its metadata-declared source closure because the returned standard input included unrelated,
incompatible source trees; no source contents were changed. The verified WETH implementation is
`0xc6b81b429797e0f555440b70cd99e032d7ae947e`, controlled through proxy administrator
`0xa3acd31afb851b4eb9dad00f5204c01d924267df`. This external upgrade power remains disclosed.

Reproduction: `bun scripts/protocol-fork/verify-sources.ts COMPILER_DIR specs/003-protocol-buyback-burn/evidence/dependency-runtime-20260907.json OUTPUT_JSON`.
Use the hash-pinned `solc-VERSION` executables listed in the source manifest. The verifier rejects
executable differences, unexpected immutable ranges and inconsistent immutable occurrences.
The three focused runtime-comparison tests and eight preflight tests pass. Code/source proof does
not certify liquidity, launch, compensation, graduation, Safe signatures or browser integration.

Robinhood's documented `/rhj/assets` registry identifies AMD at
`0x86923f96303D656E4aa86D9d42D1e57ad2023fdC`; pinned reads confirm symbol,18 decimals,
1e18 display multiplier and matching UID. `market-discovery-20260907.json` records actual V3 pool
addresses for AMD/USDG and USDG/WETH. Filtered full-history V4 queries were rejected by the provider;
this does not establish that V4 liquidity is absent. Swap/asset acquisition acceptance remains pending.
[Official asset API](https://docs.robinhood.com/chain/stock-token-apis/),
[canonical tokens](https://docs.robinhood.com/chain/contracts/).

## Authentic isolated launch and compensation — 2026-09-07

`PonsLaunchForkTest`: 3 passed on the pinned origin, execution chain31337. The fixture verifies the
origin hash via its immediate child's blockhash and rolls back to the exact origin before mutations.
The deployed Pons factory launches real token/curve bytecode. One developer-funded0.01ETH purchase
returned5,858,334,812,710,811,290,608,911 raw tokens, with the launch fee accounted separately.
No free developer allocation or mint authority exists. Stale economics/wrong launch fee reject;
voluntary burns reduce supply while curve reserves/reserved graduation inventory remain unchanged.
These Foundry tests have local call traces and state assertions; they are not retained Anvil receipts
or the completed launch/browser acceptance run.

`PonsCompensationForkTest`: 4 passed on the same pinned origin. An actual eligible bonding sweep
locked20,589,524,615,772,276,214,664 raw tokens and credited35,000,000,000,000 wei of creator income.
Partial/final release and a later real trade/sweep preserve accrued vesting and credit both beneficiary
shares. Creator ETH/token claims pass; unauthorized sweeps/releases reject; disabling buybacks affects
future earmarks while old earmarks remain pending. Total token supply remains unchanged by vesting.
The current external fee-sweep operator and second beneficiary are explicitly simulated participants;
no external permissions, token balances or deployed bytecode were patched. These tests do not prove
membership burns, pool compensation, graduation fallback, or operator independence of the pending executor.

The refreshed read-only preflight has80/82 checks passing. Every dependency source/runtime and the
canonical AMD identity pass. USDG and AMD executable conversion-route gates remain failed.

## Evidence layers

### Shared Anvil graduation, Safe continuity and native pool compensation — 2026-09-07

The retained `protocol-serve-20260907-r1/browser/scenarios/` records now contain
`graduation-pool-compensation.json`, `safe-configuration-continuity.json`,
`wallet-direct-burn-refund.json` and `runner-replacement.json`. Every scenario
checks receipts and current postconditions before reverting its isolated snapshot;
those branch receipts are historical test evidence, not the final live chain state.
The new `browser/branches/` export retains mined transaction inputs and receipts
before snapshot rollback, including wallet approvals and membership transactions.

Actual 2-of-3 Safe transactions disable a token, pause globally and by asset,
replace the route, invalidate its old policy, install a finite policy and resume.
A browser purchase on an existing tier succeeds while the token is disabled and
buybacks paused; a new tier rejects. An ordinary caller processes old earned
inventory after repair, while the stale revision rejects.

The same fresh Pons token crosses its real curve threshold with a partial fill,
returns unused ETH to its original donation bucket, and destroys only purchased
tokens. Public pool creation enables another burn without replacing that closing
policy. A separate earned WETH membership release then buys and burns through the
actual graduated pool. Pool trades in both directions, simulated authorized Pons
sweeps, partial release, another deposit, final release and both beneficiary claims
reconcile independently from membership burns. Graduation earmarks become creator
cash rather than new vesting deposits. The Foundry pool-compensation suite retains
the exact fee-split oracle; the Anvil scenario retains corresponding transactions,
external ledgers and supply differences. Final complete-run G1–G6 acceptance and
the second clean reproduction remain pending.

### External failure execution — 2026-09-07

`ProtocolExternalFailuresForkTest` passed all 12 cases on the exact pinned origin;
the retained output is [external-failures-20260907.log](evidence/external-failures-20260907.log).
An actual initialized but empty V4 pool leaves USDG pending, then an approved liquid
route processes it. Real curve purchases invalidate an old output floor; a refreshed
policy restores processing. Separately labeled issuer-transfer, router-bytecode and
PoolManager-call failures preserve inventory and budget while direct protocol-token
burns remain functional. The issuer restriction remains pending through repeated
attempts and has no rescue path; only removal of the injected restriction permits
recovery. Expired policies and an unavailable Pons sweep operator do not prevent the
independent membership purchase/accrual/burn/reserve-refund lifecycle. These are
Foundry fork assertions, with injected changes explicitly localized in the test;
they are not retained browser or Anvil transaction receipts.

| Layer | Required proof |
| --- | --- |
| Source and unit checks | Published terms, fee arithmetic, access control, token acceptance, accounting, bounds, event attribution, and burn postconditions. |
| Independent models and stateful tests | Conservation per asset; checkpoint-independent accrual; reserved/earned/released/refunded conservation; no fee diversion; no consumption of creator/reward/referral liabilities; no double processing; refunds after fees are spent; arbitrary action ordering and adversarial assets/callers. |
| Authentic integration | Fresh token launch through the selected real launchpad on the pinned fork, pre-graduation and post-graduation purchases, actual supply destruction, non-ETH conversion routes, actual Safe configuration execution, enabled Pons vested buybacks and earned developer compensation. |
| Fault injection | Paused/frozen assets, manipulated prices, stale observations, failed burns, insufficient liquidity, partial fills, unavailable external sweep operator, graduation failure, malformed routes, concurrent calls and RPC loss. Clearly label any modified external state. |
| Browser | Wallet-backed creation, purchase, renewal, gift, claims, refund and protocol-activity flows against the same deployed test contracts, with receipt and state assertions. |
| Public deployment | Outside this specification's delivery milestone. Fork evidence is not a public launch, audit, legal clearance, or real-market economic proof. |

Reuse the repository's independent accounting models, Foundry checks, local verification entrypoint,
Anvil-backed browser harness and existing wallet lifecycle. Extend them for the selected environment;
do not duplicate transaction submission, receipt polling, replacement or reconciliation already
handled by wagmi/viem.

## Required scenario matrix

| Scenario | Passing evidence |
| --- | --- |
| Fee range | Reject 0%, 0.99%, above 100%, and totals above 100%; accept 1%, a representative intermediate value and 100%; reject all later edits, including by a new tier owner. |
| Safe configuration | Execute token onboarding, route approval/replacement and bounded-setting changes through a real test Safe with its configured signature threshold. Reject unauthorized accounts, insufficient authorization and out-of-bound changes; retain public change evidence. Impersonating the Safe alone is insufficient. |
| Administration workflow | Reproduce all supported configuration actions using documented Safe transactions and scripts with reviewable inputs and expected confirmed outcomes. Verify the resulting public configuration and change history in the app; no custom administration screen is required. |
| Configuration continuity | Disable a token: new tiers fail, existing valid payments/claims/refunds continue. Pause buybacks globally and by asset: inventory remains pending. Repair a route and resume: an ordinary caller processes the old inventory. A previously prepared transaction is checked against the effective configuration. |
| Authority limits | Safe transactions cannot alter published tier economics or the protocol token, withdraw membership inventory, redirect it to another purpose, or exceed hard safety bounds. Verify no residual deployer privilege; token ownership alone grants no configuration authority. |
| Payment split | Independent expected raw balances for paid joins, renewals, gifts, contributions, absent referral attribution and small amounts; no protocol fee for zero gross. |
| Entire membership lifecycle | Active/expired status, paid and grant time, fixed-wallet rewards, referrals, ownership transfer, creator proceeds, artwork changes, full and partial refunds and rejoining remain correct. |
| Full protocol allocation | Exactly100% of gross becomes protected protocol reserve; creator/reward/referral allocations are zero and membership access begins immediately. Earn over consumed paid time; unused-time gross refunds require zero owner top-up even after prior earned fees burn. |
| Continuous accrual | 120 tokens/12 periods/10% earns3 after3 periods with9 reserved. A90-token refund uses9 reserve and81 creator funds. Test fractional periods and compare one checkpoint with many tiny checkpoints. |
| Accrual lifecycle | Renewals/gifts queue paid time; different variable contribution lots retain fee rounding; free grants never earn fees and zero-gross paid intervals do not accelerate later lots. Collect after expiry/credential burn, cancel/rejoin without stale-generation earnings or unbounded storage cleanup. |
| Refund and release race | At a common timestamp, refund-first and release-first preserve the same entitlement/refund funding. Earned-held fees cannot fund refunds, unearned fees cannot release, transfer failures revert, and cancellation rounding is explicit and at most one raw unit. |
| Collection and forecast | Stop collection while entitlement advances. In the12-token fee example after3 periods, assert protected12/unearned9/uncheckpointed-earned3/checkpointed-earned0; checkpoint at the same timestamp to make3 releasable, then release leaving protected9/released3. Public views distinguish total earned awaiting release from immediately releasable amounts and show conditional24h/7d/30d forecasts with common-block/population coverage; partial pages cannot imply full-tier reconciliation. |
| Collector traversal | Across multiple tiers and more than100 members, visit eligible expired IDs on later pages within the finite captured-sweep tier-visit bound. Verify forward in-memory cursors, round-robin visits, a blocked asset, new arrivals deferred to the next sweep, wraparound, retained scheduled progress and restart without duplicate releases. One-shot completes one finite sweep; the separate small replacement fixture retains its two-interval target. |
| Asset coverage | USDG, one authentic Stock Token, WETH or another liquid non-stock token, the new protocol token itself, and a compatible asset with no executable route. Onboard each through the Safe before tier creation; preserve each asset's unit scale. |
| Stock action | A display multiplier change updates visible amounts while raw payment, pending fees, rewards and refunds remain unchanged. Unsupported/frozen behavior fails clearly and affects only that asset. |
| Token launch | Actual factory launch receipt, ETH pair, initial purchased developer holdings, no premine/free allocation, enabled vested buybacks, zero additional creator tax, recorded developer Pons recipient and separate immutable membership-burn destination. |
| Bonding purchase | Earned released membership revenue buys through the real curve before graduation; the obtained amount equals the attributable supply reduction; receipts reconcile external trade costs and pending remainder. |
| Early pricing | With inadequate price evidence, fees wait; with sufficient admissible evidence, processing works while the launch is still bonding. No completion-by-waiting-for-graduation shortcut. |
| Crossing purchase | Partial fill spends only the filled amount, unused ETH remains burn budget, only actual received tokens burn, and launch state is refreshed before later spending. |
| Graduation recovery | Exercise ready-but-not-tradable and swept-but-pool-not-created states; memberships continue; any supported public retry succeeds without an owner; processing resumes against the authentic destination pool. |
| Graduated purchase | Real pool buy and supply reduction after graduation, including route/token ordering and required hook behavior. |
| Protocol-token payment | The fee is reserved and earns over paid time; only its earned release burns directly without a circular swap. Unearned refund backing and other liabilities stay protected. |
| No market / unsafe market | Nothing is sold at an arbitrary caller-selected price; pending amounts and reasons remain visible; another eligible asset still processes. |
| External fee harvesting | Remaining creator ETH revenue is claimable by the developer's Pons recipient. Reproduce an operator-required sweep failure and show that membership-fee processing remains independent and trading compensation remains explicitly pending. |
| Vested trading buybacks | Trades during bonding and after graduation fund actual vault deposits. Advance local time to test partial vesting, a later deposit preserving already vested amounts, remaining schedule and final release; either authorized beneficiary's release credits both shares, and the developer can claim its earned tokens. Verify unauthorized release fails. |
| Fee-flow separation | Membership-funded purchases incur ordinary Pons costs, which can produce developer revenue and vested tokens. Reconcile those costs once; none of the vault's deposits, releases or claims counts as a membership-fee burn or new membership revenue. |
| Native Pons fallback | At curve graduation and when native buyback conditions prevent execution, reconcile earmarks paid as creator revenue under the deployed rules. Generate actual vesting deposits through eligible sweeps before exhaustion or after pool creation; never equate enabled status with guaranteed deposits. |
| External creator controls | In labeled control tests, changing the Pons recipient or buyback toggle affects only its external fee/vesting behavior and future allocations as specified by Pons. Membership terms, immutable burn destination and fee inventory remain protected. |
| Adversarial execution | Wrong asset, wrong output recipient, counterfeit venue, malicious callback, surplus donation, low minimum output, stale quote, manipulation and duplicate/concurrent calls cannot divert inventory or fabricate burns. |
| Replace automation | Stop runner A and remove its gas; a separately funded ordinary runner B resumes processing without a permission update, contract change or access to A's key, under enabled Safe policy. |
| Administrative disclosure | Public views identify the Safe, enabled assets, routes, limits, pauses and configuration history; pending reasons distinguish Safe action from market or runner availability. No full-decentralization or token-governance claim. |
| External authority | Record and replay relevant launchpad administrator powers as fault tests. Verify their scope and avoid claiming those dependencies are ownerless. |
| Browser failures | Wrong network, wallet rejection/replacement, insufficient asset/gas, stale quote, RPC failure and unavailable burn route produce accurate action states; successful membership payment is never reported as failed because buyback is pending. |
| Reproduction | Two clean runs from the recorded fork origin reproduce accounting and lifecycle outcomes; differences in timestamps/addresses are explained, not treated as identical artifacts. |

The authentic Stock Token and liquid non-ETH path must be verified in the selected environment.
If unavailable, report that integration acceptance as blocked; a representative mock can exercise
failure and display behavior but cannot replace the missing external integration evidence.

First reconcile stored tier allocations to protected holdings plus cumulative releases and protocol
refund contributions. At one timestamp and for a matching accounting population, protected holdings
equal projected unearned reserves plus uncheckpointed earnings plus checkpointed earned-held fees.
Check both equations even when collection is stopped; partial projections cannot prove a full-tier
total. Cancellation rounding is included once in checkpointed earned-held/released amounts, never
uncheckpointed paid-time earnings.
Then, for each vault input asset, reconcile opening inventory plus earned releases and
processable donations against closing inventory plus actual input
spent on trades or direct burns. Trade input includes venue costs; do not count those costs twice.
Reconcile acquired protocol tokens separately against actual supply destroyed. Partial-fill refunds
reduce actual input spent rather than creating new revenue, and token amounts from different assets
are never added together. Tier liabilities have their own conservation model and are never part of
the spending budget. Maintain an independent Pons ledger for creator ETH income, vault deposits,
vested amounts, releases, claims and remaining balances. Earned developer compensation is not
membership burn inventory, even when the underlying trade was a membership-funded purchase.

On forknet, advancing time and impersonating an existing Pons operator or beneficiary may be needed
to exercise external sweeps and vesting. Label these steps as simulated external participation;
retain actual contracts and authorization checks. They demonstrate integration behavior, not
permissionless access to Pons's operator role. Separately prove membership-fee processing without
that role. Do not grant operator credentials to the Backed By Fans application or automation runner.

## Reproduction record

The implementation must deliver an exact-command quickstart with prerequisites, expected outputs,
pass/fail criteria, runtime endpoint, fresh test wallet funding, reset and teardown instructions.
Record the application commit, external source revision, origin chain ID, block number and hash,
runtime code hashes, launch transaction, created contracts and pools, automation funding source,
fee allocation/accrual/release/refund receipts and lot generations, burns, vault deposits, vesting
terms, beneficiary claims, projected release views and final accounting balances.
Record the test Safe address, owners, threshold, authorized configuration transaction receipts and
before/after settings. Use test-only Safe signers; preserve separation from Pons external role simulations.
Keep browser traces/screenshots alongside the
associated transaction evidence.

The fork is disposable. Its origin endpoint is used for reads; all deployments, purchases, state
manipulation and signed transactions target the isolated test environment. Guard execution against
accidentally targeting the origin network, and use test-only keys. When the fork expires, retain
the evidence and recreate it from the pinned origin; do not imply that its local URLs or balances
remain live.

### External compensation read and control checkpoint — 2026-09-07

Generated Pons bindings and the new captured-block `pons-read` module pass 16 focused web/generation tests. Native creator escrow is explicitly a shared-recipient ledger across Pons launches; event pages expose coverage and do not invent lifetime claims or count vested tokens as membership burns. The fee event reconstruction regression passed for a zero-fee paid interval, refund, rejoin generation, accrual and release.

Six authentic `PonsCompensationForkTest` cases now pass at the retained origin, including an ordinary near-graduation purchase that makes the native buyback exceed the remaining sellable allocation. The actual sweep pays its earmark as creator ETH and leaves reserved graduation tokens untouched. Real creator transfer, a timelocked Pons-owner override, owner-disable/creator-enable authorization and later vesting deposits preserve BBF factory/vault/token identities. Pons owner/operator participation is simulated with explicit caller impersonation; the dependency code, timelock and permission checks are unmodified. Impact-specific and post-pool fallback remain pending, as do retained Anvil receipts and complete G5 acceptance.

The fresh offchain deployment-script test separately passed two authentic-fork cases: canonical 2-of-3 Safe plus newly launched token and BBF graph, and refusal of public-chain execution. This is not yet a retained Anvil deployment run or threshold-signed administration proof.

### Complete read-only preflight and threshold Safe checkpoint — 2026-09-07

The retained `verified-preflight-20260907/preflight/report.json` passes all 88 checks. `source-verification-20260907.json` independently compiles all 18 recorded dependencies, including the exact newer V4Quoter source at the already-pinned official Uniswap revision. USDG→ETH (100 ppm, tick spacing 1) and AMD→USDG (10,000 ppm, tick spacing 200)→ETH quote successfully at origin block 57010735. `pinned-preflight-inputs-20260907.json` retains the reproducible source locks and routes. These quotes are execution feasibility evidence, not Safe price authorization or actual acquisition/burn proof.

Seven synthetic administration tests and 33 factory regression tests pass (40 total), including 256 uint128-operand fuzz cases. Five authentic `ProtocolSafeForkTest` cases pass with newly created canonical 2-of-3 Safes and real digest signatures/`execTransaction`: registry changes, valid two-leg V4 routing and policy, invalid bounds, insufficient signatures, signature replay, removed withdrawal selector, validated two-step successor transfer, and rejection when the nominated Safe enables a module before acceptance. Every executed call checks Safe nonce plus its matching inner success/failure event; all gas refunds are zero. Configuration authority follows the factory owner immediately and no independent vault owner exists. Spending/budget replay tests remain pending the executor. These are local Foundry-fork transactions, not yet exported Anvil receipts or full G6 browser evidence.

### Retained launch, Safe and native vesting receipts — 2026-09-07

`evidence/launch-safe-20260907-r4/checkpoint.json` passes the scoped launch/configuration/native-compensation checkpoint. Its bootstrap broadcast retains the actual fresh Pons launch, developer-funded purchase, canonical 2-of-3 Safe and BBF graph. Nineteen subsequent receipts retain three token onboardings (authentic AMD, WETH, launched token), four typed routes, four policies, global unpause, asset pause/resume, the native operator sweep, developer ETH claim and partial/final vesting releases plus developer token claim. Every Safe execution uses sorted signatures from two distinct test owners, checks the nonce and matching inner success event, and verifies target state and revised configuration. No public transaction was sent.

All four initial policies use a 15-minute lifetime and 100-bps tolerance. ETH/WETH budgets are 0.01 ETH with 0.001 ETH batches; USDG is 24 units with 2.4-unit batches; AMD is 0.05 raw-token units with 0.005-unit batches. The separately retained Safe reference rates value those non-ETH budgets below 0.01 ETH, and their batches below 0.001 ETH. These are explicit Safe authorizations, not prices generated by a runner. Vesting time travel deliberately expires them. Native vesting deposited and eventually released 20,589,524,615,772,276,214,664 raw tokens, with supply unchanged at 1,000,000,000 × 10^18. Operator and other-beneficiary calls are labeled simulated external participation.

Seven authentic compensation tests pass (`evidence/pons-compensation-20260907.log`). Four real buy/sell round trips trigger the impact fallback independently of the sellable-allocation fallback. Both pay the creator under the actual deployed rules without a vesting deposit. Pool/graduation-dependent compensation remains T068. The initial failed Anvil attempts retain their logs: script loading required a larger **offchain script** limit; fixed local gas avoids unsupported archive fee-history; shared viem module resolution and explicit Anvil chain configuration corrected optional ERC165 and impersonated wallet execution. Actual Anvil contract/initcode limits remain enforced.

The operator CLI boundary passes 17 focused TypeScript tests, including optional ERC165 reverts versus RPC failures. The payment and buyback shell guards reject direct submission and withdrawal. These complete T036/T037/T040/T043/T044 at their scoped boundaries; complete G5/G6, executor burns, graduation, browser and two full runs remain pending.

### Authentic earned-fee burn and refund contract checkpoint — 2026-09-07

All six `ProtocolBuybacksForkTest` cases pass at origin57010735 (`evidence/member-bonding-burns-20260907.log`). WETH is acquired by actual deposit; USDG by native-ETH→USDG V4 trade; AMD by USDG→AMD V4 trade. There is no token-balance, permission, implementation or liquidity patch. Protocol-token payments use previously purchased developer holdings. Each asset pays a100% twelve-period membership, earns/releases three periods, processes from the membership bucket through the actual curve (or directly burns protocol-token fees), and refunds the other nine periods entirely from protected reserves after the earned tokens have burned. All measured supply reductions equal attributed burns; ERC-20 and Permit2 approvals are cleared.

Raw results: WETH released249999999999999, burned145579046878366577003234, refunded749999999999997; USDG released621468, burned145541926734354636188762, refunded1864404; AMD released1271382503816142, burned142361441343712387604500, refunded3814147511448426; protocol token released/burned3000, refunded9000. Values of different assets are not summed. These Foundry integration tests use a local BBF configuration owner to isolate market/accounting behavior; threshold-signed Safe integration is evidenced separately and the complete shared Anvil/browser run remains pending.

Twelve synthetic executor fault tests pass, including256 partial-fill fuzz cases, a one-raw-unit price undercut, early/expired/stale policies, budget replay across pause/resume, fee-on-transfer input, no-op venue, zero output, no-op/excess burn, reentrancy and pre-existing executor balances. The independent floor oracle separately passes256 fuzz cases plus maximum-operands and raw-unit examples. The existing63 focused allocation/refund/custody/admin tests still pass after strict launch-bound executor construction. Synthetic fixtures explicitly install retained dependency runtimes and mock launch reads; they are not imported by authentic fork tests.

The immutable executor and vault are implemented and compile under the existing non-viaIR settings. Measured factory creation bytecode is approximately86kB before constructor arguments; serialized public-transaction checks remain mandatory. Actual V4 ETH output comes directly from PoolManager and is accepted only during an active settlement. Permit2 rewrites a zero expiry to the current block, so cleanup uses zero allowance with explicit expired timestamp1. Earlier launch/Safe checkpoints predate this executor graph and do not certify the updated deployment. Final trace/receipt/browser and repeated clean-run gates remain incomplete.

### Settlement, runner and deployment implementation checkpoint — 2026-09-07

The independent buyback book now accounts for receipts, conversions, spending and burns in raw units per asset and source bucket. The synthetic 100-unit regression releases actual earned membership fees and separately receives donations: each converts 100 units to 1 ETH, spends 0.6 ETH on tokens that immediately burn, and retains 0.4 ETH in its own bucket. Protected tier reserves remain unchanged. Thirteen executor tests, eleven vault tests, three arithmetic tests and nineteen deployment tests pass (`evidence/focused-buybacks-20260907.log`). The stateful buyback invariant passes 256 runs /128,000 calls with no unexplained reverts, including unsynchronized donation timing, independent paid-time earning/release, arbitrary callers, partial conversions, price undercuts, no-op/excess burns, transfer taxes and callbacks (`evidence/buyback-invariants-20260907.log`). Synthetic venue substitution is confined to test helpers and is not authentic market evidence.

All six authentic member-burn cases also pass with deliberately pre-existing router ETH, which remains unchanged and is never attributed as purchase output (`evidence/member-bonding-router-surplus-20260907.log`). These tests include real USDG/AMD/WETH acquisition and 100% reserved refunds after earlier earned fees burn. Final retained Anvil receipts remain required.

The runner uses finite sweep-start member bounds at one block, 100-ID round-robin pages, collection and processing between pages, and retained in-memory progress between scheduled visits. Ten viem-boundary tests pass, including 205-member discovery, later historical IDs, new arrivals, restart without duplicate release, simulation failures, independent Pons read failure, exact simulation-request submission, known receipt reverts and fatal unresolved writes. Public graduation and pool creation use fresh Pons state and never set economic policies. Seven forecast tests pass for 24h/7d/30d conditional earning, the stopped-collector 12/9/3/0 example, cancellation generations and incomplete population/block/lot coverage. Actual runner replacement and browser acceptance are still pending.

Public release tooling now requires an actual native-ETH Pons token, pins it into the factory constructor and reviewed schema-3 state, and checks reciprocal factory/vault/executor/token bindings. Mainnet payment configuration contains verified USDG, AMD and WETH identities from origin57010735, including USDG/WETH implementations (`evidence/payment-identities-20260907.json`). Existing schema-2 public records are historical; `prepare` requires a real launched token and committed source before producing the next reviewable state. No replacement public token or deployment address has been invented. Public signing, clean-source and 95,000-byte transaction gates remain mandatory.

## Public activity and caller replacement checkpoint (2026-09-07)

The first supervised `serve` bootstrap is retained at
`evidence/protocol-serve-20260907-r1/`. It includes fresh current contracts, the
actual threshold Safe and native Pons compensation receipts, authentic USDG/AMD
acquisition receipts, a media-backed tier and a production Next.js build. This is
an implementation checkpoint, not either required clean full acceptance run.

The wallet-free activity suite passed seven browser checks across desktop,
tablet and phone (two redundant no-JavaScript checks intentionally skipped).
Accessibility and overflow checks passed; an injected Pons RPC outage preserved
independent BBF inventory and Safe reads. Subsequent focused browser invocations
now use separate attempt directories so Playwright cannot delete prior evidence.

`browser/scenarios/runner-replacement.json` records real runners at one- and
two-second configured intervals. A completed two captured sweeps, was stopped,
and had its native gas balance removed. B used its own private signer and resumed
without configuration or privilege changes. Entitlement advanced while A was
stopped. A released 3,040,000 raw USDG; cumulative B release was 6,060,000. The vault
spent 6,040,000, retained 20,000, and burned 1,413,111,356,978,991,377,195,609 raw
protocol-token units. The independently read supply reduction equals that burn.
The integration found and fixed a viem account-boundary defect: simulation must
receive the local account object so its exact request retains local signing.

`browser/scenarios/wallet-direct-burn-refund.json` records a browser-wallet burn
of the earned portion of a 100% protocol-token tier, followed by a full unused-time
refund with zero owner top-up. Receipt evidence, supply deltas and allocated /
held / released / refunded conservation are retained. Unit tests also preserve a
confirmed burn when the subsequent inventory read fails.

`evidence/pons-pool-compensation-20260907.log` records eight authentic Foundry
compensation tests. The added pool scenario trades both directions, converts fees,
creates two actual native vest deposits, preserves already vested balances across
an additional deposit and claims both beneficiaries' final balances. Deposits were
254,201,587,147,843,646,477 and 169,987,322,785,233,399,431 raw tokens; supply did not
change. Curve graduation paid 29,626,722,222,222,222 wei creator revenue including
the former earmark. These are separate external trading ledgers, never membership
burns. G5 still needs the final retained full-run scenario mapping.

The old public fee-recipient deployment's active `run-latest.json` pointer was
retired. Its byte-identical `run-1788387912.json` historical record remains.
Wagmi generation now emits no public MembershipFactory deployment until the
existing release wrapper promotes an actual replacement. Independent renderer
registry discovery remains available. No fork address was promoted publicly.
