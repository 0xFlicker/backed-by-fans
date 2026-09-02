# Phase 1 Data Model: Public Testnet Beta

## Onchain entities

### AcceptedTokenState

Factory-owned policy for one payment-token address.

| Field     | Type      | Meaning                                                                        |
| --------- | --------- | ------------------------------------------------------------------------------ |
| `token`   | `address` | Chain-scoped ERC-20 contract identity; supplied by array position or event key |
| `listed`  | `bool`    | Token has been admitted at least once and remains enumerable permanently       |
| `enabled` | `bool`    | Token may be selected by a new tier at the instant `createTier` succeeds       |
| `index`   | `uint256` | Stable append-only position in factory enumeration                             |

**Rules**:

- Zero address, duplicate initial entries, and addresses without code are invalid.
- A listed token is never removed from enumeration.
- Disablement changes only new-tier eligibility.
- Re-enabling a listed token reuses its stable index.
- The factory does not store name, symbol, decimals, balances, or multiplier values.
- Launch entries come from the reviewed chain manifest. Later status changes are submitted through
  reviewed CLI calldata by the protocol Safe or authorized deployer, not an application operator UI.

### TierConfig

Creator-supplied publication input extended with one field.

| Added field    | Type      | Meaning                              |
| -------------- | --------- | ------------------------------------ |
| `paymentToken` | `address` | Enabled token selected for this tier |

**Validation order**:

1. Creator, salt, time, rate, renderer, and media checks remain.
2. `paymentToken` must be listed and enabled immediately before publication state is consumed.
3. The validated address is passed to the tier constructor.
4. Publication events identify the token alongside the raw price.

### MembershipPaymentTerms

Permanent terms stored by each tier.

| Field            | Type      | Mutability       | Meaning                                    |
| ---------------- | --------- | ---------------- | ------------------------------------------ |
| `paymentToken`   | `IERC20`  | Immutable        | Token used for all tier payment operations |
| `pricePerPeriod` | `uint256` | Immutable        | Raw token units charged for one period     |
| `periodDuration` | `uint64`  | Immutable        | Seconds purchased per period               |
| `rewardBps`      | `uint16`  | Immutable        | Reward share of raw payment                |
| `referralBps`    | `uint16`  | Immutable        | Referral share of raw payment              |
| `protocolFeeBps` | `uint16`  | Factory constant | Protocol share of raw payment              |

All proceeds, liabilities, claims, refunds, allowances, and transfers remain raw integers in
`paymentToken` units. Multiplier changes do not mutate this entity.

### TierRendererState

Owner-controlled presentation pointer stored by each tier.

| Field      | Type          | Mutability                  | Meaning                                   |
| ---------- | ------------- | --------------------------- | ----------------------------------------- |
| `renderer` | `address`     | Current owner only          | Contract used by every `tokenURI` call    |
| `art`      | `ArtConfig`   | Fixed in this feature       | Existing renderer design inputs           |
| `media`    | `MediaConfig` | Fixed in this feature       | Existing optional onchain image reference |
| `owner`    | `address`     | Existing two-step ownership | Wallet authorized to replace `renderer`   |

**Rules**:

- A candidate must have code, expose the factory's expected renderer schema, and accept the stored
  `art` and `media` configuration.
- Registry membership is not part of compatibility.
- Validation completes before the renderer storage write, so any failure preserves the old address.
- A successful update emits previous and new renderer addresses.
- If credentials exist, a successful update emits `BatchMetadataUpdate(1, totalMinted)`.
- Ownership transfer changes renderer-update authority automatically.
- Renderer replacement does not write any payment, membership, ownership, art, or media field.

### ProtocolFeeBalance

The factory's withdrawable balance is derived per token rather than stored as one global number.

| Field        | Type      | Meaning                            |
| ------------ | --------- | ---------------------------------- |
| `token`      | `address` | Listed payment token               |
| `rawBalance` | `uint256` | `IERC20(token).balanceOf(factory)` |
| `recipient`  | `address` | Current factory fee recipient      |

**Rules**:

- Withdrawal names one token and transfers its full current raw balance.
- Exact before/after balance checks remain mandatory.
- Failure for token A does not prevent a separate withdrawal of token B.
- Withdrawal event includes token, recipient, and raw amount.

## Browser read models

### AcceptedPaymentToken

Composed direct-read model used for selection and display.

| Field                | Source                  | Meaning                                      |
| -------------------- | ----------------------- | -------------------------------------------- |
| `chainId`            | active deployment       | Must be `46630` in beta                      |
| `factory`            | active deployment       | Protocol-version-scoped registry source      |
| `address`            | factory enumeration     | Token identity                               |
| `listed`             | factory                 | Historical acceptance                        |
| `enabled`            | factory                 | Available for new tiers                      |
| `name`               | ERC-20 metadata         | Human-readable token name                    |
| `symbol`             | ERC-20 metadata         | Amount suffix and selection label            |
| `decimals`           | ERC-20 metadata         | Raw/display base precision                   |
| `scaledUI`           | ERC-165                 | Core and pending ERC-8056 support            |
| `uiMultiplier`       | token, when scaled      | Current 18-decimal display multiplier        |
| `newUIMultiplier`    | token, when scaled      | Current or scheduled 18-decimal value        |
| `effectiveAt`        | token, when scaled      | Timestamp for pending display change         |
| `walletRawBalance`   | ERC-20, when connected  | Sorting and funding readiness                |
| `walletRawAllowance` | ERC-20, action-specific | Approval readiness for selected tier         |
| `readBlock`          | RPC                     | Block context used for the composed snapshot |

**Ordering**:

