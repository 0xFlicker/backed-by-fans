# Validation Guide

This guide is for the later implemented candidate. New cancellation/refill actions and tests described here are not available merely because this plan exists. Run from the repository root unless a subshell changes directory.

## Prerequisites

Use pinned dependencies from `web/package.json`, local Foundry/Solidity settings, Slither 0.11.6, Python 3, Bun and the existing fork tooling. Read `AGENTS.md` before operating local services. Preserve the current worktree and running review state; no public transaction is part of validation.

## Source and linked contract checks

```sh
(cd web && bun install --frozen-lockfile)
(cd contracts && forge fmt --check)
(cd contracts && bash scripts/build-linked-protocol.sh)
```

The linked-build command returns a manifest. Use its library mapping for focused Foundry runs as `scripts/verify-local.sh` does; an unlinked test is not accepted as linked implementation proof. Extend existing RefundsAndOwnership, ERC5643Adapters, VestingLedger, VestingHistoryReplay, retirement, invariant and Fizz suites, and add focused periodic-refill coverage. Update `contracts/test/models/run_vesting_histories.py` and its independent reference model/replay to include cancellation retention, enrollment and actual refill purchases. Do not replace the reference calculation with calls to production accounting.

Then regenerate bindings and run the repository gate:

```sh
(cd web && bun run generate)
(cd web && bun run generate:check)
bash scripts/verify-local.sh
```

The gate covers contract tests, static analysis, web checks and existing browser/tool regressions. Verify that the new scenarios are included; green old tests alone are insufficient. Record source hash and exact commands/results.

## Cancellation acceptance

1. Create fixed-price and contribution-priced tiers with explicitly chosen retention; purchase, sponsor, transfer and grant positions.
2. At exactly 10 units unused with 30% retention, owner cancellation pays 7 and credits 3 to creator proceeds. Repeat with 0/100%, one-unit rounding, earlier claims and scaled fractions.
3. Repeat as token-approved and owner-wide operators; refund always reaches current owner. Creator-only attempts and revoked approvals fail. Lower retention on existing positions, then reject increases before/after admin transfer.
4. Cancel while paused, then claim final-owner earned fractions without a live NFT. Confirm zero future weight, one capacity release, and new identity/current curve on return.
5. Reject an exact-transfer failure atomically, leaving enrollment and position intact. Confirm standard adapter behaves identically and can recover from AccountingBehind through separate maintenance.
6. Reconcile creator retention as earned credit, actual owner refund as external payout and all protected residues. Withdraw retained and ordinary creator earnings together without duplicate accounting.

## Refill acceptance

1. Fixed-positive 30-day tier: 7-day target/6 days left buys one period; 45/10 buys two; 60/60 buys none. Vary caller cap, paid-time cap, uint64/gross headroom and fractions of affordable periods.
2. With price 20, balance 55 and allowance 40, show 2.75 balance periods but at most two collectible whole periods. Use two positions sharing the funds and confirm no double reservation.
3. Enable capability after a manual approval and prove no charge without enrollment. Enroll a grant-only position with pending referral choice; first successful payment locks it. Test intervening manual lock precedence.
4. Execute from a third wallet. Revoke allowance and reject payment transfers, then successfully process unrelated maintenance and claims. Failed refill must not claim to have saved reverted catch-up.
5. Test T-1/T/T+1: only T-1 can refill. Let an enrolled position expire with funds and allowance; retire it normally and prove later calls cannot resurrect it.
6. Test cancellation/refill both transaction orderings, stopped enrollment, transfer including receiver callback, pause/unpause and restored allowance. Check current-owner authorization at execution and clear intent on every retirement route.

## Browser and funded local review

Test member/operator cancellation and non-owner refill entry, creator policy controls, target/approval/stop tools, paused controls, grant-policy disclosures, stale reads, transaction failures, keyboard and narrow layouts. Verify actual contract reads and receipt outcomes, not just page load.

