# Invariant Map

> Backed By Fans | 26 guards | 12 single-contract | 4 cross-contract | 3 economic | 0 verified unenforced

---

## 1. Enforced Guards (Reference)

#### G-1
`if (isPaymentTokenListed[token]) revert DuplicatePaymentToken(token)` · `MembershipFactory.sol:100` · Keeps the initial payment-token registry unique.

#### G-2
`if (!isRegisteredTier[requests[i].tier]) revert InvalidClaimBatch()` · `MembershipFactory.sol:126` · Restricts aggregate claims to factory-created tiers.

#### G-3
`if (_usedTierSalts[msg.sender][config.tierSalt]) revert TierSaltAlreadyUsed(...)` · `MembershipFactory.sol:184` · Preserves deterministic tier identity uniqueness.

#### G-4
`if (!isPaymentTokenEnabled[config.paymentToken]) revert PaymentTokenNotEnabled(...)` · `MembershipFactory.sol:198` · Prevents new tiers using disabled assets.

#### G-5
`if (config.minimumPayment != minimum) revert MinimumPaymentChanged(...)` · `MembershipFactory.sol:202` · Binds tier creation to the current payment floor.

#### G-6
`if (actualMediaFactoryCodehash != mediaStoreFactoryRuntimeCodehash) revert MediaStoreFactoryCodeChanged(...)` · `MembershipFactory.sol:211` · Pins creator-media validation to deployment-time code.

#### G-7
`if (_currentTimestamp() >= expiration) revert MembershipExpired(...)` · `MembershipTier.sol:340` · Prevents expired positions acting as live memberships.

#### G-8
`if (_requireLive(tokenId) != msg.sender) revert TokenOwnerOnly()` · `MembershipTier.sol:616` · Restricts renewal to the current live owner.

#### G-9
`if (msg.sender != factory) revert ClaimFactoryOnly()` · `MembershipTier.sol:785` · Makes delegated cross-tier claims factory-only.

#### G-10
`if (newSupplyCap != 0 && newSupplyCap < occupiedSupply) revert SupplyCapBelowOccupancy()` · `MembershipTier.sol:932` · Prevents configuration from invalidating current occupancy.

#### G-11
`if (gross > MAX_LIFETIME_GROSS - _vesting.totalGross) revert CurveCapacityExceeded()` · `MembershipTier.sol:1125` · Bounds the lifetime reward-curve cursor.

#### G-12
`if (supplyCap != 0 && occupiedSupply >= supplyCap) revert CapacityReached()` · `MembershipTier.sol:1296` · Enforces the active occupied-position cap.

#### G-13
`if (paused) revert TierPaused()` · `MembershipTier.sol:1301` · Stops new purchase/time-increase flows during a tier pause.

#### G-14
`if (self.initialized) revert AccountingInvariant()` · `VestingLedger.sol:129` · Makes linked ledger initialization one-shot.

#### G-15
`if (!self.initialized || request.through < self.accountedThrough) revert AccountingInvariant()` · `VestingLedger.sol:369` · Prevents accounting time from moving backward.

#### G-16
`if (gross == 0 || gross > MAX_GROSS - self.totalGross) revert InvalidFunding()` · `VestingLedger.sol:814` · Keeps funded lots positive and within cursor capacity.

#### G-17
`if (shares < member.shares || shares > 10 * MAX_GROSS) revert AccountingInvariant()` · `VestingLedger.sol:960` · Makes permanent member shares monotonic and bounded.

#### G-18
`if (self.totalShares > 10 * MAX_GROSS) revert AccountingInvariant()` · `VestingLedger.sol:968` · Bounds aggregate eligible reward weight.

#### G-19
`if (msg.sender != vault) revert OnlyVault()` · `PonsBuybackExecutor.sol:104` · Restricts external settlement to the immutable vault.

#### G-20
`if (state.revision != expectedRevision) revert StaleRevision()` · `ProtocolBuybackVault.sol:232` · Prevents execution against stale route/limit configuration.

