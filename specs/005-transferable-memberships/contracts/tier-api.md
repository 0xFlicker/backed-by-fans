# Tier and Factory Interface Contract

These are planned interface signatures and semantics, not implemented ABIs. Update Solidity interfaces/types first, then regenerate web bindings with the existing Wagmi Foundry integration. No handwritten ABI or compatibility overload is retained.

## Creation and extension

| Proposed signature | Meaning and authorization |
|---|---|
| `createMembership(uint64 periods, address referralChoice, uint256 maxAccountingSteps) -> uint256 tokenId` | Fixed-price self-purchase, always new ID; caller pays |
| `renewMembership(uint256 tokenId, uint64 periods, address referralChoice, uint256 maxAccountingSteps)` | Fixed-price extension; caller must own the live token; lock or validate referral choice |
| `createContributionMembership(uint256 gross, address referralChoice, uint256 maxAccountingSteps) -> uint256 tokenId` | Contribution-tier creation; one period, gross may be zero under existing pricing rules |
| `renewContributionMembership(uint256 tokenId, uint256 gross, address referralChoice, uint256 maxAccountingSteps)` | Contribution-tier extension of caller's live token by one period |
| `giftMembership(address recipient, uint64 periods, uint256 maxAccountingSteps) -> uint256 tokenId` | Fixed-price gift creating a separate NFT; payer is caller; new referral remains Unset |
| `giftRenewal(uint256 tokenId, address expectedOwner, uint64 periods, ReferralStatus expectedReferralStatus, address expectedReferrer, uint256 maxAccountingSteps)` | Fixed-price sponsorship of an existing live ID; validates owner and referral snapshot before accepting payment; cannot set recipient's referral choice |
| `grantMembership(address recipient, uint64 periods, uint256 maxAccountingSteps) -> uint256 tokenId` | Creator-only complimentary creation with zero shares and Unset referral |
| `addGrantTime(uint256 tokenId, address expectedOwner, uint64 periods, uint256 maxAccountingSteps)` | Creator-only grant to a selected live position, with owner snapshot validation |
| `revokeGrantTime(uint256 tokenId, address expectedOwner, uint256 maxAccountingSteps) -> uint64 revokedSeconds` | Creator-only removal of remaining grant time; retire if no time remains |
| `refund(uint256 tokenId, address expectedOwner, uint256 maxGrossRefund, uint256 maxAccountingSteps) -> uint256 grossRefund` | Creator-only full cancellation of remaining time/funding; validate current owner, finalize cancellation/retirement, then pay exact refund to the captured owner |

All increases check pause, bounded global catch-up, live target where applicable, pricing mode, duration/prepayment limits, referral expectations, payment and capacity before accepting new time. Revalidate ownership after catch-up and before payment. Creation checks capacity after global expiration cleanup and initializes all position state; existing positions at the same address are untouched. Use safe mint with complete state initialized before receiver callbacks.

Cancellation/refund finalizes credit, funding, occupancy, ownership and schedule effects before its external payout. If the exact ERC-20 payout fails, the complete cancellation/retirement reverts atomically.

Confirmed refund authority: only the tier's current creator authority (`owner()` under the existing tier administration model) may initiate refunds or subscription cancellation. NFT ownership and NFT approvals confer no such authority. The current NFT owner receives the refund even when a different wallet originally paid or gifted the membership.

Preserve the current prohibition on self-gifting; self-purchase/renewal is explicit. Gift-created NFTs may exist alongside other positions. First positive owner payment locks Unset referral; zero contributions and complimentary grants do not lock it or issue shares. Sponsorship of Unset referral preserves Unset; previously locked referral is unchanged. Contribution-tier sponsorship is not a new payment mode in this feature.

For an extant NFT at/after expiration, validate expiry at entry and reject with `MembershipExpired(tokenId, expiration)` before catch-up can burn it. Already-burned IDs reject as nonexistent. It does not silently create a replacement. The application offers creation instead. Any later failure after catch-up reverts that attempted maintenance as well; explicit maintenance or a valid creation transaction commits retirement.

