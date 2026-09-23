# Cancellation implementation progress

This is intermediate evidence, not T024 acceptance or final delivery.

- Linked iteration: 624 contract tests passed with fuzz runs 32, invariant runs 8/depth 32; fork tests excluded. Command: `FOUNDRY_PROFILE=robinhood FOUNDRY_FUZZ_RUNS=32 FOUNDRY_INVARIANT_RUNS=8 FOUNDRY_INVARIANT_DEPTH=32 forge test --libraries "$(jq -er .mapping out/vesting-leaf/link-manifest.json)" --no-match-path "test/fork/*" --code-size-limit 1000000 --gas-limit 1000000000 -vv` from contracts. `/tmp/bbf-feature006-contract-sweep3.log`.
- Additional full-retention endpoint: all 16 `MemberCancellationTest` cases passed. `/tmp/bbf-feature006-cancellation-endpoints.log`.
- Web: 822 tests passed before the final 3 cancellation component cases; all 9 component cases then passed. `/tmp/bbf-feature006-web-sweep2.log`, `/tmp/bbf-feature006-cancellation-ui-final.log`.
- Model: `python3 contracts/test/models/vesting_reference.py`: 10 cases pass. `python3 test/models/run_vesting_histories.py --histories 8 --actions 100 --batch-size 8` from contracts passed sparse/dense/irregular execution comparisons, including deterministic 0/30/100% retention. `/tmp/bbf-feature006-histories.log`.
- Isolated browser: `member-cancellation.spec.ts --project=desktop --workers=1` passed against changed linked contracts. Proved creator rejection, transfer, approval, paused operator cancellation, current-owner balance delta, 70/30 split, burn, informational retained-proceeds totals and axe accessibility. Evidence: `artifacts/protocol-fork/feature006-cancel-20260923c/browser-cancellation/`.
- Existing review fork 18557/web 3110 preserved. Isolated source copy `/tmp/bbf-feature006-candidate` runs via the repository lifecycle on 18558/3112. Archive RPC read privately; all writes local chain 31337. Copy uses original read-only Git metadata and dependency links; source/build output is separate.
- Original workspace TypeScript source is clear; stale generated `.next/dev/types` references a removed old agent route. Isolated Next type generation will validate the current routes without disturbing the retained review process.

## Source hashes at this checkpoint

- `contracts/src/MembershipTier.sol`: `5c77ae6d21289172654cc7c3403fd0581b4f4571303dbc2c11cc6da7783f83f6`
- `contracts/src/libraries/VestingLedger.sol`: `c21f80f8cbc7511a8774b7080ca5e7c2d18ec9fa8def36533ed01fdbd3a447ea`
- `contracts/src/types/MembershipTypes.sol`: `80ab824da2cf8e9e146545931781fb5a99e41a702a20c80f183d3d0ffd97dcfa`
- `contracts/src/interfaces/IMembershipTier.sol`: `7553ed3e036a6627dac522e75bf27261bb7fec62734741bdcd9c3715217f2f9f`
- `web/src/contracts.ts`: `5cabbc3d0c9b03b985b7a4cf2bd5fd7a37d18b568010850c151889eb348e60f6`

## Follow-up findings

- Generated bindings check passed (`bun run generate:check`, `/tmp/bbf-feature006-generation-check.log`).
- Isolated current-route TypeScript passed (`/tmp/bbf-feature006-isolated-typecheck.log`), without deleting the running review server's generated files. Lint passed after cleanup (`/tmp/bbf-feature006-lint3.log`).
- Changing-contribution-rate deadline test passes; all 17 focused native cancellation cases pass (`/tmp/bbf-feature006-cancellation-boundaries.log`).
- Eleven cancellation component tests pass, including preserving the receipt outcome after burn and preventing a late portfolio read from overwriting an explicitly selected cancellation target (`/tmp/bbf-feature006-cancellation-ui6.log`).
- Initial browser regression found fixture navigation resetting the selected account, an insufficient local test-wallet gas buffer during a time-dependent claim, an unnecessary management navigation clearing the grant recipient, and a real cancellation-selection race during late portfolio refresh. Fixes are authored; complete regression rerun remains required. This is not a passing browser acceptance record.

- Rerun `browser-regression2`: first seven scenarios pass so far, including current-owner cancellation after pause/unpause, both funded/zero-funded-lot paths after claims, transfer of creator administration with ongoing payouts, all mutable creator controls, and paused reduction from 40% to 30% followed by approved-operator cancellation. The 390×844 operator path passed axe and horizontal-overflow checks. Large transfer/backlog cases remain running; do not treat this as a completed T024 gate.

## Temporary-log recovery note

The host crash and subsequent temporary-directory cleanup removed the `/tmp` logs referenced above. Those entries record interim results observed before cleanup; they are not retained current-candidate proof. Retained browser artifacts survived. See [local-verification.md](local-verification.md) for the fresh verification records saved under repository artifacts.
