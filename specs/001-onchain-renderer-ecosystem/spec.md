# Feature Specification: Onchain Renderer Ecosystem

**Feature Branch**: `main`

**Created**: 2026-08-31

**Status**: Ready for Implementation

**Input**: User description: "Let creators build and deploy their own onchain renderer with an
associated AI skill and `llms.txt`. Teach agents the lessons from our own renderer work, including
local testing, representative previews, canonical-chain deployment, and returning a reusable
contract address. Let renderers receive and transform a creator's onchain image. Let anyone copy a
renderer address from an existing membership and paste it to reuse the renderer."

## Clarifications

### Session 2026-08-31

- Q: Does the renderer page need SIWE, OAuth, an account, or an authenticated backend session? → A:
  No. Make the renderer page public. Prefer optional loopback coordination when the browser allows
  it, with local package import as the fallback. Wallet connection is required only when the
  creator chooses to deploy.
- Q: How should an image selected in the browser for an offchain preview be stored and shared during
  the renderer-lab session? → A: Keep it in browser memory and allow its bytes to be included in the
  ordinary read-only renderer call to the canonical RPC, without persistent storage.
- Q: When the creator clicks Deploy, how should the renderer contract be created on the canonical
  chain? → A: Use the existing canonical CREATE2 deployer, with the creator's browser wallet signing
  the deployment transaction.
- Q: When a creator uses a browser-local image, what may the browser return through loopback? → A:
  Return the renderer result or failure to the helper, never the selected source image. The image
  may be transmitted to the canonical RPC without another confirmation.
- Q: How does the agent hand a renderer candidate to the public page? → A: The agent writes a
  portable renderer package. A loopback helper can transfer it automatically when available;
  otherwise the creator drops or selects the file in the webpage. Both paths continue with the same
  preview, approval, and wallet deployment without a hosted relay or storage backend.

### Session 2026-09-01

- Q: How should creators find renderers they previously deployed? → A: Add a permissionless
  onchain renderer registry. It enumerates creators and each creator's deployed renderers. The
  create-membership style list shows the connected creator's renderers first, the six default
  styles next, and Custom with an address field last.
- Q: Should deployment and registration require two transactions? → A: No. The browser calls
  `deployAndRegister(bytes initCode)` once. The registry creates the renderer, returns and emits the
  actual address, and records it for the caller.
- Q: Does the registry gate membership use or become a renderer feed? → A: No. Compatible renderer
  addresses remain directly usable without registration. A public renderer feed and curation UI are
  out of scope, although the append-only creator list permits future enumeration.
- Q: Must deployment preserve a deterministic or precomputed renderer address? → A: No. The only
  authoritative renderer address is the address returned by the successful registry deployment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Copy and Reuse a Renderer by Address (Priority: P1)

A creator viewing a membership can copy its renderer contract address. Another creator can paste
that address into the renderer flow, see representative images returned by the contract, and decide
whether to use it. The product resolves the address only on the environment's canonical chain.

**Why this priority**: A copyable contract address is the simplest permissionless sharing
mechanism. The optional onchain registry makes a creator's own deployments easy to find without
controlling which compatible addresses can be used.

**Independent Test**: View a membership that uses a custom renderer, copy its renderer address,
paste the address into another creator's Custom style in the same environment, confirm that its
artwork renders, and use the renderer for a new membership without a separate acceptance step.

**Acceptance Scenarios**:

1. **Given** a membership with a renderer, **When** a viewer opens its renderer details, **Then**
   the renderer contract address is visible and can be copied.
2. **Given** a renderer address deployed on the environment's canonical chain, **When** a creator
   pastes it into Custom, **Then** the existing Creator Studio uses the renderer directly and changes
   no other artwork controls or membership settings.
3. **Given** an address with no contract, a failed renderer call, or a response without a
   displayable image, **When** the Creator Studio calls it, **Then** the product shows a clear failure
   and leaves the creator controls usable.

---

### User Story 2 - Build, Test, and Deploy a Renderer with an Agent (Priority: P2)