Standard ERC-5643 calls use zero queued-event budget and require separate maintenance when events are due. Keep ERC-5643 `renewSubscription(tokenId,duration)` targeting exactly that live ID, without wallet lookup. Preserve its duration/pricing/referral restrictions and rejection of native value. `isRenewable` returns false at/after expiration. `cancelSubscription(tokenId)` remains creator-only and performs the same current-owner refund/retirement semantics; its standard signature cannot pin an expected owner, so use the explicit `refund` call for application confirmations. Its beneficiary is always the execution-time owner.

## Transfers and approvals

Restore standard ERC-721 `approve`, `setApprovalForAll`, `getApproved`, `isApprovedForAll`, `transferFrom` and both `safeTransferFrom` overloads, using the installed OpenZeppelin primitives. Remove `Soulbound`, `locked`, ERC-5192 support and Locked events. Keep ERC-721, metadata, enumeration, ERC-5643 and ERC-4906 support truthful.

Live transfer checks `now < expiration` independently of cached eligibility, remains available while paused, validates normal ERC-721 authorization, and updates ownership/enumeration atomically. It must not invoke accounting catch-up or require a complete accounting status. Pending funding and expiration checkpoints, including a backlog exceeding 25 steps, cannot block an otherwise valid live transfer. Stored token accounting, funding/expiry schedules and the accounting cursor remain untouched. Pause state adds no transfer restriction. Token approval clears on transfer and burn; owner-wide approvals follow normal ERC-721 rules. Token reward credit and funding/referral fields stay unchanged by the ownership change. A self-transfer is valid and must not alter economic state or enumeration cardinality.

Use a single guarded internal transfer path for public transfer variants. Keep the guard active through safe receiver callbacks, avoiding nested `nonReentrant` guards caused by one public overload calling another. Internal maintenance burn and creation mint use the same OpenZeppelin ownership update mechanism without recursively calling catch-up. Receiver callback failures revert the whole transaction. Callback attempts to claim, renew, transfer again, or mutate maintenance during partially completed transfer/payment must not bypass the guard. No public arbitrary burn method is added.

Approval changes remain callable while paused. Confirmed transfer-only scope applies to both token approvals and owner-wide operators: approval grants no owner-only claim or renewal, cancellation, refund or creator authority, even when a proposed claim would pay the owner. An approved address may use independently permissionless sponsorship on the same terms as any other payer; that ability does not derive from NFT approval. Expired unburned NFTs may still have standard approval state, but no approved transfer can bypass their expiry check.

## Maintenance

`processAccounting(uint256 maxSteps) -> MaintenanceResult` and `processExpirations(uint256 maxSteps) -> MaintenanceResult` are permissionless, non-reentrant and available while paused. Both execute the same chronological coordinator; the expiration-named action may process necessary preceding funding. Remove old caller-ID-based `synchronizeExpiredMemberships` entirely.

Bounds: caller-supplied positive `maxSteps`, without a contract maximum. A step is one funding START/END or one retirement, not one timestamp or one entire membership funding history. Continuous time accrual is O(1) between boundaries and consumes no extra queue step. If the budget is exhausted while due work remains, persist completed work, return `complete=false`, and do not skip the root. If the final allowed step removes the final due event, finish continuous accrual and return complete. Internal claim catch-up may receive zero remaining steps: it can only advance continuous time if neither queue has due work.

`MaintenanceResult` includes processed steps, retired count, accounted-through time, completion and earned scaled delta. `accountingStatus()` includes both queue sizes, next boundary/kind and completion through now. Retain `AccountingBehind(uint64 accountedThrough, uint64 nextBoundary)` for atomic business failure and the factory's matching error decoding; completion must be derived from both heaps, not from timestamps alone.

At T: integrate funding through T; handle all funding boundaries at T (including rounding tails) before expiry nodes; then retire expiry nodes at T in ascending token ID; only then advance beyond T. Funding node ties remain ordered by token ID, with each token's current head determining START or END. All of this is stable across transaction boundaries and reflected in previews.

## Discovery and current status

