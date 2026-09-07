# Required implementation evidence

**Feature**: [Protocol buyback and burn](spec.md)  
**Status**: Requirements for future implementation; no tests in this file have been executed.

The delivered feature is a working creator membership protocol with a launched protocol token and
automated fee processing. A token launch demo or a mocked swap test does not satisfy it.

## Evidence layers

| Layer | Required proof |
| --- | --- |
| Source and unit checks | Published terms, fee arithmetic, access control, token acceptance, accounting, bounds, event attribution, and burn postconditions. |
| Independent models and stateful tests | Conservation per asset; checkpoint-independent accrual; reserved/earned/released/refunded conservation; no fee diversion; no consumption of creator/reward/referral liabilities; no double processing; refunds after fees are spent; arbitrary action ordering and adversarial assets/callers. |
| Authentic integration | Fresh token launch through the selected real launchpad on the pinned fork, pre-graduation and post-graduation purchases, actual supply destruction, non-ETH conversion routes, actual Safe configuration execution, enabled Pons vested buybacks and earned developer compensation. |
| Fault injection | Paused/frozen assets, manipulated prices, stale observations, failed burns, insufficient liquidity, partial fills, unavailable external sweep operator, graduation failure, malformed routes, concurrent calls and RPC loss. Clearly label any modified external state. |
| Browser | Wallet-backed creation, purchase, renewal, gift, claims, refund and protocol-activity flows against the same deployed test contracts, with receipt and state assertions. |
| Public deployment | Outside this specification's delivery milestone. Fork evidence is not a public launch, audit, legal clearance, or real-market economic proof. |

Reuse the repository's independent accounting models, Foundry checks, local verification entrypoint,
Anvil-backed browser harness and existing wallet lifecycle. Extend them for the selected environment;
do not duplicate transaction submission, receipt polling, replacement or reconciliation already
handled by wagmi/viem.

## Required scenario matrix

