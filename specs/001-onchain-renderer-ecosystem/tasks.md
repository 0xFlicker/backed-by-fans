---

description: "Dependency-ordered implementation tasks for the onchain renderer ecosystem"
---

# Tasks: Onchain Renderer Ecosystem

**Input**: Design documents from `specs/001-onchain-renderer-ecosystem/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `.specify/memory/constitution.md`

**Tests**: Required by the feature acceptance scenarios, quickstart, and constitution. Write the listed tests before their corresponding implementation and confirm they fail for the intended reason.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an independent increment after the shared foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on another incomplete task in the same phase
- **[Story]**: Maps the task to a user story in `spec.md`
- Every task names the exact file or directory it changes or validates

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish one runtime package-schema source in the web app and the minimal dependency needed to validate imported packages.

- [ ] T001 Add `ajv` as a direct browser-runtime dependency and update the lockfile in `web/package.json` and `web/bun.lock`
- [ ] T002 [P] Add the v1 renderer package schema from `specs/001-onchain-renderer-ecosystem/contracts/renderer-package.schema.json` to `web/src/features/renderer-lab/renderer-package.schema.json`
- [ ] T003 Add a schema drift check and package script in `web/scripts/check-renderer-package-schema.ts` and `web/package.json` that compare the runtime schema with `specs/001-onchain-renderer-ecosystem/contracts/renderer-package.schema.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Replace registry-gated renderer selection in the next immutable protocol, add undeployed-code preview infrastructure, update deployment generation, and remove registry assumptions from shared web reads.

**⚠️ CRITICAL**: No user story work begins until this phase passes focused contract and web validation.

### Tests for the foundation

- [ ] T004 [P] Write failing direct-address protocol tests covering unregistered compatible renderers, zero/non-contract addresses, tier renderer exposure, and unchanged membership economics in `contracts/test/CustomRendererAddress.t.sol`
- [ ] T005 [P] Write failing `eth_call`-only preview harness tests covering create-and-call success, empty inputs, creation failure, bounded call failure, and discarded state in `contracts/test/RendererPreviewHarness.t.sol`
- [ ] T006 [P] Update deployment tests first to require the preview harness, direct-renderer factory constructor, generated addresses, complete final initcode measurements, and the 95,000-byte raw CREATE2 limit in `contracts/test/deployment/DeploymentScripts.t.sol`

### Implementation for the foundation

- [ ] T007 Replace `RendererRecord` and `TierConfig.rendererVersion` with a direct renderer address, and remove renderer registry/version/codehash methods and events in `contracts/src/types/MembershipTypes.sol`, `contracts/src/interfaces/IMembershipFactory.sol`, and `contracts/src/interfaces/IMembershipTier.sol`
- [ ] T008 Implement the transient create-and-call contract exactly as specified in `contracts/src/RendererPreviewHarness.sol`
- [ ] T009 Remove renderer registration, enablement, reverse-index, and runtime-codehash coupling while preserving renderer schema/configuration checks at tier creation in `contracts/src/MembershipFactory.sol`, `contracts/src/MembershipTierDeployer.sol`, and `contracts/src/MembershipTier.sol`
- [ ] T010 Update shared fixtures and existing protocol assertions for direct renderer addresses without compatibility shims in `contracts/test/helpers/MembershipTestConfig.sol`, `contracts/test/FactoryAndFees.t.sol`, `contracts/test/MetadataAndStandards.t.sol`, and `contracts/test/RendererBudget.t.sol`
- [ ] T011 Add the preview-harness salt/address and direct-factory constructor to canonical deployment prediction, deployment checks, and logs in `contracts/src/RobinhoodProtocolConfig.sol` and `contracts/script/DeployDirectProtocol.s.sol`
- [ ] T012 Update raw CREATE2 preflight, runtime verification, output parsing, and deterministic deployment fixtures for the new protocol components in `contracts/scripts/deploy-protocol.sh`, `contracts/scripts/test-deploy-protocol.sh`, and `contracts/scripts/test-fixtures/deploy-protocol/`
- [ ] T013 Include `RendererPreviewHarness.sol/**` in Foundry-driven generation and regenerate ABI-only bindings without hand-editing them in `web/wagmi.config.ts` and `web/src/contracts.ts`
- [ ] T014 Add Robinhood testnet (`46630`) as the only public renderer-chain setting plus generated canonical renderer and preview-harness addresses, including Anvil (`31337`) evidence injection and validation tests, in `web/.env.example`, `web/src/lib/config.ts`, and `web/src/lib/config.test.ts`
- [ ] T015 Replace renderer registry collections with direct renderer and preview-harness dependencies in `web/src/contracts/types.ts`, `web/src/features/protocol/protocol-read.ts`, and `web/src/features/protocol/protocol-read.test.ts`
- [ ] T016 Remove renderer-version/codehash registry pinning while preserving factory, token, media, interface, chain, and direct-renderer checks in `web/src/lib/authenticity.ts`, `web/src/lib/authenticity.test.ts`, `web/src/lib/direct-read.ts`, and `web/src/lib/direct-read.test.ts`
- [ ] T017 Replace registry-based tier publication reconciliation with direct renderer event/postcondition checks and remove obsolete renderer-registry reconciliation exports in `web/src/features/protocol/registry-reconciliation.ts` and `web/src/features/protocol/registry-reconciliation.test.ts`
- [ ] T018 Run the foundational contract and web checks from `contracts/` and `web/`: `forge fmt --check`, Robinhood-profile build/tests, `bun run generate:check`, focused Vitest suites, typecheck, lint, and formatting

