---
title: Onchain Membership Art and Creator Studio Implementation Plan
date: 2026-08-30
status: in_progress
type: plan
depth: deep
risk: high
deepened: 2026-08-30
origin: docs/brainstorms/2026-08-30-onchain-membership-art-creator-studio-requirements.md
---

# Onchain Membership Art and Creator Studio Implementation Plan

## Summary

Replace the disposable image-URI generation with one canonical onchain SVG per membership. The
founding renderer supplies six deterministic engines and optionally embeds creator-paid JPEG or PNG
bytes stored in immutable Robinhood Chain contract code. The Studio accepts a local file or
clipboard image, transforms it locally into the exact bounded bytes used everywhere, and publishes
through the existing wagmi/viem boundary.

Add an append-only renderer registry to the membership factory. Each tier selects an enabled version
and permanently pins its renderer address and runtime code hash. This permits additive renderer
releases without silently mutating existing memberships.

This is a clean cut: no remote media, URL import, HTML surface, `animation_url`, compatibility
adapter, or migration of the disposable testnet generation.

## Goals

- Ship STACK, CHORUS, LOOM, BLOOM, MARQUEE, and AFTERIMAGE as complete generated artwork.
- Produce one self-contained SVG in base64 onchain JSON metadata.
- Embed optional transformed JPEG or PNG bytes directly in the SVG.
- Make token geometry deterministic from chain, tier identity, token ID, seed, and art config.
- Preserve geometry while expressing active and afterglow as intentional visual states.
- Give creators exact contract-backed previews, bounded controls, and Surprise Me rerolls.
- Store media through a creator-scoped immutable onchain registry.
- Support append-only renderer versions with immutable tier pinning.
- Prove contract, browser, Anvil/fork, visual, and consumer behavior before promotion.

## Non-Goals

- Moderation or frontend suppression.
- Arweave, IPFS, HTTPS media, remote loaders, gateways, or URL import.
- HTML/JavaScript NFT documents or `animation_url`.
- Arbitrary creator code, SVG fragments, video, audio, or multi-store media.
- Renderer proxies or mutable implementation indirection.
- Existing testnet compatibility layers or tier migration.
- Reimplementation of wallet connection or transaction lifecycle.
- Mainnet broadcast.

## Technical Decisions

### One artwork surface

`tokenURI` emits nested base64 JSON whose `image` is the canonical base64 SVG. Preview and
production call the same Solidity renderer. There is no second representation to synchronize,
viewer chrome, or media loader.

### Immutable onchain media

`MediaConfig` is either all zero for generated-only art or a complete JPEG/PNG store identity:
MIME, store, length, digest, and runtime code hash. The media factory deploys `STOP || payload`,
records creator attribution, and exposes bounded creator pagination. Official tier creation validates
the record; rendering verifies pinned runtime identity and reads exact bytes.

The low-level Robinhood payload ceiling is 98,303 bytes because the STOP prefix occupies one runtime
byte. The renderer-safe product ceiling is 90 KiB.

### Exact browser transformation

File selection and clipboard image paste converge on `processImageSource`. Before decode it checks
source byte, side, and pixel limits. It normalizes JPEG orientation metadata, decodes once, applies
crop and orientation exactly once, resizes to a supported square, and re-encodes JPEG or PNG.
Re-encoding strips source metadata. One candidate byte array feeds preview, quote, store, digest,
and reconciliation.

### Append-only renderer registry

The factory stores `rendererVersion => {implementation, runtimeCodehash, enabled}` and
`implementation => version`. Registration verifies code, fixed schema, and nonzero engine count,
then appends a disabled version. Governance explicitly enables a reviewed version. The founding
renderer is registered enabled by the constructor.

Each tier snapshots version, implementation, and runtime code hash. Disabling a registry entry
affects only future tier creation. Future renderer-specific product controls may require a frontend
release; they do not require a new factory or change existing tier pins.

### Wallet and recovery boundary

Every write follows simulate -> exact wallet request -> supplied successful receipt -> canonical
read reconciliation. wagmi/viem own connection, submission, receipts, replacement, cancellation,
and polling. If media storage succeeds before tier publication, recovery comes from the creator
media registry, not reconstructed wallet history.

## Implementation Units

### U1. Replace metadata and renderer types

- Remove image URI, remote modes, remote references, motion, HTML preview, and `animation_url`.
- Add extensible `uint16` engine IDs and one shared bounded `ArtConfig`.
- Add all-zero/generated and complete/onchain `MediaConfig` invariants.
- Define `IMembershipRenderer` manifest, preview, validation, and render methods.
- Emit one self-contained SVG and one nested metadata URI.

Verify deterministic preview/production identity, bounded output, specific validation failures, and
the complete absence of scripts, remote references, or `animation_url`.

### U2. Finish six deterministic engines

- Preserve shared palette, typography, grain, editorial hierarchy, and media aperture primitives.
- Keep each engine's form recognizable and materially distinct.
- Derive geometry from the stable render seed domain.
- Embed native JPEG/PNG bytes inside the same SVG composition.
- Preserve geometry between active and afterglow.

Verify total admitted inputs under fuzzing, distinct engine hashes, state geometry identity, native
embedding across all engines, and 90 KiB response/gas budgets.

### U3. Add native media registry

- Validate bounded JPEG/PNG structure and safe declared dimensions.
- Deploy creator-scoped content-addressed immutable stores.
- Record creator, MIME, length, digest, and runtime code hash.
- Reuse duplicate creator uploads without duplicate pagination entries.
- Validate creator attribution and the full record during official tier creation.

