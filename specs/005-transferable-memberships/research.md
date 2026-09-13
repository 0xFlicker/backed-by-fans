# Phase 0 Research

## R1 — Position identity and authority

**Decision**: Use the installed OpenZeppelin ERC-721 implementation and its `ERC721Enumerable` extension for owner enumeration. Remove `tokenOf`, soulbound overrides, `IERC5192` inheritance/support and historical-ID reminting. Creation always increments `totalMinted`; renewal requires a live explicit ID. ERC-721 approvals govern transfer; member claims and self-renewal require the actual owner. Creator refund authorization stays intact and pays that owner. Live transfers check authority and absolute expiration without running accounting catch-up; token-scoped economics, schedules and accounting progress remain unchanged regardless of backlog.

**Rationale**: `MembershipTier._prepareTimeIncrease` currently infers identity from a wallet and can remint old IDs. `_update`, `approve`, and `setApprovalForAll` prohibit movement. The vendored ERC-721 `_update` already checks authorization, updates balances and clears token approvals. Its enumerable extension supplies constant-time owner indexing without a new indexing service.

**Alternatives considered**: Transfer wallet records (breaks multiple positions); retain `tokenOf` as a default-position alias (ambiguous compatibility); append-only owner history (unbounded stale traversal); custom linked-list enumeration (duplicates an installed dependency).

