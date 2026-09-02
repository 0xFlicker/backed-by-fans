# Contract: Accepted Payment Tokens

This document defines the planned external behavior. Exact Solidity layout may be refined during
implementation, but the semantics and evidence requirements are binding.

## Factory reads

```solidity
function paymentTokenCount() external view returns (uint256);

function paymentTokens(uint256 offset, uint256 limit)
    external
    view
    returns (address[] memory page);

function isPaymentTokenListed(address token) external view returns (bool);

function isPaymentTokenEnabled(address token) external view returns (bool);
```

- Pagination follows the factory's existing bounded-page convention.
- Enumeration is append-only and stable.
- Listed and enabled are separate so disabled tokens used by existing tiers remain interpretable.

## Factory writes

```solidity
function setPaymentTokenEnabled(address token, bool enabled) external;

function createTier(MembershipTypes.TierConfig calldata config)
    external
    returns (address tier);

function withdrawProtocolFees(IERC20 token) external returns (uint256 amount);
```

### `setPaymentTokenEnabled`

- Only the factory owner may call it.
- Enabling a new address requires nonzero deployed code and appends it once.
- Enabling an already enabled token and disabling an already disabled token are idempotent no-ops and
  emit no duplicate status event.
- Disabling never removes the address and never mutates an existing tier.
- Administrative writes are prepared as reviewed CLI calldata and submitted through the protocol Safe
  or authorized deployer. No Backed By Fans operator web interface is required.

### `createTier`

- `TierConfig` includes `address paymentToken`.
- The token must be enabled at execution time.
- Eligibility is checked before the tier salt is consumed.
- The selected token is passed to the immutable tier constructor.
- No default token or fallback is applied.

### `withdrawProtocolFees`

- Caller must be the fee recipient under the existing authorization rule.
- Token must be listed so the method cannot become an arbitrary token sweeper.
- The full current raw balance for the named token is transferred.
- Existing exact-transfer before/after checks apply independently per token.
- A failure for one token has no effect on another token's independent call.

## Events

```solidity
event PaymentTokenListed(address indexed token, uint256 indexed tokenIndex);

event PaymentTokenEnabled(address indexed token);

event PaymentTokenDisabled(address indexed token);

event TierTermsConfigured(
    address indexed tier,
    address indexed paymentToken,
    uint256 pricePerPeriod,
    uint64 periodDuration,
    uint16 rewardBps,
    uint16 referralBps,
    uint64 supplyCap,
    uint64 maxPrepaidPeriods
);

event ProtocolFeesWithdrawn(
    address indexed token,
    address indexed recipient,
    uint256 amount
);
```

Event names may be collapsed (for example, one status event with `bool enabled`) if doing so produces
a clearer ABI, but token identity, status, stable index where first listed, and raw withdrawal amount
must remain observable.

## Errors

The ABI must provide distinct, actionable failures for:

- zero/non-contract token;
- duplicate constructor token;
- payment token not enabled during publication;
- token not listed during fee withdrawal;
- unauthorized status change or withdrawal;
- inexact token transfer;
- invalid pagination.

## Authenticity contract

An active tier is authentic when:

1. the chain ID and active factory version match deployment configuration;
2. the factory reports the tier registered;
3. the tier's own `factory()` equals that active factory;
4. the tier's immutable `paymentToken()` is listed by that factory;
5. the remaining established tier interface/identity checks pass.

The token does not need to remain enabled for an existing tier to be authentic. A disabled listed
token is rejected only for new tier publication.

## Required protocol test cases

- Constructor seeds six unique deployed token addresses in stable order.
- A newly enabled token appends once and can create a tier.
- A disabled token cannot create a new tier and does not consume its tier salt.
- An existing tier using a disabled token continues normal operations when the token transfers.
- A tier permanently returns its selected token.
- Two tiers using different tokens account and claim independently.
- Fees in two tokens are visible and withdraw independently.
- A reverting/inexact token does not block withdrawal of another token.
- Fee-on-transfer, false-return, reentrant, zero, EOA, and unlisted token paths fail explicitly.
- Factory/tier invariants cover token-specific assets, liabilities, and conservation.