A renderer artist or developer can give an agent the renderer AI skill and `llms.txt`, describe an
artistic concept, test it locally, inspect representative examples, approve the result, deploy it to
the configured canonical chain, and receive the renderer contract address. The agent writes a local
renderer package and can offer a loopback link that opens the public renderer page with the package
ready. If loopback is unavailable, the creator imports the file manually. The agent never needs the
creator's wallet credentials or an authenticated backend session.

**Why this priority**: Agent-readable guidance turns renderer creation into an approachable creative
workflow while carrying forward the practical lessons learned from the project's own onchain
renderer work.

**Independent Test**: Starting from a clean workspace with the published renderer skill,
`llms.txt`, and an art brief, have an agent create a renderer, run the documented local test flow,
show representative images for approval, deploy to the environment's canonical chain after explicit
authorization, and return the contract address.

**Acceptance Scenarios**:

1. **Given** an art brief and the official guidance, **When** an author asks an agent to create a
   renderer, **Then** the agent can identify the renderer inputs, image output, local test flow,
   representative examples, approval checkpoint, deployment target, and completion result without
   private instructions.
2. **Given** a renderer candidate, **When** the agent runs the local test flow, **Then** it displays
   representative membership images without requiring a public-chain write.
3. **Given** the author rejects the examples, **When** they provide feedback, **Then** the renderer
   can be revised and tested again without deployment.
4. **Given** the author approves the examples and authorizes deployment, **When** deployment
   succeeds, **Then** the agent clearly identifies the canonical chain and returns a copyable
   contract address.
5. **Given** local testing succeeds but canonical-chain deployment fails, **When** the workflow
   stops, **Then** the author receives a concise, actionable explanation and no false success
   message.
6. **Given** an agent has built a renderer candidate, **When** it writes a renderer package and the
   creator imports that package into the public renderer page, **Then** the browser validates it and
   displays representative previews without an account, SIWE flow, agent token, or backend session.
7. **Given** an approved renderer candidate, **When** the browser prepares deployment, **Then** it
   calls the configured renderer registry's one-transaction deployment function and asks the
   creator's browser wallet to sign only after the creator clicks Deploy.
8. **Given** a creator has not connected a wallet, **When** they import a valid package and request
   previews, **Then** the public page can display the renderer results; wallet connection remains a
   deployment-only requirement.
9. **Given** the agent starts the optional loopback helper and the browser permits local access,
   **When** the creator opens the generated public-page link, **Then** the page loads the candidate
   from the helper and can return preview results without SIWE, OAuth, or a hosted session.
10. **Given** the browser denies or cannot use loopback access, **When** the connection fails,
    **Then** the creator receives a clear file-import fallback using the same renderer package.

---

### User Story 3 - Use a Creator's Onchain Image as Renderer Input (Priority: P2)

A custom renderer can receive the creator's configured onchain image and use it as an artistic
input. The renderer may crop, filter, recolor, transform, mask, combine, or otherwise reinterpret
the image. Before choosing permanent media, the creator can select an image in the browser and see
it in the design without uploading it onchain or maintaining a persistent media account. The
creator judges the result by reviewing representative rendered images.

**Why this priority**: Giving renderer authors access to creator media enables expressive,
customizable onchain art without dictating how the source image must appear in the final work.

**Independent Test**: Configure a membership with an onchain image, preview a custom renderer
across representative membership states, confirm that the renderer can access and transform the
image, and show the displayed results for the creator's judgment.

**Acceptance Scenarios**:

1. **Given** a configured onchain image, **When** the renderer is called, **Then** the defined
   renderer input makes that image available to the contract.
2. **Given** a renderer that filters or transforms the supplied image, **When** representative
   outputs are shown, **Then** the transformed results are accepted as valid renderer behavior and
   remain available for the creator's judgment.
3. **Given** the image is unavailable or unsupported by the renderer, **When** preview is attempted,
   **Then** the resulting image or failure is shown clearly without claiming that the original bytes
   were preserved.
4. **Given** no onchain image is configured, **When** a renderer supports generated-only artwork,
   **Then** its representative generated result can still be displayed.
