# Complete protocol forknet: operator quickstart

**Current operating model:** standing batch sizes and cooldowns replace daily policy
renewals. The [operating model](operating-model-proposal.md) defines the replacement.
A new deployment is required; restoring an old state dump keeps its old contracts.

**Historical acceptance:** the 2026-09-07 runs and their counts in
[final acceptance](acceptance-evidence.md#final-complete-acceptance--2026-09-07)
prove the earlier expiring-policy implementation at its recorded origin. They do
not prove the replacement contracts or a refreshed origin; retain them as history.

## Prerequisites and private configuration

Use the repository's pinned Foundry/Solidity 0.8.36, Bun 1.3.14 and installed
Playwright browsers. Full verification additionally requires Slither 0.11.6.
Provide an archive RPC with historical Robinhood mainnet state through
`BBF_FORK_RPC_URL` in your shell's private environment. The harness does not source
`.env` files. Never put the credential in a command argument or evidence file.

```sh
cd /Users/user/Development/backed-by-fans
: "${BBF_FORK_RPC_URL:?Configure a private archive endpoint in the environment}"
unset BBF_FORK_BLOCK_NUMBER BBF_FORK_BLOCK_HASH BBF_FORK_INPUTS
# The verified block and retained source/route inputs come from scripts/protocol-fork/origin.json.
export BBF_FORK_EXECUTION_RPC_URL=http://127.0.0.1:18557
export BBF_FORK_WEB_URL=http://127.0.0.1:3110
# Manual serve mode hands the one-owner Safe to this wallet and funds it locally.
export BBF_FORK_OWNER_ADDRESS=0x467172992E0aBa58411d14eC8b174167B0e359a6
```

The origin is chain **4663**; execution is a disposable loopback fork on **31337**.
Disposable test keys sign bootstrap transactions. In manual `serve` mode, the Safe
is handed to `BBF_FORK_OWNER_ADDRESS` with threshold 1; that wallet signs later
settings changes. Acceptance `run` mode retains a separate test multisig.
Local test ETH funds the developer, test members, Safe signers
and public callers. USDG and AMD are acquired through real markets; WETH is wrapped
from test ETH. The protocol token and the separately unrouted token are newly
launched through Pons. No public signing or origin-chain mutation occurs.

Both ports must be free. Evidence must use a fresh absolute directory, independent
of temporary state. One harness owns the checkout's production web build at a time;
using different ports does not permit concurrent builds against the same `.next`.

## Refresh the origin before replacing a stale fork

The checked-in `scripts/protocol-fork/origin.json` is the shared origin for the
Python lifecycle, TypeScript preflight and Solidity fixture. Old evidence retains
its original block. A restart uses this manifest; it never silently changes to
latest state when a historical read fails.

With the private origin RPC configured, verify a current safe block:

```sh
bun scripts/protocol-fork/refresh-origin.ts safe artifacts/protocol-fork/origin-review
```

This makes only RPC reads. It writes a candidate `origin.json` and `report.json`
to a fresh evidence directory, and leaves the shared pin and running fork alone.
It verifies the existing retained runtime/source identities, Pons roles and launch
configuration, Safe infrastructure, WETH proxy implementation, token metadata and
positive connected route quotes at the same block. It then rechecks the block hash.
A positive route quote proves that amount is quotable, not that every proposed
batch or a new token graduation will succeed.

Apply a freshly verified candidate to the shared local pin with:

```sh
bun scripts/protocol-fork/refresh-origin.ts safe artifacts/protocol-fork/origin-apply --apply
```

Use the printed block number instead of `safe` if you want to apply the exact
reviewed candidate; it is verified again. `finalized` is also supported. A provider
without these tags must be given an explicit block number. Failures leave the
shared pin unchanged; they never regenerate runtime locks. If external code or
roles changed, inspect the failing checks, independently verify the new source,
and deliberately update the retained inputs before trying again. If liquidity
changed, review the route and acquisition amounts; do not patch pool reserves.

After applying, stop the one owned local run, use a fresh run ID/evidence directory,
and deploy the replacement. **Do not load an old Anvil state dump across a repin
or contract replacement.** Clear stale block environment overrides, which now
fail explicitly instead of selecting a different origin. Re-run contract and
browser acceptance, including authentic curve purchases, graduation and pool
purchases. Repinning alone is discovery, not acceptance.

Record the old/new block and hash, failed checks and any reviewed source/route
changes, deployment addresses, funded wallet, and actual acceptance evidence in
the new run directory. Each refresh directory is retained review evidence; delete
obsolete local refresh directories when no longer needed. The tool creates no
background collector or unbounded cache.

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
entire initial holding with test ETH, creates a canonical 2-of-3 test-fixture Safe and immutable
BBF contracts, configures standing limits through signed Safe transactions, builds
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

### Fund a personal wallet on the running fork

The wallet needs assets on execution chain **31337**. Testnet balances and assets
received on mainnet after the pinned block are unavailable here. With the browser
fixture running, fund any public address from `web/`:

```sh
cd /Users/user/Development/backed-by-fans/web
BBF_ADMIN_RPC_URL=http://127.0.0.1:18557 bun scripts/fund-fork-wallet.ts YOUR_WALLET_ADDRESS ../artifacts/protocol-fork/YOUR_RUN_ID
```

Each invocation adds 10 local ETH, up to 100 USDG, up to 0.1 AMD and 1 WETH.
If a token reserve is smaller than the preferred amount, it transfers half that
reserve and reports the exact amount. A JSON receipt records funded balances.
It checks the local
chain and deployed factory, transfers USDG/AMD from the finite fixture reserves,
wraps local ETH for WETH, and checks successful receipts and recipient balances.
It refuses public RPCs and never patches token balances. If the fixture reserves
are exhausted, prepare a fresh fork. Funding disappears when that fork is stopped.

Membership checkout offers an exact-shortfall ETH wrap for the verified WETH
payment token, including gifts. Confirm the wrap, then continue with payment.
Keep ETH for both transactions' network fees.

For a saved manual-review session, `serve` also accepts `BBF_FORK_RESTORE_STATE`
(an Anvil JSON state dump) and `BBF_FORK_RESTORE_EVIDENCE` (the original run directory).
The saved run must record the same origin as `origin.json`; repinning requires a
fresh deployment. Use a fresh evidence directory and run ID. Restoration serves the
frontend with hot reload on the usual port. This mode is explicitly excluded from
fresh acceptance verification; keep state dumps private because they contain local
wallet and chain state.

```sh
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/manual-review"
./scripts/test-protocol-fork.sh serve --run-id manual-review
```

A fresh `serve` run uses a **1-of-1 test Safe** and the normal Next development
server with hot reload, always on the configured single port. Its initial owner
is fixture key A so bootstrap configuration can complete. With
`BBF_FORK_OWNER_ADDRESS` set as above, startup automatically executes and verifies
the owner change, funds that wallet, and prepares three demo memberships before
starting the web server. The wallet owns WETH Fans, USDG Fans and AMD Fans, buys
four 30-day periods on each, and the fork advances once by 15 days. Protocol
allocation and member rewards are 25% each. This makes earned buyback fees
available without manually repeating creator setup, purchases or time travel.
The wallet retains at least 20 ETH for testing.
`owner-handoff.json` records the Safe and final owner; the wallet-funding JSON
records the balances; `buyback-demo.json` records the tier addresses and setup
timestamp. Re-running the demo command leaves a completed setup unchanged:

```sh
cd /Users/user/Development/backed-by-fans/web
BBF_ADMIN_RPC_URL=http://127.0.0.1:18557 bun scripts/seed-buyback-demo.ts ../artifacts/protocol-fork/YOUR_RUN_ID 0x467172992E0aBa58411d14eC8b174167B0e359a6
```

The buyback page rehearses through stateless `eth_simulateV1` calls. It never
starts another Anvil, changes your memberships, or advances the source chain.

### Burn from the protocol page

At the top of `/chains/31337/protocol`, connect any funded wallet on the local
network and press **Burn**. The page discovers current earned fees and currency
settings when clicked, simulates the batch, then requests **one wallet
transaction**. No protocol Safe signature is needed.

The factory's immutable `burnRouter()` collects fees from registered memberships,
releases them to the vault, and processes eligible buybacks/direct burns. The
vault rechecks size limits, cooldowns, pauses and revisions at execution. A failed
currency does not discard another currency's successful work. Membership fees
and donations alternate first opportunity after successful purchases so a shared
cooldown cannot continually favor membership fees.

Each transaction collects at most eight tiers and 100 membership IDs, and checks
up to 32 canonical currencies. Browser discovery rotates through bounded pages
for larger registries. Press Burn again to build the next batch from fresh state.
If only collection can progress, the result says **Earned fees collected**; it
does not claim a burn. If nothing is ready, no wallet transaction is requested.
Existing detailed collection and per-currency controls remain available below.

The separate
`run` acceptance mode deliberately retains a 2-of-3 test fixture. Neither choice
imposes a production signer count.

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
conditional on refunds, gas, liquidity and configured standing limits.

For batch sizes and timing, open `/tools/buybacks` and follow the
[calculator workflow](contracts/local-policy-tools.md#open-the-calculator).
Review all selected currencies and save them together through the Safe. The
[operator workflow](contracts/operations-and-evidence.md) also covers asset and
route administration.
The Safe can onboard assets, configure routes and standing limits, pause buybacks
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
