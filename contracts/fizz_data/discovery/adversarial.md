```text
PROPERTY_ID: ADV-01
TYPE: SPECIFIC
ENGLISH: An attacker cannot successfully call factory-owner functions: bindProtocolToken, setPaymentTokenEnabled, setMinimumPayment, or transferOwnership.
SOLIDITY_SKETCH: vm.prank(attacker); (bool ok,) = address(factory).call(encodedAdminCall); assert(!ok); assert(factoryStateAfter == factoryStateBefore);
GHOST_NEEDS: selected unauthorized actor and admin-call selector
SNAPSHOT_NEEDS: owner, pendingOwner, protocolToken, selected token minimum/listed/enabled state
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/entry-points.md lists these functions as factory admin-only; source applies onlyOwner
RATIONALE: Detects direct protocol-policy privilege escalation.
```

```text
PROPERTY_ID: ADV-02
TYPE: SPECIFIC
ENGLISH: An attacker cannot successfully call tier-owner functions: setPresentation, withdrawCreatorProceeds, refund, grantMembership, addGrantTime, revokeGrantTime, setPaused, setSupplyCap, setMaxPrepaidPeriods, setTierMetadata, or transferOwnership.
SOLIDITY_SKETCH: vm.prank(attacker); (bool ok,) = address(tier).call(encodedOwnerCall); assert(!ok); assert(relevantStateAfter == relevantStateBefore);
GHOST_NEEDS: selected tier, unauthorized actor, admin-call selector, target token
SNAPSHOT_NEEDS: owner/pendingOwner, presentation hashes, creator proceeds, capacity/pause settings, token lifecycle state
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/entry-points.md Admin-Only table; MembershipTier applies onlyOwner to each listed function
RATIONALE: Detects creator-control takeover or unauthorized member retirement.
```

```text
PROPERTY_ID: ADV-03
TYPE: SPECIFIC
ENGLISH: An attacker cannot renew or claim a live membership owned by another account.
SOLIDITY_SKETCH: vm.prank(attacker); assert(!rawCall(renewMembership(otherToken,...))); assert(!rawCall(renewContributionMembership(otherToken,...))); assert(!rawCall(claimReward(otherToken,...)));
GHOST_NEEDS: attacker, victim, victim tokenId, tier
SNAPSHOT_NEEDS: victim token time, shares, referral, ownership, and claimable reward before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md G-8 and x-ray/entry-points.md Caller-Gated table; MembershipTier:616,663,721 enforce current owner
RATIONALE: Detects theft of access-time control or member rewards.
```

```text
PROPERTY_ID: ADV-04
TYPE: SPECIFIC
ENGLISH: An attacker cannot invoke claimRewardsFor directly and impersonate an arbitrary beneficiary.
SOLIDITY_SKETCH: vm.prank(attacker); (bool ok,) = address(tier).call(abi.encodeCall(tier.claimRewardsFor,(victim,ids,maxSteps))); assert(!ok);
GHOST_NEEDS: attacker, victim, selected token IDs, tier
SNAPSHOT_NEEDS: victim and attacker claimable balances before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md G-9; MembershipTier:785 requires msg.sender == factory
RATIONALE: Prevents bypass of the trusted aggregate-claim caller boundary.
```

```text
PROPERTY_ID: ADV-05
TYPE: SPECIFIC
ENGLISH: An attacker cannot transfer, renew, or extend a membership after it has expired.
SOLIDITY_SKETCH: warp(expiresAt(tokenId)); vm.prank(owner); assert(!rawCall(transferFrom(owner,to,tokenId))); assert(!rawCall(renewMembership(tokenId,...))); assert(!rawCall(addGrantTime(tokenId,owner,...)));
GHOST_NEEDS: tier, tokenId, owner, destination
SNAPSHOT_NEEDS: owner, expiration, time balances, shares, totalSupply, occupiedSupply
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md G-7; MembershipTier._requireLive:337-341 rejects currentTimestamp >= expiration
RATIONALE: Prevents resale or resurrection of an expired credential outside retirement/reactivation rules.
```

```text
PROPERTY_ID: ADV-06
TYPE: SPECIFIC
ENGLISH: An attacker cannot deploy two official tiers using the same creator and tier salt.
SOLIDITY_SKETCH: createTier(config); uint256 count = factory.tierCount(); vm.prank(creator); assert(!rawCall(createTier(config))); assert(factory.tierCount() == count);
GHOST_NEEDS: creator, salt, first tier address and identity
SNAPSHOT_NEEDS: tierCount, salt-used flag, identity mapping
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md I-11 and G-3; MembershipFactory:184-185 and 221-233
RATIONALE: Detects deterministic-address or official-identity replay.
```

