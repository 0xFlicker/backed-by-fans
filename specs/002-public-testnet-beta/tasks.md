---
description: "Dependency-ordered implementation tasks for the public Robinhood Chain testnet beta"
---

# Tasks: Public Testnet Beta

**Input**: Design documents from `/specs/002-public-testnet-beta/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: The specification defines independent tests and measurable outcomes for every story, so
test tasks are required and precede their corresponding implementation tasks.

**Organization**: Tasks are grouped by user story. Shared protocol, generated-interface, direct-read,
and amount foundations are completed once before story work. User Story 6 precedes User Story 5 in
execution because the mutable renderer must be included in the one operator-approved beta protocol
deployment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it uses different files and does not depend on an incomplete
  task in the same phase.
- **[Story]**: Maps to the numbered user story in `spec.md`.
- Every task names the concrete repository path it changes or validates.

## Phase 1: Setup and Release Inputs

**Purpose**: Establish the current baseline and create the chain/token fixtures used by the protocol
and browser test layers.

- [x] T001 Run the existing `forge build`, `forge test`, `bun run generate:check`, `bun run format`, `bun run lint`, `bun run typecheck`, `bun run test`, and `bun run build` baselines in `contracts/` and `web/`, preserving unrelated user changes and recording any pre-existing failure in the implementation handoff
- [x] T002 [P] Add fail-closed chain-scoped launch manifests containing exactly external testnet USDG `0x7E955252E15c84f5768B83c41a71F9eba181802F`, AMD `0x71178BAc73cBeb415514eB542a8995b82669778d`, NFLX `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93`, PLTR `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0`, AMZN `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02`, and TSLA `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E` for testnet and canonical USDG only for mainnet in `contracts/config/payment-tokens/46630.json` and `contracts/config/payment-tokens/4663.json`
- [x] T003 [P] Add the ERC-8056 core/pending interfaces and an adjustable 18-decimal scaled-token test double in `contracts/src/interfaces/IERC8056.sol` and `contracts/test/mocks/MockScaledToken.sol`

**Checkpoint**: Baseline behavior is known, manifests are chain-scoped, and tests can model a
multiplier change without depending on a live issuer contract.

---

## Phase 2: Foundational Protocol and Browser Model

**Purpose**: Build the accepted-token protocol, raw/scaled amount model, direct-read composition, and
generated interfaces required by every user story.

**⚠️ CRITICAL**: No user story implementation begins until this phase passes locally.

### Protocol tests first

- [x] T004 [P] Add failing accepted-token enumeration, initial-list, idempotent same-state enable/disable, duplicate, disabled-publication, immutable-tier-token, token-specific-fee, and event tests in `contracts/test/FactoryAndFees.t.sol`
- [x] T005 [P] Add failing multi-token exact-transfer, claim, refund, proceeds, fee-isolation, and conservation tests in `contracts/test/PaymentsAndTime.t.sol`, `contracts/test/ClaimsAndWithdrawals.t.sol`, `contracts/test/models/MembershipModel.sol`, `contracts/test/invariants/AccountingInvariant.t.sol`, and `contracts/test/invariants/MembershipInvariant.t.sol`
- [x] T006 [P] Add failing exact-address six-token testnet manifest, no-internal-USDG, USDG-only mainnet, incompatible/unconfirmed manifest rejection, factory-initcode, CREATE2 identity, Nitro size, and deployment-invariant tests in `contracts/test/deployment/DeploymentScripts.t.sol` and `contracts/scripts/test-deploy-protocol.sh`

### Protocol implementation

- [x] T007 Implement `TierConfig.paymentToken`, append-only listed/enabled token state, bounded enumeration, owner status changes, publication validation before salt consumption, token-addressed fee withdrawal, and token-aware events/errors in `contracts/src/types/MembershipTypes.sol`, `contracts/src/interfaces/IMembershipFactory.sol`, `contracts/src/MembershipFactory.sol`, and `contracts/src/MembershipTierDeployer.sol`
- [x] T008 Update shared tier builders, adversarial fixtures, and invariant/model initialization to create tiers with explicit payment tokens in `contracts/test/helpers/MembershipTestConfig.sol`, `contracts/test/mocks/AdversarialERC20.sol`, `contracts/test/mocks/AdversarialFeeToken.sol`, `contracts/test/models/MembershipModel.sol`, `contracts/test/invariants/AccountingInvariant.t.sol`, and `contracts/test/invariants/MembershipInvariant.t.sol`
- [x] T009 Replace single-USDG deployment assumptions with exact validated chain manifests, launch-time seeding of all six external testnet tokens, no internal USDG deployment, new factory salt/initcode, complete intended-write logging, and token-list postconditions in `contracts/src/RobinhoodProtocolConfig.sol`, `contracts/script/DeployDirectProtocol.s.sol`, `contracts/scripts/public-chain-common.sh`, and `contracts/scripts/deploy-protocol.sh`

### Browser tests first

- [x] T010 [P] Add table-driven failing tests for nearest-raw conversion, rational display scaling, carry, trimming, three meaningful fractional digits, zero/one-unit boundaries, and scheduled multipliers in `web/src/lib/token-amount.test.ts`
- [x] T011 [P] Add failing composed-read tests for factory pagination, ERC-20 metadata, ERC-165 capability detection, current/pending multipliers, connected-wallet balances, stable ordering, captured blocks, and token-scoped read failures in `web/src/lib/payment-token-read.test.ts`
- [x] T012 [P] Add failing active-protocol and tier-authenticity tests that remove the factory-global USDG binding and require each tier token to remain factory-listed even when disabled in `web/src/lib/config.test.ts`, `web/src/lib/authenticity.test.ts`, `web/src/lib/direct-read.test.ts`, and `web/src/features/protocol/protocol-read.test.ts`

### Browser implementation

- [x] T013 Implement exact positive-BigInt parse, displayed-to-raw, raw-to-displayed, scheduled-display, and clarified rounding functions without feeding rounded text into wallet values in `web/src/lib/token-amount.ts`
- [x] T014 Implement the composed `AcceptedPaymentToken` direct-read model, ERC-8056 interface IDs, metadata/multiplier validation, balance-aware ordering, and retryable token-scoped failures in `web/src/lib/payment-token-read.ts`
- [x] T015 Replace `ProtocolDependencySnapshot.paymentToken` and deployment-wide USDG authenticity with accepted-token enumeration and listed-tier-token checks in `web/src/contracts/types.ts`, `web/src/lib/config.ts`, `web/src/lib/authenticity.ts`, `web/src/lib/direct-read.ts`, and `web/src/features/protocol/protocol-read.ts`
- [x] T016 Update generated-contract coverage for the new factory constructor, token registry methods/events, tier config tuple, and token-specific fee withdrawal, then regenerate ABI-only local bindings in `web/wagmi.config.ts`, `web/src/contracts-generation.test.ts`, and `web/src/contracts.ts`
- [x] T017 Update the Anvil lifecycle fixture to deploy at least one six-decimal unscaled token and one adjustable scaled token, seed the factory list, and expose their addresses to browser tests in `web/tests/e2e/helpers/anvil.ts` and `contracts/test/e2e/LocalLifecycleEvidence.t.sol`

**Checkpoint**: A local factory supports multiple immutable per-tier payment tokens, every amount can
be represented as exact raw units plus current display state, and the browser has generated interfaces
and direct reads without a global USDG assumption.

---

## Phase 3: User Story 1 — Complete a Fresh-Wallet Beta Journey (Priority: P1) 🎯 MVP

**Goal**: A new wallet can identify Robinhood Chain testnet, obtain gas and payment assets from the
official faucet, and complete a membership purchase without an account or operator funding.

**Independent Test**: Begin with an unfunded wallet, follow public faucet guidance, return with faucet
assets, switch to chain `46630`, and complete one membership purchase using the tier's token.

### Tests for User Story 1

- [x] T018 [P] [US1] Add failing testnet-label, gas-shortfall, selected-token-shortfall, official-faucet-link, no-custom-faucet, and wallet-network-switch component tests in `web/src/components/WalletReadiness.test.tsx`, `web/src/components/ChainRouteBoundary.test.tsx`, and `web/src/features/membership/MembershipExperience.test.tsx`
- [x] T019 [P] [US1] Add a failing fresh-wallet browser journey covering no assets, faucet guidance, network switch, returned faucet-token recognition, approval, and purchase in `web/tests/e2e/fresh-wallet-beta.spec.ts`

### Implementation for User Story 1

- [x] T020 [P] [US1] Add one chain-scoped funding-readiness helper that distinguishes ETH gas from the selected payment token and exposes the official faucet URL in `web/src/lib/testnet-funding.ts`
- [x] T021 [US1] Replace global USDG readiness copy with selected-token balance, gas balance, testnet status, and contextual official-faucet guidance in `web/src/components/WalletReadiness.tsx`
- [x] T022 [P] [US1] Surface the same selected-token and gas guidance at creator publication without adding account or operator-funding requirements in `web/src/features/creator/CreateTierWizard.tsx`
- [x] T023 [US1] Integrate fresh-wallet readiness into supporter approval/purchase states while retaining wagmi/viem chain switching, submission, receipt, replacement, cancellation, and revert handling in `web/src/features/membership/MembershipExperience.tsx`
- [x] T024 [US1] Run and pass the independent local fresh-wallet journey in `web/tests/e2e/fresh-wallet-beta.spec.ts` and record only local-browser evidence in the implementation handoff

**Checkpoint**: A fresh local wallet can fund itself through the official-faucet path and purchase a
membership without any Backed By Fans account, mint endpoint, or operator action.

---

## Phase 4: User Story 2 — Price a Membership in an Accepted Token (Priority: P1)

**Goal**: A creator can choose an enabled token, see held tokens first, enter a displayed amount, and
publish immutable raw payment terms with the selected token.

**Independent Test**: Seed a creator wallet with all representative accepted tokens, publish a tier
for each, and confirm precision, symbol, scaled conversion, review terms, and immutable tier token.

### Tests for User Story 2

- [x] T025 [P] [US2] Add failing creator-form tests for selected token identity, token-specific decimals, nearest-raw conversion, multiplier refresh before publication, disabled-token rejection, and draft persistence in `web/src/features/creator/config.test.ts` and `web/src/features/creator/management.test.ts`
- [x] T026 [P] [US2] Add failing creator UI tests for held-token-first ordering, six launch choices, symbols/precision, current scaled amount, exact raw technical detail, and immutable management display in `web/src/features/creator/CreateTierWizard.test.tsx`
- [x] T027 [P] [US2] Add a failing browser journey that publishes unscaled and scaled-token tiers and verifies the tier's immutable token/raw price in `web/tests/e2e/payment-token-selection.spec.ts`

### Implementation for User Story 2

- [x] T028 [US2] Replace `priceUsd` with selected-token/displayed-price form state and evaluate publication config through `token-amount.ts` in `web/src/features/creator/config.ts`
- [x] T029 [P] [US2] Build the normal accepted-token picker with held balances first, token name/symbol, no arbitrary address field, and token-scoped retry states in `web/src/features/creator/PaymentTokenPicker.tsx`
- [x] T030 [US2] Integrate token selection, displayed-price input, refreshed final review, exact raw technical detail, and explicit token tuple into `web/src/features/creator/CreateTierWizard.tsx`
- [x] T031 [US2] Reconcile publication against the emitted tier token/raw terms and remove factory-global USDG assumptions from `web/src/features/protocol/deployment-write-guard.ts`, `web/src/features/protocol/registry-reconciliation.ts`, and their tests
- [x] T032 [US2] Show the published token as a permanent, non-editable term in creator management and pass the independent selection journey in `web/src/features/creator/TierManagement.tsx` and `web/tests/e2e/payment-token-selection.spec.ts`

**Checkpoint**: Creators can publish tiers in any enabled representative token, while the deployed
tier permanently identifies that token and raw price.

---

## Phase 5: User Story 3 — Renew Through a Stock Action (Priority: P1)

**Goal**: Every payment-bearing surface displays the live Stock Token multiplier while every wallet
request and accounting operation continues to use unchanged raw units.

**Independent Test**: Publish a tier shown as `0.05`, change its test token multiplier to `2e18`, and
observe `0.10` across renewal, refund, claims, and fees while raw state and purchased time remain
unchanged except for initiated transactions.

### Tests for User Story 3

- [x] T033 [P] [US3] Add failing captured-block token metadata/multiplier and unchanged-raw snapshot tests in `web/src/features/membership/membership-read.test.ts` and `web/src/features/membership/account-discovery.test.ts`
- [x] T034 [P] [US3] Add failing current/scheduled multiplier, join, renew, prepay, gift, contribution, allowance, shortfall, refund, and claim display tests in `web/src/features/membership/MembershipExperience.test.tsx`
- [x] T035 [P] [US3] Add failing creator proceeds/refund display tests and per-token raw protocol-fee accounting tests in `web/src/features/creator/management.test.ts` and `contracts/test/FactoryAndFees.t.sol`
- [x] T036 [P] [US3] Add a failing full multiplier-transition browser journey with raw balance/time assertions in `web/tests/e2e/payment-token-selection.spec.ts`

### Implementation for User Story 3

- [x] T037 [US3] Compose each tier snapshot with its own payment-token metadata and live current/pending multiplier at the captured block in `web/src/features/membership/membership-read.ts` and `web/src/features/membership/account-discovery.ts`
- [x] T038 [US3] Replace all USDG/six-decimal supporter labels, inputs, balances, allowances, shortfalls, previews, and claims with shared selected-token formatting while keeping wallet args raw in `web/src/features/membership/MembershipExperience.tsx`
- [x] T039 [P] [US3] Replace catalog, tier-read, wallet-readiness, and account-discovery USDG formatting with the tier token model in `web/src/components/CatalogExplorer.tsx`, `web/src/components/TierReadPanel.tsx`, `web/src/components/WalletReadiness.tsx`, and `web/src/features/membership/AccountDiscovery.tsx`
- [x] T040 [P] [US3] Replace creator-management price, refund, top-up, and proceeds formatting with current token display state while retaining raw transaction ceilings in `web/src/features/creator/management-read.ts` and `web/src/features/creator/TierManagement.tsx`
- [x] T041 [P] [US3] Add token-addressed raw fee-balance inspection and independent withdrawal command fixtures without a Backed By Fans operator UI in `contracts/scripts/manage-payment-tokens.sh` and `contracts/scripts/test-manage-payment-tokens.sh`
- [x] T042 [US3] Show scheduled multiplier adjustments as future display information only, verify no fixed-dollar/investment wording, and pass `web/tests/e2e/payment-token-selection.spec.ts` with exact raw wallet arguments and accounting assertions

**Checkpoint**: A two-for-one multiplier change updates all visible Stock Token amounts and no raw
price, approval, transfer, liability, or membership-time rule.

---

## Phase 6: User Story 4 — Operate the Accepted-Token Set (Priority: P2)

**Goal**: The protocol owner can enumerate, enable, and disable tokens for new tiers while existing
tiers and token-specific fee balances remain operable.

**Independent Test**: Enable a token, create a tier, disable the token, reject a new tier, continue
the existing tier, and withdraw fees in two tokens independently.

### Tests for User Story 4

- [x] T043 [P] [US4] Extend owner/non-owner status-change, disable-existing-tier, re-enable-stable-index, one-broken-token/one-withdrawable-token, and exact event tests in `contracts/test/FactoryAndFees.t.sol` and `contracts/test/ClaimsAndWithdrawals.t.sol`
- [x] T044 [P] [US4] Add failing shell fixtures for bounded token enumeration, per-token fee balances, metadata/ERC-8056 admission preflight, idempotent enable/disable calldata, Safe transaction output, explicitly authorized deployer submission, and token-specific fee withdrawal in `contracts/scripts/test-manage-payment-tokens.sh`
- [x] T045 [P] [US4] Add a failing local-chain CLI lifecycle covering enable, create, disable, rejected new publication, existing-tier use, one broken token, and independent fee withdrawals in `contracts/scripts/test-manage-payment-tokens.sh`

### Implementation for User Story 4

- [x] T046 [US4] Implement bounded accepted-token/status and token-specific factory-fee inspection commands in `contracts/scripts/manage-payment-tokens.sh`
- [x] T047 [US4] Implement metadata/ERC-8056 preflight plus reviewed Safe calldata and explicitly authorized deployer modes for idempotent enable/disable and independent fee withdrawal in `contracts/scripts/manage-payment-tokens.sh`, with no Backed By Fans operator web interface
- [x] T048 [US4] Pass the complete CLI fixtures, document Safe/deployer submission and explicit authorization boundaries, and preserve disabled existing tiers in `contracts/scripts/test-manage-payment-tokens.sh` and `docs/runbooks/deployment.md`

**Checkpoint**: Token policy controls only future publication, historical tier interpretation remains
intact, and a failing token cannot hide or block another token's fee withdrawal.

---

## Phase 7: User Story 6 — Update a Published Membership's Renderer (Priority: P2)

**Goal**: The current tier owner can preview and replace the renderer for all existing/future
credentials without changing art/media inputs or any membership/economic state.

**Independent Test**: Mint active and expired credentials, transfer tier ownership, replace the
renderer from the new owner's management page, and compare complete before/after non-presentation
state while every `tokenURI` uses the replacement.

### Tests for User Story 6

- [x] T049 [P] [US6] Add failing owner, pending/former/non-owner, direct-unregistered-address, zero/EOA, wrong-schema, rejected-config, old-renderer-preservation, metadata-refresh-range, and active/expired `tokenURI` tests in `contracts/test/CustomRendererAddress.t.sol`, `contracts/test/MetadataAndStandards.t.sol`, and `contracts/test/RefundsAndOwnership.t.sol`
- [x] T050 [P] [US6] Add failing creator-management and renderer-detail tests for current renderer, owner-deployed/default/Custom ordering, current art/media preview inputs, whole-tier change copy, preview-error recovery, and receipt-driven refresh in `web/src/features/creator/management.test.ts`, `web/src/features/creator/TierManagement.test.tsx`, and `web/src/features/membership/RendererDetails.test.tsx`
- [x] T051 [P] [US6] Add a failing ownership-transfer and renderer-replacement browser journey with economic/state preservation assertions in `web/tests/e2e/renderer-update.spec.ts`

### Implementation for User Story 6

- [x] T052 [US6] Change tier renderer storage to current-owner mutable, validate code/schema/current art-media before assignment, emit old/new identity plus conditional ERC-4906 refresh, and expose `setRenderer` in `contracts/src/MembershipTier.sol` and `contracts/src/interfaces/IMembershipTier.sol`
- [x] T053 [US6] Regenerate the tier ABI and update renderer postcondition/authenticity and public renderer-detail reads without adding a registry gate or runtime-codehash pin in `web/src/contracts.ts`, `web/src/contracts/types.ts`, `web/src/lib/authenticity.ts`, `web/src/features/protocol/registry-reconciliation.ts`, and `web/src/features/membership/RendererDetails.tsx`
- [x] T054 [US6] Add renderer-update draft validation, current-owner permission, existing art/media preview composition, and transaction-state reconciliation in `web/src/features/creator/management.ts` and `web/src/features/creator/management-read.ts`
- [x] T055 [US6] Add the normal renderer selector/preview/update control to tier management, preserve usable controls after preview/RPC failure, and pass `web/tests/e2e/renderer-update.spec.ts` in `web/src/features/creator/TierManagement.tsx`

**Checkpoint**: Renderer replacement is owner-controlled presentation only, works with compatible
direct addresses, refreshes metadata, and preserves every tested membership/economic field.

---

## Phase 8: User Story 5 — Use the Production-Hosted Testnet Beta (Priority: P2)

**Goal**: Deploy the reviewed replacement protocol to Robinhood Chain testnet, regenerate the web
bindings, stage and validate the exact web artifact, then explicitly promote it to
`backedbyfans.xyz` with a documented routing-only rollback.

**Independent Test**: From the canonical HTTPS domain, complete representative creator, supporter,
account, renderer preview/deploy/update, skill, faucet, token-selection, and direct-link journeys while
the site remains plainly testnet-only.

### Release tests and manifest freeze

- [x] T056 [P] [US5] Validate code, metadata, decimals, and claimed ERC-8056 state for the exact six confirmed testnet addresses from T002, fail closed on any mismatch, confirm no internal USDG deployment path remains, and record the results in `contracts/config/payment-tokens/46630.json`
- [x] T057 [P] [US5] Add production-domain route, testnet-label, test-assets, faucet-link, canonical-link, and mainnet-disabled assertions in `web/tests/e2e/brand-shell.spec.ts`, `web/tests/e2e/direct-route.spec.ts`, and `web/tests/e2e/renderer-entrypoints.spec.ts`
- [x] T058 [US5] Run the complete Foundry, deployment fixture, Vitest, lint, typecheck, build, and local Playwright suites from `contracts/`, `contracts/scripts/test-deploy-protocol.sh`, and `web/`, resolving all regressions before preparing a public write
- [x] T059 [US5] Verify the deployment workflow's reviewed committed-source requirement and stop to ask the user to commit if needed; then run `contracts/scripts/deploy-protocol.sh testnet dry-run`, verify the exact six-token manifest, mutable-renderer runtime, owner/fee recipient, source and operational-state identities, transaction count, and Nitro byte/gas limits, and update the reviewed candidate in `contracts/deployments/protocol/46630/` without creating an inferred commit

### STOP — explicit testnet operator approval required

- [x] T060 [US5] Stop before broadcast and give the operator the exact reviewed `contracts/scripts/deploy-protocol.sh testnet broadcast` command, every intended public write, signer, chain ID, immutable replacement warning, encrypted Foundry-account password prompt, post-deploy Wagmi requirement, and explicit statement that no `4663` transaction will be sent
- [x] T061 [US5] After explicit operator authorization and operator-run broadcast, resume the established verification/promotion workflow, wait through its native receipt handling, and verify runtime code, all constructor dependencies, all six token statuses, ownership, fee recipient, and candidate promotion in `contracts/scripts/deploy-protocol.sh` and `contracts/deployments/protocol/46630/`
- [x] T062 [US5] Regenerate and inspect active testnet addresses/ABIs after verified promotion, then require `bun run generate:check` to pass in `web/src/contracts.ts` and `web/wagmi.config.ts`

### Staged web artifact and canonical-domain gate

- [x] T063 [P] [US5] Update beta deployment, monitoring, incident, pilot, ownership/renderer, and USDG-only future-mainnet guidance in `docs/runbooks/deployment.md`, `docs/runbooks/monitoring.md`, `docs/runbooks/incident-response.md`, `docs/runbooks/mainnet-readiness.md`, `docs/runbooks/ownership.md`, `docs/runbooks/renderer-compatibility.md`, and `docs/pilots/testnet-pilot.md`
- [x] T064 [P] [US5] Configure the Vercel project root and reviewed public production environment contract, including `NEXT_PUBLIC_SITE_URL=https://backedbyfans.xyz`, chain `46630`, domain-restricted RPC policy, WalletConnect, and active generated deployment state in `web/.env.example` and `docs/runbooks/deployment.md`

