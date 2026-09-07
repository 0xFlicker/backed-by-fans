# Validation quickstart: complete protocol forknet

**Status**: Implementation runbook contract. The strict fork entrypoint, runner and buyback scripts
below must be implemented in the later implementation phase; they do not exist yet. Existing baseline
commands are identified separately. This document records no passing software test or live environment.

## Prerequisites

- Repository dependencies: pinned Foundry/Solidity0.8.36, Bun1.3.14, installed Playwright browser,
  existing Slither0.11.6 when running full local verification.
- Private Robinhood mainnet archive RPC with pinned historical state for every selected dependency.
- Matching origin block number and hash; do not copy a `latest` research observation as archive proof.
- Verified deployment manifest: exact Pons version/dependency source and runtime, Safe canonical code,
  exchange/router/WETH wiring, authentic payment tokens, routes and acquisition methods.
- Local-only test keys and funded test ETH. No real wallet signature, public deployment or upstream
  transaction submission is needed for this milestone.
- Retained evidence directory outside temporary cleanup, adequate disk and free loopback ports8547/3110.

## Existing baseline checks

These commands exist today and exercise the current product. After implementation they must also
cover the changed model and generated bindings. They are not substitutes for strict integration.

```sh
cd /Users/user/Development/backed-by-fans
./scripts/verify-local.sh
```

The verification script covers Foundry, CLI tests, Slither, web checks, build and browser suites.
Run focused checks while implementing; run the complete entrypoint once the feature is coherent.
Do not interpret relaxed unit-test code/gas limits as Robinhood deployment proof.

The current `./scripts/test-web-anvil.sh` supports a fork URL but still deploys mock payment assets and
omits the Pons lifecycle. A green baseline fork run does not satisfy this feature.

## Strict preflight and first complete run

The following command interface is to be delivered by implementation. Configure the three private
origin inputs in the shell through the usual secure local setup; never put credentials in evidence.

```sh
cd /Users/user/Development/backed-by-fans
: "${BBF_FORK_RPC_URL:?Set a private archive RPC}"
: "${BBF_FORK_BLOCK_NUMBER:?Set the pinned origin block number}"
: "${BBF_FORK_BLOCK_HASH:?Set its verified block hash}"
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/run-1"
./scripts/test-protocol-fork.sh preflight
./scripts/test-protocol-fork.sh run
```

Expected preflight: confirmed origin4663 and matching block/hash; successful pinned dependency/token
reads; exact runtime/source/role manifest; public launch configuration; canonical Safe; exchange/pool
wiring; and real required asset routes. Failure prints the precise failed gate and preserves its evidence.
It never falls back to latest state, a mock token, changed permissions or invented liquidity.

Expected run: local RPC31337, canonical test Safe, fresh ETH-paired Pons token with vested buybacks and
zero extra creator tax, disclosed developer purchase, new BBF deployment, configured assets/policies,
public runner and production-built web all using the same local environment. Test Safe signatures,
nonce and inner execution outcomes are recorded.

## Required journeys and pass criteria

