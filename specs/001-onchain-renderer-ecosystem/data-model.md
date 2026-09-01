# Data Model: Onchain Renderer Ecosystem

## Canonical Chain Profile

Represents the one chain supported by a product environment.

| Field | Type | Rules |
|---|---|---|
| `chainId` | `46630 \| 31337` | `46630` is the only public target in scope; `31337` is local evidence only. |
| `rpc` | runtime transport | Comes from existing public configuration; never copied into artifacts or logs. |
| `previewHarness` | address | Generated from the promoted deployment record; required for undeployed preview. |
| `rendererRegistry` | address | Optional until deployed; required only for browser renderer deployment and creator enumeration. |
| `maxRendererRuntimeBytes` | integer | Project ceiling `88_000`. |
| `maxRendererInitcodeBytes` | integer | Registry ceiling `94_656`, leaving room for the signed transaction envelope under the chain's 95,000-byte limit. |

## Renderer Contract

The directly selected membership renderer.

| Field | Type | Rules |
|---|---|---|
| `chainId` | canonical chain ID | Inferred from environment, never selected independently. |
| `address` | address | Must contain code on the canonical chain before use in a tier. |
| `schema` | bytes32 | Expected `BackedByFans.MembershipRenderer.v1` schema. |
| `name` | string | Display information read from the renderer. |
| `engineManifest` | array | Optional display/configuration aid read directly from the contract. |

**Identity**: `(chainId, address)`. The same hexadecimal address in another environment is a
different identity and is never searched automatically.

## Renderer Candidate

A locally built renderer that has not necessarily been deployed.

| Field | Type | Rules |
|---|---|---|
| `candidateId` | random string | Unique only within the local helper or browser session. |
| `artifactFingerprint` | bytes32/hex | Hash of final creation bytecode, runtime bytecode, constructor inputs, compiler profile, and interface schema. |
| `creationBytecode` | hex | Complete final initcode used by preview harness and deployment. |
| `runtimeBytecode` | hex | Used for size reporting and local tests, not as a registry identity. |
| `initCodeByteLength` | integer | Must equal the complete `creationBytecode` length and fit the registry limit. |
| `sourceRoot` | local path | Remains local; never accepted by a hosted compilation endpoint. |
| `packageManifest` | object | Conforms to `contracts/renderer-package.schema.json`. |
| `status` | enum | `building`, `ready`, `previewing`, `approved`, `invalidated`, `deployed`, `failed`. |

### Candidate transitions

```text
building -> ready -> previewing -> approved -> deployed
    |          |          |           |
    v          v          v           v
  failed     failed     failed     invalidated
                 artifact/config/request change -> ready
```

Any bytecode, constructor, configuration, representative-request, or displayed-result change invalidates the
current approval and prepared deployment request.

## Renderer Input

The existing `MembershipTypes.PreviewContext` used by browser and contract.

| Field | Type | Rules |
|---|---|---|
| `token` | `TokenRenderData` | Includes tier text, identity, art config, media config, token ID, expiration, and active state. |
| `nativeMedia` | bytes | Browser-held processed image bytes or empty bytes; may be transmitted to the canonical RPC. |

The required representative matrix is token 1 active without image, token 1 expired with image,
token 7 active with image, token 7 expired without image, token 42 active without image, and token 42
expired with image. An image case uses the browser-selected image when present, otherwise configured
onchain media; absence or unsupported media is shown as generated-only output or a clear failure.
The renderer may transform or ignore `nativeMedia`; the creator decides from the returned examples.

## Preview Request

One request for a displayed renderer result.

| Field | Type | Rules |
|---|---|---|
| `requestId` | random string | Unique within the local helper or browser session. |
| `candidateFingerprint` | hex | Must match current candidate. |
| `mode` | enum | `deployed-address` or `undeployed-initcode`. |
| `method` | enum | `previewSVG` or `previewTokenURI`. |
| `contextWithoutMedia` | object | Agent-provided representative context; browser inserts local image bytes. |
| `localImageSlot` | boolean | Indicates browser may supply current local image. No bytes enter helper state. |
| `requestedAt` | timestamp | Local session only. |

## Preview Result

The RPC result shown to the creator and, in loopback mode, returned to the local helper.

| Field | Type | Rules |
|---|---|---|
| `requestId` | string | References one preview request. |
| `candidateFingerprint` | hex | Must still match current candidate. |
| `status` | enum | `ready` or `failed`. |
| `image` | SVG/data URI | Returned only for a displayable image; process-memory lifetime only. |
| `error` | structured error | Plain-language summary plus optional technical detail. |
| `resultFingerprint` | bytes32/hex | Hash used to bind creator approval. |
| `completedAt` | timestamp | Local session only. |

The source image is not part of this entity. Results are removed when the page closes or the helper
exits or expires.

## Renderer Package Import State

Manual transport of the same renderer candidate used by the loopback path.

| Field | Type | Rules |
|---|---|---|
| `formatVersion` | integer | Must match a supported package schema. |
| `candidate` | Renderer Candidate | Parsed from the package; artifact and deployment fields are recomputed before use. |
| `requests` | Preview Request array | Embedded representative contexts contain no creator image bytes. |
| `descriptive metadata` | strings | Displayed as inert text; never evaluated as browser code. |
| `importedAt` | timestamp | Browser-memory state only; not part of the package. |

