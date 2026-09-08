# Operations and evidence contract

## Safe administration

Use the existing `contracts/scripts/manage-payment-tokens.sh` for list/inspect/enable/disable; remove
withdraw. Extend it to the isolated fork environment and genuine Safe payload workflow. Add
`contracts/scripts/manage-buybacks.sh` for route/policy inspection and Safe proposals. The exact CLI
contract to implement is:

```text
manage-payment-tokens.sh <forknet|testnet|mainnet> <list|inspect|enable|disable> [token]
manage-buybacks.sh <forknet|testnet|mainnet> inspect [asset]
manage-buybacks.sh <forknet|testnet|mainnet> prepare <route|policy|pause|asset-pause> --input <json-file> --output <payload-file>
```

Read/prepare modes never submit transactions. Public network execution stays in the approved Safe
workflow. Fork test execution uses test-only owner signatures and actual Safe `execTransaction`;
there is no direct EOA bypass for admin changes. Production signing policy is not changed by the local
2-of-3 fixture. Scripts must distinguish preparation, signature collection and confirmed execution.

Payload includes chain ID, Safe address/nonce, target/version/code hash, call value0, operationCall,
calldata, decoded method/arguments, previous/current expected revision, intended postconditions and
reference evidence for prices. Never include secrets. Refuse unknown target, unsupported token behavior,
wrong chain, missing code, invalid bounds or inconsistent raw/display amounts. Safe execution verifies
inner `ExecutionSuccess` versus `ExecutionFailure`, followed by canonical target state.

No custom admin screen or required Safe Transaction Service is added. Public configuration remains
visible in the app. Routine burns need no Safe signature and cannot spend gas reimbursements from inventory.

## Runner

New entrypoint to implement: `web/scripts/run-buybacks.ts`.

```text
bun scripts/run-buybacks.ts --rpc-url <execution-rpc> --factory <address> --once
bun scripts/run-buybacks.ts --rpc-url <execution-rpc> --factory <address> --interval-seconds 30
```

An externally funded runtime signer is supplied through the existing secure process configuration;
never through browser-public variables, command output or committed files. Fork uses a deterministic
local test account. On first use verify chain, factory/vault/token and selected dependency identity.
Page registered tiers and member IDs, checkpoint fee accrual in bounded batches, and release each
tier's earned-held fees using the same viem transaction primitives. Revisit historical expired IDs
with unpaid earnings; no NFT-ownership requirement or unbounded member scan. Then read each vault
asset independently, obtain current policy revision and eligibility, simulate, submit the
exact viem simulated request, await viem receipt, then inspect logs and canonical postconditions.
No automatic retry of a transaction with uncertain outcome, custom receipt polling, nonce bookkeeping
or persistent pending-intent database. A later scheduled eligibility read is not permission to recreate
an unresolved write. Fail visibly if the library cannot establish the submitted transaction outcome.

Log one attributable record per attempted action: chain, current policy, asset/bucket, amount, reason,
library-supplied hash/receipt and resulting balances. Keep missing gas/RPC, stale policy, unavailable
price, no liquidity and exhausted budget distinct. One blocked asset does not prevent another's scan.
A second funded caller can take over without sharing the first runner's key or asking the Safe.

Discovery fairness is explicit: fix the tier count and each tier's historical-member upper bound at a
captured sweep-start block, retrieving those bounds through paginated reads as needed. Keep forward
tier/member cursors in memory. Visit unfinished tiers round-robin, examining one page of100 IDs
(or the remaining shorter page) per visit, including expired credentials. Advance after examination;
a known failed release or blocked market does not restart discovery or monopolize later visits.
Unknown transaction outcomes still follow the library-owned failure boundary above.

After each page, release eligible checkpointed funds and consider available vault inventory; do not
defer all processing until the full sweep completes. With successful reads and uninterrupted execution,
the captured population is examined within the finite visit bound in [fee-accrual.md](fee-accrual.md).
New arrivals outside that range are included after wraparound starts the next sweep. Failed discovery
pages remain visibly incomplete and cannot be silently marked visited.

