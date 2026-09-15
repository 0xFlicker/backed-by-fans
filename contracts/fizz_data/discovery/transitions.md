```text
PROPERTY_ID: ST-01
TYPE: SPECIFIC
ENGLISH: Once a token's referral status leaves Unset, no successful renewal, gift renewal, transfer, claim, accounting, grant, or refund-related call may change its locked status or referrer while the token remains extant.
SOLIDITY_SKETCH: if (statusBefore != Unset && occupiedAfter) assert(statusAfter == statusBefore && referrerAfter == referrerBefore);
GHOST_NEEDS: selected tier and tokenId for the current handler
SNAPSHOT_NEEDS: referral status, referrer, occupied flag before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md I-3; MembershipTier._lockReferralChoice:1150-1160 only writes when status is Unset and has no reverse transition
RATIONALE: Referral identity determines all later referral allocation for the position.
```

```text
PROPERTY_ID: ST-02
TYPE: SPECIFIC
ENGLISH: A successful fixed-price createMembership creates exactly one occupied ERC-721 position for the caller and advances totalMinted, totalSupply, occupiedSupply, and the caller's balance by one.
SOLIDITY_SKETCH: assert(totalMintedAfter == totalMintedBefore + 1); assert(totalSupplyAfter == totalSupplyBefore + 1); assert(occupiedAfter == occupiedBefore + 1); assert(balanceAfter[actor] == balanceBefore[actor] + 1);
GHOST_NEEDS: created tokenId and actor
SNAPSHOT_NEEDS: fixed-tier totalMinted, totalSupply, occupiedSupply, actor balance
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/entry-points.md documents createMembership as pulling payment and minting a membership; MembershipTier._prepareTimeIncrease:1212-1217 increments totalMinted and occupiedSupply, and _purchaseFixed:1016 safe-mints on creation
RATIONALE: Detects phantom creation, missing minting, or count drift.
```

```text
PROPERTY_ID: ST-03
TYPE: SPECIFIC
ENGLISH: A successful zero-gross contribution creation creates one occupied position with exactly one period of paid time, zero reward shares, unchanged lifetime gross, and referral status Unset.
SOLIDITY_SKETCH: assert(totalMintedAfter == totalMintedBefore + 1); assert(totalSupplyAfter == totalSupplyBefore + 1); assert(occupiedAfter == occupiedBefore + 1); assert(paidSeconds(newId) == periodDuration); assert(sharesOf(newId) == 0); assert(lifetimeGrossAfter == lifetimeGrossBefore); assert(referralStatus(newId) == Unset);
GHOST_NEEDS: created contribution tokenId and submitted gross
SNAPSHOT_NEEDS: totalMinted, totalSupply, occupiedSupply, lifetimeGross before; new token time balances, shares, referral after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/x-ray.md Protocol-Type Concerns states that contribution mode permits zero gross to buy one period but explicitly issues no reward shares/funding; MembershipTier._contribute:1067-1080
RATIONALE: Zero-gross membership time is an intentional exceptional transition.
```

```text
PROPERTY_ID: ST-04
TYPE: SPECIFIC
ENGLISH: A successful renewal of an extant live position does not create or delete an entity and increases its expiration by exactly the purchased duration.
SOLIDITY_SKETCH: assert(totalMintedAfter == totalMintedBefore); assert(totalSupplyAfter == totalSupplyBefore); assert(occupiedSupplyAfter == occupiedSupplyBefore); assert(ownerAfter == ownerBefore); assert(expiresAfter == expiresBefore + duration);
GHOST_NEEDS: selected tier, tokenId, duration, owner
SNAPSHOT_NEEDS: totalMinted, totalSupply, occupiedSupply, owner, expiration before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: IERC5643 renewSubscription semantics plus MembershipTier._checkpointTime:1196-1205, _purchaseFixed:1008-1016, and _contribute:1066-1080; minting occurs only when tokenId was zero
RATIONALE: Renewal must extend the existing credential rather than duplicate or replace it.
```