The agent writes a `*.renderer.json` file and the creator drops or selects it in the webpage. The
file contains no wallet secret, wallet signature, authentication artifact, local capability, paid
RPC credential, source image, or rendered output. Import requires no loopback access. The
browser validates schema and size, requires the environment's canonical chain, and recomputes the
artifact fingerprint and final initcode/runtime byte lengths before the
candidate can be previewed. A page refresh or closure discards imported state.

## Local Renderer Helper Session

Optional loopback coordination between the public creator page and local agent helper.

| Field | Type | Rules |
|---|---|---|
| `sessionId` | high-entropy string | Generated by helper; identifies bounded process-memory state. |
| `canonicalChainId` | chain ID | Fixed by the package and checked by the browser. |
| `siteOrigin` | URL origin | Must equal the configured Backed By Fans origin. |
| `loopbackOrigin` | `http://127.0.0.1:<port>` | Random high port; no hostname, LAN, or wildcard bind. |
| `localCapability` | high-entropy string | Passed in the public page URL fragment, read into memory, then removed from the visible URL. |
| `expiresAt` | timestamp | Local capability hard limit. |
| `status` | enum | `ready`, `active`, `expired`, `closed`. |
| `candidate` | Renderer Candidate | At most one current candidate. |
| `requests/results` | bounded maps | Process memory only; cleared at expiry/close. |
| `approval` | Creator Approval or null | Cleared on candidate/request/result mutation. |

### Session transitions

```text
ready -> active -> closed
  |        |
  +--------+-> expired
```

Expired capabilities and origin, chain, package, or session mismatches are rejected. The local
capability authorizes only helper API access; it conveys no identity and cannot initiate wallet work.

## Creator Approval

| Field | Type | Rules |
|---|---|---|
| `chainId` | canonical chain ID | Must equal the imported or loopback package chain. |
| `candidateFingerprint` | hex | Exact approved artifact. |
| `requestSetFingerprint` | hex | Exact representative request set. |
| `resultFingerprints` | ordered array | Every required example must be ready and included. |
| `approvedAt` | timestamp | Local display/audit aid only; not durable proof. |

Approval is a temporary UX gate, not platform certification and not an onchain attestation.

## Unsigned Renderer Deployment Request

| Field | Type | Rules |
|---|---|---|
| `chainId` | canonical chain ID | Must match the package, page environment, and connected wallet at deployment. |
| `registry` | address | Configured onchain renderer registry. |
| `initcode` | hex | Exact approved final creation payload. |
| `initCodeByteLength` | integer | Must be at most `94_656`. |
| `approvalFingerprint` | hex | Invalidated whenever approved inputs change. |
| `state` | enum | `prepared`, `awaiting-creator`, `wallet-pending`, `confirmed`, `failed`. |

`wallet-pending`, replacement, cancellation, revert, and receipt behavior are presented directly
from wagmi/viem. They are not persisted or independently inferred. Only a successful library-
supplied receipt advances product reconciliation to `confirmed`.

## Membership Renderer Reference

The new tier stores and exposes one direct `renderer` address. There is no renderer version,
enablement status or renderer registry entry in the membership protocol path. Membership
views always display a copy action for this address, including when the current renderer call fails.

## Renderer Package

The local package binds final artifacts, embedded representative requests, AI guidance references,
and deployment inputs in one JSON file.

| Field | Type | Rules |
|---|---|---|
| `formatVersion` | literal | Current version is `2`. |
| `rendererName` | string | Human-readable. |
| `interfaceSchema` | bytes32/hex | Fixed renderer schema. |
| `compiler` | object | Solidity version, EVM version, optimizer settings. |
| `artifacts` | object | Source reference plus complete ABI, creation bytecode, runtime bytecode, and fingerprint. |
| `deployment` | object | Canonical chain and final initcode byte length. |
| `examples` | array | Embedded representative requests without creator image bytes or prior results. |
| `skill` | string | Inert reference to the renderer skill entrypoint. |
| `llms` | string | Inert reference to renderer-specific `llms.txt`. |

The webpage accepts at most 1,000,000 bytes for the first implementation. It never resolves local
paths from the package or evaluates imported text as code. The package can be used for the manual
browser handoff, while runtime sharing after deployment still requires only the contract address.

## Renderer Registry

The registry is a separate permissionless index and deployment surface, not part of tier admission.

| Field | Type | Rules |
|---|---|---|
| `creators` | append-only address array | Adds a caller after their first successful registry deployment. |
| `creatorOf(renderer)` | address | Set only when the registry creates the renderer. |
| `createdRenderers(owner)` | current address array | Creator-provenance entries; bounded pagination. |
| `savedRenderers(owner)` | current address array | Directly registered existing addresses; never claims authorship. |
| `registrationKind(owner, renderer)` | enum | `None`, `Created`, or `Saved`. |

`deployAndRegister(initCode)` creates and validates the renderer, returns and emits the actual
address, and records it in one transaction. `register(address)` and `unregister(address)` only alter
the caller's current index. No registry method approves a renderer or controls membership use.
