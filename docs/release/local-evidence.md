# Local release evidence

Status: **development evidence only**.

The deterministic Foundry test
`contracts/test/e2e/LocalLifecycleEvidence.t.sol` executes one complete local
creator-to-supporter lifecycle against a freshly deployed mock USDG, renderer,
factory, deployer, and tier. It covers registry reads, join/referral, gift,
renewal, expiry and permissionless synchronization, grant/revoke, refund,
reward/referral/creator/protocol exits, two-step tier/factory ownership, fixed
destinations, and exact custody/supply conservation.

Run it from `contracts/`:

```sh
forge test --match-path test/e2e/LocalLifecycleEvidence.t.sol -vvv
```

The repository-wide `scripts/verify-local.sh` includes this test through the full
Foundry suite. The invariant gate also runs an independent lifecycle oracle and
an eager differential payment model for randomized purchases, gifts, exits,
refunds, and failed fixed-destination exits.

The same repository-wide command starts a disposable Anvil chain and a
production Next.js server, injects only that process's disposable Anvil
deployment addresses, and runs
the configured tests in `web/tests/e2e/anvil-membership.spec.ts`,
`create-tier.spec.ts`, `creator-operations.spec.ts`,
`join-renew-gift.spec.ts`, `claims-refunds.spec.ts`, and
`rpc-recovery.spec.ts`. The browser gate verifies:

- direct factory-registered reads and explicit RPC-unavailable state at all
  supported viewports;
- creator deployment, mutable administration, pause behavior, grant/revoke,
  withdrawal, exact refund preview/execution, and two-step ownership;
- supporter join, active renewal, gift, reward, and referral flows using exact
  approvals and confirmed onchain reconciliation;
- a blocked fixed destination retaining its exact onchain claim with no
  redirect control and safe retry guidance; and
- successful writes advancing only from the receipt returned by wagmi/viem to
  exact receipt-event checks and refreshed canonical contract state.

The flow also runs axe on configured supporter states. Run the browser evidence
alone from the repository root:

```sh
./scripts/test-web-anvil.sh
```

The harness deploys a test-only mock token normally on Anvil. The mock can
reject a selected recipient solely to prove the fixed-destination failure
experience. The harness redirects Foundry's local broadcast output to a
temporary directory and fails if the run changes public broadcast records or
Wagmi-generated addresses. It never asserts that the mock is canonical USDG
and never authorizes a public deployment.

Local deterministic evidence is not a public testnet pilot, audit, independent
accounting review, production rehearsal, or mainnet authorization.
