PROPERTY_ID: [CON-01]
TYPE: GLOBAL
ENGLISH: Every accepted payment unit is accounted for as refunded value, paid value, earned liability, unearned liability, cancellation residue, unassigned member funding, distribution dust, or index carry.
SOLIDITY_SKETCH: `p = tier.previewPaymentTotals(128); accounted = p.refunded * Q + p.unassignedMemberScaled + p.distributionDustScaled + p.indexCarryScaled; for i in 0..3: accounted += p.paidRaw[i] * Q + p.earnedScaled[i] + p.unearnedScaled[i] + p.cancellationScaled[i]; assert(accounted == p.grossReceived * Q);`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: Closed-form accounting identity implemented by VestingLedger.append, _credit, _debit, and cancelFunding; MembershipAccountingPreviewTest._assertConservation names the guarantee “every unit accounted for”; x-ray invariant E-1 states every accepted gross payment is allocated without exceeding gross.
RATIONALE: This is the master economic conservation equation and detects lost funding, duplicated liabilities, incorrect refunds, and payout bookkeeping drift.

PROPERTY_ID: [CON-02]
TYPE: GLOBAL
ENGLISH: Each tier’s payment-token balance equals its protected liabilities plus direct token donations recorded by the harness.
SOLIDITY_SKETCH: `assert(paymentToken.balanceOf(address(tier)) == tier.totalProtectedLiability() + ghosts.donated[address(tier)]);`
GHOST_NEEDS: `mapping(address tier => uint256 amount) donated`, incremented only after a successful direct donation handler transfer
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier._pullExact and _pushExact require exact endpoint balance deltas; VestingLedger.liabilityScaled includes every outstanding liability bucket; x-ray E-2 explicitly states that protected tier liabilities remain backed across payouts and fee release.
RATIONALE: Internal conservation alone cannot prove solvency; this property reconciles accounting with actual ERC-20 custody while allowing intentional surplus donations.

PROPERTY_ID: [CON-03]
TYPE: GLOBAL
ENGLISH: The tier-wide reward-share denominator equals the sum of permanent shares on every minted membership ID.
SOLIDITY_SKETCH: `sum = 0; for id in 1..tier.totalMinted(): sum += tier.sharesOf(id); assert(sum == tier.totalRewardShares());`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: VestingLedger._setWeight updates totalShares by exactly `next - previous`, and retireMember subtracts the retiring member’s shares before deleting it; x-ray I-5 records this exact delta-pair identity.
RATIONALE: A denominator inconsistent with member weights misallocates every subsequent reward and can create permanent overpayment or underpayment.

PROPERTY_ID: [CON-04]
TYPE: GLOBAL
ENGLISH: Cached occupied supply equals the ERC-721 enumerable supply for each tier.
SOLIDITY_SKETCH: `assert(uint256(tier.occupiedSupply()) == tier.totalSupply());`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier._prepareTimeIncrease increments occupiedSupply exactly when allocating a new token ID, while _retire decrements it and burns that same ERC-721; ERC721Enumerable.totalSupply counts the extant enumerable tokens.
RATIONALE: Capacity enforcement uses occupiedSupply, so divergence from actual extant memberships could permit over-cap minting or permanently block capacity.

PROPERTY_ID: [CON-05]
TYPE: GLOBAL
ENGLISH: The number of scheduled expirations equals the number of occupied memberships.
SOLIDITY_SKETCH: `status = tier.accountingStatus(); assert(status.scheduledExpirations == tier.occupiedSupply());`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: Every newly occupied membership calls _emitTimeUpdate, which inserts its expiration, and _retire removes the expiration before burning and decrementing occupiedSupply; the existing MembershipInvariant model asserts the same equality.
RATIONALE: Missing or duplicate expiration entries would leave memberships unretired or cause accounting to retire the wrong number of positions.

PROPERTY_ID: [CON-06]
TYPE: GLOBAL
ENGLISH: Permanent minted count equals extant supply plus the number of memberships retired during the fuzz campaign.
SOLIDITY_SKETCH: `assert(tier.totalMinted() == tier.totalSupply() + ghosts.retiredCount[address(tier)]); assert(tier.totalMinted() == ghosts.mintedCount[address(tier)]);`
GHOST_NEEDS: Per-tier `mintedCount` incremented after successful create/gift/grant calls that create a new ID, and `retiredCount` incremented from successful maintenance results plus successful refund or grant-revocation retirement
SNAPSHOT_NEEDS: Before/after totalMinted and totalSupply around handlers that may create or retire positions, to validate ghost updates
PRIORITY: MEDIUM
GUARANTEE: EXPLORATORY
EVIDENCE: none — inferred
RATIONALE: It checks that monotonic ID issuance, live ERC-721 supply, and burn accounting remain mutually consistent across all creation and retirement paths.

PROPERTY_ID: [CON-07]
TYPE: GLOBAL
ENGLISH: The factory tier array, tier count, registration mapping, and identity mapping describe the same unique set of official tiers.
SOLIDITY_SKETCH: `list = factory.tiers(0, factory.tierCount()); assert(list.length == factory.tierCount()); for each i: assert(factory.isRegisteredTier(list[i])); assert(factory.tierForIdentity(IMembershipTier(list[i]).tierIdentity()) == list[i]); for j < i: assert(list[j] != list[i]);`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipFactory is documented as the “official-tier registry”; createTier atomically pushes the tier and writes isRegisteredTier and tierForIdentity, with no removal path.
RATIONALE: Aggregate claims and vault fee admission trust the registration mapping, while discovery uses the array, so disagreement breaks a protocol security boundary.

