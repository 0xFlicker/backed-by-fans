# Feature Specification: Protocol Buyback and Burn With Safe Administration

**Current implementation (2026-09-08):** [Standing permissionless buybacks](operating-model-proposal.md)
replaces recurring approvals and delegated price signing with standing time/size
controls and an admin calculator. The replacement is implemented and has fresh-fork
execution evidence and passing final source checks; the clean personal-wallet
handoff is being completed. See [current evidence](standing-buybacks-evidence.md).
The original requirements and acceptance below are retained as history; their
expiring-policy details do not govern this replacement. No further price-protection
approval, oracle or required price-signing service is part of the approved scope.


**Feature Branch**: `codex/003-protocol-buyback-burn`

**Created**: 2026-09-07

**Status**: Standing replacement implemented and checks passed; personal-wallet handoff pending. Historical specification follows.

**Input**: Replace the fixed 1% protocol fee paid to a protocol recipient with a creator-selected
1%–100% membership allocation reserved at payment, earned continuously as paid membership time is
consumed, and then dedicated to purchasing and burning one Backed By Fans protocol token. Launch that token against ETH on Robinhood Chain, with initial developer holdings obtained
only through a funded launch purchase. Enable Pons vested trading-fee buybacks and allow developer
trading-fee income and earned vested tokens. Deliver an open protocol with a protocol Safe for
payment-token onboarding and post-launch buyback configuration, retain multi-token membership
payments for mainnet, and make the
implementation milestone a working complete test environment, using a short-lived mainnet fork if
no faithful working launchpad testnet can be found or copied. Emphasize automated protocol and
browser verification.

**Scope replacement**: For the new protocol version, this specification supersedes the fixed
protocol fee, discretionary protocol fee payouts and USDG-only mainnet policy in the current implementation and feature 002. Existing membership rights,
reward/referral accounting, gross refund entitlements, creator ownership and artwork behavior remain
requirements. Unearned protocol reserves now fund refunds first, before creator proceeds or owner top-up.
Implementation replaces the obsolete paths; this feature does not require compatibility layers or
migration of old deployments. Retain Safe-controlled payment-token onboarding and post-launch
configuration. Protocol-token DAO governance is a possible future direction and is out of scope.

**Delivery boundary**: The requested output of this phase is a specification. Its implementation
must deliver the complete running test environment and retained evidence, not merely interfaces,
mocks, a token launch, or a fee-routing demonstration. Public deployment is a separate milestone.

## Clarifications

### Session 2026-09-07

- Q: Can a creator change the protocol allocation after publication? → A: No. Fix it when publishing,
  like the existing reward and referral splits.
- Q: What administration remains at launch? → A: Retain a protocol Safe to onboard payment tokens
  and configure buybacks after launch. This supersedes the earlier no-Backed-By-Fans-admin decision.
  Disclose both Safe authority and external launchpad powers. A future token-governed DAO is out of
  scope; holding the protocol token grants no governance authority in this version.
- The user clarified two separate fee flows. **Backed By Fans membership fees buy the protocol token
  on the curve during bonding and on the pool after graduation, then burn the purchased tokens.**
  Those tokens never need to enter Pons's vesting vault. Pons's separate trading-fee buyback and
  vesting mechanism does not constrain this flow. Ordinary launchpad trading fees still apply to
  Backed By Fans purchases.
- Q: Should Pons vested buybacks be enabled and the developer receive token-trading income? → A:
  Yes. Enable vested buybacks at launch. The developer receives the remaining creator trading-fee
  revenue and the creator's earned vested tokens. This supersedes the earlier prohibition on
  developer trading-fee income and vesting entitlements; initial holdings still come from purchases.
  Membership-fee inventory remains dedicated to direct burns net of ordinary trading costs.
- The additional creator trading tax remains at the existing zero default; enabling vested buybacks
  uses the standard trading-fee share and does not authorize adding a new tax. Pons's external
  beneficiary and buyback controls do not grant authority over Backed By Fans membership-fee custody.
- Q: Should this feature include a custom administration screen for onboarding payment tokens and
  configuring buybacks? → A: No. Use documented Safe transactions and scripts; public configuration
  remains visible in the app.

- Q: Should prepaid protocol fees become buyback funds upfront or as membership time is consumed?
  → A: Earn them continuously as paid membership time is consumed and execute buybacks periodically.
  Keep unearned fees reserved for unused-time refunds. This supersedes upfront protocol-fee release
  and the earlier requirement for creators to fund the entire unused-time refund at 100% allocation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish a Membership With a Chosen Protocol Allocation (Priority: P1)

A creator chooses a Safe-enabled payment token and a permanent allocation of each payment to protocol-token
buyback and burn. The studio explains how much remains for the creator, supporters and referrals
before publication. Creators and supporters require no individual approval from Backed By Fans or
ownership of its protocol token; payment-token onboarding requires the protocol Safe.

**Why this priority**: This establishes the creator's economic choice and the source of burn funds.

**Independent Test**: Publish tiers with 1%, an intermediate percentage and 100% allocations;
inspect their terms and independent expected payment splits. Attempt invalid splits and later edits.

**Acceptance Scenarios**:

1. **Given** a compatible, Safe-enabled payment token, **When** a creator publishes a valid tier, **Then** the
   selected token and all allocation rates become permanent, visible terms.
2. **Given** a rate below 1%, above 100%, or a combined protocol/reward/referral rate above 100%,
   **When** publication is attempted, **Then** it fails clearly without creating a tier.
3. **Given** a 100% protocol allocation with zero rewards and referrals, **When** a supporter pays,
   **Then** the entire gross payment becomes a protected protocol-fee reserve, the creator receives
   zero proceeds, and the supporter receives all purchased membership time immediately. Only the
   earned portion becomes available for buyback as paid time is consumed.