| Journey | Required outcome and retained evidence |
| --- | --- |
| Launch | Real factory receipt and token/curve identities; exact launch cost/developer purchase; actual taxes and Pons settings recorded |
| Creator publication | 1%, intermediate and100% tiers; immutable terms; invalid rate/over-allocation rejected; token disable blocks new tiers only |
| Membership lifecycle | Joins, renewals, gifts, contributions, grants, rewards/referrals, ownership/artwork updates and claims match the model; unchanged gross refunds use unearned protocol reserves first, then creator proceeds/top-up |
| Accrual and collection | Verify continuous earning against consumed paid time and both stored/projected conservation equations before checkpointing; compare many tiny checkpoints to one; test12-period and fractional cases, generation resets and bounded historical collection across multiple tiers and more than100 IDs, including cursor wraparound, new arrivals and restart |
| Reserved refund backing | At10%,120 tokens/12 periods after3 periods gives3 earned and9 reserve toward90 refund; at100% the reserve funds all unused-time gross refund without owner top-up, even after prior earned fees burn |
| Bonding burn | Real earned membership-fee release, conversion and curve purchase while still bonding; positive acquired output equals actual supply destruction; unused input remains inventory |
| Burn and graduation accounting | Equivalent purchases with and without buyer burns preserve the same curve reserves and graduation/seedability thresholds; launch supply reporting stays distinct from current supply |
| Asset coverage | USDG, authentic Stock Token, WETH/non-stock, protocol-token direct burn and illiquid pending asset; raw/display scaling remains correct |
| Safe controls | Actual signed token/route/policy/pause transactions cannot accelerate earning or spend reserves; invalid signatures, out-of-bound and direct unauthorized calls rejected; recorded public history |
| Execution safety | Below-floor prices, expiry, budget replay, wrong revisions/pools/recipients, callbacks and failed burns cannot consume unauthorized funds |
| Runner replacement | Stop A; independently fund B; next eligible processing within two30-second intervals without policy/authority changes |
| Graduation | Buy through real threshold; test ready/swept/pool-not-ready states; public graduation and pool creation; memberships continue |
| Pool burn | Real post-graduation hook-aware pool trade and actual burn; same membership protocol works afterward |
| Pons compensation | Bonding/pool fees, real vault deposits, partial/additional/final vesting and creator claims; external operator dependence labeled separately |
| Browser | Successful/failure wallet journeys and public reserve/earned/released/configuration/burn activity plus conditional fee-release forecasts; actual receipts/state assertions and retained successful traces |

Full scenario details remain in [acceptance-evidence.md](acceptance-evidence.md). Every required
scenario gets a pass/fail evidence reference, not just a successful test-process exit status.

## Manual review of the same product

New command interface to implement:

```sh
cd /Users/user/Development/backed-by-fans
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/review"
./scripts/test-protocol-fork.sh serve
```

The command prints its run ID, loopback web/RPC endpoints and test account addresses. Use Creator
Studio to publish1% and100% tiers, join and refund them, then inspect the chain-scoped protocol page.
Membership success must remain distinct from reserved fees, earned fees awaiting collection and
pending burns. Confirm refund previews include protocol reserve backing and conditional forecasts
update after cancellation without being presented as guaranteed future buybacks. Public views show Safe changes without
an admin screen. Apply configuration through documented scripts and test Safe execution; retain the
before/after receipts and public view. `serve` must not expose archive credentials to browser code.

For the12-token fee example after3 periods without collection, verify12 protected,9 unearned and3
earned awaiting release, but0 immediately releasable. Checkpoint to make3 releasable, then release;
9 remain protected and3 have been released. Compare all projections at the same block and coverage.

Stop with `./scripts/test-protocol-fork.sh stop --run-id <printed-run-id>` after replacing the token
with the actual run ID. Stop only that run's processes and export artifacts before cleanup. There is
no claim the printed endpoints or balances remain available after shutdown.

## Second clean run and evidence review

Use the identical origin block/hash with a separate empty evidence directory:

```sh
cd /Users/user/Development/backed-by-fans
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/run-2"
./scripts/test-protocol-fork.sh run
```

Compare run manifests and independent accounting outputs. Required equality is preservation of the
specified outcomes and conservation laws. Document differences in local timestamps, nonces or addresses;
do not substitute a resumed/snapshotted first run for a clean bootstrap.

Both runs must retain manifest, exact sources/dependencies, code hashes, Safe and protocol receipts,
per-asset ledgers, supply deltas, runner logs and successful browser traces. A missing required real
Stock Token route, failed graduation, missing vesting proof or unavailable archive state is a failed
acceptance item. Synthetic fault coverage does not erase that failure.

## Completion and delivery boundary

Before claiming implementation complete: all SC001–012 and required evidence scenarios pass, obsolete
fee/withdrawal paths are removed, generated bindings are consistent, full local checks pass, and both
clean fork runs are reproducible. Record software/source, authentic integration, simulated participant
and browser evidence separately. Run the later checklist/tasks/analyze/implement/converge phases.

Public deployment, security audit conclusions, issuer/legal clearance and production economics are
not established by fork results. The feature delivers a working disposable protocol and evidence;
public launch follows its own explicitly authorized milestone.
