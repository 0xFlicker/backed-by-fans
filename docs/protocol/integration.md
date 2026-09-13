# Protocol integration guide

This guide describes the implemented transferable membership lifecycle. Resolve
public addresses and bindings through the existing Foundry/Wagmi generation,
then verify the selected deployment onchain before enabling transactions. The
canonical API is in `contracts/src/interfaces/IMembershipTier.sol`,
`IMembershipFactory.sol`, and `contracts/src/types/MembershipTypes.sol`.

## Authenticity and standards

Use `MembershipFactory.isRegisteredTier(tier)` for the O(1) registration check.
Verify the tier's `factory`, `paymentToken`, renderer, immutable terms and
supported interfaces. A familiar name, symbol or metadata document does not
establish authenticity. Require the current compiler-derived `IMembershipTier`
interface ID, `0x584eb4c9`, as well as the public standards below.

| Interface                    | ERC-165 ID   |
| ---------------------------- | ------------ |
| ERC-165                      | `0x01ffc9a7` |
| ERC-721                      | `0x80ac58cd` |
| ERC-721 metadata             | `0x5b5e139f` |
| ERC-721 enumeration          | `0x780e9d63` |
| ERC-5643 subscriptions       | `0x8c65f84d` |
| ERC-4906 metadata updates    | `0x49064906` |
| Current membership positions | `0x584eb4c9` |

ERC-5192 locking is not supported. Never infer this lifecycle from registration
or ERC-721 support alone.

## Bounded discovery and access

Capture one block number, read `tierCount()`, and page `tiers(offset, limit)` at
that same block. The factory's `maxPageSize()` is 100. Accepted payment tokens
are independently enumerable using `paymentTokenCount()` and
`paymentTokens(offset, limit)`; read token metadata and any ERC-8056 multiplier
at the same block. Disabling a listed payment token blocks new tier publication
with that token, while existing tiers retain their payment currency.

A wallet may own any number of independent positions in one tier, subject to
tier capacity. Page `tokensOfOwner(owner, offset, limit)` with a nonzero owner
and `1 <= limit <= 100`. Its `PositionPage` returns `tokenIds`, `nextOffset`,
`balance` and `complete`. An offset at or beyond the balance returns an empty,
completed page. Pin every ownership page and its details to the same block:
transfers and burns can reorder owner indices. Start again from offset zero
when refreshing at a new block. Do not scan all lifetime token IDs.

Identify a position by `(chainId, tierAddress, tokenId)` in URLs, selections,
queries and caches. Keep tier/beneficiary balances separate; grouping positions
under a tier must not overwrite them. Label incomplete discovery and totals.
There is no wallet-to-single-token lookup or automatic default membership.

Authorize access using `ownerOf(tokenId)` together with
`isActiveToken(tokenId)` at the same block. An owned live token proves access;
proving a wallet has no live positions requires complete ownership discovery.
`balanceOf` counts extant NFTs, including expired ones awaiting maintenance,
and does not prove active access. Expiration is inclusive: at
`block.timestamp >= expiresAt(tokenId)`, access, transfer and renewal end.

`hasClaimInterest(beneficiary)` also discovers creator rights, referral streams
and credits, and retired member credit, including fractions below one payment
unit. Keep such tiers in account discovery even when the wallet owns no NFT.

## Explicit creation and renewal

Creation always mints a new monotonically increasing token ID, even when the
recipient already owns positions in the tier. Renewal extends only the selected
live token. An expired ID cannot receive time, be reminted or recover its old
weight; returning uses an explicit creation action.

| Action                              | Entry point                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Fixed-price self-purchase           | `createMembership(periods, referralChoice)`                                              |
| Fixed-price owner renewal           | `renewMembership(tokenId, periods, referralChoice)`                                      |
| Contribution-tier creation          | `createContributionMembership(gross, referralChoice)`                                    |
| Contribution-tier owner renewal     | `renewContributionMembership(tokenId, gross, referralChoice)`                            |
| Fixed-price gift of a new position  | `giftMembership(recipient, periods)`                                                     |
| Fixed-price gift renewal            | `giftRenewal(tokenId, expectedOwner, periods, expectedReferralStatus, expectedReferrer)` |
| Creator grant of a new position     | `grantMembership(recipient, periods)`                                                    |
| Creator addition to a live position | `addGrantTime(tokenId, expectedOwner, periods)`                                          |

