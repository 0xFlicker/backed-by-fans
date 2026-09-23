# Integrated controls progress

T040–T047 implemented. T048–T051 browser/accessibility/reporting acceptance is still in progress.

- `/tmp/bbf-feature006-controls-contracts.log`: 73 linked cancellation, adapter, refill, lifecycle and independent-model invariant tests pass. Iteration settings remain fuzz 32, invariant 8 runs/depth 32.
- `/tmp/bbf-feature006-controls-green4.log`: 65 focused control/read/transfer tests pass, including explicit approval choices, zero-then-set sequences, partial failure, 55/40/20 coverage, paused controls, no-work, stale cached reads and expiration/ownership invalidation.
- `/tmp/bbf-feature006-controls-candidate-typecheck.log`: isolated candidate TypeScript passes.
- Browser controls run currently proves the initial execution journey and shared-coverage/competing-no-work journey, including real finite/unlimited/reset/revoke/restore approvals while paused and explicit stop/restart. Full report is pending the final scenario.
- Refill no-work reconciliation verifies the transaction from the supplied successful receipt has the expected sender, tier and calldata before accepting absence of a refill event. No polling, nonce inference, receipt recovery or parallel wallet lifecycle was added.
- Membership position reads now include enrollment at the same block, and confirmed transfers refresh those reads. Cached refill quotes survive temporary read failures, visibly marked stale with mutations disabled.
- No Solidity behavior changes were required after the lifecycle tests; no additional ABI regeneration was necessary for this phase.

## Temporary-log recovery note

The host crash and subsequent temporary-directory cleanup removed the `/tmp` logs referenced above. Those entries record interim results observed before cleanup; they are not retained current-candidate proof. Retained browser artifacts survived. See [local-verification.md](local-verification.md) for the fresh verification records saved under repository artifacts.