```text
PROPERTY_ID: ADV-07
TYPE: SPECIFIC
ENGLISH: A creator cannot use the purchase pause to block accounting, member/referral/retired claims, protocol-fee release, or refund of an otherwise valid position.
SOLIDITY_SKETCH: creator.setPaused(true); assert(processAccounting(validSteps) succeeds); assert(validClaim succeeds); assert(releaseProtocolFees succeeds); assert(validOwnerRefund succeeds);
GHOST_NEEDS: tier, valid claimant/token, claim category, creator
SNAPSHOT_NEEDS: paused flag, accounting status, claimable category, token lifecycle state
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/x-ray.md describes pause as a tier purchase pause; _requireNotPaused is used by purchase/time-increase paths, not claims, maintenance, fee release, or refund
RATIONALE: Detects a creator-controlled exit freeze.
```

```text
PROPERTY_ID: ADV-08
TYPE: SPECIFIC
ENGLISH: An attacker cannot permanently stall a due accounting boundary: when a boundary is due and maxSteps is nonzero, a maintenance call must succeed and process at least one step.
SOLIDITY_SKETCH: if (status.nextBoundary != 0 && status.nextBoundary <= block.timestamp) { result = processAccounting(1); assert(result.processedSteps == 1); }
GHOST_NEEDS: selected tier
SNAPSHOT_NEEDS: AccountingStatus before and MaintenanceResult after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/x-ray.md states permissionless bounded maintenance moves chronological liabilities forward; MembershipTier._processAccounting:287-315 and VestingLedger._process:886-933
RATIONALE: Detects heap/schedule edge states that brick all later claims and refunds.
```

```text
PROPERTY_ID: ADV-09
TYPE: SPECIFIC
ENGLISH: Once accounting is complete and a beneficiary has a nonzero raw claim, an attacker-controlled call ordering cannot make that valid claim revert under the standard exact-transfer payment token.
SOLIDITY_SKETCH: drainAccounting(tier); if (claimable > 0) { vm.prank(beneficiary); assert(rawClaimCall(validSelection) succeeds); }
GHOST_NEEDS: tier, beneficiary, claim category, valid sorted token selection
SNAPSHOT_NEEDS: accounting completeness and category claimable amount before
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/x-ray.md Accounting and Claims flow documents beneficiary claim paths ending in exact ERC-20 payout; harness uses standard MockERC20 with persistent allowance/balance setup
RATIONALE: Detects claim liveness failures caused by prior transfers, retirements, or mixed accounting.
```

```text
PROPERTY_ID: ADV-10
TYPE: SPECIFIC
ENGLISH: An attacker cannot gain reward shares, reward eligibility, referral credit, or funding allocation from a zero-gross contribution membership.
SOLIDITY_SKETCH: createContributionMembership(0,address(0),steps); assert(sharesOf(newId) == 0); assert(!rewardEligible(newId)); assert(claimableReward(newId) == 0); assert(referralStatus(newId) == Unset); assert(allocationState(newId).lotCount == 0);
GHOST_NEEDS: newly created contribution tokenId and attacker
SNAPSHOT_NEEDS: new token shares, eligibility, reward, referral, and allocation state
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/x-ray.md explicitly states zero gross buys one period but issues no reward shares/funding; MembershipTier._contribute:1067-1080
RATIONALE: Detects free reward-weight or referral extraction through the intentional free-time edge.
```

```text
PROPERTY_ID: ADV-11
TYPE: SPECIFIC
ENGLISH: A gift payer cannot overwrite or select the recipient position's referral identity.
SOLIDITY_SKETCH: snapshot referral; vm.prank(gifter); giftRenewal(tokenId,owner,...expectedReferral...); assert(referralAfter == referralBefore); on gift creation assert(referralStatus(newId) == Unset);
GHOST_NEEDS: gifter, recipient, tokenId, prior referral status/referrer
SNAPSHOT_NEEDS: referral state before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier gift flows pass selfPayment=false; _purchaseFixed:1010 and 1014 validates/locks referral only for self-payment
RATIONALE: Prevents a third-party payer from redirecting future referral vesting.
```

```text
PROPERTY_ID: ADV-12
TYPE: GLOBAL
ENGLISH: An attacker cannot bypass supplyCap through repeated creates, gifts, grants, transfers, refunds, and re-creations.
SOLIDITY_SKETCH: assert(tier.supplyCap() == 0 || tier.occupiedSupply() <= tier.supplyCap());
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md I-2, G-10, and G-12; configuration and every occupancy increment are guarded
RATIONALE: Detects cumulative cap bypass across mixed creation paths.
```