Use lifecycle-owned fork tooling and existing private dev configuration. Run preflight first:

```sh
bash scripts/test-protocol-fork.sh preflight
```

For candidate acceptance use a fresh retained run ID and explicitly configured execution endpoints through the existing `run`/`serve` flows. Inspect lifecycle records/listeners before changing anything. The upstream RPC is already privately configured; do not print credentials or use public signing keys. Keep destructive tests on a separate disposable run. Preserve the baseline manual review setup until its replacement is ready.

The eventual review handoff must use chain 31337, RPC `http://127.0.0.1:18557`, web `http://localhost:3110/chains/31337/protocol`, and the changed deployment's browser configuration. Seed both user wallets via the existing `web/scripts/seed-protocol-review.ts` procedure in AGENTS.md, restore the threshold-one Safe signer and at least 250 USDG-equivalent first-month protocol fees plus review balances. Keep OperatorGuarded behavior; this feature does not authorize public-buyback mode. Verify ownership, balances, claims and signer authority after seeding and leave the accepted environment running.

Update scenario producers and evidence verifiers for actual refund versus retention before treating fork results as acceptance. Retain source/runtime hashes, deployment/link manifest, model results, browser receipts/screenshots and the exact funding reconciliation.

## Documentation

```sh
(cd web && bun run whitepaper:build)
git diff --check
```

Render/inspect the changed whitepaper and compare its cancellation/periodic wording with contract behavior. Local source/model/browser/fork validation does not authorize a public deployment or establish independent audit approval.

## Protected cancellation quote regression

Show estimate, conservative minimum and chain-time deadline separately. Cover normal delayed inclusion before/at the deadline, rejection after deadline, a shortened window near membership expiry, no future live window, changing vesting rates within the quote window and improved retention. Successful in-window cancellation pays at least the displayed minimum without touching earned claims; expired quotes require new approval.

## Cap-change regression

With an enrolled target, lower the paid-time cap below current remaining paid time: enrollment and time stay intact and refill reports no capacity. When only one whole period fits, permit only that period. Raise the cap again and show refill can proceed toward the unchanged target without re-enrollment. Include grants to distinguish total target time from paid-cap usage.

## Grant revocation and refill regression

Enroll a paid position whose granted time keeps it above target; remove granted time so total remaining time drops below target. No refill is authorized afterward until the current owner explicitly re-enables it. No funds are returned by revocation, and paid time is preserved. Cover failed/zero-time revocation, grant-only retirement, pending referral cleanup, generic “Periodic refill off” state, owner-only re-enablement, concise creator disclosure and grant-revocation detail in transaction history; no stored stop-reason state.

## Paused configuration regression

While paused, enable tier capability and explicitly enroll/update a live position. Configuration moves no funds and refill payments remain blocked. After unpause, only still-live enrolled positions may refill; stopped and expired positions do not restart.

## Non-live cancellation preview regression

Select a live position, allow it to expire before preview, and then retire it through maintenance. Both non-live phases return explicit cancellation-unavailable lifecycle status, including with a stale quote deadline; no valid zero-refund action or refill is offered. Unknown IDs remain distinct errors. The final owner can still reach normal settlement/earned-claim views without a live NFT, and the preview does not invent a separate per-retired-token claim balance.

## Exclusive paid-time cap regression

For a 30-day tier with N=1, 29 paid days plus one 30-day purchase yields 59 days and is allowed; exactly 60 days is rejected. Cover one second below the limit, N greater than one, zero/unlimited, and manual purchases, renewals, sponsorships, contributions and refill through the same paid-time rule. Targets through N periods are admitted, larger new targets rejected; existing targets survive cap changes. Granted time does not consume paid capacity, and ordinary numeric/expiration bounds still apply. Detailed wording is checked in the whitepaper/docs, without new wordy disclaimers on ordinary experience pages.
