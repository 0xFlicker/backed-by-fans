---
date: 2026-09-17
status: operator-verification
source_report: backed-by-fans-pashov-ai-audit-report-20260917-104827.md
source_commit: 57826b7
scope: contracts release candidate
---

# Release Candidate Audit Remediation

## Purpose

This document records the disposition and remediation plan for the
[2026-09-17 release-candidate audit](../../backed-by-fans-pashov-ai-audit-report-20260917-104827.md)
at source commit `57826b7`.

The audit's bracketed values are confidence scores, not severities. This plan
assigns release priority independently, distinguishes supported Backed By Fans
paths from generic upstream Pons behavior, and does not treat every code smell
as a release blocker.

This document authorizes no deployment, Safe transaction, production policy
change, or public activation. A successful local verification run is not public
chain evidence.

The release must preserve the buyback vault as the permanent fee destination,
custody/accounting authority, and mandatory burner while moving buyback
authorization, policy, and venue execution behind one replaceable module. A
buyback module is a protocol contract called by the vault; it is not a module
enabled on the governance Safe.

## Disposition vocabulary

- **Required before RC:** change and verification required before approving the
  next core contract deployment.
- **Required before permissionless activation:** the OperatorGuarded release
  path remains usable, but the behavior must be corrected before the Safe can
  enable permissionless behavior in the active buyback module. The initial Pons
  module must include the correction so the release does not depend on an
  immediate post-deployment replacement.
- **Usability hardening:** bounded behavior that is safe today but should be
  improved for standards compatibility or predictable integration.
- **Risk accepted:** intended or bounded behavior whose mitigation would add
  more complexity than the demonstrated impact warrants.
- **Operational control:** enforced by supported assets, governance, deployment
  verification, or configured execution policy rather than a new code path.
- **Deferred hardening:** worthwhile defense in depth without a demonstrated
  release-blocking exploit.
- **Dismissed upstream:** unreachable under the native-ETH, standard Pons-token
  configuration supported by Backed By Fans. Reopen if that boundary changes.
- **Rejected:** the claimed defect does not hold after validating the arithmetic
  or execution path.

## Release decision summary

| Item | Disposition | Release priority |
| --- | --- | --- |
| F1: permanent self-referral | Reject newly locked self-referrals in the contracts | Required before RC |
| Buyback extensibility and finality | Keep the burn-enforcing vault permanent; execute through one Safe-replaceable full-strategy module whose replacement authority can later be destroyed | Required before RC |
| F2: permissionless final curve fill | Apply the configured rate to actual spend in the initial Pons module; retain absolute operator minima | Required before RC and permissionless activation |
| F3: zero-budget ERC-5643 renewal | Give fixed-signature ERC-5643 adapters a named 25-step best-effort budget | Usability hardening before RC |
| L09: zero-budget ERC-5643 cancellation | Use the same named adapter budget as renewal | Usability hardening before RC |
| L24: Q192 fit shortcut | Remove from remediation scope; the shortcut is mathematically correct | Rejected |
| Remaining leads | Accept, control operationally, defer, or dismiss as specified below | Non-blocking unless a listed acceptance test disproves the current boundary |

## Workstream 1: prevent newly locked self-referrals

### Decision

Reject a nonzero referral choice equal to the paying member when the position's
referral state is still `Unset`. Do not silently convert the choice to
`LockedNone`: a revert makes the rejected economic choice visible before the
payment is taken.

The check belongs in the contract. The first-party frontend is not a security
boundary, and direct contract callers must receive the same result.

The restriction applies only while locking the initial referral. It must not
make a transferred position unrenewable merely because its new owner happens
to equal the already-locked referrer.

### Implementation boundary

- Add a specific custom error for a newly attempted self-referral.
- Validate the payer/recipient against `referralChoice` only when the stored
  status is `Unset` and the choice is nonzero.
- Apply the rule to fixed-price purchases, fixed-price renewals of an Unset
  grant, and positive contribution payments.
- Preserve `LockedNone`, third-party referrals, gift semantics, zero-gross
  contributions, and immutable referral choices after the first positive
  owner payment.
- Do not add a compatibility path for self-referrals in the replacement
  deployment.

### Acceptance

1. A new fixed-price membership naming its buyer as referrer reverts before any
   payment, time, share, supply, or referral state changes.
2. A positive contribution naming its payer as referrer reverts atomically.
3. A granted position with `Unset` referral cannot make its first paid renewal
   self-referred.
4. Zero address and a distinct referrer retain their current behavior.
5. After a position with a third-party locked referrer transfers to that
   referrer, renewal remains possible with the already-locked choice.
6. Referral, creator, member, and protocol allocations still conserve the full
   gross payment in examples, fuzz tests, and invariants.