```text
PROPERTY_ID: ADV-13
TYPE: SPECIFIC
ENGLISH: An attacker cannot exceed maxPrepaidPeriods by splitting paid renewal across many individually valid calls.
SOLIDITY_SKETCH: if (maxPrepaidPeriods != 0 && renewal succeeds) assert(timeBalances(tokenId).paidSeconds <= maxPrepaidPeriods * periodDuration);
GHOST_NEEDS: tier and renewed tokenId
SNAPSHOT_NEEDS: maxPrepaidPeriods, periodDuration, effective paidSeconds before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier._prepareTimeIncrease:1223-1228 checks cumulative state.paidSeconds + duration against the configured maximum
RATIONALE: Detects a repeated-call bypass of the prepaid-time limit.
```

```text
PROPERTY_ID: ADV-14
TYPE: GLOBAL
ENGLISH: An attacker cannot push cumulative accepted gross beyond uint112.max through repeated purchases, gifts, renewals, or full-balance contributions.
SOLIDITY_SKETCH: assert(tier.lifetimeGross() <= type(uint112).max);
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: x-ray/invariants.md I-1 and G-11/G-16; MembershipTier._validateGross and VestingLedger.append enforce the cumulative bound
RATIONALE: Detects cumulative type-bound bypass in reward-curve accounting.
```

```text
PROPERTY_ID: ADV-15
TYPE: SPECIFIC
ENGLISH: An attacker paying any positive accepted gross cannot receive zero newly issued reward shares.
SOLIDITY_SKETCH: quote = tier.previewShares(gross); if (gross > 0 && gross <= remainingCapacity) assert(quote.sharesAdded > 0); after successful self-payment assert(sharesAfter > sharesBefore);
GHOST_NEEDS: tier, tokenId, submitted gross
SNAPSHOT_NEEDS: shares before and after; preview quote
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: RewardCurve.cumulative is `gross + nonnegative boost term`; quote is the cumulative difference, so positive gross yields at least positive base issuance
RATIONALE: Detects first-payer or boundary-value loss of all membership reward weight.
```

```text
PROPERTY_ID: ADV-16
TYPE: SPECIFIC
ENGLISH: An attacker cannot use duplicate or unsorted token IDs to claim the same live reward more than once in a batch.
SOLIDITY_SKETCH: ids = [tokenId,tokenId] or descending IDs; vm.prank(owner); (bool ok,) = rawCall(claimRewards(ids,steps)); assert(!ok);
GHOST_NEEDS: owner, tier, duplicated/unsorted token IDs
SNAPSHOT_NEEDS: token claimable reward and beneficiary balance before and after
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier._validateClaimSelection:815-819 requires strictly increasing token IDs
RATIONALE: Detects duplicate-credit extraction from batch processing.
```

```text
PROPERTY_ID: ADV-17
TYPE: SPECIFIC
ENGLISH: An unsolicited ERC-20 donation to a tier cannot create membership shares, reward eligibility, referral identity, lifetime gross, or claim interest for the donor.
SOLIDITY_SKETCH: donateERC20(tier,amount); assert(lifetimeGrossAfter == lifetimeGrossBefore); assert(totalRewardSharesAfter == totalRewardSharesBefore); assert(hasClaimInterest(donor) == interestBefore);
GHOST_NEEDS: donor, tier, donation amount
SNAPSHOT_NEEDS: lifetimeGross, totalRewardShares, donor claim-interest and per-token state before and after
PRIORITY: MEDIUM
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred from payments entering ledger state only through _applyPayment/VestingLedger.append
RATIONALE: Detects extraction of untracked donated backing through membership claim paths.
```

```text
PROPERTY_ID: ADV-18
TYPE: SPECIFIC
ENGLISH: A full-balance contribution that satisfies minimum and remaining curve capacity cannot leave the payer with a newly created but zero-share position or corrupt future claim liveness.
SOLIDITY_SKETCH: assume(balance >= minimum && balance <= remainingCapacity); createContributionMembership(balance,referrer,steps); assert(sharesOf(newId) > 0); drainAccounting(); assert(valid claim call does not revert);
GHOST_NEEDS: payer, full pre-call balance, created tokenId, tier
SNAPSHOT_NEEDS: remaining curve capacity, created-token shares, accounting status
PRIORITY: HIGH
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred boundary/full-amount liveness expectation
RATIONALE: Exercises the existing full-balance handler against maximum available per-actor input.
```
