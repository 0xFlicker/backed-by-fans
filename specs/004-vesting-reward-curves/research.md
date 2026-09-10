# Research: Vested Allocations and Reward Curves

Date: 2026-09-09. Source baseline: `d67bf93a9bb8eb95f181cb42520e5538d6052b20`.
This is a design decision record, not implemented-contract or deployment evidence.
Three research agents independently examined accounting, curve arithmetic, and integration/deployment. The decisions below resolve the technical design questions; the implementation gates are tests of those decisions, not authorization to change the product requirements.

## 1. Attribute funding before changing reward weight

**Decision:** Maintain a chronological tier-wide funding scheduler. Before any change to funding, shares, or eligibility, advance it through the transaction timestamp, including every due boundary at that timestamp. Only then change the eligible weight vector. Keep creator synchronization as the eligibility cutoff.

**Rationale:** Processing a member's payment lots independently and then using today's denominator would give late arrivals past earnings. Current `contracts/src/MembershipTier.sol` settles a reward index around explicit eligibility changes; that boundary remains useful, but `_applyPayment` and `_allocateReward` currently distribute cash immediately. Natural expiry need not introduce another scheduled weight-change system because the specification deliberately retains explicit synchronization.

**Alternatives considered:** Purchase-time recipient snapshots violate FR-009. Distribution using processing-time weights violates FR-010. Automatic expiry scheduling adds a second lifecycle clock the user did not request. Scanning all members at each weight change violates FR-045.

## 2. One scheduled funded interval per membership

**Decision:** Use an indexed binary min-heap keyed by `(timestamp, tokenId)` and a per-membership, per-generation queue of funded payment lots. At most one heap node exists per membership: the next funded lot's START or the current lot's END. Absolute lot times use `start = now + remainingPaidSeconds` before adding the purchase; `end = start + purchasedDuration`. Grants are excluded from that paid-first queue. Zero-value periods extend paid service but create no funding node; subsequent positive lots retain the resulting gaps.

At START, activate the lot's four rates and its recorded referrer's rate. At END, accrue through the endpoint, recognize the lot's small terminal remainders, remove its rates, mark it complete, and activate or schedule the next funded lot. No future lot array is copied into the heap. Boundary processing is ordered before mutations at the same timestamp.

**Rationale:** A refund removes one node and invalidates a generation, rather than deleting every future payment. Prefix totals and the completed/head cursors calculate the entire generation's unearned funding without a scan. Heap work is `O(log M)` per processed boundary or cancellation, where M counts memberships with scheduled funding. Zero-price renewals cannot manufacture scheduler work without providing money.

**Alternatives considered:** A node for every future payment inflates heap size and makes bulk cancellation harder. Per-second processing is unbounded after inactivity. Aggregate rates without scheduled endpoints cannot stop a completed payment correctly. Existing buyback-only `FeeAccount` and zero-price refund cursors cannot alone reconstruct historical membership reward attribution; replace them with this single allocation ledger rather than retain parallel accounting.

## 3. Scaled cash with explicit conservation and frequency-independent rounding

**Decision:** Use `Q = 2^128` subunits per raw payment-token unit in all internal cash ledgers. Limit lifetime positive gross and the canonical curve horizon to `C = 2^112 - 1`. For a lot allocation A and duration d seconds, use `rate = floor(A*Q/d)` and terminal remainder `A*Q - rate*d`. Release that remainder only at the lot's END. Durations and absolute timestamps retain checked uint64 limits; sums and scaled amounts use uint256.

Creator and protocol earnings accrue from aggregate rates. Referrers have independently checkpointed rates and credits; settle the affected referrer at the scheduler's effective timestamp before changing their rate. The scheduler also keeps aggregate referral totals for reconciliation.

For member funding `f` in scaled units and eligible weight W, add `(f + carry) / W` to the reward index and keep `(f + carry) % W`. Carry persists across processing, claims, and source-rate changes while the eligible weight vector is unchanged. Before a genuine eligible-vector change, settle the old interval, move remaining carry into protected distribution dust, settle affected members, and change the vector. Do not carry an old cohort's residue into a new cohort. With W zero, move funding directly to protected unassigned member reserve.

Member credits are `shares * indexDelta` in scaled cash units. Claims pay `floor(credit/Q)` and retain fractional credit. They do not discard claim-time remainders. Creator, referrer and protocol transfers follow the same rule. All token transfers remain in the tier under its access checks and reentrancy guard.