5. **Given** a creator selects a local image for preview, **When** the browser can render the
   candidate, **Then** the browser may include the image bytes in the ordinary read-only renderer
   call to the canonical RPC without storing the image or uploading it onchain.
6. **Given** the RPC returns the renderer output, **When** the preview completes, **Then** the creator
   sees it and, when loopback is active, the helper receives the same result without receiving the
   selected source image.

---

### User Story 4 - Share Renderers Through Memberships (Priority: P3)

An artist shares a renderer by using it on a membership or sharing its contract address directly.
People who discover the membership can inspect and copy the address, then paste it into their own
creator flow. Registry lookup is optional and no submission, approval, feed, or curation workflow is
required.

**Why this priority**: Memberships themselves become the discovery surface for an open ecosystem of
onchain art, while the contract address remains the portable sharing primitive.

**Independent Test**: Open a membership, copy its renderer contract address, send it to another
creator, paste it into that creator's Custom style, and confirm that the creator can use it directly
or see a clear rendering failure.

**Acceptance Scenarios**:

1. **Given** a custom-rendered membership, **When** someone views its renderer details, **Then** they
   can copy the renderer contract address without entering a registry workflow.
2. **Given** the copied address, **When** another creator pastes it in the same environment, **Then**
   the canonical-chain renderer is called directly in the existing Creator Studio.
3. **Given** a renderer that is not referenced by any featured or platform-owned content, **When**
   its address is pasted, **Then** it remains reusable even without a renderer registry entry.
4. **Given** a connected creator has deployed renderers through the registry, **When** they open the
   create-membership Art Studio, **Then** those renderers appear before the six defaults, with
   Custom and its address field last.

### Edge Cases

- The pasted address has no contract on the environment's canonical chain, including when it was
  copied from a different environment.
- The renderer call reverts, times out, or returns a response with no displayable image.
- A renderer succeeds for one representative membership state but fails for another.
- A renderer receives the configured onchain image but chooses to ignore it or transforms it beyond
  recognition; the creator can see the result and reject it.
- The configured onchain image is absent or in a form the renderer does not support.
- The page reloads, closes, or loses browser memory while a local-only preview image is selected.
- The canonical RPC rejects a read-only preview request because its image payload or returned
  renderer output exceeds the supported request or response limit.
- Full-size art is valid but difficult to understand at membership-card or marketplace thumbnail
  size.
- Local tests pass but deployment is rejected by a canonical-chain constraint not modeled locally.
- A third-party AI skill or `llms.txt` contains unsafe instructions, requests secrets, or proposes
  actions unrelated to renderer creation.
- An imported renderer package is malformed, too large, targets the wrong canonical chain, or has
  artifact or byte-length fields that do not match its contents.
- The browser denies local-network access, blocks the helper request, or the helper has expired;
  file import remains available without restarting the renderer build.
- The public RPC rate-limits or rejects the preview's calldata or response size; the page explains
  the failure without silently moving the request to a paid backend RPC.
- The renderer registry is not deployed on the selected chain or its deployment call reverts.
- A previously used renderer later fails to return an image; the membership still exposes its
  address and the product shows the rendering failure clearly.

## Requirements *(mandatory)*

### Functional Requirements

#### Canonical-Chain Address Reuse

- **FR-001**: The current product environment MUST have exactly one configured canonical chain for
  custom renderers: Robinhood testnet (`46630`). Robinhood mainnet is out of scope.
- **FR-002**: The creator flow MUST NOT offer crosschain renderer search, chain selection, or
  fallback to another chain.
- **FR-003**: A membership that uses a custom renderer MUST expose its renderer contract address in
  a copyable form.
- **FR-004**: Creators MUST be able to paste a renderer contract address for reuse.
- **FR-005**: The product MUST resolve a pasted address only on the environment's canonical chain.
- **FR-006**: A contract address MUST be sufficient to attempt runtime reuse; no renderer registry
  entry, submission, listing, approval, or platform curation record may be required.
- **FR-007**: A pasted address with no contract on the canonical chain MUST produce a clear failure
  and MUST NOT trigger a search on another chain.
