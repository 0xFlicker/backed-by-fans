# Operating the buyback protocol

## Routine operation

1. Open `/tools/buybacks` on the local website. Refresh balances and estimate all
   currencies. Set the target percentage/timeframe and gas preference.
2. Apply calculated sizes, review the affected currencies, and run the optional
   sequential rehearsal. Inspect deferred balances, actual burns and gas costs.
3. Sign and save the combined settings through the current Safe. This is needed
   when changing operating preferences, not once per day.
4. Anyone executes eligible buys on the protocol page. An optional one-shot runner
   performs the same public path and exits. No admin signing is part of execution.

Concrete commands and screen labels are in [Local buyback tools](local-policy-tools.md).
Fresh-fork deployment, repinning and wallet funding are in [Quickstart](../quickstart.md).

## Healthy evidence

- Settings read back match the Safe receipt, with the actual owner threshold.
- ETH/WETH appear once in canonical inventory.
- An eligible ordinary caller receives a burn event and total supply decreases by
  exactly that amount. Spent input and residual balances reconcile separately.
- A second early purchase reports cooldown; changing settings or a failed purchase
  does not reset the prior successful timestamp.
- Minimum-size and gas-deferred balances remain in custody.
- With the local backend stopped, the public contract call is still available.
- No expiry or budget-renewal task exists.

## When funds wait

Check public eligibility first: missing route/settings, explicit pause, minimum
batch, cooldown, launch penalty or graduation pending. Refresh after a successful
fee release or lifecycle transition. Quote/gas unavailability blocks our helper's
purchase; it does not create a contract-level signer dependency. The Safe can
change standing limits or pause purchases while an actual route issue is examined.

## Evidence boundaries

Synthetic tests exercise adversarial callbacks, failures, clock races and accounting.
Authentic fork tests exercise pinned Pons contracts through bonding, partial fills,
graduation and pool burns. Browser tests verify wallet-library submission and Safe
receipt checks. Rehearsal uses stateless `eth_simulateV1` calls against a captured block and must
reconcile simulated supply changes and retain unprocessed residuals. It does not
write to the running fork or start a child fork; it is a scenario, not a forecast
of future third-party trades.
None of these are public mainnet deployment evidence. Earlier expiring-policy
acceptance documents are historical and do not certify the replacement.


## Select the running deployment

Run commands from the repository root. Replace `YOUR_RUN_ID` with the run whose
Ready message you opened; do not copy factory or tier addresses from an older run.

```sh
cd /Users/user/Development/backed-by-fans
export BBF_ACTIVE_RUN=YOUR_RUN_ID
export BBF_ACTIVE_EVIDENCE="$PWD/artifacts/protocol-fork/$BBF_ACTIVE_RUN"
export BBF_ADMIN_RPC_URL=http://127.0.0.1:18557
export BBF_FACTORY_ADDRESS="$(python3 -c 'import json,os; print(json.load(open(os.environ["BBF_ACTIVE_EVIDENCE"] + "/bootstrap.json"))["factory"])')"
cast chain-id --rpc-url "$BBF_ADMIN_RPC_URL"
./contracts/scripts/manage-buybacks.sh forknet inspect
./contracts/scripts/manage-payment-tokens.sh forknet list
```

The chain must be **31337** and the inspect output must identify the same factory,
vault and Safe shown on the protocol page. The Safe's owner wallet configures
settings. Any funded wallet can use Burn. The runner uses a separately funded
execution key; it needs no Safe authority.

## Token onboarding, routes and pauses

Use `/tools/buybacks` for normal human-unit size/interval changes. Asset onboarding
and route repair are separate, occasional Safe operations. Enabling an asset does
not create a liquid route; disabling it prevents new tiers, not existing payments.

To inspect an asset and prepare onboarding (preparation does not submit):

```sh
export BBF_ASSET=TOKEN_ADDRESS
./contracts/scripts/manage-payment-tokens.sh forknet inspect "$BBF_ASSET"
./contracts/scripts/manage-payment-tokens.sh forknet enable "$BBF_ASSET"
# Use disable instead of enable to prepare removal from new-tier eligibility.
```

