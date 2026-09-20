# Guarded buyback execution settings

## Operator execution

The vault starts paused; its initial Pons module starts in `OperatorGuarded` (mode 0). The factory-owner Safe
appoints/revokes `operator` and manages mode and pause controls. A zero operator
revokes execution authority.

`vault.process(asset, bucket, amountIn, moduleRevision, deadline, data)` forwards the original caller to the active module, which restricts operator execution to its configured operator and mode. Pons data encodes `(0, route, minimumOutputs)`. Policy is entirely off-chain. The route and
all economic terms are calldata, not public-policy storage. Supply one positive
absolute minimum for each conversion pool and the final Pons purchase; do not
add an unwrap entry. Existing typed route validation, settlement and burn checks
remain. Operator execution does not depend on stored public routes or limits.

## Permissionless execution

`PermissionlessGuarded` (mode 1) retains
`vault.process(asset, bucket, amountIn, moduleRevision, deadline, data)` for public purchases; Pons data encodes `(assetPolicyRevision, emptyRoute, emptyMinima)`.
The Safe sets routes, `ExecutionLimits` (minimum/maximum input and per-asset
interval), global interval, and `setPermissionlessPolicy` for each canonical asset.

The policy records entry lifecycle, current asset revision, optional expiry and
budget, and positive numerator/denominator raw-unit output rates for every market
leg. Rate-derived output floors use each leg's actual input spent and round upward.
Operator minima remain absolute floors. Permissionless rates apply to actual input spent, rounded up. For a clamped final curve fill the full-offer rate floor is passed to Pons as its proportional price bound, then the module independently checks output against `ceil(actualSpent * numerator / denominator)`. Refunds do not consume budget. Native/WETH unwrap is exact 1:1.

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
preserving the global vault pause. Pons previews also report per-asset pauses; direct vault burns have no module policy dependency. The permanent vault has no withdrawal, upgrade or arbitrary-target call. Its delayed strategy replacement and optional permanent freeze are described below.

## Permanent buyback vault and replaceable strategy

`ProtocolBuybackVault` is the permanent fee destination, source-bucket ledger,
and mandatory burner. It stores no execution mode, operator, route, rate,
budget, cooldown or Pons lifecycle. It calls one `IBuybackModule` normally,
never by delegatecall. The vault transfers at most the requested available input,
measures refunds and acquired protocol tokens, checks unchanged supply before
burning exactly the acquisition, and preserves input/token/declared-asset
baselines. No successful processing call can end in treasury accumulation or
liquidity provision. Existing protocol-token inventory can be burned directly
by anyone while the vault is unpaused; that path has no market-price policy.

Modules have full economic authority over exposed inventory. A malicious module
can choose an adverse price and still satisfy the vault's nonzero acquisition
and burn checks. Undeclared intermediate assets, external dependencies, route
provenance and mutable module configuration require separate review. Proxy,
beacon, delegatecall-upgradeable and metamorphic modules are unsupported. The
vault records the active runtime hash and checks it on every processing call.

The factory-owner Safe controls replacement. `proposeBuybackModule(candidate)`
commits code hash and a fixed 48-hour timestamp; another proposal restarts that
delay. `cancelBuybackModule()` clears it. `activateBuybackModule()` requires the
delay and a paused vault, revalidates bindings/interface/hash, increments
`moduleRevision`, clears the proposal and **leaves buybacks paused**. Configure
and separately review the module before unpausing. Selecting an earlier module
uses this same process, with no fallback, registry or delay bypass.

`proposeModuleReplacementFreeze()` commits the current module/hash for seven
days. A freeze and replacement proposal cannot coexist. The Safe can call
`cancelModuleReplacementFreeze()` before finalization. After the delay,
`finalizeModuleReplacementFreeze()` requires paused buybacks and the unchanged
module/hash. It permanently disables every replacement path. This is irreversible:
a defective frozen module can strand buyback inventory. Global pause/unpause and
active-module processing remain available. Module-owned configuration,
authorities and dependencies are **not** frozen.

### Integration and initial module identity

Read `activeModule`, `activeModuleCodeHash` and `moduleRevision` from the vault at
one block. Validate runtime code plus module `vault`, `protocolToken`,
`interfaceVersion() == 1`, `moduleId()` and `moduleVersion()` before interpreting
its strategy-specific views. Unknown modules retain the vault custody API but
require a separately supported strategy interface. There is no universal vault
`processingStatus` or legacy `processOperator` selector.

The initial `PonsBuybackModule` has identifier `keccak256("BBF.PonsBuyback")`,
module version 1 and interface version 1. Token binding deploys it as vault
revision 1 with buybacks paused and `OperatorGuarded` mode. Its immutable token,
curve and venue dependencies are verified against
`contracts/external/verification/4663/sources.json` and the local deployment's
`protocol-graph.json`. Runtime hash is deployment-specific because immutable
bindings are embedded; record the actual hash from the vault and verification
evidence, never copy a historical address or hash.

The current Pons strategy binds the pinned native-ETH launch and standard launch
token, Universal Router, Permit2, WETH, V4 pool manager and associated Pons curve
and hook graph. Pons governance/dependency powers remain upstream trust surfaces.
The factory-owner Safe can change the module's operator, execution mode,
per-asset pauses, typed conversion routes, limits, global interval and
permissionless policies; those settings do not grant custody withdrawal powers.
Review status and tests are recorded in the release-candidate remediation plan;
local validation is not a completed independent public audit.

Call `vault.process(asset, bucket, amountIn, expectedModuleRevision, deadline,
data)`. For Pons v1, `data = abi.encode(policyRevision, TypedRoute, uint256[]
minimumOutputs)`; derive its types from generated `encodeExecutionData` ABI.
Operator mode uses revision 0, its supplied route and positive absolute per-leg
minima. Permissionless mode uses the current asset-policy revision and empty
route/minima, selecting stored terms inside the module. Module revision and
asset-policy revision are distinct. Reconcile emitted settlement events against
the module revision and measured receipt, rather than supply-delta telemetry alone.

Permissionless rates apply to each leg's actual spend and round upward. For a
closing Pons curve fill, the full-offer minimum is still passed as Pons's
proportional price constraint, followed by an independent
`received >= ceil(actualSpent * numerator / denominator)` check. Refunded input
stays in its original source bucket; only actual spend debits budget. Operator
minima always remain absolute. Zero permissionless budget means unlimited;
a finite exhausted budget never becomes unlimited. Zero maximum prepaid
membership periods likewise means unlimited.

### Safe transaction preparation

`contracts/scripts/manage-buybacks.sh forknet prepare ACTION --input input.json
--output payload.json` prepares and simulates only; it does not submit a public
transaction. Existing policy actions target the active Pons module; `pause` and
module governance target the vault. Governance actions are `module-propose`,
`module-cancel`, `module-activate`, `module-freeze-propose`,
`module-freeze-cancel`, and `module-freeze-finalize`. Each input includes exact
string values `expectedSafeNonceRaw` and `expectedModuleRevisionRaw`;
`module-propose` also includes `candidate`. Prepared review data includes code
commitments, pending timestamps, full economic authority and irreversible-freeze
warnings. Re-read, simulate and review before each Safe signature. The module is
not a module installed on the governance Safe.