Scheduled mode retains discovery progress across rounds rather than restarting at the first tier every
30 seconds. `--once` completes one finite paginated sweep and its eligible collection/processing work;
its total runtime is not promised to fit one interval. Restart may reset these discovery cursors and
starts a fresh captured range, using canonical entitlements and balances to avoid duplicate releases.
No persisted transaction journal, custom receipt recovery or automatic replay of an unresolved write
is introduced. Complete-sweep fairness assumes availability long enough to finish that sweep.

Tests must span multiple tiers and more than100 members, with eligible expired IDs on later pages,
a blocked asset, new arrivals during a sweep, cursor wraparound and a restart. The separate runner A→B
test retains its small eligible fixture and two-interval target; it does not promise collection of the
entire population within60 seconds.

Implemented runner signing uses the private runtime environment variable `BBF_RUNNER_PRIVATE_KEY`; never put it in `NEXT_PUBLIC_*` or command arguments. The CLI validates canonical BBF runtime/wiring and the Safe before processing. Each scheduled round visits one historical-member page and attempts one policy-bounded batch per available asset/bucket. `--once` completes one captured discovery sweep; it does not promise to exhaust a large inventory in one sweep. `--asset <address>` may be repeated to include donated assets outside the payment registry. Registered assets, the protocol token, ETH and their configured conversion currencies are discovered automatically. Logs contain current eligibility, raw amounts, viem receipts and resulting balances; RPC endpoints are redacted. A submission/receipt error stops the process without replay. Fork transactions use a fixed local gas price; public transactions use viem fee estimation.

The public deployment wrapper's `prepare` action requires `PROTOCOL_TOKEN_ADDRESS` for an already-launched native-ETH Pons token and a committed checkout. It writes a schema-3 operational-state candidate with the token and current deterministic components for review. Until that real launch exists, the prior schema-2 public records remain historical and release actions fail closed. The local fork token must never be used to prepare public deployment state.

## Strict fork entrypoint

New `scripts/test-protocol-fork.sh` extends shared Anvil bootstrap support. Required environment:

- `BBF_FORK_RPC_URL`: private origin archive endpoint, reads only.
- `BBF_FORK_BLOCK_NUMBER` and `BBF_FORK_BLOCK_HASH`: matching pinned origin identity.
- `BBF_FORK_EVIDENCE_DIR`: absolute retained output directory, separate from disposable files.

Modes: `preflight`, `run`, `serve`, `stop`. `run` executes a clean complete acceptance run then tears
down; `serve` leaves the isolated web/runner/RPC available for manual review and prints a local run ID;
`stop --run-id <id>` stops only processes owned by that run after exporting artifacts. `preflight`
performs read-only dependency/asset/archive checks and never claims full acceptance.

Refuse missing pinned identity, a non-loopback execution endpoint, origin-chain public broadcasting,
public keys in test config, missing external dependencies, mock replacement or an evidence directory
inside the cleanup tree. Origin credentials never enter browser variables. Record source chain4663
and local chain31337 separately and verify chain-sensitive external behavior. Public deployment scripts
retain their own release gates; do not relax them just to accept the local fixture.

The authentic run creates a fresh Safe and token/protocol deployment. Fresh local wallets may receive
test ETH. Authentic payment assets must arrive through real token transfers/trades. If existing-holder
impersonation is required to supply a token, label it simulated holder participation and preserve actual
transfer restrictions; never patch token balances/issuer permissions or pool liquidity for a real pass.
Pons operator participation is separately marked, not assigned to the ordinary BBF runner.

## Required manifest and retained artifacts

`manifest.json` includes schema version, run ID, application commit/dirty-tree identity, exact tool and
dependency revisions, origin chain/block/hash, execution chain, code/source/compiler/immutable manifest,
actual deployment addresses and receipts, Pons preset/economics/role map, Safe owners/threshold,
asset acquisition methods and route/policy inputs, execution funding and outcome of every acceptance ID.
A dirty source run records its source snapshot hash; a git commit alone cannot identify uncommitted code.

