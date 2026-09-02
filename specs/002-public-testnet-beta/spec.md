# Feature Specification: Public Testnet Beta

**Feature Branch**: `main`

**Created**: 2026-09-01

**Status**: Ready for implementation

**Input**: User description: "Launch Backed By Fans as a public Robinhood Chain testnet beta at
`backedbyfans.xyz`. Let the protocol maintain an enumerable set of accepted payment tokens and let
each creator choose one immutable payment token for a membership tier. On testnet, support canonical
testnet USDG plus the five Stock Tokens supplied by the official Robinhood Chain faucet, including
each token's decimals and ERC-8056 UI multiplier. Keep subscription settlement fixed in raw token units
while displayed Stock Token amounts adjust after corporate actions. A future mainnet deployment
will accept USDG only."

**Scope amendment**: "Because this protocol version already replaces the tier contract, let the
current tier owner replace its renderer address after publication so creators can correct or evolve
artwork. Renderer replacement changes presentation only; art/media inputs, payment terms, membership
state, and accounting remain unchanged."

## Clarifications

### Session 2026-09-01

- Q: How should inexact Stock Token price conversions and user-facing token amounts be rounded? → A:
  Convert to the nearest raw unit, then display at most three meaningful fractional digits after any
  leading fractional zeros using normal rounding and omit unnecessary trailing zeros; exact raw
  units remain authoritative.
- Q: Which contracts form the testnet launch set, and should Backed By Fans deploy its own test USDG?
  → A: Use the supplied external USDG, AMD, NFLX, PLTR, AMZN, and TSLA addresses recorded in FR-014;
  do not deploy an internal USDG substitute.
- Q: Where should accepted-token administration live? → A: Seed launch tokens in the deployment
  script and use reviewed Safe/deployer CLI commands for later status and fee operations; do not build
  a Backed By Fans operator web interface.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Complete a Fresh-Wallet Beta Journey (Priority: P1)

A person arriving with a new wallet can recognize that Backed By Fans is running on Robinhood Chain
testnet, obtain the test assets distributed by the official faucet, connect or switch to the correct
network, and create or join a membership without requesting funds from the Backed By Fans operator.

**Why this priority**: The beta is not meaningfully public if every participant requires manual
funding or private instructions before trying the product.

**Independent Test**: Start with a wallet that has no Robinhood Chain testnet assets, follow the
public onboarding path to the official faucet, return with faucet assets, and complete one
membership purchase without operator assistance or a Backed By Fans funding service.

**Acceptance Scenarios**:

1. **Given** a wallet that is not connected to Robinhood Chain testnet, **When** its owner begins a
   creator or supporter action, **Then** the product identifies the required network and offers the
   established wallet network-switch flow.
2. **Given** a wallet without enough test ETH or an accepted payment token, **When** its owner views
   the funding guidance, **Then** the product links to the official Robinhood Chain testnet faucet
   and explains which asset is needed for gas and which asset will pay for the membership.
3. **Given** a wallet funded by the official faucet, **When** its owner returns to Backed By Fans,
   **Then** the product recognizes the accepted faucet assets without an account, manual mint, or
   operator action.
4. **Given** the wallet has enough test ETH and the tier's payment token, **When** its owner completes
   the wallet actions, **Then** the membership purchase completes using that token.

---

### User Story 2 - Price a Membership in an Accepted Token (Priority: P1)

A creator can choose an enabled payment token while creating a membership. Tokens already held by
the connected wallet are easy to find. The creator enters a normal human-readable price, sees the
token name and symbol throughout review, and publishes a tier whose payment token cannot later be
changed.

**Why this priority**: Configurable payment tokens provide the Stock Token testing experience and
remove the beta's dependency on a separately operated USDG faucet.

**Independent Test**: With a wallet holding the five faucet Stock Tokens, create separate test tiers
using each enabled token, confirm each price uses the token's own display rules, and confirm the
published tier permanently identifies the selected token.

**Acceptance Scenarios**:

1. **Given** several accepted tokens, **When** a connected creator reaches pricing, **Then** enabled
   tokens held by that wallet appear before enabled tokens with no wallet balance.
2. **Given** a creator chooses a six-decimal token, **When** they enter and review a price, **Then**
   the amount uses that token's precision and symbol rather than a hard-coded USDG format.
