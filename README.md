# Backed By Fans

Backed By Fans is a creator-owned membership protocol for Robinhood Chain. The
protocol uses USDG for membership payments and keeps correctness-critical reads
and transactions directly onchain.

The product name and visual direction are provisional until the documented
launch-readiness gates, including professional name clearance, are complete.
The current working system is recorded in the
[brand direction](docs/brand/backed-by-fans-brand-direction.md), and its open
[launch-readiness checklist](docs/brand/backed-by-fans-launch-readiness.md)
must not be interpreted as clearance.

## Projects

- `web/` — Next.js App Router application managed with Bun.
- `contracts/` — immutable protocol contracts, tests, and deployment tooling.

See [CLEAN_ROOM.md](CLEAN_ROOM.md) before contributing contract code.

Protocol integrators should start with the [integration guide](docs/protocol/integration.md)
and [accounting reference](docs/protocol/accounting.md). Deployment does not
become authorized because local checks pass: the current
[mainnet go/no-go](docs/runbooks/mainnet-readiness.md) is explicitly blocked.

## Local checks

The repository-level verification command runs the documentation/manifest,
clean-room, complete contract, static-analysis, web, and browser gates with no
network secrets:

```sh
./scripts/verify-local.sh
```

It requires the pinned local Foundry, Slither 0.11.6, Bun, and Playwright browser
dependencies. Its output is local development evidence, not a public pilot,
audit, independent review, deployment, or brand clearance.

Individual project checks are also available:

```sh
cd web
bun install --frozen-lockfile
bun run format
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run build
```

```sh
cd contracts
forge fmt --check
forge build
forge test
```

Operator procedures are indexed by the
[deployment](docs/runbooks/deployment.md),
[independent verification](docs/runbooks/verification.md),
[monitoring](docs/runbooks/monitoring.md),
[incident response](docs/runbooks/incident-response.md),
[ownership](docs/runbooks/ownership.md), and
[Safe](docs/runbooks/safe.md) runbooks.

## License

Original Backed By Fans source is available under the [MIT License](LICENSE).
Third-party dependencies retain their own licenses as documented in
[`contracts/DEPENDENCIES.md`](contracts/DEPENDENCIES.md).