**Checkpoint**: The next protocol accepts direct compatible renderer addresses, exposes them on tiers, includes the preview harness, and the web app has generated bindings with no user-renderer registry model.

---

## Phase 3: User Story 1 - Copy and Reuse a Renderer by Address (Priority: P1) 🎯 MVP

**Goal**: A creator can copy a renderer address from a membership, paste it on the environment's one canonical chain, inspect representative results, approve or reject it, and create a tier without a registry entry.

**Independent Test**: Open a membership, copy its renderer address, paste it into the create flow, render all representative examples on the configured canonical chain, approve it, and create a local tier; invalid or failing addresses never become selectable.

### Tests for User Story 1

- [ ] T019 [P] [US1] Write failing address normalization, canonical-chain code lookup, renderer interface/manifest, representative preview, and approval-invalidation tests in `web/src/features/creator-studio/renderer-address.test.ts`
- [ ] T020 [P] [US1] Write failing direct-address field, loading, failure, approve/reject, and no-chain-selector component tests in `web/src/features/creator-studio/RendererAddressInput.test.tsx`
- [ ] T021 [P] [US1] Extend creator-flow tests for a default canonical renderer, pasted unregistered renderer, failed representative call, changed address, and direct renderer publication config in `web/src/features/creator/CreateTierWizard.test.tsx`
- [ ] T022 [P] [US1] Write failing renderer-details and membership integration tests requiring a visible copyable renderer address even when artwork rendering fails in `web/src/features/membership/RendererDetails.test.tsx` and `web/src/features/membership/MembershipExperience.test.tsx`
- [ ] T023 [P] [US1] Add a failing browser journey for copy, paste, preview, approve, and local tier creation in `web/tests/e2e/custom-renderer-address.spec.ts`

### Implementation for User Story 1

- [ ] T024 [P] [US1] Implement direct renderer address resolution, schema/name/engine reads, representative result state, and approval fingerprints in `web/src/features/creator-studio/renderer-address.ts`
- [ ] T025 [P] [US1] Build the plain-language paste/copy, preview status, failure detail, and approve/reject control in `web/src/features/creator-studio/RendererAddressInput.tsx` and `web/src/features/creator-studio/CreatorStudio.module.css`
- [ ] T026 [US1] Replace version-based renderer props with a direct renderer manifest and generic engine selection in `web/src/features/creator-studio/CreatorStudio.tsx` and `web/src/features/creator-studio/EnginePicker.tsx`
- [ ] T027 [US1] Replace `rendererVersion` with the approved renderer address in form evaluation and unsigned draft scope, clearing approval on renderer/configuration changes, in `web/src/features/creator/config.ts`, `web/src/features/creator/config.test.ts`, `web/src/features/creator-studio/studio-draft.ts`, and `web/src/features/creator-studio/studio-draft.test.ts`
- [ ] T028 [US1] Integrate canonical-chain direct address selection, representative contract previews, approval gating, and direct renderer tier creation in `web/src/features/creator/CreateTierWizard.tsx`
- [ ] T029 [P] [US1] Remove the obsolete versioned registry picker and update studio tests to assert direct-address behavior in `web/src/features/creator-studio/RendererPicker.tsx`, `web/src/features/creator-studio/CreatorStudio.test.tsx`, and `web/src/features/creator-studio/RendererAddressInput.test.tsx`
- [ ] T030 [US1] Read and carry the direct renderer address through tier snapshots and management presentation in `web/src/features/membership/membership-read.ts`, `web/src/features/creator/TierManagement.tsx`, and `web/src/contracts/types.ts`
- [ ] T031 [US1] Build `RendererDetails`, integrate it into the membership view, display the renderer address with copy feedback, and preserve it independently of renderer output status in `web/src/features/membership/RendererDetails.tsx` and `web/src/features/membership/MembershipExperience.tsx`
- [ ] T032 [US1] Run the US1 contract, component, and Playwright tests in `contracts/test/CustomRendererAddress.t.sol`, `web/src/features/creator-studio/`, `web/src/features/creator/`, `web/src/features/membership/`, and `web/tests/e2e/custom-renderer-address.spec.ts`

