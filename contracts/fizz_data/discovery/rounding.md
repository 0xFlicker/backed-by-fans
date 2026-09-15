PROPERTY_ID: RT-01
TYPE: SPECIFIC
ENGLISH: A self-paid membership purchase or renewal followed by an immediate creator refund must not increase the owner’s payment-token wealth, counting any refundable value already attached to a renewed token.
SOLIDITY_SKETCH:
```solidity
uint256 refundableBefore = renewing ? tier.previewRefund(tokenId).grossRefund : 0;
uint256 walletBefore = paymentToken.balanceOf(actor);

if (contribution) {
    tokenId = renewing
        ? renewContributionMembership(tokenId, gross, referrer, steps)
        : createContributionMembership(gross, referrer, steps);
} else {
    tokenId = renewing
        ? renewMembership(tokenId, periods, referrer, steps)
        : createMembership(periods, referrer, steps);
}

vm.prank(creator);
tier.refund(tokenId, actor, type(uint256).max, steps);

lte(
    paymentToken.balanceOf(actor),
    walletBefore + refundableBefore,
    "purchase/refund round trip created payment-token profit"
);
```
GHOST_NEEDS: `lastRoundTripInputGross`, `lastRoundTripRefund`, `lastRoundTripTokenId`
SNAPSHOT_NEEDS: `actorPaymentBalance`, `tokenRefundableGross`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: Closed-form identity: purchase subtracts exact `gross`; cancellation returns only unearned gross, with an active lot prorated as `floor(gross * remaining / duration) <= gross` in `VestingLedger._cancellation`; exact endpoint deltas are enforced by `_pullExact` and `_pushExact`. X-ray I-12 and E-2 identify those exact-transfer and protected-liability guarantees.
RATIONALE: This directly detects refund rounding, funding-prefix, or exact-transfer errors that let an owner extract more raw payment tokens than the position contained.

PROPERTY_ID: RT-02
TYPE: SPECIFIC
ENGLISH: A gifted membership followed by an immediate refund must not increase the combined payment-token balance of payer and recipient; the refund belongs to the recipient, not the payer.
SOLIDITY_SKETCH:
```solidity
address recipient = toActorNotCurrent(entropy);
uint256 combinedBefore =
    paymentToken.balanceOf(actor) + paymentToken.balanceOf(recipient);

vm.prank(actor);
uint256 tokenId = fixedTier.giftMembership(recipient, periods, steps);

vm.prank(creator);
fixedTier.refund(tokenId, recipient, type(uint256).max, steps);

lte(
    paymentToken.balanceOf(actor) + paymentToken.balanceOf(recipient),
    combinedBefore,
    "gift/refund round trip created aggregate profit"
);
```
GHOST_NEEDS: `lastGiftGross`, `lastGiftRecipient`, `lastGiftRefund`
SNAPSHOT_NEEDS: `actorPaymentBalance`, `counterpartyPaymentBalance`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: Closed accounting identity from exact pull plus `floor(remaining funding) <= paid gross`; `previewRefund.recipient` and `_refund(expectedOwner, ...)` bind the payout to the current NFT owner.
RATIONALE: A payer-only balance check is invalid for gifts. Aggregating payer and recipient catches real value creation without flagging the intended beneficiary transfer.

PROPERTY_ID: RT-03
TYPE: SPECIFIC
ENGLISH: Repeating bounded purchase-then-refund cycles must never increase the actor’s payment-token balance.
SOLIDITY_SKETCH:
```solidity
uint256 balanceBefore = paymentToken.balanceOf(actor);
uint256 cycles = 1 + seed % MAX_CYCLES;

for (uint256 i; i < cycles; ++i) {
    uint256 tokenId;
    vm.startPrank(actor);
    if (contribution) {
        tokenId = contributionTier.createContributionMembership(gross, referrer, steps);
    } else {
        tokenId = fixedTier.createMembership(periods, referrer, steps);
    }
    vm.stopPrank();

    vm.prank(creator);
    _tier(contribution).refund(tokenId, actor, type(uint256).max, steps);
}

lte(
    paymentToken.balanceOf(actor),
    balanceBefore,
    "repeated membership/refund cycles extracted rounding dust"
);
```
GHOST_NEEDS: `roundTripCycleCount`, `roundTripTotalGross`, `roundTripTotalRefunded`
SNAPSHOT_NEEDS: `actorPaymentBalance`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: For every cycle, `refund = floor(unearned gross) <= exact gross pulled`; summing the inequality over N cycles gives total refunds no greater than total payments.
RATIONALE: Repetition amplifies one-unit directional-rounding defects that a single cycle may not expose.