- **FR-008**: A membership MUST continue to expose the renderer address even when rendering fails.

#### Renderer Contract and Creator Approval

- **FR-009**: The project MUST publish one renderer input contract that defines the membership data
  available to custom renderers, including representative token and membership state.
- **FR-010**: The renderer input contract MUST make a configured onchain image available when one
  exists.
- **FR-011**: The renderer output contract MUST provide an image that the product can display.
- **FR-012**: Custom MUST appear as another entry in the existing Creator Studio style set and accept
  a compatible same-chain renderer address without adding a separate preview gallery or acceptance
  step to the Creator Studio.
- **FR-013**: The standalone `/render` page MUST use representative inputs that cover the materially
  different membership states and image configurations supported by the renderer flow.
- **FR-014**: The standalone `/render` page MUST display representative results for the creator's
  judgment without requiring an approve/reject control merely to reveal later controls.
- **FR-015**: After a compatible Custom renderer address returns displayable artwork, the Creator
  Studio MUST use it directly while preserving the rest of the existing artwork and membership flow.
- **FR-016**: If a Custom renderer call fails or does not return a displayable image, the product MUST
  show that failure plainly and MUST restore usable controls after the failed RPC settles.
- **FR-017**: Platform validation MUST be limited to calling the contract with the defined inputs,
  determining whether it returns a displayable image, and presenting representative results for the
  creator's judgment.
- **FR-018**: The platform MUST NOT claim to certify a custom renderer's aesthetics, artistic
  intent, safety, permanence, or behavior beyond the results it actually displays.
- **FR-019**: Preview and membership rendering MUST use the same renderer contract and the same
  public input contract.
- **FR-020**: Rendering MUST remain read-only with respect to membership ownership, payment terms,
  rewards, referrals, expiration accounting, and creator payout identity.

#### Agent-Readable Renderer Kit

- **FR-021**: The project MUST publish a portable renderer AI skill and `llms.txt` that authors can
  use or adapt when creating a custom renderer.
- **FR-022**: The AI skill and `llms.txt` MUST explain the renderer input contract, image output,
  representative membership states, onchain-image input, and canonical-chain target.
- **FR-023**: The AI skill MUST include a complete local testing workflow that renders and displays
  representative examples without requiring a public-chain write.
- **FR-024**: The local testing workflow MUST include a creator approval checkpoint before public
  deployment.
- **FR-025**: The AI skill MUST deploy only to the product environment's configured canonical chain
  and MUST show that chain clearly before requesting authorization for a public write.
- **FR-026**: The AI skill MUST carry forward the project's deployment lesson to test the actual
  final deployable payload against canonical-chain constraints rather than relying only on an
  incomplete artifact or a permissive local node.
- **FR-027**: Technical chain checks MAY be performed internally by the agent, but the normal
  creator-facing workflow MUST prioritize the representative images, the target chain, actionable
  failures, and the final contract address.
- **FR-028**: A successful deployment workflow MUST return a copyable renderer contract address.
- **FR-029**: Normal creator-facing completion MUST NOT require the creator to understand transaction
  receipts, source-verification records, code-identity proofs, or deployment journals.
- **FR-030**: The workflow MUST require explicit authorization immediately before a public write and
  MUST keep private keys and passwords out of prompts, generated files, and logs. Deploying the new
  protocol version to Robinhood testnet MUST stop at an operator gate after local validation, require
  separate operator approval, and require the operator to enter the deployment password interactively;
  ordinary creator renderer deployment continues to use only the creator's browser wallet.
- **FR-031**: Third-party renderer skills and `llms.txt` files MUST be treated as untrusted content;
  pasting a renderer contract address MUST NOT automatically execute or install associated agent
  guidance.

#### Onchain Image Composition

- **FR-032**: The renderer guidance MUST explain how the defined input supplies the configured
  onchain image to the renderer.
- **FR-033**: A renderer MAY crop, filter, recolor, transform, mask, combine, or otherwise reinterpret
  the supplied onchain image.