Self-funded renewal requires the actual NFT owner. Gifts are paid by their
caller; self-gifting is rejected. Gift renewal validates the selected token's
current owner and referral tuple before accepting payment. Grants require the
tier's current `owner()`. A transfer after preview makes an expected-owner
quote stale; reread and obtain a fresh confirmation.

Contribution tiers have `pricePerPeriod() == 0`; each contribution adds one
period. Gross may be zero, or must meet `minimumPayment()` when positive. A
zero contribution adds time without funding earnings, issuing shares or locking
a referral. Contribution-tier gifting is not supported. Complimentary grants
also add no shares or funded earnings. Paid time is consumed before grant time.

All time additions, including free contributions and grants, complete bounded
accounting catch-up and maintain the expiration schedule. Creation checks
capacity after catch-up releases expired slots. Prepayment, duration, payment
and referral limits still apply. If more maintenance is needed, submit it
explicitly, then refresh the quote and simulate the intended action again.

## Referral choice, weight and transfers

Referral state is `Unset`, `LockedNone` or `LockedAddress`. The first positive
owner payment locks the token's choice; zero address explicitly selects none.
A later owner payment must respect the lock. New gifts leave it Unset, and gift
renewals preserve the current choice. Self-referral is allowed. A transferred
lock remains unchanged even if its referrer is the new owner's address.

Positive payments issue weight to the selected token under the tier's immutable
curve. `previewShares(gross)` reports the current lifetime-volume cursor and
newly issued shares. `lifetimeGross()` never decreases through refund or
retirement, so fresh positions earn only new weight at the current curve.
Neither a quote nor a pending transaction reserves a point on that curve.

Standard `transferFrom` and both `safeTransferFrom` overloads move the entire
live position: remaining time, accumulated shares, eligibility, unclaimed
member rewards, funding history and referral choice stay with its token ID.
The former owner loses position authority; the recipient gains it, including
the rights to claim and renew. Historical payer data does not establish current
ownership, and existing referral beneficiaries do not change.

Live transfers remain available while paused and never invoke accounting
catch-up. A funding or expiration backlog cannot block an otherwise valid live
transfer. Transfer leaves the position's accounting and schedules untouched.
An expired unburned NFT cannot transfer, regardless of approval or maintenance
progress. Prefer safe transfer so recipient-contract acceptance is checked;
receiver rejection reverts the whole transaction.

ERC-721 `approve` and `setApprovalForAll` authorize transfers only. They grant
no owner-only claim or renewal rights and no creator refund, cancellation or
grant authority. Approvals remain usable while paused; token approval clears
on transfer and burn. An approved address may sponsor time under the same
independent gifting rules as any other payer. Keep NFT approvals distinct from
the ERC-20 allowance authorizing membership payments.

## Chronological maintenance and permanent retirement

Anyone may call `processAccounting(maxSteps)` or
`processExpirations(maxSteps)`, including while paused. Both use the same
coordinator with `1 <= maxSteps <= 25`. Each funding START, funding END or
membership retirement consumes one step; continuous accrual between boundaries
does not. The expiration-named action can process preceding funding work.
Every extant position has an expiration entry, including zero-weight grants
and zero-contribution positions.

At timestamp T, funding is earned through T and all funding events there,
including final rounding amounts, finish before any weight expiring at T is
removed. Funding ties use token ordering; expirations at T use ascending token
ID. No processing advances beyond unresolved work. Splitting maintenance into
batches preserves this order and the effective expiration timestamp.

`MaintenanceResult` returns `processedSteps`, `retiredCount`,
`accountedThrough`, `complete` and `earnedScaledDelta`. Successful incomplete
calls save progress. Read `accountingStatus()` for both queue sizes
(`scheduledMembers` and `scheduledExpirations`), `nextBoundary`, `nextKind`
and completion. `nextKind` is None, Funding or Expiration. Queue sizes count
scheduled heads/positions, not every historical or future funding lot. A cursor
equal to an expiration timestamp does not prove all work there has finished.

Time-changing operations and selected-position claims require complete
catch-up within their budget. `AccountingBehind(accountedThrough, nextBoundary)`
reverts the entire business transaction, including attempted maintenance. Only
successful maintenance transactions preserve partial progress. Do not report
progress from a reverted payment or claim as saved.

