# Standing permissionless buybacks: implementation evidence


**Evidence scope (2026-09-09 documentation pass):** This file retains dated results,
not a live service inventory. Use the Ready message and current run's deployment
files to identify the running environment. Follow the [operator quickstart](quickstart.md)
for current commands. Final complete acceptance for the latest source remains
pending T096–T098; earlier complete runs do not certify later changes. No new
acceptance run or restart was performed for this documentation update.

Updated 2026-09-08. This records the replacement described in
[Simple permissionless buybacks](operating-model-proposal.md). It does not reuse
historical expiring-policy acceptance as proof of the new contracts.

## Implemented behavior

- The Safe sets standing minimum/maximum inputs and global/per-currency cooldowns.
  Settings do not expire or require daily approvals, price signatures or an oracle.
- ETH and canonical WETH share limits, inventory denomination and purchase clocks.
  Membership and donation books remain separate. Public callers execute eligible
  purchases; failures and settings changes do not reset successful-buy clocks.
- `/tools/buybacks` provides human-unit controls, estimates, optional
  sequential rehearsal and one combined Safe settings transaction.
- The helper executes one bounded sweep, uses an editable gas preference (2.5%
  default), and exits. Capture rejects more than 1,000 tiers or 5,000 memberships
  before starting membership-state reads or writes. No continuous price service
  or persistent cache is required.

## Fresh origin verification

The shared manifest is [origin.json](../../scripts/protocol-fork/origin.json).
The replacement was tested against Robinhood origin chain 4663 at:

- Block: `58083838`
- Hash: `0xbed1732da1a4301c9f3ea9c5eafbdf76f80e8b4afade3e3c0fe66d41f794ea6c`
- Local execution chain: `31337`

The read-only refresh verified the existing source/runtime locks, Pons dependencies,
Safe infrastructure, WETH implementation, payment-token metadata and connected
positive route quotes, then rechecked the block hash. The exact candidate was
verified again before updating the shared manifest. No source locks were silently
replaced and the previously running fork was unchanged by these reads.

Evidence:

- [Candidate report](../../artifacts/protocol-fork/origin-refresh-20260908/report.json)
- [Applied-pin report](../../artifacts/protocol-fork/origin-apply-20260908/report.json)
- [Replacement deployment preflight](../../artifacts/protocol-fork/standing-20260908/preflight/report.json)