```text
PROPERTY_ID: ST-05
TYPE: SPECIFIC
ENGLISH: A successful live-token transfer changes only ERC-721 ownership/enumeration; token time balances, expiration, referral choice, shares, lifetime gross, totalMinted, totalSupply, and occupiedSupply remain unchanged.
SOLIDITY_SKETCH: assert(ownerAfter == to); assert(balanceAfter[from] == balanceBefore[from] - 1); assert(balanceAfter[to] == balanceBefore[to] + 1); assert(timeAfter == timeBefore); assert(expiryAfter == expiryBefore); assert(referralAfter == referralBefore); assert(sharesAfter == sharesBefore); assert(globalCountsAfter == globalCountsBefore);
GHOST_NEEDS: tier, tokenId, from, to
SNAPSHOT_NEEDS: ownership balances, paid/grant/checkpoint, expiration, referral, shares, lifetimeGross, totalMinted, totalSupply, occupiedSupply
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier.sol:1357 explicitly states ownership movement never changes the position's accounting or catches up; _transferLive:1377-1380 only checks liveness then delegates ERC-721 transfer
RATIONALE: Transferability must not alter purchased access or accounting identity.
```

```text
PROPERTY_ID: ST-06
TYPE: SPECIFIC
ENGLISH: A successful refund or creator cancellation retires exactly the selected position: totalMinted is unchanged, totalSupply and occupiedSupply decrease by one, the previous owner's balance decreases by one, isOccupied becomes false, and shares become zero.
SOLIDITY_SKETCH: assert(totalMintedAfter == totalMintedBefore); assert(totalSupplyAfter + 1 == totalSupplyBefore); assert(occupiedAfter + 1 == occupiedBefore); assert(balanceAfter[owner] + 1 == balanceBefore[owner]); assert(!isOccupied(tokenId)); assert(sharesOf(tokenId) == 0);
GHOST_NEEDS: tier, tokenId, expected owner
SNAPSHOT_NEEDS: totalMinted, totalSupply, occupiedSupply, owner balance before and after; token occupied/shares after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/x-ray.md describes refund as canceling unearned funding and retiring the token; MembershipTier._refund:1020-1048 calls _retire, and _retire:325-334 decrements occupancy, deletes state, removes schedules, and burns
RATIONALE: Prevents refunded credentials or reward weight from remaining live.
```

```text
PROPERTY_ID: ST-07
TYPE: SPECIFIC
ENGLISH: A successful grantMembership creates exactly one occupied token with grant time equal to periods times periodDuration, zero paid time, and zero reward shares.
SOLIDITY_SKETCH: assert(totalMintedAfter == totalMintedBefore + 1); assert(totalSupplyAfter == totalSupplyBefore + 1); assert(occupiedAfter == occupiedBefore + 1); assert(paidSeconds(newId) == 0); assert(grantSeconds(newId) == periods * periodDuration); assert(sharesOf(newId) == 0);
GHOST_NEEDS: granted tokenId, recipient, periods, tier
SNAPSHOT_NEEDS: entity counts and recipient balance before; new token time balances and shares after
PRIORITY: MEDIUM
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred from MembershipTier.grantMembership:871-885
RATIONALE: Grant-only credentials must not silently acquire paid-time reward weight.
```

```text
PROPERTY_ID: ST-08
TYPE: SPECIFIC
ENGLISH: Successful revokeGrantTime clears all remaining grant time; if paid time remains the same position stays occupied, otherwise the position is retired and burned.
SOLIDITY_SKETCH: if (paidBefore > 0) { assert(grantAfter == 0); assert(occupiedAfter); assert(totalSupplyAfter == totalSupplyBefore); } else { assert(!isOccupied(tokenId)); assert(totalSupplyAfter + 1 == totalSupplyBefore); assert(occupiedSupplyAfter + 1 == occupiedSupplyBefore); }
GHOST_NEEDS: tier, tokenId, expected owner
SNAPSHOT_NEEDS: effective paid/grant time before; occupied, totalSupply, occupiedSupply, owner balance before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier.revokeGrantTime:903-921 sets grantSeconds to zero and explicitly retires when paidSeconds is zero
RATIONALE: This is the principal branch in the grant-revocation state machine.
```

```text
PROPERTY_ID: ST-09
TYPE: SPECIFIC
ENGLISH: A successful factory createTier registers exactly one new deterministic tier: tierCount increases by one, the returned tier is registered, its identity maps back to it, and its salt is marked used.
SOLIDITY_SKETCH: assert(tierCountAfter == tierCountBefore + 1); assert(isRegisteredTier(newTier)); assert(tierForIdentity(identity) == newTier); assert(isTierSaltUsed(creator, salt));
GHOST_NEEDS: returned tier address, creator, salt, derived identity
SNAPSHOT_NEEDS: factory tierCount before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md I-11; MembershipFactory.createTier:220-235 writes salt usage, tier array, registration, and identity mapping together
RATIONALE: Detects registry/clone identity divergence.
```

