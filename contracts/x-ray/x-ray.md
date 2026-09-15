# X-Ray Report

> Backed By Fans | 6,906 in-scope nSLOC | 29e5ef5 (`main`) | Foundry | 13/09/26

---

## 1. Protocol Overview

**What it does:** Creator-owned contracts sell transferable ERC-721 membership time and stream each payment into creator, member, referral, and protocol allocations.

- **Users**: Creators publish immutable-economic tiers; supporters buy, gift, renew, transfer, and claim memberships.
- **Core flow**: A creator deploys a deterministic tier clone, supporters pay an approved ERC-20, and allocation liabilities vest over purchased time.
- **Key mechanism**: Chronological bounded accounting combines linear funding lots, expiration scheduling, permanent early-support shares, and permissionless maintenance.
- **Token model**: External payment tokens fund tier liabilities; a separately bound protocol token is bought and burned from earned fees/donations.
- **Admin model**: Each tier creator owns presentation/cap/grant/refund controls; a validated Safe owns factory asset policy and vault route/pause settings.

For a visual overview, see the [architecture diagram](architecture.svg).

### Contracts in Scope

| Subsystem | Key Contracts | nSLOC | Role |
|---|---|---:|---|
| Membership and accounting | MembershipFactory, MembershipTier, VestingLedger, ExpirationSchedule, RewardCurve, TierIdentity, MembershipTypes | 3,178 | Tier deployment, membership lifecycle, vesting and claims |
| Buyback and burn | ProtocolBuybackVault, ProtocolBurnRouter, PonsBuybackExecutor, BuybackIntegration, ProtocolLaunchValidation, BuybackTypes | 1,133 | Fee custody, route settlement and exact token burn |
| Media and rendering | OnchainMetadataRenderer, RendererRegistry, OnchainMediaStoreFactory, ImmutableCodeStore, validation/primitives and six engines | 2,464 | Immutable media provenance and deterministic onchain metadata |
| Deployment authority/config | RobinhoodProtocolAuthority, RobinhoodProtocolConfig, ProtocolSafeValidation | 131 | Fixed chain addresses, CREATE2 inputs and Safe validation |

### How It Fits Together

The core trick: tier economics never change, while bounded keeper calls move time-based liabilities forward without giving keepers custody.

### Tier Creation

```text
Creator -> MembershipFactory.createTier(config)
        |- validates token floor, fee rates, renderer and creator media
        |- Clones.cloneDeterministic(implementation, creator+salt)
        `- MembershipTier.initialize(config)
             `- VestingLedger.initialize(now)
```

### Membership Payment

```text
Supporter -> MembershipTier.create/renew/gift(...)
          |- checkpoints accounting and paid/grant time
          |- pulls exact payment-token amount
          |- VestingLedger.issueShares() + append funding lot
          `- mints or extends transferable membership position
```

### Accounting and Claims

```text
Anyone -> MembershipTier.processAccounting(maxSteps)
       `- VestingLedger processes chronological lot/expiration boundaries
            |- creator/member/referral/protocol allocations become earned
            `- expired positions retire and preserve earned member credit

Beneficiary -> claim path -> exact ERC-20 payout
```

### Buyback and Burn

```text
Anyone -> MembershipTier.releaseProtocolFees()
       `- ProtocolBuybackVault.recordEarnedFees()
            `- ProtocolBurnRouter.advance/buyback()
                 |- PonsBuybackExecutor.execute(route)
                 `- protocolToken.burn(acquired)
```

### Onchain Media

```text
Creator -> OnchainMediaStoreFactory.store(image)
        `- CREATE2 ImmutableCodeStore

MembershipTier.tokenURI() -> OnchainMetadataRenderer
                          |- validates immutable media bytes
                          `- deterministic engine -> base64 SVG + JSON
```

## 2. Threat & Trust Model

### Protocol Threat Profile

> Protocol classified as: **subscription/payment streaming** with **DEX/AMM settlement** and **NFT registry** characteristics

The core risk is cross-purpose liability accounting over time; the secondary surface is permissionless conversion through externally configured Pons/Uniswap V4 routes.

### Actors & Adversary Model

| Actor | Trust Level | Capabilities |
|---|---|---|
| Tier creator/owner | Bounded (tier-scoped) | Instant presentation, cap, pause, grant/refund and creator-claim actions; cannot change immutable economics or withdraw other liabilities |
| Protocol Safe | Trusted | Factory token policy/token binding and vault route, limit and pause controls execute immediately after Safe authorization |
| Supporter/member | Untrusted | Controls payments, referrals, gifts, transfers and own claims within immutable tier terms |
| Permissionless keeper | Untrusted | Advances bounded accounting and ready buybacks but chooses no custody destination |
| Renderer/media publisher | Untrusted | Supplies bounded renderer initcode or validated image bytes under caller-scoped registries |
| Pons/Uniswap dependencies | External trust boundary | Determine executable liquidity lifecycle and settlement behavior; runtime identities/routes are validated |

