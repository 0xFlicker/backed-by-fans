# Backed By Fans contracts

Immutable creator-membership contracts for Robinhood Chain. This directory is
the complete Foundry project; run contract commands here rather than at the
monorepo root.

Read the repository [clean-room policy](../CLEAN_ROOM.md) before changing
protocol source or tests.

## Pinned toolchain

- Foundry `v1.7.1`
- Solidity `0.8.36`
- EVM target `cancun`
- OpenZeppelin Contracts and Contracts Upgradeable `v5.7.0`
- forge-std `v1.16.2`
- Slither `0.11.6` in CI

Install and select the exact Foundry release with `foundryup --install v1.7.1`
and `foundryup --use v1.7.1`. Git submodule links pin dependencies to the exact
commits listed in [DEPENDENCIES.md](DEPENDENCIES.md).

## Setup

```sh
git submodule update --init --recursive
forge --version
```

The reported Forge version must be `1.7.1`. No deployer key belongs in a dotenv
file; use Foundry's encrypted keystore as described in `.env.example`.

The repeatable broadcast, Wagmi generation, source verification, and external
testnet-token evidence are documented in the
[deployment runbook](../docs/runbooks/deployment.md).
Create the chain's Safe first with the canonical Safe v1.5.0 L2 workflow in the
[Safe runbook](../docs/runbooks/safe.md):

```sh
./scripts/create-safe.sh testnet dry-run
./scripts/create-safe.sh testnet broadcast
```

The wrapper defaults to the `backed-by-fans-testnet` encrypted account and
verifies that it resolves to the approved deployer address. The same deterministic
Safe address is used on testnet and mainnet; mainnet creation has a separate
explicit confirmation gate.

The linked ledger, media factory, default renderer, preview harness, locked tier implementation and membership factory deploy through the canonical CREATE2 deployer. The factory constructor receives the reviewed initial token list, media factory, protocol owner, protocol token, fixed implementation and minimum payments; each release has an exact derived payload and address. Rehearse or broadcast only through the guarded wrapper:

```sh
./scripts/deploy-protocol.sh testnet dry-run
./scripts/deploy-protocol.sh testnet broadcast
./scripts/deploy-protocol.sh testnet status
```

If every transaction was mined but source verification failed, recover through
Foundry's durable artifact with
`./scripts/deploy-protocol.sh testnet resume-verify`. The wrapper first proves
the complete deployment onchain without a signer, then lets Foundry resume
verification. It refuses partial deployments; do not rebroadcast a complete one.

Robinhood testnet uses the reviewed external USDG, AMD, NFLX, PLTR, AMZN, and
TSLA token contracts recorded in `config/payment-tokens/46630.json`. The protocol
does not deploy or mint a substitute USDG. Mainnet remains bound to canonical
Paxos USDG only and additionally requires the exact `4663` confirmation value
and every human release gate.

Commit the successful public Foundry broadcast under
`broadcast/DeployDirectProtocol.s.sol/`. Wagmi CLI consumes that deployment for
the factory address. Anvil uses chain `31337` and a temporary
`FOUNDRY_BROADCAST` directory, so local evidence cannot modify the public
address map.

The [local lifecycle evidence](../docs/release/local-evidence.md) exercises the
complete creator/supporter and custody path deterministically. It is deliberately
not described as a public pilot or independent review. Release operators must use
the blocked [mainnet readiness checklist](../docs/runbooks/mainnet-readiness.md)
and independent [verification runbook](../docs/runbooks/verification.md).

## Checks

```sh
./scripts/check-clean-room.sh
forge fmt --check src script test
forge build --sizes
forge test --code-size-limit 1000000 --gas-limit 1000000000 -vvv
forge test --match-path "test/deployment/*.t.sol" --code-size-limit 1000000 --gas-limit 1000000000 -vvv
forge test --match-path "test/e2e/LocalLifecycleEvidence.t.sol" --code-size-limit 1000000 --gas-limit 1000000000 -vvv
slither . --config-file slither.config.json --fail-high
```

The enlarged Forge-only limits accommodate test harnesses that embed production
creation code. Deployable runtime, initcode, and transaction gas remain bounded
by explicit Robinhood limit tests and the guarded deployment preflight.

`FactoryAndFees.t.sol` guards every deployable runtime and initcode against the
network limits and caps the representative clone tier creation below one million gas. The guard is
deliberately a ceiling rather than exact bytecode or gas equality so harmless
compiler variation does not make the gate brittle. `RefundsAndOwnership.t.sol`
also compares refund execution after one and 2,000 variable-price lots, allowing
only a bounded difference to prevent refund work from growing with lot history.

### Static-analysis dispositions

Slither excludes only `weak-prng`: both reports are false positives on modulo
expressions that advance a deterministic refund-lot cursor and never provide
randomness or influence a random selection. No severity class is suppressed.

The remaining reported categories are retained in CI output for review:

- `incorrect-equality` identifies deliberate zero and lot-boundary sentinels.
- `locked-ether` is inapplicable because the payable ERC-5643 signatures reject
  nonzero native value before other logic, while no `receive` or `fallback`
  function exists for other native transfers.
- `reentrancy-benign` and `reentrancy-events` flag registration after clone initialization. The fixed initializer performs trusted library work and static dependency reads, creates no NFT, and invokes no receiver callback. Vault settlement uses its transient reentrancy guard.
- `timestamp` is the intended subscription clock and refund-time input.
- `assembly` includes standard clone creation, linked accounting and the unrelated buyback executor code store. Exact deployment/runtime proofs are retained separately.
- `too-many-digits` incorrectly classifies compiler-produced deployment bytecode as
  a numeric literal.

## Membership tier lifecycle and deployment

`MembershipFactory` creates deterministic ERC-1167 clones directly and stores one fixed `implementation` address. Deploy the locked `MembershipTier` implementation separately, after its pinned VestingLedger library. `initialize(config)` takes its factory from the caller and sets each clone's own metadata, ownership and fixed economics exactly once. There is no tier deployer, A/B tier code store, upgrade admin or upgrade method. The unrelated buyback executor code store remains part of deferred protocol-token binding.

Custom membership changes and `claimReward` accept a trailing `maxAccountingSteps`; `claimEverything(requests, maxAccountingSteps)` shares that caller budget across its ordered tiers. Requests must list tier addresses and token IDs in ascending order without duplicates. Standard ERC-5643 entry points use zero queued-event work and require explicit maintenance when a checkpoint is due. Transfers remain independent of accounting catch-up and available while paused.

Maintenance accepts any positive work budget; previews may use zero. Pagination clamps a caller-supplied limit to the remaining data without overflow. Router tier/purchase arrays and vault execution-limit arrays use canonical ascending addresses. These APIs have no fixed iteration maxima. Callers retain ordinary gas and RPC resource constraints; failed atomic operations roll back, while successful maintenance retains progress.

The web's Claim all flow discovers at one block, rechecks captured ownership, chooses transaction batches using simulation and gas estimates, and resumes uncompleted work after wallet rejection. Frontend page and work defaults are application policy.

Validate production runtimes against Robinhood's 98,304-byte runtime and 196,608-byte initcode limits. Larger Foundry test-harness envelopes do not prove production deployability. The fresh local fork on chain 31337 is separate from public explorer verification: verify the shared implementation and factory and test clone recognition during the next authorized testnet deployment. This change performs no public deployment.