Subdirectories retain:

- `preflight/`: pinned read results, runtime hashes, compiler/source references and unavailable gates.
- `transactions/`: launch, acquisition, developer purchase, Safe configuration, membership,
  graduation/pool, swaps/burns, external sweeps/vesting/claims with decoded receipt evidence.
- `accounting/`: per-member lot/generation paid clocks, tier-level reserved/earned/released/refunded ledgers,
  cancellation rounding, conditional release forecasts, protected liabilities and vault supply deltas.
- `browser/`: successful and failed Playwright traces, screenshots and test assertions.
- `runner/`: funding, eligibility decisions and runner A→B replacement proof.
- `faults/`: exact deliberate state changes and simulated participants, separated from authentic run.

Persist before cleanup on success, failure and termination. Redact credentials and omit keys. Missing
artifacts fail the relevant acceptance item. A successful subprocess or Safe outer receipt is not
sufficient evidence. Two clean runs compare accounting/lifecycle requirements; incidental addresses,
hashes and timestamps may differ when documented. Never compare different origin blocks as a replay.

## Implemented Safe operator workflow

Set `BBF_ADMIN_RPC_URL` to the current disposable loopback RPC and `BBF_FACTORY_ADDRESS` to its bootstrap factory. From the repository root:

```sh
./contracts/scripts/manage-payment-tokens.sh forknet list
./contracts/scripts/manage-payment-tokens.sh forknet inspect "$PAYMENT_TOKEN"
./contracts/scripts/manage-payment-tokens.sh forknet enable "$PAYMENT_TOKEN" > /tmp/token-enable.json
./contracts/scripts/manage-buybacks.sh forknet inspect "$PAYMENT_TOKEN"
./contracts/scripts/manage-buybacks.sh forknet prepare policy --input /tmp/policy.json --output /tmp/policy-safe.json
jq '{chainId,safe,safeNonce,to,targetVersion,targetCodeHash,value,operation,decoded,previousRevision,expectedRevision,referenceEvidence,postconditions}' /tmp/policy-safe.json
```

Policy JSON contains `asset`, `expectedRevisionRaw`, `expectedSafeNonceRaw`, `policy` and `evidence`. Policy fields are decimal-string `validAfterRaw`, `validUntilRaw`, `batchCapRaw`, `totalBudgetRaw`, plus `rates`, each containing decimal-string `numeratorRaw`/`denominatorRaw` and integer `toleranceBps`. Evidence contains `reference` and `rationale`. Route input replaces policy/evidence with the typed `pools` array. Global pause needs `expectedSafeNonceRaw` and boolean `paused`; asset pause also needs `asset`. Unknown fields and existing output files are rejected. Inspect current nonce/revision and raw units before preparation. Optional ERC165 reverts are accepted; RPC failures remain errors.

Review the decoded Call, zero value, Safe, target code/version, nonce, revisions, rates, expiry, finite exposure and linked evidence. Collect the Safe's required owner signatures using its normal signing workflow, then execute that exact transaction. Preparation never signs or submits. The local harness's `scripts/protocol-fork/safe-transactions.ts` uses two distinct disposable owner keys and viem simulation/submission/receipts. It verifies matching inner `ExecutionSuccess`, incremented nonce, and canonical target state including revision. An outer success with inner `ExecutionFailure` fails. Reinspect and prepare anew if nonce, code or revision changes; do not alter signed calldata.

Public modes use generated factory addresses or an explicit operator factory and verify the new runtime and immutable wiring. Old deployments fail identity checks. Public deployment and signing gates remain separate. The Safe chooses economics and can pause processing; it cannot withdraw inventory, replace the token or accelerate earning. External Pons/issuer powers remain disclosed.

Run `./contracts/scripts/test-manage-payment-tokens.sh` and `./contracts/scripts/test-manage-buybacks.sh` for CLI guards. Genuine signed execution receipts are retained in `../evidence/launch-safe-20260907-r4/transactions/`. Its node is stopped and its addresses are evidence only; browser acceptance remains pending.
