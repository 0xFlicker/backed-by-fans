# Robinhood public deployment runbook

Status: **replacement testnet deployment promoted.** The active deployment adds six external
payment tokens and owner-mutable tier renderers. Mainnet remains inspection-only and is not
authorized by this runbook.

Fast-follow status: the promoted factory predates expired-membership synchronization and reward
suspension. It is not the mainnet candidate. A new replacement factory, pilot tiers, canonical
website cutover, and public pilot require separate deployment approval after this change is
reviewed; this worktree does not authorize or record that deployment.

## Release boundary

| Network                 | Chain ID | Initial payment tokens                     | Encrypted account        |
| ----------------------- | -------: | ------------------------------------------ | ------------------------ |
| Robinhood Chain Testnet |  `46630` | external USDG, AMD, NFLX, PLTR, AMZN, TSLA | `backed-by-fans-testnet` |
| Robinhood Chain Mainnet |   `4663` | canonical Paxos USDG only                  | `backed-by-fans`         |

The exact token addresses, metadata, decimals, runtime hashes, and observed ERC-8056 state are in
`contracts/config/payment-tokens/<chain-id>.json`. Testnet uses:

| Symbol | Address                                      |
| ------ | -------------------------------------------- |
| USDG   | `0x7E955252E15c84f5768B83c41a71F9eba181802F` |
| AMD    | `0x71178BAc73cBeb415514eB542a8995b82669778d` |
| NFLX   | `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` |
| PLTR   | `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` |
| AMZN   | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` |
| TSLA   | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` |

There is no Backed By Fans test USDG deployment or mint path. Mainnet's only configured token is
Paxos USDG at `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`; revalidate it before any future
mainnet decision.

The approved deployer is `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`. The protocol owner and
fee recipient are the Safe at `0xeAA4B38A99f766117C1D493a21012fec25f70505`. The canonical CREATE2
deployer is `0x4e59b44847b379578588920cA78FbF26c0B4956C`.

## Deployment graph

The wrapper evaluates four ordered protocol components:

1. `OnchainMediaStoreFactory`
2. `OnchainMetadataRenderer`
3. `RendererPreviewHarness`
4. `MembershipFactory`

The promoted candidate deployed the media-store factory, renderer, and membership factory. It
validated and reused the already-correct preview harness at
`0x35ACe5985a9088699197cd1931fc3083dee229B6`, so the public broadcast contained three transactions,
not a redundant fourth deployment.

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
payloads, rehearses the candidate graph on a chain-`46630` fork, and only then submits the missing
raw transactions through the canonical deployer.

The wrapper also requires the operational state to be tracked and byte-identical to `HEAD`, checks
the manifest and all constructor dependencies, journals each signed transaction hash and nonce
before publication, verifies exact runtime hashes and sources, and promotes Wagmi inputs only after
the complete graph passes. It rejects private-key, mnemonic, password-file, and password environment
inputs. Broadcast prompts in the terminal for the encrypted Foundry account password.

## 1. Prepare a replacement deployment plan

When protocol bytecode changes, generate the replacement component addresses and runtime hashes
before running the strict release gates:

```sh
./scripts/deploy-protocol.sh testnet prepare
git diff -- contracts/config/operational-state/46630.json
```

`prepare` reads the committed operational state, preserves its payment tokens, Safe, owner, pending
owner, and fee recipient, and atomically replaces only the four deterministic component records. It
performs build, Solidity-plan parity, public-chain identity, dependency, and runtime checks without
starting Anvil, loading a signing account, writing a recovery journal, generating web bindings, or
submitting a transaction. Review and commit the generated manifest with the release source before
continuing. Repeating `prepare` with the same plan is safe; unrelated uncommitted manifest changes
are rejected.

## 2. Validate a clean reviewed checkout

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

## 3. Rehearse the exact testnet deployment

```sh
./scripts/deploy-protocol.sh testnet dry-run
```

The dry-run forks the configured Robinhood testnet RPC at chain ID `46630`, configures the reviewed
code-size and gas envelope, impersonates the approved deployer inside Anvil, and reconciles the exact
candidate graph. It must confirm:

- the exact six manifest tokens, in order, are listed and enabled;
- all four runtimes and the tier deployer have code;
- factory owner, pending owner, fee recipient, media dependency, renderer schema, and tier-deployer
  binding match the reviewed operational state; and
- every payload remains below the Robinhood initcode/runtime and Nitro transaction-data limits.

This creates no public transaction, public recovery journal, active broadcast pointer, or generated
address. Set `BBF_ANVIL_PORT` only if the random local port is unavailable.

## 4. Operator-approved testnet broadcast

Only after explicit operator approval:

```sh
./scripts/deploy-protocol.sh testnet broadcast
```

This sends only the missing public testnet transactions from the approved encrypted deployer. The
terminal asks for its keystore password. The resulting factory is owned by the Safe. No chain-`4663`
transaction is sent and this command does not authorize mainnet.

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

