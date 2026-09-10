# Validation Guide: Vested Allocations and Reward Curves

This guide separates evidence available during planning from checks to run after implementation. The application still has its current behavior: a passing pre-feature suite does not prove this design. No public deployment or origin-chain write is part of these commands.

## 1. Reproduce Planning Arithmetic Now

Prerequisite: Python 3 with standard library. From the repository root:

```sh
cd /Users/user/Development/backed-by-fans
python3 specs/004-vesting-reward-curves/evidence/accounting-arithmetic.py
python3 specs/004-vesting-reward-curves/evidence/curve-calibration.py > /tmp/vesting-curve-evidence.json
```

Expected: 50,000 refund/index-carry arithmetic cases pass; the JSON reports 10,000 curve histories with 50 purchases each and calibration tables. These scripts test arithmetic and the documented small rational cash examples. They do not exercise the future Solidity scheduler, token transfers, browser flows, deployment limits or the 10,000 complete histories of SC-002. See [calibration.md](calibration.md) for exact scope.

## 2. Contract Checks After Implementation

Prerequisites: repository-pinned Foundry toolchain, Solidity 0.8.36 and vendored dependencies. The implementation must first add the linked library/build support and extend the existing tests; do not report old tests as feature acceptance.

```sh
cd /Users/user/Development/backed-by-fans/contracts
forge fmt --check
forge clean
bash scripts/build-linked-protocol.sh
BBF_VESTING_LINK=$(jq -r '.mapping' out/vesting-leaf/link-manifest.json)
FOUNDRY_PROFILE=robinhood forge test \
  --libraries "$BBF_VESTING_LINK" \
  --code-size-limit 1000000 \
  --gas-limit 1000000000 \
  -vvv
```

These are the repository's broad local harness limits, deliberately larger than release limits. They are not gas or deployment proof. The updated deterministic deployment tests must additionally build the leaf library, preserve its exact artifact, link consumers to its derived address, and reject wrong link/runtime metadata.

Expected feature assertions:

1. **All four allocations:** 120 over 12 periods at80/10/5/5 yields24/3/1.5/1.5 after three periods;90 remains refundable. Claim all earned portions before refund and still fund the full90 without owner allowance. At time zero only access/shares exist; at completion each lot's four allocations sum exactly to120.
2. **Recipient attribution:** Tracked one/day stream gives22.5/7.5 on a halfway equal-weight join and20/10 on a day10–20 suspension. Include all concurrent payment streams separately. Delayed catch-up must not change either answer.
3. **Queues:** Existing paid service precedes renewals; grants do not delay paid service; zero-value periods delay the next positive lot without creating heap work. A future START is wholly unearned. Include refund during the free gap, same-time END/START and ownership/referral changes.
4. **Eligibility:** Natural expiry alone keeps earning. Sync settles then suspends. Free/grant restoration leaves suspended weight off; a minimum-positive payment restores it. Repeated free extension preserves existing eligibility. Final grant-only revocation suspends. Claims never reactivate.
5. **Curves:** None=gross; every preset/extreme; exact adjacent partition equality; horizon crossing; minimum raw input and maximum C; fixed-period conversion; zero/over-cap validation; immutable settings; refunds retain all issued shares and cursor position.
6. **Refunds and failure:** Whole future queues cancel without a per-lot loop; one head's partial refund matches actual gross. Repeated cancel/process/rejoin cannot earn canceled money. Every residual is within the published bound and protected. Test reverting/inexact ERC-20 transfer and reentrancy boundaries with complete rollback.
7. **Claims and reserves:** Preserve fractional credits; zero-value claims return zero without a transfer or payout event. Recipient authorization, current creator owner, original referrer, pause and burned credential cases work. Unassigned and cancellation reserves are never swept or assigned to a later member.
8. **Recovery and router:** Repeated combined advances retain bounded useful progress: accounting-only, release-only, buyback-only and mixed-stage success. A failed release cannot undo its tier's completed accounting; failed trades or burn-measurement reads cannot undo earlier progress. Empty idle cursor refreshes and unchanged repeats revert NothingToDo. Invalid requests fail before work; insufficient outer gas remains a transaction failure. Direct tier processing remains available. Mutation while behind fails atomically. Settled claims/releases remain available. Existing buyback policy holds and no worker compensation is created.

## 3. Independent Histories and Scale Gates

Run the public Solidity replay against the independent interval/cohort model after the linked build:

```sh
cd /Users/user/Development/backed-by-fans
python3 contracts/test/models/run_vesting_histories.py --histories 16 --actions 100
# Final SC-002 acceptance corpus:
python3 contracts/test/models/run_vesting_histories.py --histories 10000 --actions 100
```

The runner retains inputs, batch hashes, Solidity logs and failed seed batches under `contracts/deployments/vesting-histories/`. Every eight seeds include every curve in both pricing modes. Each history runs sparse, dense and irregular processing and claim schedules; its 41-field vector compares payouts plus remaining scaled credit, with actual custody checked before normalization. It fails if any required transition has zero coverage. Do not substitute the planning curve script, default Foundry fuzz counts or random calls with mostly reverts.

Use an independent slow interval/cohort calculation, not a second heap implementation. Include positive/zero payments, queued service, gifts/referral locking, grants/revocation, expiration/sync, refund/reactivation, claims, all curves, pauses, ownership, no eligible pool and exact transfers. Replay the identical economic timeline with dense, irregular and sparse processing/claims. Compare:

- paid raw amounts*Q plus recipient remaining scaled entitlements;
- exact scaled conservation, including each protected reserve, carry and fractional credit;
- ideal rational recipient attribution within `2*L*(2^64−1)/Q + E*10*C/Q`, with separate display-floor bounds;
- exact frequency identity under the delivered scaled policy;
- unchanged curve position/share issuance for economically equivalent partitions.

Create a10,000-member,100,000-payment fixture with a year of inactivity. Include dense identical endpoints, distinct referrers, zero-value gaps and cancellation of a long queue. Use combined advances with a shared total of at most25 accounting boundaries across selected tiers while advancing block time. Record steps, total recovery transactions/gas, accountedThrough, completed endpoint identities and eventually executable purchase/sync/refund/claim. Include releases and purchases in whole-call gas measurements; the processing-only budget does not prove combined-call feasibility. Gas and total recovery throughput are implementation-discovery results, not a pending CHK035 product decision. Compare small and maximum requested checkpoint counts, incomplete and fully caught-up calls, and the shared cross-tier maximum. Reject requests above the supported cap, stop early when fewer checkpoints are due, and report actual processed counts. Validate or reduce the measured 25-step cap coherently across the documents and callers before release if measurements require it. No finalized work may repeat. Target <=15 million gas per25-step batch and <=2 million for a settled claim/release or cancellation excluding catch-up; enforce actual chain transaction limits regardless of those engineering budgets.

A deployment gate must measure cleanly built artifacts and exact encoded payloads: tier base creation<=49,150 bytes, runtime<=98,304, initcode<=196,608 and each raw deployment payload<=95,000. Validate the new library's deterministic address and actual runtime before the factory. Harness gas overrides and cached artifacts do not pass this gate.

### Split deployment rehearsal

The public wrapper submits seven canonical CREATE2 transactions: ledger, media store factory, renderer, preview harness, tier code A, tier code B, then factory. Build the independent ledger first, link the tier to its derived address, and derive the two stores from that exact linked bytecode. The factory constructor receives both store addresses, the full creation-code length and its hash. The expected hash is a reviewed compiler/build input pinned in the deployment journal; the factory does not carry a second embedded copy of tier bytecode. The tier deployer validates the complete bytes and pins the store runtime hashes immutably. Factory children bind to `address(this)` during construction; the tier receives that address as a constructor argument only at creator publication. No circular address prediction, setter or migration is needed.

The vault's executor bytecode store remains a factory child. Verification covers it along with the vault, router, tier deployer, optional executor and the seven standalone contracts. Raw bytecode stores must match every byte, including STOP prefixes and metadata. Library verification also checks the derived address, self-address patch and actual consumer link. Journals use schema 7 and retain each exact constructor argument and payload length; old schemas are rejected.

After the linked build above, run the shell wrapper tests and, in a separate terminal, start a fresh disposable Anvil node:

```sh
cd /Users/user/Development/backed-by-fans/contracts
bash scripts/test-deploy-protocol.sh
anvil --host 127.0.0.1 --port 19847 --chain-id 31337 \
  --code-size-limit 98304 --gas-limit 100000000 --silent
```

Then, from `contracts/`, run:

```sh
bun scripts/rehearse-split-deployment.ts http://127.0.0.1:19847
```

