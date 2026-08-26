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

## Checks

```sh
./scripts/check-clean-room.sh
forge fmt --check
forge build --sizes
forge test -vvv
```
