# Local buyback tools

The replacement supports trusted operator execution with entirely off-chain
policy and public permissionless execution with Safe-authorized standing settings.
Expiry and cumulative budgets are optional; indefinite, unlimited policies need
no renewal. See [the contract policy](buyback-policy.md) for mode semantics.

## Open the calculator

Use the existing local web server:

```sh
./contracts/scripts/buyback-tools.sh review --chain-id 31337 --app-url http://127.0.0.1:3110
```

Or open <http://127.0.0.1:3110/chains/31337/tools/buybacks>. It loads the configured protocol
and all registered currencies directly. ETH includes canonical WETH; do not create
separate ETH and WETH settings.

1. Choose the percentage of currently earned funds to spend and the planning
   timeframe. Defaults are 100% over 24 hours. Future unearned fees are separate.
2. Click **Estimate all currencies**, then **Apply calculated sizes across
   currencies**. The default gas preference is 2.5% of purchase value. Small
   balances may be deferred. Missing gas estimates produce provisional sizes,
   clearly labeled for rehearsal.
3. Adjust minimum/maximum batches and minimum minutes per currency. The global
   minimum applies between purchases of any currency. Either interval can be zero.
4. Click **Rehearse selected settings** to capture a fresh block and run sequential
   transactions through stateless `eth_simulateV1` RPC calls. Your selected settings stay intact. Each purchase sees reserves left by earlier simulated purchases. This costs
   no funds on the source fork. It uses the snapshot gas price, a fixed market
   scenario with no invented third-party trades, and at most 64 purchases within
   a two-minute runtime. Deferred funds and truncated runs remain visible.
5. Click **Review N currencies**, **Sign settings**, then **Save through Safe**.
   The current Safe's actual threshold is used. All selected currencies and the
   global interval are saved atomically in one Safe transaction. Saving settings
   does not buy tokens or reset purchase clocks.
6. In PermissionlessGuarded with a valid public price policy, open the protocol page. Anyone with local ETH for gas can press the eligible
   **Burn** button at the top of the page. The admin page, backend and Safe signer are unnecessary for
   that purchase. In OperatorGuarded, public actions advance accounting and release fees; market buys are performed by the authorized operator. If no one calls, funds wait.

Editing any setting discards its previous rehearsal result. If another Safe
transaction advances the nonce while you review, use **Refresh approval**, then
sign again; the calculator draft is retained.

The percentage and timeframe are calculator inputs, not contract authorization
periods. Settings persist until the Safe changes them unless an explicit expiry or finite budget was selected. Limit-only saves preserve a valid price policy and its current remaining budget atomically. Route changes require new price authorization. Maximum batch size caps
one transaction; the cooldown limits how soon another purchase can succeed.
Minimum size prevents callers occupying a shared cooldown with a dust purchase.
A closing partial purchase that transitions the real curve to graduation may spend
less than the minimum once. Direct burns of already-held protocol tokens require
no market settings and do not occupy purchase clocks.

## Rehearsal boundaries

The local POST endpoint is `/api/local/buybacks/rehearse`. It accepts only same-origin
JSON from a loopback website, uses the server's configured local Anvil RPC, and
refuses Vercel execution. It verifies the factory/vault relationship and never
accepts a source RPC URL from the request. Viem `simulateBlocks` sends the proposed
limits, fee collection and purchases to `eth_simulateV1`. Normal rehearsal keeps
the captured mode, pause state, policy revision and remaining budget intact. It
never revives a stale price policy or restores a budget from an older UI snapshot.
Explicit CLI activation rehearsal is separate and used only when intentionally
reviewing installation of new public policies and permissionless activation. Subsequent simulations
replay the accepted purchase sequence from the same snapshot, with explicit block
timestamps for cooldowns. Gas-rejected purchases are discarded from that sequence.
There are no child processes, wallet keys, Anvil mutations, or saved simulation
sessions. Unsupported RPCs fail visibly; there is no nested-fork fallback.

There is no persistent observation database or automatic artifact cache. Rehearsal
results live in the page's current session. Explicit CLI output and retained test
evidence are operator-created files; delete them when no longer needed.

