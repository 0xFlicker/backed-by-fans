# One-button burn — 2026-09-09


**Evidence scope (2026-09-09 documentation pass):** This file retains dated results,
not a live service inventory. Use the Ready message and current run's deployment
files to identify the running environment. Follow the [operator quickstart](quickstart.md)
for current commands. Final complete acceptance for the latest source remains
pending T096–T098; earlier complete runs do not certify later changes. No new
acceptance run or restart was performed for this documentation update.

The verified manual handoff run was `burn-ready-20260909`, with RPC18557 and the single
development server on web3110. The origin remains the verified block58083838.

**Burn** at the top of the protocol page discovers fresh work on click and submits
one ordinary wallet transaction to the factory's immutable `burnRouter()`.
The router accrues and releases registered-tier fees, then checks the vault's
current eligibility before each purchase. Its only persistent coordination state
is which source bucket gets the next opportunity for each currency. No token
approval, Safe signature, local backend, nested fork or persistent offchain state
is required to use this action.

Collection failures are isolated. Paused or cooling purchases leave inventory
available. Confirmed outcomes distinguish collected fees from burned tokens;
successful receipts remain authoritative if a subsequent balance refresh fails.
At most eight tiers, 100 earned membership IDs and 32 canonical currencies enter
one transaction. Browser discovery rotates bounded pages rather than refusing
all progress when permissionless membership counts grow.

## Verification

- Full web suite: **583 tests passed across 93 files**.
- Full local contract suite: **321 passed, 0 failed, 8 skipped across 44 suites**.
  The skips are opt-in external fork tests; they are not represented as executed.
- Focused router tests: **15 passed**, including source alternation, failed
  purchases, callback reentrancy, stale revisions, registration and batch limits.
  Cooldown fault tests use explicitly labeled synthetic fixtures; the browser
  execution below separately exercises real deployed contracts.
- Lint, TypeScript and generated ABI drift checks passed.
- Actual browser transaction: an ordinary funded local test wallet collected all
  three seeded tiers and completed three purchases in **one transaction**.
  Total supply reduction matched the batch receipt's burned amount.
- A second click collected fees without bypassing the global cooldown. After
  eligibility returned, donated ETH received the next source opportunity and
  exactly one buyback used that cooldown.
- The test uses the existing chain's snapshot/revert solely for test isolation.
  The website never snapshots, resets or advances the chain.
- The browser uses the existing EIP-1193 local wallet fixture. This does not claim
  verification of a personal browser-wallet extension or a production cron.

[Actual transaction evidence](../../artifacts/protocol-fork/burn-ready-20260909/one-button-burn/receipt.json)
and [review resolutions](../../artifacts/protocol-fork/burn-ready-20260909/one-button-burn/review.json)
are retained with the run, along with full check logs.

## Ready for manual testing

The test restored all three WETH/USDG/AMD memberships, each purchased for four
30-day periods, with 15 days elapsed. Their earned fees remain uncollected,
future fees remain reserved, and vault settlementSequence is zero.
Wallet `0x467172992E0aBa58411d14eC8b174167B0e359a6` retains approximately
**23.976 ETH** and remains the sole protocol Safe owner.

[Verified handoff state](../../artifacts/protocol-fork/burn-ready-20260909/one-button-burn/handoff.json)
records the router code hash, membership IDs and fee balances.
Open <http://127.0.0.1:3110/chains/31337/protocol> and press **Burn**.
The [quickstart](quickstart.md#burn-from-the-protocol-page) covers this workflow.

No public chain deployment, production release or Vercel Cron deployment was
performed. The CLI execution runner remains independently available; it was not
rewritten as part of the website batch action.
