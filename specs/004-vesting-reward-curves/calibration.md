# Reward curve calibration evidence

Status: local implementation evidence, 2026-09-09. Some 1.50×, More 3.00×, a fixed-price window of 1,000 periods, and a PWYW window of 10,000 displayed token units are initial implementation defaults. The calculations describe relative weighting behavior; economic suitability and per-asset default approval are outside this feature. Creators can customize valid settings before publication. The report's 4,101 distinct cumulative curve values now match actual Solidity outputs exactly, including concentrated/gradual histories, lifecycle weights, zero/tiny amounts and extreme supported settings. Six public-tier synchronization/refund histories also match the rational cash report within one raw unit per entitlement. This is local EVM evidence, not public deployment or an authentic fork.

## Reproduce

From the repository root, with Python 3 and its standard library:

```sh
python3 specs/004-vesting-reward-curves/evidence/curve-calibration.py --solidity > /tmp/vesting-curve-evidence.json
```

Success means exit status zero and JSON containing `random_histories: 10000`, `purchases_each: 50`, and the calibration tables below. Assertions cover exact partition equality, less than one raw-share issuance error against rational integration, baseline shares, arithmetic limits, and conservation/attribution in the two explicit cash histories. Seed is 409. The 500,000 randomized purchase increments are curve-only checks, not the complete stateful-history coverage required by SC-002.

The Solidity mode additionally requires the linked Foundry build described in `quickstart.md`. It retains all report inputs, actual curve outputs, six actual member-cash pairs and the Forge log under `contracts/deployments/curve-calibration/`. `RewardCurveCalibrationTest` validates canonical terms and checks every expected value against the production curve library. Its six public-tier histories assert permanent shares/cursor, actual refund, creator/member/referral/protocol entitlements and remaining unearned reserve against the report. The one-unit cash tolerance covers fixed-point/raw payout rounding; it is not applied to curve shares. Omitting `--solidity` runs only the Python model and makes no Solidity-proof claim. The 1,000-member gradual cash attribution table remains a rational-model comparison; its curve weights are included in the exact Solidity checks.

## Exact curve and numeric domain

Let `C = 2^112 − 1 = 5192296858534827628530496329220095` be the supported lifetime positive gross limit, `x` the cumulative positive gross, `H` the immutable early-window gross threshold, and `b = startingBoostBps − 10000`. For a boosted curve:

```text
u = min(x, H)
F(x) = x + floor(b × u × (2H − u) / (20000H))
sharesIssued(x, gross) = F(x + gross) − F(x)
```

Support boost values 10000 through 100000 in increments of 100, corresponding to 1.00× through 10.00× in increments of 0.01×. Canonical None uses boost 10000 and threshold zero and returns `F(x) = x` without division. Boosted thresholds satisfy `1 ≤ H ≤ C`. Positive payments require `gross ≤ C − x`, checked before accepting money. Current and lifetime shares remain uint256 values; the gross cap is checked separately and is never reset by refunds.

For fixed pricing, creators enter a whole number of periods `n`, `1 ≤ n ≤ 2^64 − 1`; require `H = pricePerPeriod × n ≤ C`. Store the canonical threshold; validate that fixed-price thresholds correspond to whole periods. Pay-what-you-want creators enter the threshold directly in displayed token units, converted to raw units before publication. A requested boost of 1.00× normalizes to None and threshold zero.

The marginal rational multiplier is `1 + b/10000 × (1 − x/H)` until H, then 1. It is continuous at H. The exact integer cumulative function telescopes, so adjacent partitions have **zero** aggregate share discrepancy. Individual issuance differs from the rational interval integral by strictly less than one raw share. At very small raw amounts, discrete multipliers need not decrease at every successive payment; the continuous taper describes the underlying curve, not a guarantee that every one-unit purchase has a distinct decreasing integer bonus.