**Adversary Ranking**

1. **Accounting edge-state caller** — Exercises payment, expiry, refund, transfer and claim ordering around the shared chronological cursor.
2. **Malicious payment-token user** — Probes allowances, fee/rebase behavior and exact-transfer assumptions.
3. **Liquidity/MEV participant** — Influences Pons/Uniswap execution while permissionless callers choose timing and bounded routes.
4. **Compromised creator or Protocol Safe** — Uses immediate tier-scoped or system-wide configuration powers within explicit role bounds.
5. **Hostile renderer/media publisher** — Supplies maximal validated payloads and rendering inputs to stress deterministic read/render paths.

See [entry-points.md](entry-points.md) for the full entry-point map.

### Trust Boundaries

- **Protocol Safe -> factory/vault** — Safe validation protects ownership transfer, but token admission, route, limit and pause actions have no contract timelock (`MembershipFactory.sol:332-413`, `ProtocolBuybackVault.sol:428-501`).
- **Creator -> tier members** — Immutable payment/rate/duration terms bound creator power; refunds, grants, caps and purchase pause remain immediate tier-owner actions (`MembershipTier.sol:862-960`).
- **Tier -> linked ledger** — The tier delegates its liability bookkeeping to deployed `VestingLedger` code and guards every external token movement with exact balance deltas (`MembershipTier.sol:1084-1192`).
- **Vault -> Pons/Uniswap** — Runtime hashes, launch identity, route shape, approval cleanup and post-settlement balances constrain external execution (`PonsBuybackExecutor.sol:73-172,208-328`).

### Key Attack Surfaces

- **Chronological accounting crosses funding and expiration heaps** &nbsp;&#91;[I-4](invariants.md#i-4), [I-5](invariants.md#i-5)&#93; — `MembershipTier._catchUp:317-334` and `VestingLedger._process:400-498` interleave two state machines; trace equal timestamps, bounded work and cancellation generations.

- **Refund and retirement touch every protected liability class** &nbsp;&#91;[I-12](invariants.md#i-12), [E-2](invariants.md#e-2)&#93; — `MembershipTier._refund:1020-1049` and `VestingLedger.cancelFunding:1132-1170` combine time checkpointing, cancellation residues, reward retirement and exact payout.

- **Reward weight is permanent while eligibility changes** &nbsp;&#91;[I-1](invariants.md#i-1), [I-5](invariants.md#i-5)&#93; — `VestingLedger.issueShares/_setWeight:949-978` clears carry when eligible weight changes; trace zero-gross time, expiry and reactivation sequences.

- **Creator and factory claims share one accounting budget** &nbsp;&#91;[I-4](invariants.md#i-4)&#93; — `MembershipFactory.claimEverything:118-157` and `MembershipTier._claimRewards:822-837` translate partial progress and ordered selections; check atomic rollback across nested tiers.

- **Buyback inventory spans raw balances, canonical WETH/native assets and two source buckets** &nbsp;&#91;[I-6](invariants.md#i-6), [I-7](invariants.md#i-7), [E-3](invariants.md#e-3)&#93; — `ProtocolBuybackVault._bookLegs/_normalizeReceipt:310-339,595-604` is the reconciliation center worth tracing across partial settlement.

- **Permissionless buyback timing meets external liquidity lifecycle** &nbsp;&#91;[X-4](invariants.md#x-4)&#93; — `ProtocolBurnRouter._purchaseBatch:200-221` and `PonsBuybackExecutor.execute:98-172` combine revisions, cooldowns, graduation and caller-provided pool keys.

- **Immutable media provenance depends on three correlated indexes** &nbsp;&#91;[I-9](invariants.md#i-9), [X-2](invariants.md#x-2)&#93; — `OnchainMediaStoreFactory.store:34-77` deduplicates deterministic code stores while indexing key, store record and creator list.

- **Renderer registry accepts arbitrary bounded initcode** &nbsp;&#91;[I-10](invariants.md#i-10)&#93; — `RendererRegistry.deployAndRegister:41-69` validates only runtime existence and schema; trace hostile schema implementations against every consuming preview/render call.

### Upgrade Architecture Concerns

- **ERC-1167 clones are not upgradeable** — `MembershipFactory.implementation` is immutable and each clone is initialized atomically; a new implementation requires a new factory release (`MembershipFactory.sol:31,66-108,220-233`).

### Protocol-Type Concerns

**As a payment-streaming membership protocol:**