PROPERTY_ID: RT-04
TYPE: SPECIFIC
ENGLISH: Granting membership time and immediately revoking it must return exactly the granted seconds and must not move payment tokens.
SOLIDITY_SKETCH:
```solidity
uint256 balanceBefore = paymentToken.balanceOf(recipient);
uint64 expectedSeconds = periods * tier.periodDuration();

vm.prank(creator);
uint256 tokenId = tier.grantMembership(recipient, periods, steps);
vm.prank(creator);
uint64 revoked = tier.revokeGrantTime(tokenId, recipient, steps);

eq(revoked, expectedSeconds, "grant/revoke lost or created seconds");
eq(
    paymentToken.balanceOf(recipient),
    balanceBefore,
    "grant/revoke moved payment tokens"
);
```
GHOST_NEEDS: `lastGrantedSeconds`, `lastRevokedSeconds`
SNAPSHOT_NEEDS: `counterpartyPaymentBalance`
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: `_durationForPeriods` computes the exact checked product `periods * periodDuration`; `grantMembership` adds that value to `grantSeconds`, while `revokeGrantTime` returns the stored value and clears it. Neither path transfers payment tokens.
RATIONALE: This checks the only explicit inverse for creator-granted access and catches seconds conversion or mixed paid/grant accounting errors.

PROPERTY_ID: RT-05
TYPE: SPECIFIC
ENGLISH: Transferring a live membership from A to B and back to A must leave all economic position state unchanged.
SOLIDITY_SKETCH:
```solidity
bytes32 beforeHash = keccak256(abi.encode(
    tier.sharesOf(tokenId),
    tier.timeBalances(tokenId),
    tier.expiresAt(tokenId),
    tier.referralOf(tokenId),
    tier.allocationState(tokenId)
));
uint256 combinedBalanceBefore =
    paymentToken.balanceOf(a) + paymentToken.balanceOf(b);

vm.prank(a);
tier.transferFrom(a, b, tokenId);
vm.prank(b);
tier.transferFrom(b, a, tokenId);

eq(keccak256(abi.encode(
    tier.sharesOf(tokenId),
    tier.timeBalances(tokenId),
    tier.expiresAt(tokenId),
    tier.referralOf(tokenId),
    tier.allocationState(tokenId)
)), beforeHash, "transfer round trip changed accounting");
eq(
    paymentToken.balanceOf(a) + paymentToken.balanceOf(b),
    combinedBalanceBefore,
    "transfer round trip moved payment tokens"
);
```
GHOST_NEEDS: `transferRoundTripStateHash`
SNAPSHOT_NEEDS: `actorPaymentBalance`, `counterpartyPaymentBalance`, `positionEconomicStateHash`
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: `MembershipTier.transferFrom` explicitly states, “Ownership movement never changes the position's accounting or catches up.”
RATIONALE: It detects accidental accounting mutation through ERC-721 transfer hooks while excluding intentionally cleared token approvals.