```text
PROPERTY_ID: ST-10
TYPE: SPECIFIC
ENGLISH: A successful processAccounting or processExpirations call never moves the cursor backward, processes no more than maxSteps boundaries, and decreases totalSupply and occupiedSupply by exactly returned retiredCount.
SOLIDITY_SKETCH: assert(accountedAfter >= accountedBefore); assert(result.processedSteps <= maxSteps); assert(totalSupplyAfter + result.retiredCount == totalSupplyBefore); assert(occupiedAfter + result.retiredCount == occupiedBefore);
GHOST_NEEDS: returned MaintenanceResult and selected tier
SNAPSHOT_NEEDS: accountedThrough, totalSupply, occupiedSupply before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/x-ray.md documents bounded chronological accounting; MembershipTier._processAccounting:287-315 increments retiredCount only with _retire, while _retire:325-334 burns and decrements occupancy
RATIONALE: Couples keeper results to actual lifecycle transitions.
```

```text
PROPERTY_ID: ST-11
TYPE: SPECIFIC
ENGLISH: Enabling an unlisted payment token after setting a nonzero minimum appends it exactly once and marks it listed and enabled; disabling it preserves listing/count and only clears enabled status.
SOLIDITY_SKETCH: if (!listedBefore && enabledArg) { assert(countAfter == countBefore + 1); assert(listedAfter && enabledAfter); } else { assert(countAfter == countBefore); assert(listedAfter == listedBefore); assert(enabledAfter == enabledArg || enabledAfter == enabledBefore); }
GHOST_NEEDS: token and requested enabled value
SNAPSHOT_NEEDS: paymentTokenCount, listed, enabled, minimum before and after
PRIORITY: MEDIUM
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred from MembershipFactory.setPaymentTokenEnabled:332-353
RATIONALE: Prevents duplicate registry entries and listed/enabled flag drift.
```

```text
PROPERTY_ID: VT-01
TYPE: GLOBAL
ENGLISH: Each tier's lifetimeGross is monotonic; refunds, claims, transfers, grants, and accounting never decrease or rewind it.
SOLIDITY_SKETCH: assert(fixedTier.lifetimeGross() >= ghosts.lastFixedLifetimeGross); assert(contributionTier.lifetimeGross() >= ghosts.lastContributionLifetimeGross);
GHOST_NEEDS: last observed lifetimeGross for fixed and contribution tiers, updated after every handler
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: RewardCurve.sol NatSpec states refunds never rewind the cursor or recover capacity; x-ray/invariants.md I-1 identifies totalGross as the cumulative accepted-payment cursor
RATIONALE: Rewinding the curve would allow later payments to reclaim early-support weight.
```

```text
PROPERTY_ID: VT-02
TYPE: GLOBAL
ENGLISH: totalMinted is monotonic for every tier and increases only when a new membership or grant token is created.
SOLIDITY_SKETCH: assert(totalMintedNow >= ghosts.lastTotalMinted); if (totalMintedNow > ghosts.lastTotalMinted) assert(ghosts.lastActionWasCreateOrGrant);
GHOST_NEEDS: last totalMinted per tier and last successful action category
SNAPSHOT_NEEDS: none
PRIORITY: MEDIUM
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred from the sole increment at MembershipTier._prepareTimeIncrease:1212-1217 and absence of a decrement
RATIONALE: Token IDs must never be reused after retirement.
```

```text
PROPERTY_ID: VT-03
TYPE: GLOBAL
ENGLISH: accountingStatus().accountedThrough is monotonic for each tier across every handler call.
SOLIDITY_SKETCH: assert(fixedCursorNow >= ghosts.lastFixedCursor); assert(contributionCursorNow >= ghosts.lastContributionCursor);
GHOST_NEEDS: last accountedThrough for each tier, updated after every handler
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md I-4; VestingLedger rejects through < accountedThrough at lines 369-371 and 890-892, and _integrate only assigns the later through value
RATIONALE: Cursor reversal would double-account or erase already vested time.
```

```text
PROPERTY_ID: VT-04
TYPE: SPECIFIC
ENGLISH: For a token that remains extant, sharesOf(tokenId) never decreases; positive-gross self-payment may increase it, while zero-gross renewal, transfer, claims, grants, and maintenance leave it unchanged.
SOLIDITY_SKETCH: if (occupiedAfter) assert(sharesAfter >= sharesBefore); if (!positiveGrossPayment) assert(sharesAfter == sharesBefore);
GHOST_NEEDS: tier, tokenId, action category, submitted gross
SNAPSHOT_NEEDS: shares and occupied flag before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md G-17; VestingLedger._setWeight:960 explicitly reverts when shares < member.shares
RATIONALE: Permanent early-support weight must not shrink before retirement.
```

