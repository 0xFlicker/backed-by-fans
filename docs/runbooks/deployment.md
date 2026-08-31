# Robinhood public deployment runbook

Status: **replacement protocol not deployed.** The obsolete v2 active broadcast pointer has been
removed. The v4 contracts, recovery journal, promoted broadcast record, and generated public
bindings become canonical only after an explicitly authorized deployment completes every gate in
this runbook. No testnet or mainnet deployment is implied by local or fork evidence.

This runbook does not authorize mainnet. Mainnet still requires every human gate in
[mainnet-readiness.md](mainnet-readiness.md), including an explicit GO decision and provisional-
brand clearance.

## Fixed configuration

| Network                 | Chain ID | USDG                                                    | Encrypted account        |
| ----------------------- | -------: | ------------------------------------------------------- | ------------------------ |
| Robinhood Chain Testnet |  `46630` | Deterministic `LOL Dollar`, symbol `USDG`               | `backed-by-fans-testnet` |
| Robinhood Chain Mainnet |   `4663` | Paxos USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `backed-by-fans`         |

The approved deployer is `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`. The canonical
CREATE2 deployer is `0x4e59b44847b379578588920cA78FbF26c0B4956C`. The deterministic
Safe `0xeAA4B38A99f766117C1D493a21012fec25f70505` is the initial protocol owner and
fee recipient on both chains.

The public bootstrap graph has three direct deterministic deployments, always in this order:

1. `OnchainMediaStoreFactory`
2. the initial `OnchainMetadataRenderer`
3. `RobinhoodMembershipFactory`

The membership factory has no constructor arguments. During construction it selects the payment
token from `block.chainid`: LOL Dollar on testnet and canonical Paxos USDG on mainnet. Its initcode
is therefore identical on both chains even though its deployed immutable payment-token binding is
chain-specific. The factory records the initial renderer as enabled renderer version 1. Later
renderer releases are appended to that factory registry; they do not replace the bootstrap
renderer or mutate a published tier.

## Why public deployment uses raw CREATE2 calls

Robinhood Chain accepts the reviewed 98,304-byte runtime and 196,608-byte initcode envelope. The
renderer and factory fit that envelope, but exceed Ethereum's 49,152-byte EIP-3860 initcode limit.
Foundry's in-process script broadcaster applies the Ethereum limit before a transaction reaches the
Robinhood RPC, so `forge script --broadcast` cannot be the public writer for these artifacts.

`contracts/scripts/deploy-protocol.sh` instead:

- builds with `FOUNDRY_PROFILE=robinhood` and `--ignore-eip-3860`;
- reads the exact creation and runtime bytecode from the Foundry artifacts;
- recomputes each salt, initcode hash, runtime hash, and canonical CREATE2 address;
- requires `config/operational-state/<chain-id>.json` to be tracked, byte-identical to `HEAD`,
  and to pin the reviewed deployment and current governance state;
- proves the shell-computed salts, hashes, and addresses against the same Solidity release
  constants and creation bytecode before any send;
- builds and signs each raw `salt || initcode` transaction locally with the encrypted Foundry
  account and an explicit pending nonce;
- computes and journals the signed transaction hash and nonce before publishing the raw transaction
  through the canonical CREATE2 deployer;
- validates exact runtime hashes and the permitted prefix after every receipt;
- validates the factory's renderer schema, version-1 registry record, media registry, owner,
  fee-recipient, and tier-deployer dependencies through exact public getters and runtime hashes;
- verifies all three sources on Blockscout;
- serializes every mutating testnet or mainnet action and ordinary web binding generation with one
  repo-wide lock; and
- only then generates bindings from a staged copy of all existing broadcasts and writes the
  Foundry-compatible `run-latest.json` release pointer last.

The wrapper rejects `ETH_PASSWORD`, private-key, and mnemonic environment inputs. Do not pass
`--password`, `--password-file`, `--private-key`, or a plaintext secret by any other route. A
testnet broadcast prompts for the encrypted `backed-by-fans-testnet` keystore password; no password
is needed for status, fork preflight, or verification recovery.

## Recovery contract

Every invocation prints the exact recovery table generated from the current compiler artifacts:

| Order | Component           | Allowed predecessor                    | Required validation                                 |
| ----: | ------------------- | -------------------------------------- | --------------------------------------------------- |
|     0 | Media store factory | Empty candidate                        | exact initcode-derived address and runtime hash     |
|     1 | Initial renderer    | Exact media store factory only         | exact initcode-derived address and runtime hash     |
|     2 | Membership factory  | Exact media store factory and renderer | exact runtime plus all immutable/dependency getters |

