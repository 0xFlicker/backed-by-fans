# Manual review handoff

Feature 006 implementation complete. Branch `codex/006-member-cancellation-refill`; changes remain uncommitted. The retained local environment is running under lifecycle run `feature006-review-20260923-finalb`.

- [Protocol](http://localhost:3110/chains/31337/protocol)
- [My account](http://localhost:3110/account)
- [USDG Fans](http://localhost:3110/chains/31337/tiers/0x5562E0a4F0A6477984D9113a48B16D7CD43c3492)
- [WETH Fans](http://localhost:3110/chains/31337/tiers/0x4c79e2C87B384529Ea7F94461FA3B53BbF6828E5)
- [USDG creator controls](http://localhost:3110/chains/31337/tiers/0x5562E0a4F0A6477984D9113a48B16D7CD43c3492/manage)
- RPC: `http://127.0.0.1:18557`; chain ID **31337**.

## Restored review access

| Wallet | Live positions | USDG | WETH | Native gas |
| --- | ---: | ---: | ---: | ---: |
| `0x467172992E0aBa58411d14eC8b174167B0e359a6` | 4 | 1,000 | 1 | ~10 |
| `0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027` | 4 | 1,000 | 1 | ~10 |

The second wallet owns both tiers and is a signer on Safe `0x11A4B10672aF73Db7fb377e6c474187C416Da5BB` with threshold **1**. Buybacks remain **OperatorGuarded**. Review memberships fund **300 USDG + 0.02 WETH** of first-month protocol allocations. They use the standard fixture's 0% creator retention and initially disabled periodic capability; the tier owner can enable refill in creator controls, then the current NFT owner separately sets a target and approves spending. Create a fresh tier to review nonzero retention; retention cannot be raised after creation.

Cancellation is available to the NFT owner or approved operator, with payout only to its current owner. Stop refill preserves prepaid time; cancel ends the position. Refills require a caller before expiration. Revoking wallet approval remains available after transfer/retirement. Detailed cap behavior is in the whitepaper/docs.

## Evidence and recovery

- [Final acceptance](final-acceptance.md), [local verification](local-verification.md), [convergence](../convergence.md), [accessibility](accessibility.md).
- Full fork: 727 contract tests, 864 web unit tests, 86 browser tests passed. Final retained replay: six feature journeys passed and their restored branches/receipts reconcile. Independent model, Medusa and Echidna campaigns passed.
- `artifacts/protocol-fork/feature006-review-20260923-finalb/` contains bootstrap/link/source records, browser receipts/screenshots, `review-seed.json` and actual `review-readiness.json` reads.
- Both fresh/restored Anvil lifecycle starts now use `--prune-history 256`; the real 512-block regression preserves current reads/old receipts/snapshot restoration with zero persisted historical-state files. Do not restart an unbounded Anvil to restore review.
- The old seed attempt and disposable verifier failures are retained transparently; final successful corrections are recorded in final-acceptance.md. The existing broader protocol two-full-run certification is not claimed complete.

No public deployment, migration, independent audit, CI result, commit, push or merge is claimed. Services are intentionally left running. Stop this owned environment through `python3 /Users/user/Development/backed-by-fans/scripts/protocol-fork/lifecycle.py stop --run-id feature006-review-20260923-finalb` when review is finished; do not delete live state or stop unrelated processes.
