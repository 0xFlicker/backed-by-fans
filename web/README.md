# Backed By Fans web

The Backed By Fans web application is a Next.js 16 App Router interface for
creator-owned memberships on Robinhood Chain. Contract reads and writes go
directly to the configured chain; this project has no application database,
required indexer, or correctness-critical API route.

The public name and visual system are still working directions. Do not describe
the brand as cleared until every item in
[`docs/brand/backed-by-fans-launch-readiness.md`](../docs/brand/backed-by-fans-launch-readiness.md)
has evidence and approval.

## Requirements

- Bun `1.3.14`
- A browser wallet exposing EIP-1193, or a public WalletConnect project ID
- Foundry for regenerating contract bindings from public broadcasts

## Public configuration

Copy `.env.example` to `.env.local` for local development. Every supported
variable starts with `NEXT_PUBLIC_`, is intentionally public, and is frozen into
the browser bundle during `next build`. Never place a secret, private RPC
credential, wallet key, or server token in these variables.

`bun run generate` uses Wagmi CLI's Foundry and React plugins to write
`src/contracts.ts`. Public factory addresses come only from successful checked-in
Foundry `run-latest.json` broadcasts. Robinhood testnet and mainnet coexist in
one generated map; missing deployments render an explicit unavailable state.
The application pins canonical USDG independently for both public chains.

Tier trust comes from registration by the generated factory plus verified tier
factory, canonical-token, and interface bindings. The browser does not perform
a redundant runtime-code-hash attestation against the same frontend RPC it is
already using.

## Custom onchain renderers

- `/skill` is the public agent handoff. It serves an editable creator prompt,
  the raw skill and references, a downloadable toolkit, and links to `/render`.
- `/llms.txt` is the root agent index for the hosted renderer materials.
- `/render` is a public, account-free lab for importing a renderer package,
  previewing representative membership states through the canonical Robinhood
  testnet RPC, approving or rejecting what is shown, and preparing a deployment
  for the creator's connected wallet.
- A local image may be selected for preview. It stays in page memory and is sent
  directly to the canonical RPC as call data; the app has no renderer upload,
  bucket, session database, paid-RPC proxy, or hosted compilation service.
- Agents may optionally hand a package to the page through a short-lived
  loopback helper on `127.0.0.1`. If browser policy blocks loopback, the same
  package can be saved locally and selected in the page. Neither path needs
  SIWE, OAuth, an account, a private key export, or a backend token.
- A deployed renderer is reused by pasting its contract address on the same
  chain. Membership details expose that address for direct copying; there is no
  user-renderer registry or catalog.

Renderer deployment is a normal creator-wallet action in the browser. It is
separate from replacing the immutable protocol contracts. A Robinhood testnet
protocol replacement must stop for explicit operator approval, then let the
operator enter the deployment password directly into Cast's interactive prompt
before bindings are regenerated with `bun run generate`.

## Direct creator and protocol operations

- `/create` guides a creator through metadata, immutable economics, mutable
  limits, material risks, acknowledgements, factory deployment, direct renderer
  selection, post-deployment reconciliation, and the share-success state.
- `/chains/[chainId]/tiers/[tierAddress]/manage` verifies factory registration and expected
  interfaces before exposing tier-owner pause, limits, grants, revocation,
  refund, withdrawal, metadata, and two-step ownership controls.
- `/protocol` verifies the configured factory, deployer, renderer, and USDG
  binding before exposing the separate protocol-owner and fixed fee-recipient
  controls.

All writes simulate first and pass the exact simulated request to wagmi's
connected-wallet mutation. Wagmi/viem then owns submission, receipt waiting,
polling, replacement detection, cancellation, and revert status. Application
reconciliation starts only after the library returns a successful receipt: it
decodes causal events from that receipt when needed, refreshes canonical direct
reads, and shows success only when the action-specific postcondition is visible.

The app does not persist transaction intents, rediscover receipts, scan
historical logs, infer same-nonce outcomes, or coordinate writes across tabs.
Creator proceeds, protocol fees, and refunds keep their contract-defined fixed
destinations; the application never offers a redirect field.

## Supporter memberships and account discovery

- `/chains/[chainId]/tiers/[tierAddress]` reads the connected wallet's permanent credential,
  current access, held capacity, referral lock, shares, refund preview, and
  fixed-destination claims at one captured block. The primary action changes
  between joining, active renewal, held-place renewal, and synchronized rejoin.
- Fixed-price tiers support deliberate gifts. Zero-price tiers remain self-only:
  zero contribution adds exactly one period without economics, while a positive
  contribution uses the normal split, permanent shares, and referral lock.
- `/account` scans at most 12 factory entries per request. It stores only a
  resumable cursor and previously verified display results in `localStorage`.
  The cache is optional, erasable, scoped to the exact chain/factory/wallet,
  and never authorizes a write. A tier address can always be opened directly.

Purchases approve only the exact additional USDG amount shown by the preview.
Approval success is not reported as membership success: purchase simulation,
receipt confirmation, and a fresh read must still complete. Claims and refunds
retain their contract-defined destinations; a frozen recipient sees the exact
remaining claim and recovery guidance, never a redirect control.

## Commands

```sh
bun install --frozen-lockfile
bun run generate
bun run generate:check
bun run format
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run build
```

From the repository root, `./scripts/test-web-anvil.sh` adds configured local
evidence against a disposable Anvil chain: verified direct reads, RPC failure,
an exact-approval membership purchase, post-receipt reconciliation, and axe at
each supported viewport. The harness uses unlocked local Anvil accounts only;
it is not deployment or public-network evidence.

## Hosting

For a Vercel project, set **Root Directory** to `web`. This is an external
dashboard setting; its presence in this document does not claim that it has
been applied to any project.

The application does not require a Vercel Function for protocol correctness.
Static pages provide the shell, while wallet and onchain state remain isolated
in client components.

## Fonts and asset status

Instrument Serif is loaded from `@fontsource/instrument-serif`; Geist Sans and
Geist Mono are loaded from the local `geist` package. Browsers make no runtime
font request to Google or another font service. The Backing Stack mark and
fallback creator frame are original working assets under `public/brand`; they
remain provisional until the launch-readiness asset gates are complete.