### STOP — explicit authenticated staging deployment approval required

- [x] T065 [US5] Stop before using authenticated Vercel credentials and obtain explicit operator authorization for the reviewed project, environment configuration, source commit, and staging-only target with automatic production-domain assignment disabled
- [x] T066 [US5] After explicit authorization, build one production-like staged Vercel artifact from `web/` and record its source commit, deployment URL/ID, active factory, and prior known-good deployment in `docs/runbooks/deployment.md`
- [ ] T067 [US5] Exercise the staged artifact's creator, supporter, account, renderer preview/deploy/update, `/skill`, faucet, wrong-network, insufficient-funds, RPC-error, direct-link, mobile, keyboard, and accessibility journeys; additionally use a fresh official-faucet wallet for one purchase and complete create/join/renew with each of AMD, NFLX, PLTR, AMZN, and TSLA on live testnet, recording staged-browser and chain evidence separately in `docs/pilots/testnet-pilot.md`
- [x] T068 [US5] Stop before canonical-domain assignment and obtain explicit operator approval for the tested staged artifact and `backedbyfans.xyz` DNS/domain configuration, recording only the approved promotion target in `docs/runbooks/deployment.md`
- [ ] T069 [US5] After explicit approval, promote the exact staged artifact without rebuilding; run named canonical-domain creator, supporter, account, renderer, `/skill`, faucet, token-selection, and direct-link journeys; verify the prior-deployment rollback/status path without touching onchain state; and record canonical-browser versus chain evidence separately in `docs/pilots/testnet-pilot.md` and `docs/runbooks/deployment.md`

