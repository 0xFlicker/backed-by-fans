# Holder airdrop helper

Use `scripts/complete-holder-airdrop.mjs` with the deployed helper to resume this
campaign. The original `scripts/airdrop-nft-holders.mjs` provides holder discovery
and the historical sequential distributor. Stop that distributor and resolve its
pending transactions before using the helper. Do not run both distributors at once.

`contracts/src/HolderAirdrop.sol` batches ETH and paid membership gifts into one
transaction per 25 recipients. Each transaction either succeeds completely or
reverts completely. Onchain completion flags make repeating a recipient range safe
even after a recipient spends their ETH, transfers their membership, or cancels it.
Already funded wallets (at least 0.01 ETH) and existing tier NFT owners are skipped.
Skipped recipients are not marked delivered; they may qualify on a later call.

Only the immutable operator can fund, distribute, import progress, or withdraw.
The operator supplies the authorized recipients; this is not a public claim contract.
It cannot verify NFT ownership on chain 4663 from chain 46630. The saved mainnet
holder snapshot fixes the recipient list; it does not automatically include new holders.
Reuse an instance to retry the same campaign. Deploy another for a new campaign.

## Check or resume the campaign

The committed plan contains 4,009 recipients and the historical imports of 408 ETH
deliveries and 423 membership gifts. These import counts describe the handoff;
the helper's onchain flags record subsequent completion. Keep the same plan and
helper when retrying. From the repository root, preview remaining eligibility:

```sh
node scripts/complete-holder-airdrop.mjs
```

To distribute any remaining eligible recipients:

```sh
node scripts/complete-holder-airdrop.mjs --execute
```

Stop any other distributor or Forge broadcast before starting this command. It
uses the saved plan and deployed helper. No deployment, start index, or
manual funding amount is needed.

The runner prompts for the imported `backed-by-fans-testnet` vault password at
startup, then checks the chain and helper terms. It bulk reads ETH balances,
membership ownership, and both onchain completion flags. It approves and deposits
only the helper's funding shortfall, then sends batches of up to 25 eligible
wallets, waits for two confirmations, and prints hashes and actual deliveries.
It rescans the whole plan after the pass and finishes when none remain eligible.
Foundry `cast` estimates gas and signs each transaction without a Forge fork
simulation. The RPC is loaded privately from `contracts/.env`.

The preview does not ask for a password or send transactions. Broadcast duration
depends on RPC estimation and confirmations for each batch.

The password is shared with native Foundry commands through a temporary private
directory and a mode-0600 password file. The runner removes both on normal exit,
errors, and handled interrupts. No `ETH_PASSWORD` setup is needed. Run this only
from your own terminal; never put the password in a command or chat.

Rerun the same command after an interruption or failure. Confirmed helper flags
are the progress record, so already delivered gifts are skipped even if the
wallet spent ETH or transferred its NFT. A pending operator transaction blocks
the next run until resolved. A rejecting recipient stops its atomic batch and
leaves earlier batches recorded; inspect the reported failure before retrying.

Funding reserves both assets for selected wallets with unset completion flags,
because their eligibility may change between the scan and the transaction.
Unused funds remain in the helper and count toward the next run. The default
operator gas reserve is 0.1 ETH; the fee ceiling is 1 gwei. The runner refuses
insufficient funding or a fee above the ceiling before sending the next
transaction. Override these only deliberately with `--gas-reserve` and
`--max-fee-gwei`.

The execution lock is in the system temporary directory, named
`bbf-complete-airdrop-<helper-address>.lock`. If a force kill or machine crash
leaves it behind, check its saved PID and ensure no sender or pending transaction
remains before removing that specific lock. A force kill can also leave the
private password directory behind; remove it before retrying.

The Forge entrypoints below remain available for deployment, progress imports,
and diagnosing an individual recipient. Use the completion runner for the full
distribution.

## Configuration

The contract is reusable with another tier/operator/price/period/ETH amount. The
included Foundry entrypoints deliberately target this campaign:

- Robinhood testnet, chain 46630.
- Operator `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`.
- Tier `0x4dD68609B611b7f19cF0E10b5914603a6Cd5Dc0B`.
- Payment token `0x68cdeB4985317B7dad73F9C47A7226879721Cb86` (currently bUSD).
- Exactly 1,000 six-decimal payment tokens for one 30-day period.
- Full 0.01 ETH payment to eligible recipients below 0.01 ETH.

The helper is the protocol's payer, and the holder owns the gifted membership.
Gift funding uses the tier's existing accounting and reward split; this does not
change protocol economics. Unused helper funds can be withdrawn to the operator.
The tier allowance is bounded to each call and cleared afterward.

The deployed helper for this campaign is
`0x99fA88fDDb6E8b501a5C01A3D0051051ccCc0a70` on chain 46630. Its runtime and
configuration were checked against the compiled contract. Deployment details are
saved in `contracts/deployments/holder-airdrop-helper.json`. Reuse this instance;
do not run deployment again to resume this campaign.

## Prepare the handoff

The existing campaign plan is already committed. Preparation below describes
creating a plan from local snapshot and journal records; it is not a resume step.

When the old script has stopped and pending transactions are resolved, from the
repository root:

```sh
node scripts/prepare-holder-airdrop.mjs \
  --snapshot cache/holder-airdrops/2026-09-26T07-29-29-708Z.json
```

This reads the existing holder list, persistent membership state, and **all**
transaction journals in `cache/holder-airdrops`. It writes
`contracts/deployments/holder-airdrop-plan.json`, including imported ETH and
membership completion plus SHA256 hashes of the inputs. No chain calls, discovery,
balance scan, or signing occur. It refuses an old-script lock, pending membership,
unconfirmed journal transaction, or changing input. Historical deliveries are
operator-attested from these local records, not independently verified onchain by
the helper. Reconcile ambiguous records before importing; do not erase pending state.

Review the plan's recipients and completed lists. The tool refuses to overwrite an
existing plan. If the old script runs again after preparation, prepare a new named
plan with `--output contracts/deployments/holder-airdrop-plan-v2.json`, then set
`AIRDROP_PLAN=deployments/holder-airdrop-plan-v2.json` for the Foundry commands.
Keep the same plan when retrying ranges after using the helper.

## Use the deployed helper and import

From `contracts/`, use your existing RPC environment and Foundry vault account.
Foundry handles the password prompt and signing. Define this convenience function:

```sh
cd contracts
airdrop_forge() {
  local entrypoint="$1"
  shift
  local rpc_url="${ROBINHOOD_TESTNET_RPC_URL:-}"
  if [[ -z "$rpc_url" ]]; then
    rpc_url="$(node --input-type=module -e 'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util"; process.stdout.write(parseEnv(readFileSync(".env", "utf8")).ROBINHOOD_TESTNET_RPC_URL || "");')"
  fi
  if [[ -z "$rpc_url" ]]; then
    echo 'Missing ROBINHOOD_TESTNET_RPC_URL in contracts/.env' >&2
    return 1
  fi
  FOUNDRY_PROFILE=robinhood forge script \
    "script/HolderAirdrop.s.sol:$entrypoint" \
    --rpc-url "$rpc_url" \
    --account backed-by-fans-testnet \
    --sender 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027 \
    --gas-limit 10000000000 \
    --slow "$@"
}

export AIRDROP_HELPER=0x99fA88fDDb6E8b501a5C01A3D0051051ccCc0a70
airdrop_forge ImportHolderAirdropProgress --broadcast
```

Imports are idempotent. Before each range, the executor checks that its legacy
recipients have their corresponding completion imported. It checks only selected
recipients rather than rereading the entire campaign's historical deliveries.
Import all progress once before starting. Wait for any unresolved
old wallet transaction before sending helper transactions; avoid simultaneous
broadcasts from this account. The helper is standalone and has no linked library.

For a new deployment using the configured campaign terms, run these commands
from the repository root. The wrapper loads the RPC without shell exports.
Change the campaign configuration before using a different tier or operator:

```sh
node scripts/deploy-holder-airdrop.mjs
node scripts/deploy-holder-airdrop.mjs --broadcast
```

The first command simulates. The second uses the imported `backed-by-fans-testnet`
account and Foundry's native hidden password prompt. Do not paste the password into
chat. In zsh, paste commands without standalone `#` comment lines.