## Workstream 2: modular buyback execution and Pons graduation fills

### Decision

Keep `ProtocolBuybackVault` as the permanent fee destination and immutable
custody, settlement, and burn authority. Replace the permanently bound Pons
executor and vault-owned strategy policy with one active buyback module that the
Safe can replace through a delayed two-step process.

The vault remains deliberately unaware of whether the active module is
operator-controlled, permissionless, auction-based, RFQ-based, or uses Pons,
Uniswap, an aggregator, or another future venue. The module owns authorization,
economic policy, routing, limits, cooldowns, budgets, and venue integration.
The vault calls it normally and never uses `delegatecall`.

The initial module preserves two explicit minimum-output meanings:

- OperatorGuarded `minimumOutputs` remain absolute per-leg output floors.
- PermissionlessGuarded `OutputRate` values remain minimum exchange rates and
  apply to the actual input spent by each leg. This is equivalent to the current
  behavior for a full fill and remains correct for a partial fill or refund.

For the final bonding-curve leg, the Pons module still passes the full-offer
rate-derived minimum to the curve because Pons uses it as a proportional price
bound during a clamped partial fill. After the call, the module independently
requires:

```text
received >= ceil(actualSpent * numerator / denominator)
```

It must not scale or relax explicit operator minima. Conversion-pool legs and
post-graduation pool purchases retain their existing checks.

### Immutable vault boundary

The vault remains responsible for:

- authenticated fee receipt and permanent inventory custody;
- source-bucket accounting and a global emergency pause;
- the single active module address, its runtime code hash, and a monotonically
  increasing replacement revision;
- transferring no more than the requested available inventory to the active
  module during an authenticated settlement;
- measuring nonzero actual input spent and nonzero protocol tokens received
  rather than trusting module-reported totals;
- proving total supply is unchanged before settlement, then burning exactly the
  measured protocol-token acquisition in the same transaction; and
- rejecting settlement if input refunds, protocol-token balances, total supply,
  or the active module's input/protocol-token baselines disagree with measured
  results.

Every successful vault processing call ends in a protocol-token burn. The
module cannot select a different terminal output, recipient, or settlement
action and cannot ask the vault to retain rather than burn the acquisition.
Treasury accumulation, liquidity provision, or another terminal use requires a
different custody contract; it is never another mode of this vault.

The vault must not store or interpret execution mode, operator addresses,
routes, rates, budgets, cooldowns, Pons lifecycle, or other strategy policy. It
must not expose a generic arbitrary-target call, venue-specific decoding, a
module registry, or a vault-level module allowance/grant system.

### Buyback module boundary

Each module is an external contract bound to exactly one vault and protocol
token. The vault passes through the original caller, source bucket, input asset,
requested input, deadline, and opaque module data. The module owns:

- caller authorization and whether execution is operator-only or permissionless;
- routes, price protection, budgets, cooldowns, expiries, and other economic
  policy;
- readiness/preview views and keeper-facing execution parameters;
- venue and dependency validation, lifecycle discovery, and venue calls;
- calculating and returning unused input; and
- reporting normalized execution details for events and reconciliation.

The active module has full economic authority over the buyback inventory made
available to it. A malicious or badly configured module can execute at a highly
adverse price while still returning a nonzero protocol-token amount for the
vault to burn. That is an explicit governance trust assumption, not a guarantee
provided by the vault. Module selection therefore requires separate review of
the module's authorization, price bounds, routing, and mutable configuration.

The module cannot write vault storage, choose another active module, suppress
the burn, or keep newly transferred input or acquired protocol tokens after a
successful settlement. The vault can enforce baselines for input, protocol
token, and module-declared tracked assets; correctness for undeclared
intermediate assets and route provenance remains part of the module audit.

Use one versioned module interface with introspection for `vault`,
`protocolToken`, interface version, and module identifier/version. Proxy,
beacon, `delegatecall`-upgradeable, or metamorphic modules are outside the
supported model. The vault checks the active module's recorded runtime code hash
on every execution. Any configurable dependency or external governance surface
inside a module must be disclosed and reviewed separately.

### Module replacement

Retain the one-time factory binding of the protocol token. During that binding,
deploy and activate the corrected Pons module as revision 1 while buybacks stay
paused. Do not retain the assumption that this initial module is permanent.

Future replacement uses a fixed 48-hour delay:

1. The protocol authority calls `proposeBuybackModule`, committing the
   candidate address, runtime code hash, and activation timestamp.
2. Replacing a proposal restarts the delay; the protocol authority can cancel
   a pending proposal at any time.
3. After the delay, activation is allowed only while global buybacks are
   paused. The candidate must have code, match the committed runtime hash,
   implement the supported module interface, and report the expected vault and
   protocol token.