3. **Given** a creator chooses an ERC-8056 Stock Token, **When** they enter and review a price,
   **Then** the human-readable amount reflects the token's current UI multiplier and the review
   shows the exact amount represented by the raw payment terms.
4. **Given** a published tier, **When** its creator later manages the membership, **Then** its payment
   token remains unchanged and is not offered as an editable term.

---

### User Story 3 - Renew Through a Stock Action (Priority: P1)

A supporter understands a Stock Token subscription as a recurring amount of that token. If a stock
action changes the token's UI multiplier, the displayed token amount changes while the underlying
raw charge and the membership's economic continuity remain intact.

**Why this priority**: Applying the multiplier only at tier creation would make existing subscription
prices misleading after a split or similar corporate action.

**Independent Test**: Create a membership whose displayed price is `0.05` of a representative
scaled token, double the token's UI multiplier, and confirm the membership displays `0.10` while
renewal, prepayment, refund, reward, referral, creator proceeds, and protocol fees continue using
the unchanged raw amounts.

**Acceptance Scenarios**:

1. **Given** a Stock Token tier with a current multiplier, **When** a supporter views, joins, renews,
   prepays, gifts, or reviews a refund, **Then** every visible amount uses the current multiplier and
   token decimals consistently.
2. **Given** the token's multiplier changes from `1` to `2`, **When** the tier is viewed after the
   change, **Then** a previously displayed `0.05` subscription price displays as `0.10` without a
   creator update.
3. **Given** the multiplier changes, **When** a renewal or claim is executed, **Then** the same raw
   amount is transferred and accounted for as before the change.
4. **Given** normal market-price movement without a multiplier change, **When** the tier is viewed,
   **Then** Backed By Fans does not claim that the subscription has a fixed dollar value.
5. **Given** a token exposes a scheduled future multiplier, **When** a person reviews the payment
   terms, **Then** the product can identify the scheduled display adjustment without changing the
   current settlement amount early.

---

### User Story 4 - Operate the Accepted-Token Set (Priority: P2)

The protocol operator can enumerate accepted payment tokens, enable a reviewed token for new tiers,
and disable a token for future tier creation. Existing tiers continue to identify and use their
original token. Protocol fees and balances remain attributable to the token in which they were paid.
These administrative actions use reviewed CLI calldata submitted through the protocol Safe or
authorized deployer; the public website does not include an operator administration interface.

**Why this priority**: Faucet contents and future network payment policy can change without making
the protocol accept arbitrary tokens or silently breaking existing memberships.

**Independent Test**: Enable a representative token, create a tier with it, disable it, confirm it
cannot be selected for another tier, and confirm the existing tier remains discoverable and can
continue its normal token-denominated operations.

**Acceptance Scenarios**:

1. **Given** an enabled compatible token, **When** a creator publishes a tier with it, **Then** the
   tier is created with that token.
2. **Given** a token that is not enabled, **When** a creator attempts to publish a tier with it,
   **Then** publication fails clearly before creating a tier.
3. **Given** a token is disabled after a tier used it, **When** someone opens or uses the existing
   tier, **Then** the tier still identifies that token and remains usable whenever the token itself
   permits transfers.
4. **Given** protocol fees were paid in more than one token, **When** the authorized recipient uses
   the reviewed CLI/Safe procedure to inspect or withdraw fees, **Then** each balance and withdrawal
   is identified in its own token.

---

### User Story 5 - Use the Production-Hosted Testnet Beta (Priority: P2)

A creator or supporter can use the beta at `backedbyfans.xyz` with the same public membership,
creator, account, renderer, and agent-skill experiences that were exercised locally. The site makes
its testnet status unmistakable and does not imply that test assets have monetary value.

**Why this priority**: A stable public URL is required for outside testing, renderer handoffs, and a
credible beta, while remaining distinct from mainnet authorization.

**Independent Test**: Starting from the canonical public URL, complete representative creator,
supporter, renderer-preview, renderer-deployment, and account-management journeys on Robinhood Chain
testnet, then confirm the same URL remains clearly labeled as a testnet beta throughout.

**Acceptance Scenarios**:

1. **Given** a visitor opens the canonical domain, **When** any wallet or payment action is shown,
   **Then** Robinhood Chain testnet and test-only asset status are visible in plain language.