Verify exact STOP-prefixed bytes, deterministic predictions, failure of empty/oversized/unsafe/
foreign/mutated records, exact-boundary Robinhood-sized Anvil deployment, and payload-free events.

### U4. Add renderer registry and tier pinning

- Add append-only registration and explicit enable/disable admission.
- Validate schema, engine count, code presence, uniqueness, and runtime code hash.
- Pass dynamic renderer provenance through the tier deployer.
- Store renderer version/address/code hash immutably in each tier.
- Fail metadata rendering if pinned runtime changes.

Verify owner-only governance, disabled-by-default additions, unchanged old tiers, later-version tier
creation, and rejection of duplicate, schema-mismatched, empty, or zero-engine renderers.

### U5. Build exact image processing

- Accept local JPEG/PNG files and clipboard image file items only.
- Enforce 20 MiB, 12,000-side, and 40 MP source limits before decode.
- Normalize EXIF orientation before decode and explicitly transform orientations 1-8 once.
- Crop around the focal point, resize, and re-encode.
- Enforce JPEG quality, explicit PNG purpose, exact MIME, and 90 KiB maximum.
- Dispose bitmaps, canvases, object URLs, and superseded async work.

Verify crop bounds, transparency, orientations 1-8, decoder/encoder failure, clipboard text
rejection, one exact candidate object, and latest-selection-wins behavior.

### U6. Build Creator Studio

- Default to generated art and make an onchain image explicitly optional.
- Present six engine identities, bounded controls, lockable Surprise Me, and representative previews.
- Show file selection, keyboard-focusable paste, transform settings, byte size, and processed preview.
- Read the creator's verified media library for reuse and recovery.
- Require consent before sending exact unpublished bytes to the configured RPC for contract preview.
- Keep invalid input and guidance stable and accessible.

Verify no URL input, remote mode, iframe, HTML preview, or motion control; both media states use
`previewSVG`; and paste/file converge on one processor.

### U7. Wire publication without crossing wagmi

- Store new media with the exact processed bytes.
- Reconcile a supplied successful storage receipt to the creator-scoped record.
- Feed only a confirmed record into `createTier`.
- Set the selected renderer version in immutable tier config.
- Reconcile tier events and canonical renderer/media provenance.
- Render supporter pages from the single metadata `image`.

Verify the simulated request reaches the wallet unchanged, no custom wallet lifecycle appears,
interrupted storage recovers from the registry, and authenticity checks compare a tier's pinned
renderer record with its factory registry entry.

### U8. Deploy, inspect, and promote

- Update deterministic deployment scripts and manifests for the registry factory.
- Generate ABI bindings from current Foundry artifacts.
- Run contract, web, browser, Anvil, and target-fork verification using RPC from `.env`.
- Generate all six engines for IDs 1/7/42, generated/onchain media, active/afterglow.
- Inspect every matrix cell at full size and thumbnail size and retain evidence.
- Run structured review, resolve findings, commit, push, open a PR, and watch CI.
- Stop at the interactive operator-password prompt before any public testnet write.
- After authorization, verify runtime hashes, sources, registry, media, tier, token metadata, and
  official consumer rendering before promoting addresses.

## Failure Propagation

- Invalid source: remain in Studio with specific local guidance.
- Candidate too large: lower dimension/quality or choose another image; never offer remote media.
- RPC preview not consented: show the local candidate and explain the exact preview gate.
- Media write failure: retain candidate and do not publish a tier.
- Stored-media reconciliation failure: show the receipt but require canonical recovery.
- Renderer disabled or code changed: fail tier creation before deployment.
- Renderer changed after publication: fail metadata rather than call different logic.
- Partial public deployment: retain candidate journal only; do not generate canonical bindings.

## Security and Privacy

- Source/transformed bytes and clipboard contents never enter analytics or logs.
- Clipboard handling accepts image file items and never executes clipboard HTML.
- Input is bounded before decode and re-encoded before storage.
- Creator identity comes from `msg.sender`; official media cannot be borrowed across creators.
- Renderer and store runtime code hashes are immutable provenance checks.
- Renderer implementations are direct immutable contracts, not proxies.
- No general fetcher, remote resolver, creator executable code, or HTML document exists.

## Visual Review Matrix

For each engine, render token IDs 1, 7, and 42 across generated active, generated afterglow, onchain
image active, and onchain image afterglow. This is 72 mandatory SVG inspections. Mechanically test
both JPEG and PNG embedding. Inspect every cell at thumbnail and full size for hierarchy, legibility,
clipping, media integration, stable geometry, and desirable afterglow.

## Verification Commands

```sh
cd contracts
forge fmt --check
FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860
FOUNDRY_PROFILE=robinhood forge test --code-size-limit 1000000 --gas-limit 1000000000

cd ../web
bun run generate
bun run typecheck
bun run lint
bun run test

cd ..
./scripts/test-web-anvil.sh
./scripts/verify-local.sh
```

The deployment dry run uses the configured `.env` RPC without printing it. Public testnet broadcast
is a separate interactive step requiring the operator password.

## Release Gate

Complete only when obsolete paths are absent, automated checks pass, the 72-cell gallery is visually
inspected, registry behavior is proven, Anvil/fork evidence is retained, review findings are
resolved, the PR is green, and any public testnet deployment has passed the explicit password gate
and independent verification.
