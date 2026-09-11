# Accounting gas optimization — 2026-09-10

Optimizes the existing immutable accounting implementation. Baseline source is `5e01826b43bb9a528466f5f0eb4d971c35d66dd6`. Exact measurements, optimized source SHA-256 hashes and deterministic ledger hashes are in [gas-optimization.json](gas-optimization.json). No public deployment, commit, push or review-fork restart is part of this pass.

## Cold execution measurements

Solidity 0.8.36, Cancun, optimizer 200 runs, no via-IR, Forge 1.7.1. `GasAccountingTest` constructs fixtures in `setUp`, cools touched contracts/storage and measures only the operation with `gasleft`. Both revisions use the same measured calls and fixture values. Regression ceilings were added after capturing the baseline and do not participate in the measured interval.

These are gross execution gas figures, excluding fixture setup, transaction intrinsic gas and refunds. They are not wallet fee estimates or submitted gas limits. Claim fixtures exercise all four payment allocations and two members per tier. Scheduler fixtures have 128 funded members. External payment-token/Pons identities are synthetic; the combined case performs a direct protocol-token burn, not an external DEX swap.

| Operation | Before | After | Saved |
|---|---:|---:|---:|
| One checkpoint | 497,288 | 424,062 | 14.73% |
| Ten checkpoints | 2,205,894 | 1,717,451 | 22.14% |
| 25 checkpoints, ending lots | 4,284,293 | 3,360,615 | 21.56% |
| 25 checkpoints, queued renewals | 6,580,501 | 3,840,812 | 41.63% |
| 25 staggered checkpoints | 4,627,772 | 3,587,543 | 22.48% |
| Claim one tier, continuous earnings | 389,248 | 378,428 | 2.78% |
| Claim three tiers, continuous earnings | 1,127,490 | 1,104,440 | 2.04% |
| Claim eight tiers, continuous earnings | 2,982,220 | 2,928,595 | 1.80% |
| Claim three tiers with due endpoints | 1,667,043 | 1,543,148 | 7.43% |
| Member-only `claimAll` | 341,829 | 310,609 | 9.13% |
| Advance, release and direct burn | 688,554 | 644,747 | 6.36% |
| Join a membership | 932,101 | 809,555 | 13.15% |
| Renew a membership | 586,469 | 510,520 | 12.95% |

The largest gains are in backlogged accounting. Already-current multi-tier claims still incur each tier's independent bookkeeping and token transfer, so their savings are modest. These measurements do not support a general 42% reduction for every transaction.

## Gas after refunds

The benchmark also captures Forge's callee execution/refund counters, adds 21,000 intrinsic gas plus calldata cost, and applies Cancun's one-fifth refund cap. This removes the test caller's ABI/memory overhead and accounts for refunds that disappear when unnecessary storage writes are removed. Both source revisions passed the same benchmark assertions in separate local build directories; only the new regression ceilings were disabled for the baseline. Production source is unchanged during this measurement.

| Operation | Before | After | Saved |
|---|---:|---:|---:|
| 25 checkpoints, ending lots | 3,822,395 | 2,898,717 | 24.16% |
| 25 checkpoints, queued renewals | 5,278,883 | 3,438,914 | 34.86% |
| 25 staggered checkpoints | 4,165,874 | 3,125,645 | 24.97% |
| Claim one tier, continuous earnings | 341,653 | 336,433 | 1.53% |
| Claim three tiers, continuous earnings | 954,660 | 942,810 | 1.24% |
| Claim eight tiers, continuous earnings | 2,496,298 | 2,467,873 | 1.14% |
| Claim three tiers with due endpoints | 1,347,611 | 1,248,495 | 7.35% |
| Member-only `claimAll` | 356,943 | 328,523 | 7.96% |
| Advance, release and direct burn | 566,212 | 531,167 | 6.19% |
| Join a membership | 912,798 | 793,052 | 13.12% |
| Renew a membership | 576,526 | 503,377 | 12.69% |

These are modeled gas charges, not mined transaction receipts. They exclude L2 data fees, gas prices, and external DEX swaps. The JSON retains all input counters and all thirteen comparisons. Claims across multiple currencies can have different token-transfer costs from this common-token fixture.

## Implementation and safety arguments

- Lot storage shrinks from twelve words to seven. Raw amounts and cumulative prefixes use uint112 under the existing lifetime gross cap; checked casts preserve the bound. Public lot fields retain their existing uint256 encoding. Refund multiplication explicitly widens before multiplying by uint64 time; the intermediate can require 176 bits.
- Heap nodes shrink from four words to two. One live node exists per member, so generation/head are taken from its funding account. Cancellation removes the node before changing generation. Processing checks the node timestamp and START/END state against that head. A replacement boundary is strictly later, allowing a single downward sift. New/removal sifts write the moved node at its final position.
- Processing accumulates four global earnings totals in memory and credits them once. There are no external calls or eligibility changes within processing. For fixed denominator W, `floor((carry + sum(earnings))/W)` and its remainder equal sequential carried division. Referrer clocks still settle at each rate change, and incomplete calls only credit completed work.
- `claimAll` performs catch-up and category collection through one call to the existing linked ledger. Tier/factory authority, direct recipient transfers, category events, contextual errors, shared checkpoint limits and transaction rollback remain intact. Empty referral claims no longer initialize a timestamp; starting a later referral stream still settles its clock before increasing its rate.
- Tier, factory and router use the already vendored OpenZeppelin `ReentrancyGuardTransient`. This requires EIP-1153, consistent with the existing Cancun build target. The guard clears at each successful exit and failed calls roll back their transient writes. Existing callback/reentrancy and repeated-call tests remain applicable. No custom assembly was added.
- The sole new unchecked block computes payment splits. Gross is validated at or below uint112 max before transfer; immutable BPS factors sum to at most 10,000. Products fit in 126 bits and the sum of independently floored allocations cannot exceed gross. The code comments state this proof. No general unchecked accounting arithmetic was introduced.

