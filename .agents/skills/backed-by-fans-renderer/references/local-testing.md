# Local testing and visual approval

Use this workflow while authoring or revising a renderer. It produces local evidence and a portable
package without a public-chain write or production credential.

## 1. Test the contract locally

Start from the bundled `templates/renderer/` Foundry project or an equivalent project that imports
the exact public interface and types described in [interface.md](interface.md). Preserve Solidity
`0.8.36`, Cancun, and the enabled optimizer profile.

From the renderer project root, run:

```sh
forge fmt --check
FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860
forge test -vv
```

Use only disposable Forge/Anvil identities. No production private key, mnemonic, keystore, browser
wallet, deployment password, RPC secret, or paid endpoint is needed.

Focused tests should cover observable renderer behavior:

- the schema, name, engine count/names, and configuration validation;
- deterministic complete SVG and metadata data-URI output for the same input;
- token IDs `1`, `7`, and `42` across active and expired states;
- generated-only output or a clear failure when media is absent;
- valid JPEG/PNG `nativeMedia` changing, informing, or being deliberately ignored by the output;
- production-shaped `MediaConfig` resolving a test onchain store when the renderer uses media;
- invalid or unsupported media failing clearly rather than producing malformed output;
- full-size and thumbnail legibility.

For media behavior, assert what the renderer promises: for example, that the result is visibly
duotoned/cropped, that media influences a seed, that generated-only mode is explicit, or that a
documented ignore policy is deterministic. Do not assert that output bytes, image bytes, dimensions,
palette, encoding, or visual identity exactly match the input. A matching preview and production
result verifies the renderer path for that fixture, not universal byte preservation.

## 2. Build the portable package from the final artifact

From a directory where Bun, Forge, and Cast are available:

```sh
bun .agents/skills/backed-by-fans-renderer/scripts/build-package.ts \
  <renderer-project-root> \
  --output <renderer-project-root>/renderer-package.json
```

If the renderer constructor has arguments, append their complete ABI-encoded bytes with
`--constructor-args 0x...`. Do not package artifact bytecode without its constructor arguments.

The existing [package writer](../scripts/build-package.ts) runs `forge build` and derives the package
from the final Foundry artifact. It embeds the generated ABI and checks:

- Solidity `0.8.36`, Cancun, and enabled optimizer metadata;
- complete final initcode, including constructor arguments;
- runtime bytecode and the project ceilings;
- artifact fingerprint and initcode hash;
- deterministic salt and CREATE2 predicted address;
- complete raw `salt || initcode` size below Robinhood Nitro's `95,000`-byte boundary;
- canonical chain `46630` and the existing canonical CREATE2 deployer;
- six deterministic representative requests.

Do not replace this with a copied shell snippet, an artifact-only size check, explorer scraping, or a
second package format. A permissive Anvil deployment does not model Nitro admission.

The package must not contain a source image, wallet secret, signature, authentication artifact,
paid RPC credential, deployment password, or browser-executable code.

## 3. Render the local gallery

Run the existing [gallery generator](../scripts/render-gallery.ts):

```sh
bun .agents/skills/backed-by-fans-renderer/scripts/render-gallery.ts \
  <renderer-project-root>/renderer-package.json
```

It starts a loopback-only disposable Anvil instance, evaluates the final initcode, installs the
returned runtime at a local address, and writes a six-image HTML gallery. It does not publish a
transaction.

Inspect every case:

| Token | State | Media case |
|---:|---|---|
| 1 | active | generated/no image |
| 1 | expired | browser image slot |
| 7 | active | browser image slot |
| 7 | expired | generated/no image |
| 42 | active | generated/no image |
| 42 | expired | browser image slot |

The local gallery leaves browser image slots empty because source media is never embedded in the
package. Use Forge fixtures to test byte-handling logic and the browser renderer lab to judge real
temporary media through canonical-RPC previews.

Treat the local gallery as iteration evidence. Confirm composition, contrast, clipping, text,
active/expired differentiation, determinism, and thumbnail readability. If any example fails or the
creator rejects the direction, revise the renderer and repeat from contract tests; do not deploy.

## 4. Review canonical-RPC examples in the browser

Use one package and one of two handoffs.

Optional loopback handoff:

```sh
bun .agents/skills/backed-by-fans-renderer/scripts/session-helper.ts \
  --package <renderer-project-root>/renderer-package.json
```

The [session helper](../scripts/session-helper.ts) binds to `127.0.0.1` on a random high port, keeps
bounded state in process memory, and prints a renderer-page URL with a short-lived capability in the
URL fragment. Open that URL and allow local-network access if the browser asks. The helper can
receive results, failures, approval, prepared deployment details, and the final renderer address;
it cannot receive the selected source image or authorize a wallet operation.

File fallback:

- If loopback is blocked, denied, expired, or unavailable, open the public renderer page normally.
- Drag or select the same `renderer-package.json` file. Do not rebuild, upload it to a relay, or add
  an authenticated session.

Both paths must converge on the same browser behavior:

1. The public page validates the package and recomputes hashes, sizes, chain, and predicted address.
2. Preview works without an account, SIWE, OAuth, wallet connection, or backend session.
3. The browser calls the undeployed candidate through the canonical preview harness with `eth_call`;
   deployed addresses are called directly. Both use the generated ABI and canonical RPC.
4. A browser-selected JPEG/PNG remains in memory and is injected as `nativeMedia` only for the
   read-only RPC call. It is neither persisted nor returned through loopback.
5. Every result or failure is displayed. Generated-only output, intentional transformation, or an
   intentional media-ignore policy is valid if clearly represented and accepted by the creator.

The browser/canonical-RPC gallery is the approval surface. Approval binds the exact canonical chain,
candidate, representative request set, and displayed result fingerprints. Any candidate, request,
salt, package, or deployment-input change clears approval and requires another review.

## Evidence boundary

- Forge and the generated local gallery prove local source behavior for the tested artifact.
- Canonical-RPC browser examples prove the displayed read-only results for that candidate and input
  set.
- Creator approval records a visual decision, not an audit, safety certification, permanence claim,
  exact-media proof, or deployment.
- Only the browser-wallet flow in [deployment.md](deployment.md) can publish the renderer.