- **FR-034**: The feature MUST NOT require the renderer output to preserve the source image's exact
  bytes, visual appearance, dimensions, palette, or encoding.
- **FR-035**: Representative examples MUST show how the renderer behaves with the configured
  onchain image so the creator can judge the result.
- **FR-036**: When the onchain image is absent or unsupported, the renderer MAY return generated-only
  art or fail clearly; either result MUST be shown to the creator.
- **FR-037**: The product MUST NOT describe a displayed result as proof that source-image bytes were
  perfectly preserved.

#### Sharing Scope

- **FR-038**: The product MUST provide a permissionless onchain renderer registry that enumerates
  creators and the renderers each creator deployed through it.
- **FR-039**: A public renderer feed, platform curation, approval, ranking, moderation, and
  compatibility-scoring workflow is out of scope.
- **FR-040**: The sharing flow MUST NOT require a crosschain identifier; the address is interpreted
  only in the current environment's canonical-chain context.
- **FR-040a**: The create-membership style list MUST show the connected creator's registry-deployed
  renderers first, the six canonical defaults next, and Custom with an address field last.
- **FR-040b**: The registry MUST expose separate created and saved renderer lists so manually saving
  an existing address does not claim authorship.
- **FR-040c**: The registry MUST maintain an append-only enumerable list of addresses that have
  successfully deployed a renderer through it.

#### Public Renderer Lab and File Handoff

- **FR-041**: The renderer lab MUST be publicly usable without an account, SIWE, OAuth, or an
  authenticated backend session.
- **FR-042**: The renderer skill MUST write a portable, schema-versioned renderer package containing
  the candidate artifact, embedded representative requests, canonical-chain deployment inputs, and
  descriptive metadata.
- **FR-043**: The renderer page MUST accept a package through a file picker or drag-and-drop and keep
  the imported candidate in browser memory rather than upload it to the platform.
- **FR-044**: The package MUST NOT contain a source image, wallet secret, wallet signature,
  authentication artifact, paid RPC credential, or browser-executable code.
- **FR-045**: Before preview, the browser MUST validate package schema and size, require the
  environment's canonical chain, and recompute the artifact fingerprint and final initcode and
  runtime byte lengths from the imported contents.
- **FR-046**: A malformed, oversized, wrong-chain, or internally inconsistent package MUST fail with
  a clear explanation and MUST NOT become previewable or deployable.
- **FR-047**: Importing and previewing a package MUST NOT require a connected wallet. Wallet
  connection is required only when the creator chooses an action that needs a wallet signature.
- **FR-048**: Package previews MUST use the same renderer input and read-only canonical-RPC behavior
  as the existing create-membership preview.
- **FR-049**: A creator MUST be able to select an image in the browser and preview it without
  uploading it onchain or to a platform storage service.
- **FR-050**: The selected image MUST remain browser-held and MAY be included as call data in the
  ordinary read-only renderer request sent to the canonical RPC.
- **FR-051**: Sending browser-held image bytes in the requested read-only RPC preview MUST NOT
  require a separate confirmation, create a transaction, or persist the image.
- **FR-052**: The public renderer lab MUST NOT require a persistent image bucket, application
  database, cloud relay, hosted renderer-session service, backend signer, or paid RPC proxy.
- **FR-053**: The renderer output or clear failure returned by the RPC MUST be displayed directly to
  the creator for judgment.
- **FR-054**: The deployment section MUST remain visible without an approve/reject gate. Any
  candidate, representative-request, result, or deployment-input change MUST invalidate stale
  previews and prepared deployment data before the next deployment attempt.
- **FR-055**: Renderer deployment MUST use the configured renderer registry's
  `deployAndRegister(bytes initCode)` function rather than a backend deployment signer.
- **FR-056**: Before the creator clicks Deploy, the browser MUST show the canonical chain, complete
  final creation payload size, and renderer registry address. It MUST NOT present a predicted
  renderer address as authoritative.
- **FR-057**: Deployment preparation MUST reject initcode that exceeds the registry's canonical
  transaction limit.