4. Activation increments `moduleRevision`, changes the single active module,
   clears the pending proposal, immediately removes the former module's
   authority, and leaves buybacks paused.
5. The Safe configures and reviews the replacement module through that module's
   own interface before explicitly unpausing the vault.

Do not add a multi-module registry, automatic fallback, emergency delay bypass,
or special rollback pointer. Re-selecting a prior module must use the same
proposal and activation process.

### Irreversible replacement freeze

The Safe may permanently destroy the vault's module-replacement capability once
the protocol is satisfied with the active strategy. Use an explicit two-step
freeze rather than renouncing ownership or assigning authority to a burn
address:

1. `proposeModuleReplacementFreeze` records the active module, its runtime code
   hash, and a fixed seven-day finalization timestamp. It is rejected while a
   module replacement is pending.
2. A pending freeze can be cancelled by the protocol authority before
   finalization. A module replacement cannot be proposed while a freeze proposal
   is pending.
3. `finalizeModuleReplacementFreeze` is allowed only after the delay, while the
   vault is globally paused, with no pending replacement, and while the active
   module address and runtime code hash still match the freeze proposal.
4. Finalization sets `moduleReplacementFrozen` permanently, clears the pending
   freeze, and emits the active module, code hash, and revision. There is no
   unfreeze, recovery authority, emergency bypass, or alternate replacement
   selector.
5. Every module proposal and activation path permanently reverts after the
   freeze. The active module continues to process buybacks after explicit
   unpause, and the Safe retains the vault's global pause authority.

This action freezes module selection only. It does not remove mutable operator,
route, permissionless-policy, or dependency authority implemented inside the
active module. If the protocol intends the complete strategy to become
immutable, those module-owned authorities must be independently finalized or
absent before freezing replacement.

After finalization, a defect in the active module can be stopped through the
global pause but cannot be repaired through this vault. Buyback inventory and
future tier fees may then remain permanently unusable for buybacks. The UI and
Safe transaction review must present that consequence explicitly.

### Pons module implementation boundary

- Carry the final permissionless `OutputRate` into the bonding-curve settlement
  check rather than inferring rate semantics from an absolute number after the
  call.
- Keep `reported == measured received`, nonzero spend/output, baseline balance,
  exact return, supply, accounting, and burn checks unchanged.
- Let the initial module's bonding-to-`GraduationPending` short-fill path accept
  `inputSpent < minInput` only after it has proven the actual spend rate.
- Debit vault inventory and any finite module-owned permissionless budget by
  actual spend. Return unused input to the original source bucket.
- Keep module cooldown updates and the vault burn event atomic with successful
  settlement.
- Do not add a caller-supplied exception, a special public minimum, duplicated
  Pons quote math, or a pre-quote that can become stale before execution.
- Remove obsolete executor-only interfaces and naming rather than maintaining a
  compatibility layer in the new release candidate.

### Acceptance

1. Protocol-token binding installs the corrected Pons module as revision 1 and
   leaves global buybacks paused.
2. The vault contains no execution mode, operator, route, rate, budget,
   cooldown, lifecycle, module grant, or venue-specific route storage.
3. The initial module independently proves its OperatorGuarded authorization and
   absolute minima and its PermissionlessGuarded routes, rates, budgets, and
   cooldowns.
4. A permissionless call offering more ETH than the final sellable curve amount
   spends only the required ETH, receives and burns the remaining launch tokens,
   returns the refund, and moves the Pons module to `GraduationPending`.
5. Inventory, module budget, emitted input, and booked legs use actual spend
   rather than the offered amount.
6. A final fill below the configured rate still reverts atomically.
7. An ordinary non-clamped bonding purchase retains the configured rate floor.
8. A post-graduation pool purchase retains its current minimum-output behavior.
9. OperatorGuarded execution with an absolute minimum above the clamped output
   still reverts; a separately reviewed compatible absolute minimum succeeds.
10. The burn router's `maxInput` path can complete the same final fill without a
   keeper-selected override.
11. Failure leaves vault inventory, module policy state, supply, balances, and
    lifecycle unchanged.
12. Proposal and activation reject the wrong authority, an unelapsed delay, an
    unpaused vault, absent code, a runtime code-hash mismatch, an unsupported
    interface, and a module bound to another vault or token.
13. Activating a test module with different authorization and route encoding
    increments the revision, removes the former module's authority, leaves the
    vault paused, and succeeds without changing vault strategy storage.
14. Fabricated acquired amounts, supply mutation before the burn, missing input
    refunds, or residual input/protocol-token balances revert the whole
    settlement.
15. A module cannot choose a different output or recipient, skip the burn, or
    leave acquired protocol tokens in the vault after successful settlement.
