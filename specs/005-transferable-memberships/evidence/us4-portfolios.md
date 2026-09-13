# US4 — Bounded portfolios and claims

Local evidence on the feature tree; configured browser execution remains unverified.

## Contract results

`FOUNDRY_PROFILE=robinhood forge test --libraries <linked manifest mapping> --code-size-limit 1000000 --gas-limit 1000000000 --match-path 'test/{ClaimEverything,MembershipAccountingPreview}.t.sol'`: **42 tests passed** (`/tmp/bbf-portfolios-contract.log`). Harness overrides do not prove deployability.

The large scenario creates 101 positions in one tier plus one in each of eight other tiers. It verifies owner pages of 100 + 1, rejects 33-ID and nine-tier transactions, executes successive 32-ID and eight-tier batches, and compares each category against the batch preview. After 218 combined funding/expiry events it claims retired credits from a zero-NFT wallet. Total payouts plus held balances equal the original 109,000 raw payment units. A separate scenario transfers or burns selected IDs and verifies factory rollback, including earlier-tier accounting and payouts.

## Application results

- Cache/discovery/reward-reader/component tests: 102 passed before transfer integration (`/tmp/bbf-portfolio-focused.log`). Tests cover 101 owner positions and nine tiers, pinned pages, ownership reordering, stale snapshots, partial totals, fractional-only balances, zero-NFT access, 32-ID/eight-tier limits, one accounting simulation per tier and actual shared step budgets.
- Payout helper and account component tests: 27 passed after extracting exact live/retired/referral/creator receipt categories (`/tmp/bbf-payout-green.log`). Final full-suite evidence supersedes these intermediate counts.
- Account selection stays explicit. Invalid ownership blocks submission and preserves the selection until the user clears or changes it. Clear selection restores focus to the rewards heading. Direct settled retired claims remain available independently of a broken position selection or accounting backlog.
- `supporter-account.spec.ts` authors 101-position/nine-tier paging, multiple claim batches, mid-selection transfer, zero-NFT ended credit and narrow-screen accessibility checks. `accounting-preview.spec.ts` selects explicit positions and checks view-only projections before transaction submission.

## Configured browser follow-through — 2026-09-12

T058 is complete. `supporter-account.spec.ts` passes against the authentic origin-chain payment tokens and current local protocol graph (`artifacts/protocol-fork/transferable-memberships-20260912-02/browser-134619`), execution chain 31337 on port 18557 and web port 3110.

The large portfolio creates 101 same-tier positions and one in each of eight additional tiers, loads the 100+1 owner pages, then transfers a selected token to another wallet. The stale selection blocks claiming until cleared/refreshed. The remaining 100 positions are claimed in four batches bounded by 32 IDs, followed by seven additional tiers and the ninth tier on the next reward page. Every action reconciles successful supplied receipts; the retained branch includes all mined transfers and payout events. Exact category totals and conservation are independently asserted by the 101-position/nine-tier contract scenario described above.

A separate configured account journey discovers a burned NFT's owner balance without any owned NFT and claims its durable earned rewards. Account keyboard entry, error/empty recovery and Axe checks pass; the large portfolio also passes 320 CSS-pixel overflow and Axe checks. Screen-reader replay remains unverified and is distinguished in `browser.md`.

The earlier missing-RPC conclusion was incorrect; the existing `ROBINHOOD_MAINNET_RPC_URL` was privately mapped to the harness. See `verification.md` for final source identity and all verification classes. No public-chain writes, commits, pushes or deployment occurred.
