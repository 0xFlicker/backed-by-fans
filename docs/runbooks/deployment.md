# Robinhood public deployment runbook

Status: **replacement testnet deployment not yet broadcast.** The reviewed candidate adds six
external payment tokens and owner-mutable tier renderers. Mainnet remains inspection-only and is not
authorized by this runbook.

## Release boundary

| Network | Chain ID | Initial payment tokens | Encrypted account |
| --- | ---: | --- | --- |
| Robinhood Chain Testnet | `46630` | external USDG, AMD, NFLX, PLTR, AMZN, TSLA | `backed-by-fans-testnet` |
| Robinhood Chain Mainnet | `4663` | canonical Paxos USDG only | `backed-by-fans` |

The exact token addresses, metadata, decimals, runtime hashes, and observed ERC-8056 state are in
`contracts/config/payment-tokens/<chain-id>.json`. Testnet uses:

| Symbol | Address |
| --- | --- |
| USDG | `0x7E955252E15c84f5768B83c41a71F9eba181802F` |
| AMD | `0x71178BAc73cBeb415514eB542a8995b82669778d` |
| NFLX | `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` |
| PLTR | `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` |
| AMZN | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` |
| TSLA | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` |

There is no Backed By Fans test USDG deployment or mint path. Mainnet's only configured token is
Paxos USDG at `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; revalidate it before any future
mainnet decision.

The approved deployer is `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`. The protocol owner and
fee recipient are the Safe at `0xeAA4B38A99f766117C1D493a21012fec25f70505`. The canonical CREATE2
deployer is `0x4e59b44847b379578588920cA78FbF26c0B4956C`.

## Deployment graph

The wrapper deploys exactly four contracts, in order:

1. `OnchainMediaStoreFactory`
2. `OnchainMetadataRenderer`
3. `RendererPreviewHarness`
4. `MembershipFactory`

The factory constructor receives the ordered initial token list, media-store factory, protocol
owner, and fee recipient. The default renderer and preview harness are separate direct contracts.
Every initial token must be listed and enabled after deployment.

Published tiers store immutable payment-token and raw-price terms. Their current owner may change
the renderer to another compatible direct contract. That presentation change preserves the tier's
art/media inputs, economics, membership time, ownership, liabilities, and accounting. There is no
renderer registry gate or operator renderer UI.

## Why the guarded raw CREATE2 wrapper is required

Robinhood admits larger code and initcode than Ethereum's default EIP-3860 envelope, while its Nitro
sequencer limits transaction data to 95,000 bytes. Foundry's in-process broadcaster rejects the
reviewed renderer before the Robinhood RPC can evaluate it. `contracts/scripts/deploy-protocol.sh`
therefore builds with the Robinhood profile, derives exact CREATE2 payloads, rejects oversize
payloads, rehearses the exact four-call sequence on a chain-`46630` fork, and only then submits raw
transactions through the canonical deployer.

The wrapper also requires the operational state to be tracked and byte-identical to `HEAD`, checks
the manifest and all constructor dependencies, journals each signed transaction hash and nonce
before publication, verifies exact runtime hashes and sources, and promotes Wagmi inputs only after
the complete graph passes. It rejects private-key, mnemonic, password-file, and password environment
inputs. Broadcast prompts in the terminal for the encrypted Foundry account password.

## 1. Validate a clean reviewed checkout

Deployment dry-run and broadcast require committed reviewed source. From `contracts/`:

```sh
./scripts/check-clean-room.sh
./scripts/test-create-safe.sh
./scripts/test-deploy-protocol.sh
./scripts/test-manage-payment-tokens.sh
forge fmt --check src script test
FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860
FOUNDRY_PROFILE=robinhood forge test \
  --code-size-limit 1000000 \
  --gas-limit 1000000000 \
  -vvv
