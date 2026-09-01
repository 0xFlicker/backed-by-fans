# Implementation Plan: Onchain Renderer Ecosystem

**Branch**: `main` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-onchain-renderer-ecosystem/spec.md`

## Summary

Replace registry-gated renderer selection with direct renderer addresses in the next immutable
protocol deployment, expose that address on every membership, and let creators paste any compatible
address on the environment's canonical Robinhood chain. Reuse the existing `PreviewContext` and
browser-to-RPC preview pipeline for deployed renderers; add a read-only preview harness that can
transiently instantiate undeployed creation bytecode inside `eth_call` so the same interface can be
reviewed before deployment.

Publish a portable renderer skill, `llms.txt`, template, local tests, a renderer package format, and
an optional loopback helper. The helper opens the public renderer page with its exact local endpoint
and a random, expiring capability in the URL fragment, then keeps candidate and result state only in
bounded process memory. No SIWE, OAuth, account, token exchange, or hosted session API is involved.
If the browser blocks loopback, the creator drops the same schema-validated package into the page.
The browser keeps imported packages and selected image bytes in memory, includes image bytes in
ordinary read-only RPC calls, and never uploads either to application storage. After creator
approval, the browser prepares the exact canonical CREATE2 calldata and passes the simulated request
directly to wagmi for creator-initiated signing and submission.

### 2026-09-01 registry amendment

The direct-address membership protocol above remains unchanged. Renderer deployment now uses a
separate permissionless `RendererRegistry`: one wallet transaction deploys the candidate, returns
and emits its actual address, records creator provenance, and makes that creator's renderers
enumerable. The registry is not consulted by tier creation. Package format v2 therefore removes
CREATE2 salt, deployer, raw-payload, and predicted-address fields; the browser validates final
initcode sizing and passes the exact simulated `deployAndRegister(initCode)` request to wagmi. This
amendment supersedes the CREATE2 renderer-deployment details below without changing the historical
direct-renderer protocol rollout record.

## Technical Context

**Language/Version**: Solidity 0.8.36; TypeScript 6.0.2; React 19.2.8; Next.js 16.3.3;
Bun 1.3.14

**Primary Dependencies**: Foundry 1.7.1 (`forge`, `anvil`, `cast`), OpenZeppelin Contracts,
viem 2.55.19, wagmi 2.19.5, `@wagmi/core` 2.22.1, RainbowKit 2.2.11, and TanStack Query 5.102.4

**Storage**: No persistent application database, image bucket, media library, transaction journal,
or server-side renderer-session store. Browser-selected images and imported renderer packages live
in browser memory. In automatic mode, candidate artifacts, example results, approvals, and prepared
deployment requests live only in the loopback helper's bounded process memory. In fallback mode,
the agent writes a local package and the browser owns the imported session state. Permanent renderer
code and creator-approved membership media are onchain only after explicit wallet writes.

**Testing**: Foundry unit/fuzz tests and Robinhood-profile Anvil/fork checks; Vitest component and
service tests; Playwright browser flows; shell tests for artifact generation, package import, the
loopback helper, and exact registry deployment preparation

**Target Platform**: Modern desktop browsers with an injected or WalletConnect wallet; local
loopback helper or renderer-package file handoff on macOS/Linux/Windows; Robinhood Chain testnet
(`46630`) as the only public canonical chain for this implementation, with `31337` for local evidence

**Project Type**: Immutable Solidity protocol plus Next.js web application and a portable local
agent skill/helper

**Performance Goals**: Preserve the existing 300 ms focused-preview debounce, 1 second gallery
debounce, two concurrent RPC previews, and 15 second per-preview timeout. A loopback or imported
package reaches representative previews without requiring an account or wallet connection. Render
token IDs 1, 7, and 42 in active and expired states without retaining source or output media after
the session.

**Constraints**: Robinhood testnet is the only public canonical chain in scope; no renderer registry gate for tier creation;
no crosschain lookup; no private-key, seed, or keystore export; no backend signer; no persistent
preview storage; no custom transaction polling or receipt state machine; browser image candidates
remain within the existing 20 MiB source, 512 px processed, and 90 KiB renderer-input limits;
renderer RPC output remains within the existing 600,000-byte token URI and 1,200,002-byte JSON-RPC
hex ceilings; project renderer runtime and registry-initcode ceilings are 88,000 and 94,656 bytes
respectively

**Scale/Scope**: One creator, one agent, and one browser per short-lived local session or file
handoff; one renderer candidate at a time; six representative token/state/image combinations per
approval set: token 1 active without image, token 1 expired with image, token 7 active with image,
token 7 expired without image, token 42 active without image, and token 42 expired with image. An
image case uses the browser-selected image when present, otherwise configured onchain media; absence
or unsupported media is shown as generated-only output or a clear failure. No public renderer feed,
platform curation, durable session history, or media account

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle or boundary | Pre-design result | Post-design result |
|---|---|---|
| I. Creator Ownership and Durable Membership | PASS — renderer choice remains creator-controlled and does not change membership economics. | PASS — direct renderer selection is isolated from price, duration, fees, rewards, referrals, and payout identity. |
| II. Onchain Contract Fidelity and Chain-Scoped Identity | PASS — the feature is pinned to one configured chain and treats addresses as chain-scoped. | PASS — the design uses generated bindings, canonical RPC reads, a new immutable protocol deployment, and the existing wagmi/viem lifecycle for every write. |
| III. MIT Licensed and Open Source | PASS — the renderer kit and interfaces are repository artifacts under the project license. | PASS — no proprietary registry or closed deployment service is introduced. |
| IV. Plain Language and Honest UX | PASS — the creator sees examples, the target chain, the predicted address, and a Deploy button. | PASS — code sizes, RPC detail, and transaction data stay behind progressive disclosure unless they block the action. |
| V. Smallest Complete Slice and Evidence-Bounded Quality | PASS — the feature reuses current preview, image processing, generated ABI, and wallet seams. | PASS — local, browser, Anvil/fork, and public-chain evidence remain separate; no deployment or production claim is authorized by this plan. |
| Explicit authorization for chain writes | PASS — the specification requires creator approval and a browser click. | PASS — the agent prepares only unsigned data; `simulateContract` output goes directly to wagmi after the creator clicks Deploy. |
| No speculative durable media/session backend | PASS — browser memory, loopback process memory, and a local package fallback satisfy the preview workflow. | PASS — no hosted renderer routes or session service exist, and no image, preview, candidate, or transaction journal is persisted by the platform. |

The existing deployed contracts are immutable and registry-gated. This feature therefore requires a
new protocol version and deployment rather than mutating or migrating existing tiers. Existing tier
addresses remain readable under their original ABI and behavior; the new web path does not add a
compatibility write layer. After local and Anvil validation, deployment of that new protocol version
to Robinhood testnet is a separate operator action: stop, request explicit operator approval, and let
the operator enter the deployment password interactively. The password must never be requested in a
prompt or captured in generated files, command arguments, or logs. No mainnet deployment is in scope.
No constitution violation requires an exception.

## Project Structure

### Documentation (this feature)

```text
specs/001-onchain-renderer-ecosystem/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── local-helper.openapi.yaml
│   ├── preview-harness.md
│   ├── renderer-interface.md
│   └── renderer-package.schema.json
└── tasks.md                       # Created later by $speckit-tasks
```

### Source Code (repository root)

```text
contracts/
├── src/
│   ├── interfaces/
│   │   ├── IMembershipFactory.sol
│   │   ├── IMembershipRenderer.sol
│   │   └── IMembershipTier.sol
│   ├── types/MembershipTypes.sol
│   ├── RendererPreviewHarness.sol
│   ├── MembershipFactory.sol
│   ├── MembershipTierDeployer.sol
│   ├── MembershipTier.sol
│   └── RobinhoodProtocolConfig.sol
├── script/DeployDirectProtocol.s.sol
├── scripts/deploy-protocol.sh
└── test/
    ├── CustomRendererAddress.t.sol
    ├── RendererPreviewHarness.t.sol
    ├── MetadataAndStandards.t.sol
    └── deployment/DeploymentScripts.t.sol