This loopback-only rehearsal mines the seven exact payloads, verifies the complete deployed graph and creates a tier in one transaction with the unchanged 7.5M gas limit. It retains transactions, receipts and runtime/source proofs under `contracts/deployments/split-rehearsal/`. It uses a mock payment token, local owner and unbound protocol token; it does not replace the authentic fork or public-chain checks. Stop Anvil afterward and restart it for another rehearsal; a reset is not a substitute for the fresh canonical CREATE2 deployment state.

## 4. Frontend Checks After Implementation

Prerequisites: Bun1.3.14, installed repository dependencies and Playwright browsers. Read the local Next.js documentation required by `web/AGENTS.md` before editing UI code.

```sh
cd /Users/user/Development/backed-by-fans/web
bun install --frozen-lockfile
bun run generate
bun run generate:check
bun run format
bun run lint
bun run test
bun run build
bun run typecheck
bun run test:e2e
```

Run `generate` after new Foundry artifacts exist. It is the sole ABI/address/hook path; retain real public broadcast metadata separately from disposable local output. Expected checks reject stale publication tuples, linear-only share previews, pre-submit quote-based success predicates, claim-zero predicates and obsolete token-ID fee scans.

Observed journeys must match [contracts/frontend.md](contracts/frontend.md): publish each preset/custom with immutable readback; fixed and PWYW pay; show quote movement at inclusion; free versus positive restoration; delayed bounded progress; all beneficiary claims during accrual; creator transfer; partial refund after earlier claims; and earned-only buyback release. Extend existing `web/tests/e2e` cases and authentic local-fork journeys. Record receipt-derived paid/issued amounts and refreshed canonical state.

For accessibility acceptance, follow FR-052–054, SC-012 and the frontend contract's Accessibility and Animation Acceptance section. Record keyboard-only and named screen-reader/browser journeys for preset/custom publication, field-error correction, claim and catch-up/retry. Verify the visible summary supplies the curve information without chart traversal; focus and meaningful status updates remain usable without repeated accrual announcements. Observe default animation, reduced motion, high-contrast/forced-colors presentation, 200% text zoom and 320 CSS-pixel reflow. Include JavaScript/canvas motion if used. Automated checks supplement rather than replace these observations; report any existing component gaps encountered in the changed flows.

## 5. Full Authentic Local-Fork Rehearsal

This existing harness requires access to the configured private archive origin. It is not a no-network standalone Anvil test. Prerequisites include Slither0.11.6, installed browser dependencies, available ports and the prior toolchains. Configure the private endpoint outside committed files; do not echo it into evidence.

From the repository root, choose a fresh evidence directory/run ID:

```sh
cd /Users/user/Development/backed-by-fans
: "${BBF_FORK_RPC_URL:?Configure a private archive endpoint in the environment}"
unset BBF_FORK_BLOCK_NUMBER BBF_FORK_BLOCK_HASH BBF_FORK_INPUTS
export BBF_FORK_EXECUTION_RPC_URL=http://127.0.0.1:18557
export BBF_FORK_WEB_URL=http://127.0.0.1:3110
export BBF_FORK_EVIDENCE_DIR="$PWD/artifacts/protocol-fork/vesting-review-001"
export BBF_FORK_RUN_ID=vesting-review-001
./scripts/verify-local.sh
```

The harness reads `scripts/protocol-fork/origin.json`, forks source chain4663 into disposable31337, and does not source `.env`. Never reuse a completed evidence directory as if it were a fresh run. The deployment/fork fixture uses the linked ledger, separately deployed tier stores and current ABI; the harness verifies every deployment payload and the complete immutable graph. `scripts/test-web-anvil.sh` currently delegates to this authentic fork flow; older standalone-Anvil prose is not authoritative.

Expected: contract/static/frontend suites and observed new-version journeys pass, artifact/source/runtime parity includes the leaf library and consumer links, emitted accounting and payout evidence reconciles. This remains local target-environment evidence, not a public deployment, audit certificate or production approval.

## 6. Release Record

Record the initial defaults and supported bounds used in the mathematical behavior report, including fixed and PWYW amounts, precision/scaling, small/large histories, extreme customization, refunds and churn. Keep share concentration distinct from payout attribution. Check invalid-input rejection and immutable published terms. No per-asset economic-suitability report, named approver, or default-tuning gate is required by this feature.

For each test class record revision, tool versions, seed/input history, chain/environment, exact commands, outcome and unresolved limitation. Run the risk checklist, task analysis, implementation review and convergence required by the constitution. Public-chain verification/deployment remains a separately authorized step.
