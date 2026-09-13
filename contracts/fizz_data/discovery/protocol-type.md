CLASSIFICATION: Token (`ERC721Upgradeable`, `ERC721EnumerableUpgradeable`, ERC-5643 subscription interface) + Staking/Locking (permanent membership reward weight with time-vested allocations) + Queue/Order (chronological funding and expiration heaps). Not Vault/Yield: reward shares are neither ERC-4626 shares nor redeemable ownership of pooled assets.

```text
PROPERTY_ID: SPEC-01
TYPE: GLOBAL
ENGLISH: ERC-721 enumeration remains exact: every token returned by tokenByIndex has one owner, appears exactly once in that owner's enumeration, and the sum of owner balances equals totalSupply.
SOLIDITY_SKETCH: seen = 0; for i in 0..totalSupply-1 { id = target.tokenByIndex(i); owner = target.ownerOf(id); assert(target.tokenOfOwnerByIndex(owner, localIndex[id]) == id); assert(!duplicate[id]); seen++; } assert(seen == target.totalSupply());
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none; bounded iteration is practical because fuzz tiers have supplyCap 8
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier inherits ERC721EnumerableUpgradeable and advertises ERC-721 support; ERC-721 Enumerable requires global and owner enumeration to represent extant tokens consistently
RATIONALE: Adapts TOKEN T-01 to the enumerable membership NFT rather than an ERC-20 balance sum.
```

```text
PROPERTY_ID: SPEC-02
TYPE: SPECIFIC
ENGLISH: A successful approve followed by transferFrom by the approved actor transfers exactly that token and clears its per-token approval.
SOLIDITY_SKETCH: owner.approve(operator,id); vm.prank(operator); target.transferFrom(owner,to,id); assert(target.ownerOf(id) == to); assert(target.getApproved(id) == address(0));
GHOST_NEEDS: tier, tokenId, owner, operator, recipient
SNAPSHOT_NEEDS: ownerOf, getApproved, owner/operator/recipient balances before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: ERC-721 approval/transfer requirements; MembershipTier delegates live transfers to ERC721Upgradeable through super.transferFrom at MembershipTier:1377-1380
RATIONALE: Adapts TOKEN T-05 to ERC-721 operator authorization and approval cleanup.
```

```text
PROPERTY_ID: SPEC-03
TYPE: SPECIFIC
ENGLISH: setApprovalForAll changes only the caller/operator authorization pair and permits or revokes operator transfer authority for every live token owned by that caller.
SOLIDITY_SKETCH: owner.setApprovalForAll(operator,true); assert(target.isApprovedForAll(owner,operator)); vm.prank(operator); target.transferFrom(owner,to,id); owner.setApprovalForAll(operator,false); assert(!target.isApprovedForAll(owner,operator));
GHOST_NEEDS: tier, owner, operator, recipient, live tokenId
SNAPSHOT_NEEDS: operator-approval flag, token owner and balances
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: ERC-721 operator approval semantics; MembershipTier does not override setApprovalForAll and inherits ERC721Upgradeable
RATIONALE: Exercises the token-standard authorization path separately from membership-specific owner checks.
```

```text
PROPERTY_ID: SPEC-04
TYPE: SPECIFIC
ENGLISH: A self-transfer of a live membership does not change owner balance, totalSupply, occupiedSupply, expiration, time balances, referral identity, shares, or claimable reward, although its token approval is cleared.
SOLIDITY_SKETCH: snapshot(id,owner); vm.prank(owner); target.transferFrom(owner,owner,id); assert(allMembershipStateAfter == allMembershipStateBefore); assert(target.getApproved(id) == address(0));
GHOST_NEEDS: tier, tokenId, owner
SNAPSHOT_NEEDS: owner balance, totalSupply, occupiedSupply, expiration, paid/grant time, referral, shares, claimable reward, getApproved
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: ERC-721 self-transfer preserves ownership/balance; MembershipTier:1357 states ownership movement never changes position accounting
RATIONALE: Adapts TOKEN T-02 to transferable subscription positions with attached accounting.
```

```text
PROPERTY_ID: SPEC-05
TYPE: SPECIFIC
ENGLISH: safeTransferFrom sends a live membership to an ERC721Receiver actor successfully, but transfer to a non-receiver contract reverts without changing ownership or membership state.
SOLIDITY_SKETCH: vm.prank(owner); target.safeTransferFrom(owner,actorReceiver,id); assert(target.ownerOf(id)==actorReceiver); snapshot(id); vm.prank(actorReceiver); assert(!rawSafeTransfer(actorReceiver,address(paymentToken),id)); assert(stateAfter==stateBefore);
GHOST_NEEDS: tier, tokenId, owner, receiver actor, non-receiver contract
SNAPSHOT_NEEDS: owner, balances, approval, time, expiration, referral and shares before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: ERC-721 safe-transfer receiver requirement; MembershipTier.safeTransferFrom:1368-1375 calls ERC721Utils.checkOnERC721Received, and test/fizz/Actor.sol implements the required selector
RATIONALE: Covers the token-standard receiver boundary without duplicating ordinary transfer properties.
```

```text
PROPERTY_ID: SPEC-06
TYPE: GLOBAL
ENGLISH: MembershipTier consistently advertises ERC-721, ERC-721 Enumerable, ERC-5643, ERC-4906, and IMembershipTier interface support.
SOLIDITY_SKETCH: assert(target.supportsInterface(0x80ac58cd)); assert(target.supportsInterface(0x780e9d63)); assert(target.supportsInterface(type(IERC5643).interfaceId)); assert(target.supportsInterface(0x49064906)); assert(target.supportsInterface(type(IMembershipTier).interfaceId));
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier.supportsInterface:980-990 explicitly returns true for IERC5643, ERC-4906 and IMembershipTier and delegates inherited ERC-721/Enumerable support
RATIONALE: Token integrations depend on stable interface discovery.
```

