# Implementation baseline

Recorded 2026-09-23 before source edits.

- Branch: `codex/006-member-cancellation-refill`
- Commit: `c22fb4f911abee67d4eb090209ad348aff11622b`
- Initial checkout: clean.
- Forge: 1.7.1 (4072e48705af9d93e3c0f6e29e93b5e9a40caed8).
- Bun: 1.3.14; Node: v26.2.0; Python: 3.14.7.
- Solidity: pinned 0.8.36, Cancun, optimizer 200 runs. Robinhood limit: 98,304 bytes, 100,000,000 gas.
- Existing listeners: Anvil PID 91297 on 127.0.0.1:18557; Node PID 93077 on 127.0.0.1:3110.
- Lifecycle: `artifacts/protocol-fork/feature006-operator-20260921f/lifecycle.json`, serve/running, chain 31337. No service restarted or configuration changed.
- Existing ignore files cover compiler outputs, node_modules, Next output, evidence, local environment and Python caches; ESLint and Prettier ignore generated build directories. Web package is private; no publishing ignore required.
- Verification entrypoint: `scripts/verify-local.sh`; linked Forge tests, required Slither 0.11.6, generated bindings, formatting, lint, tests, build, typecheck, Playwright, Anvil and fork CLI tests.

This baseline records configuration and listeners, not candidate test success or verification of the existing deployment.