PROPERTY_ID: RD-01
TYPE: SPECIFIC
ENGLISH: `previewShares(gross)` must exactly equal the shares issued by the next payment at the same lifetime-gross cursor.
SOLIDITY_SKETCH:
```solidity
MembershipTypes.ShareQuote memory quote = tier.previewShares(gross);
uint256 sharesBefore = existingToken ? tier.sharesOf(tokenId) : 0;

tokenId = executePayment(tier, tokenId, gross, periods, referralChoice, steps);

eq(tier.sharesOf(tokenId) - sharesBefore, quote.sharesAdded, "share preview mismatch");
eq(tier.lifetimeGross(), quote.grossAfter, "share preview cursor mismatch");
eq(quote.grossAfter, quote.grossBefore + gross, "invalid quoted gross interval");
```
GHOST_NEEDS: `quotedGrossBefore`, `quotedGrossAfter`, `quotedShares`, `issuedShares`
SNAPSHOT_NEEDS: `tokenShares`, `lifetimeGross`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: `ShareQuote` is documented as “Exact issuance for one observed cursor”; both `previewShares` and `VestingLedger.issueShares` call the same `RewardCurve.quote(cursor,gross,boost,horizon)` identity.
RATIONALE: A mismatch lets callers receive a different permanent reward weight from the publicly quoted conversion.

PROPERTY_ID: RD-02
TYPE: SPECIFIC
ENGLISH: Share conversion must map zero gross to zero shares and be monotonic for increasing gross at one fixed cursor.
SOLIDITY_SKETCH:
```solidity
uint256 remaining = tier.MAX_LIFETIME_GROSS() - tier.lifetimeGross();
uint256 small = clampBetween(x, 0, remaining);
uint256 large = clampBetween(y, small, remaining);

MembershipTypes.ShareQuote memory zero = tier.previewShares(0);
MembershipTypes.ShareQuote memory qSmall = tier.previewShares(small);
MembershipTypes.ShareQuote memory qLarge = tier.previewShares(large);

eq(zero.sharesAdded, 0, "zero gross produced shares");
eq(zero.grossBefore, zero.grossAfter, "zero gross moved cursor");
gte(qLarge.sharesAdded, qSmall.sharesAdded, "share quote is non-monotonic");
```
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: Closed-form identity `quote(cursor,g) = cumulative(cursor+g)-cumulative(cursor)`; `quote(cursor,0)=0`, and the cumulative curve is nondecreasing over its validated 1x–10x domain.
RATIONALE: Zero-share creation or non-monotonic quotes would allow payment splitting/order to produce nonsensical conversion results.

PROPERTY_ID: RD-03
TYPE: SPECIFIC
ENGLISH: Every funded lot must allocate exactly its gross amount; protocol, member-reward, and active-referral slices must be floor-rounded BPS conversions, with the creator receiving the residual.
SOLIDITY_SKETCH:
```solidity
MembershipTypes.AllocationLot memory lot = newestLot(tokenId);
uint256 p = lot.allocations[3];
uint256 m = lot.allocations[1];
uint256 r = lot.allocations[2];
uint256 c = lot.allocations[0];

eq(c + m + r + p, lot.gross, "allocation does not sum to gross");

assertFloorBps(p, lot.gross, tier.protocolFeeBps());
assertFloorBps(m, lot.gross, tier.rewardBps());
if (lot.referrer == address(0)) {
    eq(r, 0, "referral paid without referrer");
} else {
    assertFloorBps(r, lot.gross, tier.referralBps());
}
eq(c, lot.gross - p - m - r, "creator did not receive residual");

function assertFloorBps(uint256 a, uint256 gross, uint256 bps) {
    lte(a * 10_000, gross * bps, "BPS allocation rounded up");
    lt(gross * bps - a * 10_000, 10_000, "BPS floor remainder too large");
}
```
GHOST_NEEDS: `lastPaidTokenId`, `lastPaymentGross`, `lastLotIndex`
SNAPSHOT_NEEDS: `allocationLotCount`
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: `_applyPayment` explicitly computes three `gross * bps / 10_000` floors and defines creator allocation as the exact remainder; its source comment states the floored slices cannot exceed gross.
RATIONALE: This tests the protocol’s actual rounding policy rather than incorrectly assuming every slice rounds in the protocol’s favor.