## 5. Promote records and Wagmi bindings

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

## 6. Operate accepted payment tokens

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

## 7. Stage and promote the web app

The promoted testnet deployment is:

| Component           | Active address                               |
| ------------------- | -------------------------------------------- |
| Membership factory  | `0x768ef9DdF0515e5EF8741dbEc06627c2edcA527C` |
| Media-store factory | `0xF62F64da02bF67dfF4223aa5264270254823Cf65` |
| Default renderer    | `0x2E73800F227c59fe7A4Be673D246afdcdF88878A` |
| Preview harness     | `0x35ACe5985a9088699197cd1931fc3083dee229B6` |
| Renderer registry   | `0x4d421062e1Af4AB12e4f65ba475F169f633d745A` |

The Vercel project must use `web` as its Root Directory. Its reviewed production environment
contract is:

- `NEXT_PUBLIC_SITE_URL=https://backedbyfans.xyz`;
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` set to the public WalletConnect project ID;
- `ROBINHOOD_TESTNET_RPC_URL` set to the production server RPC for chain `46630`;
- `ROBINHOOD_MAINNET_RPC_URL` set only if inspection-only mainnet reads are intentionally enabled;
- no production contract-address environment variables: `web/src/contracts.ts` is the generated
  active source. The `NEXT_PUBLIC_ANVIL_*` values are local evidence inputs and do not belong in
  Vercel;
- no secret or paid RPC credential in a `NEXT_PUBLIC_` value. Apply provider-side project/domain
  restrictions wherever the provider supports them.

Before an authenticated deployment, record the reviewed Vercel project, source commit, environment
scope, and staging-only target. Do not assign `backedbyfans.xyz` or another production domain to the
staged artifact. Authenticated Vercel staging and canonical-domain promotion each require their own
explicit operator approval.

After the reviewed source commit and Vercel settings have been approved, stage a production build
from the linked repository root without assigning any domain:

```sh
vercel --prod --skip-domain
```

Record the resulting deployment URL and ID, source commit, active factory, and prior known-good
production deployment. Test that exact URL. A normal preview-to-production promotion rebuilds with
the production environment and therefore does not satisfy the exact-artifact gate.

### Current testnet beta web artifact

The operator authorized the replacement production-environment build and canonical routing update
on 2026-09-02. The reviewed target is:

| Field | Value |
| --- | --- |
| Vercel team/project | `flicks-projects/backed-by-fans` |
| Vercel project ID | `prj_dmeAPJm04v3JmKWmTROhdxnrBdMa` |
| Source branch | `codex/testnet-beta-release` |
| Source commit | `f7a90aef2f735639c7e7f5ef224b228c5f65d645` |
| Staged deployment | `https://backed-by-fans-pjawlazsb-flicks-projects.vercel.app` |
| Deployment ID | `dpl_CEqhSfBmuMn3tK79Qwg54MwHYgsV` |
| Active factory | `0x6C06126E121667c6f06Bd426Cde706EDde862fd9` |
| Prior known-good production deployment | `dpl_CzysrFBvrFG9DLygVv9EixCt7D2A` |

The Vercel project is connected to `0xFlicker/backed-by-fans`, uses `main` as the repository's normal
production branch, and sets the Git Root Directory to `web`. The project framework preset is
`nextjs`. Authenticated checks of the staged artifact returned HTTP 200 for `/`, `/create`,
`/account`, `/render`, `/skill`, and `/llms.txt`; its JavaScript bundles contained the replacement
factory address and not the superseded factory address. This is deployment smoke evidence only; the
browser and live testnet transaction matrix remains open.

The operator explicitly approved the `backedbyfans.xyz` domain assignment on 2026-09-02. Cloudflare
keeps authoritative DNS and supplies DNS-only Vercel verification and apex routing records. Vercel
issued the managed certificate. The canonical domain now points directly to replacement deployment
`dpl_CEqhSfBmuMn3tK79Qwg54MwHYgsV` without rebuilding. Public HTTPS checks returned HTTP 200 for
`/`, `/create`, `/account`, `/render`, `/skill`, and `/llms.txt`; the live JavaScript bundles contain
factory `0x6C06126E121667c6f06Bd426Cde706EDde862fd9`. These checks do not complete the named
canonical-browser or live testnet transaction matrix.

For a future candidate, only after the staged artifact and domain assignment receive separate
operator approval, promote that same production build without rebuilding:

```sh
vercel promote https://STAGED-PRODUCTION-DEPLOYMENT.vercel.app
```

Confirm that the promoted deployment ID is the staged deployment ID before running canonical-domain
tests. Routing rollback changes only the web deployment; it cannot roll back onchain state.

## Mainnet boundary

This runbook does not authorize mainnet. Future mainnet dry-run or broadcast additionally requires
`CONFIRM_MAINNET_DEPLOYMENT=4663`, the USDG-only manifest, and every gate in
`docs/runbooks/mainnet-readiness.md`. Stock Tokens are testnet-only for this release.
