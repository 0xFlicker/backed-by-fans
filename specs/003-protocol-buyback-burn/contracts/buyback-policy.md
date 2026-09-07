# Buyback policy and settlement contract

**Scope**: Design interface, not implemented code. Implements FR012–019 and FR036–037.

## Earned-only input

Policies apply only to earned fees already released from tiers and separately identified donations.
Unearned membership fees remain protected in tiers under [fee-accrual.md](fee-accrual.md). A valid
policy, direct protocol-token burn or Safe action cannot accelerate earning or spend those reserves.
Periodic collection and swap execution may lag continuous entitlement. Market or policy pauses do
not freeze accrual or prevent local refunds. Only earned releases enter the vault membership bucket.

## Economic authority

The protocol Safe authorizes acceptable exchange rates and exposure. A policy is an expiring limit
order, not a price oracle or a promise of market value. The runner cannot set price evidence, renew a
budget or weaken a minimum. Safe-approved unfavorable rates can cause economic loss even though all
received protocol tokens burn. Disclose that risk alongside the Safe's configuration powers.

For each active route, store a strictly increasing revision, `validAfter`, `validUntil`, batch input
cap, total input budget, cumulative actual input spent, and per-leg reference output/input ratios.
Publish a hash and inspectable record of the evidence used by the Safe. That evidence is provenance
for its decision; the contract does not pretend to verify offchain fair value.

Each swap leg has a positive raw-unit numerator/denominator and tolerance bps. Compute its required
net output with full-precision arithmetic and one final upward rounding:

`requiredOut = ceil(actualInputSpent × referenceNumerator × (10_000 − toleranceBps) / (referenceDenominator × 10_000))`

Use checked bounded operands and established full-precision math; do not round down a security floor.
Token decimals/UI multipliers never enter onchain settlement arithmetic. Ratios describe the exact
input/output asset pair and include expected ordinary venue costs. Match numerator/denominator raw
units when preparing policies, including Stock Token raw units. An independent model must check the
Solidity arithmetic at maximum values and rounding boundaries.

A caller-supplied stricter minimum, if exposed, is combined using `max`; it never replaces the stored
floor. Initial interface omits that optional parameter and lets callers choose input amount, deadline
and expected revision only.

## Initial settings and hard bounds

These are selected engineering defaults, not measurements of safe mainnet economics. Genuine fork
fee/output evidence must validate them before deployment; changing a hard bound requires design review.

| Setting | Initial policy | Enforced bound |
| --- | --- | --- |
| Tolerance below Safe reference | 100 bps | 0–100 bps; policy may tighten, never exceed 1% |
| Policy lifetime | 15 minutes | `validUntil > validAfter`; duration ≤24 hours; reject before/after window |
| Activation | At configuration transaction time | No retroactive execution or backdated budget consumption |
| Swap route size | Shortest verified route | ≤2 asset→ETH conversion legs plus final ETH→protocol purchase |
| Input batch | At most 1/10 of the published initial policy budget | Positive, ≤ remaining budget and available selected inventory |
| Initial policy budget | Selected inventory worth at most 0.01 ETH under the Safe's reference conversion; direct ETH budget 0.01 ETH | Positive finite raw amount; initial batch ≤0.001 ETH equivalent. Safe may choose later raw budgets explicitly; no automatic renewal |
| Policy input/rate operands | Exact raw units | Each stored numerator, denominator, input cap and total budget ≤`uint128.max`; zero denominator/rate prohibited |
| Revision | Increment on route or economic-policy replacement | Old revision rejected; no caller-selected policy revision reuse |
| Pauses | Unpaused only after validated route/policy setup | Global or asset pause blocks processing only |
| Anti-sniping penalty | Zero for ordinary membership executor | Wait while its deployed curve penalty is nonzero; standard curve/hook fees still apply |
| Runner schedule | 30 seconds | Job scheduling only; no transaction receipt polling implementation |

The 1% tolerance is measured against the Safe's selected **net-output** reference. It is not a cap on
Pons's ordinary fees, a market volatility assumption or an assertion that 1% slippage is universally
safe. Safe must publish a reference appropriate for the intended actual batch and curved pricing.
The 0.01 ETH initial exposure is a conservative small fork/default launch policy, not a permanent
liquidity limit. Larger later policies require explicit Safe authorization and the same invariant checks.

New assets may be onboarded without a route or funded budget. They reserve fees in tiers, earn them over paid time and release earned fees into
pending inventory until the Safe installs a valid policy. A policy may authorize a finite amount before
all of that inventory has arrived; execution remains limited to actual backing balances.

## Choosing reference evidence