**Bounds:** `A*Q <= C*Q < 2^240`; aggregate rates cannot exceed lifetime funded scaled value. Maximum shares are less than `10*C < 2^116`. A stream's temporarily deferred terminal remainder is less than `d/Q < 2^-64` raw units. An eligible-vector transition strands less than `W/Q < 2^-12` raw units. A conservative recipient difference from ideal continuous rational attribution is bounded by `2*L*(2^64-1)/Q + E*10*C/Q`, where L is the number of reward-funded lots and E the number of real eligible-vector transitions in the compared history. Comparing separately floored raw totals may add less than two raw units; scaled credits, paid raw units times Q, and protected dust must also be compared. This bound does not grow with processing or claim count. For the same economic history, the delivered scaled algorithm must be exactly invariant to those two frequencies.

**Rationale:** Repeated per-call raw-unit rounding would make timing economically relevant. Scaled rates avoid rounding each member/payment on each checkpoint; terminal recognition makes fully consumed lots exact. The bounds are derived design requirements and must be checked against Solidity and the independent oracle before release.

**Alternatives considered:** Whole-token-per-second rates fail for ordinary low amounts and long periods. Floor each checkpoint loses money with frequent processing. Paying distribution dust to the latest purchaser changes attribution. A separate VestingWallet per purchase adds contracts and fixed beneficiaries without solving changing reward cohorts. The repository already vendors OpenZeppelin `Math.mulDiv`; use it where multiplication needs full precision rather than introduce another math dependency.

**Zero-eligible reachability:** Under the specified public transitions, a live positive funded lot implies an eligible originating member with positive shares: its positive purchase activates weight, synchronization cannot suspend while purchased access remains, grant-only revocation cannot suspend with paid time remaining, and refund removes its future funding before suspension. Endpoint tails settle before any suspension at that timestamp. Therefore positive reward funding with W=0 should be unreachable from valid production history. Prove this as a stateful invariant; separately inject the empty-vector condition in the model/library harness to verify FR-012's protected-unassigned behavior. Do not weaken the public lifecycle merely to make that branch reachable.

## 4. Refund only the canceled generation's unearned funding

**Decision:** After catching up through now, compute each allocation's unearned scaled amount from generation allocation prefixes minus recognized completed/head amounts. The raw refund is all future gross plus the floor of the active lot's unused-time gross. This is equivalent to existing fixed-price and variable-contribution unused-time refunds. Remove the one scheduled node, remove active rates, invalidate the generation, and suspend reward eligibility.

Deduct `refund*Q` from that generation's four unearned buckets in creator, member, referral, protocol order. This order affects only refund source attribution. Move each bucket's remaining fractional cancellation amount to its own protected cancellation-rounding reserve. Do not create additional earnings, charge owner proceeds, or claw back any earned balance. Emit the four funded components and residual amounts. Preserve all historical shares and the lifetime gross cursor.

**Proof obligation:** Sum of recognized scaled allocations is no greater than ideal consumed gross; the floor unused-time refund therefore fits in the remaining unearned funding. Only one partially consumed lot can leave cancellation residue; complete future lots cancel exactly. Residue is less than `1 + 4*(2^64-1)/Q` raw units per canceled generation. It has a protected original purpose and no withdrawal path. This deliberately replaces the old creator-top-up refund API and per-fee cancellation treatment.

**Alternatives considered:** Taking already-earned balances violates FR-035. Vesting each portion with independent rounding upward could overdraw refunds. Rewinding the curve or deleting refunded shares contradicts the accepted permanent-weight decision. A multi-transaction refund lock is unnecessary with one heap node and generation prefixes.

## 5. Permissionless catch-up, explicit incomplete reads, and available claims

**Decision:** `processAccounting(maxSteps)` processes 1–25 boundaries and commits progress even when it produces no whole-token earnings. With no remaining due boundary it accrues the final interval through now. Funding/weight-changing actions may process at most 25 boundaries inline, but revert with `AccountingBehind` if still stale; their rolled-back attempt is not progress. The UI then offers a separate processing transaction and resimulation. Claims and protocol releases can transfer already-settled earnings while a backlog exists; they do not change weights and need not wait for the latest timestamp.

Reads identify `accountedThrough`, `nextBoundary`, and completeness at the requested block. Claimable means settled, withdrawable value. An optional constant-work projection stops at the next boundary and is distinctly labeled; do not simulate or copy the entire heap in a view. No arbitrary operator-selected historical target is used for lifecycle actions.

