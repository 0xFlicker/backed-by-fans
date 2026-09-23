# Consumer inventory

Exact search targets at the clean implementation baseline. Generated `web/src/contracts.ts` and `web/src/contracts/types.ts` must be regenerated, never manually edited. Vendored dependencies and archived evidence are excluded.

## Config constructors and encoders

- `contracts/scripts/rehearse-clone-deployment.ts`
- `web/scripts/seed-protocol-review.ts`
- `web/tests/e2e/helpers/protocol-fork.ts`
- `web/tests/e2e/helpers/membership-positions.ts`
- `web/scripts/seed-buyback-demo.ts`
- `contracts/test/fizz/handlers/MembershipFactoryHandler.sol`
- `web/src/lib/direct-read.ts`
- `web/scripts/protocol-fork-fixture.ts`
- `contracts/test/fizz/Base.sol`
- `contracts/test/invariants/AccountingInvariant.t.sol`
- `contracts/test/TransferableMemberships.t.sol`
- `contracts/test/invariants/MembershipInvariant.t.sol`
- `web/src/features/membership/membership-read.test.ts`
- `contracts/test/VestingHistoryReplay.t.sol`
- `web/src/features/membership/MembershipExperience.test.tsx`
- `contracts/test/ProtocolBurnRouter.t.sol`
- `contracts/test/PaymentsAndTime.t.sol`
- `contracts/test/DeferredProtocolToken.t.sol`
- `web/src/features/creator/config.test.ts`
- `contracts/test/vesting/PublicVesting.t.sol`
- `web/src/features/creator/config.ts`
- `contracts/test/ERC5643Adapters.t.sol`
- `contracts/test/VestingCapacity.t.sol`
- `contracts/test/VestedAllocations.t.sol`
- `contracts/test/RefundsAndOwnership.t.sol`
- `contracts/test/MembershipLifecycleGas.t.sol`
- `contracts/test/MembershipRetirement.t.sol`
- `contracts/test/helpers/MembershipTestConfig.sol`
- `web/src/features/protocol/registry-reconciliation.test.ts`

## Cancellation APIs and events

- `scripts/protocol-fork/verify-evidence.ts`
- `contracts/test/fizz/handlers/SpecificPropertiesHandler.sol`
- `contracts/test/fizz/handlers/MembershipTierHandler.sol`
- `contracts/src/interfaces/IMembershipTier.sol`
- `web/scripts/protocol-evidence.test.ts`
- `web/tests/e2e/claims-refunds.spec.ts`
- `contracts/src/libraries/VestingLedger.sol`
- `web/tests/e2e/create-tier.spec.ts`
- `contracts/src/types/MembershipTypes.sol`
- `web/tests/e2e/payment-token-selection.spec.ts`
- `web/tests/e2e/creator-operations.spec.ts`
- `web/tests/e2e/protocol-asset-burns.spec.ts`
- `contracts/test/RefundsAndOwnership.t.sol`
- `contracts/src/MembershipTier.sol`
- `web/tests/e2e/protocol-activity.spec.ts`
- `contracts/test/Rewards.t.sol`
- `contracts/test/RewardCurveCalibration.t.sol`
- `contracts/test/ClaimEverything.t.sol`
- `contracts/test/DeferredProtocolToken.t.sol`
- `contracts/test/MembershipAccountingPreview.t.sol`
- `contracts/test/VestingCapacity.t.sol`
- `contracts/test/FactoryAndFees.t.sol`
- `contracts/test/VestingLedger.t.sol`
- `contracts/test/invariants/AccountingInvariant.t.sol`
- `contracts/test/fork/ProtocolBuybacks.t.sol`
- `contracts/test/VestingHistoryReplay.t.sol`
- `contracts/test/invariants/MembershipInvariant.t.sol`
- `contracts/test/e2e/LocalLifecycleEvidence.t.sol`
- `contracts/test/vesting/PublicVesting.t.sol`
- `contracts/test/ClaimsAndWithdrawals.t.sol`
- `contracts/test/VestedAllocations.t.sol`
- `web/src/features/membership/membership-read.test.ts`
- `web/src/features/membership/MembershipExperience.test.tsx`
- `web/src/features/creator/management.test.ts`
- `web/src/features/creator/TierManagement.tsx`
- `web/src/features/creator/management-read.ts`
- `web/src/features/protocol/payout-reconciliation.test.ts`
- `web/src/features/protocol/payout-reconciliation.ts`

## Totals and receipt consumers

