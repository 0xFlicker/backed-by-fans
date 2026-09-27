# CCFF00 holder membership distribution

For the deployed CCFF00 campaign, use the [helper runbook](holder-airdrop-helper.md)
and `scripts/complete-holder-airdrop.mjs` to check or resume distribution. This
document covers holder discovery and the historical sequential distributor.
Do not run that distributor alongside the helper.

The script discovers all current CCFF00 holders on Robinhood mainnet (4663), then distributes on Robinhood testnet (46630):

- One funded membership in `0x4dD68609B611b7f19cF0E10b5914603a6Cd5Dc0B` per eligible wallet, paying exactly **1,000 payment tokens for one period**.
- With `--first-airdrop`, send a full **0.01 ETH** to holders below 0.01 ETH. Otherwise send only to zero-ETH holders.

Direct bUSD transfers and the `--busd` / `BUSD_ADDRESS` settings have been removed. The payment token is read from the tier. At inspection the tier used bUSD at `0x68cdeB4985317B7dad73F9C47A7226879721Cb86`, with six decimals and a 30-day period. The script checks the price, decimals, pause status and payment-token consistency before execution. The period duration is reported from chain, not assumed to be a calendar month.

This uses `giftMembership(recipient, 1, 256)`, which pulls payment from the deployer and mints to the recipient. The protocol's `grantMembership` only grants free access time and does not fund rewards, so it is not used. If the deployer itself qualifies, `createMembership(1, zeroAddress, 256)` handles the protocol's self-gift restriction. Allocation and claims follow the tier's rules; funding 1,000 does not promise a 1,000-token reward payout to the recipient.

## Preview

```sh
node scripts/airdrop-nft-holders.mjs --first-airdrop
```

Dry run is the default. It enumerates all 10,000 original NFT IDs at a pinned mainnet block, deduplicates owners, checks balances at a pinned testnet block, and reports the required funding, allowance and tier capacity. Multiple source NFTs do not earn multiple memberships. Failed reads abort.

Membership eligibility requires zero NFTs of the target tier and no confirmed gift recorded by this campaign. Payment-token wallet balances do not affect eligibility. Existing tier NFTs are skipped even when expired. The original collection holder addresses remain the recipients; no mainnet-to-testnet address mapping is inferred.

## Reuse an existing snapshot

Use a complete report from a prior membership dry run to skip both NFT discovery and the bulk holder balance scan:

```sh
node scripts/airdrop-nft-holders.mjs \
  --snapshot cache/holder-airdrops/2026-09-26T07-29-29-708Z.json \
  --first-airdrop --execute
```

That existing report contains 4,009 holders and matching balance rows. Snapshot mode freezes the candidate addresses to that report; newly arriving holders are excluded until a fresh scan. It validates the collection, tier, chains, deployer, unique holder rows, the total 10,000 NFT count, payment token, and original source block hash. Old direct-token-airdrop reports without membership rows cannot be reused.

Cached recipient balances are planning inputs only. The script rereads sender funding, allowance, tier configuration and capacity, and applies the durable gift journal. It still checks live source ownership and live recipient balances before each payout. The snapshot's funding estimate may differ from the live need as balances change; insufficient allowance or funding stops execution. Reports retain `balanceSnapshotBlock` to distinguish cached recipient balances from fresh sender reads.

Check unlocking separately, without RPC calls or any scan:

```sh
node scripts/airdrop-nft-holders.mjs --check-wallet
```

## Funding and allowance

Fund `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027` with the reported payment tokens and Robinhood testnet ETH. With `--execute`, the script checks the current allowance after unlocking your Foundry account. If insufficient, it sends `approve(tier, summary.fundingRequired)` for exactly the planned funding (not unlimited), waits for two confirmations, and verifies the Approval event and resulting allowance before distributing. Sufficient existing allowance is reused. The dry run reports approval needs but sends nothing. Approval uses the same password prompt, fee cap, gas estimation, chain checks, nonce guard, and transaction journal as payouts. If approval fails or times out, distribution stops; rerunning rereads the onchain allowance. Some allowance may remain if recipients become ineligible during the run.

The default gas reserve is 0.1 ETH, adjustable with `--gas-reserve`. It is a planning allowance, not an estimate of the full campaign gas cost. `--max-fee-gwei` caps fees, defaulting to 1. Each transaction estimates gas and checks funding before signing.

## Execute

```sh
node scripts/airdrop-nft-holders.mjs --first-airdrop --execute
```

Uses the encrypted Foundry account `backed-by-fans-testnet` (or `ACCOUNT`, which must resolve to the approved deployer). Run from an interactive terminal. After preflight, it prompts once for the hidden keystore password and reuses it for this run. No password file or `ETH_PASSWORD` is needed or read. Foundry requires a regular password file and rejects the previous `/dev/fd/3` handoff. The script automatically creates a temporary password file with mode 0600 in a private temporary directory for each Foundry call, then deletes it in a finally block. The password is never included in command arguments or the child environment; the retained buffer is cleared on exit. An uncatchable process kill or machine crash can leave a private `bbf-keystore-unlock-*` temporary directory to remove. You do not create or configure any password file yourself. The script loads RPC settings and ACCOUNT from `contracts/.env` only when unset. It never exports a private key. It requires the existing web viem dependency, Node.js 22.16+, Foundry cast, and macOS/Linux.

Source ownership and recipient eligibility are reread before payouts. Each membership receipt must confirm both the expected 1,000-token / one-period `PaymentProcessed` event and the matching NFT mint to the recipient. Two confirmations are required. Contract-wallet recipients must accept ERC721 safe minting; failed gas estimation stops the run before that transaction is signed.

## Reruns and interrupted transactions

ETH can be replenished on later runs under the selected balance rule. Memberships are **once per campaign wallet**, not renewed automatically after expiry, cancellation, or transfer.

Preserve the campaign journal at `cache/holder-airdrops/membership-0x4dd68609b611b7f19cf0e10b5914603a6cd5dc0b.json`. Its location does not change with `--output`. It records confirmed recipients and an intent before signing each membership transaction. A pending intent blocks reruns until reconciled, including a crash between signing and recording its hash. Do not delete this journal or run from another checkout/computer; doing so loses the history of recipients who transferred or canceled their membership.

If pending is set, inspect its hash (or the deployer nonce if a hash was not saved). For a confirmed successful gift, verify the mint/payment events, add the recipient to confirmed, then clear pending. For a definitively reverted or never-broadcast attempt, clear pending only after confirming there is no unresolved transaction at that nonce. Never clear pending just to retry a timeout.

A local lock prevents simultaneous execution in this environment. Do not concurrently use this deployer elsewhere. On a hard interruption, inspect the lock PID and pending transactions before removing the stale lock. Reports and submitted/confirmed receipt logs are stored in `cache/holder-airdrops/` or `--output`.

```sh
# Holder discovery only, no membership reads or signing.
node scripts/airdrop-nft-holders.mjs --discover-only
```

The deployed helper, committed 4,009-recipient plan, and selected public receipts
are documented in the helper runbook. The local snapshots and sequential journal
remain recovery records; keep them for backup even after helper distribution.