```text
PROPERTY_ID: SPEC-07
TYPE: SPECIFIC
ENGLISH: If isRenewable(tokenId) is true, the current owner has sufficient payment-token balance/allowance, referral selection is valid, and accounting is complete, renewSubscription for one period succeeds and extends expiration.
SOLIDITY_SKETCH: drainAccounting(target); if (target.isRenewable(id) && funded(owner)) { expiry=target.expiresAt(id); vm.prank(owner); target.renewSubscription(id,target.periodDuration()); assert(target.expiresAt(id)==expiry+target.periodDuration()); }
GHOST_NEEDS: tier, tokenId, owner
SNAPSHOT_NEEDS: isRenewable, accounting completeness, owner funds/allowance, expiration before and after
PRIORITY: HIGH
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred soundness expectation for the ERC-5643 isRenewable compatibility surface
RATIONALE: Adapts the max-operation liveness template to the subscription NFT's renewability predicate.
```

```text
PROPERTY_ID: SPEC-08
TYPE: GLOBAL
ENGLISH: Funding lots within each token generation are strictly positive-duration and chronologically non-overlapping: every next lot starts at or after the previous lot ends.
SOLIDITY_SKETCH: allocation = target.allocationState(id); for i in 0..allocation.lotCount-1 { lot=allocationLots(id,generation,i,1)[0]; assert(lot.start < lot.end); if (i>0) assert(lot.start >= previous.end); previous=lot; }
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none; sample adjacent lot offsets when queues become large
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: VestingLedger.append:805-808 requires nonzero duration and append:818 rejects start < previous.end
RATIONALE: Adapts QUEUE Q-01/Q-02 to the protocol's chronological per-membership funding queue.
```

```text
PROPERTY_ID: SPEC-09
TYPE: GLOBAL
ENGLISH: Each allocation queue cursor remains within its generation: lotCursor is never greater than lotCount, and a fully consumed queue has zero refundable gross and zero unearned allocation for that token.
SOLIDITY_SKETCH: a=target.allocationState(id); assert(a.lotCursor <= a.lotCount); if (a.lotCursor == a.lotCount) { assert(a.refundableGross == 0); assert(allZero(a.unearnedScaled)); }
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: VestingLedger._allocationSnapshot:159-177 derives cursor/count from the same generation and cancellation returns zero when account.head == queue.length at 1133-1135
RATIONALE: Adapts QUEUE Q-03 to funding-head consistency and closeability.
```

```text
PROPERTY_ID: SPEC-10
TYPE: GLOBAL
ENGLISH: Allocation-lot cancellation identity matches generation identity: lots from the current generation report canceled=false and lots from older generations report canceled=true.
SOLIDITY_SKETCH: current=target.allocationState(id).generation; lot=decode(target.allocationLots(id,generation,offset,1)); assert(lot.canceled == (generation != current));
GHOST_NEEDS: sampled tokenId, generation and offset
SNAPSHOT_NEEDS: current allocation generation and returned lot
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: VestingLedger.encodedLots:180-202 defines canceled exactly as generation != self.funding[tokenId].generation
RATIONALE: Gives indexers and refund tooling a stable queue-generation interpretation.
```

```text
PROPERTY_ID: SPEC-11
TYPE: GLOBAL
ENGLISH: A complete accounting status is synchronized with the current clock: accountedThrough equals the current timestamp and no next boundary is due at or before that timestamp.
SOLIDITY_SKETCH: s=target.accountingStatus(); if (s.complete) { assert(s.accountedThrough == block.timestamp); assert(s.nextBoundary == 0 || s.nextBoundary > block.timestamp); }
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier.accountingStatus:240-260 defines complete as accountedThrough == now and nextBoundary absent or later than now
RATIONALE: Adapts QUEUE processing completeness to the combined funding/expiration scheduler.
```

```text
PROPERTY_ID: SPEC-12
TYPE: SPECIFIC
ENGLISH: A successful bounded accounting call never reports more processed steps than requested, and complete=true means no funding or expiration boundary remains due.
SOLIDITY_SKETCH: r=target.processAccounting(maxSteps); assert(r.processedSteps <= maxSteps); if (r.complete) { s=target.accountingStatus(); assert(s.complete); assert(s.nextBoundary==0 || s.nextBoundary>block.timestamp); }
GHOST_NEEDS: selected tier, submitted maxSteps, returned MaintenanceResult
SNAPSHOT_NEEDS: AccountingStatus after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier._processAccounting:287-315 shares maxSteps across funding and expiration work and assigns result.complete from accountingStatus
RATIONALE: Adapts QUEUE Q-02/Q-03 to the externally reported bounded-maintenance contract.
```

```text
PROPERTY_ID: SPEC-13
TYPE: GLOBAL
ENGLISH: When accounting is complete, totalRewardShares equals the sum of sharesOf(tokenId) over all active, reward-eligible extant memberships.
SOLIDITY_SKETCH: if (target.accountingStatus().complete) { sum=0; for id in 1..totalMinted { if (target.rewardEligible(id)) sum += target.sharesOf(id); } assert(sum == target.totalRewardShares()); }
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none; bounded by fuzz-tier supply cap, with retired IDs skipped through isOccupied
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: VestingLedger._setWeight:955-972 updates eligible member weight and totalShares together; retireMember:983-1003 removes eligible weight; accounting completeness excludes expired-pending positions
RATIONALE: Adapts STAKING S-01 to permanent membership reward weights, conditional on lifecycle catch-up.
```