- `web/scripts/protocol-safe-transactions.ts`
- `contracts/src/interfaces/IMembershipTier.sol`
- `contracts/test/fizz/handlers/SpecificPropertiesHandler.sol`
- `contracts/src/libraries/VestingLedger.sol`
- `scripts/calibrate-membership-lifecycle.py`
- `contracts/test/VestingLedger.t.sol`
- `web/tests/e2e/protocol-activity.spec.ts`
- `contracts/test/fizz/Snapshots.sol`
- `contracts/test/e2e/LocalLifecycleEvidence.t.sol`
- `contracts/test/VestingScheduler.t.sol`
- `contracts/test/VestedAllocations.t.sol`
- `contracts/test/models/MembershipModel.sol`
- `contracts/test/models/run_vesting_histories.py`
- `contracts/src/types/MembershipTypes.sol`
- `contracts/test/fizz/Properties.sol`
- `web/src/lib/direct-read.test.ts`
- `contracts/test/models/vesting_reference.py`
- `contracts/test/VestingCapacity.t.sol`
- `contracts/test/mocks/VestingLedgerHarness.sol`
- `contracts/test/invariants/AccountingInvariant.t.sol`
- `contracts/test/invariants/MembershipInvariant.t.sol`
- `contracts/test/VestingDistribution.t.sol`
- `contracts/test/VestingHistoryReplay.t.sol`
- `web/src/features/membership/VestingSummary.test.tsx`
- `contracts/test/vesting/PublicVesting.t.sol`
- `contracts/test/fork/ProtocolBuybacks.t.sol`
- `contracts/test/MembershipAccountingPreview.t.sol`
- `web/src/features/membership/membership-read.test.ts`
- `web/src/features/membership/MembershipExperience.test.tsx`
- `web/src/features/protocol/buyback-reconciliation.ts`
- `web/src/features/creator/TierManagement.tsx`
- `web/src/features/creator/management.test.ts`
- `web/src/features/protocol/payment-flow.test.ts`
- `web/src/features/protocol/PaymentFlow.tsx`
- `web/src/features/protocol/fee-forecast.ts`
- `web/src/features/protocol/fee-forecast.test.ts`
- `web/src/features/protocol/payment-flow.ts`

## Supported documentation consumers confirmed during implementation

- `README.md`
- `docs/whitepaper/whitepaper.md` and `docs/whitepaper/outline.md`
- `docs/protocol/accounting.md` and `docs/protocol/integration.md`
- `docs/runbooks/ownership.md` and `docs/runbooks/mainnet-readiness.md`
- `docs/pilots/testnet-pilot.md`

These contained creator-only cancellation, top-up or obsolete same-ID revival instructions. Reconcile current guidance; preserve historical specifications and unrelated Safe gas-refund mechanisms.

## Integrated reconciliation (T050)

All current configuration constructors use the retention/periodic fields through the generated ABI or shared Solidity configuration helper. Contribution/free tiers reject periodic enablement. Ordinary refill calls the existing paid-purchase path, so gross received, allocation schedules, reward issuance and protocol reporting use the same consumers as manual payments.

`payment-flow.ts` reports actual owner refunds separately from cumulative creator cancellation proceeds, which remain a subset of ordinary earned creator credit. `payout-reconciliation.ts` checks the current-owner destination and the complete cancellation split from the successful receipt. Existing grant revocation calldata and emitted time/enrollment changes preserve transaction-history detail without new stop-reason storage.

The review caught and corrected two stale Fizz properties: funded value removed on cancellation must include both the owner's refund and creator retention, and finite paid time is strictly below `(N + 1) * periodDuration`. The Fizz fixture now exercises 30% retention; focused Foundry regressions cover retention and fractional overhang. `contracts/PROPERTIES.md` was reconciled with member authority and the removed refund API. The whitepaper's transfer-only operator description now includes cancellation authority.

Searches of supported source and current protocol guidance found no remaining `previewRefund` or old `refund` action consumers. Historical plans and unrelated buyback refunds remain outside this replacement. Detailed periodic documentation and the publication artifact are tracked separately under T052.

Full web suite: 120 files / 860 tests pass (`/tmp/bbf-feature006-controls-all-web3.log`). Earlier runs interrupted by ENOSPC are retained as failed attempts, not passing evidence.

## Temporary-log recovery note

The host crash and subsequent temporary-directory cleanup removed the `/tmp` logs referenced above. Those entries record interim results observed before cleanup; they are not retained current-candidate proof. Retained browser artifacts survived. See [local-verification.md](local-verification.md) for the fresh verification records saved under repository artifacts.
