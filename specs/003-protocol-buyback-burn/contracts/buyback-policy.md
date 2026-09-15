# Guarded buyback execution settings

## Operator execution

The vault starts paused in `OperatorGuarded` (mode 0). The factory-owner Safe
appoints/revokes `operator` and manages mode and pause controls. A zero operator
revokes execution authority.

`processOperator(asset, bucket, amountIn, route, minimumOutputs, deadline)` is
restricted to that operator and mode. Policy is entirely off-chain. The route and
all economic terms are calldata, not public-policy storage. Supply one positive
absolute minimum for each conversion pool and the final Pons purchase; do not
add an unwrap entry. Existing typed route validation, settlement and burn checks
remain. Operator execution does not depend on stored public routes or limits.

## Permissionless execution

`PermissionlessGuarded` (mode 1) retains
`process(asset, bucket, amountIn, expectedRevision, deadline)` for public purchases.
The Safe sets routes, `ExecutionLimits` (minimum/maximum input and per-asset
interval), global interval, and `setPermissionlessPolicy` for each canonical asset.

The policy records entry lifecycle, current asset revision, optional expiry and
budget, and positive numerator/denominator raw-unit output rates for every market
leg. Rate-derived output floors use each leg's offered input and round upward.
Partial fills retain that strict absolute floor. Native/WETH unwrap is exact 1:1.

- `expiresAt = 0`: no expiry; no periodic renewal requirement.
- `inputBudget = 0`: unlimited budget. An exhausted finite budget remains finite
  and unavailable; it does not turn into an unlimited budget.
- A finite budget is shared across membership/donation buckets and native/WETH
  aliases. Eligible input is capped by remaining budget, and actual input spent
  is debited only on successful settlement.
- Route, limit or policy changes advance the asset revision. Limit-only changes
  atomically preserve a currently valid policy and its actual remaining budget;
  they never revive a policy already stale from a route change. Policies must match
  current settings and entry lifecycle. A successful curve-closing purchase may
  change lifecycle; the next purchase needs the appropriate pool policy.
- Missing, stale, expired and exhausted policy states fail closed. A mode switch,
  pause or operator rotation never replenishes budget.

The Safe may atomically batch route/limit/policy setup and mode activation. Even
when performed separately, public execution remains unavailable until all terms
are valid. Rates are standing Safe authority, not caller-selected spot quotes or
independent fair-value guarantees.

## Shared settlement and maintenance

Both paths preserve exact custody accounting, source buckets, refunds, pauses and
actual holder burn with supply reconciliation. A revert leaves inventory, clocks,
policy budgets and settlement sequence unchanged. Successful market purchases
record last-buy timestamps; public cooldowns apply in permissionless mode.

The public router skips market purchases while operator-only execution is active.
It remains available for accounting, fee release and direct burns. Direct burns
of existing protocol-token inventory bypass market policies and clocks, while
preserving global and per-asset pause controls. There is no withdrawal, upgrade,
generic call, or compatibility endpoint for obsolete policy implementations.