4. **Given** a published tier, **When** its creator, a successor owner or any other actor attempts
   to change its economic allocation, **Then** the attempt fails and its terms remain unchanged.
5. **Given** a Safe-enabled token absent from the website's suggested list, **When** a creator
   selects it by its chain-specific identity, **Then** creation remains available. An unapproved or
   disabled token cannot be used for a new tier; the interface explains its onboarding status.
6. **Given** an existing tier, **When** the Safe disables its token for new tiers, **Then** its
   stored asset and terms remain unchanged and otherwise valid payments, claims and refunds continue.

---

### User Story 2 - Use Memberships Without Depending on a Buyback (Priority: P1)

Supporters join, renew, contribute and gift in the tier's token. Creators and supporters retain the
existing claim, refund and membership lifecycle. Buyback timing does not determine membership access.

**Why this priority**: A launchpad outage or illiquid market must not turn a completed payment into
an unusable membership or make other people's balances available for speculative spending.

**Independent Test**: Run paid and free membership journeys with buyback processing stopped, then
resume it and reconcile every allocation, claim, refund and remaining balance.

**Acceptance Scenarios**:

1. **Given** the payment asset can transfer exactly but its conversion market is unavailable,
   **When** a supporter pays, **Then** membership settlement succeeds and its protocol allocation
   is reserved and accrues over paid time. Earned fees wait for safe execution rather than being
   falsely reported burned.
2. **Given** a zero-gross membership action, **When** it completes, **Then** it creates no protocol
   fee; positive payments use the published allocation and documented unit rounding.
3. **Given** an existing Stock Token tier, **When** its display multiplier changes, **Then** visible
   amounts update while raw settlement amounts, pending fees and existing liabilities do not.
4. **Given** protocol tokens have already been bought and burned, **When** a creator refunds unused
   paid time, **Then** the existing gross-refund amount is funded first from that membership's
   unearned protocol reserve, then creator proceeds, then a bounded owner top-up. Already earned
   fees and supporter/referral reserves are not reclaimed; cancellation stops future fee accrual.
5. **Given** a 100% allocation tier with no creator proceeds, **When** a refundable payment is
   reversed, **Then** its unearned protocol reserve covers the unused-time gross refund without an
   owner top-up. Failure to deliver the refund restores membership and accounting atomically.
6. **Given** a 120-token payment for 12 equal periods at a 10% protocol allocation, **When** three
   periods have elapsed, **Then** 3 tokens are earned and 9 remain reserved. Cancellation refunds
   90 tokens, using 9 from protocol reserves and the remaining 81 from creator proceeds/top-up.
7. **Given** no collector has run, **When** paid time elapses or a refund is requested midway through
   a period, **Then** fee entitlement is computed from consumed paid time, independent of execution
   timing. Complimentary time produces no fee; grants do not accelerate fee accrual.

---

### User Story 3 - Turn Membership Fees Into Verifiable Burns (Priority: P1)

Anyone can checkpoint and release earned fees in bounded batches, then trigger processing of
eligible accumulated fees. Unearned reserves remain protected inside membership tiers. The system buys only the designated
protocol token and destroys the actual tokens received, with no discretionary payout recipient.
A public automation runner performs the same actions when it has gas and the trading conditions
meet the protocol's spending rules.

**Why this priority**: This is the replacement for the old protocol fee withdrawal mechanism.

**Independent Test**: Starting with recorded fee balances, use two ordinary callers to process
fees, including before graduation, and independently reconcile assets spent, unused inputs and
protocol-token supply reduction.

**Acceptance Scenarios**:

1. **Given** executable fees while the token is bonding, **When** processing succeeds, **Then** a
   curve purchase is followed by destruction of the actual received tokens in the same settlement.
2. **Given** executable fees after graduation, **When** processing succeeds, **Then** the verified
   pool supplies the purchased tokens and the burn reduces outstanding supply by the received amount.
3. **Given** a membership paid in the protocol token itself, **When** its protocol allocation is
   processed, **Then** only its earned, released allocation is burned directly without selling and
   repurchasing it; unearned protocol-token reserves remain available for refunds.
4. **Given** missing liquidity, insufficient price evidence, a failed burn or an unsafe execution,
   **When** processing is attempted, **Then** no fee inventory is lost or falsely reported burned.
   Other assets and membership operations remain independently usable.
5. **Given** an arbitrary caller proposes an incorrect token, recipient, venue or permissive price,
   **When** it attempts to spend accumulated fees, **Then** the protocol refuses the invalid action.
6. **Given** several callers act on the same inventory, **When** their transactions settle,
   **Then** only available funds are spent and no purchase or burn is counted twice.

---

### User Story 4 - Launch With Purchased Holdings and Earn Trading Revenue (Priority: P1)

The launch establishes a single publicly identifiable protocol token paired with ETH. The deployer
may contribute a disclosed ETH amount to buy at launch. There is no separate premine or free project
allocation. Pons vested buybacks are enabled: the developer can earn the creator's remaining ETH
trading fees and tokens released from the creator's vest, without controlling membership-fee funds.

**Why this priority**: The fee destination and supply model must exist before paid memberships
begin using this protocol version.

**Independent Test**: Execute a fresh launch through the selected launchpad in the authentic test
environment. Reconcile initial supply, liquidity/curve inventory, developer purchase and both fee
flows. Generate trading fees during bonding and after graduation, then verify vest deposits,
time-based release, recipient shares and claims separately from membership-funded burns.

**Acceptance Scenarios**:

1. **Given** a verified ETH launch configuration, **When** launch and any funded initial purchase
   complete, **Then** the deployment record identifies the token, initial supply distribution,
   launch costs, ETH spent and tokens actually acquired by the developer.
2. **Given** the launched token, **When** project-held balances and authorities are inspected,
   **Then** initial developer holdings originate solely from the funded purchase; no project
   premine, free allocation or post-launch mint authority exists. Later tokens earned through
   Pons trading-fee vesting are identified separately from the initial purchase.
3. **Given** launchpad creator proceeds attributable to the protocol token, **When** they are
   distributable, **Then** eligible Pons buybacks deposit the acquired tokens into its vesting
   vault under the deployed rules, including any native fallback to creator revenue when an internal
   buyback cannot execute. The developer's designated creator recipient can claim ETH revenue and
   earned vested tokens. Neither entitlement provides access to membership-fee inventory.
4. **Given** launch or token binding has not completed, **When** someone attempts to collect
   membership fees under this version, **Then** collection cannot start against an unset, arbitrary
   or replaceable protocol token.
5. **Given** trading fees have funded a vest, **When** time passes and an authorized beneficiary
   releases tokens, **Then** both beneficiary shares and claims reconcile to the launch's recorded
   terms. Additional buybacks preserve already vested amounts and update the remaining schedule;
   locked, released and claimed tokens are never reported as membership-fee burns.
6. **Given** membership-funded purchases incur standard Pons trading fees, **When** those fees
   generate developer revenue or vested tokens, **Then** they are disclosed as venue costs and
   trading compensation, without fabricating additional membership revenue or burn amounts.

---

### User Story 5 - Continue Through Graduation and External Failures (Priority: P1)

Memberships operate during bonding, while graduation is pending, and after the pool is established.
Under the configured integration, fee processing follows the actual lifecycle without a routine
Safe transaction to switch markets. The Safe can repair approved routes when necessary. External
launchpad restrictions are visible and confined to the actions they affect.

**Why this priority**: Graduation is part of normal protocol operation, including partial fills
and retryable failures; it cannot be deferred beyond the implementation milestone.

**Independent Test**: Drive a fresh launch through bonding, a threshold-crossing purchase, a failed
or delayed graduation, public recovery and pool trading, while continuing membership payments.

**Acceptance Scenarios**:

1. **Given** a purchase consumes the curve's final sellable tokens, **When** the launchpad fills
   only part of the budget, **Then** unused input remains dedicated burn inventory, only received
   tokens burn, and subsequent processing uses refreshed lifecycle state.
2. **Given** the curve is closed and the pool is not yet tradable, **When** memberships are used,
   **Then** payments and rights continue while buybacks wait visibly; any supported graduation
   recovery remains callable without a Backed By Fans owner.
3. **Given** successful graduation, **When** pending fees become executable again, **Then** an
   ordinary caller processes them through the actual destination pool without an admin route change.
4. **Given** external creator-fee harvesting needs a launchpad operator that is unavailable,
   **When** Backed By Fans membership fees are processed, **Then** that independent fee flow still
   works and the external unswept amount is identified separately.
5. **Given** an external administrator changes something it controls, **When** affected state is
   observed, **Then** the product reports the real dependency and resulting restriction rather than
   claiming that the external system is ownerless or silently redirecting Backed By Fans inventory.

---

### User Story 6 - Administer Configuration Through the Protocol Safe (Priority: P1)

The protocol Safe onboards payment assets, configures buyback routes and execution limits, and
pauses or resumes buyback processing. Creators, supporters and third-party operators can use the
configured protocol without the original website or automation runner. Public records make the
Safe's powers and changes visible. Further onboarding or repairs require available Safe signers.
Operators use documented Safe transactions and scripts; a custom administration screen is out of
scope. The app exposes the current configuration and change history for public inspection.

**Why this priority**: Launch operations need accountable administration without making every
membership or burn require an administrator signature.

**Independent Test**: Execute authorized configuration changes through a test Safe, reject
unauthorized attempts, and verify existing membership terms and burn-only custody remain intact.
Stop the original runner and use an independent funded account to process eligible fees.

**Acceptance Scenarios**:

1. **Given** the original runner is stopped or out of gas, **When** another funded ordinary caller
   takes over, **Then** it resumes eligible processing without a permission update or custody key.
2. **Given** no caller funds execution, **When** time passes, **Then** fees remain pending and the
   product does not imply transactions occurred autonomously without gas.
3. **Given** recorded payments and burns, **When** a person inspects protocol activity, **Then**
   allocated reserves, earned fees awaiting release, released pending inventory, refund contributions,
   conversion costs, tokens purchased and tokens destroyed are
   distinguishable and attributable to their assets and confirmed transactions.
4. **Given** the original website is offline, **When** an independent integrator uses the published
   protocol interfaces, **Then** core creation, membership, claims and fee-processing actions remain
   available subject to active Safe configuration, the underlying network and asset behavior.
5. **Given** a compatible asset and validated route, **When** the Safe enables them and sets valid
   execution limits, **Then** creators can publish tiers and ordinary callers can process eligible
   fees; the same changes from an unauthorized account fail.
6. **Given** pending fees, **When** the Safe pauses buybacks or removes their route, **Then** fees
   stay pending and memberships continue. A valid replacement route and resumed processing let an
   ordinary caller buy and burn the pending inventory.
7. **Given** Safe authority, **When** it attempts to rewrite published tier economics, change the
   protocol token, withdraw membership fees, or exceed enforced safety bounds, **Then** the attempt
   fails. Valid configuration changes and their effective state are publicly inspectable.

---

### User Story 7 - Reproduce the Complete Product in a Disposable Environment (Priority: P1)

