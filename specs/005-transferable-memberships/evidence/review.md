# Lifecycle review — T066

Scope: `MembershipTier.sol`, `VestingLedger.sol`, `ExpirationSchedule.sol`, `MembershipFactory.sol`, router accounting budget integration and their focused/adversarial/model tests. This is implementation review and automated analysis, not an independent public audit.

## Authorization and interactions

All three ERC-721 transfer forms reach the same timestamp-live check and OpenZeppelin authority/approval-clearing path; the transient guard remains active through safe receiver callbacks. Transfers touch no accounting or time schedule and have no pause/catch-up gate. Payment/claim/refund mutators are guarded; owner checks use canonical token ownership. Factory claims validate registered unique tiers and IDs, authorize the initiating beneficiary only, share actual accounting work and revert atomically with the named failed tier. Creator-only refund/cancel captures and validates the current owner, cancels funding, retires before payout and pays that owner. Token delegates cannot renew or claim. Exact transfer deltas reject non-exact token movement.

## Chronology and conservation

The expiration heap orders timestamp then ID and stores one indexed entry per extant position. The coordinator advances funding through the next expiry before retirement; funding events and tails at that timestamp finish first, including across budget splits. Only actual funding/expiry work consumes the shared 25-step budget. A failed catch-up-dependent transaction rolls back its progress; explicit maintenance commits partial progress and works while paused.

Retirement settles the position against the historical reward index, moves every scaled credit to the final-owner pool, removes eligible denominator weight, moves denominator-change carry to tracked distribution dust, clears membership/referral state, removes its schedule, burns and releases capacity once. Independent rational and randomized histories test exact liabilities, retained fractions, no duplicate payout, fresh issuance and monotonic gross. No wall-clock filter is applied to the historical denominator before its chronological boundary.

## Slither 0.11.6

Command from `contracts`: `FOUNDRY_LIBRARIES="$(jq -r .mapping out/vesting-leaf/link-manifest.json)" slither . --skip-clean --config-file slither.config.json --fail-high --json /tmp/bbf-slither-final.json`. Exit 0: 120 contracts, 101 detectors, 121 findings (**0 High, 37 Medium, 49 Low, 35 Informational**). Existing config excludes weak-prng and dependency/test/script paths; no new suppression was added. Full log `/tmp/bbf-slither-final.log`.

Lifecycle-relevant triage:

- Divide-before-multiply in member/referral/retired withdrawals intentionally floors whole payment units and subtracts only those units, retaining the fraction. Distribution retains quotient remainder as carry; active funding uses the established per-second quotient plus final boundary tail. Model parity/conservation covers each case.
- Strict equality and timestamp checks implement exact zero balances, bounded work counters and the explicit expiry boundary. Counter increments cannot overshoot the requested budget. Time is subscription time, not entropy.
- Payable ERC-5643 selectors explicitly reject nonzero `msg.value`; there is no supported native deposit path into the tier.
- Uninitialized locals are Solidity zero-initialized accumulators, optional referrers and memory structs populated before encoding; no uninitialized storage reference exists.
- Expiration removal's boolean is unused because retirement already requires a known extant owner and every extant position is scheduled; invariants assert this across all mutations. Media validation return values are intentionally ignored where successful validation/revert is the contract.
- Preview self-owner reads are static and bounded by 256 events. Factory/router external loops are restricted to registered tiers and bounded batches. Factory creation records used salt before deployment; renderer validation calls are view/static and the immutable deployer creates the known tier, without an attacker-controlled callback.
- Informational `unimplemented-functions` for `MembershipFactory.owner` is a detector inheritance-resolution artifact: the explicit override is implemented and compiled/runtime-tested.

The remaining renderer/established buyback findings concern existing pixel rounding, guarded wrapper/router interactions, optional unused tuple members, assembly and naming. Reviewed for lifecycle impact; no actionable lifecycle defect identified. Slither's compilation removes some test-only artifacts; rebuild linked artifacts before running web preflight tests. Automated analysis does not prove absence of defects.
