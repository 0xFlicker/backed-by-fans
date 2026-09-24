# CCFF00 holder testnet airdrop

From the repository root, run:

```sh
node scripts/airdrop-nft-holders.mjs --busd 0xdbbD302Fb4c20c1019814343BbA754869D0F6120
```

This is a **dry run**. It refreshes the holders of `0x505a22ffed8d37ebe580ffd98d2cdb0021189146` on Robinhood mainnet (4663), reads their balances on Robinhood testnet (46630), and reports how much funding the deployer needs. No signing occurs.

For each unique holder address, independently:

- Exactly zero native testnet ETH: send **0.01 ETH**.
- Exactly zero testnet bUSD: send **1,000 bUSD**.
- Any positive balance, including dust: skip that asset. This does not top up balances to a threshold.

Holding several NFTs still qualifies for one payment per asset. A later run refreshes ownership and balances; a holder who has spent an asset down to zero can receive it again. This is not a once-per-wallet lifetime distribution.

## Execute

Fund the approved deployer, `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`, on **Robinhood testnet**, including enough bUSD for the reported recipient count. Ethereum Sepolia ETH must be bridged to Robinhood testnet first.

Use the existing encrypted Foundry account. Set `ETH_PASSWORD` to the path of a private password file, not to the password itself. Keep that file outside the repository and readable only by its owner. Then:

```sh
ETH_PASSWORD=/secure/path/to/keystore-password \
  node scripts/airdrop-nft-holders.mjs \
  --busd 0xdbbD302Fb4c20c1019814343BbA754869D0F6120 \
  --execute
```

The default account is `backed-by-fans-testnet`; `ACCOUNT` can select another Foundry account but it must resolve to the same approved deployer. The script does not read/export a private key. Do not use the deployer concurrently for another operation during an airdrop.

The script reads `ROBINHOOD_MAINNET_RPC_URL`, `ROBINHOOD_TESTNET_RPC_URL`, `BUSD_ADDRESS`, `ACCOUNT`, and `ETH_PASSWORD` from `contracts/.env` when they are not already set in the environment. RPCs default to the official public endpoints. It uses the existing `web/node_modules/viem` installation; no new packages are needed. Node.js 22.16+ and Foundry `cast` are required.

The current bUSD address was deployed with zero initial supply, a 100-bUSD-per-address daily faucet, and no privileged mint function. Its faucet cannot provision this bulk airdrop directly. The deployer must first receive enough bUSD, or the token's provisioning design must be changed in a separate deployment. The airdrop script transfers existing tokens; it does not change the faucet or mint through throwaway accounts.

## Discovery and rechecks

This script is intentionally scoped to this collection. Its verified contract mints public IDs 1–9,750 and reserve IDs 9,751–10,000, with no external burn method. Discovery requires `totalSupply()` and `MAX_SUPPLY()` to both be 10,000, then reads **every `ownerOf` at one mainnet block**, in Multicall batches. It records the block number/hash, checks for a reorganization, and deduplicates owners. Failed reads abort the run.

Explorer holder data is not used: during implementation, Blockscout reported 15,095 holders for this 10,000-NFT collection, and direct explorer pagination returned HTTP 403. No Blockscout account or API key is needed by the finished script.

The dry-run balance reads are pinned to one testnet block. Immediately before each payout, current NFT ownership and current recipient balances are checked again. New owners who were not in the run's snapshot are picked up on the next run. Contract-wallet holders are included at their holder address, just like other holders; that address's usability on testnet is not inferred from mainnet ownership.

Both chain IDs and the token's `bUSD` symbol/6 decimals are checked. The dry-run funding requirement includes a configurable **0.1 ETH gas reserve**. This reserve is a planning allowance, not a guarantee of the total gas bill. `--gas-reserve` adjusts it; `--max-fee-gwei` caps the allowed fee per gas (default 1). Each payout also checks the current sender balance against its estimated gas and value before signing.

## Interrupted runs

Transactions are sequential, and each must have a successful receipt with two confirmations and the expected native payment or ERC-20 Transfer event. RPC failures, reverts, receipt timeouts, insufficient funds, or an already-pending deployer transaction stop the run. Completed payments remain completed.

Reports and submitted/confirmed transaction hashes are saved under ignored `cache/holder-airdrops/`. Reports are evidence, not a cached eligibility list. Running the same command again refreshes holders and balances.

Use Ctrl-C to stop after the current transfer resolves. A local lock prevents overlapping runs on the same computer. If the process is forcibly killed, check its recorded PID and the deployer's pending transactions before removing the lock directory named in the error. Do not run the script from multiple computers against the same deployer.

Additional commands:

```sh
# Refresh holders without a deployed bUSD token.
node scripts/airdrop-nft-holders.mjs --discover-only

# Focused verification of discovery, independent payments, and reruns.
node --test scripts/airdrop-nft-holders.test.mjs
```

## Verified preview

The initial complete dry run used mainnet block **71,087,890** and testnet block **123,465,704**. It found **4,055 distinct owners** of all 10,000 NFTs, **3,852 zero-ETH balances**, and **4,055 zero-bUSD balances**. Required distributions were **38.52 test ETH** and **4,055,000 bUSD**. The deployer held 11.3649037646691296 ETH and zero bUSD, giving an ETH shortfall of 27.2550962353308704 with the default 0.1 ETH gas reserve. These are snapshot values; rerun to refresh them.

The report is in `cache/holder-airdrops/2026-09-24T04-33-30-311Z.json`. Eleven focused tests passed, covering complete ownership enumeration, failed reads, exact-zero eligibility, funding math, chain rejection, interrupted runs, and payment receipt validation. The signing/broadcast path has not been exercised against public testnet; no airdrop transactions were sent.