16. Freeze proposal/finalization reject the wrong authority, pending replacement,
    unelapsed seven-day delay, unpaused vault, changed active module, and runtime
    code-hash mismatch.
17. A pending freeze can be cancelled. A finalized freeze cannot be cancelled or
    bypassed through any module-replacement path, while global pause/unpause and
    the active module continue to operate.
18. Re-selecting a former module before finalization follows the same delayed
    replacement process. Replacement is impossible after finalization.

### Documentation correction

Update the buyback policy text that currently says every permissionless partial
fill retains a strict absolute floor. The replacement rule belongs to the
initial Pons module:

- an operator minimum is always absolute;
- a permissionless rate applies to each leg's actual spend, including a partial
  fill or refund; and
- later modules define and are separately reviewed for their own authorization,
  price protection, and routing semantics while the vault always enforces the
  terminal burn.

Audit leads L31 and L34 are seams of F2, not independent defects. The source
report's L31 reference to “Finding 3” is an ordering typo; it refers to F2.

## Workstream 3: make fixed ERC-5643 adapters best effort

### Decision

Introduce one named `ERC5643_ACCOUNTING_STEPS = 25` constant and use it for the
fixed-signature `renewSubscription` and `cancelSubscription` adapters.

This is a standards-compatibility improvement, not an unbounded catch-up and
not a guarantee that any backlog can be cleared inside the business action.
Custom Backed By Fans methods continue to accept a caller-selected accounting
budget, and the first-party application continues to use those richer methods.

### Safety boundary

- Accounting order and economic calculations do not change.
- The entire renewal or cancellation remains atomic.
- If more than 25 due checkpoints remain, the adapter reverts and all attempted
  accounting rolls back. Standalone `processAccounting` remains the resumable
  recovery path.
- The caller may pay for up to 25 unrelated tier checkpoints. This variable gas
  cost must be documented for generic ERC-5643 integrators.
- `isRenewable` remains a lifecycle/terms view, not a guarantee that the current
  backlog fits the adapter's fixed work budget.
- A paid gift whose referral is still `Unset` continues to require the custom
  renewal method because ERC-5643 has no referral-choice argument.

### Acceptance

1. `renewSubscription` succeeds with zero, one, and exactly 25 due mixed funding
   and expiration checkpoints.
2. With 26 due checkpoints it reverts atomically without taking payment or
   extending time; standalone maintenance followed by retry succeeds.
3. The contribution-tier ERC-5643 adapter uses the same budget and still permits
   only its existing one-period duration.
4. `cancelSubscription` has the equivalent 0/1/25/26 behavior and preserves the
   current-owner refund recipient.
5. Worst-case cold mixed-checkpoint renewal and cancellation remain within the
   Robinhood transaction limit with explicit gas assertions. Existing
   funding-only thresholds do not substitute for this combined measurement.
6. Feature 005 API, integration, quickstart, and application-flow documentation
   no longer claim that standard ERC-5643 calls always use a zero event budget.

## Lead disposition register

The numbering below follows the report's lead order. “Non-blocking” means the
audit did not establish a present exploit under the supported release model; it
does not mean the behavior should be forgotten if its assumptions change.

