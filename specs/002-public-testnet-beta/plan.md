# Implementation Plan: Public Testnet Beta

**Branch**: `main` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-public-testnet-beta/spec.md`

## Summary

Launch Backed By Fans at `backedbyfans.xyz` as a Robinhood Chain testnet beta and replace the
protocol's single global USDG dependency with an operator-managed, enumerable accepted-payment-token
set. Each tier selects one enabled token at publication and permanently stores that token and its raw
price. The web application composes the factory's accepted-token state with live ERC-20 metadata and,
for ERC-8056 Stock Tokens, the live UI multiplier. All settlement remains in raw units; scaling and
rounding are presentation concerns shared by every creator, supporter, and account surface.

The implementation preserves the existing tier contract's token boundary, adds the accepted-token set
to `MembershipFactory`, updates deployment manifests and direct-read authenticity rules, and removes
hard-coded six-decimal USDG presentation from the web. The public web release uses a staged Vercel
deployment that is tested before promotion and has a routing-layer rollback procedure. Testnet
contract broadcast remains an explicit operator checkpoint; mainnet writes are excluded.
The six confirmed testnet launch tokens are seeded by the launch manifest. Privileged token status and
fee operations use reviewed CLI calldata through the protocol Safe or authorized deployer; this plan
adds no Backed By Fans operator web interface and no internally deployed USDG token.

The same replacement protocol also makes each tier's renderer address owner-updatable. The current
tier owner may replace presentation after the candidate passes the existing schema and configuration
checks; successful updates emit old/new renderer identity and an ERC-4906 batch metadata refresh.
Tier art/media inputs and every economic or membership term remain unchanged.

## Technical Context

**Language/Version**: Solidity 0.8.36; TypeScript 6.0.2; React 19.2.8; Next.js 16.3.3; Bun 1.3.14

**Primary Dependencies**: Foundry, OpenZeppelin Contracts, wagmi 2.19.5, viem 2.55.19,
RainbowKit 2.2.11, TanStack Query 5.102.4, Vercel

**Storage**: Robinhood Chain contract state and events; checked-in chain/version deployment records
and generated ABIs; browser-local unpublished creator drafts. No database, indexer, account service,
or custodial storage is introduced.

**Testing**: Foundry unit/fuzz/invariant/deployment tests; shell deployment-fixture tests; Vitest;
Testing Library; Playwright; TypeScript, ESLint, Prettier, Next production build; approved testnet
chain verification and production-domain browser smoke tests recorded separately

**Target Platform**: Robinhood Chain testnet (`46630`) for protocol and wallet activity; modern web
browsers on a Vercel-hosted Next.js application. A mainnet (`4663`) deployment profile is inspected
but not deployed.

**Project Type**: Solidity protocol plus browser-only Next.js web application in one repository

**Performance Goals**: Keep direct reads bounded to the six launch tokens plus the current page of
tiers; batch independent token metadata, balance, allowance, and multiplier reads; avoid introducing
an additional network service into creator or supporter journeys.

**Constraints**: One immutable payment token per tier; raw-unit accounting only; renderer mutable only
by the current tier owner while art/media and economics remain fixed; no oracle-based USD conversion;
no arbitrary creator-supplied payment tokens; ERC-8056 multiplier affects display only; no silent
token fallback; wagmi/viem owns user wallet lifecycle; no backend, indexer, internal USDG deployment,
or operator web UI; Safe/CLI protocol administration only; explicit operator approval/password before
testnet broadcast and authenticated Vercel deployment; no mainnet transaction in this feature.

**Scale/Scope**: Six initially enabled external testnet tokens (USDG plus five faucet Stock Tokens), the
existing direct onchain tier catalog, and all current payment-bearing creator, membership, account,
management, deployment, CLI-administration, and operational surfaces.

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design._

| Principle or boundary                                   | Plan evidence                                                                                                                                                                                                                                                               | Result |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I. Creator ownership and durable membership             | Review identifies token, symbol, current displayed price, immutable raw price, period, and fees. The current tier owner controls renderer presentation without changing member rights or economics. Stock Tokens are not described as equity, yield, or fixed-dollar value. | Pass   |
| II. Onchain fidelity and chain-scoped identity          | Accepted tokens and active factory are keyed by chain/version; existing deployments remain immutable; tiers store token and raw terms; writes continue through wagmi/viem receipts.                                                                                         | Pass   |
| III. MIT licensed and open source                       | New protocol and web work remains under the repository's MIT license.                                                                                                                                                                                                       | Pass   |
| IV. Plain language and honest UX                        | Token choice is presented at pricing; testnet and faucet guidance appear when relevant; renderer management says it changes all existing and future artwork; technical multiplier and raw-unit details are progressively disclosed.                                         | Pass   |
| V. Smallest complete slice and evidence-bounded quality | The accepted-token set lives in the existing factory, tier accounting remains intact, and no backend, oracle, swap, migration, or feature flag is added. Evidence is separated by source, local, chain, and production-browser class.                                       | Pass   |
| Deployment and production authorization                 | The quickstart stops before testnet broadcast, authenticated Vercel staging, and canonical-domain promotion. Mainnet is inspection-only.                                                                                                                                    | Pass   |
| Direct-onchain product boundary                         | Enumeration and amount data come from contracts and token calls; no mandatory API, database, or indexer is added.                                                                                                                                                           | Pass   |

No constitution violations require a complexity exception.

## Architecture and Implementation Strategy

### 1. Accepted payment tokens belong to the factory

Extend `MembershipFactory` with an append-only address list and per-address listed/enabled state.
Constructor input seeds the launch set, owner-only status changes affect new publication, and listed
tokens remain enumerable after disablement so existing tiers can still be interpreted. Do not add a
second registry contract: the factory already defines which tiers are official and is the authority
that must reject a disabled token during `createTier`.

The web reads this state for creator and supporter flows but exposes no protocol administration UI.
Launch seeding occurs in the deployment script. Later status and token-specific fee operations are
prepared as reviewed CLI calldata for the protocol Safe or authorized deployer. Before an enable
transaction is prepared, the CLI preflight must read code, name, symbol, decimals, and claimed
ERC-8056 multiplier state and refuse an incompatible token.

`MembershipTypes.TierConfig` gains `paymentToken`. The factory validates that token immediately before
consuming the creator salt, then passes it to the existing `MembershipTierDeployer`. The tier's current
immutable `paymentToken` and raw accounting remain unchanged. Factory-held protocol fees become
token-addressed withdrawals.

### 2. Protocol state stays raw; the web owns display conversion

The protocol never calls `uiMultiplier` and never changes prices after publication. The web builds an
accepted-token read model from factory status plus ERC-20 `name`, `symbol`, and `decimals`. ERC-165
interface detection identifies ERC-8056 support, after which current and scheduled multiplier values
are read live from the token. Optional ERC-8056 conversion helpers are not required.

A single TypeScript amount module performs displayed-to-raw conversion, raw-to-displayed conversion,
rounding, parsing, formatting, and labels. Every payment-bearing surface consumes the same model. A
token or multiplier read failure is scoped to that token/action, shown clearly, and recoverable by a
normal retry; it never substitutes USDG or locks unrelated controls.

### 3. Renderer presentation follows current tier ownership

Change `MembershipTier.renderer` from immutable storage to owner-controlled storage and add
`setRenderer(address)`. The setter checks deployed code, the factory's renderer schema, and the new
renderer's acceptance of the tier's existing art/media configuration before changing state. It does
not require renderer-registry membership. A failed call leaves the current renderer untouched; a
successful call emits previous/replacement addresses and `BatchMetadataUpdate(1, totalMinted)` when
credentials exist.

Tier management reuses the existing renderer discovery, defaults, Custom address, and preview
machinery against the tier's current immutable art/media inputs. It makes the scope plain—every
existing and future credential can render differently—but does not manufacture a platform approval
claim. The current owner makes the aesthetic decision and submits through the established wallet
lifecycle. Ownership transfer automatically transfers renderer-update authority.

### 4. Deployment records become multi-token and versioned

Deployment configuration contains chain-specific initial token manifests. Testnet contains external
USDG (`0x7E955252E15c84f5768B83c41a71F9eba181802F`) plus AMD
(`0x71178BAc73cBeb415514eB542a8995b82669778d`), NFLX
(`0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93`), PLTR
(`0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0`), AMZN
(`0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02`), and TSLA
(`0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`). The workflow validates those exact contracts on
chain and fails closed; it does not deploy an internal USDG substitute. The future mainnet profile
contains only canonical USDG. New factory creation code and salt produce a new active protocol
version; pre-beta contracts remain onchain but are not promoted as active.

The existing `deploy-protocol.sh` workflow continues to provide dry-run, broadcast, verification, and
promotion. It must print the complete intended write set and stop before broadcast for operator
approval and encrypted-account password entry. After successful promotion, regenerated Wagmi contract
information is mandatory before web promotion.

### 5. The public beta is a promoted web artifact, not a second application

Configure the Vercel project with `web` as its root and production-safe public environment values for
chain `46630`, active protocol records, RPC access, WalletConnect, and
`NEXT_PUBLIC_SITE_URL=https://backedbyfans.xyz`. Build one staged artifact, exercise the documented
routes against that artifact, then promote that same artifact to the canonical domain. Keep the
previous known-good deployment ID for Vercel rollback; web rollback changes routing only and never
claims to revert onchain state.