**Checkpoint**: Direct address reuse works end to end on one canonical chain without a renderer registry or crosschain lookup.

---

## Phase 4: User Story 2 - Build, Test, and Deploy a Renderer with an Agent (Priority: P2)

**Goal**: An agent can author and test a renderer, produce one portable package, hand it to the public renderer page through optional loopback or file import, show representative outputs for approval, and prepare a creator-wallet CREATE2 deployment.

**Independent Test**: Starting from only the renderer skill, `llms.txt`, and an art brief, generate a package and local gallery; load it through loopback and file import; approve the canonical-RPC previews; click Deploy in a wallet-controlled local test; and receive the predicted renderer address without exposing a key or creating hosted session state.

### Tests for User Story 2

- [ ] T033 [P] [US2] Write failing package size/schema, inert-string, canonical-chain, fingerprint, initcode-hash, payload-size, and predicted-address tests in `web/src/features/renderer-lab/package-import.test.ts`
- [ ] T034 [P] [US2] Write failing candidate mutation, representative result, approval invalidation, occupied-address, Nitro-limit, and unsigned deployment tests in `web/src/features/renderer-lab/approval.test.ts` and `web/src/features/renderer-lab/deployment.test.ts`
- [ ] T035 [P] [US2] Write failing fragment parsing, immediate URL cleanup, `127.0.0.1` high-port restriction, capability expiry, CORS failure, and file-fallback tests in `web/src/features/renderer-lab/local-helper-client.test.ts`
- [ ] T036 [P] [US2] Write failing public-page tests proving import/preview works without a wallet and no wallet prompt is possible before approval plus a Deploy click in `web/src/features/renderer-lab/RendererLab.test.tsx`
- [ ] T037 [P] [US2] Write failing helper and package-writer tests for loopback-only binding, exact-origin CORS, bounded bodies, local capability enforcement, no source-image field, and deterministic package output in `.agents/skills/backed-by-fans-renderer/scripts/session-helper.test.ts` and `.agents/skills/backed-by-fans-renderer/scripts/build-package.test.ts`

### Implementation for User Story 2

