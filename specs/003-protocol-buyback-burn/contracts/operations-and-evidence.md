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
receipt checks. Rehearsal runs on a child fork and must reconcile supply and retain
unprocessed residuals; it is a scenario, not a forecast of future third-party trades.
None of these are public mainnet deployment evidence. Earlier expiring-policy
acceptance documents are historical and do not certify the replacement.