The browser captures a fresh block on each rehearsal attempt instead of reusing
the calculator's initial snapshot. CLI requests still use their explicitly selected
block, which must remain readable. Anvil may retain a historical block header while
its bytecode lookup fails; retrying from a fresh block avoids that stale snapshot.
A stalled source RPC must be recovered before rehearsal can run. Historical price
samples are not a prerequisite for saving settings or executing a buyback.

## Optional one-shot execution

**Current limitation (T096):** the runner aborts above 1,000 tiers or 5,000
historical memberships, and only processes vault inventory after finishing its
collection sweep. This remains outstanding; the bounded browser Burn action is
available independently. Do not treat this runner as validated for larger deployments.

For manual execution, the protocol page's top-level **Burn** button now builds a
fresh batch and submits it through the immutable `factory.burnRouter()`. This is
a permissionless typed transaction, collecting registered-tier fees and attempting
eligible vault purchases in one wallet confirmation. It does not publish settings
or use the local rehearsal API. The separate runner below remains available for
scheduled execution.

```sh
cd /Users/user/Development/backed-by-fans/web
# Set BBF_RUNNER_PRIVATE_KEY privately to a funded execution wallet.
bun scripts/run-buybacks.ts \
  --rpc-url http://127.0.0.1:18557 \
  --factory "$BBF_FACTORY_ADDRESS" \
  --once --submission-mode public --max-gas-percent 2.5
```

The runner captures a finite membership set, checkpoints/releases earned fees,
then performs one currency sweep and exits. Discovery is capped at 1,000 tiers
and 5,000 memberships before collection writes begin. Larger deployments require
bounded indexing rather than an unbounded serverless invocation. It uses fresh eligibility, quotes,
gas estimates, viem simulations and receipt reconciliation. It neither changes
settings nor waits for the next cooldown. Invoke it again later. Production
Vercel Cron deployment is outside this local implementation.

Set `BBF_FACTORY_ADDRESS` from the active run as shown in the
[operator setup](operations-and-evidence.md#select-the-running-deployment). The
runner sends real local transactions, potentially several per invocation; it is
not rehearsal and does not combine everything into the router transaction.

Successful execution reports a matching burn receipt and reconciled inventory.
`Cooldown`, `BelowMinimum`, and `gas-deferred` mean funds remain for a later call.
A failed write or receipt stops execution; inspect the library error before a
new invocation. There is no application-level nonce or receipt recovery system.

## Repeatable acceptance

With the seeded fork running, this command uses stateless RPC simulation and
checks that memberships, wallet balance, Safe nonce, vault inventory, settings and
protocol-token supply remain unchanged:

```sh
cd web
BBF_ADMIN_RPC_URL=http://127.0.0.1:18557 \
  bun scripts/buyback-standing-acceptance.ts \
  /absolute/evidence/bootstrap.json /absolute/new-acceptance-directory
```

Expected: at least three sequential burns, cooldown spacing, repeatable results,
gas deferral with measured suggestions, and `sourceUnchanged: true` in `report.json`. For network restart, funding and owner handoff, use
[the quickstart](../quickstart.md).


## Operator execution and private submission

Operator policy must not be sent to the Safe settings calculator or stored as a
public contract policy. Use the runner's `--operator-policy` JSON input with
explicit per-asset amounts and typed conversion pools, and `--tolerance-bps` for
an operator-approved quote tolerance. The runner quotes each market leg and
submits its positive minimum outputs with the transaction. Native input uses an
empty conversion-pool array; the final purchase still uses the active Pons venue.

The execution wallet must match `vault.operator()`. The Safe configures that
identity through the admin `operator` action and changes execution mode through
`mode`. Public route and price administration remains through `route` and `policy`;
`policy` accepts optional expiry and input budget, with zero meaning indefinite
and unlimited respectively. Use CLI validation rather than handwritten ABI data.

Submission mode is required explicitly. `--submission-mode private` additionally
requires `--submission-rpc-url` pointing to a provider verified to support private
submission on the chosen chain. The client does not establish provider privacy
merely from that label and never falls back to public submission. The private
endpoint must also support market reads, quote calls, gas estimation and
transaction simulation: operator term-bearing preflight uses that same endpoint,
not the public read RPC. `public` is
appropriate for a disposable local fork. Random timing and secret off-chain policy
alone cannot guarantee protection; transaction minimum outputs are enforced.
