# Baseline — T002

Source commit: `1503fa1d4272f2da133d4e09be3f242b846fc9a0`. Checkout had only the feature documents produced in this session; no unrelated source edits. Work continues in place.

- Foundry 1.7.1; Solidity 0.8.36/Cancun; Bun 1.3.14; web versions match plan and package.json. Read web/AGENTS.md and installed Next server/client component guide.
- `bash contracts/scripts/build-linked-protocol.sh`: passed leaf and linked build. Script lacks executable mode, so invoke via bash. Foundry reports an unavailable signature-cache write outside the workspace; compilation succeeds.
- `FOUNDRY_PROFILE=robinhood forge test --libraries <derived mapping> --match-path 'test/{VestingLedger,VestingScheduler,MembershipIdentity}.t.sol' -vv`: 14 ledger/scheduler tests passed; identity test deployment hit CreateContractSizeLimit.
- Identity rerun with existing verification harness allowances `--code-size-limit 1000000 --gas-limit 1000000000`: 6/6 passed. These allowances are for the test fixture and do not demonstrate production deployability.
- `bun run test -- src/features/membership/state.test.ts src/features/membership/membership-read.test.ts`: 17/17 passed.
- `baseline-call-sites.txt` inventories 58 source/test/script consumers of obsolete identity, synchronization, payment and claim paths. Migrate them with their owning implementation phases.
- Existing root/contracts/web ignores cover compiler output, node_modules, build/cache, browser results and private environment files. ESLint uses flat-config global ignores; Prettier ignores generated/runtime output. No applicable Docker/Terraform/publishing ignore addition is needed.
- Local forge/cast/Bun and Slither binaries exist. Browser harness requires the private archive origin and configured pin through scripts/protocol-fork/lifecycle.py; connectivity and authenticated/fork browser prerequisites remain unverified, and no private values were read.

Scope: baseline source/build/local tests only. No browser, wallet, chain write, deployment or production proof.