**Checkpoint**: The replacement protocol is verified on testnet, generated bindings point to it, and
the tested artifact serves at `backedbyfans.xyz` with a routing-only rollback. Mainnet remains
inspection-only and USDG-only in configuration.

---

## Phase 9: Polish and Cross-Cutting Validation

**Purpose**: Remove stale assumptions, verify all evidence classes, and leave the feature ready for
cross-artifact analysis and implementation convergence.

- [x] T070 [P] Remove stale global-USDG, hard-coded six-decimal, factory-token-binding, immutable-renderer, internal-testnet-USDG, operator-web-UI, and pre-beta active-address language while preserving intentional external USDG references in `web/src/`, `contracts/src/`, `docs/protocol/integration.md`, and `docs/runbooks/`
- [x] T071 [P] Update CI to run the new contract, generation, token-amount, token-read, CLI-administration, and browser suites without formatting vendored Solidity in `.github/workflows/contracts.yml` and `.github/workflows/web.yml`
- [x] T072 Run the complete optimized Foundry build, unit, fuzz, invariant, deployment, and shell-fixture validation in `contracts/foundry.toml`, `contracts/test/`, and `contracts/scripts/`
- [x] T073 Run `bun run generate:check`, formatting, lint, typecheck, Vitest, production build, and the complete local Playwright suite in `web/package.json` and `web/tests/e2e/`
- [x] T074 Review the final Solidity diff for authorization, reentrancy, exact-transfer, token-disablement, fee-isolation, renderer-validation-before-write, metadata-refresh, bytecode-size, and immutable-economic-state regressions in `contracts/src/MembershipFactory.sol`, `contracts/src/MembershipTier.sol`, and `contracts/src/MembershipTierDeployer.sol`
- [ ] T075 Replay `specs/002-public-testnet-beta/quickstart.md` and report source/local, testnet-chain, staged-browser, canonical-browser, and mainnet-inspection evidence as distinct classes in the implementation handoff
- [x] T076 Run `git diff --check`, verify generated files and deployment records match source, confirm no unauthorized mainnet write or unapproved production mutation occurred, and inventory any remaining work against `specs/002-public-testnet-beta/spec.md` and `specs/002-public-testnet-beta/tasks.md`

