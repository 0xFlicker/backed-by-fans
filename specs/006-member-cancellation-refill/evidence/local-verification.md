# Current-candidate local verification

Recovery run: `artifacts/feature006-verification/20260923-recovery/`. This directory is retained locally and excluded from source snapshots. The feature checkout remains uncommitted. Local verification stages and one disposable authentic-fork run are complete, with the evidence-verifier corrections below. Retained manual-review acceptance is recorded separately.

## Completed after crash recovery

- Medusa: configured 500,000-call campaign, four workers, sequence length 100; completed 501,162 calls with **116 tests passed, zero failed**. Reports and coverage are in `medusa.log` and `medusa-corpus/`.
- Echidna: configured 50,000-call campaign, two workers, sequence length 100, assertion mode; completed **50,145 calls**, exit 0, all 98 listed tests passing. Seed `4114944033941866839`; retained `echidna.log` and `echidna-corpus/`.
- Independent rational-model replay: **16 histories, 100 authored actions each**, sparse/dense/irregular schedules and each budget 2–25; exit 0. Coverage includes 61 cancellations, 32 refills, 27 blocked refills and 249 fractional retirements. Exact ownership-sensitive payouts match. See `histories.log` and `vesting-histories/summary.json`.
- Both campaigns used an isolated contract copy. Before final formatting, all 66 production/harness Solidity files matched the checkout byte-for-byte; SHA-256 identities are retained in `fuzz-source-reconciliation.json`. Independent-model Python sources, replay contract and helpers also match.
- Linked leaf rebuilt in the isolated copy: runtime hash `0x1697d5ac8768609096ddf300d8d11ba75338d0b651f03b87efcc7770271a978f`, matching the prior combined candidate. See `history-linked-build.log`.
- Wallet allowance controls remain available without a selected/live/owned NFT, while enrollment still requires ownership. The focused red/green regression records **43 passing tests** in `allowance-independent-green.log`; full ESLint passes in `lint.log`. All six fresh cancellation/refill browser cases pass in feature006-gate-20260923e, including allowance revocation after retirement and transfer. The broader gate remains separately pending.
- Anvil's bounded-history regression and lifecycle ownership tests pass as recorded in `publication-and-tooling.md`; the complete gate also reruns them.

## Bytecode observations

Current compiled artifact sizes in bytes:

| Contract | Runtime | Creation |
| --- | ---: | ---: |
| MembershipTier | 51,002 | 51,216 |
| MembershipFactory | 13,227 | 69,450 |
| VestingLedger | 29,211 | 29,263 |

These fit the repository's Robinhood limits of 98,304 runtime / 196,608 creation bytes. This is artifact measurement; the full linked test gate and fork deployment remain separate proof. The current linked factory test passes with **705,923 gas** for creator clone deployment, below its 1,000,000-gas limit. The final formatted-source linked leaf runtime hash is `0xe4b2d7eb8dd2afe489a7985b66123fac05a1f4227bcba0a5059c42d2f8c62ac9`.

## Gate continuation

The first gate passed clean-room and all deployment/management CLI checks, then failed `forge fmt --check`. Applied the configured formatter to exactly its 29 flagged files. Formatting the isolated tested copy produces byte-identical files (`format-reconciliation.json`); no contract logic changed. The repository gate resumes at formatting in `verify-local-resume.log`, retaining the original passed stages in `verify-local.log`. Linked artifacts and browser generation will use the final formatted source. Earlier bytecode hashes include earlier compiler metadata and are not the final source identity.

The complete linked Foundry run finished with **671 passed, zero failed, nine skipped** across 74 suites, at the configured 256 fuzz runs / 256 invariant runs × 500 actions. Those skipped cases require the separate genuine-fork environment. The original Slither step then exposed IR parsing failures on extension-style OpenZeppelin `SafeCast` calls, producing initialization/payer false positives. Explicit `SafeCast.toUint*` calls resolve parsing in Slither 0.11.6 without detector suppressions; the isolated high-severity gate passes. The main checkout passes **136 affected linked contract regressions** and Slither 0.11.6 (126 contracts / 101 detectors; 160 non-high findings, exit 0, no parser errors) in `verify-local-final.log`. Runtime bytes excluding compiler metadata are identical before/after the explicit casts (`explicit-cast-bytecode-equivalence.json`), preserving the preceding invariant proof. No detector suppression or dependency change was added.

Read-only fork preflight passed; report retained at `artifacts/protocol-fork/feature006-preflight-20260923a/preflight/report.json`.

The final-source web checks pass: frozen dependency install, generated binding check, Prettier, ESLint, **121 Vitest files / 864 tests**, production build, TypeScript, and **91 non-fork Playwright tests**. The 275 skipped browser cases are fork/viewport-gated, not credited as passed. The build retains the existing optional MetaMask React Native storage warning but compiles successfully.

The gate has entered its authentic fork lifecycle, which independently reruns the complete linked contract suite before deployment. Its candidate preflight source snapshot is `86dde45ba6ed2668eeb02196942c933823baf2eab55916c554a743d191716e83` (dirty checkout based on `c22fb4f911abee67d4eb090209ad348aff11622b`).