2. **Given** a visitor follows a membership or renderer link, **When** the page loads, **Then** the
   canonical public URL preserves the intended destination and shareable state.
3. **Given** a beta deployment has a critical web regression, **When** the operator invokes the
   documented rollback procedure, **Then** the prior known-good web release can be restored without
   changing onchain membership state.
4. **Given** mainnet has not been separately authorized, **When** the beta is deployed, **Then** no
   mainnet protocol write or Stock Token payment enablement occurs.

---

### User Story 6 - Update a Published Membership's Renderer (Priority: P2)

The current owner of a membership tier can replace its renderer contract when they want to correct
artwork, refresh the design, or intentionally change how existing and future membership tokens look.
The creator can preview the candidate with the tier's existing art and media configuration before
choosing to submit the update. Payment terms and membership state do not change.

**Why this priority**: Renderer contracts are already capable of producing dynamic output, so treating
the renderer address as permanently fixed does not create immutable artwork. Explicit owner control
makes that presentation boundary honest and lets creators correct or evolve their membership design
without redeploying the economic tier.

**Independent Test**: Publish a tier and mint representative active and expired credentials, transfer
tier ownership to a second wallet, replace the renderer from the new owner's management page, and
confirm every credential uses the new renderer while its owner, payment token, raw price, time,
claims, referrals, and accounting remain unchanged.

**Acceptance Scenarios**:

1. **Given** a published tier, **When** its current owner selects a compatible same-chain renderer and
   submits the update, **Then** the tier records that renderer and all token metadata reads use it.
2. **Given** a tier with existing credentials, **When** its renderer changes, **Then** indexers and
   clients receive the standard metadata-refresh signal for the affected token range.
3. **Given** tier ownership has transferred, **When** the former owner attempts a renderer update,
   **Then** the transaction fails and the current owner remains the only authorized updater.
4. **Given** a renderer address that is zero, has no code, exposes the wrong renderer schema, or
   rejects the tier's existing art/media configuration, **When** an update is attempted, **Then** the
   transaction fails and the prior renderer remains active.
5. **Given** an otherwise compatible renderer that is not in a renderer registry, **When** the tier
   owner chooses it, **Then** the update does not require platform registration or curation.
6. **Given** a successful renderer update, **When** any payment, renewal, refund, claim, referral,
   ownership, or expiration state is inspected, **Then** it is unchanged by the presentation update.

### Edge Cases

- The official faucet changes which Stock Tokens it distributes or temporarily becomes unavailable.
- A wallet has test ETH but none of the tier's payment token, or has the payment token but
  insufficient test ETH for approval and purchase.
- An accepted token returns unusual name or symbol text, changes metadata, or uses a precision that
  differs from both USDG and the Stock Tokens.
- A token claims ERC-8056 support but its multiplier cannot be read, is zero, or its optional
  conversion helpers are unavailable.
- A multiplier changes between the creator's final review and tier publication; the published raw
  amount remains authoritative and the post-publication display uses the then-current multiplier.
- Converting a creator-entered display amount to raw units requires rounding at the token's available
  precision.
- A scheduled multiplier becomes effective while a supporter is reviewing or submitting a wallet
  action.
- A token is disabled while a creator has an unpublished draft that selected it.
- A token contract pauses, restricts, reverts, returns false, or transfers an amount other than the
  requested amount.
- A Stock Token becomes inactive, is renamed, or is affected by a merger, redemption, spin-off, or
  worthless-removal event.
- Protocol fees accumulate in several tokens and one token cannot currently transfer.
- A stale link targets a pre-beta test deployment rather than the active beta protocol version.
- The production website is available while its configured RPC is unavailable or rate-limited.
- A renderer previews successfully but later changes its own output or begins reverting.
- A tier owner selects a new renderer while credentials are active, expired, or not yet minted.
- Tier ownership changes while a renderer-update transaction is awaiting submission or confirmation.
- A candidate renderer supports the expected schema but rejects the tier's already-stored art or
  media configuration.

## Requirements _(mandatory)_

### Functional Requirements

#### Public Testnet Beta

