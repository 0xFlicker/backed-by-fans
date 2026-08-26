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
Foundry suite. A local deterministic test is not a public testnet pilot, audit,
independent accounting review, production rehearsal, or mainnet authorization.
