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
- A checked deployment manifest before setting a factory address

## Public configuration

Copy `.env.example` to `.env.local` for local development. Every supported
variable starts with `NEXT_PUBLIC_`, is intentionally public, and is frozen into
the browser bundle during `next build`. Never place a secret, private RPC
credential, wallet key, or server token in these variables.

The factory and testnet USDG values deliberately have no default. When they are
absent, the app renders a distinct not-deployed or token-unconfirmed state and
never substitutes a fake address. The official mainnet USDG address is checked
in code, but mainnet use remains outside U8.

## Commands

```sh
bun install --frozen-lockfile
bun run format
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run build
```

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
