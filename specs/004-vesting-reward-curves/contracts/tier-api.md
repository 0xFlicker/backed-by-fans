# Tier and Integration Interface Contract

This is the intended new-version interface. Solidity source and its generated ABI become authoritative during implementation. No adapter preserves obsolete fee-only or owner-top-up methods. Names below are the planned API names; shared structs belong in `MembershipTypes`, events and tier methods in `IMembershipTier`.

## Immutable Creation Terms

Add to `TierConfig`:

```solidity
uint32 startingBoostBps;
uint112 earlySupportGross;
```

Place them after allocation-rate fields in the new tuple and update every constructor, factory event, fixture and generated consumer together. Getters expose both fields. Add `lifetimeGross()`, `MAX_LIFETIME_GROSS()`, `ACCOUNTING_SCALE()`, `MAX_ACCOUNTING_STEPS()` and the supported boost constants. The factory and tier both reject invalid settings; frontend validation is advisory protection, never authority.

Canonical None=(10000,0). Enabled boost is 10100..100000 in increments100; horizon1..C. For fixed pricing require positive price<=C and horizon/price an exact integer within uint64. Existing fee total and period validations apply. A caller cannot bypass these through direct tier deployment. No economic setter exists.

Add `TierRewardCurveConfigured(tier, startingBoostBps, earlySupportGross)` to factory publication events with indexed tier address. Existing immutable terms event still describes rates and access economics. Version selection replaces the current deployment configuration rather than routing between old/new ABIs.

## Reads

| Method | Result and semantics |
|---|---|
| `previewShares(uint256 gross)` | `ShareQuote {uint112 grossBefore, uint112 grossAfter, uint256 sharesAdded}`. Reject out-of-cap gross. Zero returns zero issuance. Quote is exact for the read state, not a reservation of curve position. |
| `accountingStatus()` | `AccountingStatus {uint64 accountedThrough, uint64 nextBoundary, uint256 scheduledMembers, bool complete}`. nextBoundary=0 when no node; complete means no boundary due through this block and accountedThrough equals this block timestamp. No unbounded count of future events. |
| `earnedBalances(uint256 tokenId, address referrer)` | `EarnedBalances` containing settled whole-raw creator, member, referral and protocol amounts, each fractional scaled remainder, and status. Member credit includes its unsettled index delta through the finalized global cursor; referrer includes its lazy rate entitlement through that cursor. Not limited to amounts already individually checkpointed. |
| `allocationState(uint256 tokenId)` | Generation, current funded lot cursor, four allocated/earned/unearned scaled totals, refundable gross as of the stated finalized time, and status. A waiting head has zero earned value. |
| `allocationLots(uint256 tokenId, uint256 generation, uint256 offset, uint256 limit)` | Paginated funded lots with service times, gross, four allocations and recorded referrer; limit1..100. Historical canceled generations are readable, clearly inactive. |
| `reserveState()` | Four aggregate unearned totals, four cancellation-rounding totals, member unassigned reserve, distribution dust and index carry, all scaled, plus status. They are distinct from credited beneficiary amounts. |
| `previewRefund(uint256 tokenId)` | Fixed recipient, current unused paid/grant time with `accessAsOf`, raw gross refund, four scaled funding contributions, four cancellation residues, generation, settled `accountingAsOf`, `complete`, `fundingAsOf` and `projected`. If complete, funding is settled/current. Otherwise projection is allowed only when the global heap is empty or its earliest boundary is strictly after now; project one membership's active head and prefixes to now in constant work, without mutation or exposing projected amounts as earned cash. At any pending boundary, including END exactly now, return historical amounts with projected=false and fundingAsOf=accountingAsOf. Never returns owner top-up. Free/grant access can have a newer checkpoint than settled accounting. |

Retain useful existing raw views (`creatorProceeds`, `claimableReward`, `claimableReferral`, `protocolFeeEarnedHeld`) with documented **settled-through-accountedThrough** semantics and companion status. They do not silently traverse due events. `totalProtectedLiability` must include all protected reserves and fractional aggregate liabilities rounded up for solvency; it is not a spendable-balance formula. Prefer scaled ledger totals for exact audit reconciliation.

Do not add an unbounded preview of the entire heap. The refund-only constant-work projection is explicitly distinguished from settled/withdrawable amounts and accompanied by `fundingAsOf`, `projected` and unchanged settled completeness. Other views continue to report settled values.

## Processing

```solidity
function processAccounting(uint256 maxSteps)
    external returns (uint256 processedSteps, uint64 accountedThrough, bool complete, uint256 earnedScaledDelta);
```

Permissionless, nonreentrant, allowed while paused. maxSteps must be1..25. A step consumes one live START or END node. An END can activate an adjacent next lot in constant work but does not process that next lot's END for free. All events due at a timestamp must be consumed before a funding/weight mutation at that timestamp. After bounded event processing, integrate through now only when no due event remains.

