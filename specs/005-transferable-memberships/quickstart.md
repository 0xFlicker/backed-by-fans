# Validation Guide: Transferable Membership Lifecycle

This is the implementation acceptance guide. Commands and scenarios must run against the completed feature; this planning run does not claim they passed. Planned new test files must exist and exercise these cases before a filtered run counts as evidence.

## Prerequisites

Use the pinned Bun/Foundry toolchain, Solidity 0.8.36/Cancun, installed dependencies and linked-ledger build. Use disposable local fixtures. Record `forge --version`, `bun --version` and the exact commit under test. Do not include private keys or RPC values in evidence. See [tier-api.md](contracts/tier-api.md) for signatures/bounds and [data-model.md](data-model.md) for invariants.

## Focused contracts

```bash
cd /Users/user/Development/backed-by-fans/contracts
linked_manifest="$(bash scripts/build-linked-protocol.sh)"
linked_mapping="$(jq -er '.mapping' "$linked_manifest")"
FOUNDRY_PROFILE=robinhood forge test --libraries "$linked_mapping" --match-path test/TransferableMemberships.t.sol -vvv
FOUNDRY_PROFILE=robinhood forge test --libraries "$linked_mapping" --match-path test/MembershipRetirement.t.sol -vvv
FOUNDRY_PROFILE=robinhood forge test --libraries "$linked_mapping" --match-path test/ClaimEverything.t.sol -vvv
FOUNDRY_PROFILE=robinhood forge test --libraries "$linked_mapping" --match-path test/VestingHistoryReplay.t.sol -vvv
```

`TransferableMemberships.t.sol` and `MembershipRetirement.t.sol` are planned new suites. Existing identity, capacity, grants, refund, scheduler, rewards, claims, model and invariants must also be updated. Zero matched tests is failed validation. If test contract size needs a harness override, record it separately; do not infer deployability from that run.

## Required scenarios

| Scenario | Setup/action | Expected evidence |
|---|---|---|
| Entire position transfer | A owns two IDs with different time, shares and referrals; with more than 25 due funding/expiry steps, transfer one still-live ID to B who already owns a position; repeat owner/approved/operator and both safe variants while paused | One ownership change; stored token economic fields, both schedules, accounting cursor and unrelated positions unchanged; zero checkpoints processed; no maintenance prerequisite; A loses owner rights and B gains them; subsequent catch-up and retirement preserve all earned credit for B |
| Refund authority after transfer | Original payer, former holder, current holder and NFT-approved operator attempt a refund without tier creator authority; creator then refunds | Unauthorized attempts fail; creator succeeds; current NFT owner receives payment, with no payout to former holder or original payer |
| Approvals and receivers | Owner/approved/operator transfer; self-transfer; accepting/rejecting/reentrant receiver | Standard approval reset and enumeration; no nested guard failure for valid transfer; callback cannot expose partial state or steal credit |
| Transfer-only approval | Token-approved address and owner-wide operator attempt owner-only renewal and reward claims, including payout to owner | Both fail without ownership; normal approved transfers work; independent sponsorship remains available without NFT approval |
| Exact expiry | Transfer/renew at T−1, T, T+1 before cleanup | Success only while live; expired/burned ID cannot revive |
| Chronological tails | Funding ends/starts and many expirations at T; punctual and delayed processing | All funding through T credited before retirement; exact scaled equality across batches 1–25 and every phase split |
| Fractions | Several positions retire to one owner, including a transferred position | Fractions combine before rounding; claim raw units and retain remainder; no double liability; zero-NFT claim works |
| Last eligible member | Retire only weighted position with free positions remaining | Total shares zero; prior credit preserved; later funding follows existing unassigned rules |
| Fresh return | Create A/B for one wallet; renew A; expire A; create C | B unchanged; A burned/zero; C new ID and referral state; gross never rewinds |
| Every time path | Purchase/gift/contribution including zero; create/add/revoke grant; refund/cancel | Schedule matches absolute expiry after every mutation; zero remaining time retires exactly once; partial revocation preserves surviving position |
| Paused maintenance and transfer | Pause with overdue funding/expiry and occupied cap; transfer a still-live position by owner and approved caller before maintenance, with more than 25 due steps | Transfer succeeds without processing checkpoints; separately, any wallet saves bounded maintenance progress and releases capacity; live transfers/claims/approvals usable; new time blocked; expired transfers still fail |
| Backlog | At least 10,000 scheduled positions, staggered and identical expiries | At most 25 events/call, committed progress, no history scan, eventual completion without new events; record gas |
| Pages | At least 101 same-tier positions and 9 tiers; block-pinned pages | Every ID reachable; explicit continuation; no cache collisions; refresh after transfer/burn does not skip IDs |
| Claims | Maximum batch; ownership changes after selection; duplicates; beneficiary-only tier | Clear atomic stale/invalid selection errors; no double payout; 32 total IDs and 25 total steps enforced |
| Preview | Same state/timestamp, budgets 0/1/25/256 as applicable | Projection matches writes, including same-time partial phases and historical eligibility; shared tier balances counted once |

