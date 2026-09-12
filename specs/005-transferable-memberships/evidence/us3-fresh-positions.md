# Explicit membership positions — implementation evidence

Working tree based on `1503fa1d4272f2da133d4e09be3f242b846fc9a0`; not a committed or deployed build.

The tier now creates monotonic independent IDs and renews explicit live IDs. Gifts/grants distinguish creation from existing-position sponsorship; refunds/revocation pin the expected owner. Creator-only refunds permanently retire before paying the current holder. Lifetime gross is not rewound. Core selected claims enforce 32 IDs, 8 tiers and 25 aggregate accounting events, with retired/referral/creator categories counted once.

The application uses explicit New/Renew choices and block-pinned owner pages. Creator grants distinguish new versus existing positions. Receipt reconciliation obtains new IDs from mint events and verifies explicit owner/time state; refund submission rechecks expected recipient and ceiling.

## Local evidence

- Linked source/test compilation passes using `bash contracts/scripts/build-linked-protocol.sh`.
- Combined membership identity, transfer, receiver, refund, claims and accounting preview tests: 104 passed, zero failed/skipped. Command: `FOUNDRY_PROFILE=robinhood forge test --libraries "$bbf_mapping" --code-size-limit 1000000 --gas-limit 1000000000 --match-path 'test/{TransferableMemberships,MembershipReceiver,MembershipIdentity,RefundsAndOwnership,ClaimsAndWithdrawals,MembershipAccountingPreview}.t.sol' -vv`. The override ceilings apply only to test harnesses.
- Membership/grant UI and state tests: 39 passed. Owner-position selector: 3 passed. Combined portfolio, membership, selector and reconciliation run: 102 passed across 8 files before subsequent transfer integration changes; final combined rerun remains required.
- New batch preview tests observed missing-method compilation failure before implementation; 6/6 tier preview tests then pass, including same-call retirement and per-category payout parity.

## Execution ordering and remaining evidence

The account surface could not compile against the explicit-ID ABI while retaining singular-wallet records. Therefore T049–T055 were pulled forward as dependencies of US3 caller migration, using the final bounded model instead of a temporary compatibility path. Independent T050/T051 test authors observed failures before the corresponding implementation and reviewed the resulting cache/read/component behavior. US1 contract-test authoring proceeded after the US3 core and focused UI validations, with configured browser follow-through recorded below.

## Configured browser follow-through — 2026-09-12

T036 is complete. Existing `ROBINHOOD_MAINNET_RPC_URL` configuration was recovered and privately mapped to the harness; the earlier missing-endpoint conclusion was incorrect. The authentic mainnet origin (4663, pinned block 58083838) runs as local execution chain 31337 on port 18557, with the web application on port 3110. Evidence is retained under `artifacts/protocol-fork/transferable-memberships-20260912-02`.

- Paid creation, explicit same-ID renewal, gifting and issued-weight verification passed (`browser-131240`).
- Free renewal preserves live weight; expiry burns the old ID; a zero-contribution return creates a new ID with zero shares, retains earned owner credit and leaves lifetime gross unchanged (`browser-131629`). The free action button now explicitly distinguishes New membership, Renew membership #ID and Membership ended.
- All mutable creator controls, new grants, revocation and two-step creator ownership passed. Paused retirement, no-NFT owner reward claim and fresh paid return passed (`browser-133209`).
- Successful wallet-library receipts and canonical contract reads establish these outcomes. Snapshot branches retain mined transactions and receipts before reversal. Fixture setup uses disposable EOAs without inherited origin-chain account code and real origin payment tokens; this is local injected-wallet acceptance, not a browser-extension or hardware-wallet test.

All 25 focused membership/URL-selection component tests pass after the runtime fixes. See `verification.md` and `browser.md` for final aggregate results and the remaining evidence boundaries. No public-chain writes, commits, pushes or deployment occurred.