A contributor starts a working test environment, exercises the complete product in the browser and
through automated protocol tests, and retains evidence after the environment expires.

**Why this priority**: A coherent specification must lead to the requested working forknet product,
including the external integrations that a mock cannot establish.

**Independent Test**: Reproduce two clean runs from the documented environment origin and compare
membership accounting, lifecycle transitions and burn outcomes.

**Acceptance Scenarios**:

1. **Given** no complete working launchpad testnet can be located or faithfully copied, **When**
   implementation verification starts, **Then** it uses a short-lived mainnet fork with a recorded
   origin and authentic launchpad/exchange behavior.
2. **Given** the running environment, **When** automated creator, supporter and fee-processing
   journeys run, **Then** they cover fresh launch, bonding, graduation, pool trading, multi-token
   payments, claims, refunds and actual burns against the same deployed protocol.
3. **Given** a failure can only be induced by altering external state, **When** it is tested,
   **Then** that evidence is labeled fault injection and kept distinct from the authentic run.
4. **Given** the environment expires, **When** a contributor follows the reproduction instructions,
   **Then** the required outcomes can be demonstrated again without a mainnet transaction or key.

### Edge Cases

- A 100% protocol rate is combined with a nonzero reward/referral rate, or small raw amounts round a
  nominal 1% allocation to zero. The rate minimum and unit rounding are different concepts.
- Refund and collection race at the same timestamp, including after an earned fee has already burned.
  Neither ordering may spend unearned reserves or change the gross refund and protocol contribution.
- Repeated tiny checkpoints, partial-period rounding, many queued renewals, different contribution
  amounts, complimentary time, expiry, credential synchronization and cancel/rejoin must not reset,
  duplicate or prematurely earn protocol fees.
- A token is illiquid, frozen, upgradeable, rebasing, taxed on transfer, malicious, falsely named,
  nonstandard in precision, or changes behavior after tier creation.
- The Safe disables a token after tier creation, pauses buybacks with pending fees, replaces a route
  while a caller has prepared a transaction, or becomes unavailable during a required repair.
- A Stock Token multiplier changes while a user reviews a payment or while fees wait for conversion.
- Only one conversion leg has valid liquidity or pricing; a protocol-token quote is stale; the new
  curve has insufficient history; a caller manipulates a spot market before triggering a purchase.
- A large buy reaches the curve limit, returns unused ETH, or triggers graduation inside settlement.
- The curve closes before the pool is usable, pool creation fails, or an external dependency changes.
- A malicious token callback or route attempts to spend another asset, retain an approval, reenter
  processing, impersonate the protocol token, or claim a burn without reducing supply.
- Direct donations, transfer rounding, execution dust and refunds must not masquerade as new fees
  or give anyone a general withdrawal right.
- An automation runner stops, loses connectivity, runs out of gas or competes with another caller;
  successful membership receipts must remain distinct from pending buybacks.
- Launchpad trading fees and creator proceeds are mistaken for Backed By Fans membership fees,
  or Pons's own vested buybacks are mistakenly included in Backed By Fans burn totals.

## Requirements *(mandatory)*

### Functional Requirements

#### Creator economics and membership continuity

- **FR-001**: Anyone MUST be able to create a tier using a Safe-enabled payment token or use
  memberships without individual approval or protocol-token ownership, subject to published terms
  and asset behavior.
- **FR-002**: The protocol Safe MUST control an inspectable payment-token list under publicly
  documented compatibility rules. Only enabled tokens MAY be used for new tiers. Disabling a token
  MUST NOT alter existing tiers or block their otherwise valid payments, claims or refunds. Website
  suggestions MUST reflect, not replace, onchain eligibility. Multi-token mainnet support MUST
  include onboarding compatible Stock Tokens; onboarding does not guarantee executable buybacks.
- **FR-003**: Each tier MUST permanently bind its payment token and protocol allocation on
  publication. The protocol allocation MUST default to 1%, permit 1%–100% inclusive in increments
  of 0.01 percentage points, and be immutable after publication and ownership transfer.
- **FR-004**: The combined protocol, reward and referral rates MUST NOT exceed 100% of gross.
  Protocol/reward/applicable-referral amounts MUST each round down to the payment token's smallest
  raw unit; the remainder, including an unused referral allocation, MUST be creator proceeds.
  Thus a tiny payment can produce a zero fee despite a valid 1% rate. Zero gross MUST produce no fee.
- **FR-005**: A 100% protocol tier MUST have zero reward and referral rates and reserve exactly
  its entire positive gross for time-earned protocol fees. Publication and checkout MUST show zero
  creator proceeds, continuous earning and reserved unused-time refund backing. Unearned fees MUST
  cover the unused-time gross refund at 100%, subject to the asset remaining transferable.
- **FR-006**: Paid joins, renewals, gifts and contributions MUST apply the same allocation rules.
  Existing membership time, rewards, referrals, grants, ownership, artwork and expiration behavior
  MUST remain correct. Refunds MUST retain the existing gross-refund entitlement and bounded owner
  top-up, using that membership's unearned protocol reserve first, then creator proceeds, then owner
  funding. Earned protocol fees and reward/referral liabilities MUST NOT be clawed back.
- **FR-007**: Payments, claims and refunds MUST use exact raw token amounts and maintain separate
  accounting by asset. Stock Token display scaling MUST NOT alter settlement or stored liabilities.
  Inexact or failed required transfers MUST revert the affected operation without partial accounting.
- **FR-008**: Successful membership settlement MUST allocate its fee independently of later market
  execution. The allocation MUST initially remain protected in the tier and earn over consumed paid
  time; settlement MUST NOT transfer unearned fees to buyback inventory. Unavailable collection or
  buybacks MUST NOT invalidate purchased rights or block otherwise valid membership operations.

