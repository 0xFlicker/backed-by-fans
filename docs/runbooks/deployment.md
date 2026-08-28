# Robinhood public deployment runbook

Status: **OPEN — deterministic tooling is verified; no Backed By Fans protocol
deployment is recorded**.

This is the minimum public deployment workflow. It does not authorize a
deployment. Mainnet additionally requires every human gate in
[mainnet-readiness.md](mainnet-readiness.md), including explicit authorization
and provisional-brand clearance.

## Fixed network configuration

| Network | Chain ID | Canonical USDG | Encrypted account |
| --- | ---: | --- | --- |
| Robinhood Chain Testnet | `46630` | `0x7E955252E15c84f5768B83c41a71F9eba181802F` | `backed-by-fans-testnet` |
| Robinhood Chain Mainnet | `4663` | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `backed-by-fans` |

The approved deployer is
`0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`. The public factory binds the
deterministic Safe `0xeAA4B38A99f766117C1D493a21012fec25f70505` as both
initial owner and fee recipient. Neither address is an environment input.

Different USDG addresses do not prevent matching protocol addresses. Foundry
first deploys two immutable factory-creation-code stores and a chain-neutral
coordinator through its canonical CREATE2 factory at
`0x4e59b44847b379578588920cA78FbF26c0B4956C`. The coordinator has no constructor
arguments or chain-specific token configuration. A later authorized transaction
tells it to create the renderer and ordinary configurable `MembershipFactory`
with that chain's canonical USDG and the fixed Safe. Child CREATE addresses
depend on the matching coordinator address and nonce, not the chain-specific
constructor arguments. The committed source, salts, compiler, and settings
therefore predict these addresses on both chains:

| Contract | Address |
| --- | --- |
| Factory creation-code store A | `0xeCA48C751f78fC33a13f181A682E6C27b739D935` |
| Factory creation-code store B | `0xF600B03145798bAf8A455491910252c95a0488E6` |
| CREATE2 coordinator | `0x04eb0710aA46246C64558BF518077952601f4c61` |
| Onchain metadata renderer | `0xce0A548907689becd13bb322f0B73Bc645c7cB2C` |
| Membership factory | `0xA4CD42B116086B9E0f192B9274626FF180063562` |
| Membership tier deployer | `0x17A88D4a4A30a0B2B55A4B6EfCC70Aa1292C8ED0` |
| Tier creation-code store A | `0x933a3dcF602e73f12620653c48C0F0046445225C` |
| Tier creation-code store B | `0xa9775722C5cA526f08F7b8DA07cc6e4282c3e6c0` |

Changing public deployment bytecode changes the predicted addresses and fails
the deployment test until the address decision is reviewed explicitly.

## 1. Verify the checkout and create the Safe

Use the pinned Foundry toolchain and a clean reviewed commit. Never put a
private key or mnemonic in this repository.

```sh
cd contracts
git submodule update --init --recursive
./scripts/check-clean-room.sh
./scripts/test-create-safe.sh
./scripts/test-deploy-protocol.sh
forge fmt --check
forge build --sizes
forge test -vvv
cast wallet address --account backed-by-fans-testnet
# 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027
```

Create and directly verify the chain's Safe first. The Safe workflow and
post-state checks are in [safe.md](safe.md).

```sh
./scripts/create-safe.sh testnet dry-run
./scripts/create-safe.sh testnet broadcast
```

The protocol deployment stops if that exact Safe is not a v1.5.0 proxy using
the pinned SafeL2 singleton, if canonical USDG fails its reviewed checks, or if
the canonical CREATE2 deployer code differs. Safe signer and threshold review
remains a separate operational gate so the account can be hardened later.

## 2. Rehearse, then broadcast testnet

The wrapper pins the RPC, chain ID, account alias, sender, CREATE2 deployer, and
Blockscout verifier. It rejects an ambient `FOUNDRY_BROADCAST` override. The
default action is a simulation without `--broadcast`:

