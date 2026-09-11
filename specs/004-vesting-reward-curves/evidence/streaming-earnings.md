# Streaming earnings evidence

Date: 2026-09-10. Local implementation only; no commit, push or public deployment.

## Behavior

The existing accounting preview now returns four `2^128`-scaled per-second rates from its projected ledger state. Creator/protocol use projected allocation rates; referral uses the requested referrer; member uses full-precision multiplication by eligible weight share. Incomplete previews return zero rates. Member rate flooring is a display approximation; writes retain exact ledger accounting and all existing bounds.

The shared display clock runs at most every 100 ms and updates React snapshots only when formatted text changes. Amounts use bigint arithmetic, existing rounding/localization/scaled-token rules and individual contribution boundaries. Each identity/timestamp pair anchors to monotonic receipt-time observation. Same timestamps do not renew the 30-second window. New authoritative values can reduce the display. Visibility changes pause the shared timer and trigger existing query refresh on return.

Changed digits roll in place with tabular widths. Reduced motion disables rolling. Assistive text stays at the authoritative preview while visual ticks are hidden from accessibility. Existing currency prices convert streamed token amounts into USD without extrapolating prices. Transaction requests, settled-only claims, historical spent/burned totals and reserves remain authoritative/static.

Account totals/cards, membership earnings, protocol available funding, funding deltas and membership funding projections consume the shared component. Protocol vault balances and projected funding refresh atomically at one block.

## Automated verification

- 462 regular contract tests pass across 45 suites, including unchanged deployment payload, graph, size and gas gates.
- 8 invariant tests pass across 5 suites (256 runs, 500 calls per run).
- Rate parity test covers unequal member weights, fractions, referral identity, no requested member and checkpoint exhaustion. Expanded final rate suite: 8 tests passed.
- 695 frontend tests pass across 104 files, including shared timer lifetime, stale repeated blocks, boundaries, corrections, identity reset, visibility and display formatting.
- TypeScript, targeted ESLint, generated binding check and Solidity formatting pass.
- Creator tier deployment: 7,487,531 gas, below the unchanged 7,500,000 ceiling.
- Ledger runtime: 21,322 bytes; address `0xCA48e24C30800eFfD34644c2c4113bD93aD3dD4F`; runtime hash `0xa4c22c5d3f760e3a876c5ef48fdf7b095fafa4bfd6948fd981c9d95c60d82f1a`.

## Local browser verification

The isolated graph and full runtime/source verification completed successfully in `/tmp/bbf-streaming-review/artifacts/protocol-fork/streaming-20260910-03`. Playwright `streaming-earnings.spec.ts` passed in 37.5 seconds. It verified visual USD accrual beyond the unchanged authoritative accessible amount between reads, responsive width, reduced-motion styles, high-contrast operation, membership/protocol streaming and no browser page errors. Screenshots are retained in `artifacts/streaming-browser-final`; account and membership phone captures were visually inspected. A final CSS adjustment aligned digits, separators and currency glyphs; browser text-range measurements confirmed identical vertical positions, with the corrected capture at `artifacts/streaming-browser-final/membership-final.png`. The estimate disclosure was moved below the account actions; 12 focused component/account tests passed afterward.

Earlier setup attempts and a development Fast Refresh navigation interruption are retained separately and are not counted as passing checks. The existing review chain at port 18557 has not been stopped, reset or redeployed. Isolated validation uses a disposable source copy under `/tmp/bbf-streaming-review`, RPC port 18558 and web port 3114. The new ABI requires the newly deployed contracts; it does not add compatibility behavior for the previous graph.
