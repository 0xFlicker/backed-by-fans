# Quickstart: Validate the Onchain Renderer Ecosystem

This guide describes the runnable evidence expected after implementation. It does not authorize a
public deployment. Robinhood-testnet writes require separate explicit approval; mainnet is out of
scope.

> **Required operator gate:** The immutable direct-renderer protocol must be deployed again before
> the completed feature can run on Robinhood testnet. Finish every local and Anvil check first, then
> stop and request explicit operator approval. Only after approval may the operator start the testnet
> broadcast and enter the deployment password interactively. Never ask the operator to paste that
> password into an agent prompt, command argument, generated file, or log. Mainnet is out of scope.

## Prerequisites

- Bun 1.3.14 and the dependencies in `web/package.json`
- Foundry 1.7.1 with Solidity 0.8.36
- A modern browser and browser wallet
- The repository's configured Robinhood RPC for the selected environment
- No private key, mnemonic, keystore password, image bucket, or application database for the local
  validation steps below; the separately approved testnet protocol deployment uses an operator-entered
  password at its interactive gate

## 1. Validate the direct renderer protocol path

```sh
cd contracts
forge fmt --check
FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860
FOUNDRY_PROFILE=robinhood forge test \
  --match-path 'test/{CustomRendererAddress,RendererPreviewHarness,MetadataAndStandards}.t.sol' \
  --code-size-limit 1000000 \
  --gas-limit 1000000000 \
  -vv
```

Expected outcomes:

- A tier can be created with a compatible direct renderer address that has no registry entry.
- The tier exposes the same renderer address.
- No renderer registration or enablement transaction exists in the new tier path.
- An address without code fails tier creation clearly.
- Existing membership economics tests remain unchanged.
- The preview harness returns the candidate's `previewSVG` and `previewTokenURI` output under
  `eth_call`, while an actual transaction to the harness is never part of the product flow.

## 2. Validate the renderer kit locally

The implementation adds the following skill commands:

```sh
bun .agents/skills/backed-by-fans-renderer/scripts/build-package.ts \
  .agents/skills/backed-by-fans-renderer/templates/renderer

bun .agents/skills/backed-by-fans-renderer/scripts/render-gallery.ts \
  .agents/skills/backed-by-fans-renderer/templates/renderer/renderer-package.json
```

Expected outcomes:

- The package uses Solidity 0.8.36, Cancun, and the Robinhood optimizer profile.
- Runtime bytecode, final initcode, raw `salt || initcode` size, initcode hash, and predicted CREATE2
  address are measured from the final artifact.
- The gallery includes token IDs 1, 7, and 42 in active and expired states, with generated and image
  cases where supported.
- No production key is requested. Disposable Foundry/Anvil identities are test-only.

## 3. Start the web app and choose a handoff

Terminal one:

```sh
cd web
bun run dev
```

Terminal two:

```sh
bun .agents/skills/backed-by-fans-renderer/scripts/session-helper.ts \
  --package .agents/skills/backed-by-fans-renderer/templates/renderer/renderer-package.json
```

The helper binds only to `127.0.0.1` on a random high port, keeps all state in process memory, and
prints or opens a public renderer-page URL. The URL fragment contains the exact helper endpoint and
a random, short-lived local capability; the fragment is not sent to the web server and disappears
from the visible URL immediately after the page reads it.

Expected loopback flow:

1. Open the generated public renderer-page URL.
2. Allow local-network access if the browser asks.
3. The page uses the fragment-held capability to load the package from the helper.
4. Preview without connecting a wallet.
5. The helper receives browser-produced preview results but never the selected source image.

Negative checks:

- Reject an expired or missing local capability.
- Reject a different port, path, origin, or session identifier.
- Reject LAN binds, wildcard CORS, or an unapproved web origin.
- Confirm the hosted web process has no renderer API or session database and writes no
  package/image files.

### File fallback

If loopback access is blocked or manual handoff is preferred, have the agent write the package:

```sh
bun .agents/skills/backed-by-fans-renderer/scripts/build-package.ts \
  .agents/skills/backed-by-fans-renderer/templates/renderer \
  --output custom-renderer.renderer.json
```