#### Fee custody, execution and destruction

- **FR-009**: A publicly identified protocol Safe MUST be the sole Backed By Fans configuration
  authority for payment-token onboarding, buyback routes, bounded execution settings and buyback
  pause/resume. There MUST be no residual deployer authority or separate privileged runner. Safe
  administration MUST NOT grant discretionary fee payouts or control over published tier economics.
  Pons trading/vesting entitlements alone MUST NOT confer Backed By Fans administration rights.
- **FR-010**: The deployment MUST permanently identify one protocol token and the exclusive
  buyback-and-burn purpose for earned fees before it accepts payments. No actor MAY later replace that
  token or redirect earned fees to another purpose or introduce an arbitrary withdrawal/call path. Safe
  route changes MAY change how pending inventory reaches that token, subject to the same custody,
  execution and burn invariants. This scope does not introduce general contract upgrade authority.
- **FR-011**: Earned protocol fees MUST be dedicated entirely to acquiring and burning that token,
  net only of unavoidable, visible conversion/venue trading costs. Execution gas MUST be funded
  separately by callers or voluntary sponsors; there MUST be no direct developer allocation, keeper
  bounty, treasury allocation or gas reimbursement from membership-fee inventory. Ordinary Pons
  trading costs on these purchases MAY generate developer trading revenue and vested tokens under
  FR-023; this economic connection MUST be disclosed rather than claiming no value reaches the developer.
- **FR-012**: Processing MUST be publicly callable and automatically exercised by a replaceable
  gas-funded runner under active Safe configuration. Routine processing MUST NOT require a Safe
  signature or exclusive automation provider. Liveness claims MUST state the prerequisites of gas,
  enabled processing, an approved executable route, available liquidity and admissible pricing.
  Onboarding and configuration repairs depend on the Safe's availability.
- **FR-013**: Eligible non-protocol assets MUST be convertible into purchases of the designated
  token, using the bonding curve before graduation and the verified pool after graduation. An
  earned allocation released in the protocol token MUST be eligible for direct burning. Unearned
  protocol-token allocations MUST follow the same reserved-refund rules as other payment assets.
- **FR-014**: A successful processing settlement MUST destroy every protocol token acquired by
  that settlement and demonstrate the corresponding reduction in outstanding supply. Failure to
  complete destruction MUST reverse the settlement's spending. Vesting, locking or transferring
  tokens to another account MUST NOT count as this burn.
- **FR-015**: The protocol MUST enforce its spending and price-protection rules against arbitrary
  callers. It MUST reject wrong assets/recipients/venues, excessive input, stale evidence and
  caller-chosen unsafe bounds. The rules MUST address manipulation of every conversion leg,
  including during early bonding, rather than trusting only a caller's own quote or a manipulable
  current pool price. Planning MUST identify initial values, Safe-adjustable settings and enforced
  safety bounds with supporting evidence before coding. Safe updates MUST stay within those bounds;
  processing MUST validate against the effective configuration at execution, including when a
  prepared transaction becomes stale after a configuration change.
- **FR-016**: Fees without an executable safe route MUST remain pending by asset, without a forced
  trade or discretionary rescue payout. The Safe MUST be able to approve, replace or disable
  routes subject to enforced validity rules; ordinary callers execute only currently approved
  routes. A compatible payment token does not imply a liquid conversion market. Pending inventory
  MUST become processable after a valid route repair when execution prerequisites are satisfied.
- **FR-017**: Processing MUST be bounded by available inventory and execution limits. Partial fills,
  refunded input and residual amounts MUST remain dedicated inventory. Concurrent, repeated or
  failed calls MUST NOT double-spend, duplicate burn totals or consume another asset's balance.
- **FR-018**: Fee custody MUST be isolated from creator proceeds, reward reserves and referral
  liabilities and unearned protocol reserves. Callbacks, malicious routes, unsolicited transfers and token failures MUST NOT expose
  any of those balances or introduce an arbitrary withdrawal path. Donations MUST be reported
  separately and, if processable, share the same exclusive burn purpose.
- **FR-019**: Processing one asset and collecting external launchpad proceeds MUST NOT be required
  for processing another asset. Failures MUST be observable and retryable where their cause changes;
  an unrouteable or permanently frozen asset MAY remain pending indefinitely without privileged rescue.

#### Protocol-token launch and external lifecycle

- **FR-020**: Planning MUST evaluate both Pons and Long against the launch, ETH pairing, actual
  burn, lifecycle, integration-access and external-control requirements, select one evidenced
  integration, and identify its exact deployed version. Pons v2 is the initial candidate described
  in [launchpad-evaluation.md](launchpad-evaluation.md); a recommendation is not a verified deployment.
- **FR-021**: The selected launch MUST pair the protocol token with ETH and permit a disclosed
  developer-funded initial purchase. Initial supply, launch costs, any launch-window treatment,
  actual purchase consideration and resulting developer holdings MUST be publicly verifiable.
- **FR-022**: Initial developer holdings MUST consist only of purchased tokens. There MUST be no
  project premine, free developer allocation, separate allocation-based vesting grant or continuing
  mint authority. The developer MAY subsequently receive earned Pons trading revenue and the
  creator's share of trading-funded vested tokens. Initial purchases and later compensation MUST
  be separately attributable, with no promise of ownership percentage or token value.