PROPERTY_ID: RD-04
TYPE: SPECIFIC
ENGLISH: ERC-5643 duration conversion must be exact: renewing by `periods * periodDuration` adds exactly that many seconds and charges exactly `periods * pricePerPeriod` in fixed-price tiers.
SOLIDITY_SKETCH:
```solidity
uint64 duration = periods * tier.periodDuration();
uint64 expirationBefore = tier.expiresAt(tokenId);
uint256 balanceBefore = paymentToken.balanceOf(actor);
uint256 gross = tier.pricePerPeriod() == 0 ? 0 : periods * tier.pricePerPeriod();
MembershipTypes.ShareQuote memory shares = tier.previewShares(gross);
uint256 sharesBefore = tier.sharesOf(tokenId);

vm.prank(actor);
tier.renewSubscription(tokenId, duration);

eq(tier.expiresAt(tokenId), expirationBefore + duration, "duration conversion lost seconds");
eq(balanceBefore - paymentToken.balanceOf(actor), gross, "duration conversion mispriced renewal");
eq(tier.sharesOf(tokenId) - sharesBefore, shares.sharesAdded, "renewal shares mismatch");
```
GHOST_NEEDS: `lastRenewDuration`, `lastRenewPeriods`, `lastRenewGross`
SNAPSHOT_NEEDS: `actorPaymentBalance`, `tokenExpiration`, `tokenShares`
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: `_renewSubscription` rejects zero and non-divisible durations, then uses exact integer `duration / periodDuration`; `_durationForPeriods` uses the inverse checked multiplication.
RATIONALE: The divisibility guard should eliminate duration/payment rounding entirely.

PROPERTY_ID: RD-05
TYPE: SPECIFIC
ENGLISH: A reliable refund preview (`complete || projected`) must equal the actual refund and its funded scaled amount must equal `grossRefund * ACCOUNTING_SCALE`.
SOLIDITY_SKETCH:
```solidity
MembershipTypes.RefundPreview memory quote = tier.previewRefund(tokenId);
if (!(quote.complete || quote.projected)) return;

uint256 funded;
for (uint256 i; i < 4; ++i) funded += quote.fundingScaled[i];
eq(funded, quote.grossRefund * tier.ACCOUNTING_SCALE(), "refund funding conversion mismatch");

uint256 recipientBefore = paymentToken.balanceOf(quote.recipient);
vm.prank(creator);
uint256 actual = tier.refund(tokenId, quote.recipient, quote.grossRefund, steps);

eq(actual, quote.grossRefund, "refund preview did not equal actual");
eq(
    paymentToken.balanceOf(quote.recipient) - recipientBefore,
    quote.grossRefund,
    "refund payout did not equal preview"
);
```
GHOST_NEEDS: `previewedRefund`, `actualRefund`, `previewRefundRecipient`, `previewRefundReliable`
SNAPSHOT_NEEDS: `counterpartyPaymentBalance`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: `encodedRefund` says it projects “just this refund” when no intervening boundary exists; preview and mutation both call `_cancellation` at the same accounting timestamp. `_cancellation` enforces that funded scaled units cover exactly `gross * SCALE`.
RATIONALE: This validates both the user-facing slippage ceiling and the raw-to-scaled cancellation conversion.