Only four chain states are accepted: empty, media-only, media-plus-renderer, and complete. A
renderer without the expected media factory, a factory without both predecessors, wrong code at a
predicted address, or a dependency mismatch fails before another transaction can be submitted.

Before the first public send, the wrapper writes
`contracts/deployments/protocol/<chain-id>/candidate.json`. It contains no RPC URL or secret. It
records the salts, initcode hashes, runtime hashes, expected addresses, allowed predecessor states,
submitted transaction hashes, receipts, observed code hashes, and source-verification results.
Each signed transaction hash and nonce is persisted before `cast publish`, so a process loss after
RPC acceptance cannot cause a second transaction to be sent at the next nonce. Rerun the same
`broadcast` command to reconcile that exact hash and resume a valid prefix. If the source-derived
fingerprint differs from the existing journal, stop and preserve the journal; the wrapper will not
reinterpret it as a different release.

If a journaled transaction is absent from the RPC or has a confirmed revert and its recorded nonce
proves that it is dropped or consumed, do not edit the journal. Authorize that exact hash:

```sh
RECOVER_DROPPED_TRANSACTION_HASH=0x... \
  ./scripts/deploy-protocol.sh testnet recover-dropped
```

The command requires the encrypted operator account, records receipt/absence plus latest and
pending nonce evidence, and returns only that component to `pending`. It does not resubmit. Run
`broadcast` separately for a fresh password-authorized transaction. A still-known transaction,
ambiguous nonce state, successful receipt without exact runtime, or mismatched hash is a hard stop.

The journal is recovery evidence, not an application deployment source. A partial journal never
creates `run-latest.json` and never enables generated public addresses.

## 1. Verify the checkout

Keep RPC URLs in `contracts/.env`; the wrappers load that file and prefer its configured endpoints.
Never put a password, private key, or mnemonic there. The deployer remains in Foundry's encrypted
keystore.

```sh
cd contracts
forge --version
./scripts/check-clean-room.sh
./scripts/test-create-safe.sh
./scripts/test-deploy-protocol.sh
./scripts/test-testnet-usdg.sh
forge fmt --check
FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860
FOUNDRY_PROFILE=robinhood forge test \
  --code-size-limit 1000000 \
  --gas-limit 1000000000 \
  -vvv
```

The Safe and testnet USDG must already exist and pass their respective validators. `status` requires
a clean checkout and committed operational record. Before deployment it checks current artifacts
against that record. After promotion it loads immutable addresses and runtime hashes from
`run-latest.json`, cross-checks them against the current reviewed record, and validates those
promoted addresses onchain. Later source drift may be reported, but cannot redirect monitoring to
a new empty CREATE2 prefix. `status` does not load the signing account:

```sh
./scripts/deploy-protocol.sh testnet status
```

Review the printed addresses and hashes as the candidate's exact recovery table. Do not copy an old
address table forward after any source, compiler, optimizer, or metadata change.

## 2. Deploy testnet USDG

The protocol candidate depends on the deterministic test token already documented by the USDG
wrapper:

```sh
./scripts/deploy-testnet-usdg.sh dry-run
./scripts/deploy-testnet-usdg.sh broadcast
./scripts/deploy-testnet-usdg.sh status
```

The contract is named `LOL Dollar`, uses symbol `USDG` and six decimals, and can be minted without
a supply cap only by the approved deployer. It cannot deploy on mainnet.

Token deployment and minting use different scripts. The successful token deployment record remains
`broadcast/TestnetUSDG.s.sol/46630/run-latest.json`; mint records must never replace it.

## 3. Prove the exact raw deployment on an Anvil fork

Dry-run starts Anvil from the configured network RPC with the target chain ID itself, not `31337`.
For testnet that means chain `46630`. It configures Robinhood's 98,304-byte code-size and 100M gas
envelope, impersonates and funds the approved deployer only inside the fork, then sends the exact
three raw CREATE2 calls. The exact getter and runtime-hash checks run before and after the sequence.

```sh
./scripts/deploy-protocol.sh testnet dry-run
```

This writes no public transaction, public recovery journal, active broadcast pointer, or generated
address. A public `broadcast` repeats this fork preflight before it loads the encrypted account.

If the default random high port is unavailable, choose one explicitly:

```sh
BBF_ANVIL_PORT=18545 ./scripts/deploy-protocol.sh testnet dry-run
```

## 4. Deploy the protocol

Only after explicit testnet authorization:

```sh
./scripts/deploy-protocol.sh testnet broadcast
```

The sequence is media factory, renderer, then membership factory. Each `cast mktx --account` call
uses the encrypted Foundry keystore and prompts in the terminal. The wrapper keeps the signed raw
transaction only in process memory, journals its public hash and nonce before `cast publish`, and
never reads, stores, or forwards the password.