- [ ] T038 [P] [US2] Implement Ajv-backed package parsing plus independently recomputed hashes, sizes, and CREATE2 address in `web/src/features/renderer-lab/package-import.ts`
- [ ] T039 [P] [US2] Implement browser-memory candidate, request/result, and mutation state with no persistence APIs in `web/src/features/renderer-lab/candidate.ts`
- [ ] T040 [P] [US2] Implement creator approval/rejection and exact candidate/request/result fingerprint binding in `web/src/features/renderer-lab/approval.ts`
- [ ] T041 [US2] Implement deployed-address calls and undeployed-initcode `RendererPreviewHarness.preview` calls using generated ABIs, the existing limiter, and canonical public RPC in `web/src/features/renderer-lab/preview.ts`
- [ ] T042 [US2] Implement CREATE2 calldata preparation, deployer-code and occupied-address checks, Nitro sizing, predicted-address display data, and approval invalidation in `web/src/features/renderer-lab/deployment.ts`
- [ ] T043 [US2] Implement strict fragment parsing, in-memory capability handling, helper health checks, bounded API calls, result reporting, and explicit file fallback in `web/src/features/renderer-lab/local-helper-client.ts`
- [ ] T044 [US2] Build the public package import, representative gallery, approval, deployment summary, progressive technical disclosure, and wallet-only Deploy UI in `web/src/features/renderer-lab/RendererLab.tsx` and `web/src/features/renderer-lab/RendererLab.module.css`
- [ ] T045 [US2] Expose the renderer lab as a client-only public route with no renderer API handlers or server session in `web/src/app/renderer/page.tsx`
- [ ] T046 [US2] Wire creator-initiated deployment through wagmi/viem simulation and pass the exact returned request to the connected wallet, reporting only library-owned transaction state and post-receipt code reconciliation, in `web/src/features/renderer-lab/RendererLab.tsx`
- [ ] T047 [P] [US2] Implement the loopback-only in-memory helper from `specs/001-onchain-renderer-ecosystem/contracts/local-helper.openapi.yaml`, including random port/capability generation and public-page fragment URL output, in `.agents/skills/backed-by-fans-renderer/scripts/session-helper.ts`
- [ ] T048 [P] [US2] Implement deterministic Foundry artifact packaging, final initcode/runtime measurement, raw `salt || initcode` sizing, hashes, embedded requests, and predicted address in `.agents/skills/backed-by-fans-renderer/scripts/build-package.ts`
- [ ] T049 [P] [US2] Implement the six-case local representative SVG/gallery matrix defined in `specs/001-onchain-renderer-ecosystem/data-model.md` in `.agents/skills/backed-by-fans-renderer/scripts/render-gallery.ts`
- [ ] T050 [P] [US2] Author the portable renderer workflow, public interface, local testing, visual approval, canonical deployment, and plain-language completion guidance in `.agents/skills/backed-by-fans-renderer/SKILL.md`, `.agents/skills/backed-by-fans-renderer/llms.txt`, and `.agents/skills/backed-by-fans-renderer/references/`
- [ ] T051 [P] [US2] Add a minimal Solidity 0.8.36 Cancun renderer and local Foundry tests with no production key requirement in `.agents/skills/backed-by-fans-renderer/templates/renderer/src/CustomRenderer.sol`, `.agents/skills/backed-by-fans-renderer/templates/renderer/test/CustomRenderer.t.sol`, and `.agents/skills/backed-by-fans-renderer/templates/renderer/foundry.toml`
- [ ] T052 [US2] Add the full loopback-success, loopback-denied/file-fallback, package rejection, preview approval, and creator-wallet local deployment journey in `web/tests/e2e/renderer-lab.spec.ts`
- [ ] T053 [US2] Run the US2 script, component, helper, Foundry-template, and Playwright suites in `.agents/skills/backed-by-fans-renderer/` and `web/src/features/renderer-lab/`

**Checkpoint**: The agent workflow works without SIWE, OAuth, hosted storage, hosted sessions, paid RPC proxying, or private-key export; only the browser wallet can deploy.

---

## Phase 5: User Story 3 - Use a Creator's Onchain Image as Renderer Input (Priority: P2)

**Goal**: A renderer can receive browser-selected preview bytes and configured onchain media, transform or ignore them, and show representative results without byte-preservation claims or storage.

**Independent Test**: Select a local JPEG/PNG, render every representative image case through canonical RPC, verify the custom renderer transforms the input, verify loopback receives only the output, approve or reject it, and confirm no source or result survives page/helper closure.

### Tests for User Story 3

- [ ] T054 [P] [US3] Write failing contract tests proving `PreviewContext.nativeMedia` and configured onchain `MediaConfig` reach custom renderers without exact-byte-preservation requirements in `contracts/test/CustomRendererImageInput.t.sol`
- [ ] T055 [P] [US3] Write failing browser tests for local image processing, 90 KiB renderer input, canonical RPC calldata, transformed output, generated-only fallback, and page-memory cleanup in `web/src/features/renderer-lab/image-preview.test.ts`
- [ ] T056 [P] [US3] Extend helper tests to prove preview outputs/failures may return but source image bytes are rejected and never retained in `.agents/skills/backed-by-fans-renderer/scripts/session-helper.test.ts`

### Implementation for User Story 3

