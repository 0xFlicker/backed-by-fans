# Robinhood public deployment runbook

Status: **TESTNET DEPLOYED — the direct CREATE2 deployment and generated Wagmi
bindings are recorded. Independent verification and the live pilot remain
open; mainnet remains unauthorized.**

This is the minimum public workflow. It does not authorize mainnet deployment.
Mainnet still requires every human gate in
[mainnet-readiness.md](mainnet-readiness.md), including explicit authorization
and provisional-brand clearance.

## Fixed configuration

| Network                 | Chain ID | USDG                                                    | Encrypted account        |
| ----------------------- | -------: | ------------------------------------------------------- | ------------------------ |
| Robinhood Chain Testnet |  `46630` | Deterministic `LOL Dollar` test token, symbol `USDG`    | `backed-by-fans-testnet` |
| Robinhood Chain Mainnet |   `4663` | Paxos USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `backed-by-fans`         |

The approved deployer is
`0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`. The deterministic Safe
`0xeAA4B38A99f766117C1D493a21012fec25f70505` is the initial protocol owner and
fee recipient on both chains.

The renderer and `RobinhoodMembershipFactory` deploy directly through Foundry's
canonical CREATE2 deployer. The factory has no constructor arguments. During
construction it selects the payment token from `block.chainid`: LOL Dollar on
testnet and canonical Paxos USDG on mainnet. Its initcode is therefore identical
on both chains even though its deployed immutable payment-token binding differs.
There is no coordinator or public factory-code-store deployment.

Current direct deployment predictions:

| Contract                  | Address                                      |
| ------------------------- | -------------------------------------------- |
| Testnet USDG              | `0xAB97dbB8f4ae0B4a3cc0D6963D75334B1c40da09` |
| Onchain metadata renderer | `0x2cA28c2996E264a24b59A76b3D58F164112AebD7` |
| Membership factory        | `0xC902F211a6346325B0b50e2B7942C952dCaa5038` |

The contract tests pin and recompute these addresses from the compiler output,
salts, and canonical CREATE2 deployer. A source change that changes initcode
therefore fails before broadcast until the new addresses are explicitly
reviewed and updated.

## 1. Verify the checkout

Keep RPC URLs in `contracts/.env`; the wrappers load that file and prefer its
paid endpoints. Never put a private key or mnemonic there. The deployer remains
in Foundry's encrypted keystore.

```sh
cd contracts
forge --version
./scripts/check-clean-room.sh
./scripts/test-create-safe.sh
./scripts/test-deploy-protocol.sh
./scripts/test-testnet-usdg.sh
forge fmt --check
forge build --sizes
forge test -vvv
cast wallet address --account backed-by-fans-testnet
# 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027
```

The Safe must already exist and pass the [Safe runbook](safe.md). A dry run needs
no keystore password; only a broadcast loads the encrypted account.

## 2. Deploy testnet USDG

```sh
./scripts/deploy-testnet-usdg.sh dry-run
./scripts/deploy-testnet-usdg.sh broadcast
./scripts/deploy-testnet-usdg.sh status
```

The contract is named `LOL Dollar`, uses symbol `USDG` and six decimals, and can
be minted without a supply cap only by the approved deployer. It cannot deploy
on mainnet.

Mint a human-readable amount to any test wallet:

```sh
./scripts/mint-testnet-usdg.sh 0xRecipient 100 dry-run
./scripts/mint-testnet-usdg.sh 0xRecipient 100 broadcast
```

Token deployment and minting intentionally use different Foundry scripts.
`broadcast/TestnetUSDG.s.sol/46630/run-latest.json` must remain the successful
`CREATE2` deployment record consumed by Wagmi. Mint transactions are written
under `broadcast/MintTestnetUSDG.s.sol/`, are ignored by Git, and must never
replace or be copied over the deployment record.

## 3. Deploy the protocol

```sh
./scripts/deploy-protocol.sh testnet dry-run
./scripts/deploy-protocol.sh testnet broadcast
./scripts/deploy-protocol.sh testnet status
```

The public broadcast consists of two direct CREATE2 transactions: renderer and
factory. The Solidity script checks the Safe, exact testnet USDG code and owner,
canonical CREATE2 deployer, deterministic addresses, and every factory/tier-
deployer binding before reporting success.

If transactions mined but Blockscout verification failed, keep the original
`broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json` and run:

```sh
./scripts/deploy-protocol.sh testnet resume-verify
```

The wrapper first proves the deployment is complete without loading a signer,
then lets Foundry resume its own verification. It does not parse receipts or
reconstruct transaction state.

Mainnet uses the same protocol script only after an explicit GO decision:

```sh
CONFIRM_MAINNET_DEPLOYMENT=4663 ./scripts/deploy-protocol.sh mainnet dry-run
CONFIRM_MAINNET_DEPLOYMENT=4663 ./scripts/deploy-protocol.sh mainnet broadcast
```

The confirmation must be present in the invoking process. The wrappers ignore
confirmation values stored in `contracts/.env` so a past decision cannot become
a reusable mainnet authorization.

There is no mainnet LOL Dollar deployment.

## 4. Generate the web bindings

Successful public deployment broadcasts are the durable Wagmi input. Commit
these active records and retain timestamped deployment artifacts as history
when present:

- `contracts/broadcast/TestnetUSDG.s.sol/46630/run-latest.json`
- `contracts/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json`

Remove the obsolete deployment's `run-latest.json` active pointer while keeping
its timestamped file as history. Wagmi must see one active deployment per
contract and chain.

Then generate the web bindings from `web/`:

```sh
bun run generate
```

Wagmi CLI's Foundry plugin reads `run-latest.json` for each chain and generates
the testnet USDG and production-factory address maps, ABIs, configs, and hooks in
`web/src/contracts.ts`. The app uses Viem's standard ERC-20 ABI and displays the
token simply as USDG. Do not copy addresses or ABIs by hand.

Review and commit the broadcast records and generated `web/src/contracts.ts`,
then prove the committed file is reproducible:

```sh
bun run generate:check
```

`generate:check` is expected to fail before that commit because its purpose is
to reject any generated-file drift from Git.

Testnet and mainnet deployments coexist in the generated maps. A future testnet
redeployment updates only chain `46630`; a mainnet deployment adds chain `4663`.
Anvil continues to write broadcasts to a temporary directory and injects local
addresses only into its test process.

## 5. Exercise the product

Run `./scripts/verify-local.sh`, then use the web app on testnet through
`/create`. Complete tier creation and discovery, purchase, renewal, gifting,
creator management, refunds, claims, ownership, and protocol administration
with real wallets.

Wagmi and Viem own simulation, wallet submission, receipts, replacements,
cancellation, and errors. Deployment testing does not justify application-local
transaction infrastructure.
