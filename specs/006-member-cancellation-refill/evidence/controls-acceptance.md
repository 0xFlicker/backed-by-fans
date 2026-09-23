# US3 integrated controls acceptance

T040–T051 completed on 2026-09-23. Final repository verification, publication artifacts, destructive fork and retained review deployment remain separate pending gates.

## Contract proof

The same immutable combined cancellation/refill candidate remains deployed in `artifacts/protocol-fork/feature006-refill-20260923a/`; source and leaf hashes are recorded in `refill-acceptance.md`. `/tmp/bbf-feature006-controls-contracts.log` passes 73 linked cancellation, adapter, refill, lifecycle and invariant tests at the iteration settings recorded in `controls-progress.md`. Twelve dedicated lifecycle cases cover stop/restart, paused configuration, allowance restoration, both transaction orderings, ownership/reentrant receiver boundaries, failed transfer/cancellation rollback, grant revocation and competing positions. Fizz property regressions independently exercise retention and exclusive paid-cap overhang.

## Browser proof on the combined candidate

- `browser-initial`: owner enrollment without charge, permissionless third-wallet collection, target updates/manual prepayment and strict expiration.
- `browser-controls3`: approved operator cancellation while paused; refill first then cancellation settles added funding, preserves owner destination and emits zero expiration.
- `browser-controls4`: cancellation first prevents subsequent collection/revival; shared 55/40/20 coverage and competing no-work; finite/unlimited/reset/revoke/restore approvals; paused configuration and explicit restart; creator grant-revocation disclosure, cleared enrollment and unchanged payer balance; stale target refusal; transfer clears consent and recipient explicitly enrolls again. All three tests pass.
- Keyboard, phone and tablet results are recorded in `accessibility.md`.

Browser replay caught a real refresh bug after owner cancellation: the page refreshed the burned selected NFT. The successful cancellation now clears that selection before refreshing, preserving unrelated selected positions. Both transaction-order journeys pass after the fix. A focused regression also proves that selection invalidation releases an obsolete in-flight refill review and prevents stale completion.

All 860 web tests pass in `/tmp/bbf-feature006-controls-all-web3.log`. The final small render-lifecycle correction passes all 16 refill component tests and full ESLint (`/tmp/bbf-feature006-refill-render-test.log`, `/tmp/bbf-feature006-controls-lint2.log`). Earlier ENOSPC interruptions are retained as failed attempts; they are not counted as acceptance.

No US1/US2 contract behavior changed during US3. Generated ABI remains the combined candidate ABI. This is incremental local acceptance, not the final full-gate, public-deployment or independent-audit verdict.

## Temporary-log recovery note

The host crash and subsequent temporary-directory cleanup removed the `/tmp` logs referenced above. Those entries record interim results observed before cleanup; they are not retained current-candidate proof. Retained browser artifacts survived. See [local-verification.md](local-verification.md) for the fresh verification records saved under repository artifacts.