For the chosen domain, `u(2H−u) ≤ H² < 2^224`, its product with `b ≤ 90000` is below `2^241`, and `20000H < 2^127`. Thus all intermediates fit uint256 even before using the existing OpenZeppelin `Math.mulDiv`. Total cumulative shares satisfy `F(x) ≤ x + 4.5H < 2^115`. No unchecked arithmetic or new math dependency is needed. This is the curve bound; the vesting plan separately accounts for scaled cash and reward-index arithmetic.

## Weight concentration

Fixed price is normalized to one token per period with 18 decimals. H is 1,000 periods. All shares are considered eligible for these comparisons; they are weight fractions, not payout forecasts. One early buyer and many buyers occupying the same aggregate interval produce the same total weight.

| Candidate | First 12 periods average weight | First 12 share after 1,000 periods | First 100 share after 1,000 periods | First 1,000 share after 2,000 periods |
| --- | ---: | ---: | ---: | ---: |
| None | 1.000× | 1.200000% | 10.000000% | 50.000000% |
| Some | 1.497× | 1.437120% | 11.800000% | 55.555556% |
| More | 2.988× | 1.792800% | 14.500000% | 66.666667% |
| Custom maximum 10× | 9.946× | 2.170036% | 17.363636% | 84.615385% |

First-window average weight is respectively 1×, 1.25×, 2×, and 5.5×. Every complete interval beyond H averages exactly 1×. At positions 0, H/4, H/2, 3H/4, and H the rational marginal multiplier is:

| Candidate | 0 | H/4 | H/2 | 3H/4 | H |
| --- | ---: | ---: | ---: | ---: | ---: |
| None | 1 | 1 | 1 | 1 | 1 |
| Some | 1.5 | 1.375 | 1.25 | 1.125 | 1 |
| More | 3 | 2.5 | 2 | 1.5 | 1 |

The initial defaults create distinct, bounded differences. The supported 10× custom setting can concentrate the first-window cohort heavily and must be visible in publication previews. The report describes that behavior and the supported numeric range; it makes no claim that the upper limit is economically optimal and imposes no separate calibration approval gate.

## Cash differs from final weight

In a gradual history, one new member buys one period each day for 1,000 days; each payment funds exactly one reward token over that day. No expired membership is synchronized, so its weight remains eligible. The cohort joining in the first 100 days earns the following fraction of the 1,000 reward tokens:

| Candidate | First member's rewards | First 100 members' rewards |
| --- | ---: | ---: |
| None | 0.748547% | 32.980933% |
| Some | 0.766653% | 34.225627% |
| More | 0.788839% | 35.807433% |

These cash fractions exceed final weight fractions because early members participate while the eligible denominator is smaller. This distinction already exists with None and must not be attributed entirely to the bonus curve. A history with many purchases at the same timestamp has the same aggregate curve progression but different future service and cash attribution from this gradual history.

## Suspension, refunds, and reactivation

Both examples use PWYW contributions, H = 1,000 tokens, 18 decimals, and an 80% creator / 10% rewards / 5% referral / 5% buyback split. A purchases before B at timestamp zero. All four cash portions are modeled with exact rational time earning after raw-unit purchase splits. Claims in this table mean total earned entitlements at day 30; actual transfers can occur later.

**Synchronization history:** The service period is 10 days. A and B each contribute 100 at day zero. B expires and is synchronized at day 10. A contributes another 100 at day 10 and another 100 at day 20. B contributes 1 at day 20, restoring its historical shares immediately and adding shares at the new curve position. Gross support and curve position end at 401; every payment has fully earned by day 30. Creator earnings are 320.8, member funding 40.1, and referral and buyback earnings 20.05 each.

| Candidate | A reward earnings | B reward earnings | Final A shares | Final B shares |
| --- | ---: | ---: | ---: | ---: |
| None | 27.556110 | 12.543890 | 300 | 101 |
| Some | 27.684888 | 12.415112 | 417.5 | 143.79975 |
| More | 27.819249 | 12.280751 | 770 | 272.199 |

**Refund history:** The service period is 30 days. A and B each contribute 100 at day zero. B's unused time is refunded at day 10, suspending B's eligibility while retaining shares. B contributes 1 at day 20. By day 30, gross support and curve position are 201, B has received a 66⅔ refund, and ⅔ remains reserved for B's new period. Earned creator value is 106.933333…, rewards 13.366666…, and referral and buyback earnings 6.683333… each. This sums exactly to 201 with the refund and remaining reserve in the rational model.