| Scenario | Passing evidence |
| --- | --- |
| Fee range | Reject 0%, 0.99%, above 100%, and totals above 100%; accept 1%, a representative intermediate value and 100%; reject all later edits, including by a new tier owner. |
| Safe configuration | Execute token onboarding, route approval/replacement and bounded-setting changes through a real test Safe with its configured signature threshold. Reject unauthorized accounts, insufficient authorization and out-of-bound changes; retain public change evidence. Impersonating the Safe alone is insufficient. |
| Administration workflow | Reproduce all supported configuration actions using documented Safe transactions and scripts with reviewable inputs and expected confirmed outcomes. Verify the resulting public configuration and change history in the app; no custom administration screen is required. |
| Configuration continuity | Disable a token: new tiers fail, existing valid payments/claims/refunds continue. Pause buybacks globally and by asset: inventory remains pending. Repair a route and resume: an ordinary caller processes the old inventory. A previously prepared transaction is checked against the effective configuration. |
| Authority limits | Safe transactions cannot alter published tier economics or the protocol token, withdraw membership inventory, redirect it to another purpose, or exceed hard safety bounds. Verify no residual deployer privilege; token ownership alone grants no configuration authority. |
| Payment split | Independent expected raw balances for paid joins, renewals, gifts, contributions, absent referral attribution and small amounts; no protocol fee for zero gross. |
| Entire membership lifecycle | Active/expired status, paid and grant time, fixed-wallet rewards, referrals, ownership transfer, creator proceeds, artwork changes, full and partial refunds and rejoining remain correct. |
| Full protocol allocation | Exactly100% of gross becomes protected protocol reserve; creator/reward/referral allocations are zero and membership access begins immediately. Earn over consumed paid time; unused-time gross refunds require zero owner top-up even after prior earned fees burn. |
| Continuous accrual | 120 tokens/12 periods/10% earns3 after3 periods with9 reserved. A90-token refund uses9 reserve and81 creator funds. Test fractional periods and compare one checkpoint with many tiny checkpoints. |
| Accrual lifecycle | Renewals/gifts queue paid time; different variable contribution lots retain fee rounding; free grants never earn fees and zero-gross paid intervals do not accelerate later lots. Collect after expiry/credential burn, cancel/rejoin without stale-generation earnings or unbounded storage cleanup. |
| Refund and release race | At a common timestamp, refund-first and release-first preserve the same entitlement/refund funding. Earned-held fees cannot fund refunds, unearned fees cannot release, transfer failures revert, and cancellation rounding is explicit and at most one raw unit. |
| Collection and forecast | Stop collection while entitlement advances. In the12-token fee example after3 periods, assert protected12/unearned9/uncheckpointed-earned3/checkpointed-earned0; checkpoint at the same timestamp to make3 releasable, then release leaving protected9/released3. Public views distinguish total earned awaiting release from immediately releasable amounts and show conditional24h/7d/30d forecasts with common-block/population coverage; partial pages cannot imply full-tier reconciliation. |
| Collector traversal | Across multiple tiers and more than100 members, visit eligible expired IDs on later pages within the finite captured-sweep tier-visit bound. Verify forward in-memory cursors, round-robin visits, a blocked asset, new arrivals deferred to the next sweep, wraparound, retained scheduled progress and restart without duplicate releases. One-shot completes one finite sweep; the separate small replacement fixture retains its two-interval target. |
| Asset coverage | USDG, one authentic Stock Token, WETH or another liquid non-stock token, the new protocol token itself, and a compatible asset with no executable route. Onboard each through the Safe before tier creation; preserve each asset's unit scale. |
| Stock action | A display multiplier change updates visible amounts while raw payment, pending fees, rewards and refunds remain unchanged. Unsupported/frozen behavior fails clearly and affects only that asset. |
| Token launch | Actual factory launch receipt, ETH pair, initial purchased developer holdings, no premine/free allocation, enabled vested buybacks, zero additional creator tax, recorded developer Pons recipient and separate immutable membership-burn destination. |
| Bonding purchase | Earned released membership revenue buys through the real curve before graduation; the obtained amount equals the attributable supply reduction; receipts reconcile external trade costs and pending remainder. |
| Early pricing | With inadequate price evidence, fees wait; with sufficient admissible evidence, processing works while the launch is still bonding. No completion-by-waiting-for-graduation shortcut. |
| Crossing purchase | Partial fill spends only the filled amount, unused ETH remains burn budget, only actual received tokens burn, and launch state is refreshed before later spending. |
| Graduation recovery | Exercise ready-but-not-tradable and swept-but-pool-not-created states; memberships continue; any supported public retry succeeds without an owner; processing resumes against the authentic destination pool. |
| Graduated purchase | Real pool buy and supply reduction after graduation, including route/token ordering and required hook behavior. |
| Protocol-token payment | The fee is reserved and earns over paid time; only its earned release burns directly without a circular swap. Unearned refund backing and other liabilities stay protected. |
| No market / unsafe market | Nothing is sold at an arbitrary caller-selected price; pending amounts and reasons remain visible; another eligible asset still processes. |
| External fee harvesting | Remaining creator ETH revenue is claimable by the developer's Pons recipient. Reproduce an operator-required sweep failure and show that membership-fee processing remains independent and trading compensation remains explicitly pending. |
| Vested trading buybacks | Trades during bonding and after graduation fund actual vault deposits. Advance local time to test partial vesting, a later deposit preserving already vested amounts, remaining schedule and final release; either authorized beneficiary's release credits both shares, and the developer can claim its earned tokens. Verify unauthorized release fails. |
| Fee-flow separation | Membership-funded purchases incur ordinary Pons costs, which can produce developer revenue and vested tokens. Reconcile those costs once; none of the vault's deposits, releases or claims counts as a membership-fee burn or new membership revenue. |
| Native Pons fallback | At curve graduation and when native buyback conditions prevent execution, reconcile earmarks paid as creator revenue under the deployed rules. Generate actual vesting deposits through eligible sweeps before exhaustion or after pool creation; never equate enabled status with guaranteed deposits. |
| External creator controls | In labeled control tests, changing the Pons recipient or buyback toggle affects only its external fee/vesting behavior and future allocations as specified by Pons. Membership terms, immutable burn destination and fee inventory remain protected. |
| Adversarial execution | Wrong asset, wrong output recipient, counterfeit venue, malicious callback, surplus donation, low minimum output, stale quote, manipulation and duplicate/concurrent calls cannot divert inventory or fabricate burns. |
| Replace automation | Stop runner A and remove its gas; a separately funded ordinary runner B resumes processing without a permission update, contract change or access to A's key, under enabled Safe policy. |
| Administrative disclosure | Public views identify the Safe, enabled assets, routes, limits, pauses and configuration history; pending reasons distinguish Safe action from market or runner availability. No full-decentralization or token-governance claim. |
| External authority | Record and replay relevant launchpad administrator powers as fault tests. Verify their scope and avoid claiming those dependencies are ownerless. |
| Browser failures | Wrong network, wallet rejection/replacement, insufficient asset/gas, stale quote, RPC failure and unavailable burn route produce accurate action states; successful membership payment is never reported as failed because buyback is pending. |
| Reproduction | Two clean runs from the recorded fork origin reproduce accounting and lifecycle outcomes; differences in timestamps/addresses are explained, not treated as identical artifacts. |