A positive origin quote is discovery evidence for that amount; it is not proof of
arbitrary batch sizes or a newly launched token's graduation. The
[quickstart](quickstart.md#refresh-the-origin-before-replacing-a-stale-fork) records
repinning, fresh deployment, snapshot restrictions and restart commands.

## Retained authentic execution

### Historical child-fork rehearsal (superseded)

[Acceptance](../../artifacts/protocol-fork/standing-20260908/rehearsal/acceptance.json)
reports `status: passed`, `sourceUnchanged: true`, two sequential buybacks and a
successful gas-deferral check. The report reconciles actual purchased-and-burned
output on one disposable child fork, rather than independently quoting unchanged
reserves for each batch.

- [Sequential batch report](../../artifacts/protocol-fork/standing-20260908/rehearsal/sequential-rehearsal.json)
- [Gas-deferral report](../../artifacts/protocol-fork/standing-20260908/rehearsal/gas-deferral.json)

These are child-fork results. They do not publish settings or spend the running
source vault. The child reaches the source through a read-only RPC proxy.

### Shared-currency pacing

The authentic Playwright pacing scenario passed once with no skipped, failed or
flaky cases. It covers ETH/WETH canonical inventory, minimum batch rejection,
shared membership/donation cooldowns, the global interval across currencies,
settings changes preserving clocks and an eligible subsequent public purchase.

- [Scenario and receipts](../../artifacts/protocol-fork/standing-20260908/browser-pacing-final/scenarios/standing-eth-pacing.json)
- [Playwright report](../../artifacts/protocol-fork/standing-20260908/browser-pacing-final/report.json)

### Safe settings through the browser

A real local 1-of-1 Safe settings save passed through the browser. This verifies
owner signing and onchain configuration for the test fixture; it is distinct from
handing the final manual fixture to the user's personal wallet.

- [Saved settings screenshot](../../artifacts/protocol-fork/standing-20260908/browser-layout/buyback-settings--buyback--6dd26--limits-on-an-isolated-fork-desktop/saved-settings.png)
- [Subsequent layout-run report](../../artifacts/protocol-fork/standing-20260908/browser-layout/report.json)

## Source checks and review

Final checks passed:

- Web: **91 test files / 551 tests**, retained in
  [web check log](../../artifacts/protocol-fork/standing-ready-20260908/checks/web-complete.log).
- Contracts: **352 passed / 0 failed / 1 skipped across 42 suites**, recorded in
  `/tmp/bbf-standing-contracts-final.log`. The skipped case is the separate opt-in
  Robinhood testnet Safe deployment test, gated by `RUN_ROBINHOOD_FORK_TESTS=true`;
  this does not replace or skip the authentic local mainnet-fork Safe scenarios.
- Lint, production build and generated-interface check passed.
- Focused lifecycle checks passed 10 Python tests; preflight and manifest checks
  passed 17 Vitest tests.

The final UI regressions passed in a 15-test component run. The local rehearsal
HTTP route also passed seven new tests after fixing Next's `localhost` versus
`127.0.0.1` origin normalization. An actual HTTP request returned 200 with a
[retained rehearsal response](../../artifacts/protocol-fork/standing-20260908/rehearsal/http-response.json).
The fresh browser layout run passed and its settings container and inputs were
visually inspected. A final multi-visitor check exposed a pre-existing singleton
wagmi configuration leaking the selected network between server renders. The
provider now owns a stable per-instance config created by the existing factory;
wagmi still owns hydration and wallet behavior. An SSR regression and two real
browser sessions plus reload passed without hydration errors.
[Browser check](../../artifacts/protocol-fork/standing-ready-20260908/checks/browser-hydration.log).

The read-only code review selected all six always-on reviewers plus security,
performance, API contract, reliability, adversarial and frontend-race reviewers.
Artifacts are under `/tmp/compound-engineering/ce-code-review/20260908-standing-buybacks/`.
It found no confirmed contract custody, settlement, canonical-accounting, cooldown
or authorization defect. Review-driven changes included interval round-trip
validation, runner work bounds and request-body cancellation. The final UI fixes
clear stale rehearsal results after edits and refresh a stale Safe approval without
discarding calculator inputs; their regression checks passed. A code review is not
an audit or replacement for authentic execution.

## Final manual handoff — verified

The initial handoff run was **`standing-ready-20260908`**, with one Next listener on
`127.0.0.1:3110` (PID 23777) and one Anvil listener on `127.0.0.1:18557`
(PID 20133), verified at handoff. Open <http://127.0.0.1:3110/tools/buybacks>.
Select **Backed By Fans Anvil** in the network selector; a new browser initially
selects Robinhood Testnet. The execution chain is 31337 at the origin recorded above. Manual startup skipped
the five-year vesting time advance.

- [Running lifecycle](../../artifacts/protocol-fork/standing-ready-20260908/lifecycle.json)
- [Current deployment](../../artifacts/protocol-fork/standing-ready-20260908/bootstrap.json)
- [Verified owner handoff](../../artifacts/protocol-fork/standing-ready-20260908/owner-handoff.json):
  Safe `0x33F407f3d806435C156357b4296a678D5EdB4104`, threshold 1, sole owner
  `0x467172992E0aBa58411d14eC8b174167B0e359a6`.
- [Wallet funding receipts](../../artifacts/protocol-fork/standing-ready-20260908/wallet-funding-0x467172992e0aba58411d14ec8b174167b0e359a6.json):
  10 local ETH, 100 USDG, 0.04905979813429929 AMD token units and 1 WETH.
  The helper caps token transfers to available fixture reserves; it never patches
  token storage. The prior `standing-final-20260908` attempt failed on the fixed
  AMD amount and shut down. It is not the active run.
- [Fresh rehearsal acceptance](../../artifacts/protocol-fork/standing-ready-20260908/rehearsal/acceptance.json):
  two sequential burns, gas deferral, converted-residual acceptance and unchanged source.
- [Graduation residual proof](../../artifacts/protocol-fork/standing-ready-20260908/rehearsal/converted-residual.json):
  an authentic 100 USDG closing conversion leaves 0.030098842352276333 ETH.
  Rehearsal queues that ETH, reports graduation pending, and a subsequent rehearsal
  after public pool creation buys and burns using the exact remainder. Preparation,
  graduation and purchases all occur on owned child forks.

The final real browser settings save also passed after the wallet-provider fix:
[captured test and receipts](../../artifacts/protocol-fork/standing-ready-20260908/browser-settings-final/report.json).
The test substituted disposable Safe signers only on its owned child, signed and
executed the real Safe transaction, verified settings, and asserted source nonce,
supply, owners and threshold unchanged.

Final desktop and phone checks loaded the calculator against this run, with no
horizontal overflow at 390px. Retained screenshots:
[phone](../../artifacts/protocol-fork/standing-ready-20260908/calculator-phone.png) and
[desktop](../../artifacts/protocol-fork/standing-ready-20260908/calculator-desktop.png).

Final source-check logs are retained under
[`standing-ready-20260908/checks`](../../artifacts/protocol-fork/standing-ready-20260908/checks).
The production build passes with existing optional-wallet dependency warnings.
Public deployment, production Cron and a DAO remain outside this local milestone.

Historical stop command for that run (not the current run):

```sh
./scripts/test-protocol-fork.sh stop --run-id standing-ready-20260908
```

Use a fresh run ID and the [quickstart](quickstart.md) for the next restart.


## Authorized restart after the Anvil stall

On 2026-09-08 the user authorized killing the stalled node and refilling their
wallet. The supervisor terminated `standing-ready-20260908`; its evidence remains.
The replacement is `standing-restart-20260908` on the same ports (Anvil18557,
Next3110), using the same verified origin and a new deployment. Wallet
`0x467172992E0aBa58411d14eC8b174167B0e359a6` is again the sole Safe owner and was
verified to hold **20 local ETH**, plus the ordinary USDG/AMD/WETH fixture refill.

- [Replacement lifecycle](../../artifacts/protocol-fork/standing-restart-20260908/lifecycle.json)
- [Safe handoff](../../artifacts/protocol-fork/standing-restart-20260908/owner-handoff.json)
- [20 ETH balance](../../artifacts/protocol-fork/standing-restart-20260908/additional-eth-funding.json)

The previous fork state could not be exported while stalled; its later memberships
and transactions were not restored. Refill commands should now use the replacement
run's evidence directory.

## Stateless rehearsal and repeatable demo setup

The manual run at this checkpoint was `stateless-demo-20260908`, on RPC18557 and web3110.
The nested Anvil rehearsal implementation and its child-fork test helpers have
been removed. Rehearsal now uses viem `simulateBlocks` (`eth_simulateV1`) against
one captured block. Accepted purchases are replayed sequentially in simulated
blocks, including cooldowns; rejected attempts do not enter that sequence.
No rehearsal transaction, time change, impersonation or state override is
written to the running chain. State overrides exist only inside simulation RPCs.

Verification on this run:

- 50 focused tests, 10 lifecycle tests, TypeScript and focused ESLint passed.
- [Live CLI report](../../artifacts/protocol-fork/stateless-demo-20260908/stateless-acceptance/report.json):
  five purchases repeated at the same captured block, cooldown checks, gas
  deferral, and unchanged source supply, Safe nonce, wallet funds, tier count,
  fee holdings, inventory and settings.
- The actual browser rehearsal endpoint passed twice: eight purchases each,
  unchanged source supply, Safe nonce, tier count and settlement sequence.
  Gas is displayed in gwei. This exercised simulation only, not publishing.
- The first browser attempt interacted before wallet initialization finished;
  its settings reset and no rehearsal request was sent. Waiting for initialization
  fixed the test. The source RPC remained responsive throughout.
- [Demo setup](../../artifacts/protocol-fork/stateless-demo-20260908/buyback-demo.json)
  created WETH, USDG and AMD memberships for the user wallet, purchased four
  30-day periods on each, and advanced 15 days. A second setup invocation exited
  without repeating purchases or advancing time. Final wallet balance was
  approximately 23.976 ETH.

Manual `serve` startup with `BBF_FORK_OWNER_ADDRESS` now prepares this demo
automatically. The [quickstart](quickstart.md) includes the standalone setup
command. Rehearsal requires an RPC supporting `eth_simulateV1`; there is no
nested-fork fallback. Its preview remains bounded to 64 purchases.