```text
PROPERTY_ID: VT-05
TYPE: GLOBAL
ENGLISH: Factory tierCount and paymentTokenCount never decrease.
SOLIDITY_SKETCH: assert(factory.tierCount() >= ghosts.lastTierCount); assert(factory.paymentTokenCount() >= ghosts.lastPaymentTokenCount);
GHOST_NEEDS: last observed tierCount and paymentTokenCount
SNAPSHOT_NEEDS: none
PRIORITY: MEDIUM
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred from append-only arrays in MembershipFactory
RATIONALE: Both registries retain historical identity even when token enablement changes.
```

```text
PROPERTY_ID: VT-06
TYPE: GLOBAL
ENGLISH: rewardPerShare never decreases for either tier.
SOLIDITY_SKETCH: assert(fixedTier.rewardPerShare() >= ghosts.lastFixedRewardPerShare); assert(contributionTier.rewardPerShare() >= ghosts.lastContributionRewardPerShare);
GHOST_NEEDS: last rewardPerShare for each tier
SNAPSHOT_NEEDS: none
PRIORITY: MEDIUM
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred from VestingLedger._distribute:1190-1195, the only write site, which adds a nonnegative quotient
RATIONALE: A decreasing reward index would invalidate settled member-credit checkpoints.
```

```text
PROPERTY_ID: VS-01
TYPE: GLOBAL
ENGLISH: For each tier, ERC-721 totalSupply always equals occupiedSupply.
SOLIDITY_SKETCH: assert(target.totalSupply() == target.occupiedSupply());
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: Exact paired identity: MembershipTier._prepareTimeIncrease:1212-1217 increments occupiedSupply only for a token later minted; _retire:325-334 decrements occupiedSupply and burns that same token; no other mint/burn path exists
RATIONALE: Detects phantom occupancy or ERC-721 supply drift.
```

```text
PROPERTY_ID: VS-02
TYPE: GLOBAL
ENGLISH: Every occupied position has exactly one scheduled expiration, so accountingStatus().scheduledExpirations equals occupiedSupply.
SOLIDITY_SKETCH: assert(target.accountingStatus().scheduledExpirations == target.occupiedSupply());
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: ExpirationSchedule NatSpec states one indexed expiration per extant membership; MembershipTier._emitTimeUpdate:1234-1241 sets it and _retire:325-334 removes it
RATIONALE: Missing or duplicate expiration entries would break retirement completeness.
```

```text
PROPERTY_ID: VS-03
TYPE: GLOBAL
ENGLISH: A known token is occupied if and only if it currently has an ERC-721 owner; active tokens are therefore always occupied and owned.
SOLIDITY_SKETCH: (bool owned,) = address(target).staticcall(ownerOf(tokenId)); assert(target.isOccupied(tokenId) == owned); if (target.isActiveToken(tokenId)) assert(owned && target.isOccupied(tokenId));
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none; bounded iteration over token IDs 1..totalMinted or sampled IDs
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: Exact mint/retire write pairing in MembershipTier._prepareTimeIncrease:1212-1217, _purchaseFixed:1016, _contribute:1080, grantMembership:884, and _retire:325-334
RATIONALE: Synchronizes derived lifecycle, occupancy, and ERC-721 existence.
```

```text
PROPERTY_ID: VS-04
TYPE: GLOBAL
ENGLISH: A nonzero supplyCap is never below occupiedSupply.
SOLIDITY_SKETCH: assert(target.supplyCap() == 0 || target.occupiedSupply() <= target.supplyCap());
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md I-2; MembershipTier.setSupplyCap:931-938 rejects a cap below occupancy and _requireCapacity:1295-1298 guards increments
RATIONALE: Capacity configuration must remain synchronized with extant occupancy.
```

```text
PROPERTY_ID: VS-05
TYPE: GLOBAL
ENGLISH: rewardEligible(tokenId) implies the token is active, occupied, owned, and has nonzero shares.
SOLIDITY_SKETCH: if (target.rewardEligible(id)) { assert(target.isActiveToken(id)); assert(target.isOccupied(id)); assert(ownerOfSucceeds(id)); assert(target.sharesOf(id) > 0); }
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none; sampled known tokenId
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier.rewardEligible:216-218 is `_isActiveToken(tokenId) && member.eligible`; positive payment issues positive RewardCurve shares before eligibility, while retirement deletes both membership and ledger member state
RATIONALE: Prevents reward denominator weight from being attached to a dead or zero-weight position.
```