The first authentic-fork attempt (`feature006-gate-20260923a`) completed 706 passing tests but failed 14 inherited buyback scenarios because their shared assertion still requested cancellation as the creator. The new authority check correctly rejected it. Updated only `ProtocolBuybacksForkTest._assertReservedRefund` to assert the NFT owner and cancel as that owner. All **30 tests across the three affected fork suites pass** in `fork-owner-regression.log`. No production contract changed. The failed run is retained; fresh complete acceptance runs as `feature006-gate-20260923b` in `verify-local-fork-final.log`.

The second fork attempt (`feature006-gate-20260923b`) passed 718 tests and exposed two randomized invariant failures at the same boundary: its handler requested a future cancellation quote exactly at expiry when one second remained. Production correctly rejects that deadline. The deterministic `test_lastSecondCancellationPreservesModelForPaidAndGiftedPositions` reproduced the failure (`last-second-red.log`) and passes after the handler asserts the unavailable future quote while still testing native same-timestamp exit (`last-second-green.log`). Both paid and sponsored positions preserve model and custody assertions. A short two-invariant smoke test also passes; it is not substituted for the full campaign. No production contract changed. Fresh complete acceptance runs as `feature006-gate-20260923c` with full configured invariant depth in `verify-local-fork-c.log`.

The `c` attempt stopped at linked-build lint on the deliberate timestamp-boundary assertion. Its narrowly scoped test annotation passes the configured linked build (`harness-linked-build.log`). Current full acceptance is `feature006-gate-20260923d`, recorded in `verify-local-fork-d.log`; prior attempts remain retained.

The `d` attempt passed 720 tests and found one further legacy preview fuzz endpoint failure in `VestedAllocationsTest`. A sweep of all dynamic cancellation-preview callers found stale expectations at the last live second and exact retirement. Six deterministic endpoint cases were added: five reproduced old harness failures, then all six passed after aligning tests with the specified unavailable-preview behavior. At the last second the oracle still checks actual refundable funding, native exit and protected cancellation residues; fully retired previews return explicit status. The affected four suites pass **50 tests with 1,024 runs per fuzz test**, and linked build/lint pass (`preview-endpoints-{red,green}.log`, `preview-oracle-regressions.log`, `preview-endpoints-linked-build.log`). Production contracts are unchanged. The current full lifecycle run is `feature006-gate-20260923e` (`verify-local-fork-e.log`).

The current authentic-fork contract run now passes **727 tests, zero failures**, at full configured fuzz/invariant settings. One optional `RUN_ROBINHOOD_FORK_TESTS` Safe-factory test is skipped; the authentic local lifecycle independently executes the launch/Safe checkpoint. Deployment and browser acceptance completed: **86 passed, zero failed, 124 explicitly skipped**.

## Current fork measurements

The final gate preflight records source snapshot `e7dc032c285b68b04b94a23e83d6f4097ccb2c5e932b8e5a30162cfd867a6fed`. Deployed tier implementation runtime is `0x11a31317b3588049bafc08f36957853003374c03186130ee71b5ab3f049f5b36`; linked ledger runtime is `0xe4b2d7eb8dd2afe489a7985b66123fac05a1f4227bcba0a5059c42d2f8c62ac9`. These are authentic local-fork deployment identities, not public deployment claims.

Captured successful transaction samples in `membership-gas.json` measure 15 cancellations at 296,968–500,684 gas and five refill calls at 85,354–572,485 gas (including no-work calls). They are observed scenarios, not universal gas upper bounds. The configured fork block gas limit is 100,000,000.

## Final gate result and evidence-tool corrections

The disposable lifecycle completed all contract, unit, build and browser steps. Its initial final verifier failed on obsolete browser title mappings and the old `grossRefund` preview schema. Updated the verifier to require the current cancellation preview (`canceledGross`, `ownerRefund`, conservative minimum and availability), current retirement/cancellation/recovery journeys, and retained every transaction assertion. The schema regression failed first, then all **20 evidence tests** passed. Export now excludes mutable Finder `.DS_Store` metadata, with a regression for both root/nested metadata. The original artifact index is retained as `artifacts-before-finder-exclusion.json`; only its three Finder entries were removed from the active index. No substantive artifact bytes or recorded source snapshots were changed.

Reverification of the retained receipts and test output passes (`evidence-reverification.log`, `reconciliation.json`: `runLocalPassed=true`). The lifecycle record remains `failed` to preserve the initial verifier failure; this later reconciliation is separately recorded. Contract/web source did not change after the successful run: subsequent changes are evidence tooling/tests and task/evidence documentation. The verifier compares the retained preflight and export source snapshots, which match. No full browser rerun was needed for these verifier-only corrections.

Final lifecycle CLI and real 512-block bounded-history regressions pass (`final-cli.log`); starter/obvious-secret scans are clear. Required formatting/lint and focused evidence tests pass. Earlier stages of `verify-local.sh` remain in their retained logs; the gate was resumed by stage rather than represented as one uninterrupted command.

The broader protocol verifier reports `completeAcceptance=false` because its separate SC-008 two-full-run reproduction criterion was not run. This feature's one destructive fork plus fresh retained feature acceptance does not claim that broader certification, CI success, an independent audit or public deployment.
