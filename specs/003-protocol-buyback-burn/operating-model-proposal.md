# Guarded buybacks

The September 13 release remediation supersedes the September 8 unguarded
permissionless model. Historical standing-buyback evidence remains historical;
it does not validate this replacement deployment. See the
[remediation plan](../../docs/plans/2026-09-13-contract-release-security-remediation-plan.md).

## Launch: trusted operator, off-chain policy

Earned fees accumulate in burn-only custody. The Safe appoints a trusted operator
and the vault starts paused in `OperatorGuarded`. The operator supplies its amount,
typed route, positive minimum output for each market leg, and deadline in each
transaction. No operator economic policy is stored on-chain. Existing public
routes, limits, cooldowns and rate policies are not prerequisites for this path.

The operator controls route selection within the executor's supported route
constraints. It cannot withdraw inventory or redirect purchased tokens. Exact
settlement, refunds, pauses and supply-verified burning remain enforced. Each
conversion and the final Pons purchase must meet its supplied output minimum;
unwrap remains exact 1:1. A partial fill never silently relaxes the minimum.

Private submission and unpredictable timing can reduce ordering exposure, but
are not a guarantee against sandwiches. On-chain storage and included transaction
calldata are public. Use explicitly configured private submission where supported;
never silently replace it with public submission.

## Transition: public standing policy

The same contract supports `PermissionlessGuarded`. The Safe configures routes,
minimum and maximum input sizes, global and per-currency cooldowns, and positive
per-market-leg raw-unit exchange rates. Once valid settings are active, anyone
can process eligible inventory without the operator's backend or signature.

Expiry and cumulative input budgets are optional. Zero expiry means indefinite
validity; zero configured budget means unlimited lifetime spending under the
per-batch limits and cooldowns. Policies need no renewal merely because time has
passed. Finite budgets, when configured, are shared across membership/donation
buckets and native/WETH aliases; only actual input spending consumes them.

Price policies bind to the current asset settings revision and entry lifecycle.
Route changes require corresponding policy authorization; limit-only edits preserve
currently valid rates and actual remaining budgets atomically. Graduation requires
pool policy for subsequent pool purchases. Missing, stale, expired or exhausted
policies fail closed. The Safe can batch configuration and mode activation in one
Safe transaction; switching mode alone cannot open an unguarded execution path.
Pauses and mode changes never replenish finite budgets.

## Public maintenance and custody

Accounting, earned-fee release and direct burns remain permissionless. The public
burn router skips market purchases in operator mode; it is never an operator
proxy. In permissionless mode it resumes eligible guarded market purchases.
Direct burns preserve pause semantics and do not consume market policy budgets.

ETH and canonical WETH share a denomination. Membership and donation accounting
remain separate. Reverts change no inventory, purchase clocks, budget, or sequence.
Mode changes and policy administration never grant a fee withdrawal path.

## Economic authority and evidence

Operator output bounds enforce the trusted operator's terms. Public rate bounds
enforce the Safe's terms. Neither is an independent fair-value oracle. Before
permissionless activation, review complete-route economics, including conversion
venues, and report protocol net loss and attacker net profit separately.

Production rates, sizes, optional expiry/budgets, and private submission capability
must be chosen explicitly. Local mock tests, fixture quote tolerances and historical
fork evidence are not production economic approval. This change requires a fresh
immutable deployment; mode transitions work on that replacement contract itself.