Conservation checks use exact integer/scaled arithmetic and the independent model, not tolerances or assertions copied from implementation. Include mixed paid/grant time, original referral streams after transfer, refund reserve safety and lifetime-gross boundaries. Compare a final allowed step that completes work against one leaving work at the same timestamp.

## Bindings and web

After implementing the Solidity interface:

```bash
cd /Users/user/Development/backed-by-fans/web
bun install --frozen-lockfile
bun run generate
bun run generate:check
bun run lint
bun run test
bun run build
bun run typecheck
bun run whitepaper:build
```

Visually inspect the rendered PDF and changed timeline/weight illustrations for layout and consistency with transfer, fresh return identity, permanent retirement and fractional owner rewards. Contract changes must reach generated bindings before consumer tests are meaningful.

Complete regression uses the existing harness:

```bash
cd /Users/user/Development/backed-by-fans
bash scripts/verify-local.sh
```

This harness also needs Slither 0.11.6 and existing protocol-fork origin/pin/evidence inputs. `scripts/test-web-anvil.sh` delegates to `scripts/protocol-fork/bootstrap.sh`; inspect its documented configuration first. Missing prerequisites mean that evidence class is unrun. This planning task does not provision the environment or authorize public broadcast.

The harness expands test gas/code-size limits. Separately perform intended-profile size checks and local deployment rehearsal under the configured 98,304-byte runtime and 100,000,000-gas limits, without permissive overrides. Record compiled library/tier sizes and worst-case maintenance/claim gas. A broad test pass is not proof of deployability.

## Browser acceptance

The repository already configures the upstream under `ROBINHOOD_MAINNET_RPC_URL` in `contracts/.env`. Map that value privately into the harness's process variable `BBF_FORK_RPC_URL`; an unset harness alias alone is not evidence of a missing endpoint. The standing local review convention is `BBF_FORK_EXECUTION_RPC_URL=http://127.0.0.1:18557` (execution chain 31337) and `BBF_FORK_WEB_URL=http://127.0.0.1:3110`. Supply a fresh absolute `BBF_FORK_EVIDENCE_DIR` and unique run ID; `bash scripts/protocol-fork/bootstrap.sh serve --run-id <id>` keeps both services running. Test processes load the generated `browser-environment.json` and set `PLAYWRIGHT_BASE_URL` to that running app. Retain and stop only the harness-owned run when a fresh fixture is needed.

Use existing configured Anvil/Playwright fixtures. Update `join-renew-gift.spec.ts`, `supporter-account.spec.ts`, `claims-refunds.spec.ts`, `creator-operations.spec.ts` and `accounting-preview.spec.ts`, plus transfer/retirement coverage.

1. Create two same-tier positions; renew one from its ID selector.
2. With a backlog exceeding 25 due steps and an incomplete reward projection, transfer it to a wallet already owning another position without a maintenance prompt or prerequisite; verify both account lists, access, unchanged stored accounting and honest incomplete reward display. Catch up separately and verify the recipient owns all position rewards.
3. Advance local time through expiry, process small permissionless batches, and verify progress and burn.
4. Claim ended-membership rewards without owning NFTs; create a new position and verify new ID/no restored weight.
5. Sponsor/grant/refund a selected ID; change ownership after preview and verify refresh behavior.
6. Repeat relevant actions while paused; verify live transfers, maintenance and claims remain available, while expired transfers fail.
7. Exercise multiple pages/batches on desktop and at 320 CSS pixels, including loading, empty, stale, error and incomplete states from the application-contract state table; verify retry, stale-selection refresh, scoped partial totals and availability of actions independent of missing data. Review the application contract accessibility criteria for keyboard operation, focus, accessible names/states and status/error announcements; replay them with available tools.

Record successful library-supplied receipts and canonical rereads through the existing harness. Unit tests establish query/selection integration; browser replay establishes actual local product flows. Neither is public deployment or physical-wallet proof. For accessibility specifically, implement every application-contract criterion but allow verification through available static analysis and source review when automated/interactive tools are unavailable. Record the tooling blocker, per-criterion source evidence and untested runtime behavior; do not report keyboard, screen-reader or rendered-layout checks as passed without exercising them. An unavailable accessibility test alone is not an acceptance blocker; discovered defects still require fixes. This does not replace other required contract or product-flow evidence.

## Completion record

Record commit, tool versions, command outcomes, matched test counts, independent model comparisons, maximum batch gas, bytecode sizes, generated-binding checks, browser evidence and PDF visual inspection. Keep source, local contract, browser and intended-profile deployment evidence separate. Requirements checklist, task generation and cross-artifact analysis precede implementation; convergence follows implementation.