`tokensOfOwner(address owner, uint256 offset, uint256 limit) -> PositionPage`: caller-supplied positive `limit`, without a contract maximum, offset at/past balance returns an empty completed page, zero owner rejects. Return IDs, next offset, total enumerable balance and page completion. Read owner indices from OpenZeppelin enumeration. No scan through `totalMinted` and no hidden wallet limit.

Remove `tokenOf(address)`, `isActive(address)` and `activeBalanceOf(address)`. Use `isActiveToken(tokenId)` with `ownerOf(tokenId)` for access proof. Application-level wallet access is true when a selected proof is live and owned; proving absence requires complete paged discovery. ERC-721 `balanceOf` counts extant NFTs, including pending expired NFTs, so it is not an access predicate.

`rewardEligible(tokenId)` reports effective current eligibility, false for expired or retired positions. `sharesOf(tokenId)` remains the stored settled weight and is zero after retirement; before processing expiration it is labeled pending retirement, never current earning power. Aggregate shares, reserves and occupied supply are accounting-cursor values until status is complete. Expose the lifecycle in a token snapshot with expiration and accounting status so callers cannot conflate these values.

Historical settlement and retirement MUST use the ledger's stored eligibility at the accounting cursor, never the wall-clock-filtered public getter. Previews apply the same rule until reaching each historical expiration; otherwise delayed processing would discard earned index credit.

Historical `allocationState` / paged `allocationLots` accept issued retired IDs to preserve funding history; live `ownerOf`, `tokenURI`, `expiresAt`, and renewal reject burned IDs. `totalMinted` is a lifetime ID counter, not current supply or capacity. Capacity checks always catch up first.

## Claims

| Proposed signature | Semantics |
|---|---|
| `claimReward(uint256 tokenId, uint256 maxAccountingSteps) -> uint256 amount` | Owner-only selected position claim using shared catch-up; if this call retires the selected position, claims the beneficiary's retired balance and emits the retired claim event |
| `claimRetiredRewards() -> uint256 amount` | Caller claims already-settled retired credit without needing an NFT or complete global accounting |
| `claimableRetiredReward(address beneficiary) -> (uint256 raw, uint256 fractionalScaled)` | Settled amount only; expose fraction separately |
| `claimRewards(uint256[] tokenIds, uint256 maxSteps) -> ClaimResult` | Selected IDs plus caller's retired, referral and creator balances; bounded and atomic |
| `claimRewardsFor(address beneficiary, uint256[] tokenIds, uint256 maxSteps) -> ClaimResult` | Factory-only equivalent; beneficiary is supplied by registered factory, never arbitrary payout routing |
| `claimEverything(TierClaimRequest[] requests, uint256 maxAccountingSteps) -> ClaimResult[]` | Factory batch; beneficiary is caller; sorted unique registered tiers/IDs and caller-supplied shared accounting work |

Remove parameterless tier `claimAll` and old `claimAllFor`. Selected-ID arrays bound each direct call without a numeric maximum. Reject duplicate IDs and invalid/stale ownership before financial work. After catch-up, surviving IDs must still belong to beneficiary; IDs owned on entry that this call retired are paid through retired credit. A previously burned ID is not a valid selection; use the retired-credit route. Never silently skip a transferred selection and report it claimed.

Empty token lists are valid for beneficiary-only categories. Each tier pays retired, referral and creator balances once. `ClaimResult` separates live member reward, retired member reward, referral, creator and processed steps. Factory subtraction uses actual work including expirations. Any tier failure reverts the whole batch, including attempted maintenance; direct maintenance is the resumable route. Claims remain available while paused. All payouts go to the beneficiary, never an approved NFT operator.

`hasClaimInterest(address)` includes extant NFTs, nonzero retired credit including a fractional-only balance, existing referral interest and creator rights. Do not rely on holding an NFT to discover claims.

## Preview and events

