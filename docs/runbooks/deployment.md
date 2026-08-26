# Robinhood deployment runbook

This runbook prepares a reproducible Backed By Fans protocol deployment and an
independent, captured-block verification. It does not authorize a mainnet
deployment.

Before any public execution, review the separate
[mainnet go/no-go](mainnet-readiness.md), [Safe configuration](safe.md),
[ownership](ownership.md), [independent verification](verification.md),
[monitoring](monitoring.md), and [incident response](incident-response.md)
procedures. A deployment manifest records observed chain state; the signed
readiness record binds it to freeze, review, reproduction, operations, and human
authorization evidence.

## Current testnet blocker

Robinhood's official documentation currently publishes chain IDs `4663` and
`46630`, but its token-contract page publishes USDG only for mainnet. There is
no approved canonical Robinhood testnet USDG proxy address. Consequently,
[`contracts/deployments/robinhood-testnet.json`](../../contracts/deployments/robinhood-testnet.json) is a
schema-valid blocked record and `DeployProtocol` fails if the testnet token
input is absent. Never substitute a guessed address or relabel a mock as the
canonical token.

Once an approved official source publishes the address, record that source in
the release evidence and replace the blocked record only after completing every
step below. The official public endpoints are:

- Testnet RPC: `https://rpc.testnet.chain.robinhood.com`
- Testnet explorer: `https://explorer.testnet.chain.robinhood.com`
- Testnet Blockscout verifier API: `https://explorer.testnet.chain.robinhood.com/api/`
- Mainnet RPC: `https://rpc.mainnet.chain.robinhood.com`
- Mainnet explorer: `https://robinhoodchain.blockscout.com`