PROPERTY_ID: RD-06
TYPE: SPECIFIC
ENGLISH: `previewAccounting` with a given work budget must exactly predict the next `processAccounting` result and the post-process settled balances.
SOLIDITY_SKETCH:
```solidity
MembershipTypes.AccountingPreview memory preview =
    tier.previewAccounting(tokenId, beneficiary, referrer, budget);

MembershipTypes.MaintenanceResult memory actual = tier.processAccounting(budget);
MembershipTypes.AccountingPreview memory settled =
    tier.previewAccounting(tokenId, beneficiary, referrer, 0);

eq(actual.processedSteps, preview.processedSteps, "preview work mismatch");
eq(actual.accountedThrough, preview.current.status.accountedThrough, "preview cursor mismatch");
eq(actual.complete, preview.current.status.complete, "preview completion mismatch");
eq(
    keccak256(abi.encode(tier.accountingStatus())),
    keccak256(abi.encode(preview.current.status)),
    "preview status mismatch"
);
eq(preview.current.member, settled.settled.member, "preview member raw mismatch");
eq(
    preview.current.fractionalScaled[1],
    settled.settled.fractionalScaled[1],
    "preview member fraction mismatch"
);
eq(preview.current.referral, settled.settled.referral, "preview referral mismatch");
eq(preview.current.creator, settled.settled.creator, "preview creator mismatch");
eq(preview.current.protocol, settled.settled.protocol, "preview protocol mismatch");
```
GHOST_NEEDS: `accountingPreviewHash`, `previewProcessedSteps`, `previewAccountedThrough`, `previewComplete`
SNAPSHOT_NEEDS: `accountingStatusHash`, `memberCreditRaw`, `memberCreditFraction`, `referralCreditRaw`, `creatorCreditRaw`, `protocolCreditRaw`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: `IMembershipTier.previewAccounting` explicitly promises to “Project balances without writes” using at most the caller-supplied checkpoint budget; preview and mutation use the same chronological funding/expiration rules.
RATIONALE: Preview drift can cause claims or refunds to be submitted with incorrect bounds even when accounting itself is correct.

PROPERTY_ID: RD-07
TYPE: SPECIFIC
ENGLISH: `previewPaymentTotals(budget)` must exactly predict the tier-wide totals obtained after processing the same budget.
SOLIDITY_SKETCH:
```solidity
MembershipTypes.PaymentTotals memory projected = tier.previewPaymentTotals(budget);
tier.processAccounting(budget);
MembershipTypes.PaymentTotals memory settled = tier.previewPaymentTotals(0);

uint256 projectedSteps = projected.processedSteps;
projected.processedSteps = 0;

eq(projectedSteps, actualResult.processedSteps, "payment preview work mismatch");
eq(
    keccak256(abi.encode(projected)),
    keccak256(abi.encode(settled)),
    "payment totals preview mismatch"
);
```
GHOST_NEEDS: `paymentTotalsPreviewHash`, `paymentTotalsPreviewSteps`
SNAPSHOT_NEEDS: `paymentTotalsHash`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: `IMembershipTier.previewPaymentTotals` promises a projection of tier-wide payments, payouts, and funding through now; `encodedPaymentTotals` runs the same bounded preview advance used to model the write path.
RATIONALE: This checks every raw/scaled payment category and rounding reserve in one equivalence property.

