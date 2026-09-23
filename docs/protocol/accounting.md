# Protocol accounting

Amounts are payment-token base units. The tier holds prepaid funding and earns its four allocations as paid time is consumed. The protocol allocation is selected at creation (at least 1%); the reward and referral rates are also immutable. Each payment floors its protocol, reward and applicable referral cut independently; the remainder funds the creator allocation. An absent referral gives that allocation to the creator.

## Earned credit and retirement

Positive accepted gross issues reward weight under the tier's configured cumulative reward curve. Memberships are independent NFT positions. Accounting walks funding and expiration boundaries chronologically, so processing a boundary late does not extend eligibility beyond expiration. Claims settle earned credit and leave unearned funding reserved. Transfers move a live position and its unclaimed credit to its current owner.

Natural expiration, member cancellation and removal of the final grant-only time permanently retire a position, burn its NFT, destroy its weight and release capacity. Earned member credit, including fractions, is preserved for the final owner. A later membership has a new ID and buys weight under the current curve. Neither retirement nor a refund reduces lifetime gross. See [the whitepaper](../whitepaper/whitepaper.md) for the reward formula and worked accrual examples.

## Member cancellation

Only the current NFT owner or its current token-approved or owner-wide approved operator can cancel a live position. Creator authority alone is insufficient. Cancellation remains available while paused. The creator chooses a retention percentage at creation and can only decrease it afterward; current terms apply to every existing position.

Let G be unused raw gross computed from the position's remaining funded lots and B the current creator retention in basis points:

```text
ownerRefund = floor(G * (10_000 - B) / 10_000)
creatorRetained = G - ownerRefund
```

Apply this split once to the total cancellable gross. Remove its unearned allocations, preserve protected fractional cancellation residues, and add `creatorRetained * ACCOUNTING_SCALE` to ordinary earned creator credit. Already earned credit is unchanged. Retained proceeds receive no second protocol/reward/referral split. A 100% retention setting still permits a zero-payout exit.

`previewCancellation(tokenId, deadline, maxAccountingSteps)` reports the current estimate separately from the conservative minimum projected through the deadline, walking scheduled boundaries within the supplied budget. Known expired or retired IDs return explicit unavailable status; unknown IDs remain errors. An incomplete projection is not a zero-value quote.

The first-party UI chooses a two-minute chain-time deadline clipped to expiration minus one second and confirms the owner and minimum. It submits `cancelMembership(tokenId, expectedOwner, minOwnerRefund, deadline, maxAccountingSteps)`. Execution at the deadline is allowed, but never at expiration. A failed bound, incomplete accounting catch-up or rejected/inexact payout reverts the entire action. Standalone accounting maintenance commits bounded progress independently.

Successful cancellation clears paid and granted time, retires once and pays the current owner, regardless of the original payer. It requires no creator top-up, token approval or pause. `cancelSubscription(tokenId)` uses the same authority and settlement, a zero minimum and the fixed 25-step adapter budget; it rejects native value. `MembershipCanceled` separates canceled gross, owner payout and creator-retained proceeds.

Grant revocation remains creator-controlled and preserves paid time. Removing nonzero gifted time stops periodic refill enrollment; the live holder must explicitly enroll again. It does not itself refund or purchase time.

## Custody and reporting

`previewPaymentTotals(maxSteps)` reports gross received, actual owner refunds, beneficiary payouts, earned and unearned allocations, and protected cancellation/distribution reserves with accounting completeness. `creatorCancellationProceeds` is a cumulative informational subset of creator earnings, not an extra liability or payout. Do not add it again to earned credit or protected balances.

The tier's token balance covers all earned, unearned and protected fractional liabilities. Exact inbound and outbound balance checks reject inexact token delivery. Unsolicited surplus is not an earned allocation. In a closed history:

```text
gross received = owner refunds + beneficiary payouts + remaining funded custody
```

Protocol fee release sends earned fees to the buyback vault; it is distinct from executing a buyback. Unspent vault fees remain custody. The independent rational/scaled reference model, history replay, invariant suites and lifecycle evidence compare these categories and preserve attribution across ownership, claim and maintenance ordering.

## Periodic purchases

Periodic refill is a separately submitted ordinary purchase funded by the current enrolled owner. It adds whole paid periods, ordinary allocations and current-curve weight only before expiration. Mandatory checkpointing, claims and cancellation never collect it. Failed collection rolls back its attempted catch-up; standalone accounting remains independent. Granted time counts toward the refill target, but only paid time counts against the exclusive `(N + 1) * periodDuration` paid cap (N=0 unlimited). New targets are bounded by N periods; whole-period purchases may overshoot the target by less than one period. See the integration guide for admission, cap-change and allowance semantics.
