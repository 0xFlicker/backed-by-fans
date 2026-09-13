# Local and read-only release checks

Checked 2026-09-13 UTC. No public signing, broadcast, verification submission or website cutover.

- Full linked contract suite: **565 passed, 0 failed, 9 opt-in fork cases skipped**. See `contracts.log`. Eight authentic mainnet-fork cases remain outside this run; prior feature-005 fork evidence is preserved separately.
- Opt-in testnet Safe fork integration: **1 passed, 0 failed, 0 skipped**, run separately after the main suite (`safe-fork.log`). This creates contracts only inside Foundry's temporary simulation.
- Slither 0.11.6: **exit 0 at --fail-high**, 124 contracts, 101 detectors, 121 findings. See `slither.log`; this is not a finding-free audit. Existing lower-severity findings are discussed in `specs/005-transferable-memberships/evidence/review.md`.
- Web unit suite: **112 files, 783 tests passed** (`web-tests.log`).
- TypeScript and ESLint: **passed** against the active checkout.
- Web Prettier and Solidity formatting: **passed** (`format.log`, `solidity-format.log`).
- Generated contract bindings: **passed; no source drift** (`bindings.log`).
- Production Next.js build: **passed** in an isolated source/dependency snapshot, preserving the live development server (`build.log`). Existing dependency warnings concern MetaMask's optional React Native storage import, a dynamic import in ox, and Node localStorage. No dependency/configuration workaround was added to the application. Initial snapshot attempts lacked sibling repository files and used symlinked font dependencies; the successful build used the complete shared-file context and a filesystem clone of installed dependencies.
- Deployment wrapper regressions: **passed**, including removal of obsolete A/B manifest fields, recovery, verification and signing guards (`deployment-wrapper-mocks.log`). All transaction messages in this log are mocks.
- Clean-room, Safe wrapper, payment-token administration and buyback administration regression commands: **passed**. Administration checks ran 42 and 17 focused web tests respectively; their scripts use isolated mocks.
- Live testnet preflight: chain, canonical CREATE2 deployer, six asset runtimes, Safe and deployer funding **passed** (`live-preflight.json`).
- Solidity public-input validation and preliminary address predictions: **passed**, read-only against testnet (`solidity-inputs.json`, `predicted-addresses.json`, `implementation-address.json`).
- Implementation standard JSON verification input: **generated locally**, with compiler settings and SHA-256 recorded in `implementation-verification.json`; not submitted to Blockscout.
- Active web on port 3110: **HTTP 200** after checks. Existing fork on port 18557 was not reset or modified.

Guarded `prepare` and exact-candidate `dry-run` remain pending committed source and the reviewed generated operational manifest. Public explorer verification and two-tier clone recognition remain live release acceptance checks, described in `docs/release/testnet-005.md`.
