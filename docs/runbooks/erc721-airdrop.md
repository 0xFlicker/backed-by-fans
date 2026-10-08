# ERC721 airdrop on Robinhood mainnet

The `/airdrop` page starts with Gentlemen Prefer Blondes,
`0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747`, on Robinhood mainnet (4663).
It transfers existing NFTs from the connected holder. The collection owner is
not necessarily the holder of the NFTs to distribute.

## Current collection prerequisite

Read-only inspection on 2026-10-08 found an ERC721SeaDropCloneable minimal proxy
using implementation `0x09a26fC8FCEF18192E267D7A6da9dFb4be81Dd6A`, name
Gentlemen Prefer Blondes, supply 1,000, owner
`0x7198d81BeD40ac1fdE0c021f772E81f656a7009E`, and transfer validator
`0xA000027A9B2802E1ddf7000061001e5c005A0000`.
Recheck the owner and validator before deployment and setup.

**A standard GasliteDrop-style helper cannot transfer this collection under its
current policy.** The mainnet-fork test accepted `setApprovalForAll` but rejected
the transfer with `StrictAuthorizedTransferSecurityRegistry__UnauthorizedTransfer()`
(`0x1de5204e`). Approval alone is insufficient.

`AuthorizeERC721Airdrop.s.sol` prepares a creator-owned registry list. It copies
the current whitelist, blacklist and authorizers, adds the new helper to the
whitelist, then applies that list to this collection. It keeps the existing
transfer validator and security level. This method succeeded in a local mainnet
fork; **no live registry setting was changed**. The creator must review and sign
the setup. This deliberately pins the copied entries: subsequent updates to the
old shared list will not propagate to the new creator-owned list.

Keep other creator registry changes paused during setup. Rerun simulation
immediately before broadcasting and inspect the copied entries. If setup stops
partway, its new list may exist without being applied. Resolve pending wallet
transactions and inspect Foundry receipts before preparing another list.