- **FR-001**: The public beta MUST operate only on Robinhood Chain testnet (`46630`).
- **FR-002**: The beta MUST be available at the canonical HTTPS domain `backedbyfans.xyz`.
- **FR-003**: The canonical domain MUST preserve shareable membership, referral, renderer, and agent
  skill routes without redirecting them to a generic landing page.
- **FR-004**: Wallet and payment surfaces MUST identify the beta as testnet and MUST state that test
  assets have no monetary value.
- **FR-005**: The beta MUST link to the official Robinhood Chain testnet faucet wherever a connected
  wallet lacks test ETH or an accepted faucet payment token needed for the next action.
- **FR-006**: A fresh-wallet participant MUST be able to use assets from the official faucet without
  a Backed By Fans account, custom faucet, manual mint, custodial wallet, or operator assistance.
- **FR-007**: The production-hosted beta MUST expose the existing membership discovery, membership
  creation, account management, `/render`, and `/skill` experiences.
- **FR-008**: Mainnet protocol deployment and mainnet user transactions MUST remain outside this
  feature and require a separate authorization.

#### Accepted Payment Tokens

- **FR-009**: The protocol MUST maintain a chain-scoped, enumerable set of accepted payment tokens.
- **FR-010**: Only the authorized protocol operator MAY enable or disable payment tokens.
- **FR-011**: Enabling or disabling a token MUST affect new tier publication and MUST NOT rewrite the
  payment token of an existing tier.
- **FR-012**: Tier publication MUST reject a payment token that is not enabled at the time of the
  successful publication.
- **FR-013**: Each tier MUST permanently identify exactly one accepted payment token.
- **FR-014**: The testnet beta launch manifest MUST enable exactly these six tokens on chain `46630`:
  USDG (`0x7E955252E15c84f5768B83c41a71F9eba181802F`), AMD
  (`0x71178BAc73cBeb415514eB542a8995b82669778d`), NFLX
  (`0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93`), PLTR
  (`0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0`), AMZN
  (`0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02`), and TSLA
  (`0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`). The deployment MUST NOT create or substitute an
  internally operated USDG token.
- **FR-015**: The future mainnet deployment profile MUST contain canonical USDG as its only initially
  enabled payment token; enabling any mainnet Stock Token requires separate future scope and
  authorization.
- **FR-016**: Accepted-token information MUST expose the token address, enabled state, name, symbol,
  decimal precision, and whether scaled UI amounts are supported.
- **FR-017**: Current and scheduled UI multiplier data MUST be read from a scaled token rather than
  treated as permanent registry metadata.
- **FR-018**: Disabling a token MUST remove it from new-tier choices while preserving discovery and
  management of tiers that already use it.
- **FR-019**: The creator experience MUST present enabled tokens held by the connected wallet before
  enabled tokens for which the wallet has no balance.
- **FR-020**: The protocol MUST reject payment behavior that does not transfer the exact raw amount
  required by the membership operation.

#### Token Amounts and Subscription Continuity

- **FR-021**: All protocol settlement, allowance, proceeds, reward, referral, fee, refund, and
  liability accounting MUST use raw payment-token units.
- **FR-022**: Every user-facing payment amount MUST use the selected token's symbol and decimal
  precision instead of hard-coded USDG labels or six-decimal formatting.
- **FR-023**: For a token without scaled UI support, the displayed amount MUST equal the raw amount
  formatted with the token's decimal precision.
- **FR-024**: For an ERC-8056 token, the displayed amount MUST equal the raw amount adjusted by the
  current UI multiplier and then formatted with the token's decimal precision.
- **FR-025**: A creator entering a price for an ERC-8056 token MUST enter the current displayed
  amount, which is converted once to the nearest raw unit and stored as the raw price at publication.
- **FR-026**: User-facing token amounts, including final publication review, MUST use normal rounding
  to show at most three meaningful fractional digits after any leading fractional zeros and MUST
  omit unnecessary trailing zeros; exact raw units remain authoritative for protocol accounting.
- **FR-027**: A tier's raw price per period MUST remain unchanged when its payment token's current or
  scheduled UI multiplier changes.
- **FR-028**: After a multiplier change, every tier and account surface MUST derive the displayed
  price, balances, proceeds, rewards, referrals, fees, and refunds from the current multiplier.