| ID | Lead | Disposition | Required action or retained boundary |
| --- | --- | --- | --- |
| L01 | Direct code-store reads trust runtime rather than provenance | Risk accepted | Registered media retains factory provenance. Direct hand-built configurations remain creator-selected and must not be presented as registry-authenticated. |
| L02 | PNG admission validates only an envelope | Deferred hardening | Treat admission as bounded format screening, not full PNG conformance. A stricter maintained decoder is optional if display conformance becomes a product guarantee. |
| L03 | Runtime payment-token admission accepts any contract with code | Operational control | The Safe enables only reviewed catalog assets. Retain exact-transfer checks and deployment evidence; adding arbitrary interface probes would not prove future token behavior. |
| L04 | Renderer validation rethrows unbounded revert data | Deferred hardening | Creator-selected renderer failure only griefs its caller. Consider bounded revert bubbling if a concrete gas failure is reproduced. |
| L05 | Renderer validation can reenter tier creation with another salt | Deferred hardening | No duplicate-salt bypass or theft was shown. Add a factory creation guard only if a cross-creation invariant is identified and tested. |
| L06 | Enabled payment tokens may later rebase or blacklist | Operational control | Enable only reviewed non-rebasing exact-transfer assets; pause or delist new tiers if behavior changes. Existing liabilities cannot be made safe by an admission-time probe. |
| L07 | Zero-gross tiers permit unlimited timed positions | Risk accepted | Free access is intentional. Attacker-funded creation and permissionless bounded maintenance remain the control. |
| L08 | Expired positions retain occupancy until maintenance | Risk accepted | Occupancy is deliberately released by chronological maintenance. Keep maintenance permissionless and available while paused. |
| L09 | ERC-5643 cancellation has zero-step catch-up | Folded into Workstream 3 | Use the same 25-step adapter constant and retain explicit maintenance for larger backlogs. |
| L10 | Settled-only claims may be stale | Risk accepted | These methods withdraw already-earned credit without promising current projection. Catch-up and later claims preserve the remainder. |
| L11 | Paid gifts may be incompatible with standard renewal | Documented limitation | ERC-5643 cannot supply an initial referral choice. Use `renewMembership` for an Unset paid gift and document that routing. |
| L12 | `isRenewable` omits accounting completeness | Folded into Workstream 3 | Document the view as lifecycle/terms eligibility. Simulation remains authoritative for transaction readiness. |
| L13 | `processExpirations` also advances funding | Risk accepted | Both public maintenance names intentionally drive one chronological coordinator; document the alias semantics. |
| L14 | Refunds preserve harvested weight and lifetime cursor | Risk accepted | Refunds cancel unearned funding, not historical rewards or early-support position. Preserve monotonic lifetime accounting. |
| L15 | Zero maximum prepaid periods means unlimited | Risk accepted | Retain zero-as-unlimited semantics and make administration/UI copy explicit. |
| L16 | Post-admission media validation does not reparse image | Risk accepted | Immutable bytes plus pinned code hash preserve admitted content. Reparse only if admission rules themselves become versioned or mutable. |
| L17 | Production rendering validates less than preview | Risk accepted | No same-codehash payload swap was shown. Keep preview as admission validation and production as immutable-content rendering. |
| L18 | Vendored PathKey permits identical currencies | Dismissed unused | BBF does not invoke the helper. Reassess only if route construction begins using it. |
| L19 | Stored-rate routing remains sandwich-sensitive | Operational control | OperatorGuarded is the initial module default. Permissionless activation inside that module requires reviewed caller-independent rates, sizes, routes, cooldowns, and budgets. |
| L20 | Large custom-pair quote arithmetic may overflow | Dismissed upstream | BBF requires native ETH for the protocol-token launch. Reopen before supporting custom Pons quote assets. |
| L21 | Pons sell trusts nominal launch-token receipt | Dismissed upstream | The pinned standard Pons token transfers exactly. Reopen for caller-selected or fee-on-transfer launch tokens. |
| L22 | Native escrow credit permits deposit reentry | Rejected as exploit | Claim reentry remains blocked and an additional deposit creates only additional backed credit. No double withdrawal was demonstrated. |
| L23 | Graduation leaves ERC-20 and Permit2 allowances | Deferred upstream hardening | No unprivileged pull path was shown. Track with upstream Pons; do not mutate the pinned snapshot solely for this release. |
| L24 | Q192 fit shortcut is wrong | Rejected | For `amount0 >= 2^192`, every uint256 `amount1` necessarily yields a Q192 quotient below `2^256`; `FullMath.mulDiv` therefore does not overflow. Current seeds are also capped at `int128.max`. |
| L25 | Snipe-tax terms omitted from economics digest | Dismissed upstream governance | Owner-controlled public-buyer tax changes are a Pons governance action. BBF must record the effective launch terms used by its deployment. |
| L26 | Creator recipient change redirects accrued value | Dismissed upstream governance | This is a timelocked Pons recovery power. Monitor and document recipient changes; no BBF contract change removes it. |
| L27 | Graduation trusts nominal launcher-token sweep output | Dismissed upstream | The pinned standard launch token cannot short-deliver. Reopen for alternate token implementations. |
| L28 | Launch authority depends on forwarder binding | Operational verification | Deployment verification must prove the configured forwarder and the exact caller/deployer binding used for the BBF launch. |
| L29 | Native and token hook payouts measure receipts differently | Dismissed upstream | BBF uses native ETH and no native undercredit path was demonstrated. Reopen for token quote assets. |
| L30 | Burn telemetry may include unrelated burns | Deferred hardening | Vault accounting and exact burn settlement remain authoritative. Consumers must not use router supply-delta telemetry as sole accounting proof. |
| L31 | Vault graduation exception is unreachable | Folded into Workstream 2 | Move the exception into the initial module's Pons lifecycle logic and require the actual-spend rate before accepting it. |
| L32 | Operator fills move cooldown state asymmetrically | Risk accepted | The operator is trusted timing/route authority in the initial module's OperatorGuarded mode. Permissionless state remains governed by that module's policy. |
| L33 | Operator mode accepts one-unit minima | Risk accepted | Explicit minima are operator-supplied economic authority. Wallet review, simulation, and private submission are operational requirements. |
| L34 | Ready status may describe a reverting final fill | Folded into Workstream 2 | The initial module owns readiness and execution semantics; add a module-status-to-router regression for the graduation boundary. |
| L35 | Zero permissionless budget means unlimited | Risk accepted | Preserve the initial module's documented zero-as-unlimited semantics; Safe review must display unlimited distinctly before activation. |
| L36 | Launch binding validates fewer hashes than execution | Operational verification | Module preflight remains fail-closed before spending. Deployment verification must prove the complete pinned graph, initial module runtime, dependency bindings, and relevant hashes. |
| L37 | Safe successor may expand signer set | Risk accepted | Signer composition belongs to Safe governance. Contract validation continues to require a canonical module-free Safe and valid threshold. |
| L38 | Preview harness is a public CREATE gadget | Risk accepted | The harness has no protocol authority or assets. Keep it out of authorization assumptions; add an initcode cap only if target-chain resource abuse is demonstrated. |
| L39 | Renderer registry admission is schema-only | Risk accepted | Renderers remain creator-selected and may fail. Registry inclusion is compatibility metadata, not a guarantee of perpetual output. |
| L40 | Reward quote relies on separate validation | Covered by invariant | Tier initialization validates the immutable curve before protocol calls can quote it. Direct library misuse is unsupported. |
| L41 | Text validation admits bidi controls/noncharacters | Deferred hardening | Treat as presentation/content integrity. Add an explicit text policy before changing immutable acceptance semantics. |
| L42 | Member-rate preview omits carry transitions | Risk accepted | Present previews as projections and use transaction simulation/canonical post-receipt reads for writes. Add differential coverage if UI copy claims exact future allocation. |
| L43 | Ledger-only status ignores expirations | Covered by wrapper | Production tier status combines funding and expiration queues. Direct linked-library status is not an integration surface. |
| L44 | Stored expiration narrows after addition | Covered by invariant | All production writers enforce the duration/timestamp capacity guard before storage. Retain boundary tests. |
| L45 | Direct library claim preview uses tier storage context | Dismissed unsupported call | The linked library is designed for delegatecall from a tier. Do not document direct library calls as supported. |
| L46 | Settled preview may report complete with due expirations | Risk accepted | No authorization relies on the settled flag. Consumers requiring current state must use the tier's expiration-aware status. |
| L47 | Refund preview may mix stale funding/expiration state | Deferred verification | Add differential backlog tests proving preview ceilings fail closed against execution. Fix only if a value-changing mismatch is reproduced. |
| L48 | Direct share quote accepts unvalidated curve terms | Covered by invariant | Protocol callers use initialization-validated immutable curve parameters. Direct arbitrary library inputs are unsupported. |