./scripts/deploy-protocol.sh testnet status
```

Keep RPC URLs in `contracts/.env`. Never put a password, private key, or mnemonic there. `status`
does not load the signing account and performs no write.

## 2. Rehearse the exact testnet deployment

```sh
./scripts/deploy-protocol.sh testnet dry-run
```

The dry-run forks the configured Robinhood testnet RPC at chain ID `46630`, configures the reviewed
code-size and gas envelope, impersonates the approved deployer inside Anvil, and sends the exact four
raw CREATE2 calls. It must confirm:

- the exact six manifest tokens, in order, are listed and enabled;
- all four runtimes and the tier deployer have code;
- factory owner, pending owner, fee recipient, media dependency, renderer schema, and tier-deployer
  binding match the reviewed operational state; and
- every payload remains below the Robinhood initcode/runtime and Nitro transaction-data limits.

This creates no public transaction, public recovery journal, active broadcast pointer, or generated
address. Set `BBF_ANVIL_PORT` only if the random local port is unavailable.

## 3. Operator-approved testnet broadcast

Only after explicit operator approval:

```sh
./scripts/deploy-protocol.sh testnet broadcast
```

This sends four public testnet transactions from the approved encrypted deployer. The terminal asks
for its keystore password. The resulting factory is owned by the Safe. No chain-`4663` transaction
is sent and this command does not authorize mainnet.

If a process stops after submission, preserve
`contracts/deployments/protocol/46630/candidate.json` and rerun the same broadcast command. The
wrapper reconciles the journaled transaction and valid predecessor code before submitting a missing
successor. Do not delete or edit the journal.

If all contracts mined but source verification or binding generation failed, use:

```sh
./scripts/deploy-protocol.sh testnet resume-verify
```

If one journaled transaction is conclusively absent or reverted and its nonce evidence proves that
recovery is safe, authorize only that recorded hash:

```sh
RECOVER_DROPPED_TRANSACTION_HASH=0x... \
  ./scripts/deploy-protocol.sh testnet recover-dropped
```

That command does not resubmit. Run `broadcast` separately for a fresh password-authorized send.

## 4. Promote records and Wagmi bindings

A successful broadcast and source verification produce:

- `contracts/deployments/protocol/46630/candidate.json`;
- a timestamped Foundry-compatible broadcast record;
- `contracts/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json`; and
- regenerated `web/src/contracts.ts` addresses and ABIs.

Review and commit those artifacts together, then prove generation is reproducible:

```sh
cd ../web
bun run generate:check
```

The deployment wrapper stages generation and installs the active pointer last. A partial deployment
never becomes a Wagmi address source.

## 5. Operate accepted payment tokens

Accepted-token administration is Safe/deployer CLI only. There is no operator page in the web app.
Read operations need no signer:

```sh
./scripts/manage-payment-tokens.sh testnet list
./scripts/manage-payment-tokens.sh testnet inspect 0xTOKEN
```

Writes print reviewed Safe transaction JSON by default:

```sh
./scripts/manage-payment-tokens.sh testnet enable 0xTOKEN safe
./scripts/manage-payment-tokens.sh testnet disable 0xTOKEN safe
./scripts/manage-payment-tokens.sh testnet withdraw 0xTOKEN safe
```

Direct encrypted-account submission is allowed only if that account is the factory's current owner
for enable/disable, or the current fee recipient for withdrawal. The invoking process must also
supply the exact chain confirmation:

```sh
CONFIRM_PAYMENT_TOKEN_WRITE=46630 \
  ./scripts/manage-payment-tokens.sh testnet enable 0xTOKEN submit

CONFIRM_PAYMENT_TOKEN_WRITE=46630 \
  ./scripts/manage-payment-tokens.sh testnet withdraw 0xTOKEN submit
```

Enabling a previously unlisted token first checks code, ERC-20 metadata, and coherent ERC-8056 core
and pending interfaces. Disabling affects only new tier publication. Existing tiers remain usable,
and protocol fees are inspected and withdrawn independently by token.

## 6. Stage and promote the web app

After the verified protocol promotion, build and test the web app with the generated active factory,
chain `46630`, `NEXT_PUBLIC_SITE_URL=https://backedbyfans.xyz`, a domain-restricted production RPC,
and the production WalletConnect configuration. Authenticated Vercel staging and canonical-domain
promotion each require their own explicit operator approval. Stage once, test that exact artifact,
and promote it without rebuilding. Routing rollback changes only the web deployment; it cannot roll
back onchain state.

## Mainnet boundary

This runbook does not authorize mainnet. Future mainnet dry-run or broadcast additionally requires
`CONFIRM_MAINNET_DEPLOYMENT=4663`, the USDG-only manifest, and every gate in
`docs/runbooks/mainnet-readiness.md`. Stock Tokens are testnet-only for this release.