#### G-21
`if (state.status != BuybackTypes.Status.Ready) revert ProcessingUnavailable(...)` · `ProtocolBuybackVault.sol:233` · Requires all lifecycle, pause, route, limit, and cooldown gates.

#### G-22
`if (_balance(snapshot.assets[i]) != snapshot.expected[i] || _balance(snapshot.assets[i]) < _accounted(snapshot.assets[i])) revert InexactSettlement()` · `ProtocolBuybackVault.sol:294` · Preserves exact post-settlement backing.

#### G-23
`if (_balance(protocolToken) != balance - amount || IERC20(protocolToken).totalSupply() != supply - amount) revert InexactSettlement()` · `ProtocolBuybackVault.sol:350` · Proves exact token burning.

#### G-24
`if (!IMembershipFactory(factory).isRegisteredTier(msg.sender)) revert OnlyRegisteredTier()` · `ProtocolBuybackVault.sol:553` · Restricts earned-fee accounting to official tiers.

#### G-25
`if (registrationKind[owner][renderer] != RegistrationKind.None) revert DuplicateRegistration(...)` · `RendererRegistry.sol:136` · Keeps caller-scoped renderer lists unique.

#### G-26
`if (stored.creator != creator) revert MediaCreatorMismatch(...)` · `OnchainMediaStoreFactory.sol:169` · Binds immutable media records to their creator.

## 2. Inferred Invariants (Single-Contract)

#### I-1

`Bound` · On-chain: **Yes**

> `VestingLedger.totalGross` never exceeds `uint112.max`.

**Derivation** — guard-lift: `MembershipTier.sol:1125` and the sole ledger write guard at `VestingLedger.sol:814`.

**If violated** — Reward-curve cursor arithmetic could overflow its documented capacity.

#### I-2

`Bound` · On-chain: **Yes**

> Nonzero `supplyCap` is always at least `occupiedSupply`.

**Derivation** — guard-lift: configuration guard `MembershipTier.sol:932-934`, increment guard `MembershipTier.sol:1295-1297`, decrements occur only on retirement.

**If violated** — The configured capacity would contradict extant occupied memberships.

#### I-3

`StateMachine` · On-chain: **Yes**

> A referral choice moves once from `Unset` to `LockedNone` or `LockedAddress` and never reverses.

**Derivation** — edge: `ReferralStatus.Unset@MembershipTier.sol:1150 -> LockedNone|LockedAddress@1152-1157`; no reverse write site.

**If violated** — Referral allocation identity could change after payment.

#### I-4

`Temporal` · On-chain: **Yes**

> `VestingLedger.accountedThrough` is monotonic.

**Derivation** — temporal: `request.through < self.accountedThrough` reverts at `VestingLedger.sol:369-371`; integration assigns only a later boundary.

**If violated** — Already-earned allocation time could be accounted twice or reversed.

#### I-5

`Conservation` · On-chain: **Yes**

> Changing an eligible member's weight updates `totalShares` by exactly `next - previous`.

**Derivation** — Δ-pair: `VestingLedger.sol:960-968` updates `totalShares` and `member.shares` in the same `_setWeight` operation.

**If violated** — Reward-per-share distribution would use a denominator inconsistent with eligible member weights.

#### I-6

`Conservation` · On-chain: **Yes**

> A protocol-token burn decreases inventory availability and token supply by the same raw amount.

**Derivation** — Δ-pair: `ProtocolBuybackVault.sol:342-353` debits inventory and verifies both balance and supply deltas.

**If violated** — Vault burn accounting would diverge from the external token.

#### I-7

`Conservation` · On-chain: **Yes**

> Each canonical-different settlement leg debits input availability/spend and credits output availability/converted-in by measured leg amounts.

**Derivation** — Δ-pair: `ProtocolBuybackVault.sol:310-339` books all four inventory deltas together.

**If violated** — Per-asset inventory would not reconcile to settlement legs.

#### I-8

`StateMachine` · On-chain: **Yes**

> The vault protocol token and executor bind at most once.

**Derivation** — edge: `protocolToken==0@ProtocolBuybackVault.sol:108 -> protocolToken/executor!=0@107-124`; repeat binding reverts.