For the fresh ETH curve, use the verified immutable launch supply, phantom reserve, initial reserve
and ordinary fee formula to calculate conservative expected net output for the authorized small batch.
Record launch identity, source block and formula inputs. Require the executor's launch tax to be zero.
A policy can be published while still bonding without fabricated historical observations. If market
movement makes its floor unfillable, inventory waits for another Safe decision.

For asset conversion and post-graduation trading, the Safe uses independently reviewed pricing/market
observations, supported issuer/feed information where actually available, raw units, pool identities
and observed depth. Never have an ordinary runner automatically derive an authorization from the spot
quote it will execute against. No reliable reference means no policy and an explicit pending reason.
Whether the chosen evidence is economically sound remains part of Safe trust; the fork proves enforced
floors and exposure, not resistance to a malicious Safe's own prices.

## Settlement sequence

1. Accept one input asset and one source bucket (`membership` or `donation`) per processing call.
   This avoids mixing attribution or prorating burns between sources in one transaction.
2. Check pause state, nonzero amount, registered typed route, matching current revision, deadline,
   policy time window, available inventory and remaining budget. For direct protocol-token burns,
   omit market/policy checks but preserve amount, inventory, attribution and pause checks.
3. Snapshot protected balances and protocol supply; reserve the attempted amount under reentrancy
   protection. Execute only internally encoded exact-input operations, with fixed custody recipients.
4. Check each conversion's actual input/output against its stored floor. Validate fixed pool identities,
   hook/manager wiring and approvals. No allow-revert commands, arbitrary target or external recipient.
5. Read current Pons lifecycle and buy from curve or verified graduated pool. If no market is executable,
   revert the entire attempt. A threshold-crossing curve purchase may return unused ETH.
6. Require positive acquired protocol-token output for every successful market settlement, then check
   the final leg's floor against **actual ETH spent**, not offered input. A conversion-only success is
   forbidden. Burn exactly the newly acquired protocol tokens; verify attributable balance
   and `totalSupply` reduction. No existing inventory or unrelated balance is included in the burn count.
7. Return every unused input/intermediate asset to vault custody and clear allowances. Record actual
   conversion/spending and residual inventory in the same source bucket. Unexpected assets or unexplained
   residual executor/router balances fail the settlement. Emit the full attributable outcome.
8. Consume budget by actual input asset spent, including input converted into residual ETH, not by
   nominal offered input. Failed settlements roll back budget and all ledger changes. A direct ETH
   partial fill consumes only spent ETH. Converted residual ETH uses its own active policy when processed.

Intermediate ETH is an explicitly accounted inventory asset, not an ERC-20 membership payment option.
WETH unwrap is a fixed 1:1 conversion through verified WETH, not a discretionary market leg. Native
ETH receives from the immutable executor are reconciled to the active settlement; unsolicited ETH is
a donation. Tokens left from conversion may be processed later only through the same burn purpose.

Example: 100 raw payment units convert to 1 ETH; the closing curve consumes 0.6 ETH and refunds
0.4 ETH. Record 100 units spent/conversion complete, 0.6 ETH consumed, purchased tokens actually burned,
and 0.4 ETH remaining as converted inventory in the original source bucket. Do not label 0.4 ETH as
new membership revenue, a donation or burned value. The original-asset policy consumed 100 raw units.

## Policy changes and failure states

- Configuration changes, pause changes and donation synchronization cannot interleave with an active
  settlement; enforce the same reentrancy boundary.
- Pause/resume preserves revision and consumed exposure; re-enabling the same policy never refills it.
- Replacing a route invalidates its old policy. An explicitly new Safe-approved economic revision may
  authorize a new finite budget; prior spending remains in cumulative history. No silent reset.
- Changing limits increments revision. Stale prepared transactions revert before spending.
- Stable pending reasons: `NoRoute`, `NoPolicy`, `NotYetValid`, `Expired`, `BudgetExhausted`,
  `Paused`, `LaunchPenalty`, `GraduationPending`, `PriceBelowFloor`, `InsufficientLiquidity`.
- RPC/read failures are client unavailable states, not invented contract balances or successful burns.
- A reverted transaction cannot persist a contract failure event. The UI obtains pending reasons from
  current canonical reads/simulation, while retaining receipt errors supplied by viem.

Required adversarial evidence: same-block manipulated quotes, floor undercut by one raw unit,
expired/early policy, duplicated processing, revision change before mining, budget replay, wrong pool,
recipient spoofing, hooks/reentrancy, unexpected fee-on-transfer behavior, failed/no-op burn, returned
ETH and price movement during graduation. Tests must show both accepted bounded execution and rejection.
