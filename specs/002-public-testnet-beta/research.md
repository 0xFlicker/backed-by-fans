# Phase 0 Research: Public Testnet Beta

## Decision 1: Keep the accepted-token registry inside `MembershipFactory`

**Decision**: Replace the factory's one immutable payment token with an append-only token-address
array plus listed/enabled state. Seed initial tokens in the constructor. Owner-only changes toggle
eligibility for new tiers; disabled tokens remain listed for historical interpretation.

**Rationale**: The factory already decides whether a tier is official and executes tier creation, so
it is the narrowest place that can atomically enforce token eligibility. A second registry contract
would introduce another address, deployment, authenticity dependency, and failure mode without adding
authority the product needs.

**Alternatives considered**:

- Separate payment-token registry contract: rejected as unnecessary indirection for one factory and
  one operator authority.
- Web-only token list: rejected because direct calls could create unsupported tiers and the accepted
  set would not be onchain source of truth.
- Arbitrary token address on each tier: rejected because fee-on-transfer or incompatible tokens can
  violate exact raw accounting and because the requested policy is operator-configurable acceptance.

## Decision 2: Select the token during tier creation and never edit it

**Decision**: Add `paymentToken` to `MembershipTypes.TierConfig`; validate it is enabled in the same
`createTier` call; pass it to the existing deployer and immutable tier constructor.

**Rationale**: `MembershipTier` already holds an immutable token and implements all transfers against
that token. This preserves the proven accounting boundary and gives creators one publication
transaction rather than a token-setting transaction followed by deployment.

**Alternatives considered**:

- Mutable tier token: rejected because liabilities, approvals, claims, and previously communicated
  terms would become ambiguous.
- Factory default plus optional override: rejected because it preserves two semantic paths and could
  silently select the wrong token.

## Decision 3: Raw units are the only protocol accounting unit

**Decision**: Store and transfer only raw ERC-20 units. Convert a creator-entered displayed amount
once at publication. Read the current multiplier whenever displaying amounts; never rewrite tier
state after a multiplier change.

**Rationale**: Robinhood documents Stock Tokens as 18-decimal ERC-20s whose raw balances remain
static while `uiMultiplier()` adjusts the user-facing shares-per-token amount. ERC-8056 likewise
specifies that standard ERC-20 operations continue in raw amounts. This matches the user's
subscription mental model: a split changes `0.05` displayed Stock Token to `0.10`, while the same raw
charge continues.

**Sources**:

- [Robinhood Chain Stock Tokens](https://docs.robinhood.com/chain/stock-tokens/)
- [ERC-8056 Scaled UI Amount Extension](https://eips.ethereum.org/EIPS/eip-8056)

**Alternatives considered**:

- Rewrite tier raw prices after a corporate action: rejected because it requires coordinated writes
  and risks changing settlement economics.
- Dollar-denominated subscriptions using an oracle: rejected because it is a different product with
  slippage, timing, and market-risk requirements.
- Call optional token conversion helpers: rejected as a hard dependency because ERC-8056 makes those
  helpers optional; deterministic positive-integer BigInt math is sufficient in the browser.

## Decision 4: Detect scaled tokens through ERC-165 and read multiplier state live

**Decision**: Treat ERC-8056 core (`0xa60bf13d`) and pending-multiplier (`0x4bd27648`) support as the
scaled-token capability. Read `uiMultiplier`, `newUIMultiplier`, and `effectiveAt` live. Do not store
multiplier values in the Backed By Fans registry.

**Rationale**: The multiplier is issuer-controlled, time-dependent presentation state. Caching it as
protocol metadata would become stale and could show the wrong subscription amount. The standard
requires ERC-165 support, 18-decimal multiplier precision, and the pending extension; conversion and
UI-balance interfaces are optional.

**Source**: [ERC-8056 interface detection and pending multiplier](https://eips.ethereum.org/EIPS/eip-8056)

**Alternatives considered**:

- Store multiplier at token admission: rejected because corporate actions are expected to change it.
- Infer scaled support by probing `uiMultiplier()` only: rejected because ERC-165 gives an explicit
  standard capability boundary.
- Depend on Robinhood's REST API for normal rendering: rejected because the current product uses
  direct onchain reads and the API is unnecessary for settlement/display correctness.

## Decision 5: Compose accepted-token information in the web read model

**Decision**: Factory enumeration supplies address and listed/enabled policy. The web reads ERC-20
name, symbol, decimals, wallet balance, and allowance directly, and reads ERC-8056 state when
supported. The deployment preflight verifies all launch-token metadata and capabilities before the
operator gate.

**Rationale**: Name, symbol, decimals, and multiplier are properties of the token contract rather
than Backed By Fans accounting. Avoiding duplicated strings and decimals keeps the registry small and
prevents an operator-entered metadata typo from becoming canonical. The plan still meets the product
requirement by exposing one composed `AcceptedPaymentToken` read model.

**Alternatives considered**:

- Persist all token display metadata in the factory: rejected as duplicated token state requiring a
  refresh/update policy.
- Fetch metadata only from an offchain catalog: rejected because the beta must remain usable without
  a mandatory backend.

## Decision 6: Use one exact amount module and the clarified rounding rule

**Decision**: Parse the creator's displayed decimal at the token's decimals, convert to the nearest
raw unit with positive integer math, and use exact raw units for wallet requests. Display raw amounts
through the current multiplier and apply normal rounding to at most three meaningful fractional
digits after leading fractional zeros, trimming trailing zeros.

**Rationale**: One module prevents creator, supporter, account, and operator surfaces from drifting.
The user explicitly selected nearest-raw conversion and examples such as `0.049999999 -> 0.05`,
`0.000123456 -> 0.000123`, and `12.3456 -> 12.346`.

**Alternatives considered**:

- Always show three decimal places: rejected because small token amounts would become zero.
- Show the token's full precision everywhere: rejected as unreadable for ordinary product surfaces;
  exact raw terms remain available in technical detail and onchain.
- Truncate: rejected because the accepted requirement is normal rounding.

## Decision 7: Make protocol fees token-addressed

**Decision**: Replace global factory-fee balance/withdrawal assumptions with `balanceOf(factory)` and
`withdrawProtocolFees(token)` per listed token. Emit the token address with every withdrawal.

**Rationale**: Fees arrive in the tier's immutable token. A token-addressed withdrawal prevents one
broken token from blocking visibility or withdrawal of another and keeps attribution auditable.

**Alternatives considered**:

- Swap all fees to USDG: rejected because it adds routing, slippage, approvals, and an oracle/DEX
  dependency outside scope.
- One batch withdrawal over every token: rejected as the only path because a reverting token could
  block the whole batch.

## Decision 8: Freeze launch addresses immediately before deployment

**Decision**: Testnet's manifest contains the user-confirmed external testnet USDG and five faucet
Stock Tokens below. The launch workflow validates each address on chain before generating an approved
deployment payload. The future mainnet manifest contains only canonical mainnet USDG.

| Token | Robinhood Chain testnet address              |
| ----- | -------------------------------------------- |
| USDG  | `0x7E955252E15c84f5768B83c41a71F9eba181802F` |
| AMD   | `0x71178BAc73cBeb415514eB542a8995b82669778d` |
| NFLX  | `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93` |
| PLTR  | `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0` |
| AMZN  | `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02` |
| TSLA  | `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` |

**Rationale**: Address selection is now a confirmed release input. Onchain code, metadata, and
ERC-8056 preflight still fail closed before deployment because test contracts can change. Backed By
Fans does not deploy an internal USDG substitute.

**Source**: [Official Robinhood Chain testnet faucet](https://faucet.testnet.chain.robinhood.com/)

**Alternatives considered**:

- Leave launch addresses as placeholders: rejected after the operator supplied the intended contracts.
- Discover tokens from a user's browser wallet at runtime: rejected because wallet holdings do not
  define protocol policy.

## Decision 9: Keep token administration out of the public website

**Decision**: Seed the six launch tokens in the deployment manifest. Later enable/disable and
token-specific fee-withdrawal operations use reviewed CLI calldata submitted through the protocol Safe
or authorized deployer. The Backed By Fans web application reads accepted-token state but does not
provide operator controls.

**Rationale**: Administration is infrequent, privileged protocol work. A dedicated operator website
would add authentication, transaction, and maintenance surface without improving the creator or
supporter beta.

**Alternatives considered**:

- Backed By Fans operator page: rejected as out of scope.
- Browser-discovered token admission: rejected because wallet contents do not define protocol policy.

## Decision 10: Stage, test, then promote the exact web artifact

**Decision**: Use a Vercel project rooted at `web`, create a production-like staged deployment with
automatic production-domain assignment disabled, test it, then explicitly promote the same artifact
to `backedbyfans.xyz`. Record the prior deployment for routing-layer rollback.

**Rationale**: Vercel promotion changes the current production alias without rebuilding, so the
artifact exercised by the operator is the artifact served publicly. Vercel rollback can restore a
prior deployment without touching contracts.

**Sources**:

- [Vercel: Promoting deployments](https://vercel.com/docs/deployments/promoting-a-deployment)
- [Vercel: Rolling back a production deployment](https://vercel.com/docs/deployments/rollback-production-deployment)

**Alternatives considered**:

- Build a second time for production: rejected because it weakens artifact identity.
- Couple web rollback to a contract redeployment: rejected because deployed protocol state is
  immutable and web routing cannot undo onchain actions.

## Decision 11: Use Robinhood's product terminology without implying endorsement

**Decision**: External copy uses “Robinhood Chain” in full and “Stock Token.” The beta plainly says it
uses testnet/test assets and does not describe memberships as equity, investment, yield, or fixed
dollar value. Robinhood marks are not incorporated into membership artwork or token metadata.

**Rationale**: This follows the project constitution and Robinhood's current brand guidance while
keeping the product explanation factual.

**Source**: [Robinhood Chain brand guidelines](https://docs.robinhood.com/chain/brand-guidelines/)

## Decision 12: Let the current tier owner fully customize presentation, not membership terms

**Decision**: Store the renderer, art configuration, and media configuration as one owner-controlled
presentation. Replace the renderer-only mutation with an atomic `setPresentation` operation that
validates the renderer's code and schema, validates the complete proposed art/media configuration,
and assigns all three values together. It emits previous/new presentation identity and the standard
batch metadata-refresh event. Economic and membership state stay unchanged.

**Rationale**: An immutable address does not guarantee immutable artwork because the renderer contract
can already produce time-dependent or otherwise dynamic output. Explicit tier-owner control is more
honest and useful. The same principle applies to the engine, art direction, and image inputs that the
renderer consumes: creators need the complete studio to correct a mistake or intentionally refresh
presentation without redeploying the tier or disturbing memberships. Using the current
`Ownable2Step` owner also makes authority transfer with the tier instead of remaining attached to the
original creator.

**Alternatives considered**:

- Keep the address immutable: rejected because it prevents creator-directed correction without
  preventing renderer-directed visual change.
- Keep art/media fixed while changing only the renderer: rejected because it produces a partial
  management studio and prevents creators from using the same customization model after publication.
- Add separate renderer, art, and media setters: rejected because partial success could leave an
  unintended combination active and require multiple metadata refreshes.
- Route updates through the factory owner or renderer registry: rejected because presentation belongs
  to the tier owner and compatible direct renderer addresses intentionally bypass platform curation.
- Pin renderer runtime codehash: rejected because the existing renderer contract deliberately does not
  promise static bytecode/output identity and the product presents results for creator judgment rather
  than certifying permanence.

## Decision 13: Reopen Art Studio on a dedicated tier artwork route

**Decision**: Keep tier management as the operational summary and link its artwork section to a
dedicated full-width `/chains/{chainId}/tiers/{tierAddress}/manage/artwork` route. The route reuses the
complete creation-time Creator Studio, initializes it from the tier's current presentation, and saves
through the established wallet transaction lifecycle.

For an existing onchain image or image removal, the tier presentation update is one transaction. For
a new local image, the existing canonical media-store deployment runs first, followed by the atomic
tier presentation update. A successful media deployment is reusable even if the later tier update is
canceled or fails.

**Rationale**: The management page's locked-economics sidebar intentionally constrains its controls
column. Compressing the studio into that column hides renderer engines and image tools and makes the
preview secondary. A dedicated route preserves the studio's established preview-first hierarchy
without coupling this work to a broader management-page redesign.

**Alternatives considered**:

- Expand the studio inline inside tier management: rejected because it remains constrained by the
  locked-terms layout and makes a long operational page substantially harder to navigate.
- Redesign the entire management page in the same change: rejected because the dedicated artwork
  route solves the immediate information-architecture problem while leaving a broader management UX
  pass independently reviewable.

## Resolved unknowns

- Registry ownership: existing factory owner.
- Registry placement: existing factory, not another contract.
- Tier token mutability: immutable.
- Settlement denomination: raw units.
- Multiplier effect: presentation only, read live.
- Optional ERC-8056 helpers: not required.
- Conversion rounding: nearest raw unit.
- Display precision: at most three meaningful fractional digits after leading fractional zeros.
- Testnet funding: official faucet; no Backed By Fans faucet.
- Mainnet scope: profile inspection only, USDG-only; no deployment.
- Production release: staged artifact, explicit promotion, route-only rollback.
- Published renderer: mutable only by the current tier owner after compatibility checks; all other
  tier presentation inputs and membership/economic state remain fixed.

The exact five testnet Stock Token addresses are a deployment input to freeze and validate before
broadcast, not an unresolved feature requirement.