- **FR-029**: A multiplier change MUST NOT alter previously purchased membership time, future period
  duration, reward shares, referral selection, creator payout identity, or protocol fee rate.
- **FR-030**: Approval and transfer requests MUST use raw units even when the wallet-facing product
  displays a scaled UI amount.
- **FR-031**: If a token exposes a scheduled multiplier, the product MUST distinguish the current
  displayed amount from any future display adjustment and MUST NOT apply the future multiplier
  before its effective time.
- **FR-032**: The product MUST NOT describe a Stock Token membership price as fixed in dollars or
  guarantee that its market value remains constant.
- **FR-033**: The product MUST use the official term "Stock Token" and MUST NOT describe a membership
  as equity, an investment, yield, dividends, passive income, or a promise of appreciation.
- **FR-034**: A token failure MUST produce an actionable failure state and MUST NOT silently substitute
  USDG, another token, a swap, or an offchain payment path.

#### Multi-Token Membership Operations

- **FR-035**: Join, renew, prepay, gift, cancel, refund, reward claim, referral claim, creator claim,
  and protocol-fee withdrawal flows MUST identify and use the tier's selected payment token.
- **FR-036**: Token balances, required approvals, payment shortfalls, and claimable amounts MUST be
  evaluated separately for each token.
- **FR-037**: Protocol fees paid in one token MUST remain attributable to that token and MUST be
  withdrawable independently from fees paid in other tokens.
- **FR-038**: An accepted token's inability to transfer MUST NOT prevent the operator from identifying
  or withdrawing other token balances.
- **FR-039**: A token disabled for new tiers MUST remain available to existing-tier operations unless
  the token contract itself prevents the transfer.
- **FR-040**: The product MUST NOT accept an arbitrary creator-supplied payment token unless the
  protocol operator has enabled it for that chain.

#### Release and Operations

- **FR-041**: The active beta protocol version, chain, contract roles, accepted payment tokens, and
  canonical website release MUST be recorded in the deployment and operations documentation.
- **FR-042**: Pre-beta test deployments MUST NOT be presented as the active beta protocol after the
  new version is promoted.
- **FR-043**: The beta release procedure MUST include production-domain checks for the creator,
  supporter, account, renderer, agent-skill, faucet, and token-selection journeys.
- **FR-044**: Monitoring and incident guidance MUST distinguish website failures, RPC failures,
  payment-token failures, and protocol failures so the operator can communicate the affected scope.
- **FR-045**: The web release MUST have a documented rollback path that does not imply or attempt an
  onchain rollback.
- **FR-046**: Testnet protocol deployment and token enablement MUST stop at an explicit operator gate,
  identify every intended public write, and require interactive operator authorization.
- **FR-047**: The operator MUST be told when regenerated client contract information is required
  after the approved testnet deployment and before public beta promotion.
- **FR-048**: Mainnet configuration MUST be inspected separately and MUST contain no enabled Stock
  Token before any later mainnet release is considered ready.
- **FR-058**: Accepted-token enablement, disablement, and protocol-fee withdrawal MUST be performed
  through reviewed CLI calldata submitted by the protocol Safe or authorized deployer; no Backed By
  Fans operator web interface is included in this feature.

#### Mutable Tier Renderer

- **FR-049**: A tier's current owner MUST be able to replace the tier's renderer contract address.
- **FR-050**: Renderer-update authority MUST follow the tier's existing two-step ownership state; a
  former, pending, or unrelated owner MUST NOT be able to update it.
- **FR-051**: A renderer update MUST reject a zero address, an address without contract code, a
  renderer with the wrong schema, or a renderer that rejects the tier's current art and media
  configuration.
- **FR-052**: A compatible renderer MUST remain usable by direct same-chain address without a
  renderer-registry entry, platform listing, or curation approval.
- **FR-053**: A failed renderer update MUST leave the prior renderer active.
- **FR-054**: A successful renderer update MUST emit the previous and replacement addresses and MUST
  emit the standard batch metadata-refresh signal for every existing tier credential.
- **FR-055**: `tokenURI` and renderer-detail reads MUST use the tier's current renderer after a
  successful update.
- **FR-056**: Changing a renderer MUST NOT change the tier's payment token, raw price, period,
  creator/supporter balances, membership time, capacity, rewards, referrals, fees, claims, ownership,
  art configuration, or media configuration.