The authentic Stock Token and liquid non-ETH path must be verified in the selected environment.
If unavailable, report that integration acceptance as blocked; a representative mock can exercise
failure and display behavior but cannot replace the missing external integration evidence.

First reconcile stored tier allocations to protected holdings plus cumulative releases and protocol
refund contributions. At one timestamp and for a matching accounting population, protected holdings
equal projected unearned reserves plus uncheckpointed earnings plus checkpointed earned-held fees.
Check both equations even when collection is stopped; partial projections cannot prove a full-tier
total. Cancellation rounding is included once in checkpointed earned-held/released amounts, never
uncheckpointed paid-time earnings.
Then, for each vault input asset, reconcile opening inventory plus earned releases and
processable donations against closing inventory plus actual input
spent on trades or direct burns. Trade input includes venue costs; do not count those costs twice.
Reconcile acquired protocol tokens separately against actual supply destroyed. Partial-fill refunds
reduce actual input spent rather than creating new revenue, and token amounts from different assets
are never added together. Tier liabilities have their own conservation model and are never part of
the spending budget. Maintain an independent Pons ledger for creator ETH income, vault deposits,
vested amounts, releases, claims and remaining balances. Earned developer compensation is not
membership burn inventory, even when the underlying trade was a membership-funded purchase.

On forknet, advancing time and impersonating an existing Pons operator or beneficiary may be needed
to exercise external sweeps and vesting. Label these steps as simulated external participation;
retain actual contracts and authorization checks. They demonstrate integration behavior, not
permissionless access to Pons's operator role. Separately prove membership-fee processing without
that role. Do not grant operator credentials to the Backed By Fans application or automation runner.

## Reproduction record

The implementation must deliver an exact-command quickstart with prerequisites, expected outputs,
pass/fail criteria, runtime endpoint, fresh test wallet funding, reset and teardown instructions.
Record the application commit, external source revision, origin chain ID, block number and hash,
runtime code hashes, launch transaction, created contracts and pools, automation funding source,
fee allocation/accrual/release/refund receipts and lot generations, burns, vault deposits, vesting
terms, beneficiary claims, projected release views and final accounting balances.
Record the test Safe address, owners, threshold, authorized configuration transaction receipts and
before/after settings. Use test-only Safe signers; preserve separation from Pons external role simulations.
Keep browser traces/screenshots alongside the
associated transaction evidence.

The fork is disposable. Its origin endpoint is used for reads; all deployments, purchases, state
manipulation and signed transactions target the isolated test environment. Guard execution against
accidentally targeting the origin network, and use test-only keys. When the fork expires, retain
the evidence and recreate it from the pinned origin; do not imply that its local URLs or balances
remain live.