## Project Structure

### Documentation (this feature)

```text
specs/002-public-testnet-beta/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── accepted-payment-tokens.md
│   ├── mutable-tier-renderer.md
│   ├── scaled-token-amounts.md
│   └── beta-release.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Created by the later speckit-tasks phase
```

### Source Code (repository root)

```text
contracts/
├── src/
│   ├── MembershipFactory.sol
│   ├── MembershipTier.sol
│   ├── MembershipTierDeployer.sol
│   ├── RobinhoodProtocolConfig.sol
│   ├── interfaces/
│   │   ├── IMembershipFactory.sol
│   │   └── IMembershipTier.sol
│   └── types/
│       └── MembershipTypes.sol
├── script/
│   └── DeployDirectProtocol.s.sol
├── scripts/
│   ├── deploy-protocol.sh
│   ├── manage-payment-tokens.sh
│   ├── public-chain-common.sh
│   └── test-deploy-protocol.sh
├── config/operational-state/
├── deployments/protocol/
└── test/
    ├── mocks/
    ├── deployment/
    ├── e2e/
    ├── invariants/
    └── *.t.sol

web/
├── src/
│   ├── app/
│   ├── components/
│   ├── contracts.ts
│   ├── features/
│   │   ├── creator/
│   │   ├── membership/
│   │   └── protocol/
│   └── lib/
│       ├── authenticity.ts
│       ├── config.ts
│       └── direct-read.ts
├── scripts/
├── tests/
└── playwright.config.ts

docs/
├── pilots/testnet-pilot.md
└── runbooks/
    ├── deployment.md
    ├── incident-response.md
    ├── mainnet-readiness.md
    └── monitoring.md
```