---

## Phase 10: Expired Membership Fast Follow

**Purpose**: Make creator-synchronized ERC-721 ownership match current membership and suspend rewards
for inactive records before mainnet scope is frozen.

- [x] T077 Replace permissionless scalar sync with owner-only, 100-ID-bounded expired-membership burn sync and permanent-record reads in `contracts/src/MembershipTier.sol` and `contracts/src/interfaces/IMembershipTier.sol`
- [x] T078 Add reward eligibility, `totalRewardShares`, refund/revocation suspension, burn-time settlement, and same-ID restoration across purchase, contribution, gift, and grant paths
- [x] T079 Add unit, fuzz/invariant, event, capacity, standards, remint, custody, rounding, zero-share, invalid-ID, and maximum-batch gas coverage in `contracts/test/`
- [x] T080 Add direct block-pinned creator scanning, 100-ID wallet batches, stale-scan reset, receipt-plus-state reconciliation, burned-member claims/rejoin UX, and generated bindings in `web/src/`
- [x] T081 Add focused web tests and configured Anvil browser coverage for scans, failures, batching, wallet changes, burned claims, and rejoin in `web/src/` and `web/tests/e2e/`
- [ ] T082 After explicit operator approval, deploy and verify a replacement testnet factory, recreate pilot tiers, regenerate active bindings, and promote only that replacement to the canonical website
- [ ] T083 Repeat the public testnet pilot against the replacement and record creator/supporter, third-party gate, indexing-delay, capacity-race, claim, and rejoin evidence
- [ ] T084 Freeze the replacement artifacts and obtain fresh independent accounting/security review, reproducible-build evidence, deployment approval, and mainnet GO