- [ ] T057 [US3] Reuse the existing browser image pipeline and inject `nativeMedia` only immediately before canonical RPC calls in `web/src/features/renderer-lab/preview.ts` and `web/src/features/creator-studio/image-processing.ts`
- [ ] T058 [US3] Add temporary image selection, image/no-image representative cases, transformed-result display, and clear failure language without an extra RPC-transmission confirmation in `web/src/features/renderer-lab/RendererLab.tsx`
- [ ] T059 [P] [US3] Extend the renderer template with a documented image transformation and generated-only behavior in `.agents/skills/backed-by-fans-renderer/templates/renderer/src/CustomRenderer.sol` and `.agents/skills/backed-by-fans-renderer/templates/renderer/test/CustomRenderer.t.sol`
- [ ] T060 [P] [US3] Teach agents how `nativeMedia` and onchain `MediaConfig` are received and may be transformed, without proofs of preserved bytes, in `.agents/skills/backed-by-fans-renderer/references/interface.md` and `.agents/skills/backed-by-fans-renderer/references/local-testing.md`
- [ ] T061 [US3] Add image/no-image, transformed-output, helper-exclusion, and page-cleanup browser coverage in `web/tests/e2e/renderer-lab.spec.ts`
- [ ] T062 [US3] Run the US3 contract, browser image, helper, template, and renderer-lab E2E suites in `contracts/test/CustomRendererImageInput.t.sol`, `web/src/features/renderer-lab/`, and `.agents/skills/backed-by-fans-renderer/`

**Checkpoint**: Creators can judge transformed onchain-image results visually, while source media stays browser-held and no storage service or byte-preservation proof is introduced.

---

## Phase 6: User Story 4 - Share Renderers Through Memberships (Priority: P3)

**Goal**: Memberships and direct addresses form the complete renderer discovery surface; no platform registry, listing, submission, or skill execution is introduced.

**Independent Test**: Open a custom-rendered membership, copy its renderer address even when current rendering fails, share it with another creator, paste it on the same canonical chain, and approve or reject its displayed examples without installing associated agent guidance.

### Tests for User Story 4

- [ ] T063 [P] [US4] Extend renderer-details tests with Robinhood-testnet context, no registry/listing language, and direct-address sharing behavior in `web/src/features/membership/RendererDetails.test.tsx`
- [ ] T064 [P] [US4] Add a failing end-to-end membership-to-membership address-sharing journey and renderer-failure case in `web/tests/e2e/renderer-sharing.spec.ts`

### Implementation for User Story 4

- [ ] T065 [P] [US4] Extend the existing renderer details surface with progressively disclosed Robinhood-testnet context and direct-sharing guidance in `web/src/features/membership/RendererDetails.tsx`
- [ ] T066 [US4] Ensure pasted addresses never load or execute skill content and add focused coverage for that boundary in `web/src/features/creator-studio/renderer-address.ts` and `web/src/features/creator-studio/renderer-address.test.ts`
- [ ] T067 [US4] Remove remaining user-renderer registry/listing/enablement presentation and tests while retaining the separate onchain media registry in `web/src/features/protocol/ProtocolAdministration.tsx`, `web/src/features/protocol/`, and `web/src/features/creator-studio/`
- [ ] T068 [US4] Run the US4 membership component and Playwright suites in `web/src/features/membership/` and `web/tests/e2e/renderer-sharing.spec.ts`

**Checkpoint**: Renderer discovery is limited to memberships and address sharing, and the address remains usable without any platform registry record.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate security boundaries, documentation, performance limits, and evidence classes across the complete feature without performing a public deployment.

