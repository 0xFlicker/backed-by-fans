# Fuzzing Suite Report

## Suite Overview
- **Project**: Backed By Fans membership and payment-streaming protocol
- **Suite location**: `test/fizz/`
- **Contracts targeted**: MembershipFactory, MembershipTier
- **Total handlers**: 4 (2 primary, 2 secondary/dispatcher)
- **Properties**: 69 (19 global, 50 function-specific)

## Coverage Results
| Contract | Target | Achieved | Status |
|----------|--------|----------|--------|
| MembershipFactory | 80% | 79% raw (148/186); 97% transaction-reachable (148/152) | ✅ |
| MembershipTier | 80% | 91% (589/647) | ✅ |

Status legend: ✅ if achieved ≥ target (or intentional skip), ⚠️ if within 10 points below target, ❌ if more than 10 points below target.

The factory's raw result includes 34 constructor-only executable lines. Medusa begins coverage after `FuzzTester` deployment, so 148/152 transaction-reachable lines is the applicable campaign result. Coverage for renderer, media-store, buyback, and other wrapper-reported dependencies is outside this selected target set.

## Skipped Paths
| Contract | Function / Path | Reason |
|----------|----------------|--------|
| MembershipFactory | Constructor-only deployment paths (34 executable lines) | Executed before Medusa starts coverage; intentionally excluded from the transaction-reachable denominator. |
| MembershipFactory | Protocol-token binding and successful ownership-handoff paths | Protocol buyback configuration is outside the selected membership-registry and aggregate-claim entry-point set; unauthorized ownership guards remain exercised. |
| MembershipTier | `initialize` | Setup-only clone initialization occurs before campaign transactions. |
| MembershipTier | Presentation/metadata mutation and rendering paths | Renderer and media-store behavior is outside the selected membership-lifecycle and accounting entry-point set; unauthorized admin guards remain exercised. |
| Cross-tier accounting | GL-08 beneficiary-liability enumeration | Intentionally skipped: beneficiaries and referrers are open-world addresses, so summing only the harness's three actors cannot prove equality to all earned liabilities. |

## Campaign Results
- **Fuzzer used**: Medusa
- **Duration**: Approximately 2m27s
- **Total calls**: 500,000 configured transaction limit; 505,875 observed when workers halted
- **Branches hit**: 12,573
- **Corpus size**: 505 sequences in the final campaign
- **Assertion tests**: 113 passed, 0 failed
- **Exit status**: 0
- **Violations found**: 0 final violations; `fizz_data/corpus_medusa/test_results/` is empty
- **Echidna compatibility smoke**: Exit 0 after 129 calls; 95 assertion-mode targets reported passing, with an 11-sequence corpus. This was a short configuration check, not the full automatic campaign.

### Violation Details

No violation was stored by the corrected final campaign, and `FoundryTester.sol` contains no `test_repro_*` function.

#### Resolved preliminary SP-47 harness false positive (historical; not a final violation)
- **Property violated**: SP-47 / `property_renewableSoundness`
- **Guarantee**: `EXPLORATORY`
- **Assertion**: `t(success, "SP-47 renewable call failed")`
- **Root cause**: The preliminary handler evaluated `target.periodDuration()` after `vm.prank(actor)` while constructing the renewal arguments. That getter consumed the one-shot prank, so the subsequent low-level `renewSubscription` call came from the harness rather than the token owner.
- **Severity assessment**: `test harness false positive`
- **Reproducing sequence**: N/A; stale preliminary violation JSON was removed after the harness fix.
- **Foundry repro**: N/A; no final violation or repro remains.
- **Fix and final result**: `SpecificPropertiesHandler` now reads `periodDuration` before `vm.prank(actor)`. The corrected 500,000-call campaign passed all 113 assertion tests with zero failures.

