# Local policy tools — approved implementation extension

Approved in conversation 2026-09-08, including two-hour history and two-minute samples.
This document supersedes the earlier operating proposal only for this manual-tool increment.

## Requirements

Build observe, generate, optional rehearse, review and submit-fork commands on top of existing
administration tooling. Public submission uses an imported proposal on
`/tools/buyback-policy` in the existing app/server (3110), with a connected wallet.
No hosted simulation backend, second Next server, Solidity changes or automatic renewal.
Existing raw prepare and permissionless processing paths remain available.

Inputs use normal token amounts: network/factory/asset, budget, batch cap, explicit execution
tolerance, maximum reference deviation and maximum price impact. Default lifetime 24 hours;
history two hours, samples every 120 seconds. Public observation uses safe blocks; local uses
latest. SQLite history is scoped to chain/deployment/route/lifecycle and canonical block hashes.
Reject gaps over three sample intervals, incomplete public history and invalid scaling/precision.
Explicit spot proposals are local-fork only. Compare current directional marginal prices against
time-weighted references; obtain actual-sized net quotes and construct integer policy floors.

One currency per initial proposal; shared snapshot plus ordered actions/steps permits later
combined currency proposals. Artifacts include calldata, provenance and a recomputable digest,
no secrets. Report balances (earned held, released, donations and future commitments separately),
old spending versus replacement authority, history, stage, per-leg rates/floors/fees/impact,
batches, gas, expected burn and remainder. Never mislabel combined execution drag as pure impact.

Rehearsal forks selected source at proposal block on a disposable owned loopback Anvil node.
It never mutates/restarts/advances the user's fork. Simulate Safe authorization with labeled
impersonation; accrue/release earned fees; process membership before donations sequentially,
measuring receipts, supply reduction, residuals and gas. Stop on blockers/budget/inventory or
100 processing calls (explicit configurable maximum). No fabricated Pons graduation/operator
actions. Preserve partial/failed/skipped results. Rehearsal isn't enforced by contracts;
new UI accepts explicit acknowledgment when not successful/current. Projections assume no
unrelated trading, public gas costs are estimates, fork gas allowances aren't public guarantees.

Import locally in browser. Validate digest and decoded calldata, refresh identity, Safe nonce,
owners/threshold, revision, route, scaling, stage, expiry and quote validity before signing.
Changes to reviewed terms require a new proposal/signatures. Use Safe Protocol Kit for Safe
signatures/encoding, wagmi/viem for wallet simulation/write/receipt lifecycle. Support sole
owner and multiple EOA owner signatures via explicit file export/import, not a transaction
service. Verify matching inner Safe success, canonical policy and revision after receipt.
Publishing never processes inventory automatically. Keep fixture keys restricted to 31337.

Curve/pool histories stay separate. Handle fees, anti-snipe window, partial fills and graduation
pending. Current contract doesn't invalidate policy across lifecycle; report this residual risk.
Policy renewal grants new budget, not a daily rolling allowance. Direct token burns need no policy.

## Implementation units and ownership

U1 Core/CLI: new `web/src/lib/buyback-policy/*` model, validation, history math and live reads;
new `web/scripts/buyback-policy/*` observe/generate/report CLI and tests; new shell entrypoint.
Reuse existing admin encoder and token metadata. No app changes or dependency edits.

U2 Review/signing: new `web/src/features/policy-review/*` and
`web/src/app/tools/buyback-policy/page.tsx`, focused tests. Consume U1 model.
Reuse existing style and wallet primitives; use Safe SDK. No edits to generated ABI/config,
package files, CLI or shared model; coordinate interface additions with U1.

U3 Rehearsal/integration: `web/scripts/buyback-policy-rehearsal.ts` and tests, dependency/config
integration, documentation and authentic-fork acceptance. Consume U1 model/generator.
Root coordinates tests; shared-tree workers do not stage, commit or run project test commands.

## Acceptance

Unit coverage: exact/scaled amounts, bounds, floors, digest/calldata consistency, time weights,
duplicate blocks, incomplete/gapped/stale/reorg history, lifecycle separation, public spot refusal.
CLI/fork: sequential reserve evolution, partial fills/residual ETH, bucket accounting, truncation,
expiry/nonce/revision/scaling/stage changes, child process isolation and cleanup.
Wallet/browser: import/review/sign/submit/readback, one and multiple owner thresholds, invalid
or duplicate signatures, wallet rejection/replacement and Safe inner failure. Do not claim live
public execution from fork proof. Document immediate spot fork flow and full history flow.

## Progress

- [x] U1 model, history, generation, CLI, report
- [x] U2 local app review and Safe wallet submission
- [x] U3 optional rehearsal and isolated-fork verification
- [x] Documentation, focused checks, integrated browser and fork acceptance

Verification: [local-policy-tools-evidence.md](local-policy-tools-evidence.md).
Operator commands: [local-policy-tools.md](contracts/local-policy-tools.md).
