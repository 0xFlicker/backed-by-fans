# Final feature acceptance

Date: 2026-09-23. Outcome: passed for the specified local implementation and retained review scope.

## Candidate identity

- Branch: `codex/006-member-cancellation-refill`; uncommitted checkout based on `c22fb4f911abee67d4eb090209ad348aff11622b`.
- Disposable gate: `artifacts/protocol-fork/feature006-gate-20260923e/`; preflight/export snapshot `e7dc032c285b68b04b94a23e83d6f4097ccb2c5e932b8e5a30162cfd867a6fed`.
- Retained review: `artifacts/protocol-fork/feature006-review-20260923-finalb/`; preflight snapshot `98a216de0ca03f6e19a852e0e6871d7a7356405bce7191fbcba64f6c2e7939e1`.
- Runtime hashes match across both deployments: tier `0x11a31317b3588049bafc08f36957853003374c03186130ee71b5ab3f049f5b36`; linked ledger `0xe4b2d7eb8dd2afe489a7985b66123fac05a1f4227bcba0a5059c42d2f8c62ac9`.
- Exact deployment/link records: `bootstrap.json`, `link-manifest.json`, `origin-header.json`, `transactions/`, `fixture-transactions/`, `preflight/report.json` in each run. `tested-source-files.json` records 526 current source/test/tool file hashes for the retained candidate.
- Source snapshot differences after the disposable run are the corrected evidence verifier/exporter and its tests, local seeder gas margin, and task/evidence records. Contracts and product behavior did not change. Later convergence/task documentation changes do not change deployed code.

## Proof classes

| Proof | Result | Retained record |
| --- | --- | --- |
| Linked contracts | 727 passed, zero failures, one optional external Safe-factory test skipped | disposable `contracts.log` |
| Full local checks | 671 initial linked tests, 136 affected regressions, Slither, generation, formatting/lint, production build, 864 web tests, 91 non-fork browser tests | recovery logs and local-verification.md |
| Independent model | 16 histories × 100 actions; all budgets 2–25 and sparse/dense/irregular replay | recovery `vesting-histories/` |
| Fuzz campaigns | Medusa 501,162 calls / 116 tests; Echidna 50,145 calls / 98 tests; no failures | recovery campaign logs/corpora |
| Broad authentic-fork browser | 86 passed, zero failed/flaky; 124 deliberate viewport skips | disposable `browser/report.json` |
| Retained deployment browser | six passed, zero skipped/failed | retained `feature-browser/report.json` |
| Retained feature receipts | six snapshot-restored branches reconciled | retained `feature-browser/membership-reconciliation.json` |
| Live funded review | eight positions, ownership/funds/Safe/mode/runtime verified at block 58084082 | retained `review-readiness.json`, `review-seed.json` |

The six final journeys cover paused approved-operator cancellation with owner-only payout, refill-before-cancel, cancel-before-refill, third-wallet whole-period refill and strict expiration, shared 55/40/20 coverage with competing refill and paused approvals, and grant/transfer consent clearing with explicit restart. Post-retirement and former-owner allowance revocation both pass. Each transactional browser branch was reverted before wallet seeding.

## Quickstart reconciliation

| Quickstart obligation | Current implementation/evidence |
| --- | --- |
| Cancellation authority, endpoints, monotonic terms, fractions and adapter | MemberCancellation/ERC5643Adapters/RefundsAndOwnership/Vesting suites; model campaigns; operator and cancellation browser branches |
| Refill arithmetic, partial funding, referral locks, grants and cap changes | PeriodicRefill and PeriodicRefillLifecycle tests; whole-period browser and shared-coverage branches |
| T-1/T/T+1, payment rollback and independent maintenance | PeriodicRefillIsolation; lifecycle/invariant/model tests; expired-position browser assertions |
| Protected quotes and non-live states | MemberCancellation projection/boundary tests; cancellation-read/component tests; owner/operator browser journeys |
| Concurrent orderings, pause, stop and transfer/revocation | lifecycle contract tests and all six retained journeys |
| Discovery and accounting backlogs | disposable 101-position/nine-tier account, 260-position transfer, three bounded recovery journeys |
| Keyboard, narrow layouts, transaction states | browser axe/focus/overflow checks and screenshots; component tests; accessibility.md |
| Docs/interfaces/reporting | generated bindings check, exact interface tests, payout/event consumers, whitepaper PDF build/render review |

Exact numeric examples and exceptional-token cases are contract/model proof, not falsely represented as every scenario having a separate manual browser run. The browser and fresh fork prove the integrated supported journeys against the same runtime.

## Final fixture

Both supplied wallets have four live memberships (three USDG, one WETH), 1,000 USDG and 1 WETH remaining, plus approximately 10 native gas tokens each. First-month protocol allocation is 300 USDG + 0.02 WETH; this is funded future accrual, not a claim it is already earned or burned. The second wallet owns both review tiers and is a Safe signer with threshold one. The module is `OperatorGuarded`.

The earlier `feature006-review-20260923-final` passed six feature journeys but its seed failed with a traced delegatecall out-of-gas. That run is retained and terminated. The seed helper now uses the same interval-mining gas safety margin as the tested browser fixture. The fresh `finalb` seed succeeds; its entire seed operation was protected by an Anvil snapshot. Formatting and TypeScript checks pass after this script-only fix.

## Limits

This is source, local-model, browser and authentic-local-fork evidence. No CI result, independent audit, public deployment or migration is claimed. The broader protocol verifier's separate two-full-run reproduction criterion remains not-run; its `runLocalPassed=true` is recorded independently from `completeAcceptance=false`. The disposable lifecycle retains its initial evidence-verifier failure, followed by successful corrected reconciliation, as detailed in local-verification.md. No commit, push or merge was performed.