Read the prepared target, decoded arguments, chain, Safe nonce and postconditions.
For route/pause preparation, the current TypeScript CLI accepts:

```sh
cd /Users/user/Development/backed-by-fans/web
bun scripts/protocol-admin.ts buybacks forknet prepare pause \
  --input /absolute/pause.json --output /absolute/pause-payload.json
```

`pause.json` contains `{"expectedSafeNonceRaw":"CURRENT_NONCE","paused":true}`;
obtain the current nonce from inspection. `false` prepares resume. `asset-pause`
adds an `asset` address. `route` takes `asset`, `expectedSafeNonceRaw`,
`expectedRevisionRaw` and `pools`; each pool contains `currency0`, `currency1`,
`fee`, `tickSpacing` and `hooks`. Use verified, connected pool identities from
inspection and the retained integration inputs. Never guess a route from token
symbols. ETH uses the zero address and canonical WETH shares its route/settings.

These are prepared Safe calls, not transactions and not files accepted by the
standing-settings review page. There is currently no general-purpose browser
payload importer or operator submission CLI for these actions. The existing
`web/scripts/protocol-safe-transactions.ts` exposes `executeForkSafePayload` for
local test signers; the acceptance harness uses it to execute and verify real Safe
transactions. Do not export a personal wallet key to use that test helper. For a
personal-wallet administrative call outside the settings page, use a Safe client
that supports the execution network and the prepared call. A local Safe-client
integration is not provided here. The user explicitly deferred this personal-wallet
submission path to future work on 2026-09-09 (analysis C1); it does not block this
local milestone. Safe authorization and test-Safe execution remain acceptance
requirements.

The shell `manage-buybacks.sh prepare` action list still names obsolete `policy`
and does not accept `limits` or `interval`; use the calculator for standing
settings or the TypeScript CLI for explicit preparation. This documentation does
not imply that the wrapper or the general submission workflow has been repaired.

After execution, require Safe `ExecutionSuccess` and verify the target state.
An outer successful receipt alone can contain a failed inner Safe call. Refresh
public configuration/history: token enablement must match; route/limit changes
must match the current revision; pause state must match. If the Safe nonce changed
before signing, prepare again against current state.

## Diagnose waiting funds

| What you see | Meaning and next action |
| --- | --- |
| Future fees | Paid time has not elapsed. These funds back refunds; Burn cannot spend them. |
| Earned, awaiting release | Press Burn to checkpoint and release the selected bounded batch. |
| No inventory | No recorded released funds in that source bucket. Check earned fees above. Unrecorded donations require the separate synchronization action. |
| Below minimum | Let funds accumulate or have the Safe lower the minimum after reviewing gas cost. |
| Cooldown | Wait until the displayed chain timestamp; clicking repeatedly cannot bypass it. |
| Paused / no route / no limits | The Safe must resume or configure that currency. Funds remain in custody. |
| Launch penalty | Wait for the launch penalty to end. |
| Graduation pending | Public Pons recovery/pool creation must complete. The runner can attempt supported public lifecycle calls; the Burn router does not perform them. |
| Gas deferred | The helper's gas preference rejected the estimated cost. Recalculate larger batches or change the preference after review; this is not a Safe permission failure. |
| RPC error | Check RPC health, then refresh. Do not interpret an unavailable balance as zero or reset the fork automatically. |
| Unverified contract after a reset | The old URL refers to an old deployment. Open My account for the new memberships. |

A collection-only Burn receipt is useful progress, but it is not a token burn.
An actual burn must report confirmed destroyed tokens. Gas price is in **gwei**;
total estimated or paid gas cost is in **ETH**. Rehearsal gas includes preparation
work, so a zero-purchase scenario can still have a nonzero simulated gas cost.

## Current acceptance status

The [one-button evidence](../one-button-burn-evidence.md) records focused browser,
contract and source checks. The [standing evidence](../standing-buybacks-evidence.md)
retains earlier runs with their own scope. T096 (runner), T097 (router evidence
integration) and T098 (final full acceptance pair) remain pending. Do not promote
historical complete acceptance to proof of the current source. Production Cron
and public deployment are outside this local milestone.