PROPERTY_ID: [CON-08]
TYPE: GLOBAL
ENGLISH: The factory payment-token array, token count, and listed mapping describe the same unique set, and every enabled token belongs to that set.
SOLIDITY_SKETCH: `list = factory.paymentTokens(0, factory.paymentTokenCount()); assert(list.length == factory.paymentTokenCount()); for each i: assert(factory.isPaymentTokenListed(list[i])); assert(factory.minimumPayment(list[i]) > 0); if factory.isPaymentTokenEnabled(list[i]): assert(factory.isPaymentTokenListed(list[i])); for j < i: assert(list[j] != list[i]);`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: The constructor rejects duplicate tokens; setPaymentTokenEnabled appends only an unlisted token and sets its listed mapping in the same path; no token-removal path exists.
RATIONALE: Tier admission depends on enabled/listed status while callers enumerate the array, so drift could admit undiscoverable assets or misreport configuration.

PROPERTY_ID: [CON-09]
TYPE: SPECIFIC
ENGLISH: Every successful nonzero payment appends exactly one allocation lot whose four allocations sum exactly to that lot’s gross, and lifetime gross increases by that amount.
SOLIDITY_SKETCH: `after successful paid create/renew/gift: lot = tier.allocationLots(tokenId, generation, previousLotCount, 1)[0]; assert(lot.allocations[0] + lot.allocations[1] + lot.allocations[2] + lot.allocations[3] == lot.gross); assert(lot.gross == acceptedGross); assert(tier.lifetimeGross() - beforeLifetimeGross == acceptedGross);`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: Target tier, lifetimeGross, target token generation, and lotCount before the payment
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier._applyPayment defines creator allocation as `gross - member - referral - protocol`, making the four-way sum a closed-form identity; VestingLedger.append adds that same sum to totalGross.
RATIONALE: This localizes any master-conservation failure to payment splitting or lot insertion and catches category double-counting immediately.

PROPERTY_ID: [CON-10]
TYPE: SPECIFIC
ENGLISH: Releasing protocol fees decreases tier custody, increases vault custody, and increases protocol paidRaw by the same returned amount.
SOLIDITY_SKETCH: `amount = tier.releaseProtocolFees(); assert(beforeTierBalance - afterTierBalance == amount); assert(afterVaultBalance - beforeVaultBalance == amount); assert(afterTotals.paidRaw[3] - beforeTotals.paidRaw[3] == amount);`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: Tier balance, buyback-vault balance, and `previewPaymentTotals(...).paidRaw[3]` before and after the call
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: MembershipTier.releaseProtocolFees calls takeEarned for purpose 3, exact-pushes that amount, then records the same amount at the vault; x-ray X-3 states this exact cross-contract conservation rule.
RATIONALE: A mismatch creates unbacked buyback inventory, stranded protocol fees, or an incorrect decrease in tier liabilities.

PROPERTY_ID: [CON-11]
TYPE: GLOBAL
ENGLISH: Projected per-purpose earned liabilities equal the sum of the corresponding beneficiary credits over the harness’s closed beneficiary set.
SOLIDITY_SKETCH: `p = tier.previewPaymentTotals(BUDGET); if (!p.status.complete) return; use previewClaimRewards for every actor and all its owned IDs; assert(sum(position.creditScaled + retiredCreditScaled) == p.earnedScaled[1]); assert(sum(referralCreditScaled) == p.earnedScaled[2]); assert(creatorCreditScaled == p.earnedScaled[0]); assert(projectedProtocolCreditScaled == p.earnedScaled[3]);`
GHOST_NEEDS: A closed `knownBeneficiaries` set only if recipients or referrers are later allowed outside the existing actors array
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: PaymentTotals documents earned balances as beneficiary liabilities; VestingLedger distributes member earnings into member or retired credits, referral earnings into referrer accounts, and preserves creator/protocol earnings in their dedicated buckets.
RATIONALE: The master equation can still pass if value moves between a global bucket and individual accounts incorrectly; this per-beneficiary reconciliation detects phantom or missing claim rights.

PROPERTY_ID: [CON-12]
TYPE: SPECIFIC
ENGLISH: A successful refund increases cumulative refunded value and the recipient’s token balance, decreases tier custody by the same amount, and leaves permanent lifetime gross unchanged.
SOLIDITY_SKETCH: `refund = tier.refund(...); assert(afterTotals.refunded - beforeTotals.refunded == refund); assert(afterRecipientBalance - beforeRecipientBalance == refund); assert(beforeTierBalance - afterTierBalance == refund); assert(afterLifetimeGross == beforeLifetimeGross);`
GHOST_NEEDS: none
SNAPSHOT_NEEDS: Recipient and tier payment-token balances, PaymentTotals.refunded, and lifetimeGross before and after refund
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: IMembershipTier documents lifetimeGross as permanent cumulative gross including later-refunded payments; VestingLedger.cancelFunding increments refundedRaw without decrementing totalGross, and MembershipTier._refund exact-pushes the returned gross.
RATIONALE: Refund errors directly threaten both supporter funds and residual liability backing, especially where cancellation rounding residues are retained.