web/
├── src/app/renderer/page.tsx
├── src/features/
│   ├── creator/CreateTierWizard.tsx
│   ├── creator-studio/use-contract-previews.ts
│   ├── membership/MembershipExperience.tsx
│   └── renderer-lab/
│       ├── candidate.ts
│       ├── local-helper-client.ts
│       ├── package-import.ts
│       ├── preview.ts
│       ├── approval.ts
│       └── deployment.ts
├── src/lib/wallet-config.ts
├── tests/e2e/renderer-lab.spec.ts
└── src/**/*.test.ts(x)

.agents/skills/backed-by-fans-renderer/
├── SKILL.md
├── llms.txt
├── references/
│   ├── interface.md
│   ├── local-testing.md
│   └── deployment.md
├── templates/renderer/
│   ├── src/CustomRenderer.sol
│   ├── test/CustomRenderer.t.sol
│   └── foundry.toml
└── scripts/
    ├── build-package.ts
    ├── render-gallery.ts
    └── session-helper.ts
```

**Structure Decision**: Keep protocol changes in the existing Foundry project, the public renderer
lab in the existing Next.js application, and renderer authoring in one repo-local portable skill.
The optional loopback helper belongs to the skill because it coordinates local agent artifacts with
the browser without a hosted session database or image store. The same renderer package is also the
manual handoff artifact, so fallback does not introduce a second candidate model.

## Implementation Approach

### 1. Direct renderer protocol path

- Replace `rendererVersion` in `MembershipTypes.TierConfig` with a direct `renderer` address.
- Remove renderer registration, enablement, reverse-index, and registry checks from the new
  `MembershipFactory`; require a nonzero address with code on Robinhood testnet, the expected renderer
  schema, and valid tier configuration before deployment, without registry membership, enablement,
  reverse-index, or runtime-codehash identity checks.
- Store the direct renderer address on `MembershipTier` and call its `renderTokenURI` implementation
  without requiring a platform registry record.
- Remove renderer-version and runtime-codehash coupling from the new tier constructor, events,
  generated web types, protocol reads, reconciliation, and create-tier flow.
- Keep the current renderer ABI as the public compatibility contract. The browser proves practical
  compatibility by displaying `previewSVG`/`previewTokenURI` results before enabling selection.
- Treat this as a new immutable protocol deployment. Do not mutate or migrate existing registry-
  based tiers.

### 2. Read-only preview for deployed and undeployed renderers

- Continue direct viem `client.call` requests to deployed renderer addresses.
- Add `RendererPreviewHarness`, deployed with the protocol, whose non-view entrypoint creates the
  candidate from supplied final initcode and invokes the requested renderer method. The browser
  calls the harness only through `eth_call`, so the transient deployment and all state are discarded.
- Use the same generated ABI types and `MembershipTypes.PreviewContext` for both paths.
- Inject browser-held `nativeMedia` bytes immediately before the RPC call. Never send those bytes to
  the loopback helper or a platform persistence endpoint.
- Apply the existing two-call concurrency limit, 15 second timeout, representative token IDs, and
  response decoding. A revert, timeout, empty result, or non-displayable image is shown as a failed
  example rather than a platform certification verdict.

### 3. Public renderer lab and local handoff

- The renderer lab is a public client page. Import and preview require no account, wallet
  connection, SIWE, OAuth, hosted API, or paid RPC proxy.
- The skill starts `session-helper.ts` on `127.0.0.1` using a random high port, creates an
  unguessable capability with a short expiry, and opens or prints a renderer-page URL. The exact
  loopback endpoint and capability are encoded in the URL fragment so they are not sent to the web
  server or included in normal request logs. The page reads the fragment into memory and immediately
  removes it from the visible URL with `history.replaceState`. It accepts only
  `http://127.0.0.1:<high-port>` as a fragment-provided helper origin.