**Rationale:** The work per transaction is bounded, completed catch-up survives subsequent failures, and a stale ledger never silently uses a new weight vector for past funding. New purchases cannot add scheduler work while accounting is behind. Finite preexisting backlog is resumable; performance tests must cover dense equal-time endpoints and progress while block time advances, not assume an idle static timestamp.

**Updated decision after CHK035 discussion:** Use one permissionless combined advance for accounting, earned-funding release, and eligible buyback/burn. Keep direct tier processing, but replace the separate-transactions-only runner plan. Isolate accounting, release and each purchase so later independent failures cannot undo earlier successes in a valid, sufficiently resourced advance. Actual funded boundaries or newly recognized funding, positive releases and completed buys count as useful work. An idle timestamp refresh alone does not. Revert NothingToDo only when none of the selected stages completes useful work; invalid requests and transaction-wide failures remain ordinary failures.

**Rationale and alternatives:** The current router rolls back on NothingToDo and combines accrual/release within one reverting subcall. Merely inserting cursor work there is insufficient. Change the failure boundaries and success criterion, including potentially failing burn-measurement reads, instead of requiring separate transactions for every operation. Apply a shared accounting budget across tiers and measure the entire call's gas envelope. CHK035 is now resolved as a requirements question: the caller supplies a maximum checkpoint count, actual completed work is reported, and incomplete progress is resumable. Measuring total gas and recovery throughput belongs to implementation discovery. The measured protocol cap is 25, reduced from the initial 100 after cold full-scale combined-call measurements; no fixed total cost or recovery-time decision is required before implementation.

**Future scope:** A later pre-release specification may compensate workers. This feature records the caller and real outcomes but adds no payout, entitlement, compensation hook, or incentive balance. These metrics are not presumed safe future reward formulas.

## 6. A cumulative curve that telescopes exactly

**Decision:** Store canonical `lifetimeGross = x`, horizon H, and `startingBoostBps`. Let b be boost BPS minus 10,000 and u = min(x,H). For an enabled bonus:

```text
F(x) = x + floor(b * u * (2H-u) / (20,000*H))
issued(gross) = F(x+gross) - F(x)
```

For None, H is zero and F(x)=x. Validate before collecting funds: boost 10,000–100,000 inclusive, increments of 100 BPS; None requires H=0, bonus requires 1<=H<=C; x+gross<=C. Fixed-price H must be an exact positive number of configured periods times price, with period count <=uint64 max. PWYW H is canonical gross contribution directly. Enforce the same constraints in factory, tier, quote and UI. Fixed price itself must fit C. Actual purchased duration has separate uint64/prepayment limits.

**Rationale:** Rounding the cumulative function once makes consecutive partitions telescope exactly. There is no purchase-splitting share advantage. Relative to the rational curve, a purchase's absolute share error is less than one raw share. Under the shared C cap, `u*(2H-u)<2^224` and multiplying by b remains below 2^241. Cumulative shares fit comfortably below uint256. Refunds never decrement x.

**Alternatives considered:** Multiplying the whole purchase by its starting marginal rate favors large purchases. Rounding independent purchase integrals creates partition-dependent issuance. Using eligible shares as curve position rewinds it after suspension. Using token display multipliers or fiat prices as ongoing inputs would mutate published economics.

The initial defaults and reproducible numerical evidence are in [calibration.md](calibration.md): Some=1.5x, More=3x, fixed window=1,000 periods, and PWYW window=10,000 display-token units. Numeric bounds and exact conversion are engineering requirements; reject unrepresentable inputs rather than silently clamp them. Following the CHK040 scope correction, there is no per-asset keep/replace report, economic-suitability approver, or preset approval gate. Creators may customize the initial values before publication, after which their terms are immutable. SC-009 requires a mathematical behavior report, not economic optimization or a market-price oracle.

## 7. Keep wallet ownership and replace obsolete buyback collection inputs

**Decision:** Regenerate bindings from Foundry with Wagmi CLI. Update tier publication, immutable reads, purchase quotes, payout receipt reconciliation, account views, the router collection tuple, fee release UI, forecasts and buyback runner together. Replace token-ID fee scans with bounded tier-global processing. Match issued shares and paid amounts from the supplied successful receipt; a later nonzero balance is compatible with a successful claim.