- `VestingLedger` preserves scaled residues across earned, cancellation, carry, dust and unassigned buckets; every claim/refund combination should reconcile to `liability()` (`VestingLedger.sol:1000-1217`).
- Contribution mode permits zero gross to buy one period but explicitly issues no reward shares/funding, making zero/nonzero boundary sequences important (`MembershipTier.sol:649-666,1051-1082`).

**As a DEX/AMM settlement consumer:**

- At most two validated V4 pools can bridge an asset to native/WETH before the current Pons lifecycle venue buys the protocol token (`PonsBuybackExecutor.sol:98-298`).
- The vault accepts partial input below minimum only for a bonding-to-graduation transition; trace lifecycle changes between executor calls (`ProtocolBuybackVault.sol:251-309`).

### Temporal Risk Profile

**Deployment & Initialization:**

- Clone creation and initialization are atomic, the shared implementation disables initialization, and deterministic identities are checked after initialization (`MembershipFactory.sol:220-233`, `MembershipTier.sol:127-194`).
- The factory deploys vault/router in its constructor and may defer protocol-token binding; buybacks remain paused until explicit Safe configuration (`MembershipFactory.sol:66-108`, `ProtocolBuybackVault.sol:63-143`).

### Composability & Dependency Risks

**Dependency Risk Map:**

> **Payment ERC-20s** — via `MembershipTier._pullExact/_pushExact`
> - Assumes: standard balance/allowance behavior and no callback-based cross-entry mutation
> - Validates: exact sender, tier and recipient balance deltas
> - Mutability: external token implementation
> - On failure: reverts atomically

> **Pons launch contracts** — via `ProtocolLaunchValidation` and `PonsBuybackExecutor`
> - Assumes: deployed launch identities and lifecycle reports match retained interfaces
> - Validates: factory/curve/token relations and pinned dependency codehashes
> - Mutability: externally governed/deployed system
> - On failure: reverts; vault inventory remains accounted

> **Uniswap V4 / Universal Router / Permit2** — via `PonsBuybackExecutor._swap`
> - Assumes: exact pool-key semantics and router settlement
> - Validates: route shape, balance deltas, approval cleanup and router balance restoration
> - Mutability: external deployments pinned by runtime hash where configured
> - On failure: reverts atomically

> **Safe 1.5.0** — via `ProtocolSafeValidation`
> - Assumes: canonical singleton/handler storage semantics
> - Validates: runtime hashes, singleton, version, owners, threshold, modules, handler and guard
> - Mutability: signer set may rotate inside the accepted Safe
> - On failure: ownership nomination/acceptance reverts

**Token Assumptions:** exact-transfer validation rejects fee-on-transfer/rebasing deltas during a call, but an enabled asset can still change behavior or balance asynchronously outside a call.

## 3. Invariants

> ### Full invariant map: **[invariants.md](invariants.md)**
>
> - **26 Enforced Guards** (`G-1` ... `G-26`)
> - **12 Single-Contract Invariants** (`I-1` ... `I-12`)
> - **4 Cross-Contract Invariants** (`X-1` ... `X-4`)
> - **3 Economic Invariants** (`E-1` ... `E-3`)
>
> Every inferred block cites a concrete delta pair, guard lift, state edge, temporal predicate, or verified caller/callee pair. No verified `On-chain=No` block was retained.

## 4. Documentation Quality

| Aspect | Status | Notes |
|---|---|---|
| README | Present | `README.md` documents toolchain, deployment, lifecycle and checks |
| NatSpec | 143 annotations | Strong on public mechanisms; linked ledger internals rely more on structural names and events |
| Spec/Whitepaper | Missing in Foundry root | Deployment evidence README is operational, not a protocol specification |
| Inline Comments | Adequate | Complex accounting, renderer and settlement code explain major intent and bounds |

## 5. Test Analysis

| Metric | Value | Source |
|---|---:|---|
| Test files | 95 | Portable file scan |
| Test functions | 578 | Portable source scan |
| Line coverage | Unavailable — stack-too-deep, then IR/Yul stack failure | `forge coverage`, `forge coverage --ir-minimum` |
| Branch coverage | Unavailable — same compiler failures | Coverage tool |

### Test Depth

| Category | Count | Contracts Covered |
|---|---:|---|
| Unit/integration test files | 73 | Broad membership, accounting, deployment, renderer and buyback coverage |
| Fork | 2 call sites | External Pons/Uniswap integration paths |
| Stateless Fuzz | 23 | Membership, accounting, renderer and validation paths |
| Stateful Fuzz (Foundry) | 4 | Existing invariant functions |
| Stateful Fuzz (Echidna) | 0 | No pre-existing suite |
| Stateful Fuzz (Medusa) | 0 | No pre-existing suite |
| Formal Verification | 0 | None detected |