## Properties Implemented
| # | Property | Type | Guarantee | Confidence |
|---|----------|------|-----------|------------|
| 1 | [x] GL-01 `property_accountingConservation` | Global | SHOULD-HOLD | HIGH — exact scaled conservation equality |
| 2 | [x] GL-02 `property_tierSolvency` | Global | SHOULD-HOLD | HIGH — exact custody/liability equality |
| 3 | [x] GL-03 `property_rewardShareDenominator` | Global | SHOULD-HOLD | HIGH — full bounded extant-supply sum |
| 4 | [x] GL-04 `property_occupiedSupplySync` | Global | SHOULD-HOLD | HIGH — exact supply equality |
| 5 | [x] GL-05 `property_expirationScheduleSync` | Global | SHOULD-HOLD | HIGH — exact schedule/occupancy equality |
| 6 | [x] GL-06 `property_mintedRetiredCounts` | Global | EXPLORATORY | HIGH — exact ghost/count equalities |
| 7 | [x] GL-07 `property_paymentTokenRegistry` | Global | SHOULD-HOLD | HIGH — complete registry iteration and uniqueness checks |
| 8 | [x] GL-09 `property_protectedLiabilityCeiling` | Global | SHOULD-HOLD | HIGH — exact ceiling formula |
| 9 | [x] GL-10 `property_lifetimeGrossMonotonic` | Global | SHOULD-HOLD | HIGH — strict cross-call monotonic baseline |
| 10 | [x] GL-11 `property_totalMintedMonotonic` | Global | EXPLORATORY | HIGH — monotonic and exact creation-ghost checks |
| 11 | [x] GL-12 `property_accountedThroughMonotonic` | Global | SHOULD-HOLD | HIGH — strict cross-call cursor baseline |
| 12 | [x] GL-13 `property_factoryCountsMonotonic` | Global | EXPLORATORY | HIGH — strict cross-call count baselines |
| 13 | [x] GL-14 `property_rewardPerShareMonotonic` | Global | EXPLORATORY | HIGH — strict cross-call index baseline |
| 14 | [x] GL-15 `property_ownershipOccupancySync` | Global | SHOULD-HOLD | MEDIUM — all extant tokens checked, but historical IDs sample the latest 16 |
| 15 | [x] GL-16 `property_supplyCap` | Global | SHOULD-HOLD | HIGH — exact configured cap inequality |
| 16 | [x] GL-17 `property_rewardEligibility` | Global | SHOULD-HOLD | HIGH — full bounded extant-supply checks |
| 17 | [x] GL-18 `property_erc721Enumeration` | Global | SHOULD-HOLD | HIGH — full extant global/owner enumeration checks |
| 18 | [x] GL-19 `property_interfaces` | Global | SHOULD-HOLD | HIGH — exact interface-ID assertions |
| 19 | [x] GL-20 `property_completeAccountingStatus` | Global | SHOULD-HOLD | HIGH — exact cursor and due-boundary checks |
| 20 | [x] SP-01 `property_paymentAppendsLot` | Specific | SHOULD-HOLD | HIGH — exact gross, lot, allocation, and cursor deltas |
| 21 | [x] SP-02 `property_protocolFeeRelease` | Specific | SHOULD-HOLD | HIGH — exact endpoint and paid-total deltas |
| 22 | [x] SP-03 `property_refundAccounting` | Specific | SHOULD-HOLD | HIGH — exact composite state hash |
| 23 | [x] SP-04 `property_purchaseRefundRoundTrip` | Specific | SHOULD-HOLD | HIGH — meaningful no-profit upper bound |
| 24 | [x] SP-05 `property_giftRefundRoundTrip` | Specific | SHOULD-HOLD | HIGH — aggregate no-profit and exact recipient delta |
| 25 | [x] SP-06 `property_repeatedRefundCycles` | Specific | SHOULD-HOLD | HIGH — bounded repeated no-profit inequality |
| 26 | [x] SP-07 `property_grantRevokeRoundTrip` | Specific | SHOULD-HOLD | HIGH — exact seconds and token-balance equalities |
| 27 | [x] SP-08 `property_transferRoundTrip` | Specific | SHOULD-HOLD | HIGH — exact position hash and combined-balance equality |
| 28 | [x] SP-09 `property_sharePreviewMatchesIssue` | Specific | SHOULD-HOLD | HIGH — exact quoted share and gross-cursor deltas |
| 29 | [x] SP-10 `property_shareQuoteShape` | Specific | SHOULD-HOLD | HIGH — strict zero, positivity, and monotonicity checks |
| 30 | [x] SP-11 `property_paymentAllocationRounding` | Specific | SHOULD-HOLD | HIGH — exact floor formulas and residual equality |
| 31 | [x] SP-12 `property_renewalExactness` | Specific | SHOULD-HOLD | HIGH — exact composite renewal-state hash |
| 32 | [x] SP-13 `property_refundPreviewMatches` | Specific | SHOULD-HOLD | HIGH — exact preview, scale, and recipient equalities |
| 33 | [x] SP-14 `property_accountingPreviewMatches` | Specific | SHOULD-HOLD | HIGH — exact steps, status, and balances |
| 34 | [x] SP-15 `property_paymentTotalsPreviewMatches` | Specific | SHOULD-HOLD | HIGH — exact steps and totals hash |
| 35 | [x] SP-16 `property_claimPreviewMatches` | Specific | SHOULD-HOLD | MEDIUM — exact raw categories and payout, but scaled remainder retention is not asserted directly |
| 36 | [x] SP-17 `property_tierCreationIdentity` | Specific | SHOULD-HOLD | HIGH — exact count, salt, registry, and identity checks |
| 37 | [x] SP-18 `property_referralImmutable` | Specific | SHOULD-HOLD | HIGH — exact status and referrer equality |
| 38 | [x] SP-19 `property_fixedCreationCounts` | Specific | SHOULD-HOLD | HIGH — exact four-counter increments |
| 39 | [x] SP-20 `property_zeroGrossCreation` | Specific | SHOULD-HOLD | MEDIUM — strict economic checks, but referral and eligibility are not asserted directly |
| 40 | [x] SP-21 `property_transferPreservesPosition` | Specific | SHOULD-HOLD | HIGH — exact composite position hash |
| 41 | [x] SP-22 `property_refundRetiresPosition` | Specific | SHOULD-HOLD | HIGH — exact nonexistence and counter hash |
| 42 | [x] SP-23 `property_grantCreation` | Specific | EXPLORATORY | HIGH — exact grant, payment, share, occupancy, and supply checks |
| 43 | [x] SP-24 `property_revokeGrantBranch` | Specific | SHOULD-HOLD | HIGH — exact paid/grant branch outcomes |
| 44 | [x] SP-25 `property_accountingProgress` | Specific | SHOULD-HOLD | HIGH — strict work bound, monotonicity, retirement, and boundary checks |
| 45 | [x] SP-26 `property_paymentTokenEnablement` | Specific | EXPLORATORY | HIGH — exact flags and append-count delta |
| 46 | [x] SP-27 `property_extantSharesMonotonic` | Specific | SHOULD-HOLD | HIGH — strict monotonicity and no-payment equality |
| 47 | [x] SP-28 `property_factoryAdminGuards` | Specific | SHOULD-HOLD | HIGH — revert plus exact protected-state hash |
| 48 | [x] SP-29 `property_tierAdminGuards` | Specific | SHOULD-HOLD | HIGH — revert plus exact protected-state hash |
| 49 | [x] SP-30 `property_foreignOwnerGuards` | Specific | SHOULD-HOLD | HIGH — strict rejection of both operations |
| 50 | [x] SP-31 `property_claimFactoryGuard` | Specific | SHOULD-HOLD | HIGH — strict caller rejection |
| 51 | [x] SP-32 `property_expiredGuards` | Specific | SHOULD-HOLD | HIGH — strict rejection of all three operations |
| 52 | [x] SP-33 `property_duplicateSaltGuard` | Specific | SHOULD-HOLD | HIGH — rejection plus exact registry preservation |
| 53 | [x] SP-34 `property_pausedExitLiveness` | Specific | SHOULD-HOLD | HIGH — strict entry rejection and four exit/maintenance successes |
| 54 | [x] SP-35 `property_dueBoundaryLiveness` | Specific | SHOULD-HOLD | HIGH — exact one-step success |
| 55 | [x] SP-36 `property_claimLiveness` | Specific | SHOULD-HOLD | HIGH — execution success and exact payout |
| 56 | [x] SP-37 `property_giftReferralIsolation` | Specific | SHOULD-HOLD | HIGH — exact referral status and address equality |
| 57 | [x] SP-38 `property_prepaidLimit` | Specific | SHOULD-HOLD | HIGH — exact configured-limit inequality |
| 58 | [x] SP-39 `property_curveCapacityGuard` | Specific | SHOULD-HOLD | HIGH — revert plus exact state and balance preservation |
| 59 | [x] SP-40 `property_claimSelectionGuard` | Specific | SHOULD-HOLD | HIGH — revert plus exact credit-state preservation |
| 60 | [x] SP-41 `property_donationIsolation` | Specific | EXPLORATORY | MEDIUM — exact aggregate economics and interest checks, but referral identity is not asserted directly |
| 61 | [x] SP-42 `property_fullBalanceContribution` | Specific | EXPLORATORY | MEDIUM — exact spend and positive shares, but claim interest is only a liveness proxy |
| 62 | [x] SP-43 `property_approvedTransfer` | Specific | SHOULD-HOLD | HIGH — exact ownership and approval clearing |
| 63 | [x] SP-44 `property_operatorTransfer` | Specific | SHOULD-HOLD | HIGH — exact ownership and operator revocation |
| 64 | [x] SP-45 `property_selfTransfer` | Specific | SHOULD-HOLD | HIGH — exact state, balance, and approval checks |
| 65 | [x] SP-46 `property_safeTransferReceiver` | Specific | SHOULD-HOLD | HIGH — success/rejection and atomic-state checks |
| 66 | [x] SP-47 `property_renewableSoundness` | Specific | EXPLORATORY | HIGH — strict success and exact expiration delta after corrected caller setup |
| 67 | [x] SP-48 `property_allocationOrder` | Specific | SHOULD-HOLD | HIGH — strict duration and non-overlap checks |
| 68 | [x] SP-49 `property_allocationCursor` | Specific | SHOULD-HOLD | HIGH — exact cursor bound and consumed-queue zeroes |
| 69 | [x] SP-50 `property_allocationGeneration` | Specific | SHOULD-HOLD | HIGH — exact generation/canceled equivalence |