- **FR-058**: Only the creator's browser wallet, through the established wallet lifecycle, may
  simulate, sign, and submit the deployment after the creator clicks Deploy.
- **FR-059**: After successful deployment, the browser MUST decode the registry event, show the
  actual renderer contract address, and make that address available in the creator's registry list.
- **FR-059a**: Deploying and recording a renderer MUST require one creator-wallet transaction.
- **FR-059b**: Membership tier creation MUST continue to accept any compatible direct renderer
  address without consulting the renderer registry.
- **FR-060**: The platform MUST NOT persist the imported package, browser-selected source image,
  rendered preview, or prepared deployment request after the page session ends.
- **FR-061**: The renderer skill SHOULD offer an optional loopback helper that binds only to
  `127.0.0.1` on a random high port and keeps candidate and result state only in bounded process
  memory.
- **FR-062**: The helper MUST open or print a public renderer-page URL whose fragment contains the
  exact loopback endpoint and an unguessable, short-lived local capability. The fragment MUST NOT be
  sent to or exchanged by a hosted backend, and the page MUST remove it from the visible URL after
  reading it into browser memory. The page MUST accept only `http://127.0.0.1` with a valid high
  port as a fragment-provided helper origin.
- **FR-063**: The loopback helper MUST enforce the local capability, exact allowed web origin,
  request and response size limits, expiry, and explicit CORS/preflight handling; it MUST reject LAN
  binds, wildcard origins, and requests without the capability.
- **FR-064**: When loopback works, the helper MAY transfer the renderer package to the browser and
  receive preview results, prepared deployment data, and the final deployed address.
  It MUST NOT receive the creator's selected source image.
- **FR-065**: The loopback helper and local capability MUST NOT authorize a wallet prompt,
  simulation, signature, transaction submission, or receipt lifecycle operation.
- **FR-066**: If loopback is blocked, denied, expired, or unavailable, the page MUST clearly offer
  manual import of the same renderer package without requiring a rebuild or hosted fallback.

### Key Entities

- **Renderer Contract**: A contract at an address on the environment's canonical chain that accepts
  the published renderer input and returns an image.
- **Renderer Input**: The public membership context supplied to a renderer, including representative
  token state and the configured onchain image when present.
- **Representative Example Set**: Images or clear failures returned from the renderer across the
  materially different membership states and image configurations presented for review.
- **Creator Decision**: The creator's judgment after seeing representative examples. It is not a
  persisted UI gate; choosing Deploy is the explicit action that requests wallet submission.
- **Renderer Kit**: The portable AI skill, `llms.txt`, local testing instructions, input/output
  documentation, and canonical-chain deployment guidance used to create a renderer.
- **Renderer Package**: A schema-versioned local JSON file written by the renderer skill and
  imported into the webpage as the manual fallback. It carries the renderer candidate and
  representative requests, but no creator image, authentication artifact, wallet secret, or
  browser-executable code.
- **Membership Renderer Reference**: The renderer contract address shown on a membership and copied
  for direct reuse.
- **Renderer Lab Session**: Temporary browser-memory state containing the imported candidate,
  representative requests and results, and prepared deployment request. It has no
  account, agent token, or server-side session record.
- **Local Renderer Helper**: An optional loopback-only process that transfers a renderer package and
  browser-produced results between the agent and public page using a random, expiring local
  capability. It has no creator identity or wallet authority.
- **Local Preview Image**: Image data selected by the creator for temporary design review. It stays
  browser-held, may be included in a read-only canonical-RPC renderer call, and is not a durable or
  onchain media record.
- **Unsigned Renderer Deployment Request**: The renderer's final creation payload,
  canonical renderer registry, and canonical chain, prepared for the creator's browser wallet
  without granting signing authority to the agent.
- **Renderer Registry**: A permissionless onchain index that deploys and records renderers, returns
  their actual addresses, separates creator provenance from saved addresses, and never gates tier
  creation.

## Assumptions and Dependencies

- The current product environment's one canonical public chain is Robinhood testnet (`46630`). Local
  chain `31337` is evidence-only. Robinhood mainnet configuration and deployment are out of scope.
