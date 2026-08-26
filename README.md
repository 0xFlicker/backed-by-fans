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

## Local checks

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

## License

Original Backed By Fans source is available under the [MIT License](LICENSE).
Third-party dependencies retain their own licenses as documented in
[`contracts/DEPENDENCIES.md`](contracts/DEPENDENCIES.md).
