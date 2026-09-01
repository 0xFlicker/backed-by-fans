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
3. What illustrative membership name should appear in the previews?
4. Would you like to provide an image, have me generate one, or make the design without an image? If they provide one, ask for the attachment or an accessible local path. If they ask for generation, use an available image-generation tool and show the result before building it into the design.

Do not repeat a question the creator has already answered. Keep this conversational and about the artwork; dependency and contract details come later. If no membership name is supplied, create a short illustrative name that fits the creator and theme, then tell them: “I’ll use [name] for the previews. You can change it on the preview page. The final membership name is chosen when you create the membership.” If the creator wants an image, treat it as a primary design input rather than an optional afterthought.

## Start cheaply

1. Run `./scripts/check-dependencies.sh` before reading installation manuals or inventing setup commands.
2. If a required tool is missing, explain what will be installed and get the user's permission before running `./scripts/bootstrap.sh --install`.
3. Create a working renderer with `./scripts/new-renderer.sh <project-directory>`.
4. Read [references/interface.md](references/interface.md) before changing the Solidity interface or media handling.

## Build and preview

1. Implement the creator's direction in the generated Foundry project.
   - When an image is requested, implement and exercise the renderer's `nativeMedia` and stored-media paths. The image must visibly participate in the proposed design unless the creator asks for a subtler treatment.
   - Use generated-only artwork only when the creator says they do not want an image.
2. Run `./scripts/test-renderer.sh <project-directory> --membership-name "<preview name>"` to format, compile, test, package, and produce a local gallery using the illustrative membership name.
3. Show the gallery to the creator. Mechanical checks establish only that the required calls work and return displayable results for the tested inputs.
4. The creator decides whether the design is acceptable. Do not describe a passing check as a safety audit, proof, certification, verification record, or artistic approval.
5. If the creator rejects the design, revise it and repeat. If a required call fails, report the failure plainly and fix it before asking for approval.

For the detailed local workflow, read [references/local-testing.md](references/local-testing.md).

## Browser handoff and deployment

- Use the public renderer preview page for representative browser previews. Renderer preview does not belong in the membership Creator Studio.
- Prefer the creator's regular external browser, where their wallet extensions are available. Open the helper URL there first; use an agent's packaged browser only when the external browser cannot be opened.
- An agentic browser is useful for inspecting previews, but it is not the final handoff when the creator needs their normal browser or wallet extension. Do not finish the task merely because the previews worked in an internal browser.
- When the agent and browser share a machine, prefer `bun ./scripts/session-helper.ts --package <package> --image <image> --page-url <url>` for loopback handoff. The browser should receive both the package and the selected image when permitted.
- Treat loopback as optional. In ChatGPT it requires the ChatGPT browser extension plus permission for the preview site to reach the local helper. If the extension is absent, permission is denied, or the helper cannot be reached, move directly to file handoff.
- In a cloud, sandbox, or VM that cannot reach the creator's browser, export `renderer-package.json` as a downloadable artifact. Tell the creator to open `/render` in their own browser, upload that file, and then choose the source image there. Do not replace this handoff with a private key or hosted upload service.
- A selected image may be encoded into canonical RPC preview calldata without a separate confirmation. It is never added to the renderer package.
- Only the creator's browser wallet may authorize and submit deployment. Never request or handle a creator private key, mnemonic, keystore, or wallet password.
- Read [references/deployment.md](references/deployment.md) only after the creator approves the design or when deployment is blocked.

## Fixed product boundaries

- Robinhood testnet (`46630`) is the only public chain supported by this version.
- The browser deploys through the chain's renderer registry so the creator can find the renderer again. The registry is an index, not an approval gate; any compatible same-chain renderer address can still be pasted and used directly.
- A custom renderer replaces the default renderer; it does not change the rest of the Creator Studio or membership economics.
- `nativeMedia` and onchain media are artistic inputs. The renderer may crop, filter, recolor, transform, combine, reinterpret, or ignore them.

## Finish plainly

Before ending a browser-handoff turn, give the creator all of the following in one concise message:

1. A clickable, absolute URL for the public `/render` page. Derive it from the origin that served the hosted skill or `llms.txt`, unless the creator supplied another site URL. Never leave `HOST` or another placeholder in the final message.
2. A clickable attachment or file link for `renderer-package.json`.
3. A clickable attachment or file link for the exact JPEG or PNG used in the design, when one was provided or generated. If the design intentionally uses no image, say so instead.
4. Instructions to open `/render` in their regular browser, upload the JSON package, upload the image when present, inspect the previews, and connect their wallet and choose **Deploy renderer** only when they want to publish it.

Repeat this file handoff even if loopback or an internal browser preview succeeded, so the creator is never stranded without the submission materials. If an image would help and the creator has not supplied one, clearly offer to generate it rather than silently defaulting to generated-only renderer artwork.

When deployed, return the chain and copyable contract address. When not deployed, state the immediate blocker. Do not burden the creator with receipts, proof language, deployment journals, or source-verification records.
