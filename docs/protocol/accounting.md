# Protocol accounting

All examples use USDG base units (six decimals). Contract arithmetic is integer
arithmetic; displays must not imply fractions smaller than one base unit.

## Gross payment allocation

The protocol fee is fixed at 100 bps (1%). Reward and referral rates are
immutable per tier. Each cut is independently floored from gross:

```text
protocol = floor(gross * 100 / 10_000)
reward   = floor(gross * rewardBps / 10_000)
referral = floor(gross * referralBps / 10_000) when attribution is LockedAddress
creator  = gross - protocol - reward - referral
```

Unused referral cut and all split rounding remainder go to creator proceeds.
For a 10.000000 USDG payment with 5% reward and 1% referral:

| Attribution | Protocol | Reward | Referral | Creator |
| --- | ---: | ---: | ---: | ---: |
| locked address | 0.100000 | 0.500000 | 0.100000 | 9.300000 |
| none or unset gift | 0.100000 | 0.500000 | 0 | 9.400000 |

The tier verifies the payer and tier balance deltas for the full gross and the
factory delta for the exact protocol fee. Taxed, short, false-returning, frozen,
or reentrant transfers revert atomically.

## Reward ordering and rounding

Positive gross creates permanent shares equal to gross for the recipient token.
The token's prior rewards are settled before new shares are issued. Its new
shares are then included in distribution of that same payment's reward. This
excludes earlier rewards while including the current one.

Example: A pays 10 USDG and creates 10 million shares; its 0.5 USDG reward is all
A's. B next pays 10 USDG. B's shares exist for that payment's 0.5 USDG reward,
which divides 0.25 to A and 0.25 to B. Cumulative whole-unit claims are therefore
0.75 for A and 0.25 for B, subject only to base-unit rounding.

The magnified reward index carries per-token fractional credit. The proportional
whole-unit residual of a payment is credited directly to that payment recipient.
Sub-base-unit dust stays in `rewardReserve` until later index arithmetic makes it
claimable; it is protected and never becomes creator proceeds or surplus. Thus:

```text
cumulative reward allocations = cumulative successful reward claims + rewardReserve
```

## Refunds

Only unused paid time is refundable. Grant time is cleared but has no gross
value. Protocol, reward, and referral allocations are never clawed back.

For a fixed-price tier:

```text
grossRefund = floor(remainingPaidSeconds * pricePerPeriod / periodDuration)
```

For a zero-price tier, each self action appends a cumulative-gross prefix,
including a zero contribution. The checkpointed cursor records the current lot
and seconds consumed. Refund preview is the prorated unused gross in that lot
plus the prefix-range sum of all later lots. Consumption and preview are O(1),
even after thousands of contributions. Refund advances the cursor to the tail;
a later rejoin starts after that tail, so refunded prefixes can never reappear.

`previewRefund(tokenId)` returns both gross refund and owner top-up:

```text
ownerTopUp = max(grossRefund - creatorProceeds, 0)
```

The current tier owner supplies only that exact shortfall, then the entire gross
goes to the credential owner. The transaction clears paid and grant time and
reduces creator proceeds before interaction. Failure of the top-up or outbound
delivery restores all state. Identity, shares, referral lock, and occupied slot
remain until normal synchronization.

## Custody buckets

Factory custody is protocol fees plus any unsolicited factory surplus. Tier
custody is divided into:

- `creatorProceeds`, which the current tier owner can withdraw or spend on a
  refund before supplying a top-up;
- `rewardReserve`, including claimable rewards and protected rounding dust;
- `totalReferralLiability`; and
- unsolicited surplus, which has no withdrawal path in v1.

The core solvency condition is:

```text
tier USDG balance >= creatorProceeds + rewardReserve + totalReferralLiability
```

Neither creator withdrawals nor refunds may consume reward/referral liabilities
or unsolicited surplus. Across a closed local sequence, gross inflow equals
protocol payouts + reward claims + referral claims + creator withdrawals +
refunds + remaining factory/tier balances. The stateful invariant campaigns and
`LocalLifecycleEvidence.t.sol` enforce these conservation relationships.

## Worked end-to-end example

Three 10 USDG payments at 1% protocol, 5% reward, and 1% referral comprise two
referred self-payments and one unattributed gift. Custody immediately after the
payments is 0.300000 in the factory and, in the tier, 28.000000 creator proceeds,
1.500000 reward reserve, and 0.200000 referral liability.

Halfway through the self-member's two paid periods, a full refund is 15.000000.
It reduces creator proceeds to 13.000000 without touching rewards or referrals.
After whole-unit rewards (1.083333 and 0.416666), referral (0.200000), creator
(13.000000), and protocol (0.300000) exits, 0.000001 remains in the tier as
protected reward rounding dust. Together with payer/recipient balances, all
200.000000 mock USDG (200,000,000 base units) remains accounted for.