Primary references: [GasliteDrop source](https://github.com/PopPunkLLC/GasliteDrop/blob/main/contracts/src/GasliteDrop.sol),
[Robinhood network configuration](https://docs.robinhood.com/chain/connecting/),
[OpenSea creator fee enforcement](https://docs.opensea.io/docs/creator-fee-enforcement).

## Helper design

`ERC721Airdrop.sol` is a standalone, non-upgradeable, noncustodial helper with no
admin, platform fee, deposit, or payable function. Each call safe-transfers at
most 200 NFTs from `msg.sender`. A failure rolls back that whole batch. Safe
transfers reject contract recipients that do not implement ERC721 receiving.
Zero, sender and helper recipients are rejected. The helper cannot spend another
wallet's approval by accepting an arbitrary `from` argument.

`Airdropped` commits to the sender, collection, recipient order, token IDs and
count. The page reports a batch as delivered only after wagmi/viem supplies a
successful receipt containing that exact helper event. Contract balances and
historical log scans do not reconstruct pending transactions.

This implementation uses the existing OpenZeppelin dependency and conventional
Solidity; it does not copy GasliteDrop's assembly or add ERC20/ETH distribution.

The [gas benchmark](erc721-airdrop-gas-benchmark.md) compares both helpers on a
local fork of this collection. For 200 NFTs sent to distinct wallets, GasliteDrop
used 9.17% less gas; the safe-transfer path accounts for 75.14% of that gap.
The benchmark does not change the prepared helper or public deployment plan.

## Deploy and authorize

Public-chain deployment and creator registry setup are separate human-authorized
steps. The wrapper defaults to simulation, loads the existing private mainnet
RPC from `contracts/.env`, and never loads a signing key into application code.
From the repository root:

```sh
node scripts/deploy-erc721-airdrop.mjs --sender DEPLOYMENT_WALLET
node scripts/deploy-erc721-airdrop.mjs --sender DEPLOYMENT_WALLET --account YOUR_FOUNDRY_ACCOUNT --broadcast
```

Use a fresh deployment, verify its runtime against the Foundry artifact and
verify source on the Robinhood explorer before asking the creator to whitelist
it. The setup script also refuses an unexpected helper runtime:

```sh
node scripts/deploy-erc721-airdrop.mjs --authorize --sender COLLECTION_OWNER --helper DEPLOYED_HELPER
node scripts/deploy-erc721-airdrop.mjs --authorize --sender COLLECTION_OWNER --helper DEPLOYED_HELPER --account CREATOR_FOUNDRY_ACCOUNT --broadcast
```

Foundry owns signing, replacement handling, and broadcast records. Passwords
belong in Foundry's private terminal prompt. Do not paste them into chat or flags.
The setup must be signed by the current collection owner; the deployer and NFT
holder can be different wallets. An agent must never sign or submit a Safe
proposal; use the established human-approved Safe flow if either wallet is a Safe.

After deployment, retain the public `DeployERC721Airdrop.s.sol/4663/run-latest.json`
broadcast record, then run from `web/`:

```sh
bun run generate
bun run generate:check
bun run typecheck
bun run build
```

Wagmi CLI's Foundry plugin discovers the public helper address. Do not insert an
address or ABI into the page by hand. Publish the website only after the helper
runtime, creator authorization and production reads have been checked. The
local review override is `NEXT_PUBLIC_ANVIL_ERC721_AIRDROP_ADDRESS`, for execution
chain 31337 only; never promote disposable fork receipts into public broadcasts.

For a standalone local review, start a separate Anvil with chain 31337, then run
`BBF_ANVIL_RPC_URL=http://127.0.0.1:18558 bun scripts/seed-erc721-airdrop-local.ts`
from `web/`. It refuses public endpoints and creates a mock ERC721 with IDs 1 and
2 owned by the first unlocked Anvil account. Start the website with that same
`NEXT_PUBLIC_ANVIL_RPC_URL` and the printed helper address as
`NEXT_PUBLIC_ANVIL_ERC721_AIRDROP_ADDRESS`. Open `/chains/31337/tools/airdrop`, enter
the printed mock NFT address, and connect the printed test sender. This fixture
is independent of membership-factory deployment and is not the live collection.

## Creator list and page flow

Accept either `address,tokenId` CSV (optional header), TSV, or a wallet address
per line with an explicitly entered first token ID. Address-only mode assigns
consecutive IDs in list order. It does not discover inventory or assume the
creator owns a contiguous range. Ownership of every assigned ID is checked.
For nonconsecutive inventory, provide explicit pairs. Repeated recipients are
allowed and displayed; repeated token IDs, invalid/checksum addresses, zero
addresses and malformed rows are rejected rather than silently filtered.

Files are parsed locally in the browser, limited to 2 MB and 10,000 rows. The
recipient list is not uploaded to the website server; transfers and transaction
calldata are public onchain. Review every assignment and connect the wallet
holding those NFTs. The page checks the target collection's live registry
permission before requesting approval.

One Start airdrop action requests collection approval if needed, then sends
batches sequentially with one wallet confirmation for each transaction.
Approval persists until removed; the page includes Remove approval. A 1,000-NFT
list needs five transfer transactions, plus initial approval if required. Each
batch is freshly simulated and checked for ownership and gas balance before
submission. Fee estimates are approximate; the wallet supplies final fees.

If a later batch fails or the wallet rejects it, earlier proven receipts remain
in the current tab and Continue airdrop sends only remaining rows. Keep the tab
open and retain the original list. No transaction state is persisted across a
reload. After a reload, remove rows from confirmed transaction receipts before
starting again; already-transferred token ownership prevents accidental replay.
Editing inputs starts a new review and clears the displayed batch progress.

## Verification

Unit and fuzz contract tests:

```sh
cd contracts
forge test --match-contract '^ERC721AirdropTest$' -vv
```

Run `ERC721AirdropMainnetForkTest` explicitly with a private Robinhood mainnet
`--fork-url`. Both tests skip on non-mainnet execution chains. The first proves
the current unlisted-helper rejection; the second impersonates the creator only
inside the local EVM, copies lists, and proves the safe transfer succeeds.
These are local fork transactions, not live mainnet deployment or airdrop evidence.

Web verification:

```sh
cd web
bun x vitest run src/lib/airdrop.test.ts src/features/airdrop/ERC721AirdropPage.test.tsx
bun run typecheck
```

The integration-boundary tests cover exact simulation-request forwarding, approval
and revocation, validator rejection before approval, wrong ownership, failed
simulation, receipt proof, and continuation after a later batch fails. A real
connected-wallet production transaction remains a release check after the
creator supplies the recipients and token assignments.

Preparation verification on 2026-10-08 passed 10 local contract tests (including
256 fuzz cases and a 200-NFT batch), two mainnet-fork tests at block 83,567,955,
34 focused web/config tests, and desktop/phone browser transfers plus approval
removal on disposable Anvil. The fork test invokes the actual creator setup
script. Deployment-wrapper simulation also succeeded on mainnet without a
signer or broadcast. Type checking, lint, generated-binding drift checking and
the production build passed. Grok's read-only review returned no findings.

The broader web suite had six failures in five existing test files. The same six
failures reproduced from the starting revision in a temporary source snapshot;
they are not introduced by this airdrop change. Local receipts, screenshots,
baseline comparison and review output are retained in the ignored
`artifacts/erc721-airdrop/` directory. No mainnet deployment, registry update,
NFT distribution or website publishing occurred during preparation.