**Standards**: [ERC-721](https://eips.ethereum.org/EIPS/eip-721) defines transfer, approval reset, receiver handling and optional enumeration. [ERC-5192](https://eips.ethereum.org/EIPS/eip-5192) is the obsolete soulbound interface. Keep the expiration/renewal interface from [ERC-5643](https://eips.ethereum.org/EIPS/eip-5643), with `isRenewable` false at expiration and renewal rejecting expired identities. These standards do not dictate the protocol's reward or refund policy; those decisions come from this feature specification.

## R2 — Independent expiration schedule

**Decision**: Keep the ledger's indexed funding-head heap and add an indexed expiration heap, one node per extant membership, ordered by `(expiration, tokenId)`. Replace or remove entries in place. MembershipTier coordinates both schedules; the ledger continues to own financial accounting. Do not add a keeper service or externally callable burn callback.

**Rationale**: Funding scheduling is absent for complimentary and zero-contribution positions. `VestingLedger.Node`, `heapPosition`, and funding heads only describe funding START/END events. A second typed heap keeps expiration independent without doubling funding nodes or scanning historical NFTs. The existing indexed-heap algorithm is a suitable pattern; do not introduce a configurable event framework.

**Alternatives considered**: Reuse funding END as expiration (misses free positions and grant time); enumerate all minted IDs (unbounded historical work); append stale expiry entries on every renewal (cheap writes create unbounded cleanup debt).

## R3 — Chronological coordinator and batch boundaries

**Decision**: For earliest boundary T, credit continuous funding through T and finish all funding events at T before retiring any NFT at T. Funding ties use the ledger's deterministic token ordering, and expirations use ascending token ID. Count each funding START/END and each retirement as one shared work step. If funding work remains at T, preserve that state and return incomplete; never begin retirement there. Stop without advancing past pending work. All external maintenance routes use this same coordinator.

**Rationale**: `VestingLedger._process` currently credits a whole batch once because the share denominator is fixed. An expiration changes that denominator. The tier can advance the ledger to the next expiry with the available budget, then retire only after the ledger reports no funding due through that point. Heap roots plus the stored accounting timestamp persist the phase; no separate offchain cursor is required.

**Alternatives considered**: Burn first (drops boundary earnings); aggregate an entire mixed batch (applies the wrong denominator); demand every equal-time event fit one call (unbounded and can deadlock). An atomic operation requiring current accounting still reverts on incomplete catch-up; explicit maintenance persists partial progress. Transfers/approvals and withdrawal of already-settled retired credit do not require catch-up.

## R4 — Exact retirement credit and accounting conservation

**Decision**: Add `retiredCreditScaled[owner]` to the existing ledger. A dedicated retirement primitive settles the token's index delta, moves its entire scaled credit into this balance, subtracts eligible shares, zeros its member account and preserves lifetime gross. Keep historical funding lots queryable by issued ID. Retired claims pay `floor(credit / 2^128)` and retain the remainder.

**Rationale**: `VestingLedger.setWeight` prohibits decreasing stored shares, so it cannot implement permanent destruction. Moving credit between member and retired-owner accounts does not change aggregate member liability. Only payout debits that liability. The existing `_setWeight` moves unallocated global `rewardCarry` into `distributionDust` at denominator changes; preserve this distinction. Global carry is not the member's already-earned fractional credit.

**Alternatives considered**: Pay on burn (rounding loss, callback and payout failures block maintenance); retain claim rights on a burned token (keeps obsolete identity authority); round each retired token independently (loses fractions); reset total gross (reopens earlier curve issuance).

## R5 — Every mutation participates

**Decision**: Every time-changing entry point calls the shared catch-up before payment, capacity or position mutation, including zero-value contributions and grants. After changing time it updates the expiry key. Refund and full revocation retire immediately if no time remains; a partial grant revocation preserves the surviving position. Passive normalization of elapsed paid/granted time does not change the absolute expiry key.

**Rationale**: `_contribute` currently skips catch-up for zero gross; `grantTime` has no global catch-up; `revokeGrantTime` can mutate time before accounting. `_refund` currently only suspends weight. ERC-5643 renewal delegates through wallet lookup. Each must be replaced rather than patched with an old-identity fallback.

**Alternatives considered**: Catch up only financial mutations (free paths bypass chronology); user-supplied expiration lists (missed entries become economic bugs); renew expired ID and burn later (restores historical position).

## R6 — Bounded discovery and claims

**Decision**: Page current owner indices with a caller-supplied page limit and one captured block per multi-page read. Remove unbounded wallet-level `isActive`/`activeBalanceOf` APIs; use `isActiveToken` for access proof and page-derived summaries with completeness. Batch claims accept explicit sorted tier/ID lists and a caller-supplied aggregate accounting budget, without hard-coded iteration ceilings. Reject duplicate tiers/IDs and stale ownership atomically. Claim retired-owner credit separately even when no NFTs remain. Creator, referral and retired categories are collected once per selected tier.

**Rationale**: The factory currently bounds tiers and accounting, but assumes one token per wallet. `account-cache.ts` keys only by tier; `membership-read.ts` and rewards readers use `tokenOf`. The existing creator expiration UI scans `totalMinted`; batching RPC calls does not bound that total scan. Explicit selected IDs keep execution bounded. Snapshot reads prevent swap-and-pop enumeration from skipping entries; submitted actions still revalidate current state.

**Alternatives considered**: Claim all owned positions in one call (unbounded); silently stop at a limit (misleading claim completion); global history scans or a new indexer (unnecessary service and historical work); maintain owner-level active-count heaps (extra state avoidable with token access proofs and paged reads).

## R7 — Preview parity and application architecture

**Decision**: Preview chronological funding and retirement with a bounded memory overlay of touched heap/account nodes. Simulate changing shares, carry/dust, selected-token credit and beneficiary retired credit. Share settlement arithmetic with writes. Expose as-of time, progress, next boundary and completeness. Cache positions by chain, tier and token ID; cache retired credit by chain, tier and beneficiary. Use existing wagmi/viem primitives and generated Foundry bindings.

**Rationale**: `VestingLedger.encodedPreview` assumes constant total shares and target eligibility. It cannot be reused unchanged. `membership-interfaces.ts` currently demands ERC-5192 and must stop doing so. `web/AGENTS.md` requires library-owned transaction lifecycle and Foundry/Wagmi-generated bindings.

**Alternatives considered**: Return stale balances as current (incorrect); copy every heap node for a view (unbounded); hand-maintained ABI or custom receipt recovery (violates project guardrails).

## R8 — Delivery and proof

**Decision**: Plan a replacement contract release, no migration/compatibility adapter, no feature flag, and no deployment in this run. Keep linked-ledger build infrastructure and pinned toolchain. Extend the independent accounting model/history runner plus unit, invariant and browser tests. Record bytecode/gas limits separately from permissive test-runner limits.

**Rationale**: The tier is not upgradeable. `scripts/verify-local.sh` deliberately uses very high test size/gas limits and runs a broader fork/browser harness; passing it alone cannot prove deployability or authorize public chain writes. `scripts/test-web-anvil.sh` delegates to the existing protocol-fork bootstrap and needs configured origin/pin/evidence inputs.

**Alternatives considered**: Change already deployed immutable tiers (impossible); claim local tests prove release (unsupported); rebuild wallet infrastructure for the new flows (unnecessary).

## Research completion

All technical unknowns identified for Phase 0 have a design decision above. Two read-only research agents inspected accounting and product surfaces; the findings were reconciled against the tier source, vendored ERC-721, project constitution and verification scripts. Numeric batch maxima were removed by the 2026-09-12 amendment; callers choose bounds and measured resource use informs application batch sizing. No protocol transaction or test result is claimed by this research.

## 2026-09-12 clone and caller-budget amendment

Feature 005 remains open. One fixed implementation is deployed separately; the membership factory directly deploys standard deterministic ERC-1167 clones and initializes each atomically once. The implementation is initialization-locked. Initializable OpenZeppelin ERC-721 enumeration/ownership preserve independent tier state; fixed economic storage has no setters or upgrade path. Factory registration distinguishes official tiers. Tier A/B stores and the separate tier deployer are removed.

Custom membership mutations accept an explicit accounting budget; factory claims share a caller budget across sorted tier requests by actual consumed steps. All protocol batch/page paths remove arbitrary numeric iteration ceilings. Inputs, economics and native Robinhood limits remain validated. Positive-budget maintenance saves chronological partial progress; atomic mutations revert if catch-up cannot finish. Standard ERC-5643 signatures require separate maintenance for due events. Transfer and settled retired-credit withdrawal do not run catch-up.

Validation includes above-former-cap cases, small/large batch equivalence, locked/atomic clone initialization, independent storage, Claim all interruption/revalidation, and measured before/after gas. Replace only the owned fork/web at RPC 18557, chain 31337 and web 3110 using the existing private RPC/pin. Explorer verification/clone recognition is deferred to the next authorized testnet deployment. Previous evidence does not validate this amendment.
