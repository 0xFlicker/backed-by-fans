# Research: Onchain Renderer Ecosystem

## 1. Renderer selection and protocol versioning

**Decision**: The next immutable protocol version accepts a direct renderer address in tier
configuration and removes renderer registration/enablement as a prerequisite for tier creation.
Existing registry-based tiers and factories remain untouched and readable under their original ABI.

**Rationale**: The current `MembershipFactory` resolves `rendererVersion` through an owner-managed
registry before deploying a tier. That cannot satisfy direct address reuse or registry bypass.
Because the deployed contracts are immutable, a clean new deployment is simpler and more honest than
a compatibility layer or migration façade.

**Alternatives considered**:

- Keep the registry and add a special unregistered version: rejected because it preserves the
  registry as the central data model and complicates every tier read.
- Auto-register pasted addresses: rejected because it creates the user renderer registry that the
  feature explicitly excludes.
- Add an upgradeable adapter: rejected because the protocol and constitution treat immutable
  deployment behavior as authoritative.

## 2. Public renderer contract

**Decision**: Keep `BackedByFans.MembershipRenderer.v1` and the existing
`MembershipTypes.PreviewContext`/`TokenRenderData` shapes as the compatibility interface. A custom
renderer implements `previewSVG`, `previewTokenURI`, and `renderTokenURI`; platform acceptance is
based on displaying representative returned images, not registry admission.

**Rationale**: The current browser and canonical renderer already use this typed input, including
browser-supplied `nativeMedia`. Reusing it makes preview and production consume the same membership
context while allowing each renderer to interpret art controls and image bytes creatively.

**Alternatives considered**:

- Define a second custom-renderer ABI: rejected because it creates duplicate preview and membership
  paths.
- Accept arbitrary calldata/return formats: rejected because the membership tier needs one stable
  method to obtain metadata and an image.
- Require exact media-byte preservation: rejected because filters and transformations are intended
  renderer behavior.

## 3. Previewing undeployed creation bytecode

**Decision**: Deploy a small `RendererPreviewHarness` as protocol infrastructure. Its non-view
entrypoint transiently creates candidate initcode and invokes renderer calldata. The web application
calls that entrypoint only with `eth_call`, so the RPC executes the candidate and discards all state.
Deployed renderer addresses continue to receive direct `eth_call` requests.

**Rationale**: An undeployed contract has no address for the current preview flow. A transient
create-and-call harness preserves the actual EVM bytecode, canonical chain context, renderer ABI,
and image calldata without publishing the candidate or maintaining a simulation server.

**Alternatives considered**:

- Upload screenshots produced by the agent: rejected because they do not prove the contract output
  shown to the creator.
- Run an EVM implementation in the browser: rejected because it adds a second execution environment
  and may drift from Robinhood RPC behavior.
- Deploy every preview candidate: rejected because preview must not require a public write.
- Require RPC state overrides: rejected because support is provider-specific and not part of the
  existing product path.

## 4. Browser image handling

**Decision**: Reuse the current create-membership pipeline: process the selected file in the
browser, place the resulting bytes in `PreviewContext.nativeMedia`, and send them as ordinary
read-only RPC calldata. Keep React Query preview results in browser memory only and clear them with
the page/session. No extra transmission confirmation is added.

**Rationale**: `CreateTierWizard` and `use-contract-previews` already implement this behavior with
bounded image processing, viem calls, a two-request limiter, and a 15-second timeout. RPC
transmission is not a durable upload or chain write.

**Alternatives considered**:

- Persistent object storage: rejected because it adds a media backend solely for preview.
- Temporary hosted bucket: rejected because the current RPC call already carries the image bytes.
- Browser-only EVM rendering with no RPC transmission: rejected because it would differ from the
  existing create-membership preview and canonical-chain execution.

## 5. Public page, optional loopback, and file fallback

**Decision**: Make the renderer lab a public client page with no account or hosted session. The
skill may start a helper bound exclusively to `127.0.0.1` on a random high port. The helper opens or
prints the public page with its endpoint and an unguessable, expiring local capability in the URL
fragment. The page uses that capability for exact-origin loopback requests. If the browser blocks
local access—or the creator prefers manual handoff—the creator drops or selects the same
`*.renderer.json` package. Neither path uploads the package or source image.

