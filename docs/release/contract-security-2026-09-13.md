# Guarded buyback remediation: local evidence

Date: 2026-09-13. Implementation and local verification only. Authentic fork
transactions and disposable Safe signatures are confined to local chain 31337.
No public deployment or public-chain signing was performed.

## Implemented behavior

- Trusted operator authority is Safe-controlled; launch defaults paused in
  OperatorGuarded. Operator policy is entirely off-chain and supplied in each
  transaction: amount, route, positive per-market-leg minima, and deadline.
- PermissionlessGuarded uses public routes, input limits, cooldowns and positive
  per-leg rate floors. Expiry and cumulative budgets are optional; zero means
  indefinite validity and unlimited budget respectively.
- Limit-only edits preserve valid prices and actual remaining budget. Route
  changes stale the policy. Public execution fails closed without valid terms.
- Public accounting/release/direct burns remain available under their existing
  pause semantics. Public routing cannot confer operator authority.
- Operator quotes are fresh for every purchase, including after a prior receipt.
  Private-mode quotes, simulations, gas estimates and writes use the designated
  private endpoint; provider confidentiality itself is not proven by this code.
- Normal rehearsal simulates only proposed limit edits, preserving captured
  policy, budget, mode and pause. Explicit activation rehearsal is separate.
- The local served fixture also defaults to operator mode. An explicitly selected
  permissionless demo signs local fixture configuration before owner handoff.

## Verification performed

| Check | Result |
| --- | --- |
| Contract non-fork/non-invariant suites | 570 passed across 52 suites |
| Authentic fork contract suites, including canonical Safe | 49 passed across 9 suites, zero failures or skips |
| Focused vault/executor/router/administration suites | 71 passed |
| Existing buyback conservation invariant | Passed, 256 runs and 128,000 calls, zero reverts |
| Exact CI deployment-suite invocation | 32 passed across 3 suites; production size assertions unchanged |
| Web unit/component/tool suites | 801 passed across 112 files |
| Web typecheck, full lint and format | Passed |
| Foundry source/script/test format | Passed |
| Production web build | Passed |
| Generated binding drift check | Passed |
| Slither high-severity gate | Passed; 125 detector results remain, not a zero-findings audit |
| Lifecycle CLI tests | 17 passed |
| Buyback admin shell wrapper | Passed, including 19 administration tests |
| Browser smoke | Homepage and protocol page render, navigation works, no browser errors/overlay observed |
| Authentic integration scenarios | 13 passed: 11 in the final general run, graduation/vesting and seeded one-click burn/cooldown passed on targeted runs |
| Diff whitespace check | Passed |

Initial source review was supplemented by authentic integration. Earlier review
identified stale sequential quotes and rehearsal policy replacement; both were
fixed and independently rechecked. Regression coverage includes distinct bounds
across two conversions, exact unwrap, rollback, finite budgets shared across
source buckets/native aliases, operator revocation, and public-router isolation.

The deployment test's incidental address-order assumption was replaced with an
explicitly unsorted pair. Its oversized script fixture now loads script artifacts
rather than embedding repeated deployment graphs. Production limits were not
raised. The existing targeted Slither snapshot annotation moved to the new private
helper after independently verifying its only caller holds the reentrancy guard.

Authentic execution subsequently found and fixed the following integration gaps:

- The local Safe submission tool omitted operator, mode, and public policy calls
  from its permitted methods. It now validates their revisions where applicable
  and reconciles the resulting operator, mode, or complete policy after the Safe
  receipt.
- The runner used 0.1 gwei for local submission but omitted that fee during gas
  estimation. Anvil's implicit tip could exceed its decayed base-fee estimate,
  preventing purchases. Estimation and submission now agree. The local test
  wallet and funding/seed scripts use the same explicit fee.
- Browser fixtures still contained older membership/refund arguments, UI labels
  and collapsed-panel assumptions. The updated scenarios exercise the current
  interfaces and visible disclosures, including with JavaScript disabled.
- The closing-purchase Foundry test applied its revert expectation to a revision
  getter. The graduation browser test used a vesting beneficiary captured before
  the first deposit. Both assertions now target the intended operation/state.

## Remaining verification boundaries

Authentic browser integration completed against the fresh deployment in
`artifacts/protocol-fork/security-guarded-20260913-01/`. Retained general-run
results include the resolved graduation failure; `browser-targeted/` contains
its passing rerun and `public-demo-04/` contains the passing one-click scenario.
The explicit permissionless demo was reverted to the operator-mode snapshot.
Local setup and review requirements are now recorded in root `AGENTS.md`.