## Required documentation updates

- Amend Feature 005 tier API, application flows, quickstart, and plan language
  for the 25-step ERC-5643 adapter budget and its atomic >25 fallback.
- Amend protocol buyback architecture and policy language for the permanent
  burn-enforcing vault, single full-strategy module, delayed Safe replacement,
  optional irreversible replacement freeze, and initial module's actual-spend
  rate enforcement.
- Keep OperatorGuarded explicit minima described as absolute values.
- State explicitly that the vault does not understand operator or permissionless
  behavior; those authorization and economic rules belong to the active module.
- Document that module activation leaves the vault paused and that the Safe must
  separately configure and review the module before unpausing.
- Document that integrations read the active module identifier/version and use
  that module's readiness, preview, and opaque execution-data interface; the
  vault exposes custody and module identity rather than a universal strategy
  status API.
- Document each deployed module's identifier, version, runtime code hash,
  venue dependencies, supported route encoding, mutable configuration and
  governance surfaces, and audit status.
- Document that module selection grants full economic authority over exposed
  buyback inventory even though the vault still enforces receipt and burn of the
  protocol token.
- Document replacement-freeze proposal, cancellation, seven-day finalization,
  permanent effect, retained global pause, unaffected module-owned authorities,
  and the risk that a frozen defective module can strand buyback inventory.
- State that `isRenewable` is not a transaction-readiness or gas-feasibility
  quote.
- State that an Unset paid gift requires the custom renewal method to select its
  initial referral.
- Preserve zero-as-unlimited documentation for prepaid periods and
  permissionless buyback budgets.
- Record L24 as rejected so it is not carried into later remediation work as an
  unresolved upstream defect.

## Verification gates

### Focused contract evidence

- Referral tests covering new membership, contribution, grant renewal,
  transfer-to-referrer, allocations, and atomic rollback.
- Module/vault/router tests covering permissionless final fill, bad rate,
  operator absolute minimum, refund, inventory, budget, cooldown, lifecycle,
  supply, and burn accounting.