- [ ] T069 [P] Update public project documentation for direct renderers, the public renderer lab, optional loopback, file fallback, no-backend/no-paid-RPC scope, and the separate Robinhood-testnet protocol operator approval/password gate in `web/README.md` and `.agents/skills/backed-by-fans-renderer/references/deployment.md`
- [ ] T070 [P] Add a repository-wide assertion that user-renderer registry APIs, SIWE/OAuth renderer routes, hosted renderer storage, private RPC credentials, and handwritten ABI/address maps are absent from implementation paths in `scripts/check-renderer-ecosystem-boundaries.sh`
- [ ] T071 Run full Solidity formatting, Robinhood-profile build, unit/fuzz/invariant tests, deployment script tests, and renderer/template size checks in `contracts/` and `.agents/skills/backed-by-fans-renderer/templates/renderer/`
- [ ] T072 Run web schema drift, generated-binding drift, formatting, lint, typecheck, Vitest, build, and complete Playwright checks in `web/`
- [ ] T073 Verify loopback success and denied/fallback behavior in supported Chrome, Firefox, and Safari/WebKit projects and record browser evidence separately in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`
- [ ] T074 Run the local Anvil quickstart end to end without a production key or public write and record local, browser, Anvil, and any separately authorized public-chain evidence distinctly in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`
- [ ] T075 Audit all renderer package, preview, approval, and helper state for browser/process-memory-only lifetime and document the result in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`
- [ ] T076 Confirm ordinary implementation validation stops before broadcast and records that the required Robinhood-testnet protocol deployment needs separate operator approval plus interactive operator password entry, with no public deployment, merge, push, brand-clearance claim, or production claim performed in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`

---

## Phase 8: Operator-Gated Robinhood Testnet Protocol Deployment

**Purpose**: Make the required immutable protocol replacement explicit without treating this task list as authorization to write to the chain.

- [ ] T077 After T071-T076 pass, stop and request explicit operator approval for the Robinhood-testnet protocol broadcast, recording approval or deferral without secrets in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`
- [ ] T078 Only after T077 records affirmative approval, run `contracts/scripts/deploy-protocol.sh testnet broadcast` and let the operator enter the deployment password directly into Cast's interactive terminal prompt; the agent MUST NOT request, receive, persist, pass as an argument, or log the password
- [ ] T079 Reconcile the promoted Robinhood-testnet deployment record, chain ID, deployed runtimes, generated addresses, and web bindings using `contracts/scripts/deploy-protocol.sh`, `contracts/deployments/protocol/`, `contracts/broadcast/DeployDirectProtocol.s.sol/46630/`, and `web/src/contracts.ts`
- [ ] T080 Run read-only Robinhood-testnet factory, preview-harness, default-renderer, direct-address preview, and renderer-address copy smoke checks, and record chain evidence separately in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`; any creator wallet write still requires its own explicit browser action

**Checkpoint**: The new direct-renderer protocol is promoted on Robinhood testnet with operator-authorized chain evidence; mainnet remains untouched.

---

## Phase 9: Acceptance Trials

**Purpose**: Measure the explicit user and agent success criteria without substituting automated tests for participant evidence.

- [ ] T081 Run five clean-workspace renderer-agent trials for SC-003 after the testnet protocol rollout, preserving a separate approval gate for every public renderer deployment, and record the success ratio and evidence boundaries in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`
- [ ] T082 Run timed creator sessions for SC-001, SC-008, and SC-009 covering address reuse, representative-set sufficiency, and package import without account or wallet connection, and record the measured results in `specs/001-onchain-renderer-ecosystem/implementation-evidence.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T002 can run alongside T001, while T003 follows T002.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories. Tests T004-T006 are written first; generated bindings T013 follow finalized Foundry interfaces/deployment code.
- **User Story 1 (Phase 3)**: Depends on Foundational and is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational. It can proceed in parallel with US1 after shared bindings/config are stable.
- **User Story 3 (Phase 5)**: Depends on US2 renderer-lab/package/helper primitives and the Foundational renderer interface.
- **User Story 4 (Phase 6)**: Depends on US1 direct-address and membership-details primitives.
- **Polish (Phase 7)**: Depends on every user story selected for delivery; full quickstart validation assumes US1-US4.
- **Operator-Gated Testnet Deployment (Phase 8)**: Depends on every Phase 7 check and cannot begin until separate operator approval is recorded at T077.
- **Acceptance Trials (Phase 9)**: Depend on the promoted Robinhood-testnet protocol; every renderer write within a trial retains its own creator-wallet approval gate.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 (MVP) -> US4
                    \-> US2 ------> US3