If a transaction fails or the terminal closes, keep
`deployments/protocol/46630/candidate.json` and rerun the same command. Valid predecessor code is
skipped; missing successors are submitted. If all contracts mined but Blockscout verification or
binding generation failed, no signer is required:

```sh
./scripts/deploy-protocol.sh testnet resume-verify
```

`resume-verify` requires a complete exact deployment, retries source verification, promotes the
broadcast record, and regenerates bindings. It cannot deploy missing code.

Mainnet uses the same artifact graph only after an explicit GO decision:

```sh
CONFIRM_MAINNET_DEPLOYMENT=4663 ./scripts/deploy-protocol.sh mainnet dry-run
CONFIRM_MAINNET_DEPLOYMENT=4663 ./scripts/deploy-protocol.sh mainnet broadcast
```

The confirmation must be present in the invoking process. The wrappers ignore confirmation values
stored in `contracts/.env`, so a past decision cannot become reusable authorization. There is no
mainnet LOL Dollar deployment.

## 5. Promote records and web bindings

Successful source verification produces both a timestamped record and the active pointer:

- `contracts/broadcast/DeployDirectProtocol.s.sol/<chain-id>/run-<timestamp>.json`
- `contracts/broadcast/DeployDirectProtocol.s.sol/<chain-id>/run-latest.json`

The records describe the three canonical-deployer calls and expose each created contract through
`additionalContracts`, the shape consumed by Wagmi CLI's Foundry plugin. The active record also
embeds the deterministic deployment-plan fingerprint and points to the recovery journal.

`web/wagmi.config.ts` includes Foundry broadcast addresses only when a promoted protocol
`run-latest.json` exists for chain `46630` or `4663`. Before promotion, `bun run generate` is
intentionally ABI-only. The deployment wrapper runs generation only after the complete runtime,
dependency, and source-verification gates pass. The staged Foundry project retains USDG and
protocol records for every chain, so one promotion cannot erase another network's addresses. The
current chain's active pointer is installed only after staged generation and binding installation
succeed. Ordinary `bun run generate` takes the same repo-wide lock, preventing a concurrent
generator from interleaving old bindings with a newly promoted pointer. Recovery also rejects
changes to another chain's broadcast inputs rather than copying them into the staged release.

After an authorized deployment, review and commit together:

- the recovery journal;
- the timestamped and active broadcast records; and
- the regenerated `web/src/contracts.ts`.

Then prove the committed output is reproducible:

```sh
cd web
bun run generate:check
```

If an obsolete active pointer exists, archive its timestamped record and remove `run-latest.json`
before promoting a new source fingerprint. The wrapper refuses to overwrite a conflicting active
deployment. Testnet and mainnet records may coexist because their chain directories are distinct.

## 6. Exercise the product

Run `./scripts/verify-local.sh`, then use the web app on the authorized public candidate through
`/create`. Complete media storage, tier creation and discovery, purchase, renewal, gifting, creator
management, refunds, claims, ownership, and protocol administration with real wallets.

Wagmi and Viem own application wallet simulation, submission, receipts, replacements,
cancellation, and errors. Release tooling does not create a parallel application transaction stack.

## 7. Append a renderer release

Renderer versions are append-only records inside `MembershipFactory`. A registered renderer is
disabled by default. Registration records its address and exact runtime code hash after confirming
the fixed `BackedByFans.MembershipRenderer.v1` schema and a non-empty engine manifest. Enabling it
is a separate Safe-governed action.

Before proposing either Safe transaction:

1. deploy a direct, immutable renderer contract; do not register a proxy or another implementation
   whose behavior can change behind a stable proxy runtime hash;
2. verify source, runtime code hash, `rendererSchema`, `rendererName`, `engineCount`, every
   `engineName`, configuration validation, totality, gas and response-size ceilings;
3. visually inspect every engine with generated-only and maximum onchain JPEG/PNG media, active and
   afterglow states, and representative token IDs;
4. propose `registerRenderer(renderer)` through the protocol Safe and verify the returned registry
   version, recorded address, code hash and disabled state;
5. append that exact record and disabled state to the chain's committed operational record; then
6. propose `setRendererEnabled(version, true)` only after the product has shipped matching Studio
   support, update the committed record to enabled, and rerun `status`.

Disabling a version calls `setRendererEnabled(version, false)`. It blocks only new tier creation.
Every published tier keeps its immutable renderer version, address and runtime code hash and will
continue rendering as long as that exact code remains present. Never present "latest renderer" as
the identity of an existing tier, and never reuse a version number.