- **FR-023**: Pons vested buybacks MUST be enabled when the protocol token launches. The designated
  developer-controlled Pons creator recipient MUST be able to receive the remaining creator ETH
  trading revenue and claim the creator's earned vested tokens. Pons's beneficiary share and actual
  fee/vesting terms MUST be recorded from the selected deployment. The additional creator tax
  remains zero by default. External recipient/toggle controls MUST NOT affect membership-fee custody;
  later changes MUST be publicly observable. Unavailable external sweeps remain explicitly pending
  and MUST NOT block membership-funded purchases and burns. No custom trading-fee splitter or
  trading-funded direct-burn mechanism is required by enabling Pons's existing vested buybacks.
  Native fallback payouts, including curve graduation distributing pending buyback earmarks as
  creator revenue, MUST be recorded separately; enabled buybacks do not guarantee every earmark vests.
- **FR-024**: Membership fees MUST be usable for purchases and burns during bonding; requiring
  all such purchases to wait until graduation MUST NOT satisfy this feature. Lifecycle transitions
  MUST be determined from the selected launch's authoritative state, including any intermediate
  state where neither the curve nor pool is tradable.
- **FR-025**: Supported public graduation and recovery actions MUST work without a Backed By Fans
  administrator. Failed transitions MUST preserve membership operations and pending inventory;
  processing MUST resume against the actual graduated pool when it becomes executable under active
  configuration. Normal graduation MUST NOT require a Safe route update; exceptional integration
  repairs MAY require the Safe and MUST be disclosed as such.
- **FR-026**: External launchpad, exchange, issuer and network powers MUST be documented separately
  from Backed By Fans authority. Tests MUST identify their effects, including operator-dependent
  harvesting and external fee-recipient overrides. The product MUST NOT claim these dependencies
  are ownerless, promise their availability, or count their vesting activity as membership-fee burns.
  It MUST disclose Backed By Fans Safe administration and MUST NOT claim full decentralization.

#### Public product and integration behavior

- **FR-027**: Creator publication and supporter payment review MUST show the chosen asset, gross
  amount and allocation in plain language. Memberships MUST remain presented as creator support
  and access, with no promise of token appreciation, dividends or investment returns.
- **FR-028**: Public protocol activity MUST distinguish protocol fees allocated, unearned reserves,
  earned fees awaiting collection, fees released to buyback inventory, protocol-funded refunds, donated inventory,
  developer trading proceeds, trading-funded vault deposits, vested/released/claimed amounts,
  pending amounts/reasons, conversion costs, membership-funded purchases and actual supply destroyed.
  Earned fees awaiting collection MUST include uncheckpointed earnings projected at the read timestamp;
  the checkpointed amount immediately available for release MUST be distinguishable. Projected totals
  MUST use matching block and population coverage, with incomplete coverage identified explicitly.
  Each completed purchase/burn MUST link to confirmed evidence and preserve
  asset identity; balances in different assets MUST NOT be summed as if they shared a unit. The Safe
  address, enabled tokens, approved routes, execution limits, pause state and configuration-change
  history MUST be publicly discoverable. Pending reasons MUST distinguish Safe policy from market
  failures and unavailable automation. Show projected fee releases by payment asset and time window
  from current prepaid memberships, explicitly conditional on refunds and future membership changes;
  never represent projections as guaranteed buybacks or a fixed number of protocol tokens acquired.
- **FR-029**: Independent clients MUST be able to discover terms and perform core creator,
  supporter and fee-processing actions within current Safe configuration without the original
  website or private approval service. Administrative actions MUST remain subject to Safe authorization.
  The browser MUST distinguish payment completion from buyback status and handle network, wallet,
  balance, replacement and external-market failures accurately.
- **FR-030**: Multi-token capability and fee burning MUST NOT be presented as legal clearance for
  Stock Token activity or a protocol-token launch. The US-person premise MUST remain an explicit
  unverified assumption for mainnet assessment, without removing the requested technical scope.

#### Complete test-environment delivery

- **FR-031**: Implementation MUST deliver a running complete environment using a verified working
  launchpad testnet, a faithful complete copy, or otherwise a short-lived pinned mainnet fork.
  Finding Robinhood testnet alone MUST NOT satisfy launchpad availability.
- **FR-032**: The integration run MUST use authentic selected launchpad/exchange behavior, a fresh
  protocol-token launch, real curve/pool purchases and actual burns. It MUST cover multiple payment
  assets including a representative authentic Stock Token and a non-ETH conversion path. Mock-only
  integrations or modified external authority checks MUST NOT substitute for that evidence.
- **FR-033**: Automated unit, independent-model, stateful/adversarial, integration and browser
  validation MUST cover the scenarios in [acceptance-evidence.md](acceptance-evidence.md). The
  browser and automation runner MUST operate against the same test protocol and launched token.
- **FR-034**: The delivered environment MUST be reproducible from recorded source and chain origin,
  with exact start/reset/teardown instructions and retained receipts, balances, supply comparisons
  and browser artifacts, plus test Safe ownership/threshold and configuration transactions.
  Authorized changes MUST be demonstrated through actual Safe execution, not solely by impersonating
  its address. Expiry MUST NOT destroy the evidence needed to reproduce the result.
- **FR-035**: Delivery reporting MUST distinguish specification, source checks, synthetic tests,
  authentic integration, browser evidence and public deployment. Missing external evidence MUST
  remain an explicit failed acceptance item; it MUST NOT be replaced by a successful mock or
  described as a completed working forknet feature.

#### Administration boundary

- **FR-036**: The Safe MUST be able to pause/resume buybacks globally or by asset without pausing
  membership settlement, claims or refunds. Pauses MUST retain inventory and explain pending status.
  Execution settings MUST cover route selection, pricing protections and processing amount limits;
  configurable values and hard bounds MUST be enumerated in planning. Existing tier assets, prices
  and allocation rates, the designated protocol token and the exclusive burn purpose remain fixed.