```sh
./scripts/deploy-protocol.sh testnet dry-run
```

Review the simulation and predicted addresses above. When the testnet
deployment is explicitly authorized, broadcast the exact same workflow:

```sh
./scripts/deploy-protocol.sh testnet broadcast
```

The broadcast contains two CREATE2 factory-code-store transactions, the CREATE2
coordinator transaction, and one atomic child-deployment transaction. The durable Foundry artifact makes the
workflow resumable if those transactions or source verification do not finish
in one run. Success requires the complete onchain state and the Solidity
script's post-deployment bindings to pass. A revert, unexpected address, or
partially inspected output is not a deployment candidate; a source-verification
failure is recovered from the original artifact as described below, not by
rebroadcasting.

Mainnet uses the same wrapper only after the mainnet GO decision:

```sh
export CONFIRM_MAINNET_DEPLOYMENT=4663
./scripts/deploy-protocol.sh mainnet dry-run
./scripts/deploy-protocol.sh mainnet broadcast
```

The exact confirmation is required even for a mainnet rehearsal. Having the
command available is not authorization to run it.

## Inspect or recover the Foundry deployment

Check either public chain without loading a keystore or submitting a
transaction:

```sh
./scripts/deploy-protocol.sh testnet status
```

`status` runs the Solidity deployment validator as a read-only Foundry script.
It reports a valid absent deployment, a valid mined coordinator awaiting its
child-deployment transaction, or a complete deployment whose addresses and
bindings match.
Unexpected runtime code or partial state fails loudly. Mainnet status retains
the same `CONFIRM_MAINNET_DEPLOYMENT=4663` guard as every other mainnet action.

If every broadcast transaction was mined but Foundry's source-verification step
failed, keep the original durable artifact and let Foundry resume its own
workflow:

```sh
./scripts/deploy-protocol.sh testnet resume-verify
```

`resume-verify` requires
`broadcast/DeployProtocol.s.sol/<chain-id>/run-latest.json`. Before invoking
Foundry's native `forge script --resume --verify` path, the wrapper runs a
signer-free Solidity gate that requires both exact code stores, the exact
coordinator, renderer, factory, and all immutable bindings to be complete.
This matters because Foundry's `--resume` can submit unfinished transactions;
the wrapper therefore refuses partial deployments before entering that path.
It does not poll receipts, parse transactions, or reconstruct deployment state.
Do not rerun `broadcast` merely because verification failed. For mainnet,
retain `CONFIRM_MAINNET_DEPLOYMENT=4663` when checking status or resuming
verification.

## 3. Generate the web bindings

Foundry writes the durable public input at:

```text
contracts/broadcast/DeployProtocol.s.sol/<chain-id>/run-latest.json
```

Commit the successful artifact, then regenerate from the repository root:

```sh
cd web
bun install --frozen-lockfile
bun run generate
bun run generate:check
```

Wagmi CLI's Foundry plugin reads the coordinator and child-deployment
transactions, then generates the ABI, per-chain address map, contract configs,
and React hooks in `web/src/contracts.ts`. There is no deployment parser or
address environment variable. Testnet and mainnet entries coexist.

Do not copy Anvil output into `contracts/broadcast`. The local harness uses
chain `31337`, redirects `FOUNDRY_BROADCAST` to a temporary directory, and
injects disposable addresses only into its test process.

## 4. Verify and exercise the product

Run the complete repository gate:

```sh
./scripts/verify-local.sh
```

Then exercise the deployed chain through `/create`. For testnet, complete tier
creation and discovery, purchase, renewal, gifting, creator management,
refunds, claims, ownership, and protocol administration with real wallets.
Record transaction and explorer links as pilot evidence.

Wagmi and Viem own simulation, wallet submission, receipt waiting,
replacement handling, cancellation, and errors. Application reconciliation
begins only after those libraries return a successful receipt; never add a
parallel transaction or receipt subsystem for deployment testing.