- A public renderer catalog or feed is intentionally excluded; owner-specific registry enumeration
  is included.
- The renderer input contract can expose the configured onchain image in a form contracts can use.
- A renderer author controls how the supplied image affects the final artwork; transformation is a
  feature, not a failure of byte preservation.
- The creator's judgment after seeing representative images is the practical design boundary. It is
  not a performative UI gate, and the platform does not attempt exhaustive proofs about arbitrary
  renderer behavior.
- The agent may perform technical deployment checks behind the scenes, but creator-facing success is
  expressed as visible examples, the correct canonical chain, and a reusable contract address.
- Wallet connection, submission, replacement, cancellation, and failure reporting remain owned by
  the established wallet lifecycle rather than being reimplemented by this feature.
- Preparing an unsigned deployment request is distinct from requesting a wallet signature or
  broadcasting a transaction; only the creator can start those browser-wallet actions.
- Browser-local image handling is the default because it avoids a persistent media-storage service.
  Including image bytes in the ordinary read-only RPC preview request is part of that browser flow,
  not a persistent upload, and needs no additional confirmation.
- The renderer registry is separately deployed and does not require redeploying or modifying the
  immutable membership protocol.
- Optional loopback is the preferred convenience handoff when the browser permits it; local
  renderer-package import is the universal fallback. Both use the same canonical RPC and
  established wallet lifecycle.
- Public RPC transport is sufficient for the initial renderer lab. Paid RPC credentials remain
  server-only and are not exposed or proxied by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In direct-address tests, a compatible renderer pasted into Custom renders without a
  separate acceptance step, while a failed renderer reports the error and leaves controls usable.
- **SC-002**: In 100% of acceptance tests, renderer calls that return displayable images are shown to
  the creator, while reverts and responses without an image produce a clear failure.
- **SC-003**: In at least four of five agent trials starting with only the renderer AI skill,
  `llms.txt`, and an art brief, the agent produces local examples, reaches an explicit approval
  checkpoint, deploys to the canonical chain when authorized, and returns the contract address
  without undocumented project knowledge.
- **SC-004**: In 100% of supported onchain-image test cases, the configured image is made available
  through the defined renderer input and transformed results can be displayed without requiring
  proof that output bytes match the source bytes.
- **SC-005**: In renderer-selection tests, neither Custom in the Creator Studio nor the standalone
  renderer page adds a performative approve/reject gate before the creator can continue.
- **SC-006**: In 100% of deployment trials, the workflow identifies the environment's canonical
  chain before authorization and returns a contract address after success without presenting a
  crosschain choice.
- **SC-007**: In 100% of tested custom-rendered membership views, the renderer contract address is
  visible and copyable even if the renderer currently fails to return an image.
- **SC-008**: The standalone renderer page displays the complete representative image set without
  inserting that gallery into the membership Creator Studio.
- **SC-009**: An agent-produced renderer package can be imported and previewed without an account or
  wallet connection.
- **SC-010**: In 100% of deployment tests, importing or previewing a package cannot trigger a wallet
  prompt or public write; only the creator's Deploy action may begin the wallet lifecycle.
- **SC-011**: In 100% of preview cases supported by browser-local rendering, the selected image can
  be shown in representative designs through the ordinary read-only canonical-RPC request without
  creating a transaction or persistent media record.
- **SC-012**: In 100% of image-preview tests, no extra transmission confirmation is shown, and
  neither the package, source image, nor rendered preview remains available after the page session
  ends.
- **SC-013**: In 100% of renderer deployment tests, the creator's wallet is the only signer, one
  transaction deploys and records the renderer, and the address emitted by the registry is shown
  after successful deployment.
- **SC-014**: In 100% of import tests, a valid renderer package reaches previews and visible
  deployment controls without an approve/reject gate, while malformed, wrong-chain, or inconsistent
  packages are rejected before any wallet prompt.
- **SC-015**: In supported-browser tests, the loopback link transfers the same package and results
  as manual import without SIWE or hosted session state; in every denied or blocked case, the page
  offers manual import and no package rebuild is required.