Retirement settles earned credit through the effective boundary, burns the NFT,
destroys its shares and eligibility, clears live membership/referral state,
removes its expiration entry, and releases one occupied slot. The old ID never
returns. Because transfer is forbidden at and after expiry, the owner at delayed
retirement is also the owner at expiration.

Earned member credit moves to that owner's tier-level retired balance without
rounding each position. For `ACCOUNTING_SCALE() == 2^128`,
`claimableRetiredReward(owner)` returns whole raw payment-token units and the
remaining `fractionalScaled` credit. Fractions from multiple retirements add
together; claims retain the remainder. A new NFT neither inherits nor consumes
this balance. Unallocated pool carry and distribution dust remain separate
accounting buckets rather than additional owner credit.

`occupiedSupply` counts extant occupied positions, including pending expired
ones until processed. `totalMinted` is the lifetime ID counter. Show occupancy
with accounting status and refresh capacity after maintenance; simulation does
not reserve a slot.

## Claims and payout destinations

| Entry point                                        | Scope                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `claimReward(tokenId)`                             | Actual owner claims one extant token after catch-up; if that call retires it, the owner's retired balance is claimed instead |
| `claimRetiredRewards()`                            | Caller claims settled retired credit without an NFT or global catch-up                                                       |
| `claimRewards(tokenIds, maxSteps)`                 | Caller claims selected positions plus retired, referral and applicable creator balances                                      |
| `claimRewardsFor(beneficiary, tokenIds, maxSteps)` | Factory-only counterpart; all payments go to the supplied beneficiary                                                        |
| `MembershipFactory.claimEverything(requests)`      | Caller claims explicit registered tiers and positions in one atomic transaction                                              |

Each `TierClaimRequest` contains `tier` and `tokenIds`. A factory transaction
accepts 1–8 unique registered tiers, at most 32 selected IDs in total, and 25
shared accounting steps. A direct tier batch also permits at most 32 IDs and
`0 <= maxSteps <= 25`. Zero steps succeeds only when no queued work is due;
continuous accounting may still advance. Empty ID lists permit tier-level
beneficiary claims. Each tier pays retired, referral and creator credit once.

IDs must be unique within their tier and owned by the beneficiary on entry.
A transferred or previously burned selection fails atomically. An expired NFT
owned on entry may be retired by that call and paid through retired credit.
`ClaimResult` separates `liveReward`, `retiredReward`, `referral`, `creator`
and actual `processedSteps`. The factory spends the remaining shared budget
in request order. `ClaimAccountingBehind` identifies the affected batch index
and tier; other tier failures are wrapped in `ClaimFailed`. Any failure rolls
back every claim and attempted maintenance in the batch.

Offer additional batches rather than silently truncating a wallet's positions
or calling a partial selection “all rewards.” `claimReferral()`,
`withdrawCreatorProceeds()` and `releaseProtocolFees()` withdraw already-settled
balances without global catch-up. Creator withdrawal requires the current tier
owner; protocol-fee release is permissionless and pays the tier's `buybackVault`,
which records the earned payment-asset fees. Member and referral payments go to
their respective owners/beneficiaries, never an approved NFT operator.

Claims, creator withdrawals and protocol-fee release remain available while
paused. Payments use the tier's immutable ERC-20 and exact-transfer checks.
A failed payout reverts atomically and leaves the liability intact.

## Creator refunds and grant revocation

Only the current tier `owner()` can initiate
`refund(tokenId, expectedOwner, maxGrossRefund)`. The NFT owner receives the
refund even if someone else originally paid. NFT ownership and approvals do
not authorize refunds. Validate the live target and expected owner, catch up,
cancel its remaining funded and grant time, and permanently retire the position.
The refund comes from unused funding; already-earned liabilities survive.
If the computed gross exceeds the ceiling or the exact payout fails, the entire
operation reverts. There is no creator top-up parameter.

`revokeGrantTime(tokenId, expectedOwner)` is also creator-only. It removes
remaining grant time while preserving remaining paid time. A surviving position
keeps its shares; removing its last time retires it immediately. Both operations
remain available while paused and maintain expiration scheduling.

`previewRefund(tokenId)` returns the current `recipient`, remaining time,
`grossRefund`, funding/cancellation allocations and timestamps. Inspect
`complete`, `projected`, `accountingAsOf` and `fundingAsOf`; an incomplete quote
is not a definitive executable refund. Expired pending tokens cannot be
refunded or extended: process their expiration. Refresh ownership and simulate
the exact owner-pinned refund before submission.