- Module-rotation tests covering bootstrap revision 1, proposal replacement and
  cancellation, the 48-hour boundary, authority, pause enforcement, runtime
  code commitments, interface/binding validation, explicit module
  configuration/unpause, former-module rejection, and rotation back to a prior
  module.
- Replacement-freeze tests covering proposal/cancellation, replacement/freeze
  mutual exclusion, the seven-day boundary, active-module and code-hash
  commitment, pause enforcement, permanent replacement rejection, retained
  processing, and retained global pause/unpause.
- Adversarial settlement tests covering fabricated acquired amounts,
  input/protocol-token residuals, premature supply changes, reentrancy, and
  atomic rollback across native and ERC-20 inputs.
- A test-only alternate module with different caller authorization and route
  encoding proving that the vault contains no execution-mode, Pons, or Uniswap
  policy dependency.
- ERC-5643 tests covering 0/1/25/26 mixed checkpoints, atomic rollback,
  standalone recovery, referral limitation, and cancellation recipient.
- Cold-gas assertions for 25-step mixed renewal and cancellation on the intended
  Robinhood profile.
- Existing fuzz and invariant suites with the new referral and final-fill
  boundaries included.

### Repository gates

Run from the repository root:

```sh
./scripts/verify-local.sh
```

The underlying contract gate remains:

```sh
cd contracts
./scripts/check-clean-room.sh
forge fmt --check src script test
forge build --sizes
forge test --code-size-limit 1000000 --gas-limit 1000000000 -vvv
forge test --match-path "test/deployment/*.t.sol" --code-size-limit 1000000 --gas-limit 1000000000 -vvv
forge test --match-path "test/e2e/LocalLifecycleEvidence.t.sol" --code-size-limit 1000000 --gas-limit 1000000000 -vvv
slither . --config-file slither.config.json --fail-high
```

Regenerate and verify web bindings for the new custom error and buyback module
interfaces:

```sh
cd web
bun run generate:check
bun run typecheck
bun run test
bun run build
```

## Implementation and retained verification

The working implementation removes the fixed executor and its selectors. The
permanent vault now calls `IBuybackModule`; the initial `PonsBuybackModule` owns
all strategy configuration. Generated bindings, keeper/admin/Safe tools,
deployment verification and browser callers use the new module boundary.
No production compatibility endpoint is retained.

| Workstream | Implemented evidence |
| --- | --- |
| F1 | `Referrals.t.sol` covers rejected initial self-referrals, grant renewal, zero-gross contributions, and renewal after transfer to the locked referrer. Both accounting and membership invariant handlers exercise rejection. |
| Module boundary | `BuybackModules.t.sol` covers delayed rotation, cancellation, interface/code commitments, alternate fixed-price authorization/encoding, irreversible freeze and retained processing/pause. Fault fuzzing checks atomic native/ERC-20 rollback for fabricated output, residual funds, supply mutation and reentrancy. |
| F2 / L31 / L34 | Pons module tests reject an insufficient actual-spend rate and preserve absolute operator minima. `PonsGraduationForkTest.test_routerFinalFillAppliesRateToActualSpendAndDebitsBudget` passes against the pinned real Pons graph, including router maxInput, refund, budget, cooldown and closing lifecycle. |
| F3 / L09 | All twelve 0/1/25/26 adapter cases pass. Measured cold 25-checkpoint gas: fixed renewal 3,264,002; contribution renewal 2,947,702; cancellation 3,251,569. Atomic failure and maintenance/retry preserve current-owner refund semantics. |
| Integration | Module identity is checked before strategy interpretation. Safe governance payloads include code commitments, delays and irreversible-freeze consequences. Operator simulations retain their private RPC, and receipts reconcile against module revision. |
| Documentation | Feature 005 adapter guidance, buyback interface/policy/architecture, integration guidance and whitepaper are updated. Historical audit reports and old evidence remain historical. The disposition register above classifies all F1–F3 and L01–L48, including rejected L24. |

The final full web unit run passed 813 tests across 115 files, including the
generated-selector regression and wallet-read changes; all 49 enabled
pinned-mainnet-fork contract tests passed. The separately gated Robinhood
testnet Safe test was not
part of that mainnet-origin run. A disposable Safe governance rehearsal is
provided in `web/scripts/module-governance-rehearsal.ts`; it restores its snapshot
before manual fixtures are seeded.

The complete contract run passed 604 tests (nine separately gated tests skipped).
After the final settlement change, all 90 affected buyback/router tests passed,
including the buyback invariants, and the 49 enabled pinned-fork tests passed
again. Slither 0.11.6 passed `--fail-high` with zero high findings; the remaining
40 medium, 61 low and 34 informational detector results are not a zero-warning
claim. Narrow annotations cover the non-reentrant, balance-checked settlement,
burn and wrapped-native call sites, rather than excluding a detector globally.