### Gaps

- No pre-existing Echidna/Medusa campaign targets cover long mixed membership-accounting sequences.
- No formal model covers the linked vesting ledger or buyback inventory conservation.
- Coverage percentages are unavailable because both standard and IR-minimum instrumentation fail compilation; test existence is independently confirmed.

## 6. Developer & Git History

> Repo shape: normal development — 33 source-touching commits among 168 commits over 19 days on `main` at `29e5ef5`.

### Contributors

| Author | Commits | Source Lines (+/-) | % of Source Additions |
|---|---:|---:|---:|
| Flick | 161 | +11,303 / -2,241 | 100% |
| 0xFlick | 7 | No current-source additions attributed | 0% |

### Review & Process Signals

| Signal | Value | Assessment |
|---|---:|---|
| Unique contributors | 2 | One source author identity dominates |
| Merge commits | 8 of 168 | Some merge/review structure is visible |
| Repo age | 2026-08-25 to 2026-09-13 | Rapid 19-day development window |
| Source-touching commits | 33 | Active and recent |
| Test co-change rate | 100% | Every source-changing commit also changed tests; this is co-modification, not coverage |

### File Hotspots

| File | Modifications | Note |
|---|---:|---|
| `MembershipTier.sol` | 22 | Core lifecycle/accounting integration |
| `IMembershipTier.sol` | 18 | Public contract surface |
| `MembershipTypes.sol` | 16 | Shared ABI/accounting schema |
| `MembershipFactory.sol` | 13 | Deployment and admission policy |
| `VestingLedger.sol` | 7 | Linked liability accounting |
| `ProtocolBuybackVault.sol` | 6 | External settlement custody |

### Security-Relevant Commits

| SHA | Date | Subject | Score | Key Signal |
|---|---|---|---:|---|
| `8f016bf` | 2026-08-26 | stateful security gates | 18 | Multi-domain test/accounting change |
| `26c9239` | 2026-09-09 | deferred token binding | 17 | Runtime guards and access changes |
| `81e0cad` | 2026-08-26 | pre-testnet audit remediation | 17 | Security and accounting changes |
| `1ce7e1b` | 2026-08-26 | bind gift/refund terms | 15 | Authorization and accounting change |
| `ae8ddc9` | 2026-09-09 | permissionless burn flow | 14 | New guarded fund-flow surface |
| `6148dd4` | 2026-09-10 | time-vested allocations | 12 | 1,950-line accounting feature |

### Dangerous Area Evolution

| Security Area | Commits | Key Files |
|---|---:|---|
| Access control | 25 | MembershipFactory, MembershipTier, ProtocolBuybackVault |
| Fund flows | 24 | MembershipTier, PonsBuybackExecutor, ProtocolBuybackVault |
| Price/amount logic | 26 | Membership and buyback contracts/libraries |
| Signatures/identity | 27 | Factory, tier, renderer/media and external interfaces |

### Security Observations

- **Single-author source concentration** — current source additions are attributed entirely to Flick.
- **Test co-change is consistent** — all 33 source-touching commits also modify tests, independent of runtime coverage.
- **MembershipTier is the dominant hotspot** — 22 modifications and the largest combined lifecycle/accounting surface.
- **Recent accounting expansion** — `6148dd4`, `170ae94`, `8dacbd7` and `d83c922` changed vesting/claim paths within four days.
- **No TODO/FIXME/HACK markers** — the git analyzer found no current-source technical-debt markers.

### Cross-Reference Synthesis

- **MembershipTier dominates churn and invariants** — payment, refund, expiry, claim and transfer paths converge there, making mixed sequences the highest-leverage fuzz target.
- **VestingLedger changed with every recent accounting feature** — its chronological and conservation properties should anchor the stateful suite.
- **Buyback access and fund flows evolved together** — permissionless execution depends on exact vault/executor reconciliation rather than caller trust.

## X-Ray Verdict

**ADEQUATE** — Roles and boundaries are explicit and unit/fuzz/invariant tests exist, but there is no Foundry-root protocol specification, pre-existing long-running stateful campaign, formal model, or obtainable coverage percentage.

**Structural facts:**
1. 6,906 protocol-authored nSLOC across membership/accounting, buyback, rendering/media and deployment configuration.
2. 95 test files contain 578 test functions, including 23 stateless fuzz tests and 4 Foundry invariants.
3. One author accounts for all current-source additions across 33 source-touching commits in a 19-day history.
4. Membership tiers are immutable ERC-1167 clones of one factory-pinned implementation; no upgrade method exists.
5. The state-changing ABI exposes 60 functions across eight contracts, with 22 permissionless entry points.