---

## Dependencies and Execution Order

### Phase dependencies

- **Phase 1 — Setup**: Starts immediately and does not modify public state.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks every user story.
- **Phase 3 — US1**: Depends on Phase 2.
- **Phase 4 — US2**: Depends on Phase 2; can proceed alongside US1 after shared foundations pass.
- **Phase 5 — US3**: Depends on Phase 2 and uses the token model established there; its independent
  fixture does not require US2 UI completion.
- **Phase 6 — US4**: Depends on Phase 2; can proceed alongside US1–US3.
- **Phase 7 — US6**: Depends on Phase 2; must finish before the public protocol deployment in US5.
- **Phase 8 — US5**: Depends on US1, US2, US3, US4, and US6 because it deploys and publicly hosts the
  integrated beta.
- **Phase 9 — Polish**: Depends on every story included in the release.
- **Phase 10 — Expired Membership Fast Follow**: Reopens the protocol artifact after Phase 9; its
  replacement deployment, pilot, review, and freeze gates supersede the earlier candidate for
  mainnet purposes.

### User story dependency graph

```text
Setup
  -> Foundational protocol + browser model
       -> US1 Fresh wallet -----------\
       -> US2 Creator token pricing ---+
       -> US3 Stock action ------------+--> US5 Hosted testnet beta
       -> US4 Token operation ---------+
       -> US6 Renderer update --------/
                                        -> Polish and convergence
```

