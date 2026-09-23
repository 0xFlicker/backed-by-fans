# Cancellation acceptance (US1)

Date: 2026-09-23. This closes the cancellation increment only; refill, integrated controls and final candidate verification remain pending.

## Results

- Foundation, ledger conservation, adapter, authority, retirement and broader iteration: 624 contract cases passed (32 fuzz runs; 8 invariant runs/depth 32), excluding fork tests. Subsequent focused changes passed 58 current-source cancellation/adapter/metadata/ownership cases, including native and adapter zero-expiration events (red tests reproduced the omission before the fix). Logs are enumerated in `cancellation-progress.md`.
- Independent exact/scaled model: 10 examples pass, including once-per-cancellation retention rounding. Eight 100-action histories passed sparse/dense/irregular accounting comparisons with 0/30/100% retention. This is bounded iteration evidence; final campaigns remain required.
- Web full iteration: 822 unit tests pass. Focused component, read, creation and lifecycle suites pass after follow-ups. Current isolated route typecheck and lint pass; generated ABI check passed without manual fallback.
- Browser command: `bun run test:e2e tests/e2e/member-cancellation.spec.ts tests/e2e/claims-refunds.spec.ts tests/e2e/creator-operations.spec.ts tests/e2e/vesting-recovery.spec.ts tests/e2e/membership-transfer.spec.ts --project=desktop --workers=1` with the isolated lifecycle's browser environment. Initial failures were fixed and the affected cases rerun selectively.
- `browser-regression2/report.json`: eight cases pass, including member exits, unpause concurrency, prior claims, mixed free/funded lots, creator administration transfer, improving retention, third-party token approval and transferred-member cancellation with 260 expiration boundaries. The ninth completed cancellation but failed confirmation layout.
- `browser-confirmation/report.json`: both the operator/phone path and the 101-boundary cancellation-recovery path pass after the layout fix. Retained screenshots/traces are under `browser-confirmation/test-results/`; the 390×844 confirmation was visually inspected and the recipient address wraps completely. Axe and overflow assertions pass.
- Real receipts reconcile owner balances, retained creator earnings, retired shares, preserved claims, generation and lifetime gross. The failed-delivery browser retry is explicitly a simulation-transport fault; actual payout rejection/rollback is covered by adversarial contract tests.

## Proof boundary

The isolated real deployment is `artifacts/protocol-fork/feature006-cancel-20260923c/`, RPC 18558 / web 3112, created through lifecycle.py from `/tmp/bbf-feature006-candidate`. Its bootstrap/link/origin records identify the tested runtime. The subsequent zero-expiration event correction is verified in the current-source contract suites; it has the same ABI and settlement behavior, but this intermediate browser deployment predates that event correction. The final combined candidate must be redeployed and tested under T054–T057. No public deployment, commit or push occurred. Existing review fork state on 18557 remains preserved.

## Current source hashes

- `contracts/src/MembershipTier.sol`: `6e4b524a9db1cb3013d86adc13c3e4cbf58d79ac12fb4ad03c76f22c38153e1a`
- `contracts/src/libraries/VestingLedger.sol`: `207e1c496d9ec22830153ff929c8e89f65fbcae3b5f443071cfe5c7825af544e`
- `contracts/src/interfaces/IMembershipTier.sol`: `7fbb9640eb36e1cd5578dc88af4d0020e74a7a817ecf0b61bef6776cf70376bd`
- `contracts/src/types/MembershipTypes.sol`: `80ab824da2cf8e9e146545931781fb5a99e41a702a20c80f183d3d0ffd97dcfa`
- `web/src/features/membership/MemberCancellation.tsx`: `e4a4a78305af4d0a31a1b9531d0706c1fe55d7a19c121601f14fd8f5798efb23`
- `web/src/features/membership/MembershipExperience.tsx`: `df50efba53375ca228933e0e080ec27a14f39429910051270713ad31dfb66a8c`
- `web/src/contracts.ts`: `5cabbc3d0c9b03b985b7a4cf2bd5fd7a37d18b568010850c151889eb348e60f6`

## Temporary-log recovery note

The host crash and subsequent temporary-directory cleanup removed the `/tmp` logs referenced above. Those entries record interim results observed before cleanup; they are not retained current-candidate proof. Retained browser artifacts survived. See [local-verification.md](local-verification.md) for the fresh verification records saved under repository artifacts.