**Structure Decision**: Keep the established contracts/web monorepo. Protocol token authority and
raw accounting stay in Solidity; all display conversion and interaction stay in the browser; release
state remains in the current checked-in deployment records and runbooks. No new service or package is
needed.

## Delivery Phases

### Phase A — Protocol model and invariants

1. Add accepted-token enumeration/status and events to the factory interface and implementation.
2. Add the selected token to tier configuration and publication events; remove the factory-global
   payment-token assumption.
3. Make protocol-fee inspection and withdrawal token-specific.
4. Make the renderer address owner-updatable with schema/config validation and metadata refresh while
   preserving immutable art/media and all economic state.
5. Extend adversarial-token, factory, payment, claim, fee, renderer, ownership-transfer, fuzz,
   invariant, and local lifecycle tests across multiple tokens, disablement, exact-transfer failures,
   and renderer replacement.

### Phase B — Deployment profiles and generated interfaces

1. Add chain-specific initial token manifests and validate address, code, metadata, capabilities,
   duplicates, and expected chain before generating a payload.
2. Validate the supplied six-token testnet address set and fail closed on code, metadata, or claimed
   ERC-8056 incompatibility.
3. Version factory deployment identity and update dry-run/promotion records without rewriting old
   deployments.
4. Exercise local and fork deployment paths, including Nitro byte/gas limits and multi-token state.
5. Stop at the operator gate before testnet broadcast. Resume only after explicit authorization; then
   verify/promote and regenerate checked-in Wagmi interfaces.