- **FR-037**: Configuration changes MUST require valid Safe authorization and expose attributable
  onchain changes. Unauthorized callers and token holders without Safe authority MUST be rejected.
  The implementation MUST document Safe powers, signer availability and compromise risks separately
  from external launchpad roles. DAO voting, delegation, token-controlled administration and a DAO
  migration mechanism are outside this feature.
  Administration MUST use documented Safe transactions and scripts covering token onboarding,
  route configuration, bounded-setting changes and buyback pause/resume, with reviewable inputs and
  expected confirmed outcomes. A custom administration screen is out of scope. Public configuration
  visibility in the app remains required by FR-028.

- **FR-038**: Protocol fees MUST earn continuously in proportion to consumed paid membership time,
  using deterministic raw-unit rounding independent of checkpoint frequency. Renewals and gifts MUST
  earn on their queued paid duration; variable contributions use their own amount and duration. Free
  grants MUST NOT earn fees. The full fee earns at full consumption; cancellation stops unearned accrual.
- **FR-039**: Unearned fees MUST remain isolated from creator claims and buyback spending. Refund
  preview and execution MUST include the same current protocol-reserve contribution and any bounded
  owner top-up. At 100%, unused-time gross refunds MUST be fully reserve-backed without external owner
  funding; any rounding residual after cancellation MUST be explicitly accounted, never stranded.
- **FR-040**: Anyone MUST be able to checkpoint earned fees and release them to the vault in bounded
  batches without Safe approval or buyback-market availability. No action MAY require scanning all
  members or unbounded purchase histories. Time earns fees even if automation is stopped; the runner
  collects eligible earned amounts before periodic buys. Repeated calls and refund/collection races
  MUST neither duplicate releases nor expose unearned reserves, including after credential expiry.

### Key Entities

- **Protocol Safe and configuration**: The administrative authority, enabled payment tokens,
  approved buyback routes, bounded settings and pause state, with public change history.
- **Membership tier**: Creator-controlled membership with a permanent payment asset, price, period,
  protocol allocation, reward allocation and referral allocation; existing rights and artwork controls.
- **Membership allocation**: A gross payment's independently reconcilable protocol, supporter,
  referral and creator amounts in the payment asset's raw units.
- **Protocol token**: The one ETH-paired token whose purchased supply is destroyed, identified by
  network and deployment, with verifiable initial purchased holdings and separately earned developer
  trading compensation. Only membership-funded purchases are required to burn directly.
- **Protocol-fee accrual**: Each paid allocation's protected unearned balance, earned entitlement,
  releases and refund contribution, tied to consumed paid time with a reproducible release forecast.
- **Fee inventory**: Earned released assets and separately identified donations dedicated to burns, tracked separately from membership
  liabilities, developer trading proceeds and Pons vesting balances.
- **Trading compensation**: The protocol token launch's creator ETH income and earned vested-token
  entitlement, belonging to its designated developer recipient under Pons's external controls.
- **Processing settlement**: Confirmed asset consumption, venue costs, unused input, received
  protocol tokens and actual destruction, with one attributable lifecycle outcome.
- **Launch lifecycle**: The token's bonding, transition and graduated-market states, including
  authoritative markets, public recovery actions and external administrative dependencies.
- **Execution participant**: Any caller or automated runner paying gas without custody or routing
  authority; voluntary funding and availability determine whether eligible actions are submitted.
- **Environment evidence**: Reproducible origin, deployment identities, receipts, accounting and
  browser artifacts, labeled by authentic integration or synthetic fault injection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every tested valid fee configuration from 1% through 100% settles to its independently
  expected split; every below-minimum, above-maximum, overallocated or post-publication change is
  rejected. At 100%, exactly the full gross becomes protected protocol reserve, earning over paid time.
- **SC-002**: Across all verified sequences, 100% of received funds reconcile to their asset-specific
  allocations, unearned reserves, uncheckpointed earnings, checkpointed earned-held fees, vault releases, allowed conversion costs,
  successful burns, claims/refunds or remaining balances without counting transfers twice.
  There are zero unauthorized payouts from membership-fee custody; developer compensation through
  ordinary Pons trading costs is recorded separately without double-counting fees or burns.
- **SC-003**: At least one membership-funded purchase and true burn succeeds during bonding and at
  least one after graduation. Each reported burn equals the independently observed attributable
  supply reduction, including direct protocol-token fees and partial-fill scenarios.
- **SC-004**: All creator and supporter lifecycle journeys succeed with buyback automation offline
  whenever their payment asset itself is operable. Delayed buybacks cause zero loss of purchased
  membership time or protected claims.
- **SC-005**: After runner A is stopped, independently funded runner B completes the next eligible
  processing action within two configured processing intervals in the controlled test, without
  any permission change, while processing and its route are enabled. No liveness claim is made
  when Safe policy, gas, liquidity or admissible pricing prevents execution.
- **SC-006**: One fresh token launch reconciles the developer's entire launch allocation to its
  disclosed purchase. There are zero free project allocations, unauthorized membership-fee payouts
  or hidden deployer privileges. Recorded Safe configuration powers remain. Later trading revenue
  and vested tokens reconcile to earned Pons entitlements.
- **SC-007**: Automated browser journeys demonstrate publication at 1% and 100%, join, renewal,
  gift, claims, refund and visible pending/completed burn states against the running integration,
  including representative failure journeys and multiple payment assets.
- **SC-008**: Two clean environment runs reproduce the full lifecycle and conservation outcomes
  from recorded origins. Every required acceptance scenario has retained pass/fail evidence, and
  the implementation is called complete only when all mandatory authentic-integration and browser
  scenarios pass.
