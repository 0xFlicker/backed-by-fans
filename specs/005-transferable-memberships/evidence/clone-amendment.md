# Feature 005 — clone and caller-bounds amendment

Validated locally on 2026-09-12. This completes the amended implementation within feature 005; it does not imply user acceptance or a public release. Earlier lifecycle, A/B, deployment and browser evidence remains historical and unchanged.

## Result

One MembershipFactory creates standard 45-byte ERC-1167 clones of one separately deployed MembershipTier implementation. Implementation initialization is locked; each clone initializes atomically once and has independent ownership, token enumeration, fixed economics and accounting. There is no upgrade entry point or changeable clone target. The tier A/B stores and MembershipTierDeployer are removed; the unrelated buyback executor store remains.

Protocol iteration ceilings are removed. Custom membership mutations and factory claims receive accounting budgets; standalone maintenance commits partial progress; previews and pages use caller bounds; explicit sorted unique arrays bound batch operations. Standard ERC-5643 signatures use zero queued-event work and require separate maintenance when necessary. Economic, format and actual native-chain constraints remain.

Claim all captures discovery at one block, refreshes ownership, previews and estimates candidate batches, advances accounting when required, and uses standard wagmi/viem submission and receipt handling. Successful batches survive wallet rejection. New positions do not extend a running claim scope. Ended/transferred positions are explained, with preserved beneficiary credit included. Manual selection remains available. No persistent transaction journal was added.

## Evidence

The retained run is `artifacts/protocol-fork/transferable-clones-20260912-02`; its `validation/` directory contains logs, the browser index and benchmark records. The exact final source inventory is `source-snapshot-amendment.json` beside this report.

| Check | Result and scope |
|---|---|
| Linked contract regression | 552 passed, zero failures/skips. Includes transfer/authority, retirement, refunds, independent model, previews, deployment, large histories and cold-operation gas. Foundry harness uses 1,000,000-byte / 1B-gas test allowances. |
| Stateful/conservation suites | 8 passed; configured invariant runs 256, depth 500. Preserved in `validation/invariants.log`. |
| Authentic origin-fork contracts | 48 passed, zero failures/skips; pinned origin 4663 at block 58083838, isolated Foundry execution 31337. No public writes. |
| Web | 771 tests passed across 109 files; TypeScript, ESLint and Prettier passed. Generated ABI uses the project generator. |
| Browser | 22 distinct applicable desktop scenarios passed across the retained final run and follow-up. One deliberately unconfigured-management case skips on this configured deployment. This is a combined run plus focused repair, not one all-green invocation. |
| Claim all | The browser captured 101 positions in the first tier and nine tiers overall, rejected a stale transferred selection, then claimed the remaining 108 positions across nine tiers in one transaction. Component tests cover gas-sized splits, rejection/resumption, maintenance, ownership changes and retired-only scopes; data tests cover incomplete discovery and snapshot pagination. |
| Accessibility | Keyboard/320px account checks and axe passed, including the large portfolio after unique retired-reward landmark labels were added. Physical assistive-technology and browser-extension wallet acceptance are not inferred. |
| Deployment tooling | Six-component wrapper tests passed, including interruption/recovery, native oversize rejection, wrong implementation binding and changed runtime rejection. Fork CLI guards: 14 passed. Clean-room check passed. |
| Static security | Slither 0.11.6 `--fail-high` passed; 117 reported findings remain in the retained log for review. This is not an independent audit. |
| Build and document | Isolated production build passed without modifying the served `.next`; the existing optional MetaMask React Native dependency warning remains. Whitepaper PDF rebuilt (11 pages), with cover and final body/reference pages visually reviewed. |

The large-budget regression successfully discovers 301 NFTs, previews 257 actual expiration events, then processes 26 and 275 events while paused. A deliberately under-gassed 301-event attempt leaves supply/cursor unchanged before smaller calls succeed. Additional tests exceed 32 positions, eight tiers, 32 router purchases and 32 administrative limit updates. Existing chronology/model tests compare batching and simultaneous-boundary settlement exactly, including fractions.

## Measured gas

The equivalent isolated native-profile creator-tier benchmark uses the same configuration shape as the earlier retained rehearsal: **8,768,426 → 678,194 gas**, a **92.27% reduction**. The new implementation deployment costs 9,555,193 gas once and is shared by future tiers. Benchmark evidence uses a mock payment token and unbound protocol token, explicitly separate from the authentic fork.

Representative operation measurements are gross execution gas before refunds, not user fees or universal worst cases. Current tests cool the shared implementation as well as tier/storage dependencies.

| Operation | Earlier feature-005 baseline | Clone implementation |
|---|---:|---:|
| New membership | 941,208 | 953,566 |
| Renewal | 545,258 | 557,462 |
| Member-only claim | 327,337 | 332,597 |
| Three-tier claim with funding/expiry ends | 2,423,387 | 2,440,629 |
| Eight-tier continuous claim | 3,077,516 | 3,100,355 |
| Advance and direct burn | 985,116 | 993,763 |

Earlier values come from the preserved `gas.md`; current values and intrinsic/refund accounting are in `validation/final-contracts.log`. At 10,000 positions: measured 25-boundary maintenance peak 7,516,270, 32-position claim 2,042,642, 256-event preview 8,125,644 gas. These are benchmark samples, not contract ceilings.

## Running replacement and verification boundary

- Web: http://127.0.0.1:3110/chains/31337/protocol
- RPC: http://127.0.0.1:18557; execution chain 31337.
- Factory: `0x014c6Eb8b33B82B726fA6fe54532fb0824f82D9b`.
- Fixed implementation: `0x38F05a4e915060F1C3beeE5ec262b11CdB6Be016`.
- Fixture clone: `0xd1417d1ecEe7929F4E435C15a0c71C3e1e548a2E`.

`final-protocol-graph.json` verifies current compiler artifacts, linked library, fixed implementation, factory binding and dependencies; `clone-runtime.json` checks the exact standard clone bytes and embedded target. Actual deployment succeeded on an Anvil configured with Robinhood's 98,304-byte runtime / 100M gas limits; the deployment tooling uses 196,608-byte native initcode limits, without the speculative 95,000-byte data ceiling. These checks are separate from permissive unit-test harness settings.

The previous fork's state was saved as `pre-clone-replacement-state.json` in its original run before its verified orphaned processes were stopped. Both old evidence and the intermediate clone rehearsal remain retained. The final owned services stay running.

**Next authorized testnet deployment:** verify the shared implementation with its exact compiler/library settings, verify the factory and dependencies, and check explorer recognition of newly created fixed-target clones. None of those public explorer checks is claimed from this fork. No commit, push, migration or public broadcast occurred.