`AccountingProgress(uint64 accountedThrough, uint256 processedSteps, bool complete, uint256 earnedScaledDelta)` records actual boundary work and newly recognized scaled earnings, even if no whole raw unit is payable. earnedScaledDelta counts funding recognized once across the four allocations, not again when distributed to recipients. A direct no-op tier call may return zero progress. The combined advance counts a processed funded boundary or positive earnedScaledDelta as useful accounting; an idle timestamp change alone does not qualify.

Economic mutations run bounded catch-up and require complete=true before changing funding or the eligible vector. If unable to finish, revert `AccountingBehind(accountedThrough,nextBoundary)` with no money or membership change. Separate processing calls persist progress; the reverted mutation does not. The supported client route is read status, submit bounded progress, refetch, and resimulate the intended action through ordinary wagmi/viem primitives.

## Payments and Lifecycle

Keep existing `purchase`, `gift`, `contribute`, grants, revocation and `synchronizeExpiredMemberships` authority and pricing-mode restrictions. Remove eligibility activation from the generic access-restoration helper. Positive-payment handling alone restores suspended historical weight; free/grant paths preserve an existing true flag without changing false to true. Synchronization remains creator-only and batch-bounded.

Emit `PaymentProcessed`, `PaymentAllocated`, `SharesIssued` and time/eligibility changes with actual execution values. `PaymentAllocated` means reserved allocation, not earned or immediately claimable cash. Add:

```text
FundingLotScheduled(tokenId, generation, lotIndex, start, end,
                    gross, creatorAmount, memberAmount, referralAmount,
                    protocolAmount, referrer)
```

Index tokenId and generation. Start/end and original referrer are immutable lot facts. A zero contribution emits existing access/payment facts but no funded lot or shares event. Add `FundingLotCompleted(tokenId,generation,lotIndex,end)` for chronological accounting evidence; these events do not require an indexer to establish entitlement.

Shares are based on execution-time cursor. Preserve total-share and token-share values in `SharesIssued`. This plan adds no minimum-issued-share transaction parameter; the frontend labels pre-payment issuance as an estimate and confirms the actual event result. Existing fixed monetary limits still apply.

## Claims and Protocol Release

Keep these tier entry points and existing beneficiaries:

```solidity
withdrawCreatorProceeds() returns (uint256 amount); // current owner
claimReward(uint256 tokenId) returns (uint256 amount); // durable member wallet
claimReferral() returns (uint256 amount); // caller's referral credit
releaseProtocolFees() returns (uint256 amount); // existing fixed vault
```

Settle the relevant credit through the finalized accounting cursor; transfer whole raw units and retain its fractional credit. These calls can pay settled value even when global accounting is incomplete. They do not silently distribute funding using current weights, restore eligibility or move the curve. Preserve the existing zero-payout behavior: return zero without a transfer or payout event. Separate accounting progress remains available.

Existing `CreatorProceedsWithdrawn`, `RewardClaimed`, `ReferralClaimed`, `ProtocolFeesReleased` receipt events identify the actual beneficiary/destination, asset context and paid raw amount. A successful positive claim does not require the next read to be zero. A new owner receives all unclaimed creator credit; historical referrers remain the originating payment's beneficiaries.

`releaseProtocolFees` transfers only floor(protocolEarnedScaled/Q), reduces that exact scaled amount and records it once with the existing vault method. Fractional protocol credit stays in the tier. Market execution and buyback controls remain unchanged.

## Refund

Replace the old owner-top-up signature with:

```solidity
function refund(uint256 tokenId, uint256 maxGrossRefund)
    external returns (uint256 grossRefund);
```

Creator-only; fixed original recipient; bring accounting through now first. Preserve the gross limit, duration/referral rules and exact-transfer checks. No owner token allowance or `maxOwnerTopUp` argument exists.

Retain the declared ERC-5643 `cancelSubscription(uint256 tokenId)` entry point and its existing creator authority. Route it through this same fully reserved refund path with `maxGrossRefund=type(uint256).max` and the same catch-up requirement. Remove its old internal top-up argument; do not remove standard support as an obsolete compatibility path.

`MembershipRefunded` records tokenId, recipient, gross refund and canceled access. Replace `RefundFunded` fields with tokenId/generation, raw gross and four scaled contributions. Emit a separate `FundingGenerationCanceled` event with generation and four protected cancellation residues. Sum of funding contributions equals grossRefund*Q. The next generation has no link to canceled events. Neither cursor nor historical shares decrease.

## Errors and Atomicity

Retain useful existing authorization, pause, capacity, exact-transfer and duration errors. Add explicit `InvalidCurveSettings`, `CurveCapacityExceeded`, `InvalidAccountingStepLimit`, `AccountingBehind` and invariant-specific accounting errors with useful bounded fields. Remove top-up and protocol-fee-only paging/cancellation errors where their paths disappear. Invalid inputs fail before accepting payment. Transfer or internal-accounting failure reverts all effects.

## Buyback Router and Runner

