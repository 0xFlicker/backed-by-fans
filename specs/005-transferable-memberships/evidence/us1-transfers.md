# US1 — Transferable live positions

Scope: local source and EVM/component evidence on the uncommitted feature tree, based on `1503fa1d4272f2da133d4e09be3f242b846fc9a0`. No public deployment or transaction is claimed.

- Linked focused contract run: 104 tests passed across transfer, receiver, identity, refunds, claims and preview suites (`/tmp/bbf-transfers-green.log`). Transfer tests include paused/unpaused backlogs exceeding 25 events, unchanged accounting cursor and schedule, receiver callbacks, exact-expiry refusal, approval clearing, current-owner claims/refunds and final-owner retirement credit.
- Transfer/UI/authenticity/native-receipt run: 46 tests passed (`/tmp/bbf-transfer-ui-green2.log`). Approval-read failure and incomplete accounting do not gate a live transfer. Receipt handling distinguishes the receipt recipient from a later canonical owner, and invalidates both affected wallets.
- `membership-transfer.spec.ts` now authors the configured-wallet flow with 260 expiry-only entries, a projection exceeding 256 steps, transfer while paused, independent sibling positions at both wallets, transfer-only approvals, former-owner denial and creator refund to the recipient.
- The obsolete immutable testnet factory active broadcast pointer was removed after verifying its exact matching historical receipt at `contracts/broadcast/DeployDirectProtocol.s.sol/46630/run-1789107837.json`. Generated bindings no longer attach this lifecycle ABI to the previous factory. Historical receipts and independent renderer registry records remain source evidence.

## Configured browser follow-through — 2026-09-12

T047 is complete. The existing mainnet RPC configuration was recovered and mapped privately into the authentic fork harness. `membership-transfer.spec.ts` passes against origin chain 4663/block 58083838, execution chain 31337 on port 18557 and the app on port 3110 (`artifacts/protocol-fork/transferable-memberships-20260912-02/browser-134619`).

The scenario creates three paid positions and 260 complimentary expiration entries, advances to an incomplete 256-step projection, approves and safely transfers one live ID while paused, and compares stored time, shares, referral, reward and accounting fingerprints unchanged. Both wallets' sibling positions retain their ownership. Approval is cleared; the approved recipient and former owner cannot exercise owner-only claims/renewal outside their authority.

After bounded maintenance retires the complimentary positions, the creator refunds the transferred ID to its current owner. That ID burns; the final owner claims exactly its preserved whole retirement credit while retaining the identical fractional remainder. Browser transactions use the existing wallet-library flow and successful receipts, followed by canonical reads; the branch's mined transactions and receipts are exported before snapshot reversal.

The transfer screen runs at 320 CSS pixels with no page overflow and no Axe violations. Focus/keyboard/announcement semantics also retain source/component evidence; screen-reader replay is unverified. All 48 authentic mainnet-fork contract tests pass in addition to the lifecycle-specific suites. See `browser.md` and `verification.md` for final scope and aggregate results. No public-chain writes, commits, pushes or deployment occurred.
