# Local policy tools acceptance — 2026-09-08

Scope: the approved manual local-tools increment in
[local-policy-tools-plan.md](local-policy-tools-plan.md). This is not public-chain
execution, unattended renewal, or production operations acceptance.

## Automated checks

- Full web unit suite: **89 files, 558 tests passed**.
- After final report presentation/error improvements: **44 focused tests passed**,
  including two additional UI cases for gas, residual inventory, price movement
  and long errors. Earlier focused policy run passed all 64 tests.
- TypeScript, targeted ESLint, generated ABI consistency and `git diff --check`: passed.
- Optimized Next build: passed. Build emitted wallet dependency warnings about
  MetaMask's optional React Native storage module and an `ox` dynamic dependency;
  these warnings are not claimed resolved by this increment.

## Actual local-chain execution

Retained evidence:

- [History/graduation acceptance](../../artifacts/policy-tools-20260908/acceptance-history-graduation/acceptance.json)
- [Bonding history proposal](../../artifacts/policy-tools-20260908/acceptance-history-graduation/bonding-history.json)
- [Pool history proposal](../../artifacts/policy-tools-20260908/acceptance-history-graduation/pool-history.json)
- [Current USDG rehearsal report](../../artifacts/policy-tools-20260908/usdg-rehearsed.html)

An owned child of the running source collected 61 SQLite observations at
120-second intervals over two hours of simulated chain time. The generator
constructed a history proposal, and signing preflight re-read the retained
historical market evidence. Three sequential ETH-input bonding buys burned
`174713173927992110977` raw protocol tokens. Each successive batch received fewer
tokens and recorded the changed marginal price.

The actual `submit-fork` CLI collected fixture Safe signatures and executed
`execTransaction` on that child. Its nonce moved 14→15 and asset revision 2→3;
publication did not change token supply.

A fresh local trader then bought the remaining curve allocation using real curve
math (gross input `4232388888888888891` wei). Permissionless launchpad operations
created the actual graduated pool, without Pons operator impersonation or storage
fabrication. A bonding proposal was rejected after transition. A separate set of
61 pool observations produced a valid pool proposal; three sequential pool buys
burned `14431485849646054467` raw tokens.

The source Safe nonce remained 14, token supply remained
`1000000000000000000000000000`, and vault ETH remained zero. Source blocks continued
normally; no source restart, reset, time jump or write was performed.

The USDG rehearsal separately demonstrated a full successful batch followed by a
small remainder rejected by `PriceBelowFloor`. It is correctly marked **partial**,
with successful receipts, burned amount and remaining inventory retained.

## Actual browser execution

[Final browser capture](../../artifacts/policy-tools-20260908/browser/policy-tools-review--polic-ffa3b-blishes-on-an-isolated-fork-desktop/published-policy.png)

`policy-tools-review.spec.ts` passed against the existing server on port 3110.
A fresh Playwright browser imported the proposal, refreshed checks, acknowledged
partial rehearsal, collected real EIP-712 signatures from two fixture owners,
published through the Safe and verified inner success and canonical policy state.
The browser showed human balances, rates, gas limitations and residual inventory.

All browser RPC writes were intercepted to the owned child. Unknown RPC origins
were blocked, service workers disabled, and the user's browser/wallet were never
attached. The child accessed its source only through a tested read-only proxy.

Sole-owner thresholds, imported signatures, duplicate/non-owner signatures,
wallet rejection/cancellation, stale checks and Safe inner failure have focused
unit coverage. Public owner wallets and public-chain publication were not exercised.

## Reproduce

From `web/`, with the existing fork and installed Anvil:

```sh
BBF_ADMIN_RPC_URL=http://127.0.0.1:18557 \
  bun scripts/buyback-policy-acceptance.ts \
  --bootstrap ../artifacts/protocol-fork/manual-review-20260908/bootstrap.json \
  --output ../artifacts/policy-tools-acceptance

PLAYWRIGHT_BASE_URL=http://127.0.0.1:3110 \
BBF_ANVIL_RPC_URL=http://127.0.0.1:18557 \
BBF_POLICY_TEST_BOOTSTRAP=../artifacts/protocol-fork/manual-review-20260908/bootstrap.json \
  bun run test:e2e tests/e2e/policy-tools-review.spec.ts \
  --project desktop --workers 1
```

The acceptance script funds and advances owned descendants only. Check
`status: passed` and `sourceUnchanged: true` in its evidence. Rehearsal setup uses
Safe impersonation explicitly; the separate CLI/browser checks establish actual
Safe signatures and execution. No fork gas measurement is a public fee guarantee.