The review fork remains running at `http://127.0.0.1:18557`, with the website at
`http://localhost:3110/chains/31337/protocol`. Eight memberships supply 300 USDG
and 0.02 WETH of first-month protocol funding. Both review wallets retain at
least 1,000 USDG, 1 WETH, AMD and gas. The second wallet is a threshold-1 Safe
signer and the appointed local operator. `review-verification.json` verifies
membership ownership, clone implementation, accounting conservation and wallet
balances; `review-operator.json` retains the reconciled Safe transaction.
No private-order-flow provider or production economic parameters were validated.

The repository-wide clean-room gate fails on five unchanged Fizz utilities:
`DecimalPrinter.sol` carries `UNLICENSED`; `StringUtils.sol`, `Hevm.sol`,
`Clamp.sol` and `PropertiesAsserts.sol` carry `Unlicense`. These exact headers
were verified in HEAD; they were not relabeled or excluded from the gate.
The gate requires MIT on all owned Solidity files, so full release verification
remains incomplete independently of the remediation's functional checks.

## Deployment pointer and rollout

Retired the active testnet factory pointer because this is a new incompatible
immutable release. Its identical timestamped receipt
`contracts/broadcast/DeployDirectProtocol.s.sol/46630/run-1789277138.json` remains.
Generated current interfaces must not attach to the previous deployed factory.
Renderer registry deployment records remain independent.

Before release, complete the remaining provenance gate and configure the
operator and chosen submission provider explicitly. Before public activation,
the Safe reviews complete-route economics and standing price/size limits, with
optional expiry/budgets. Observe authority events, policy changes, purchase
receipts, inventory/budget deltas and supply burns after each initial execution.
Unexpected deltas or repeated price failures call for pause and investigation;
mode toggles never replenish budgets or withdraw inventory.

Functional integration
acceptance is complete; the plan remains active for the provenance gate above.

## Manual operator interface: 2026-09-14

`/chains/31337/tools/buybacks` now presents wallet-based operator execution in
OperatorGuarded mode. Operators select released inventory, amount, typed
conversion pools and per-leg slippage, review a fresh quote and gas estimate,
then sign the simulated transaction through wagmi. Submission keeps the reviewed
minimum outputs and deadline, rechecks current authority/mode, and reconciles the
confirmed vault burn event. Public settings remain in a separate disclosure.
No operator economic policy is stored; no backend signing key was introduced.

The authentic `protocol-operator-ui.spec.ts` scenario passed with both ETH and
USDG purchases, actual supply reductions, unchanged public routes/policies,
unauthorized-wallet blocking, invalidation after edits, operator revocation and
expired-quote rejection without submission. The scenario restores its snapshot.
Evidence is retained under
`artifacts/protocol-fork/security-guarded-20260913-01/operator-ui-20260914/`.
The related 29 settings, transaction and market-quote regression tests passed,
as did typecheck, lint and formatting. Submission uses the connected wallet's
provider and does not establish private transaction delivery.


## Operator usability correction: 2026-09-14

The operator page now uses displayed currency amounts, including scaled-token
multipliers, rather than asking users to reason about token base quantities.
**Max** uses the current available raw balance internally, while input and review
show normal currency amounts. A fresh quote reads current display metadata;
submission rejects a changed input multiplier and requests another review.

The existing verified ETH/USDG/AMD venue catalog supplies routes automatically;
manual pool entry is removed. Every purchase still quotes the pools live and
supplies its terms per transaction, without saving operator policy on-chain.

**Release earned fees** is available next to the ready and unreleased balances.
It advances a bounded amount of accounting and releases fees using the existing
router with an empty purchase list. The wallet confirms release before buyback
review. Success is reconciled from receipt events and the balances are refreshed.

The authentic operator browser scenario now also proves fee release increases
membership buyback inventory without changing token supply, followed by a
successful Max purchase through the automatic USDG route. It retains the prior
ETH/conversion, authority and expiry checks and restores its snapshot. Evidence:
`artifacts/protocol-fork/security-guarded-20260913-01/operator-usability-20260914/`.
61 focused unit tests, typecheck, lint, and connected-operator desktop/phone
checks passed. Existing review memberships, signing access and unreleased fees
remain available for manual verification.

## License gate resolution: 2026-09-15

The earlier Fizz header blocker is resolved. The clean-room gate preserves the
original headers for exactly five generated test-helper paths while retaining MIT
requirements elsewhere, archive-import checks, and dependency pins. The gate and
five regression cases pass. See `testnet-guarded-2026-09-14.md` for deployment status.