- **SC-009**: Trading fees generated during both bonding and pool trading produce verifiable vault
  deposits with vested buybacks enabled. Controlled time advancement demonstrates partial release,
  additional-deposit accounting, both beneficiary shares and creator claims. None of these tokens
  is counted as a membership-fee burn, and membership-fee processing works when Pons sweeps stop.

- **SC-010**: Actual test-Safe transactions enable a token, configure and replace a route, update
  bounded execution settings, and pause/resume buybacks. All unauthorized or out-of-bound attempts
  fail. Disabling a token blocks new tiers but preserves existing operations; a route repair resumes
  pending burns. No configuration change alters published economics or permits a non-burn payout.
  An operator MUST be able to reproduce these authorized actions using the delivered documentation
  and scripts. Browser evidence MUST show the resulting public configuration and change history;
  administrative transaction preparation in the app is not required.

- **SC-011**: The 120-token/12-period/10% example earns 3 tokens after three periods and retains
  9 for refunds; a 90-token cancellation uses those 9 before creator funding. At 100%, all unused-time
  gross refunds are reserve-backed. Automated models cover partial periods, renewals, varying
  contribution amounts, grants, tiny raw amounts, cancel/rejoin and arbitrary checkpoint frequency.
- **SC-012**: With collection stopped, earned entitlement continues to advance while reserved funds
  cannot be spent. A replacement ordinary collector releases the exact earned amount in bounded work.
  Refund-first and collection-first orderings at the same timestamp reconcile identically, and browser
  projections separate reserved releases, earned available funds and actual completed burns.
  Stored holdings and projected entitlement MUST reconcile before any checkpoint: in the12-token fee
  example after3 periods,12 remain protected,9 are unearned,3 are earned but uncheckpointed and0 are
  immediately releasable. Checkpointing makes3 releasable; release leaves9 protected and3 cumulatively released.

## Assumptions

- Only protocol-fee timing changes: creator proceeds, supporter rewards and referrals retain their
  existing allocation/claim timing. Accrual follows consumed paid time, not calendar-month boundaries
  or transaction scheduling. Buybacks run periodically on earned, released funds.
- The creator chooses the protocol rate once at publication, as explicitly confirmed. No new
  post-publication economic editing or governance-token control is introduced.
- The latest user decision retains a protocol Safe for onboarding and post-launch configuration,
  superseding the earlier no-admin requirement. Public participation operates within that policy.
  A protocol-token DAO is a possible future direction, not a requirement, entitlement or promised
  migration in this version. Safe and external dependency powers require separate disclosure.
- Pons is the initial implementation candidate based on accessible published evidence. Its
  membership-fee purchase-and-burn integration is independent of its own fee-funded vesting system.
  Deployment compatibility and safe early-bonding execution remain planning investigations.
- Pons vested buybacks are enabled at launch, as confirmed by the user. Developer compensation
  includes the creator's remaining trading revenue and earned vested tokens. The additional creator
  tax stays at zero unless separately revised; a nonzero tax is not needed to earn the standard share.
  Pons's external controls retain their native scope separately from Backed By Fans Safe authority.
- Standard unavoidable launchpad/exchange costs apply to purchases. All Backed By Fans membership
  earned fee inventory is dedicated to burns; unearned allocations remain reserved for refunds.
  Gas is funded separately. Unfunded execution and unavailable
  markets can delay burns indefinitely. No financial return or economic self-sufficiency is promised.
- Multi-token support means selection among Safe-enabled compatible assets, not a guarantee of
  transferability, liquidity, price evidence or legal availability for every token. The Safe can
  repair routes but cannot override issuer freezes or withdraw pending fees; delays remain visible.
- Tier payment amounts remain token-denominated, not pegged to dollars. Existing Stock Token raw
  accounting and display-scaling behavior carry forward into the mainnet-capable version.
- Token identity and initial ETH purchase amount are deployment inputs. Initial routes, execution
  limits, adjustable settings, hard safety bounds and Safe setup must be specified and tested before
  initialization. Only the expressly authorized configuration remains mutable after launch.
- The technical milestone is the working full test environment. The mainnet assessment must include
  the now-approved developer trading income and vested tokens; it cannot rely on a premise that the
  developer receives no fees. ETH pairing and membership-fee burns do not establish legal clearance.
- No constitution amendment is needed: creator ownership, onchain fidelity, MIT/open-source project
  policy, plain-language UX and evidence-bounded delivery continue to apply. External dependency
  licenses remain their own. The implementation must follow the remaining Spec Kit phases.

## Approved operational extension — 2026-09-08

The user approved [local policy tools](local-policy-tools-plan.md): human-unit generation,
two-hour sampled references at two-minute intervals, optional isolated sequential rehearsal,
and wallet-based Safe review/submission through the existing local app. These requirements
supersede earlier exclusions of an administration screen and local storage only for this
operator workflow. SQLite stores market observations, not transaction lifecycle or accounting.
Existing raw preparation remains available. Rehearsal can be skipped with acknowledgment;
public generated proposals require valid history, while explicit spot mode is fork-only.
No automatic renewal or contract-budget change is included. Historical acceptance does not
establish this extension's completion; its focused evidence is recorded separately.


## Approved delivery deferral — 2026-09-09

The user deferred the personal-wallet submission workflow for payment-token
onboarding, route changes and pause/resume (analysis C1) to future work. For this
local milestone, FR-037/SC-010 retain Safe authorization, reviewable prepared
calls and actual test-Safe execution evidence; delivery of a personal-wallet
client for those actions is excluded from acceptance. The existing standing-settings
page must still support wallet signing and saving through the Safe. Documentation
must disclose the deferred path rather than claim complete personal-wallet
administration. No onchain authority or custody constraint is relaxed.