- The helper accepts only the configured Backed By Fans web origin, exact local capability, bounded
  bodies, and explicit CORS/preflight requests. It rejects LAN binds, wildcard origins, expired
  capabilities, and requests without the capability. Candidate and result state stays in bounded
  process memory.
- The browser feature-detects loopback access and Local Network Access behavior. If access is
  blocked, denied, expired, or unavailable, it clearly offers drag-and-drop or file selection for
  the same `*.renderer.json` package; no rebuild or cloud fallback is needed.
- The browser keeps an imported package in memory, validates its schema and byte limits, requires
  the canonical chain, and independently recomputes the artifact fingerprint, initcode hash, raw
  CREATE2 payload size, and predicted address. The first implementation accepts files up to
  1,000,000 bytes and rejects mismatches before preview.
- Renderer packages contain no source image, wallet secret, wallet signature, authentication
  artifact, paid RPC credential, or browser-executable code. The page treats descriptive strings
  and paths as inert data and does not resolve local paths or upload the package. Representative
  request contexts are embedded directly so the file has no filesystem dependencies.

### 4. Candidate, approval, and deployment lifecycle

- The agent builds one renderer package locally. In automatic mode it submits the package's artifact
  manifest, final creation bytecode, representative contexts, and documentation paths to the
  loopback helper; in fallback mode the creator imports that package directly into the webpage.
- The browser reads the candidate from the helper or imported package and performs the same RPC
  previews. In automatic mode it returns only rendered results or failures to the helper so the
  agent and creator inspect the same examples; in fallback mode the creator reviews them directly
  in the webpage.
- Approval binds the canonical chain, candidate fingerprint, representative request set, and result
  fingerprints. Any candidate or deployment-input change invalidates approval. Wallet identity is
  added only when the creator starts deployment.
- The browser computes `salt || initcode`, checks the existing canonical CREATE2 deployer and
  predicted address, checks code absence and the Nitro payload envelope, then displays the chain,
  estimated cost, and predicted address.
- After the creator clicks Deploy, use wagmi/viem simulation and pass the returned request directly
  to the connected wallet. Do not expose an agent endpoint that can invoke, sign, submit, poll, or
  reconstruct the transaction.
- After wagmi supplies a successful receipt, reconcile only the expected CREATE2 address and expose
  that address to the creator and, when connected, the helper. Browser refresh or closure does not
  trigger receipt recovery or retain pending intent.

### 5. Renderer kit and local evidence

- Publish the portable skill, `llms.txt`, renderer template, package schema, local Foundry tests,
  representative gallery generator, package writer, importer guidance, and loopback helper.
- Local tests use `forge test` and disposable Anvil identities; they never ask for a production
  private key. If Foundry/Anvil is already available, the skill uses it. Public deployment always
  moves to the creator's browser wallet.
- Encode the Robinhood-specific lesson: measure the complete final initcode and raw CREATE2 calldata,
  use the Robinhood profile, and do not treat permissive local Anvil behavior as public admission.
- Keep technical evidence available under progressive disclosure while normal completion shows the
  approved examples, canonical chain, and renderer address.

## Complexity Tracking

No constitution violations require justification. The preview harness, loopback helper, and local
package import are the smallest components that allow undeployed-code preview plus automatic or
manual agent/browser coordination without a renderer registry, backend signer, session database,
cloud relay, or image bucket.