Recheck the official [connection details](https://docs.robinhood.com/chain/connecting/),
[token contracts](https://docs.robinhood.com/chain/contracts/), and
[deployment guidance](https://docs.robinhood.com/chain/deploy-smart-contracts/)
on deployment day rather than treating this runbook as a live registry. These
official pages and endpoint values were last checked on 2026-08-26.

Public RPCs may be rate limited. An RPC transport error is not a contract
failure; the independent checker reports it before running any contract checks.

## 1. Reproduce the artifact

From `contracts/`, use the pinned toolchain and a clean checkout:

```sh
git submodule update --init --recursive
forge --version
./scripts/check-clean-room.sh
forge fmt --check
forge build --sizes
forge test -vvv
```

Forge must report `1.7.1`. Confirm the compiler settings in `foundry.toml` and
the exact dependency commits in `DEPENDENCIES.md`. Import the deployer into a
Foundry encrypted keystore; never put a private key in `.env`:

```sh
cast wallet import backed-by-fans-testnet --interactive
```

## 2. Set and independently review operational inputs

Copy `.env.example` to an ignored `.env` and fill the testnet chain, canonical
USDG proxy, protocol owner, and fixed fee recipient. Confirm all four values
out of band. `DeployProtocol` enforces chain `46630`, token code, nonempty USDG
name, symbol `USDG`, and six decimals. The reusable mainnet guard accepts only
the official mainnet USDG proxy
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, but mainnet execution remains
outside this runbook and requires the U11 audit and authorization gate.

## 3. Simulate, then broadcast testnet

Run a simulation first. Review the predicted renderer, factory, bound deployer,
owner, fee recipient, gas, and chain before adding `--broadcast`:

```sh
forge script script/DeployProtocol.s.sol:DeployProtocol \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --account backed-by-fans-testnet \
  --sender "$DEPLOYER_ADDRESS" \
  -vvvv
```

After independent review, repeat with `--broadcast --verify --verifier
blockscout --verifier-url
https://explorer.testnet.chain.robinhood.com/api/`. Record the renderer and
factory creation blocks from their receipts; the deployer and both immutable
code stores share the factory's creation block. Do not treat a successful
broadcast as verification.

## 4. Create the pristine validation child

Set `DEPLOYED_FACTORY` and `VALIDATION_TIER_OWNER` to the same account selected
with `--sender`, then simulate and broadcast the dedicated function:

```sh
forge script script/DeployProtocol.s.sol:DeployProtocol \
  --sig "deployValidationTier()" \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --account backed-by-fans-testnet \
  --sender "$VALIDATION_TIER_OWNER" \
  --broadcast -vvvv
```

Record its address and creation block. This registered child exists only to
reconstruct the full factory-created path. Do not purchase, grant, pause, edit,
transfer ownership, change caps or metadata, or otherwise mutate it before or
after capture. The checker requires it to remain pristine.

Verify exact source for the renderer, factory, bound deployer, its immutable
code stores, and validation tier. Record each exact Blockscout contract URL in
the corresponding environment variable. A contract page URL is evidence only
after Blockscout shows exact source verification.

## 5. Capture one exact block and write the manifest

Choose a confirmed block after all deployment and verification transactions.
Obtain its number and hash directly from the selected RPC, then fork that exact
block while writing the manifest:

```sh
CAPTURED_BLOCK_NUMBER="$(cast block-number --rpc-url "$ROBINHOOD_TESTNET_RPC_URL")"
OBSERVED_BLOCK_HASH="$(cast block "$CAPTURED_BLOCK_NUMBER" \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" --field hash)"
export OBSERVED_BLOCK_HASH

forge script script/CheckDeployment.s.sol:CheckDeployment \
  --sig "writeManifest()" \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" \
  --fork-block-number "$CAPTURED_BLOCK_NUMBER" -vvvv
```

Set `RENDERER_CREATION_BLOCK`, `FACTORY_CREATION_BLOCK`, and
`VALIDATION_TIER_CREATION_BLOCK` from the broadcast receipts. The writer checks
every generated field before replacing the blocked manifest:
chain and token, block context, operational identities, factory/deployer/tier
bindings, registered tier index, pristine child state, standards interfaces,
compiler settings, creation-code hashes, instance-aware runtime hashes, empty
EIP-1967 proxy slots, explicit validation-tier constructor terms, and exact
network/address verification URLs.

Review and sign the resulting diff. The manifest is evidence, not canonical
state; deployed contracts remain the source of truth.

Do not edit an accepted manifest after signing. A different candidate receives
a new immutable manifest and readiness record with an explicit supersession
link; chain state is never rolled back. See the signing and no-rollback rules in
[verification.md](verification.md).

## 6. Verify independently through a second RPC

An operator other than the deployer runs the wrapper from a clean checkout with
a second RPC URL:

```sh
./scripts/check-deployment.sh \
  deployments/robinhood-testnet.json \
  "$SECOND_ROBINHOOD_TESTNET_RPC_URL"
```

The wrapper fetches `capturedBlockNumber` through that RPC, compares its hash to
the manifest, proves each renderer, factory, deployer, code-store, and validation
tier creation block by comparing code at that block and its predecessor, then
runs `CheckDeployment` on a fork pinned to the exact captured block. A missing
RPC exits separately from a hash or contract mismatch. Any mismatch supersedes
the deployment record; never edit a manifest to make a failed deployment appear
valid.

## 7. Live USDG fork gate

The fork test is opt-in so local and CI checks remain deterministic while the
canonical testnet address is unavailable. Once the official address is known,
run:

```sh
RUN_ROBINHOOD_FORK_TESTS=true \
ROBINHOOD_USDG_ADDRESS="$ROBINHOOD_USDG_ADDRESS" \
ROBINHOOD_TESTNET_RPC_URL="$ROBINHOOD_TESTNET_RPC_URL" \
forge test --match-path "test/fork/RobinhoodUSDG.t.sol" -vvv
```

With opt-in enabled, missing RPC or token inputs fail rather than skip. The test
checks chain ID, proxy code, name, `USDG` symbol, six decimals, total supply, and
balance reads. Token pause, freeze, and incompatible-transfer behavior remain
covered by the deterministic adversarial contract suites.
