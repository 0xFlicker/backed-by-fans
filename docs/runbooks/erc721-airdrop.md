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
current policy.** The initial custom-helper fork test accepted `setApprovalForAll` but rejected
the transfer with `StrictAuthorizedTransferSecurityRegistry__UnauthorizedTransfer()`
(`0x1de5204e`). Approval alone is insufficient. Gaslite also rejects unlisted transfers, but
its assembly discards the validator revert data.

`AuthorizeGasliteDrop.s.sol` prepares a creator-owned registry list. It copies
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

`GasliteDrop.sol` vendors the original full GasliteDrop implementation from
[revision 6da9ef9003264e7b48308cdd7081ba442b447563](https://github.com/PopPunkLLC/GasliteDrop/blob/6da9ef9003264e7b48308cdd7081ba442b447563/contracts/src/GasliteDrop.sol).
The compiler pragma is adapted to this project's Solidity 0.8.36; attribution
and transfer logic are preserved. Gaslite includes ERC721, ERC20 and ETH bulk
transfer functions. This page exposes only ERC721 distribution.

ERC721 transfers use `transferFrom`, so contract recipients are not asked to
accept the NFT through `onERC721Received`. Confirm contract wallets can retrieve
the NFTs before distributing. Approval cannot be used to transfer another
caller's NFTs: the sender is always `msg.sender`. A failed transfer rolls back
the whole batch. There is no admin, platform fee or upgrade mechanism.

The page limits each batch to 200 NFTs, rejects empty or malformed assignments,
checks collection code/ERC721 support and owned token IDs, and rejects zero,
sender and helper recipients. These are page validations, not added Gaslite
contract checks. Gaslite has no custom batch event. After wagmi/viem supplies a
successful receipt, the page verifies every collection `Transfer` event against the exact ordered assignments.
Missing, extra or mismatched events do not advance confirmed progress.

The [gas benchmark](erc721-airdrop-gas-benchmark.md) records the historical
comparison with the removed custom helper. For 200 NFTs sent to distinct
wallets, original Gaslite used 9.17% less gas. The compiler-only control saved
another 819 gas with Solidity 0.8.36. Neither measurement is a live fee quote.

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

After deployment, retain the public `DeployGasliteDrop.s.sol/4663/run-latest.json`
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
local review override is `NEXT_PUBLIC_ANVIL_GASLITE_DROP_ADDRESS`, for execution
chain 31337 only; never promote disposable fork receipts into public broadcasts.

For a standalone local review, start a separate Anvil with chain 31337, then run
`BBF_ANVIL_RPC_URL=http://127.0.0.1:18558 bun scripts/seed-erc721-airdrop-local.ts`
from `web/`. It refuses public endpoints and creates a mock ERC721 with IDs 1 and
2 owned by the first unlocked Anvil account. Start the website with that same
`NEXT_PUBLIC_ANVIL_RPC_URL` and the printed helper address as
`NEXT_PUBLIC_ANVIL_GASLITE_DROP_ADDRESS`. Open `/chains/31337/tools/airdrop`, enter
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
forge test --match-contract '^GasliteDropTest$' -vv
```

Run `GasliteDropMainnetForkTest` explicitly with a private Robinhood mainnet
`--fork-url`. Both tests skip on non-mainnet execution chains. The first proves
the current unlisted-helper rejection; the second impersonates the creator only
inside the local EVM, copies lists, and proves the standard transfer succeeds.
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

Initial custom-helper preparation verification on 2026-10-08 passed 10 local contract tests (including
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

Gaslite replacement verification on 2026-10-08 passed 12 local contract tests
(including 256 fuzz cases, a 200-NFT batch, and upstream ERC20/ETH paths), both
actual-collection fork tests, 36 focused web/config tests, desktop and phone
wallet transfers plus approval removal, type checking, lint, generated-binding
drift checking and the production build. Receipt tests reject missing, extra or mismatched NFT events and accept routed
wallet receipts when they contain the exact NFT transfers. The deployment wrapper
simulated Gaslite on mainnet without a signer or broadcast. The executable
runtime matches the benchmark's compiler-only Gaslite control. Evidence is
retained in `artifacts/erc721-airdrop/gaslite-*`.

The updated local fixture is at `http://127.0.0.1:3111/chains/31337/tools/airdrop`
with Gaslite `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` and test NFT
`0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`. These are disposable Anvil
addresses, not public deployments. Token IDs 1 and 2 remain with the seeded
sender after browser tests restore the snapshot.

The Grok replacement review was attempted in read-only mode. Two CLI runs
stopped after setup without findings; a direct-code pass produced no response
before it was stopped after several minutes. This replacement therefore has
manual review and the verification above, without a completed external review.
It is not an audited deployment.
