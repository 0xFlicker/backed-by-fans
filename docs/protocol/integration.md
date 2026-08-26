# Protocol integration guide

This guide describes direct-chain integration with Backed By Fans v1. It is
not a deployment registry. Resolve addresses from a signed deployment manifest,
then verify them against chain state before enabling a transaction.

## Authenticity and discovery

Treat `MembershipFactory.isRegisteredTier(tier)` as the authoritative O(1)
authenticity check. Also verify that the tier reports the expected `factory`,
`paymentToken`, renderer, immutable terms, and ERC interfaces. A familiar name,
symbol, event, or metadata document is not proof of authenticity.

For bounded discovery, capture one block number, read `tierCount()` at that
block, and page `tiers(offset, limit)` at the same block. `limit` cannot exceed
`maxPageSize()` (100). The registry is append-only, but an unpinned sequence of
reads can otherwise mix two different views of the registry.

## Identity, activity, and capacity

Each recipient is minted at most one sequential ERC-721 credential. The token
is permanent and soulbound: `ownerOf`, `balanceOf`, and `tokenOf` describe
historical identity, not current membership. Never authorize access from those
values alone.

Use `isActive(account)`, `isActiveToken(tokenId)`, or `activeBalanceOf(account)`
for current authorization. `expiresAt(tokenId)` is the authoritative expiration
view. `timeBalances(tokenId)` separates remaining paid seconds from later grant
seconds; time consumes paid first. These views derive elapsed time without
requiring a metadata refresh or checkpoint transaction.

Capacity is deliberately separate from activity. An expired or refunded token
may still return `isOccupied(tokenId) == true` until anyone calls
`synchronize(tokenId)`. An active token is a no-op to `synchronize`; an inactive,
occupied token releases exactly one slot. Use `occupiedSupply`, not `totalMinted`
or active balances, when presenting supply availability. A final purchase can
still lose a capacity race between simulation and confirmation.

## Payments and attribution

Fixed-price tiers use `purchase(periods, referralChoice)` for self-purchases and
`gift(recipient, periods, expectedReferralStatus, expectedReferrer)` for gifts.
Read the recipient's current referral tuple while previewing and pass that exact
tuple to the gift. If the recipient locks a choice before mining, the gift
reverts before payment instead of silently changing the split. Zero-price tiers
use `contribute(gross, referralChoice)` and always add exactly one period. A zero
contribution creates no shares, fees, rewards, or referral lock. Positive
contributions use the normal accounting path. Zero-price third-party actions
are unsupported.

Referral state is one of `Unset`, `LockedNone`, or `LockedAddress`. The first
positive self-payment atomically locks an explicit choice for the credential.
A zero address means explicit none. A later choice cannot replace it. Gifts do
not lock a recipient's choice; once the recipient has locked a referrer, later
gifts use that existing attribution. Self-referral is allowed.

Every positive gross payment permanently issues reward shares to the recipient
token. Shares never disappear after expiry, synchronization, or refund. New
shares do not receive rewards allocated before they existed, but do participate
in the reward cut from the payment that created them.

## Fixed payout identities

Payout destinations cannot be redirected by a caller:

- reward claims go to the current owner of the credential token;
- referral claims go to the locked referrer address;
- creator proceeds go to the current tier owner;
- protocol fees go to the factory's current fee recipient; and
- refunds go to the credential owner, while the current tier owner authorizes
  `refund(tokenId, maxGrossRefund, maxOwnerTopUp)` and supplies no more than
  those ceilings.

Frozen or otherwise incompatible destinations make the exact transfer revert
atomically. The liability remains claimable; there is no administrator redirect.
Claims, creator withdrawals, protocol withdrawals, and refunds remain callable
while a tier is paused.

## Events and rereads

Use events for discovery and user feedback, then reread authoritative state at
the confirmed block. Important protocol events include:

- factory: `TierCreated`, `TierTermsConfigured`, `TierMetadataConfigured`,
  `FeeRecipientUpdated`, and `ProtocolFeesWithdrawn`;
- lifecycle: `MembershipTimeUpdated`, `SubscriptionUpdate`,
  `MembershipSynchronized`, `PauseUpdated`, cap changes, and metadata updates;
- accounting: `PaymentProcessed`, `PaymentAllocated`, `ReferralLocked`,
  `SharesIssued`, `RewardPerShareUpdated`, the three claim/withdraw events, and
  `MembershipRefunded`; and
- ownership: OpenZeppelin `OwnershipTransferStarted` and
  `OwnershipTransferred` for both factory and tier.

An event index is optional convenience infrastructure, never a source of truth.
After a replaced, dropped, reverted, or uncertain transaction, locate the final
receipt if possible and reread the direct contract state before showing success.

## Standards

The credential exposes ERC-165, ERC-721 identity, ERC-5192 locking, ERC-4906
metadata update events, and the supported ERC-5643 subscription adapter. ERC-5643
renewal accepts exact whole-period durations only. It cannot silently choose
`LockedNone`: a positive fixed-price credential with `Unset` attribution must use
the canonical purchase path first. ERC-5643 cancellation is the creator-owned
full-refund adapter, not a supporter-controlled cancellation right. Because the
standard signature has no top-up ceiling, it deliberately permits any required
owner top-up; operator interfaces should use the canonical bounded refund.
