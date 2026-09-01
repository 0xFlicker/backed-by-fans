---
name: onchain-render-skill
description: Create, test, preview, and prepare browser-wallet deployment of Backed By Fans-compatible onchain membership renderers. Use when an artist asks an agent to build or revise a renderer and return a reusable same-chain contract address.
metadata:
  short-description: Build an onchain membership renderer
---

# Onchain Render Skill

Turn an art brief into a compatible onchain membership renderer, let the creator judge representative previews, and return the deployed renderer address when they choose to publish it.

## Begin with the creator

Before running tools or writing code, ask the creator these short questions together:

1. What do you create, and what are you known for?
2. What theme or world should the membership art explore, and how should it feel visually?
3. Should the design use an image? If yes, ask the creator to attach it or provide an accessible local path.

Do not repeat a question the creator has already answered. Keep this conversational and about the artwork; dependency and contract details come later. If the creator wants an image, treat it as a primary design input rather than an optional afterthought.

## Start cheaply

1. Run `./scripts/check-dependencies.sh` before reading installation manuals or inventing setup commands.
2. If a required tool is missing, explain what will be installed and get the user's permission before running `./scripts/bootstrap.sh --install`.
3. Create a working renderer with `./scripts/new-renderer.sh <project-directory>`.
4. Read [references/interface.md](references/interface.md) before changing the Solidity interface or media handling.

## Build and preview

1. Implement the creator's direction in the generated Foundry project.
   - When an image is requested, implement and exercise the renderer's `nativeMedia` and stored-media paths. The image must visibly participate in the proposed design unless the creator asks for a subtler treatment.
   - Use generated-only artwork only when the creator says they do not want an image.
2. Run `./scripts/test-renderer.sh <project-directory>` to format, compile, test, package, and produce a local gallery.
3. Show the gallery to the creator. Mechanical checks establish only that the required calls work and return displayable results for the tested inputs.
4. The creator decides whether the design is acceptable. Do not describe a passing check as a safety audit, proof, certification, verification record, or artistic approval.
5. If the creator rejects the design, revise it and repeat. If a required call fails, report the failure plainly and fix it before asking for approval.

For the detailed local workflow, read [references/local-testing.md](references/local-testing.md).

## Browser handoff and deployment

- Use the public renderer preview page for representative browser previews. Renderer preview does not belong in the membership Creator Studio.
- Prefer the creator's regular external browser, where their wallet extensions are available. Open the helper URL there first; use an agent's packaged browser only when the external browser cannot be opened.
- When the agent and browser share a machine, prefer `bun ./scripts/session-helper.ts --package <package> --image <image> --page-url <url>` for loopback handoff. The browser should receive both the package and the selected image when permitted.
- In a cloud, sandbox, or VM that cannot reach the creator's browser, export `renderer-package.json` as a downloadable artifact. Tell the creator to open `/render` in their own browser, upload that file, and then choose the source image there. Do not replace this handoff with a private key or hosted upload service.
- A selected image may be encoded into canonical RPC preview calldata without a separate confirmation. It is never added to the renderer package.
- Only the creator's browser wallet may authorize and submit deployment. Never request or handle a creator private key, mnemonic, keystore, or wallet password.
- Read [references/deployment.md](references/deployment.md) only after the creator approves the design or when deployment is blocked.

## Fixed product boundaries

- Robinhood testnet (`46630`) is the only public chain supported by this version.
- Renderers are shared directly by contract address on that chain. There is no renderer registry or cross-chain lookup.
- A custom renderer replaces the default renderer; it does not change the rest of the Creator Studio or membership economics.
- `nativeMedia` and onchain media are artistic inputs. The renderer may crop, filter, recolor, transform, combine, reinterpret, or ignore them.

## Finish plainly

When deployed, return the chain and copyable contract address. When not deployed, state the immediate blocker. Do not burden the creator with receipts, proof language, deployment journals, or source-verification records.
