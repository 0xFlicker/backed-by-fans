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
production Next.js server, configures exact runtime-code commitments, and runs
`web/tests/e2e/anvil-membership.spec.ts`. That browser gate verifies a direct
factory-registered tier at all supported viewports, an actual RPC outage, and
an unlocked local-wallet exact-approval purchase through confirmed onchain
reconciliation. It also runs axe before and after the supporter purchase. Run
the browser evidence alone from the repository root:

```sh
./scripts/test-web-anvil.sh
```

The harness installs a test-only mock token runtime at the official mainnet USDG
address inside the disposable chain and points its test-only EIP-1967
implementation commitment at that same mock runtime solely to exercise the web
authenticity guard. It never asserts that the mock is USDG, never produces a
deployment manifest, and never authorizes a public deployment.

Local deterministic evidence is not a public testnet pilot, audit, independent
accounting review, production rehearsal, or mainnet authorization.