## Verification

- 453 regular contract/deployment tests pass across 44 suites, including thirteen gas benchmarks, maximum gross/time, split-floor fuzzing, heap positions/order, queued gaps, refund rounding, authorization, transfer failures, reentrancy and complete linked deployment verification.
- Eight stateful invariant tests pass across five suites at 256 runs × 500 actions, with zero handler reverts. Combined direct/factory claims are included in the accounting handler alongside purchases, refunds, cancellation and reactivation.
- Slither 0.11.6 passes `--fail-high` on an isolated production-only linked build: zero high, 32 medium, 48 low and 38 informational findings. Changed-path findings were reviewed: division before multiplication implements tested fixed-point floors; local values default to zero; timestamp comparisons implement service boundaries; bounded external calls retain transient nonreentrant entry points and atomic rollback. No blanket detector suppression was added. This is scoped implementation review, not an independent audit.
- Full capacity: 10,000 members × ten payments; 100,000 checkpoints recovered in exactly 4,000 calls. Total gross gas including intrinsic cost: 17,257,743,571. Peak combined call: 7,784,283, below the existing 15,000,000 ceiling. A 10,000-payment cancellation costs 376,559 gross execution gas and preserves permanent reward weight.
- All 10,000 independent histories pass: one million authored economic actions replayed under sparse, dense and irregular processing/claim schedules. Exact scaled entitlements, frequency identity and rational attribution bounds hold, including 71,116 refunds, 40,611 synchronizations, 37,677 free renewals and 86,137 restorations. The final ledger runtime hash and all 313 input batch hashes are retained in [gas-optimization-histories.json](gas-optimization-histories.json).
- All 667 frontend tests and the TypeScript check pass. Wagmi generation/checks against the final artifacts produce no ABI changes. Its native artifact exclusions now omit the independent ledger build and OpenZeppelin's import-only IERC165 alias; both previously collided with the canonical consumer interface. No handwritten ABI or alternate generator was added.

The large Forge harness gas/code allowances below permit deployment fixtures and entire multi-transaction histories inside a test. Production limits remain explicit assertions; no Foundry configuration, deployment script or existing limit was increased.

## Deployment gates

| Gate | Optimized result | Unchanged limit |
|---|---:|---:|
| Creator tier deployment gas | 7,493,167 | Less than 7,500,000 |
| Tier base creation bytes | 41,221 | 49,150 |
| Tier runtime bytes | 34,701 | 98,304 |
| Linked ledger runtime bytes | 17,029 | 98,304 |
| Exact factory CREATE2 payload, mainnet/testnet configurations | 57,923 / 58,115 | 95,000, plus retained headroom assertion below 65,000 |
| Exact store A/B CREATE2 payload | 21,051 / 21,051 | 95,000; store runtime separately checked against 24,576 |

The creation-gas gate passes with only 6,833 gas remaining; it remains a tight regression constraint. Tests verify the entire deployment graph, source/runtime matching, immutable store bindings and deterministic linked addresses. The changed library and storage layout require a newly deployed immutable graph; they do not alter existing fork or public contract storage. No migration or compatibility path is added.

## Reproduction

Run from `contracts/`, sequentially to preserve the generated linked artifacts:

```sh
bash scripts/build-linked-protocol.sh
FOUNDRY_PROFILE=robinhood forge test \
  --libraries "$(jq -r .mapping out/vesting-leaf/link-manifest.json)" \
  --no-match-path 'test/{invariants,fork}/*.t.sol' \
  --code-size-limit 1000000 --gas-limit 1000000000 -vv
FOUNDRY_PROFILE=robinhood forge test \
  --libraries "$(jq -r .mapping out/vesting-leaf/link-manifest.json)" \
  --match-path 'test/invariants/*.t.sol' \
  --code-size-limit 1000000 --gas-limit 1000000000 -vv
python3 test/models/run_vesting_histories.py --histories 10000 --actions 100
BBF_FULL_VESTING_CAPACITY=true FOUNDRY_PROFILE=robinhood forge test \
  --libraries "$(jq -r .mapping out/vesting-leaf/link-manifest.json)" \
  --match-contract VestingCapacityTest \
  --code-size-limit 1000000 --gas-limit 100000000000 -vv
```

The capacity run used separate temporary `--out` and `--cache-path` directories while the oracle replay was running; it used the same preserved ledger mapping and final source. To run only the new gas benchmarks, replace the regular-suite filter with `--match-contract GasAccountingTest`.

Static analysis used a separate production-only artifact directory, built with `forge build --skip test --skip script` and the same linked mapping. Slither was passed explicit `--foundry-out-directory` and `--foundry-build-info-directory` paths with `--ignore-compile --config-file slither.config.json --fail-high`. An earlier invocation that resolved the default mixed test artifacts was interrupted; its test-IR errors are not counted as production verification.

Then run from `web/`:

```sh
bun run generate
bun run generate:check
bun run typecheck
bun run test
```