Replace the router's old `burn(Collection[],Purchase[],deadline)` entry point and token-ID collection inputs with permissionless `advance(AdvanceTier[] tiers, Purchase[] purchases, uint64 deadline)`. Keep direct tier processing available; separate processing transactions are not required for the normal combined flow. Do not retain the old router entry point as a compatibility adapter.

`AdvanceTier` contains a registered tier and caller-selected maxAccountingSteps: the maximum number of scheduled accounting checkpoints to process for that tier in this call, not a target cursor position and not a promise to process exactly that many. For example, 25 permits up to 25 checkpoints; if only 7 are due, report 7. Return the actual processed count and resulting cursor/completeness. The caller does not choose accounting timestamps, earning rules, or beneficiaries. Zero steps skips accounting but permits release of already-earned funding. Require unique selected tiers/currencies, at most 8 tiers and 32 purchase requests, and a shared sum of at most 25 accounting steps across all tiers. Validate the full request before work. The runner selects tiers fairly across calls and uses this same public entry point. Accounting-only and buyback-only requests are supported; no caller must finish the backlog in one call.

`advanceAccounting(AdvanceTier[])` processes only accounting. `buyback(Purchase[],uint64)` uses released inventory only. `advance(AdvanceTier[],Purchase[],uint64)` processes accounting, releases settled protocol funds, then trades. Preserve standalone `releaseProtocolFees`. Validate tier registration, canonical assets, duplicates, deadlines and shared budgets before work.

Use typed internal/external calls with normal revert propagation: any attempted stage, status read or measurement failure rolls back the transaction. Skip known unavailable buybacks with `PurchaseSkipped(asset,bucket,status)`; stale revisions revert. Preserve standing trading policy and source rotation. No self-call gas caps or failure events remain. Bounded accounting may leave a backlog; it need not fail merely because more work remains.

Count processed funded boundaries, newly recognized positive scaled funding, positive releases and completed buys as useful work. Idle cursor refresh does not count. Revert `NothingToDo` if nothing useful occurred. `AdvanceCompleted` and stage success/skip events report receipt-proven outcomes. No worker payout.

`minimumPayment(address)` and owner-only `setMinimumPayment(address,uint112)` manage positive currency floors in the factory. The constructor takes an aligned `uint112[] initialMinimumPayments`; reject mismatched or zero entries. Enabling a new currency requires a configured minimum. Tier `minimumPayment()` is an immutable snapshot; fixed per-period publication and positive PWYW contributions must meet it. Emit factory minimum update and tier snapshot events. Zero PWYW remains permitted.


Worker compensation is future scope. Caller attribution and actual work outcomes are normal observability, not a compensation entitlement. Add no worker balance, payout, reimbursement, funding deduction, reward formula, or incentive-specific state. A future payment spec must address eligibility, funding and fabricated, repeated or artificially fragmented work.

Remove lifetime token-ID scans and obsolete `accrueProtocolFees`, `protocolFeeState`, `protocolFeeLots` and old router callers. The runner uses successive combined advances with fair tier selection. Vault accounting and trading policy remain unchanged.

## Deployment Contract

`VestingLedger` is a leaf library with an exact derived address, code hash and link mapping scoped by chain/version. It never holds funds. The tier links it immutably, passing only its designated state struct; no upgrade setter or generic delegatecall endpoint exists. Deployment preflight verifies library runtime and consumer linkage. Foundry artifacts and public broadcast link metadata generate application bindings through Wagmi CLI; no handwritten ABI or address catalog.

## Numeric Compatibility Documentation

CHK011 is handled through smart-contract/NatSpec and asset-onboarding documentation, without a new creator control, capacity dashboard or special cap-exhaustion flow. Keep existing numeric validation and ordinary contract-error presentation. This feature does not change the asset-onboarding mechanism or require a new asset review workflow.

Document C=2^112−1 in canonical raw units and its token-decimal conversion. It bounds cumulative accepted positive gross for one tier, not the token's circulating or maximum supply. Repeated payments can reuse circulating tokens, so supply alone does not establish a lifetime volume bound. Asset compatibility documentation should distinguish precision, representable values and expected lifetime payment volume. The product owner's stated expectation is that intended assets will not practically approach this bound; this is not a live asset-supply verification.

If a positive payment cannot fit under C, it is rejected before collection; a fixed-price payment also needs enough remaining capacity for its complete purchased periods. Existing earning, claims, refunds, accounting and otherwise-valid free/granted access continue under their normal rules. Refunds do not reduce the lifetime cursor. Suspended weight still requires a valid positive payment to reactivate, so it cannot reactivate through a rejected payment or through free access. These are documented consequences of existing rules, not an additional product mode. Arithmetic and boundary coverage remain required during implementation.

Publication config includes reviewed `uint112 minimumPayment`; a registry mismatch reverts `MinimumPaymentChanged(expected, actual)` before creation. This value is required, not a compatibility fallback.