- **FR-057**: Tier management MUST show the current renderer, let the current owner preview and select
  a compatible replacement using the tier's existing art/media inputs, explain that the change affects
  all existing and future membership artwork, and leave the final aesthetic decision to that owner.

### Key Entities

- **Accepted Payment Token**: A chain-scoped token approved for new membership tiers, including its
  contract address, enabled state, display metadata, decimal precision, and scaled-amount capability.
- **Tier Renderer State**: The tier's current owner-controlled renderer address paired with immutable
  tier art/media inputs; replacing the address changes presentation for all credentials but not
  membership economics or state.
- **Scaled UI Amount**: The current human-readable amount derived from a raw token amount and the
  token's current UI multiplier; it changes for display without changing settlement accounting.
- **Membership Payment Terms**: The immutable payment token, immutable raw price per period, period
  duration, and payout rates attached to one tier.
- **Protocol Fee Balance**: Fees held for the authorized recipient, attributed to the token in which
  members paid them.
- **Beta Deployment Profile**: The active Robinhood Chain testnet protocol version, accepted-token
  set, canonical public domain, and operator-facing deployment state for the public beta.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A fresh wallet can obtain all assets needed for one supported membership purchase from
  the official Robinhood Chain testnet faucet and complete the purchase without Backed By Fans
  operator assistance.
- **SC-002**: Each of the five Stock Tokens distributed by the official faucet at beta launch can be
  selected for a test tier and used for a complete join-and-renew journey.
- **SC-003**: 100% of user-facing payment amounts in creator, supporter, account, and management
  journeys use the selected token's symbol, decimal precision, and current multiplier where
  applicable; privileged CLI/Safe accounting remains explicit raw units.
- **SC-004**: In a representative two-for-one multiplier change, displayed subscription amounts
  increase by exactly two times while all raw balances, raw charges, liabilities, and purchased time
  remain unchanged except for ordinary transactions initiated by the tester.
- **SC-005**: Disabling an accepted token prevents 100% of new-tier publication attempts with that
  token while all tested existing-tier operations remain available when the token itself transfers.
- **SC-006**: Protocol fees accumulated in at least two different accepted tokens can be identified
  and withdrawn independently.
- **SC-007**: The canonical public domain successfully completes the documented creator, supporter,
  account, renderer, agent-skill, and faucet smoke journeys on Robinhood Chain testnet.
- **SC-008**: The future mainnet deployment profile contains exactly one initially enabled payment
  token, canonical USDG, and no mainnet transaction is submitted as part of this beta feature.
- **SC-009**: In owner, former-owner, invalid-renderer, and successful-replacement tests, 100% of
  unauthorized or incompatible updates preserve the prior renderer, while a successful update changes
  every tested credential's renderer output and changes none of its economic or membership state.

## Assumptions

- The official Robinhood Chain testnet faucet continues to provide enough test ETH for gas and five
  Stock Tokens for beta participation; temporary faucet outages remain an external dependency.
- Robinhood Chain testnet assets have no monetary value and are used only to test product behavior.
- The five supplied faucet Stock Token addresses implement ordinary ERC-20 transfers, use 18 decimal
  places, and expose ERC-8056 scaled UI amounts; those properties are validated on chain before
  operator-approved deployment.
- Testnet USDG at `0x7E955252E15c84f5768B83c41a71F9eba181802F` is an external launch token. Backed By Fans does not
  deploy or operate a substitute USDG faucet or token.
- Pre-release test tiers do not require migration to the beta protocol version; the active beta
  deployment is identified explicitly and earlier contracts remain onchain without being promoted.
- The existing wallet transaction lifecycle remains responsible for connection, chain switching,
  submission, receipt handling, replacement, cancellation, and revert reporting.
- Tier art and media configuration remain fixed in this feature; renderer replacement reuses those
  inputs and does not provide an art/media mutation path.
- The beta continues to use direct onchain reads and does not require a mandatory backend, indexer,
  account system, or custodial signer.
- The user controls `backedbyfans.xyz`; DNS and hosting promotion are operator-authorized release
  actions.
- Mainnet deployment, real-value Stock Token payments, and any eligibility controls for those
  payments require a separate specification and explicit authorization.