### Within each story

- Write the listed failing tests before the corresponding implementation.
- Keep raw amount/state models below UI components.
- Keep direct-read composition below creator/supporter surfaces and keep privileged operations in the
  reviewed Safe/CLI path.
- Use established wagmi/viem transaction lifecycle and act only after supplied successful receipts.
- Complete each story's independent test before treating its checkpoint as passed.
- Do not cross the testnet broadcast, authenticated staging deployment, or production-domain gates
  without explicit operator approval.

## Parallel Opportunities

- T002 and T003 can proceed in parallel after the baseline starts.
- T004–T006 are independent failing contract test groups; T010–T012 are independent failing browser
  test groups.
- After Phase 2, US1, US2, US3, US4, and US6 can be staffed in parallel, subject to coordination on
  shared TSX files noted in their task paths.
- Read-model tests, component tests, and Playwright tests marked `[P]` can be authored independently
  within each story before implementation.
- Documentation T063 and Vercel configuration T064 can proceed in parallel after the final local
  protocol/web behavior is known.
- T070 and T071 can proceed in parallel before the final full-suite runs.

## Parallel Examples

### User Story 1

```text
T018: Wallet/funding component tests
T019: Fresh-wallet Playwright journey
```

### User Story 2

```text
T025: Creator form/config tests
T026: Creator wizard component tests
T027: Token-selection Playwright journey
```

