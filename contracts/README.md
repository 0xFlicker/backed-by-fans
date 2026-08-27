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
- OpenZeppelin Contracts `v5.7.0`
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

The repeatable broadcast, Wagmi generation, source verification, and official
testnet USDG evidence are documented in the
[deployment runbook](../docs/runbooks/deployment.md).
The exact official testnet proxy is pinned in the deployment guard and verified
against live chain state. No public testnet protocol deployment is recorded
until operational identities, an encrypted funded deployer, source verification,
and operational review are available. The guard rejects arbitrary
metadata-compatible tokens. Mainnet additionally requires the exact `4663`
confirmation value and every human release gate.

Successful public Foundry broadcasts under `broadcast/DeployProtocol.s.sol/`
are committed and consumed directly by Wagmi CLI. Anvil uses chain `31337` and
a temporary `FOUNDRY_BROADCAST` directory, so local evidence cannot modify the
public address map.

The [local lifecycle evidence](../docs/release/local-evidence.md) exercises the
complete creator/supporter and custody path deterministically. It is deliberately
not described as a public pilot or independent review. Release operators must use
the blocked [mainnet readiness checklist](../docs/runbooks/mainnet-readiness.md)
and independent [verification runbook](../docs/runbooks/verification.md).

## Checks

```sh
./scripts/check-clean-room.sh
forge fmt --check
forge build --sizes
forge test -vvv
forge test --match-path "test/deployment/*.t.sol" -vvv
forge test --match-path "test/e2e/LocalLifecycleEvidence.t.sol" -vvv
slither . --config-file slither.config.json --fail-high
```

From the repository root, replay the exact public testnet USDG evidence and
check current proxy state with `./scripts/check-testnet-usdg.sh RPC_URL`.

`FactoryAndFees.t.sol` guards every deployable runtime and initcode against the
network limits and caps tier creation below 6.5 million gas. The guard is
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
- `reentrancy-benign` and `reentrancy-events` identify the immutable tier deployer;
  the factory is its only caller and a new tier constructor cannot call the factory.
- `timestamp` is the intended subscription clock and refund-time input.
- `assembly` is isolated to hash-verified creation-code storage and deployment.
- `too-many-digits` incorrectly classifies `type(MembershipTier).creationCode` as
  a numeric literal.