**Rationale**: Preview is a read-only canonical-RPC operation and does not need creator identity.
The existing application already uses wagmi/viem public transports for browser reads; paid RPC
credentials remain server-only. A random local capability prevents unrelated pages from using the
helper, while the URL fragment avoids sending that capability to the hosted web server and is
removed from the visible URL immediately after parsing. Loopback origins are potentially
trustworthy, but browser local-network protections and permission behavior vary, so manual file
import remains a first-class fallback. Wallet connection begins only when the creator chooses
deployment. The page accepts only an `http://127.0.0.1:<high-port>` helper origin from the fragment;
it never treats the fragment as a general fetch destination.

Primary references:

- [MDN: Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)
- [MDN: Local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)

**Alternatives considered**:

- Bind on all interfaces: rejected because it exposes the agent helper to the LAN.
- Wildcard CORS: rejected because any website could probe the local session.
- Maintain a cloud relay as fallback: rejected because it adds the session backend the loopback
  design avoids.
- SIWE, OAuth, or a hosted token exchange: rejected because preview requires no identity and the
  local helper has no wallet authority.
- Embed a paid RPC credential in the page or package: rejected because public browser credentials
  cannot remain secret.
- Put source images or preview outputs in the package: rejected because the existing browser/RPC
  flow already owns image selection and rendering, and the file must remain safe to share locally.

## 6. Creator-wallet deployment

**Superseded 2026-09-01 decision**: Build the exact raw `salt || initcode` request for the configured
canonical CREATE2 deployer and precompute the address.

**Current decision**: The browser simulates `RendererRegistry.deployAndRegister(initCode)` and passes
that exact request directly to the connected wallet only after the creator clicks Deploy. The one
transaction deploys the renderer, returns and emits the actual address, records creator provenance,
and appends a first-time deployer to an enumerable creator list.

**Rationale**: The user does not require deterministic addresses. A registry makes prior deployments
discoverable from the chain, and one atomic call is simpler for the creator than separate deployment
and registration writes. Tier creation still accepts compatible direct addresses without registry
membership, so the index cannot become an admission gate.


The registry also permits saving an existing compatible renderer address, but records that entry
separately from renderer creation so saving never claims authorship.

**Alternatives considered**:

- Separate deploy and register transactions: rejected because they add an avoidable second wallet
  prompt and can leave deployment and discovery out of sync.
- Preserve CREATE2 prediction inside the registry: rejected because determinism adds package and UI
  complexity without product value.
- Backend relay or signer: rejected because the creator's wallet must own authorization and signing.

## 7. Approval and mutation boundaries

**Decision**: Approval is keyed by chain, candidate artifact fingerprint, representative request-set
fingerprint, and result fingerprints. Any source, bytecode, constructor input, renderer
configuration, or representative request change clears approval and any prepared deployment
request. Wallet identity is introduced only when deployment begins.

**Rationale**: The creator should sign only the renderer they actually reviewed. Fingerprints are
local product state, not public proof or user-facing verification ceremony.

**Alternatives considered**:

- Approval by contract name or source path: rejected because either can remain stable while bytecode
  changes.
- Reuse approval after cosmetic/configuration changes: rejected because the displayed result may
  change.
- Persist approval in an account: rejected because the session is intentionally temporary.

## 8. Renderer kit and local testing

**Decision**: Ship one portable repo-local skill with `llms.txt`, a minimal renderer template,
Foundry tests, gallery generation, package creation, and the loopback helper. Local tests use no real
wallet secret; public deployment moves to the browser wallet even when Foundry/Anvil is installed.

**Rationale**: This captures the project's measured chain limits and rendering workflow while
keeping the creator-facing path visual and simple. Existing Foundry tools can provide deeper local
evidence without becoming a prerequisite for wallet custody.

**Alternatives considered**:

- Require a private key in `.env`: rejected because it creates unnecessary custody and leakage risk.
- Make the hosted service compile arbitrary Solidity: rejected because it introduces untrusted-code
  execution and a build backend.
- Publish documentation without executable templates: rejected because agent trials must succeed
  without undocumented project knowledge.

## Resolved Unknowns

All technical unknowns raised during planning are resolved. Exact implementation tasks will be
generated by `$speckit-tasks`; public deployment remains separately authorized and is not part of
planning.
