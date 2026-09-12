# US2 retirement checkpoint

Scope: uncommitted feature changes over `1503fa1d4272f2da133d4e09be3f242b846fc9a0`. This records the retirement stage; it is not a final feature/build/deployment verdict.

## Contract evidence

Linked library rebuilt with `bash contracts/scripts/build-linked-protocol.sh` from the contracts directory (Solidity 0.8.36). All source/test callers compiled after the retirement ABI update. Foundry tests use profile `robinhood` with the repository's test-harness overrides `--code-size-limit 1000000 --gas-limit 1000000000`; these are not deployment proof.

- `MembershipRetirement.t.sol`: 9 passing tests. Exact historical burn/effective timestamp, one-time occupancy release, zero shares, funding history, one-step funding-tail-before-expiration split, paused permissionless batches, free/contribution expiry, repeated fresh IDs and exact fractional credit conservation, payout-free maintenance, same-call retirement claim, already-burned claim refusal, and settled retired claims without an NFT while behind/paused.
- `MembershipAccountingPreview.t.sol`: 4 passing tests. Tier preview/write parity at each budget from 1 through 25 with distinct expirations and changing denominators; non-selected beneficiary's retirement credit; grant-only equal-time partial batches; zero-budget refusal to skip expiry.
- `AccountingPreview.t.sol`: 8 passing tests including 256 fuzz cases and bounded frontier access. Funding-only harness now schedules test positions at a far-future expiry to preserve the position lifecycle premise of those tests.
- `VestingScheduler.t.sol`: 15 passing tests including three 256-run fuzz cases. Funding START/END chronology, exact tails, deterministic ties, cancellation, partial progress, atomic rollback, and punctual/delayed/batch-equivalent retirement.

Commands used the actual linked mapping from `contracts/out/vesting-leaf/link-manifest.json`. The final retirement-only rerun used `FOUNDRY_TEST=test/MembershipRetirement.t.sol FOUNDRY_SCRIPT=/tmp/vesting-no-scripts` to isolate it from concurrent next-phase API test authoring.

T010's scheduler coverage passes, but its legacy `VestingHistoryReplay.t.sol` generated fixture still encodes the former persistent-position model. Its maintenance/preview signatures are mechanically migrated; the independently regenerated multi-position history remains tracked by T010/T063, and neither this file nor this checkpoint claims that old replay passes.

## Application evidence

`bun run generate` regenerated bindings from the compiled contracts. Accounting reads now provide explicit beneficiary/referrer; typed status includes expiration queue and next boundary kind. Funding controls recognize expiry-only pending work.

`bun run typecheck`: passed after the changed application and E2E callers were migrated.

Focused Vitest command covered maintenance, retired claims, MembershipExperience, VestingSummary, membership reads, payout reconciliation, advance previews, and direct reads: **8 files, 52 tests passed**. This includes six new component cases and two new native receipt-log reconciliation cases. Component tests cover action availability without creator/position authority, explicit bounded continuation, fractional-only credit, missing/error/stale states, and exact event attribution. Existing wagmi simulation/write/viem receipt/replacement handling remains the transaction authority.

The old creator-only historical-token scanner and its tests were removed. Both membership and management screens expose reusable bounded maintenance and separately claimable ended credit. A successful batch never submits another batch or payment automatically.

## Configured browser follow-through — 2026-09-12

The earlier missing-RPC conclusion was incorrect: the repository already configures `ROBINHOOD_MAINNET_RPC_URL`. It is privately mapped into the existing authentic harness, using origin chain 4663/block 58083838 and disposable execution chain 31337 at port 18557, with the app at port 3110.

`membership-retirement.spec.ts` passes against that graph (`artifacts/protocol-fork/transferable-memberships-20260912-02/browser-133951`). An unrelated wallet processes two bounded batches while paused; the first preserves partial progress, the second clears all scheduled work. The NFT is burned, and its zero-NFT former owner receives exactly the recorded whole reward balance while preserving the fractional remainder. Browser library receipts and canonical reads establish the outcome; mined transactions/receipts are retained before the scenario snapshot is reversed.

The 320 CSS-pixel maintenance view passes page-overflow and Axe checks. Native keyboard/focus/announcement semantics remain implemented and source/component reviewed; screen-reader behavior has not been verified. See `browser.md` for final accessibility boundaries.

The independent current-lifecycle histories and full local contract verification now supersede the earlier intermediate replay limitation above; see `invariants.md` and `verification.md`. All 48 authentic mainnet-fork contract tests additionally pass (`/tmp/bbf-authentic-fork-contracts.log`); no public-chain transaction occurred.
