# Robinhood deployment runbook

This is the minimum public deployment workflow for Backed By Fans. It does not
authorize a deployment. Mainnet additionally requires every human gate in
[mainnet-readiness.md](mainnet-readiness.md), including explicit authorization
and provisional-brand clearance.

## Supported networks

| Network | Chain ID | Canonical USDG |
| --- | ---: | --- |
| Robinhood Chain Testnet | `46630` | `0x7E955252E15c84f5768B83c41a71F9eba181802F` |
| Robinhood Chain Mainnet | `4663` | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |

`DeployProtocol` derives USDG from `block.chainid` and rejects every other
public chain. It requires nonzero `PROTOCOL_OWNER` and `FEE_RECIPIENT`, checks
the USDG contract, and verifies all constructor bindings after deployment.
Mainnet also requires `CONFIRM_MAINNET_DEPLOYMENT=4663` exactly. Testnet must
not set that value as a substitute for review.

Recheck Robinhood's official connection and token documentation on execution
day. The testnet USDG evidence currently used by the guard is recorded in
[testnet-usdg-evidence.md](../release/testnet-usdg-evidence.md).

## 1. Prepare and dry-run

Use the pinned Foundry toolchain, a clean reviewed commit, and a Foundry
encrypted keystore. Never place a private key or mnemonic in this repository.

```sh
cd contracts
git submodule update --init --recursive
./scripts/check-clean-room.sh
forge fmt --check
forge build --sizes
forge test -vvv
cast wallet import backed-by-fans-testnet --interactive
```

Set the public operational identities and RPC URL in the shell or ignored
`contracts/.env`:

```sh
export PROTOCOL_OWNER=0x...
export FEE_RECIPIENT=0x...
export DEPLOYER_ADDRESS=0x...
export ROBINHOOD_RPC_URL=https://rpc.testnet.chain.robinhood.com
```

Review those three identities out of band, then dry-run without `--broadcast`:

```sh
forge script script/DeployProtocol.s.sol:DeployProtocol \
  --rpc-url "$ROBINHOOD_RPC_URL" \
  --account backed-by-fans-testnet \
  --sender "$DEPLOYER_ADDRESS" \
  -vvvv
```

For mainnet use a separately approved encrypted account and export
`CONFIRM_MAINNET_DEPLOYMENT=4663` only after the mainnet GO decision. The
contract script rejects a missing or different confirmation on chain `4663`.

## 2. Broadcast and verify source

Repeat the reviewed command with Foundry's broadcast and source-verification
flags. Use the correct Blockscout verifier URL for the selected chain.

```sh
forge script script/DeployProtocol.s.sol:DeployProtocol \
  --rpc-url "$ROBINHOOD_RPC_URL" \
  --account backed-by-fans-testnet \
  --sender "$DEPLOYER_ADDRESS" \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/ \
  -vvvv
```

The command must finish successfully and the renderer, factory, tier deployer,
and immutable code stores must show verified source. Confirm the factory's
`owner`, `pendingOwner`, `feeRecipient`, `paymentToken`, `renderer`, and
`protocolFeeBps` directly. A failed broadcast or invariant check is not a
deployment candidate.

## 3. Generate the web bindings

Foundry writes the durable public input at:

```text
contracts/broadcast/DeployProtocol.s.sol/<chain-id>/run-latest.json
```

Commit that chain's successful `run-latest.json`, then regenerate the web
module from the repository root:

```sh
cd web
bun install --frozen-lockfile
bun run generate
bun run generate:check
```

Wagmi CLI's Foundry plugin reads the broadcast and generates the ABI, address
map, contract configs, and React hooks in `web/src/contracts.ts`. There is no
deployment parser or address environment variable. A testnet redeployment
changes the `46630` entry; a mainnet deployment changes the `4663` entry. Both
remain available in the same application.

Do not copy an Anvil broadcast into `contracts/broadcast`. The local harness
uses chain `31337`, redirects `FOUNDRY_BROADCAST` to a temporary directory, and
injects its disposable addresses only into that test process.

## 4. Verify and exercise the product

Run the complete repository gate:

```sh
./scripts/verify-local.sh
```

Then build the intended public web artifact and exercise the deployed chain
through `/create`. For an authorized testnet deployment, complete creator tier
creation and discovery, purchase, renewal, gifting, creator management,
refunds, claims, ownership, and protocol administration with real wallets.
Record transaction and explorer links in the pilot evidence.

Wagmi and Viem own simulation, wallet submission, receipt waiting,
replacement handling, cancellation, and errors. Application code may prove an
action from the successful receipt returned by those libraries and refresh
canonical reads; it must not implement transaction polling, historical-log
recovery, nonce reasoning, or a parallel wallet journal.