| Candidate | A reward earnings | B reward earnings | Final A shares | Final B shares |
| --- | ---: | ---: | ---: | ---: |
| None | 8.341625 | 5.025041 | 100 | 101 |
| Some | 8.428269 | 4.938398 | 147.5 | 143.89975 |
| More | 8.521113 | 4.845554 | 290 | 272.599 |

B earns nothing during days 10–20 in either history. The restored weight includes the refunded support in the second history, as explicitly accepted in the specification. All concurrent reward streams are included in these tables. The script checks reward attribution sums and gross conservation with Fractions; decimal table values are presentation rounding only. Raw cash cancellation rounding still requires implementation tests against the plan's concrete accounting policy.

## Tiny contributions, denomination, and preview rules

With a 10,000-token threshold and six decimals, a first contribution of one token produces 1,499,975 raw shares for Some and 2,999,900 for More. A one-raw-unit contribution produces one and two raw shares respectively; zero contributes zero. With zero-decimal assets the same granularity is visible at whole-token level. Splitting does not create bonus shares because issuance uses differences of cumulative rounded values. A positive payment can nevertheless restore all historical weight; the small payment is not evidence of a small reactivation effect.

The existing token display code accepts decimals 0–255 and ERC-8056 current and scheduled display multipliers. Resolve publication amounts to canonical raw units and show the resulting canonical economic terms before submission. Later display changes must not change the stored threshold, progress, or rewards. Reject zero-after-conversion, over-cap, and unsupported fixed-price period thresholds; never silently clamp. At 30 decimals and a 1× display multiplier, the nominal 10,000-token threshold exceeds C and is invalid. At 18 decimals the lifetime cap corresponds to approximately 5.19 quadrillion token units.

The accepted assets may have very different denominations. The initial 10,000-token threshold is a creator-editable starting value, not an asset valuation or an economic recommendation. This feature requires exact canonical conversion, clear denomination, valid numeric bounds and immutable published terms. Per-asset optimization, keep/replace decisions and approval ownership are outside scope. If a default cannot be represented, the creator must enter a valid threshold before publication.

Purchase previews use the current canonical cursor and immutable terms. Other purchases may move the curve before inclusion. Reconcile successful issuance against actual emitted shares and canonical state rather than the stale preview. Explain reward weight, service duration, and restored shares separately. An exact initial boost such as 3× is a marginal starting setting, not a promise that an entire bulk purchase receives 3× or that its eventual cash payout triples.

## Source evidence and remaining limits

- `contracts/lib/openzeppelin-contracts/contracts/utils/math/Math.sol`, `mulDiv`: existing full-precision arithmetic support.
- `contracts/src/MembershipTier.sol`, `_purchaseFixed`, `_applyPayment`, `_durationForPeriods`: current gross multiplication, gross-based shares, and uint64 service-duration validation.
- `contracts/src/MembershipFactory.sol`, `createTier`: creation validation must gain the new immutable numeric domain.
- `web/src/lib/payment-token-read.ts`, `readTokenDisplay`, and `web/src/lib/token-amount.ts`, `displayedToRaw`: display precision, scaled amounts, and conversion rounding.
- `web/src/features/membership/state.ts`, `buildPaymentPreview`, and `MembershipExperience.tsx`: current previews use gross shares and receipt reconciliation assumes that preview.
- `docs/release/testnet-no-token.md`: documented accepted-asset diversity; this is repository context, not a live token-price or deployment check.

The reference script does not exercise Solidity, gas, bytecode size, reentrancy, ERC-20 behavior, wallet lifecycle, zero-eligible reserves, scheduled display changes, raw cash rounding, or large resumable accounting queues. Its rational cash examples are deliberately small. Passing them does not replace the independent complete-history model, contract differential tests, browser checks, scale rehearsal, required by the specification. Economic default optimization remains separate future work.
