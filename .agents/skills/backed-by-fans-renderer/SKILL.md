---
name: backed-by-fans-renderer
description: Author, test, package, and prepare creator-reviewed deployment of Backed By Fans custom onchain membership renderers. Use when creating or revising a renderer contract, its media behavior, representative previews, or its browser-wallet deployment handoff.
metadata:
  short-description: Build Backed By Fans renderers
---

# Backed By Fans Renderer

Create a renderer that implements the published membership-renderer contract, prove its behavior
locally, and let the creator judge canonical-RPC examples before any public write.

## Route the work

- Before writing contract code or interpreting image inputs, read
  [references/interface.md](references/interface.md).
- When compiling, testing, packaging, rendering examples, or collecting visual approval, read
  [references/local-testing.md](references/local-testing.md).
- Read [references/deployment.md](references/deployment.md) only after the creator has approved the
  exact browser examples or when diagnosing a deployment blocker.
- Use [llms.txt](llms.txt) as the compact public handoff. The references remain authoritative for
  procedures.

## Essential boundaries

- Robinhood testnet (`46630`) is the only canonical public renderer chain in this version. Treat a
  renderer as `(chain ID, address)` and share the direct same-chain address; do not add a registry,
  crosschain search, version lookup, or platform approval record.
- Use the canonical Solidity interface and types. Let Foundry produce the artifact ABI, let the
  package writer embed that ABI, and let the web app consume its generated wagmi bindings. Do not
  hand-maintain a second ABI or interface.
- Preview and package work is local or read-only. It needs no account, SIWE, OAuth, hosted session,
  storage backend, paid RPC proxy, private key, mnemonic, or password.
- The optional helper is loopback-only convenience. The same renderer package must work through
  browser file import when loopback is blocked or unavailable.
- `nativeMedia` and onchain `MediaConfig` are artistic inputs, not preservation requirements. A
  renderer may transform or ignore them. Judge displayed outputs; never claim exact source bytes,
  appearance, dimensions, palette, or encoding were preserved.
- Only the creator's browser wallet may deploy a renderer. Never request, export, receive, or use a
  creator private key. Protocol deployment is a separate operator action with its own approval and
  interactive password boundary.

## Outcome

Finish with one of two plain-language states:

- The creator approved the representative images and the renderer is deployed on Robinhood
  testnet; return its copyable contract address.
- The renderer is not deployed; state the actionable blocker and the last evidence that did pass.

Local tests, a package, predicted address, or approved preview are prerequisites—not deployment
proof.