Independent Grok review identified a wrapped-native/native accounting alias in
the new settlement boundary. The fix always snapshots native custody and pins
declared raw wrapped-native custody to its opening balance. The new regression
covers both zero surplus and pre-existing unaccounted native surplus. A separate
core/integration review and a follow-up of this fix returned no actionable
findings. These were read-only reviews, not independent test executions.

The deployment-wrapper matrix, generated-binding check, formatter, linter,
production web build and typecheck passed. General browser acceptance passed 88
tests before an obsolete no-testnet-deployment assertion was corrected; the
entire 18-test homepage/brand suite then passed across desktop, tablet and phone.
The local fork CLI's 17 lifecycle/guard tests passed. The authentic browser
fixture now explicitly supplies the configured 0.1 gwei legacy gas price.

Authentic browser follow-up also corrected a wallet-client query that could
remain failed after switching from the wrong network. Wallet RPC reads now wait
for the selected network, and the real wagmi/viem network-switch browser case
passes. The 26 membership component tests, final typecheck, lint and formatting
checks pass. Browser fixtures now respect self-referral rejection and automatic
retirement rather than expecting obsolete positions or checkpoint state.

Retained logs and reviews are under
`artifacts/protocol-fork/rc-remediation-20260917-02/verification/`.
The first fresh-fork preflight attempt is retained as run `-01`; it exposed an
accidental rename of the external Pons `graduationExecutor` selector. Restoring
that selector and adding the generated-ABI check allowed run `-02` to pass.
Run `-02` verifies and retains the current linked runtime/dependency graph in
`protocol-graph.json`. The Safe replacement/freeze rehearsal passes and restores
its snapshot before manual fixtures are seeded.

These working-tree results do not authorize public deployment or public Safe
execution. The full clean-checkout verification of an exact candidate commit
remains a release closure requirement; split working-tree checks do not replace
that requirement. Operator handoff evidence follows.

## Operator verification handoff

Run `rc-remediation-20260917-02` is running for manual operator verification.
The origin is Robinhood mainnet block 58,083,838; the disposable execution chain
is 31337. No public transactions were sent.

- Web: `http://localhost:3110/chains/31337/protocol`
- Operator controls: `http://localhost:3110/chains/31337/tools/buybacks`
- RPC: `http://127.0.0.1:18557`
- First wallet: `0x467172992E0aBa58411d14eC8b174167B0e359a6`
- Second wallet: `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`

Each wallet has four real local-fork memberships (three USDG and one WETH),
1,000 USDG, 1 WETH and approximately 10 ETH remaining. Their combined first-month
protocol allocation is 300 USDG plus 0.02 WETH, vesting over membership time.
The second wallet is the configured operator and an owner of the threshold-one
Safe. The module remains OperatorGuarded, revision 1, unpaused, with replacement
unfrozen. Automated mutation tests and snapshot restores finished before this
seed; manual review state is retained.

All 64 authentic desktop browser cases have a passing retained result across
the original run and focused reruns. `browser-acceptance.json` maps each case to
its latest report; this is not a single uninterrupted green browser run.
The Safe rehearsal retains nine successful receipts, four exact delay checks,
six expected custom-error rejections, and verified restoration in
`module-governance-rehearsal.json`.

All nine deployment receipts succeeded. The largest exact signed transaction
was 69,656 bytes and the largest receipt used 20,146,929 gas; see
`deployment-measurements.json`. These are local rehearsal measurements.
`operator-readiness.json` records actual wallet balances, all eight owners,
Safe authority, mode, revision and module runtime commitment.
`operator-browser.json` and `operator-*.png` retain the loaded live payment flow,
fee balances, operator address and governance identity, with no page errors.
`handoff-source.json` fingerprints the final uncommitted source tree.

All handoff files are under
`artifacts/protocol-fork/rc-remediation-20260917-02/`. Human operator approval
and the clean-checkout candidate-commit gate remain outstanding.

## Release closure

The remediation is complete only when:

1. Workstreams 1-3 are implemented and their focused acceptance cases pass.
2. The repository verification gate passes from a clean checkout of the exact
   candidate commit.
3. The report-to-remediation matrix has no unclassified finding or lead.
4. Generated bindings, specifications, integration guidance, and the whitepaper
   describe the deployed selectors and semantics consistently.
5. Deployment rehearsal proves the immutable core graph, native-ETH Pons
   binding, standard launch token, linked library addresses, initial Pons module
   revision/runtime/dependency commitments, 48-hour replacement boundary,
   seven-day irreversible-freeze boundary, and constructor or initializer terms
   for the exact candidate.
6. A separate review confirms the final diff. Local success alone does not
   approve a broadcast, Safe execution, permissionless activation, or mainnet
   rollout.
