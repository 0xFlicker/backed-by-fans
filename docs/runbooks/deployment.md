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

## Current testnet status

Paxos's official USDG testnet documentation publishes the Robinhood Testnet
proxy as `0x7E955252E15c84f5768B83c41a71F9eba181802F`. That exact address is pinned
in `RobinhoodDeploymentGuard`; arbitrary tokens remain rejected even when their
name, symbol, and decimals match. The source and read-only live-chain observation
are recorded in [testnet USDG evidence](../release/testnet-usdg-evidence.md).

[`contracts/deployments/robinhood-testnet.json`](../../contracts/deployments/robinhood-testnet.json)
remains a schema-valid blocked record because no public protocol deployment has
been executed. Operational identities, a funded encrypted deployer keystore,
source verification, and captured-block evidence are still unavailable. Replace
the blocked record only after completing every applicable step below. The
official public endpoints are:

- Testnet RPC: `https://rpc.testnet.chain.robinhood.com`
- Testnet explorer: `https://explorer.testnet.chain.robinhood.com`
- Testnet Blockscout verifier API: `https://explorer.testnet.chain.robinhood.com/api/`
- Mainnet RPC: `https://rpc.mainnet.chain.robinhood.com`
- Mainnet explorer: `https://robinhoodchain.blockscout.com`

Recheck the official [connection details](https://docs.robinhood.com/chain/connecting/),
[token contracts](https://docs.robinhood.com/chain/contracts/),
[Paxos testnet USDG deployment](https://docs.paxos.com/guides/stablecoin/usdg/testnet),
and [deployment guidance](https://docs.robinhood.com/chain/deploy-smart-contracts/)
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
USDG proxy, protocol owner, and fixed fee recipient. Confirm all four values out
of band. `DeployProtocol` enforces the exact pinned proxy as well as token code
and metadata. On testnet it also enforces the reviewed proxy runtime hash,
EIP-1967 implementation address/runtime hash, and `paused == false`; an upgrade
requires a new reviewed source pin before deployment can proceed. Do not infer
the owner, fee recipient, validation-tier owner, or deployer alias from a local wallet list; those are explicit operational choices.
The reusable mainnet guard
accepts only the official mainnet USDG proxy
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

## 4. Create the validation child

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

Record the factory deployment transaction hash, validation-tier creation
transaction hash, validation-tier address, and their exact creation blocks. This
registered child reconstructs the full factory-created path. Public purchases,
gifts, and other accounting activity do not invalidate it: deployment evidence
is based on its exact registry position, constructor input, bytecode, immutable
bindings, and transaction provenance, not mutable balances or membership state.
Before capture, do not change constructor-recorded metadata, caps, or ownership:
the transaction-provenance check must reproduce the original `createTier` input.
Pause state and changes after capture are separate operational facts and must be
recorded normally.

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

Set `RENDERER_CREATION_BLOCK`, `FACTORY_CREATION_BLOCK`,
`VALIDATION_TIER_CREATION_BLOCK`, `VALIDATION_TIER_INDEX`,
`FACTORY_DEPLOYMENT_TRANSACTION_HASH`, and
`VALIDATION_TIER_CREATION_TRANSACTION_HASH` from the broadcast receipts and
the validation tier's `TierCreated` event. The writer checks every generated
field before replacing the blocked manifest:
chain and token, block context, operational identities, factory/deployer/tier
bindings, exact registered tier index, standards interfaces,
compiler settings, creation-code hashes, instance-aware runtime hashes, empty
EIP-1967 proxy slots, explicit validation-tier constructor terms, expected
factory initcode and full `createTier` call hashes, and exact network/address
verification URLs.

`writeManifest()` and the Solidity `check` entry point attest the captured state
and local artifacts. They do not fetch transaction receipts. Only the wrapper in
step 6 is the accepted end-to-end deployment check because it independently
fetches and binds both creation transactions before running the Solidity checks.

Review and sign the resulting diff. The manifest is evidence, not canonical
state; deployed contracts remain the source of truth.

For a ready production web build, copy `NEXT_PUBLIC_FACTORY_ADDRESS`, the exact
chain ID, the factory, renderer, deployer, and USDG proxy runtime hashes, plus
the USDG implementation address and runtime hash only from the independently
checked manifest and USDG observation into `observedDeployment.webPublicConfig`
in the readiness record. The readiness checker binds those public values to the
same observed addresses and runtime hashes. The browser verifies the EIP-1967
implementation slot at the same captured block before exposing writes. Do not
derive commitments from an explorer label or unreviewed environment. Individual membership tiers are authenticated
through the exact factory registry and immutable bindings, not one global tier
runtime hash because tier immutables make instance bytecode differ.

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
the manifest, fetches both manifest-pinned transactions and successful receipts,
and verifies the factory creation destination/address/input/block plus the
validation-tier caller/factory destination/full call input/block. It also
requires that exact receipt's single factory `TierCreated` log to match the
manifest's validation tier, owner, and index. It then proves
each renderer, factory, deployer, code-store, and validation tier creation block
by comparing code at that block and its predecessor, before running
`CheckDeployment` on a fork pinned to the exact captured block. A missing
RPC exits separately from a hash or contract mismatch. Any mismatch supersedes
the deployment record; never edit a manifest to make a failed deployment appear
valid.

## 7. Live USDG fork gate

The fork test is opt-in so local and CI checks remain deterministic. It always
uses the source-pinned official testnet proxy; supply only the RPC URL:

```sh
./scripts/check-testnet-usdg.sh "$ROBINHOOD_TESTNET_RPC_URL"
```

Run this wrapper from the repository root. A missing RPC input or mismatched
recorded evidence block hash fails before Foundry starts. The official public RPC
is not assumed to retain archival state: the wrapper captures a fresh block and
hash, pins the fork to that exact block, and verifies the proxy, EIP-1967
implementation, both runtime hashes, metadata, supply read, pause state, and full
protocol instantiation. Implementation-only drift or a pause therefore fails
before broadcast. Token freeze and incompatible-transfer behavior remain covered
by the deterministic adversarial contract suites.