PROPERTY_ID: RD-08
TYPE: SPECIFIC
ENGLISH: A complete `previewClaimRewards` must exactly predict each raw claim category; every scaled credit is floor-converted to raw units and its fractional remainder remains stored.
SOLIDITY_SKETCH:
```solidity
MembershipTypes.ClaimPreview memory preview =
    tier.previewClaimRewards(beneficiary, ids, budget);
if (!preview.complete) return;

uint256 expectedLive;
for (uint256 i; i < preview.positions.length; ++i) {
    expectedLive += preview.positions[i].creditScaled / tier.ACCOUNTING_SCALE();
}
uint256 expectedRetired = preview.retiredCreditScaled / tier.ACCOUNTING_SCALE();
uint256 expectedReferral = preview.referralCreditScaled / tier.ACCOUNTING_SCALE();
uint256 expectedCreator = preview.creatorCreditScaled / tier.ACCOUNTING_SCALE();

uint256 balanceBefore = paymentToken.balanceOf(beneficiary);
vm.prank(beneficiary);
MembershipTypes.ClaimResult memory actual = tier.claimRewards(ids, budget);

eq(actual.processedSteps, preview.processedSteps, "claim preview work mismatch");
eq(actual.liveReward, expectedLive, "live claim rounded incorrectly");
eq(actual.retiredReward, expectedRetired, "retired claim rounded incorrectly");
eq(actual.referral, expectedReferral, "referral claim rounded incorrectly");
eq(actual.creator, expectedCreator, "creator claim rounded incorrectly");
eq(
    paymentToken.balanceOf(beneficiary) - balanceBefore,
    expectedLive + expectedRetired + expectedReferral + expectedCreator,
    "claim payout differs from preview"
);
// Re-preview settled fractional credits and compare each with preCreditScaled % SCALE.
```
GHOST_NEEDS: `claimPreviewProcessedSteps`, `expectedLiveClaim`, `expectedRetiredClaim`, `expectedReferralClaim`, `expectedCreatorClaim`, per-selected-token `creditScaled % SCALE`
SNAPSHOT_NEEDS: `beneficiaryPaymentBalance`, `liveCreditFractions`, `retiredCreditFraction`, `referralCreditFraction`, `creatorCreditFraction`
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: `ACCOUNTING_SCALE` is documented as retaining fractional credits; every `takeMember`, `takeRetired`, `takeReferrer`, and `takeEarned` computes `creditScaled / SCALE` and subtracts only `amount * SCALE`. `encodedClaimPreview` exposes those same scaled credits.
RATIONALE: This detects overpayment, lost dust, and disagreement between batch previews and claims.

PROPERTY_ID: RD-09
TYPE: GLOBAL
ENGLISH: `totalProtectedLiability` must be the exact ceiling of all scaled liabilities, never a floor that leaves fractional credit unbacked.
SOLIDITY_SKETCH:
```solidity
MembershipTypes.PaymentTotals memory p = tier.previewPaymentTotals(budget);
uint256 scaled = p.unassignedMemberScaled
    + p.distributionDustScaled
    + p.indexCarryScaled;

for (uint256 i; i < 4; ++i) {
    scaled += p.earnedScaled[i] + p.unearnedScaled[i] + p.cancellationScaled[i];
}

uint256 protectedRaw = tier.totalProtectedLiability();
gte(protectedRaw * tier.ACCOUNTING_SCALE(), scaled, "fractional liability unprotected");
if (scaled != 0) {
    lt(
        (protectedRaw - 1) * tier.ACCOUNTING_SCALE(),
        scaled,
        "protected liability exceeds exact ceiling"
    );
}
```
GHOST_NEEDS: none
SNAPSHOT_NEEDS: none
PRIORITY: HIGH
GUARANTEE: SHOULD-HOLD
EVIDENCE: `totalProtectedLiability` is defined as `ceilDiv(VestingLedger.liabilityScaled, ACCOUNTING_SCALE)`; the interface states claims retain fractional credits.
RATIONALE: A floor conversion could make the tier appear solvent in raw units while one fractional liability unit remains unbacked.

PROPERTY_ID: RD-10
TYPE: SPECIFIC
ENGLISH: The identity predicted for a creator and tier salt must exactly equal the identity of the tier created from those inputs and the factory’s reverse registry entry.
SOLIDITY_SKETCH:
```solidity
bytes32 predicted = factory.predictTierIdentity(creator, config.tierSalt);

vm.prank(creator);
address tierAddress = factory.createTier(config);

eq(
    MembershipTier(tierAddress).tierIdentity(),
    predicted,
    "predicted identity differs from deployed tier"
);
eq(factory.tierForIdentity(predicted), tierAddress, "identity reverse lookup mismatch");
```
GHOST_NEEDS: `predictedTierIdentity`, `createdTierAddress`
SNAPSHOT_NEEDS: none
PRIORITY: MEDIUM
GUARANTEE: SHOULD-HOLD
EVIDENCE: `createTier` derives the same `TierIdentity.derive(factory,creator,salt)` value and explicitly reverts on `TierIdentityMismatch` before recording `tierForIdentity`.
RATIONALE: This is the factory’s predictor-to-actual conversion boundary and protects deterministic membership identity assumptions.
