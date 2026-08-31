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

The public renderer and production factory deploy directly through Foundry's
canonical CREATE2 deployer. The production factory has no constructor arguments;
its constructor selects USDG from `block.chainid`, so mainnet and testnet use the
same factory initcode and therefore the same protocol addresses. Rehearse or
broadcast only through the guarded wrapper:

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

Robinhood testnet uses the deployer-mintable `LOL Dollar` token with symbol
`USDG`. Deploy it before the protocol, then mint human-readable amounts to test
wallets:

```sh
./scripts/deploy-testnet-usdg.sh dry-run
./scripts/deploy-testnet-usdg.sh broadcast
./scripts/mint-testnet-usdg.sh 0xRecipient 100 broadcast
```

The app refers to this token only as USDG. Mainnet remains bound to canonical
Paxos USDG and additionally requires the exact `4663` confirmation value and
every human release gate.

Commit the successful public Foundry broadcasts under
`broadcast/TestnetUSDG.s.sol/` and `broadcast/DeployDirectProtocol.s.sol/`.
Wagmi CLI consumes both: the first supplies the testnet USDG address and the
second supplies the factory address. Anvil uses chain `31337` and a temporary
`FOUNDRY_BROADCAST` directory, so local evidence cannot modify the public
address map. Minting uses the separate `MintTestnetUSDG.s.sol` script so a mint
cannot overwrite the token deployment record Wagmi consumes.

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
- `assembly` is isolated to hash-verified tier creation-code storage.
- `too-many-digits` incorrectly classifies `type(MembershipTier).creationCode` as
  a numeric literal.