Extend `previewAccounting` with an explicit beneficiary alongside selected token/referrer and a caller-supplied work budget; it projects both schedules, retired credit and variable weight. A zero budget may project continuous time only before the next unresolved event. Return `asOf`, actual work, settled/projected balances including fractional retired credit, target lifecycle, and shared accounting status. Use bounded overlay traversal, never full heap copying. `previewRefund` reports current/expected owner and distinguishes expired-awaiting-maintenance from a refundable live position; incomplete accounting must not be shown as a definitive executable refund.

Add `previewClaimRewards(address beneficiary, uint256[] tokenIds, uint256 maxSteps)` with a caller-selected ascending unique ID array and caller-supplied view budget. Project the tier once, return each selected position's result plus retired/referral/creator totals exactly once, actual work and completeness. Its selector validation matches claim execution. Factory/account aggregation sums per-tier results, never the repeated beneficiary categories from separate token previews. To quote a transaction's catch-up feasibility, callers allocate the same caller-supplied aggregate budget across its selected tiers; a larger exploratory view budget does not prove that transaction will catch up.

Creation/renewal previews distinguish intent and selected ID. Show lifetime curve cursor, newly issued shares, target existing shares, expected owner/referral, capacity/accounting completeness and expiration. A quote is not a curve or ownership reservation; execution revalidates.

Preserve ERC-721 Transfer/Approval events and existing funding/payment provenance. Add `MembershipRetired(tokenId, owner, effectiveAt, removedShares, creditScaled)` and `RetiredRewardClaimed(owner, amount)`; update accounting progress to include retired count. Full cancellation emits retirement with its current effective timestamp; delayed natural retirement emits the historical expiry. Do not emit a retired NFT's membership association as live. Remove old suspended-share synchronization events and same-ID restoration claims.

## 2026-09-12 clone and caller-budget amendment

Feature 005 remains open. One fixed implementation is deployed separately; the membership factory directly deploys standard deterministic ERC-1167 clones and initializes each atomically once. The implementation is initialization-locked. Initializable OpenZeppelin ERC-721 enumeration/ownership preserve independent tier state; fixed economic storage has no setters or upgrade path. Factory registration distinguishes official tiers. Tier A/B stores and the separate tier deployer are removed.

Custom membership mutations accept an explicit accounting budget; factory claims share a caller budget across sorted tier requests by actual consumed steps. All protocol batch/page paths remove arbitrary numeric iteration ceilings. Inputs, economics and native Robinhood limits remain validated. Positive-budget maintenance saves chronological partial progress; atomic mutations revert if catch-up cannot finish. Standard ERC-5643 signatures require separate maintenance for due events. Transfer and settled retired-credit withdrawal do not run catch-up.

Validation includes above-former-cap cases, small/large batch equivalence, locked/atomic clone initialization, independent storage, Claim all interruption/revalidation, and measured before/after gas. Replace only the owned fork/web at RPC 18557, chain 31337 and web 3110 using the existing private RPC/pin. Explorer verification/clone recognition is deferred to the next authorized testnet deployment. Previous evidence does not validate this amendment.

## Protocol payment reporting (feature 005 amendment)

`previewPaymentTotals(uint256 maxSteps)` returns tier-wide lifetime gross receipts, cumulative refunds, cumulative payouts, and projected earned/unearned balances in creator/member/referral/protocol order. The existing chronological preview consumes at most the caller's boundary budget and returns its actual accounting timestamp and completion status. It is available while paused and does not write state.

Amounts with `Scaled` suffix retain ACCOUNTING_SCALE precision. Earned member balances include live and retired owner credits, but exclude unassigned funding, index carry, distribution dust, and canceled-funding reserves; those reserves are reported separately. `paidRaw[3]` means released to the vault, not exchanged or burned. Retirement and refunds never decrement lifetime gross or cumulative payouts.

`allocationRatesScaled` exposes per-second funding rates at a complete preview, otherwise zero. `hasEligibleMembers` distinguishes member allocations accruing to claimable rewards from unassigned funding. Display projections stop at the earliest returned boundary, freeze on incomplete accounting, and refresh through the existing query lifecycle. Rates are display estimates between authoritative reads; member index rounding remains authoritative in the returned balances.