1. Enabled tokens with `walletRawBalance > 0`, preserving registry order among ties.
2. Remaining enabled tokens in registry order.
3. Disabled tokens do not appear in new-tier selection.

**Failure state**: A failed metadata or multiplier read identifies the affected token and failed
operation. It does not synthesize metadata, assume multiplier `1`, substitute USDG, or disable
unrelated controls.

### TokenAmount

Shared representation for one amount on any surface.

| Field        | Type     | Meaning                                                           |
| ------------ | -------- | ----------------------------------------------------------------- |
| `raw`        | `bigint` | Exact authoritative contract/wallet amount                        |
| `decimals`   | `number` | Token base precision                                              |
| `multiplier` | `bigint` | `1e18` for unscaled tokens; live `uiMultiplier` for scaled tokens |
| `uiUnits`    | `bigint` | Display-space integer at token decimal precision after scaling    |
| `formatted`  | `string` | Rounded human amount without symbol                               |
| `symbol`     | `string` | Token label displayed adjacent to amount                          |

**Conversion into publication raw units** for non-negative amounts:

```text
uiUnits = parseDecimal(userInput, tokenDecimals)
raw = floor((uiUnits * 1e18 + floor(multiplier / 2)) / multiplier)
```

For an unscaled token, `multiplier = 1e18`, so `raw = uiUnits` exactly.

**Conversion for display**:

```text
uiUnits = floor(raw * multiplier / 1e18)
decimal = formatUnits(uiUnits, tokenDecimals)
formatted = roundMeaningfulFraction(decimal, 3)
```

The implementation may retain the rational remainder long enough to round correctly, but it must
never feed rounded display text back into settlement logic.

### ScheduledDisplayAdjustment

Optional explanatory data for a scaled token.

| Field               | Type     | Meaning                              |
| ------------------- | -------- | ------------------------------------ |
| `currentMultiplier` | `bigint` | Applied to current display           |
| `futureMultiplier`  | `bigint` | Scheduled value                      |
| `effectiveAt`       | `Date`   | Activation time                      |
| `currentFormatted`  | `string` | Amount shown now                     |
| `futureFormatted`   | `string` | Illustrative amount after activation |

The future value is informational and never used in current approval or payment calls.

### RendererUpdateDraft

Browser-only management state for the current tier owner.

| Field               | Type                          | Meaning                                                                                   |
| ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `currentRenderer`   | `Address`                     | Renderer currently read from the tier                                                     |
| `candidateRenderer` | `Address`                     | Default, owner-deployed, or Custom same-chain choice                                      |
| `art` / `media`     | existing tier snapshot        | Fixed inputs used for candidate preview                                                   |
| `previewState`      | idle/loading/ready/error      | Observed result for creator judgment, not certification                                   |
| `submissionState`   | established transaction state | wagmi/viem-owned connect, submit, receipt, replacement, cancellation, and error lifecycle |

The management page states that a successful update changes artwork for all existing and future
credentials. It does not require a renderer-registry record or an approve/reject ceremony.

### BetaDeploymentProfile

Checked-in release identity for one chain/protocol version.

| Field                                                                        | Meaning                                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `chainId`                                                                    | `46630` for public beta; `4663` for inspected future mainnet profile    |
| `protocolVersion`                                                            | New immutable deployment identity                                       |
| `factory`                                                                    | Active factory address after approved promotion                         |
| `initialRenderer`, `rendererRegistry`, `mediaStoreFactory`, `previewHarness` | Existing protocol roles keyed to the same version/chain                 |
| `initialPaymentTokens`                                                       | Ordered launch manifest                                                 |
| `canonicalSite`                                                              | `https://backedbyfans.xyz` for beta                                     |
| `sourceCommit` / artifact hashes                                             | Existing deployment provenance fields                                   |
| `status`                                                                     | Candidate, verified, or active according to existing promotion workflow |

## State transitions

### Accepted token

```text
unlisted --owner enables--> listed + enabled
listed + enabled --owner disables--> listed + disabled
listed + disabled --owner enables--> listed + enabled
```

There is no delete transition.

### Tier publication

```text
draft token choice
  -> refresh accepted-token state and multiplier
  -> convert displayed price to raw
  -> creator review
  -> wallet submits createTier(config.paymentToken, raw price)
  -> successful receipt
  -> immutable tier payment terms
```

If the token becomes disabled before successful execution, the transaction reverts and no tier is
created. The web refreshes the choices; it does not silently replace the token.

### Multiplier change

```text
raw tier/payment state unchanged
  + token uiMultiplier changes
  -> next direct read composes new multiplier
  -> all human amounts reformat
  -> future wallet writes still use original raw values
```

### Renderer replacement

```text
current renderer
  -> current owner selects direct same-chain candidate
  -> browser previews with existing tier art/media
  -> owner decides whether to submit setRenderer(candidate)
  -> contract validates code + schema + existing configuration
  -> successful receipt changes renderer and emits metadata refresh
  -> all tokenURI calls use candidate
```

Any validation failure, unauthorized caller, canceled/replaced transaction, or revert leaves the
current renderer and every other tier field unchanged. A later change in the renderer contract's own
output is outside tier storage and requires no Backed By Fans state transition.

## Display examples

| Exact display-space value       | Product display |
| ------------------------------- | --------------- |
| `0.049999999`                   | `0.05`          |
| `0.000123456`                   | `0.000123`      |
| `12.3456`                       | `12.346`        |
| `10.0000`                       | `10`            |
| raw `0.05` at multiplier `2e18` | `0.1`           |

Exact raw values remain available to transaction construction and technical detail regardless of
the shortened product display.
