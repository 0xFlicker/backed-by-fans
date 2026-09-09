# Memberships before token launch

The membership protocol can be deployed with no protocol token. The factory,
vault and Burn router exist from the start. Membership payments reserve protocol
fees, which earn continuously over consumed paid time. Anyone may checkpoint and
release earned fees into the fixed vault. No token purchases or burns execute
until the Safe binds a protocol token.

The protocol page shows **Protocol token has not been deployed** and continues
to show fee reserves, earned fees and released inventory. Collection is useful
progress; it is not a burn. Creator proceeds, rewards, refunds and membership
access retain their existing behavior. Unearned fees remain reserved for refunds.

## One-time activation

The current factory Safe calls `bindProtocolToken(address)` on the factory after
a valid Pons token has been launched on the same chain. Binding validates the
launch and deploys the fixed executor atomically. The factory and vault report
the same token. An invalid token or failed dependency validation leaves the
protocol unbound with all inventory unchanged. A successful binding cannot be
repeated or replaced, including by the Safe.

After binding, configure routes, standing sizes/intervals and resume buybacks
through the existing Safe authority. Activation alone does not spend accumulated
fees or change membership terms. A funded ordinary caller can then process
eligible inventory. Pauses and custody restrictions continue to apply.

The Safe selects the eventual token. Before binding, supporters cannot inspect
its final identity; disclose that pending choice. If no valid token is bound,
fees remain pending indefinitely. This does not create a withdrawal or refund
right over fees already earned.

## Local deployment and evidence

Use the separate no-token entrypoint documented in [quickstart](quickstart.md).
It prepares a fresh local deployment; existing deployments cannot be upgraded
into this behavior. Full-launch deployment remains available separately.

Verified 2026-09-09:

- Contracts: 328 passed, 9 opt-in fork tests skipped. The authentic deferred
  Pons launch/bind/burn test passed separately against the pinned upstream fork.
- Web: 591 unit tests passed across 93 files; typecheck, lint and ABI drift passed.
- Lifecycle: 12 tests passed. Solidity formatting passed.
- Browser: verified membership ownership/reserves, collected fees without a token
  or executor (zero purchases), and loaded the membership page. Snapshot restored
  afterward so manual collection remains available.
- Deployment retains the existing 95 KB transaction gate; vault runtime is 18,213 bytes.
- Slither 0.11.6 `--fail-high` did not pass: `reentrancy-balance` flags the existing
  WETH before/after balance assertion in `_normalizeReceipt`. That function is
  unchanged; callers use `nonReentrant` and the target is fixed WETH. This is
  recorded as an outstanding static-analysis finding, not a clean gate.

Manual run: `no-token-final-20260909`, RPC `http://127.0.0.1:18557`, chain 31337,
web `http://127.0.0.1:3110/chains/31337/protocol`. WETH, USDG and AMD memberships
have four paid periods with 15 days elapsed. The operator wallet
`0x467172992E0aBa58411d14eC8b174167B0e359a6` owns the 1-of-1 Safe and retains
23.97 ETH. Token and executor remain zero, and fees are ready to collect.
Evidence: `artifacts/protocol-fork/no-token-final-20260909/`, including
`unbound-browser.json`, `unbound-collected.png` and `buyback-demo.json`.
 A testnet
release is a separate follow-up. The unbound membership deployment does not need
Pons contracts to exist; later activation still requires the configured authentic
Pons dependencies on that chain. This change does not supply a testnet launchpad.