### User Story 3

```text
T033: Membership/account read tests
T034: Supporter component tests
T035: Creator display and protocol accounting tests
T036: Multiplier-transition Playwright journey
```

### User Story 4

```text
T043: Solidity token-operation tests
T044: Safe/CLI command fixture tests
T045: Local-chain CLI lifecycle
```

### User Story 6

```text
T049: Solidity renderer/ownership tests
T050: Creator-management renderer tests
T051: Renderer-update Playwright journey
```

### User Story 5

```text
T056: Validate the confirmed exact six-token manifest
T057: Production route/testnet-label browser assertions
```

## Implementation Strategy

### Smallest local MVP

1. Complete Setup and Foundational phases.
2. Complete US1 and its independent local browser journey.
3. Stop and demonstrate a fresh-wallet path without deploying publicly.

This is the smallest demo slice, not the public-beta release. It proves that faucet assets can fund a
membership but does not yet prove complete creator pricing, corporate-action continuity, Safe/CLI
administration, renderer updates, or production hosting.

### Integrated beta increment

1. Add US2 creator token pricing and validate independently.
2. Add US3 multiplier continuity across every payment surface and validate independently.
3. Add US4 Safe/CLI token administration and independent fee withdrawals without an operator web UI.
4. Add US6 renderer replacement and prove presentation-only state changes.
5. Run all local and deployment preflight checks.
6. Stop for the operator testnet deployment gate.
7. Resume verification and Wagmi generation only after the operator deploys.
8. Stop for authenticated staging approval, stage the exact web artifact, test it, and stop again for
   canonical-domain promotion approval.

### Release boundary

- No task authorizes a Robinhood Chain mainnet transaction or mainnet Stock Token enablement.
- Testnet broadcast is authorized only at T060/T061 after explicit operator approval.
- Authenticated Vercel staging is authorized only at T065/T066 after explicit operator approval.
- Canonical-domain promotion is authorized only at T068/T069 after explicit operator approval.
- Web rollback changes Vercel routing only and never claims to revert onchain state.

## Notes

- `[P]` means the task can run concurrently without editing the same incomplete dependency.
- Story labels map directly to `spec.md`; US6 intentionally precedes US5 for deployment dependency.
- Existing dirty user work must be preserved; do not reset, stash, or broadly format unrelated files.
- Tests distinguish local source/browser evidence from public-chain and canonical-domain evidence.
- Do not add a backend, account system, custom faucet, oracle, swap, arbitrary payment token, renderer
  registry gate, runtime-codehash pin, feature flag, compatibility layer, or mainnet deployment.
- Do not use platform approval/proof/receipt language for creator aesthetic judgment.
- Commit only when the user asks; deployment tooling may require a reviewed committed source state at
  the explicit operator checkpoint.
