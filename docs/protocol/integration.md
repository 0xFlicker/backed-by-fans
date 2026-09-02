# Protocol integration guide

This guide describes direct-chain integration with Backed By Fans v1. It is
not a deployment registry. Resolve addresses from the Wagmi-generated chain map,
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

Accepted payment tokens are independently enumerable through
`paymentTokenCount()` and `paymentTokens(offset, limit)`. Read each token's
metadata and optional ERC-8056 multiplier at the same captured block. A disabled
token remains listed so existing tiers retain their canonical interpretation;
disablement blocks only new tier publication.

## Identity, activity, and capacity

Each recipient receives at most one sequential token ID. `tokenOf(recipient)`
is the permanent wallet-to-record association. The ERC-721 is soulbound while
minted, but the current tier owner can burn it after expiration. Never authorize
access from `tokenOf` alone.

Before creator sync, use `isActive(account)`, `isActiveToken(tokenId)`, or
`activeBalanceOf(account)` for current authorization. `expiresAt(tokenId)` is
the strict ERC-5643 expiration view while the NFT exists. `timeBalances(tokenId)`
separates remaining paid seconds from later grant seconds and remains readable
for a known burned record; time consumes paid first.

Capacity is deliberately separate from activity. An expired or refunded token
may still return `isOccupied(tokenId) == true` until the current tier owner calls
`synchronizeExpiredMemberships(tokenIds)`. The batch must contain 1 through 100
known IDs. Duplicates, already-burned IDs, and memberships renewed before
execution are skipped; an unknown ID reverts the whole batch. Each still-expired
NFT is burned and releases its slot. Use `occupiedSupply`, not `totalMinted` or
active balances, when presenting supply availability. A rejoin can still lose a
capacity race between simulation and confirmation.

After creator sync, ordinary ERC-721 gates become accurate because `ownerOf`
reverts and `balanceOf` no longer counts the expired NFT. Third-party systems
that must work before sync still need `isActive` or `activeBalanceOf`. Indexers
may show a burned NFT briefly while they ingest the standard zero-address
`Transfer` event.

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
record. `sharesOf` never decreases. `rewardEligible(tokenId)` determines whether
those lifetime shares are currently included in `totalRewardShares`: refunds
and revocation of all remaining grant-only time suspend them immediately, while
natural expiration suspends them only when the creator syncs. Accrued rewards
remain claimable. Rejoining by purchase, contribution, gift, or grant remints
the same token ID, advances its reward checkpoint past the inactive interval,
reactivates lifetime shares, and adds any new payment shares.

## Fixed payout identities

Payout destinations cannot be redirected by a caller:

- reward claims go to the wallet permanently associated by `tokenOf`, including
  while its NFT is burned;
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
  `PaymentTokenListed`, `PaymentTokenEnabled`, `PaymentTokenDisabled`,
  `FeeRecipientUpdated`, and token-addressed `ProtocolFeesWithdrawn`;
- lifecycle: `MembershipTimeUpdated`, `SubscriptionUpdate`,
  `ExpiredMembershipSynchronized`, the standard burn `Transfer`, `PauseUpdated`,
  cap changes, and metadata updates;
- accounting: `PaymentProcessed`, `PaymentAllocated`, `ReferralLocked`,
  `SharesIssued`, `RewardEligibilityUpdated`, `RewardPerShareUpdated`, the three
  claim/withdraw events, and `MembershipRefunded`; and
- ownership: OpenZeppelin `OwnershipTransferStarted` and
  `OwnershipTransferred` for both factory and tier; and
- presentation: `PresentationUpdated` plus conditional ERC-4906
  `BatchMetadataUpdate` after an owner-authorized renderer, art configuration,
  or media configuration update.

An event index is optional convenience infrastructure, never a source of truth.
Wagmi and viem exclusively own receipt waiting, polling, replacement detection,
and transaction outcome classification. After they return a successful receipt,
the application may decode exact event fields from that supplied receipt and
reread the affected canonical contract state before showing product success.
The application does not persist write intents, rediscover receipts, scan
historical logs, or infer same-nonce outcomes.

## Standards

The credential exposes ERC-165, ERC-721 identity, ERC-5192 locking, ERC-4906
metadata update events, and the supported ERC-5643 subscription adapter. ERC-5643
renewal accepts exact whole-period durations only. It cannot silently choose
`LockedNone`: a positive fixed-price credential with `Unset` attribution must use
the canonical purchase path first, and `isRenewable(tokenId)` returns false until
that choice is locked. ERC-5643 cancellation is the creator-owned full-refund
adapter, not a supporter-controlled cancellation right. Because the standard
signature has no top-up ceiling, it deliberately permits any required owner
top-up; operator interfaces should pause, wait for confirmation, preview, and
use the canonical bounded refund before unpausing.

ERC-721 and ERC-5643 functions that require an existing NFT, including
`ownerOf`, `tokenURI`, `expiresAt`, and `isRenewable`, revert while a membership
is burned. Restoration is intentionally available only through the canonical
purchase, contribution, gift, and grant paths.