## Fund and execute

For a first test of up to 25 recipients, fund the upper bound of 25,000 payment
tokens and 0.25 ETH. The operator needs additional ETH for transaction gas.

```sh
export AIRDROP_FUND_TOKENS=25000000000
export AIRDROP_FUND_WEI=250000000000000000
airdrop_forge FundHolderAirdrop --broadcast

export AIRDROP_START=0
export AIRDROP_COUNT=25
airdrop_forge ExecuteHolderAirdrop
airdrop_forge ExecuteHolderAirdrop --broadcast
```

The original script recorded 423 membership gifts in this plan. That count does
not prove the next recipient is eligible now: wallets may already hold this tier
or enough ETH. A successful batch with no delivery events is a safe skip. Advance
the start index by the selected count after a successful batch; unused funds stay
in the helper. Check actual events rather than treating transaction success as a
count of gifts sent.

The funding entrypoint approves the helper for that amount and deposits both
assets. The helper handles its own tier approval. Funding is **additive**: running
the funding entrypoint again deposits another amount. Check its balances before
repeating funding. The helper consumes only eligible deliveries and retains the
rest for later ranges or withdrawal.

For larger runs, increase `AIRDROP_COUNT` (for example, 250), fund enough for that
range, and run the executor once. Foundry splits the range into transactions of
at most 25 recipients and `--slow` waits for each receipt before sending the next.
For the saved 4,009-holder snapshot, `START=0 COUNT=4009` covers the full list in
161 transactions. Onchain completion skips previously delivered/imported wallets.
The default is 25 so the initial call is easy to inspect.
The larger local simulation gas budget lets Foundry simulate multiple batches;
each broadcast transaction still receives its own estimated gas limit.

If broadcasting fails, resolve pending wallet transactions first, then rerun the
**same executor range without `--resume`**. It simulates again against current
balances and completion state. Foundry's nonce-specific `--resume` is unnecessary
for these idempotent calls. Do not redeploy the helper on retry; that would reset
its completion records. Keep Foundry's `broadcast/` receipts and the plan.

A rejecting recipient or insufficient funds reverts its whole 25-person batch.
Prior successful batches remain recorded. Refill the helper if needed; isolate a
rejecting recipient with `AIRDROP_START=<index> AIRDROP_COUNT=1`, inspect the revert,
and execute ranges around that recipient to continue. Rejections are visible and
are never silently marked completed.

Recover unused funds with the same vault, from `contracts/`:

```sh
cast send "$AIRDROP_HELPER" 'withdraw(address,uint256,uint256)' \
  0x68cdeB4985317B7dad73F9C47A7226879721Cb86 TOKEN_RAW ETH_WEI \
  --rpc-url "$ROBINHOOD_TESTNET_RPC_URL" --account backed-by-fans-testnet
```

For test verification, use the repository's preserved vesting link (the helper
itself does not need the library; the real tier test fixture does):

```sh
linked_mapping=$(jq -er .mapping out/vesting-leaf/link-manifest.json)
FOUNDRY_PROFILE=robinhood forge test --libraries "$linked_mapping" \
  --match-contract HolderAirdropTest --code-size-limit 1000000 \
  --gas-limit 1000000000 -vv
node --test scripts/prepare-holder-airdrop.test.mjs
```

The fixtures exercise local helper behavior. Live deployment and transaction
evidence are recorded separately from local verification.

## Campaign records and local backup

- `contracts/deployments/holder-airdrop-helper.json` records the deployed helper
  and its campaign terms.
- `contracts/deployments/holder-airdrop-plan.json` fixes recipients, imported
  progress, and SHA256 references to the local handoff inputs. Evidence paths are
  repository-relative.
- `contracts/broadcast/HolderAirdrop.s.sol/46630/` contains selected timestamped
  public receipts for deployment, imports, funding, and the saved Forge batches.
  These receipts are not a complete record of the later `cast` completion run.

The duplicate `run-latest.json`, the receipt-free repeated broadcast record,
future raw broadcasts, holder snapshots, transaction journals, and wallet review
screenshots remain local and ignored. Preserve these files for backup. Do not
delete campaign journals to restart or treat saved receipt counts as a current
onchain eligibility check.