## Current views, projections and historical evidence

`rewardEligible(tokenId)` is false at wall-clock expiry, even before its weight
has been removed from stored accounting. `sharesOf`, `totalRewardShares`,
`rewardPerShare`, claimable balances and reserves describe settled accounting.
Pending historical earnings can still belong to an expired position through
its expiration. Do not filter that historical entitlement out using the public
current-eligibility flag. Shares are zero after retirement.

Use `previewAccounting(tokenId, beneficiary, referrer, maxSteps)` to project
both schedules through its `asOf`. It returns `settled`, `current`, lifecycle,
rates, earned deltas and processed work. Inspect `current.status.complete`;
incomplete projection is neither zero earnings nor a final current balance.
Token ID zero allows beneficiary-focused reads without a position.

For claims, use
`previewClaimRewards(beneficiary, tokenIds, maxSteps)`: at most 32 unique
currently owned IDs, projected together with tier-level categories once.
`ClaimPreview` returns per-position lifecycle/`creditScaled`,
`retiredCreditScaled`, `referralCreditScaled`, `creatorCreditScaled`, timestamps,
work and completion. Retired positions' moved credit is accounted for in the
retired category. Never sum repeated beneficiary balances or work from separate
single-token previews.

Both preview APIs allow 0–256 steps. A 256-step exploratory preview does not
prove a 25-step write can complete. To quote a factory transaction, allocate its
same remaining shared budget across tiers in order. Pin previews and related
reads to one block and refresh before simulation; these views perform no writes.

For issued retired IDs, `allocationState` and paged
`allocationLots(tokenId, generation, offset, limit)` retain funding history.
Funding-lot pages also require `1 <= limit <= 100`.
`timeBalances` and `referralOf` remain readable but their live state is cleared;
they are not historical time or referral records. `isActiveToken` and
`isOccupied` return false for retired IDs and reject unissued IDs. `ownerOf`,
`tokenURI`, `expiresAt`, `isRenewable` and renewal require an extant NFT and
reject burned IDs. Use retirement/funding events for historical facts, never
as authority to revive or act on a retired membership.

## ERC-5643 and receipt reconciliation

`renewSubscription(tokenId, duration)` requires the actual owner of that live
ID and an exact positive whole-period duration. Fixed-price renewal requires
an already locked referral; use `renewMembership` to make the first positive
owner choice. Contribution-tier standard renewal accepts exactly one period
and adds it with zero gross. `isRenewable` returns false for an extant expired
or paused position and other supported renewal limits; it is not a promise
that accounting or payment simulation will succeed.

`cancelSubscription(tokenId)` remains creator-only and uses the full-refund
retirement path. Its standard signature has no expected-owner or gross ceiling;
it pays the execution-time NFT owner. Applications should use the explicit
owner-pinned `refund` for their confirmations. Both subscription writes reject
native value.

Use the successful supplied receipt's mint `Transfer` and lifecycle events to
identify a newly created ID, then reread canonical state. Existing-position
actions reconcile their explicit token ID. `MembershipRetired` records token,
owner, historical `effectiveAt`, removed shares and exact moved credit;
`RetiredRewardClaimed` records whole-unit payouts. `AccountingProgress`
includes retired count. Standard `Transfer`, `Approval` and `ApprovalForAll`
events cover NFT movement and authority. Funding/payment events preserve payer,
lot and referral provenance; `MembershipRefunded` records cancellation payout.

After transfer, refresh ownership pages, access, position rewards and affected
beneficiary views. After maintenance or cancellation, refresh capacity and
retired balances. Tier administration still uses two-step ownership events;
presentation changes use `PresentationUpdated` and ERC-4906 metadata events.

Wagmi and viem own connection, simulation, writes, receipt waiting, replacement
detection and transaction outcome classification. Pass the simulation request
directly to the wallet client's `writeContract`. Reconciliation starts after a
successful library-supplied receipt and consists of event decoding and canonical
rereads. Do not add receipt rediscovery, historical-log scans for wallet actions,
custom polling, nonce inference or persistent transaction-intent journals.
Generate bindings with `bun run generate` from `web/` and check drift with
`bun run generate:check`; never hand-maintain ABI, hook or deployment maps.
