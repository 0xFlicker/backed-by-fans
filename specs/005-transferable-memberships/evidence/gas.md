# Bounded work and gas — T064

Final `MembershipLifecycleGas.t.sol` 3/3 and `GasAccounting.t.sol` 13/13 passed in `/tmp/bbf-contracts-final.log`. Solidity 0.8.36/Cancun, optimizer 200, deterministic linked VestingLedger, Robinhood profile. Large Solidity fixture uses the existing 1,000,000-byte / 1,000,000,000-gas test-harness overrides; actual deployment limits/rehearsal are separately documented in `deployability.md`.

| Operation at 10,000 scheduled positions | Measured gas | Enforced ceiling |
|---|---:|---:|
| 256-event incomplete preview, 32 selected IDs | 8,196,983 | 30,000,000 |
| 100-item owner page | 305,262 | 1,000,000 |
| 32-position selected claim | 2,111,657 | 5,000,000 |
| 25-event maintenance, peak of measured batches | 7,506,784 | 15,000,000 |

The 256-event preview reads 3,229 distinct storage slots, below the test's 4,096 bound. It does not copy/traverse the 10,000-entry heap. Discovery rejects 101 requested items; previews reject 257 steps. Equal-time backlog requires 400 successful paused calls for exactly 10,000 combined funding/expiry events, no call exceeds 25, and 32 later-expiring funded positions remain. The setup grants 10,000 positions then funds 32, separating population setup from operation measurement.

Gas metering covers the first eight deepest-heap batches and final small-heap batches (132 nodes or fewer); the intermediate batches still assert exact bounded progress but are unmetered to avoid exhausting the test-harness transaction. The reported peak is the peak **among measured batches**, not a claim of exhaustively measuring every possible history or a formal worst-case bound. Position IDs/heap size cannot create an unbounded mutation scan. Unit costs still depend on state, selected token history and network execution pricing.

Representative updated gas assertions use measured operation gas (before refunds): new membership 941,208 / ceiling 1,050,000; renewal 545,258 / 600,000; member-only claim 327,337 / 360,000; three-tier claim with funding/expiry ends 2,423,387 / 2,700,000; eight-tier continuous claim 3,077,516 / 3,400,000; advance plus direct burn 985,116 / 1,100,000. These replace old lifecycle budgets that omitted enumeration/burn/retirement. Logs also retain callee, intrinsic, refund and charged estimates separately.