**If violated** — Burn destination and settlement executor could change after inventory exists.

#### I-9

`StateMachine` · On-chain: **Yes**

> Each creator/media key maps to one deterministic immutable code store.

**Derivation** — edge: zero `_mediaStores[key]@OnchainMediaStoreFactory.sol:46 -> store@67-75`; existing entries are validated and returned.

**If violated** — Media provenance could point at multiple runtime payloads.

#### I-10

`Conservation` · On-chain: **Yes**

> Renderer registration arrays and their one-based index mappings change together on insert and swap-pop removal.

**Derivation** — Δ-pair: `RendererRegistry.sol:132-167` writes the array element/length and index mapping in each path.

**If violated** — Enumeration and registration membership would disagree.

#### I-11

`StateMachine` · On-chain: **Yes**

> Each `(creator,tierSalt)` and derived tier identity registers once.

**Derivation** — edge: unused salt/zero identity at `MembershipFactory.sol:184-185` -> used salt/tier mapping at `221-233`; no delete path.

**If violated** — Deterministic tier identity uniqueness would fail.

#### I-12

`Conservation` · On-chain: **Yes**

> Exact token pulls and pushes change both endpoint balances by the same amount.

**Derivation** — Δ-pair: before/after checks in `MembershipTier.sol:1163-1192`.

**If violated** — Ledger liabilities would be backed by an inexact transfer.

## 3. Inferred Invariants (Cross-Contract)

#### X-1

On-chain: **Yes**

> A new tier snapshots the factory's current nonzero minimum for its payment token.

**Caller side** — `MembershipFactory.sol:198-206` — creation checks enabled status, current minimum, and fixed price.

**Callee side** — `MembershipTier.sol:139-194` — initializer re-reads the factory minimum and stores immutable tier economics.

**If violated** — Tier pricing rules could start below the factory admission floor.

#### X-2

On-chain: **Yes**

> Creator media accepted by a tier matches a factory-registered immutable store record and pinned runtime codehash.

**Caller side** — `MembershipFactory.sol:209-217` and `MembershipTier.sol:422-467` — pin media-factory code and request validation.

**Callee side** — `OnchainMediaStoreFactory.sol:158-188` — checks creator, MIME, length, digest, codehash, and runtime bytes.

**If violated** — Tier metadata could reference media outside its creator/provenance record.

#### X-3

On-chain: **Yes**

> Released protocol fees move exactly from the tier to the vault before the same amount is recorded as membership inventory.

**Caller side** — `MembershipTier.sol:684-691` — takes earned fees, exact-pushes tokens, then calls `recordEarnedFees`.

**Callee side** — `ProtocolBuybackVault.sol:552-569` — accepts only registered tiers and verifies unaccounted backing.

**If violated** — Recorded buyback inventory could exceed transferred fee backing.

#### X-4

On-chain: **Yes**

> Executor output and route refunds return to the vault without leaving a balance delta at the executor.

**Caller side** — `ProtocolBuybackVault.sol:251-309` — snapshots balances/supply and validates returned execution legs.

**Callee side** — `PonsBuybackExecutor.sol:98-172,304-328` — tracks baselines, clears approvals, and returns every positive delta.

**If violated** — Vault settlement and executor-held assets would diverge.

## 4. Economic Invariants

#### E-1

On-chain: **Yes**

> Every accepted gross payment is allocated among creator, member, referral, and protocol purposes without exceeding gross.

**Follows from** — `I-1` + `I-12`

**If violated** — Time-based liabilities would not reconcile to collected payment.

#### E-2

On-chain: **Yes**

> Protected tier liabilities remain backed across exact payouts and fee release.

**Follows from** — `I-12` + `X-3`

**If violated** — A later creator/member/referrer/refund claim could lack payment-token backing.

#### E-3

On-chain: **Yes**

> Accounted buyback inventory is either retained as backing, converted into equally booked output inventory, or burned with an exact supply decrease.

**Follows from** — `I-6` + `I-7` + `X-4`

**If violated** — Buyback custody totals would no longer explain external balances and burns.
