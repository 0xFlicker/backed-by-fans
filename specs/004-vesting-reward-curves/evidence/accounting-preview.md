# True accounting preview evidence

Date: 2026-09-10. Prior gas optimization committed as `170ae94`; this preview follow-up remains uncommitted.

## Behavior

`previewAccounting(tokenId, referrer, maxSteps)` is a STATICCALL-safe view returning stored balances, projected balances, four allocation deltas and explicit progress. It replaces the old tier `earnedBalances` endpoint. Reads allow up to 256 checkpoints; writes retain their 25-checkpoint bound. An incomplete projection reports its actual covered timestamp and next boundary rather than claiming to be current.

The ledger uses a bounded in-memory frontier over the stored heap and queued successors. It neither copies the entire heap nor writes storage. Preview arithmetic matches execution, including endpoint tails, carried reward division and referral changes. Vault `previewProcessing` shares execution eligibility rules and accepts hypothetical additional inventory; it does not predict swap output.

Account and membership earnings refresh every 15 seconds using these views. Protocol actions show projected release amounts and changes since settlement. Native transaction simulation remains at explicit submission. Claims retain contextual catch-up handling and access to already-settled funds.

## Checks

- 461 regular contract tests passed across 45 suites using the Robinhood profile and explicit linked-library mapping.
- 8 stateful invariant tests passed across 5 suites, with 256 runs and 500 calls per run.
- 674 frontend tests passed across 100 files.
- TypeScript, targeted ESLint, generated-binding verification, Solidity formatting and diff whitespace checks passed. Changed TypeScript files were checked with Prettier; the single formatting correction was applied.
- Preview comparisons cover randomized schedules, ties, gaps, zero/partial/full budgets, rounding, cancellation, suspension and referrals. Claim tests compare projected values with actual payouts. A 1,000-member heap test verifies bounded reads with no writes.

An extra unlinked default-profile test invocation failed its expected immutable library validation (`InvalidVestingLink`). The documented linked-profile invocation was then rerun and passed all 461 tests. Unlinked results are not deployment evidence.

## Unchanged deployment gates

| Measurement | Result |
| --- | ---: |
| Creator tier deployment gas | 7,480,901 / 7,500,000 |
| Tier creation bytecode | 41,160 bytes |
| Tier runtime | 34,640 bytes |
| Factory creation bytecode | 57,508 bytes |
| Vault creation / runtime | 33,076 / 18,374 bytes |
| Router creation / runtime | 5,872 / 5,659 bytes |
| Ledger runtime | 20,929 bytes |

Creation bytecode measurements above are not constructor-inclusive transaction payloads. Existing tests separately enforce exact deployment payloads and complete graph limits, including the 95,000-byte transaction limit and factory headroom. No limit was increased.

Ledger address: `0xcC35B047B6e2f90e91a357e9450e3F6c380C06a1`.
Runtime hash: `0xe305acadd3d5e32f6468c742859c08f52077e601b8526442dae439d012a5670d`.

## Live local verification

Evidence directory: `artifacts/protocol-fork/accounting-preview-20260910-01`.
The lifecycle deployed and verified the complete graph on the authorized local fork, with actual demo memberships and payments. Web remains at `http://127.0.0.1:3110`; wallet RPC remains at `http://127.0.0.1:18557`, chain 31337. Both requested user wallets were funded.

`web/tests/e2e/accounting-preview.spec.ts` passed against that graph in 42.7 seconds. It verified:

- Account and membership earnings update after advancing chain time without reloading.
- Protocol funding deltas appear before submission.
- Display reads do not call either claim transaction entry point; the wallet nonce remains unchanged.
- A real membership claim succeeds, increments the nonce, clears stored member/creator balances and advances accounting.
- The phone account layout has no horizontal overflow; screenshots were captured for account desktop/phone and membership/protocol phone. Account and protocol phone captures were visually inspected.
- No browser page errors occurred. The test restored its chain snapshot afterward, preserving the funded review baseline.

Successful browser artifacts are in `preview-browser-3/`. The first two attempts were interrupted by development-server Fast Refresh navigation reloads; they are retained separately and are not counted as successful runs. Warming all three routes resolved the interruption.

No public deployment or push occurred. This focused flow does not substitute for the still-open named screen-reader acceptance task or execution of every existing end-to-end scenario.
