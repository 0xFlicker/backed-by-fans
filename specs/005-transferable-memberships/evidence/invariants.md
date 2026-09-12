# Independent lifecycle and accounting invariants

Source: current feature tree based on `1503fa1d4272f2da133d4e09be3f242b846fc9a0`.

## Pinned Foundry runs

`FOUNDRY_PROFILE=robinhood forge test --libraries <out/vesting-leaf/link-manifest.json mapping> --code-size-limit 1000000 --gas-limit 1000000000 --match-path 'test/{invariants/AccountingInvariant,invariants/MembershipInvariant,RewardCurveCalibration,StandardsInterfaces}.t.sol'`

**14 tests passed**, including three invariants at the repository settings of **256 runs × 500 calls**, `fail_on_revert=true` (`/tmp/bbf-invariants-pinned.log`, 495.22 seconds overall). The position invariant exercised 128,000 handler calls with zero unexpected reverts; the accounting suite independently checks funding intervals, all cash categories, protected liabilities, donations and failed-exit rollback.

The new position handler uses the deliberately slow `MembershipModel.PositionBook`: explicit independent IDs, creation, live renewal, grants/revocation, transfer without settlement, refunds, owner-only claims, retired-credit claims, pauses, bounded catch-up and failures. It compares live state, historical denominator, expiry cardinality, owner pages, referral locks, current-curve issuance, scaled credits/carry/dust, gross monotonicity and full cash conservation. Public eligibility is checked against current time while the historical accounting denominator remains until retirement.

## Independently generated histories

`contracts/test/models/run_vesting_histories.py` passes **8 seeds × 100 authored actions × 27 maintenance schedules = 21,600 action-state comparisons**. Both pricing modes, four curves and every budget 1–25 are covered. Coverage includes 206 retirements (144 with fractional credit), 40 transfers (28 with unclaimed rewards), nine simultaneous-expiry groups, 45 refunds and 51 retired claims.

The unchanged interval/Fraction oracle passed nine unit tests. Each replay action checks an independent expected hash, then the final vector checks cash and lifecycle fields. The ordinary committed-fixture replay passed. Generated fixture SHA-256: `05c835b6c9957793775ddabf29e29205c1c0fb531fe67d1c1c515133f42f8e29`. Detailed local output: `contracts/deployments/vesting-histories/summary.json` and `batch-0.log` through `batch-7.log`.

`python3 scripts/calibrate-membership-lifecycle.py` generates six current permanent-retirement rational calibration vectors. `RewardCurveCalibrationTest` compares the current onchain result against them; historical 004 calibration reports remain unchanged. No model reads production results to generate expected economics.

These are local deterministic/fuzz/model results, not an external audit, public fork run or deployment. Large model/replay test gas includes exhaustive oracle reads and is not an operation gas benchmark.