US1 + US2 + US3 + US4 -> Polish -> Operator-Gated Testnet -> Acceptance Trials
```

### Within Each User Story

- Write and run the story's failing tests before implementation.
- Complete pure data/hash/state helpers before React integration.
- Complete contract and generated-binding changes before consumers.
- Keep approval invalidation ahead of deployment enablement.
- Pass the exact wagmi/viem simulated request to the wallet; never add receipt or transaction machinery.
- Finish the story's focused validation before treating its checkpoint as complete.

### Parallel Opportunities

- T004, T005, and T006 can be authored in parallel.
- US1 tests T019-T023 can be authored in parallel; T024 and T025 can then proceed in parallel.
- US2 tests T033-T037 can be authored in parallel; T038-T040 and T047-T051 touch separate modules and can proceed in parallel after those tests exist.
- US3 tests T054-T056 can be authored in parallel; template/docs work T059-T060 can proceed alongside browser implementation.
- US4 tests T063-T064 and implementation T065 can proceed in parallel before integration.
- Documentation and boundary checks T069-T070 can proceed in parallel after feature behavior stabilizes.

---

## Parallel Example: User Story 1

```text
Task: "Write renderer address service tests in web/src/features/creator-studio/renderer-address.test.ts"
Task: "Write direct-address input tests in web/src/features/creator-studio/RendererAddressInput.test.tsx"
Task: "Write membership renderer copy tests in web/src/features/membership/MembershipExperience.test.tsx"
Task: "Write browser copy/paste journey in web/tests/e2e/custom-renderer-address.spec.ts"
```

## Parallel Example: User Story 2

```text
Task: "Implement renderer package validation in web/src/features/renderer-lab/package-import.ts"
Task: "Implement loopback helper in .agents/skills/backed-by-fans-renderer/scripts/session-helper.ts"
Task: "Implement package writer in .agents/skills/backed-by-fans-renderer/scripts/build-package.ts"
Task: "Author skill and llms guidance in .agents/skills/backed-by-fans-renderer/"
```

## Parallel Example: User Story 3

```text
Task: "Implement browser image injection in web/src/features/renderer-lab/preview.ts"
Task: "Extend renderer template in .agents/skills/backed-by-fans-renderer/templates/renderer/"
Task: "Document renderer image inputs in .agents/skills/backed-by-fans-renderer/references/"
```

## Parallel Example: User Story 4

```text
Task: "Write renderer details tests in web/src/features/membership/RendererDetails.test.tsx"
Task: "Build renderer details in web/src/features/membership/RendererDetails.tsx"
Task: "Write sharing browser journey in web/tests/e2e/renderer-sharing.spec.ts"
```

---

## Implementation Strategy

### MVP First: Direct Address Reuse

1. Complete Setup and Foundational work.
2. Complete User Story 1 only.
3. Stop and validate copy, paste, canonical-chain previews, approval, and local tier creation.
4. Do not deploy publicly as part of MVP validation.

### Incremental Delivery

1. **Foundation**: New immutable direct-renderer protocol plus generated bindings.
2. **US1**: Address reuse and creator approval become independently usable.
3. **US2**: Agent kit, public renderer lab, optional loopback, file fallback, and wallet deployment are added.
4. **US3**: Browser-local and configured onchain images become renderer inputs.
5. **US4**: Membership discovery and direct sharing complete the open ecosystem.
6. **Polish**: Run complete source, browser, Anvil, and boundary validation with evidence classes kept separate.
7. **Operator-Gated Testnet**: Stop for approval, then deploy and promote the immutable protocol through the interactive operator-password flow.
8. **Acceptance Trials**: Measure the explicit creator and agent success criteria against the promoted testnet environment.

### Parallel Team Strategy

1. Complete Setup and Foundation together because they change shared protocol and generated bindings.
2. After Foundation:
   - Developer A implements US1 direct address reuse.
   - Developer B implements US2 package/helper/renderer-lab tooling.
3. After US2, Developer B or C implements US3 image composition while US4 builds on US1.
4. Integrate only after each story's independent checkpoint passes.

---

## Notes

- `[P]` tasks change different files and have no dependency on an unfinished task in the same phase.
- User-story labels provide traceability to `spec.md`.
- Existing deployed registry-based contracts remain untouched; the new protocol does not add a compatibility write layer.
- The onchain media registry remains valid and must not be confused with the removed user-renderer registry.
- T077-T080 describe the required Robinhood-testnet rollout but do not supply authorization; T077 is a hard stop for separate operator approval, and T078 requires interactive operator password entry.
- No task authorizes a mainnet transaction, merge, push, brand-clearance claim, or production configuration change.
- Run `$speckit-analyze` after this task list and before implementation, as required by the constitution.