### Phase C — Shared token read and amount model

1. Build factory enumeration and per-token metadata/capability reads.
2. Implement one positive-amount BigInt conversion and formatting module from
   [scaled-token-amounts.md](./contracts/scaled-token-amounts.md).
3. Capture a common read block where practical for tier terms and token presentation state; make
   token-read failures explicit and retryable.
4. Replace factory-global USDG authenticity checks with registered-tier, listed-token, and exact
   tier-token checks.

### Phase D — Creator, supporter, and account UX

1. Add accepted-token selection to price setup, sorting positive connected-wallet balances first.
2. Make review and publication show the selected token, current displayed amount, and immutable raw
   terms; re-read enabled status and multiplier before submission.
3. Replace hard-coded USDG/6-decimal labels, parsing, balances, allowances, shortfalls, proceeds,
   claims, refunds, fees, and transaction messages throughout existing routes.
4. Add plain testnet/faucet guidance only where network, gas, or payment-token funding is relevant.
5. Add owner-only renderer replacement to tier management using existing renderer choices and
   preview behavior, with clear whole-tier artwork scope and no extra approval ceremony.
6. Preserve existing creator studio, renderer, `/render`, and `/skill` designs and routes.

### Phase E — Public beta operations

1. Update deployment, monitoring, incident, pilot, and mainnet-readiness documentation.
2. Configure the reviewed Vercel target, then stop for explicit authorization before creating an
   authenticated staged deployment; do not expose secrets through public environment variables.
3. Build the staged deployment and run production-like route, wallet, accessibility, responsive, and
   failure-state checks on the staged URL.
4. Stop for explicit approval before promoting the tested artifact to `backedbyfans.xyz`.
5. Run canonical-domain smoke journeys and record the prior known-good deployment for rollback.

## Evidence Plan

| Claim                                                        | Required evidence                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Registry and raw accounting behavior                         | Focused Foundry unit/fuzz/invariant tests and ABI/source inspection                                                       |
| Deployment payload fits Robinhood Nitro and seeds six tokens | Local deployment tests, dry-run output, and fork rehearsal                                                                |
| Exact six external testnet tokens are configured             | Checked-in confirmed addresses plus code/metadata/ERC-8056 preflight before broadcast                                     |
| Web amount math and rounding are consistent                  | Table-driven Vitest coverage including clarified examples and multiplier transitions                                      |
| Creator/supporter flows use the selected token               | Component tests plus Playwright against local contracts                                                                   |
| Renderer replacement changes presentation only               | Foundry owner/ownership-transfer/configuration/state-preservation tests plus tier-management component and browser replay |
| Testnet protocol is active                                   | Approved transaction receipts, post-deployment direct reads, promoted deployment record, and generated-interface check    |
| Fresh faucet and all five Stock Token journeys work live     | Staged testnet evidence for a fresh faucet wallet and create/join/renew with each Stock Token                             |
| Public beta works at the domain                              | Named creator, supporter, account, renderer, skill, faucet, and token-selection journeys at the canonical domain          |
| Rollback works                                               | Staged Vercel exercise or documented production rollback status; never described as onchain rollback                      |
| Mainnet remains untouched/USDG-only in profile               | Mainnet manifest inspection and absence of mainnet broadcast evidence                                                     |

## Complexity Tracking

No constitution violations or justified complexity additions.