GL-08 is marked `[-]` in `PROPERTIES.md` and has no Solidity property function, so it is not included in the implemented count or table.

## Open TODOs

No `TODO`, `FIXME`, or `HACK` comments are present in `Base.sol`, `Snapshots.sol`, `Properties.sol`, or the handler files.

## Next Steps
1. Preserve the SP-47 caller-ordering regression fix: read every argument-producing target getter before `vm.prank`, then make the intended target call immediately after the prank.
2. Strengthen the five MEDIUM-confidence assertions: expand GL-15 historical-ID coverage with a bounded ghost set; snapshot SP-16 scaled remainders; add SP-20 referral/eligibility checks; add SP-41 referral-state checks; and make SP-42 execute a claim rather than using `hasClaimInterest` alone.
3. No contract has ❌ coverage. Keep reporting MembershipFactory as both 79% raw and 97% transaction-reachable unless constructor coverage is measured in a separate deployment test.
4. There are no open suite TODOs blocking production validation.
5. For production validation, run at least a 24-hour Medusa campaign and a separate 24-hour Echidna campaign, retaining each fuzzer's corpus and coverage artifacts. The corrected 2m27s Medusa run is a clean generation baseline, not a long-duration production campaign.

Manual campaign commands from the project root:

```bash
medusa fuzz
echidna test/fizz/FuzzTester.sol --contract FuzzTester --config echidna.yaml
```
