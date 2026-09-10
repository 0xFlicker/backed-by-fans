# Atomic advancement and currency minima — local implementation evidence

Implemented 2026-09-10 in the existing working checkout. No public deployment, commit or push. Existing review node 18557 and site 3110 were preserved.

## Behavior

Accounting-only, buyback-only and combined calls share typed execution and propagate attempted failures. Known unavailable buybacks emit reasons; stale revision reverts. An empty/use-less call reverts. The 25-checkpoint, 8-tier and 32-asset limits are unchanged. Purchases catch up their own tier; creation does not advance existing tiers. The UI has three actions, fixed budget 25 and optional registered-tier targeting on the protocol page. Wallet/runner estimation uses the native request without the prior 15M override or 20 percent affordability padding.

Minimum payment is a positive uint112 admin registry value, reviewed in TierConfig and immutable in each published tier. Fixed period prices and positive PWYW contributions must meet it; zero PWYW remains access-only. Registry changes during publication review revert explicitly. Safe payload tooling prepares minimum updates and checks postconditions. Deployment journals use schema 8; graph proof uses schema 2. See ../minimum-payment-calibration.md for raw amounts and dated sources.

## Completed local checks

- Linked contract suite: 417 passed, 9 fork-gated skipped, no failures. Authentic pinned-fork suite subsequently passed 465 tests with one intentional skip. Includes 256 gas-starvation fuzz cases proving successful advance cannot mean partially rolled-back work.
- Full 100,000-payment capacity fixture: 2 passed. Existing 100B fixture-construction harness allowance; existing per-call 15M acceptance assertion and 20M transaction allowance remain unchanged.
- Frontend: 645 tests in 96 files passed. TypeScript and ESLint passed. Safe/admin shell suite: 42 tests passed. Lifecycle: 14 tests passed.
- Deployment wrapper dry-run, exact-payload, restart, corruption and recovery suite passed. The final replay also includes the current-multiplier calibration guard.
- Slither 0.11.6 passed --fail-high (116 reported detector results; this is not a claim of zero findings or an audit certificate).
- Final isolated split rehearsal verified exact transaction data, runtime graph, source/library/store bindings and immutable tier minimum. Full retained proof is contracts/deployments/split-rehearsal/.

| Deployment | Transaction data bytes | Gas used |
| --- | ---: | ---: |
| Vesting ledger | 15814 | 3462119 |
| Media store factory | 10029 | 2213477 |
| Renderer | 52459 | 11411670 |
| Preview harness | 882 | 231950 |
| Tier store A | 20539 | 4411721 |
| Tier store B | 20539 | 4409549 |
| Factory | 56132 | 11528540 |
| Creator tier creation | 1572 | 7279902 |

These are exact Anvil transaction data lengths and receipt gas, not signed-RLP lengths or public-chain receipts. The existing 95,000-byte payload and 7.5M creator-creation gates were not relaxed.

## Final run and remaining release evidence

One complete frozen-source production-build run passed: `atomic-acceptance-20260910-08`, authentic origin chain 4663 at pinned block 58083838, execution chain 31337. Contract results: 465 passed, one intentional opt-in capacity skip (the full capacity suite passed separately). Browser results: 74 passed, 100 intentional viewport/mutation skips. All three protocol actions, the positive-payment floor lifecycle, phone contrast after the entrance animation, and all three 101-checkpoint recovery journeys passed. Export retained 665 receipt records; runtime/source graph and run-local reconciliation passed.

Durable evidence: `artifacts/protocol-fork/atomic-minimums-20260910-08/`. The supervisor stopped its own node/site after verification. Earlier failed/terminated exploratory runs and the development-server replay are not acceptance evidence. The latter encountered hot reload during navigation; final acceptance used the production build.

The inherited protocol release verifier explicitly leaves independent reproduction pending until a **second clean run of the identical source/origin** is paired with this one. That release gate has not been waived or marked passed. Named screen-reader observation T074/T089 also remains unrun. This records completion of the local implementation revision, not full release approval or a public deployment.

## Revision convergence review

Reviewed 11 affected functional requirements (FR-043–050, FR-055–057), five acceptance criteria (SC-003/004/007/011/012), five revision plan decisions (atomic execution, bounded selection, native gas estimation, immutable minima, deployment validation) and all five constitution principles. One HIGH contradiction was found: SC-011 still specified survival across failed stages. T096 updates it to the approved atomic rollback/normal-skip behavior and is complete. No additional code gap was identified by this scoped review. T095 local browser and graph validation is complete. Named screen-reader evidence T074/T089 and the inherited independent-reproduction release gate remain incomplete. This is not a declaration that the entire earlier feature has converged.

The direct browser tier helper and review-demo seeder now use the generated createTier argument type. WETH/AMD browser histories pay the configured minimum; fixture-only newly launched token onboarding explicitly configures its own minimum before enabling it. No production currency minimum was reduced to preserve an old test.

Archive verification also passed at its durable repository path. `relocation.json` records only the Playwright attachment-path changes needed for relocation; `browser/report.original.json` and `artifacts.original.json` preserve the original bytes. All original test results, deployment data, receipts and source snapshots remain preserved.
