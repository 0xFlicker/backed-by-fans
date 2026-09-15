---
date: 2026-09-13
type: fix
status: active
origin: docs/brainstorms/2026-09-13-contract-release-security-recommendations-requirements.md
---

# Guarded buyback release remediation

## Agreed behavior

Launch with operator-only market execution and a working contract transition to
permissionless guarded execution. The Safe appoints or revokes the trusted
operator, controls mode changes, and retains global and asset pause controls.

Operator policy lives entirely off-chain. Each operator transaction supplies its
amount, allowed typed route, positive minimum output for every market leg, and
deadline. No operator route, price, size, timing policy, expiry, or budget is
published to contract storage. Public standing settings apply exclusively to
permissionless execution. Operator authorization and accounting/safety state
remain on-chain. Private submission reduces ordering exposure when supported;
neither unpredictable timing nor off-chain policy guarantees sandwich prevention.

Permissionless execution uses Safe-configured routes, minimum and maximum inputs,
cooldowns, and positive caller-independent per-leg raw-unit exchange rates.
Expiry and cumulative spending budgets are optional: zero expiry is indefinite;
zero configured budget is unlimited. A Safe may configure permanent settings and
walk away. Policies are tied to the current asset settings revision and entry
lifecycle. Missing or invalid policies fail closed even if the mode is enabled.

## Implementation units

1. **Contracts:** add operator/mode administration, transaction-supplied operator
   routes and output minima, and public rate policies. Use full-precision upward
   rounding for rate-derived floors. Check exact measured settlement and burn
   output. Preserve absolute floors during partial fills, including closing
   curve purchases. Cap public input by any remaining budget and debit actual
   spending; mode changes and pauses do not refill budgets.
2. **Router and callers:** retain public accounting, earned-fee release, and
   direct burns. Skip router market execution during operator mode; never grant
   the public router operator authority. Existing public process remains the
   actual permissionless endpoint; operator execution has a dedicated endpoint.
3. **Tools and UI:** extend existing runner/admin/calculator/rehearsal tools and
   generated bindings. Quote each operator trade using its off-chain route and
   explicit tolerance. Use native wagmi/viem simulation and receipt primitives.
   Reflect execution mode truthfully and retain cached data on refresh failure.
4. **Documentation and evidence:** reconcile current operating documentation,
   preserve accepted upstream exclusions and membership-maintenance risk, and
   record operator/mode state in deployment verification. Do not relabel old
   deployment or Feature 005 evidence as proof of this remediation.

## Acceptance

- Reject unauthorized operator/configuration calls and public-router bypasses.
- Cover zero/two conversion routes, native/WETH normalization, bonding, pool,
  partial fills, stale policies, rounding, expiry, optional/unlimited budgets,
  budget sharing across buckets, and repeated mode changes.
- Reverts preserve inventory, cooldowns, sequence, budgets, allowances, and supply.
- Prove operator execution needs no stored public route, limits, or price policy.
- Prove an indefinite permissionless policy remains usable without renewal.
- Preserve native-ETH launch validation, standard-token provenance, and free
  membership accounting/paused permissionless maintenance regressions.
- Run relevant Foundry/unit/invariant checks, generated-binding checks, web
  tests/typecheck/lint, browser checks, and disposable-fork integration where
  available. Clearly separate source/mock proof from authentic fork evidence.

## Release boundary

Implementation and authentic functional integration acceptance are complete;
see `docs/release/contract-security-2026-09-13.md` for retained results and the
running review environment. The plan remains active because the repository
clean-room provenance gate still rejects five unchanged Fizz license headers.

This targets a new immutable deployment. Mode transitions happen on that new
contract; existing immutable deployments cannot acquire these capabilities.
Implementation authorization does not authorize public deployment or signing.
Production operator, private submission capability, rates, limits and optional
expiry/budgets are explicit operator/Safe choices, not invented defaults.

Before permissionless activation, economic review covers the full route and
reports protocol net loss and attacker net profit separately, with assumptions
about fees, gas, liquidity costs and recovered protocol fees. Public price bounds
enforce Safe terms, not an independently established fair market value.
