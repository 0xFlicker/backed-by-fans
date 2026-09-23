# US2 refill acceptance

Completed T025–T039 on 2026-09-23. Broader US3 controls, final campaigns, convergence, and the final funded review handoff remain pending.

## Contract and independent-model proof

- Source tree SHA-256 (`contracts/src/**/*.sol`, sorted relative paths and file bytes separated by NUL): `c8ce904263d6010b7cdab5679f55ebc05fc55dee8d9b0ce84cf1d4e0f38d6211`.
- Linked leaf runtime hash: `0x1697d5ac8768609096ddf300d8d11ba75338d0b651f03b87efcc7770271a978f`; deployment manifest retained at `artifacts/protocol-fork/feature006-refill-20260923a/link-manifest.json`.
- `/tmp/bbf-feature006-refill-suite4.log`: 657 non-fork tests pass at fuzz 32, invariant 8 runs/depth 32.
- `/tmp/bbf-feature006-refill-increment-contracts.log`: 61 current linked cancellation/adapter/refill/isolation/invariant tests pass after regeneration, with the same iteration settings.
- `/tmp/bbf-feature006-refill-histories.log`: 8 independent 100-action histories, sparse/dense/irregular schedules. The independent oracle authors whole-period refill purchases, target enrollment/stop and allowance-blocked attempts, and checks earned claims, transfers, retirement, exact scaled cash and monotonic accepted gross.
- Contract coverage includes strict T-1/T/T+1; shared exclusive paid cap across manual/contribution/gift/refill paths; partial whole-period affordability; preserved targets across cap changes; pending/intervening referral locks; exact-transfer rollback; independent successful maintenance and claims; and clearing on self-transfer, revocation and retirement.

## Web and browser proof

- Generated-binding check passes: `/tmp/bbf-feature006-refill-generate-check.log`.
- `/tmp/bbf-feature006-refill-web2.log`: 108 focused tests pass. `/tmp/bbf-feature006-refill-all-web.log`: all 841 web tests pass at this increment.
- Focused ESLint passes. Isolated candidate TypeScript passes; the original live workspace still has stale `.next/dev/types` for an already removed agent route. No type suppression or obsolete route was introduced; final fresh-build verification remains required.
- `browser-initial/report.json`: real browser journey passes on isolated chain 31337, RPC 18558, web 3112. Creator enables capability without enrolling existing members; holder saves target with unchanged token balance; third wallet purchases exactly two periods from holder funds; manual prepayment covers the prior target; holder updates target; at expiration no refill is offered and onchain simulation rejects it.
- `browser-cancellation/report.json`: approved operator cancels a transferred membership while paused on this same deployed candidate. Owner receives the exact 70% split, creator proceeds reconcile, and the NFT retires. This supplements the earlier US1 evidence.
- Both browser directories retain report, trace, screenshots and causal transaction/receipt branches before snapshot restoration. The refill quote passed axe and viewport overflow checks at 390×844. Full US3 keyboard/state coverage is still pending.

This is local incremental proof, not a release, full audit, final production-size/gas verdict or final funded review handoff. The original review fork was preserved. The earlier isolated cancellation lifecycle was stopped only after matching its recorded identity and source directory; its evidence remains retained.

## Temporary-log recovery note

The host crash and subsequent temporary-directory cleanup removed the `/tmp` logs referenced above. Those entries record interim results observed before cleanup; they are not retained current-candidate proof. Retained browser artifacts survived. See [local-verification.md](local-verification.md) for the fresh verification records saved under repository artifacts.
