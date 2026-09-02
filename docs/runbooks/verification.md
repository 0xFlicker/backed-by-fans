# Deployment verification runbook

Status: **TESTNET DEPLOYMENT RECORDED — independent verification and the live
pilot remain incomplete. No mainnet deployment is asserted or authorized.**

After an authorized public broadcast, an operator other than the deployer
should verify the following before promotion:

1. The checked-in `DeployDirectProtocol.s.sol` `run-latest.json` is for chain
   `46630`, contains the successful media factory, renderer, preview harness,
   and membership factory deployments, and matches the explorer.
2. `bun run generate:check` is clean and `web/src/contracts.ts` contains the
   renderer, preview harness, and factory under chain `46630` without changing
   the other network.
3. The factory exposes the exact six-token ordered list with every token listed
   and enabled, plus the reviewed owner, empty pending owner, fee recipient,
   media dependency, tier deployer, and protocol fee.
4. Blockscout shows exact verified source for the media factory, renderer,
   preview harness, membership factory, and tier deployer.
5. `./scripts/verify-local.sh` passes from a clean checkout.
6. The production web build visibly labels testnet, selects the exact chain in
   chain-qualified tier links, rejects unsupported or undeployed chains, and
   completes the applicable live-wallet lifecycle in
   [testnet-pilot.md](../pilots/testnet-pilot.md).

Use ordinary Foundry, Cast, Blockscout, Wagmi, and Viem behavior for these
checks. Do not add a second transaction-receipt engine, captured-block manifest,
runtime-code-hash browser gate, signed readiness schema, or validation tier.
The deployed contracts and their verified source remain the authority; the
broadcast file is the durable generation input, not a substitute for chain
state.

Mainnet remains a human release decision. The audit, accounting, ownership,
Safe, monitoring, incident response, operational identity, explicit
authorization, and provisional-brand gates in
[mainnet-readiness.md](mainnet-readiness.md) must still pass before launch.