Open the renderer lab and drop `custom-renderer.renderer.json` onto the import area, or select it
with the file picker. This path requires no local-network access or capability.

Expected outcomes:

- The browser rejects files larger than 1,000,000 bytes and does not upload or persist the package.
- The imported candidate is held in browser memory and cleared with the page/session.
- The browser rejects a malformed or oversized package, a noncanonical chain, or mismatched
  artifact fingerprint, initcode hash, raw payload size, or predicted CREATE2 address.
- The package contains no source image, wallet secret, wallet signature, authentication artifact,
  paid RPC credential, or browser-executable code.
- A valid import reaches the same RPC preview, creator approval, and wallet deployment gates as the
  loopback path.

## 4. Preview without an image bucket

In the browser renderer lab, using either the loopback candidate or an imported package:

1. Load the candidate and representative request set from the helper or imported package.
2. Render the generated-only examples.
3. Choose a local JPEG or PNG.
4. Review token IDs 1, 7, and 42 in active and expired states.
5. Inspect one full-size result and membership-card thumbnails.

Expected outcomes:

- Deployed renderers are called directly; undeployed initcode uses the preview harness.
- The selected image is processed by the existing browser image pipeline.
- Processed image bytes appear only in the canonical RPC request's `nativeMedia` field.
- No extra transmission confirmation appears.
- The source image is never sent to the helper or a platform storage endpoint.
- In loopback mode, the browser and agent receive the same rendered SVG/result. In file mode, the
  creator reviews that result directly in the browser.
- Closing the page removes browser-held source/output/import state; closing the helper also removes
  automatic-session state.
- Reverts, timeouts, empty responses, and oversized RPC responses appear as failed examples.

## 5. Approve and prepare deployment

1. Approve the complete representative result set.
2. Confirm the browser shows the canonical chain, existing CREATE2 deployer, raw payload size,
   estimated cost, and predicted renderer address.
3. Change one source/artifact/configuration field and confirm approval disappears.
4. Rebuild, rerun all required previews, and approve again.

Expected outcomes:

- Approval is bound to exact candidate, request, and result fingerprints.
- The prepared request contains the complete final initcode and selected salt.
- Payloads at or above 95,000 bytes are blocked before wallet simulation.
- An occupied predicted address is blocked.
- In loopback mode, the agent can read the prepared request but cannot trigger a wallet prompt. In
  file mode, the creator sees the prepared request directly in the webpage.

## 6. Verify the wallet boundary

Use Playwright/component coverage for the default gate; do not send a public transaction as part of
ordinary validation.

```sh
cd web
bun run test
bun run typecheck
bun run lint
bun run test:e2e -- renderer-lab.spec.ts
bun run generate:check
```

Expected outcomes:

- No wallet request appears before the creator clicks Deploy.
- After the click, the request returned by wagmi/viem simulation is passed directly to the connected
  wallet action.
- Cancellation, replacement, revert, pending, and receipt behavior come from wagmi/viem.
- No application-local receipt polling, transaction journal, nonce inference, lock, or recovery loop
  exists.
- Product reconciliation starts only from a successful library-supplied receipt and checks code at
  the predicted address.

## 7. Reuse by address

After a separately authorized local or public deployment:

1. Copy the renderer address shown by the deployment result.
2. Paste it into the new membership renderer field.
3. Review the representative images and approve it.
4. Create a local test tier.
5. Open the membership and copy the renderer address from its details.

Expected outcomes:

- No registry lookup, submission, listing, or enablement occurs.
- The address is resolved only on the current environment's canonical chain.
- The membership continues to show the address even if the renderer later fails.
- Pasting the address does not install or execute third-party skill instructions.

## 8. Evidence boundaries

Record evidence separately:

- Foundry/Vitest results are local source and behavior evidence.
- Browser replay proves the loopback or file-import handoff, preview, approval, and wallet gates.
- Anvil/fork checks prove the exact configured payload under the local Robinhood envelope, not Nitro
  public admission.
- A successful public wallet receipt proves only the authorized transaction.
- The renderer address is reported as deployed only after code is visible at the predicted address.
