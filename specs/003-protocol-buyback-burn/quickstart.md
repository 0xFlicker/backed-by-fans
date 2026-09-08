# Complete protocol forknet: operator quickstart

**Status**: Full local verification and two fresh complete fork runs passed on
2026-09-07. Both reproduced all 34 scenarios, 12 success criteria and six
integration gates, with 348 authentic contract tests and 57 production browser
cases passing per run. See [final acceptance](acceptance-evidence.md#final-complete-acceptance--2026-09-07)
for source identity, measured limits and evidence boundaries.

## Prerequisites and private configuration

Use the repository's pinned Foundry/Solidity 0.8.36, Bun 1.3.14 and installed
Playwright browsers. Full verification additionally requires Slither 0.11.6.
Provide an archive RPC with historical Robinhood mainnet state through
`BBF_FORK_RPC_URL` in your shell's private environment. The harness does not source
`.env` files. Never put the credential in a command argument or evidence file.

```sh
cd /Users/user/Development/backed-by-fans
: "${BBF_FORK_RPC_URL:?Configure a private archive endpoint in the environment}"
export BBF_FORK_BLOCK_NUMBER=57010735
export BBF_FORK_BLOCK_HASH=0xdfc65146f32cfd10afd9a620b68c3fc5d02077677ce06c46303e49e80f0a96cf
export BBF_FORK_INPUTS="$PWD/specs/003-protocol-buyback-burn/evidence/pinned-preflight-inputs-20260907.json"
export BBF_FORK_EXECUTION_RPC_URL=http://127.0.0.1:18557
export BBF_FORK_WEB_URL=http://127.0.0.1:3110
```

The origin is chain **4663**; execution is a disposable loopback fork on **31337**.
Only test keys sign. Local test ETH funds the developer, test members, Safe signers
and public callers. USDG and AMD are acquired through real markets; WETH is wrapped
from test ETH. The protocol token and the separately unrouted token are newly
launched through Pons. No public signing or origin-chain mutation occurs.

Both ports must be free. Evidence must use a fresh absolute directory, independent
of temporary state. One harness owns the checkout's production web build at a time;
using different ports does not permit concurrent builds against the same `.next`.

## Preflight and complete run

A standalone read-only check retains 88 explicit source, runtime, role, origin,
asset and route checks:

```sh
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/preflight-review"
./scripts/test-protocol-fork.sh preflight
```

Pass means every check in `preflight/report.json` passes. Unknown historical
constructor arguments remain explicitly `null`; independently compiled runtime
and immutable references are retained separately. A failed check never falls back
to current state, mock liquidity or patched token permissions.

Start a fresh complete run, which includes its own preflight:

```sh
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/run-1"
./scripts/test-protocol-fork.sh run --run-id run-1
```

The run executes Foundry tests and invariants, launches a fresh ETH-paired Pons token
with vested trading buybacks and zero extra creator tax, purchases the developer's
entire initial holding with test ETH, creates a canonical 2-of-3 Safe and immutable
BBF contracts, configures finite policies through signed Safe transactions, builds
the production web app and executes the browser/runner matrix. Scope remains the
full [required scenario matrix](acceptance-evidence.md#required-scenario-matrix).

Each stage writes a named log. An exception exits nonzero, records failure and
stops only the run's owned processes. Branch receipts are exported before snapshot
reversion, and public broadcasts/logs survive teardown. Fault injections and
simulated Pons operator/administrator participation are explicitly labeled.

Success for one run requires `lifecycle.json` status `passed` and
`reconciliation.json` `runLocalPassed: true`. Its manifest remains `running`, with
SC-008 and G6 pending, until a second independent run passes. A process exit alone
is not complete acceptance. Source changes during execution fail reconciliation.

## Second run and independent reconciliation

Keep source files unchanged across the pair:

```sh
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/run-2"
./scripts/test-protocol-fork.sh run --run-id run-2
bun scripts/protocol-fork/verify-evidence.ts artifacts/protocol-fork/run-1 artifacts/protocol-fork/run-2
bun scripts/protocol-fork/verify-evidence.ts artifacts/protocol-fork/run-2 artifacts/protocol-fork/run-1
```

Both commands must succeed and both manifests must report `passed`, every G1–G6
and SC-001–SC-012 passed, and all 34 named scenarios passed. The verifier checks
artifact hashes, executed test names, successful traces, actual token-destruction
receipts, raw-unit conservation, reserved refunds, independent runner replacement,
real graduation and separate native vesting. Missing authentic Stock Token, pool,
vesting or browser proof fails the gate even when synthetic tests pass.

`reproduction.json` compares the two results. Run salts change addresses; local
transaction timestamps and pool token ordering can change raw trade output. Each
run must independently conserve its inputs and match purchased output to the
measured supply reduction. The same origin and source hashes are mandatory.

## Serve, inspect and stop

```sh
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/manual-review"
./scripts/test-protocol-fork.sh serve --run-id manual-review
```

Wait for the printed `Ready` URL. Open `/chains/31337/protocol` for wallet-free
inventory, captured timestamps, conditional fee forecasts, Safe configuration and
history, and the separate Pons compensation ledger. `bootstrap.json`, `fixture.json`
and `browser-environment.json` identify local contracts and test accounts. Use an
Anvil test wallet on chain 31337 for Creator Studio and membership actions.

Publish 1% and 100% tiers, buy 12 periods, inspect earned versus unearned fees,
and refund unused time. At 10%, 120 tokens over 12 periods after three periods
produces 3 earned fees and 9 reserved fees toward a 90-token gross refund. Before
checkpointing, the 3 earned fees are not immediately releasable. Public checkpoint
and release make only that earned portion available to buy and burn. Earning is
continuous over consumed paid seconds; it does not wait for a period boundary.
At 100%, reserved fees fund the entire unused-time gross refund after earlier
earned fees have burned. Forecasts describe existing paid schedules and remain
conditional on refunds, gas, liquidity and valid policies.

For configuration, follow the exact read/prepare commands, JSON fields, payload
inspection and signed Safe execution in the
[operator workflow](contracts/operations-and-evidence.md#implemented-safe-operator-workflow).
The Safe can onboard assets, configure routes and finite policies, pause buybacks
and nominate a validated successor Safe. It cannot withdraw fee inventory, change
the protocol token, upgrade the contracts or accelerate earning. The public runner
needs independently funded gas and no Safe key.

In a second terminal, stop only this run:

```sh
cd /Users/user/Development/backed-by-fans
./scripts/test-protocol-fork.sh stop --run-id manual-review
```

Wait for the supervisor's teardown message. Evidence remains; services and temporary
state are removed. Restart with a **new** run ID and evidence directory. Occupied
ports, stale ownership records and existing evidence paths cause an explicit error;
the harness does not kill unrelated processes or silently overwrite evidence.

The delivery check exercised `serve --run-id manual-review-20260907-stop` under
`artifacts/protocol-fork/manual-review-20260907-stop`, reached readiness, then
executed its matching `stop`. Both ports closed, its owned state record was
removed, and bootstrap/preflight evidence and both accepted run directories
survived. The retained lifecycle status is `terminated`, as expected for an
intentional stop; it is not a failed acceptance run.

## Complete local verification and CI

With the same private origin settings and another fresh evidence directory:

```sh
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/verify-local"
export BBF_FORK_RUN_ID=verify-local
./scripts/verify-local.sh
```

This runs CLI guards, Foundry format/build/tests, Slither's high-severity gate,
generated-binding drift, frozen web dependencies, format/lint/type/unit/build,
standalone browser checks and the shared authentic fork harness. Relaxed unit-test
code/gas limits are separate from deployment bytecode/gas assertions. Verification
contains no commit, push, public deployment or public Safe execution.

The manual GitHub Actions authentic-fork job requires the private
`ROBINHOOD_MAINNET_RPC_URL` repository secret and retains artifacts on failure.
Local completion does not prove that the secret is configured or that CI has run.

## External powers and delivery boundary

Membership-fee purchases burn immediately and never enter Pons vesting. Ordinary
Pons trading fees can separately pay developer compensation and purchase tokens
for Pons's vested mechanism. Deposits, releases and claims are not burns. Pons
administrators can change external configuration and redirect creator compensation;
some fee conversions require their operator. Payment-token issuers can restrict
transfers. These dependencies can leave an asset pending without granting BBF a
rescue withdrawal. Token governance and a DAO are outside this feature.

A completed fork deliverable establishes the recorded local behavior. It does not
establish a public launch, independent security audit, guaranteed future buybacks,
investment return or Stock Token legal clearance.