**Rationale:** `web/AGENTS.md` owns the wallet boundary. `MembershipExperience.tsx` currently assumes `sharesAdded=gross` and checks against the pre-submit preview; both are invalid when other purchases can move the curve. Current claim-zero predicates are invalid during accrual. `ProtocolBurnRouter.sol`, `prepare-burn.ts`, `ReleaseTierFees.tsx`, `fee-forecast.ts`, `run-buybacks.ts`, and `buyback-rehearsal.ts` currently depend on per-token fee collection and must change coherently.

**Alternatives considered:** Handwritten ABIs, a second transaction engine, an accounting indexer as authority, and old-method compatibility adapters conflict with project boundaries. Keep existing vault destinations and market policies. Separate currency transactions provide operational independence; an attempted failure in a combined transaction rolls it all back.

## 8. Deploy one immutable linked accounting library

**Decision:** Implement scheduler and scaled ledgers in an externally linked `VestingLedger` Solidity library operating on one explicit `State storage` parameter. Keep access control, token transfers, membership lifecycle and reward-curve issuance in the tier. The library is a leaf dependency with no owner, upgrade path, token custody, or arbitrary delegatecall target.

**Rationale:** Existing cached artifacts measure factory creation code at 92,664 bytes, tier creation at 39,201 and tier runtime at 33,403. These are observations of cached files, not clean-build proof. Factory construction recursively embeds the tier deployer and other children. Repository limits include 95,000 bytes of encoded deployment transaction data and a two-store tier base-creation ceiling of 49,150 bytes. Inlining the new ledger risks exceeding both. Solidity's documented external-library mechanism operates on the caller's storage using compiler-generated calls; see [official library documentation](https://docs.soliditylang.org/en/latest/contracts.html#libraries).

Build the independent library first, derive its deterministic CREATE2 address from those exact artifacts, and build consumers with exactly that link mapping. Retain first-stage artifacts separately: a later build's metadata settings may change initcode. Deploy/verify the library first; verify its actual deployed runtime, chain, version, salt and hashes before factory deployment. The deployment wrapper currently rejects all libraries and assumes four components, so update its approved map, component ordering, parity checks, verification arguments, fixtures and broadcast link metadata. Do not add arbitrary environment-supplied link addresses. Existing immutable tier code stores remain.

**Alternatives considered:** A proxy introduces unwanted upgrade semantics. Injecting separately deployed tier code stores into the factory creates a larger constructor/deployment refactor. Waiting until UI completion to discover deployment size failure is unacceptable. Linked-library gas and final code sizes remain early implementation pass/fail gates, using exact encoded payloads and target limits rather than relaxed Forge test limits.

## 9. Evidence and validation choices

**Decision:** Build a slow independent rational history model that walks actual payment intervals and eligible cohorts, plus compare onchain scaled state and recipient outcomes across 10,000 histories of at least 100 actions. Record transition coverage and failed seeds. Test frequent/irregular/delayed processing and claims against the same economic timeline. Calibrate curves separately from cash attribution.

**Rationale:** Existing `contracts/test/models/MembershipModel.sol`, fee accrual tests, eligibility tests and invariant handlers provide useful fixtures, but their upfront allocations and fee-only oracle cannot certify the new algorithm. An oracle that copies the heap and accumulator would reproduce its mistakes. Conservation and recipient attribution are independent requirements.

**Alternatives considered:** Aggregate conservation alone, curve-only random tests, relaxed local deployment tests, or browser mocks alone do not meet SC-002/004/007/010. Full local integration currently uses the authentic private-origin fork harness through `scripts/verify-local.sh`; it is not a standalone no-network Anvil demo. See [quickstart.md](quickstart.md) for the separate evidence classes and prerequisites.

## Planning Validation Record

On 2026-09-09, both retained Python scripts completed successfully: 50,000 deterministic Q128 refund/carry arithmetic cases, and 10,000 curve histories of 50 purchases plus the small rational calibration scenarios. The complete-history Solidity acceptance target has not run. No application build, deployment, gas benchmark, browser replay or chain write was performed for this planning phase.

Checked all 11 required feature artifacts, local Markdown link targets, 48 unique functional requirement IDs, 10 success criteria, unresolved-marker absence and whitespace. A final independent accounting/integration consistency pass corrected refund-preview timestamp semantics and explicitly retained ERC-5643 cancellation through the new refund path. Constitution checks pass for the design. No extension hook file exists. These results support moving to the risk checklist and task-generation stages; they do not establish implementation completion.
