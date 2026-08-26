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

The factory deliberately has no default. The application pins the official USDG
proxy independently for testnet and mainnet and rejects any supplied token that
differs from the selected chain's pin. Both networks also require the factory,
renderer, deployer, and USDG runtime-code hashes from an independently checked
signed deployment record, including the USDG EIP-1967 implementation address
and runtime-code hash. The browser verifies the proxy slot, implementation
bytecode, contract hashes, and RPC chain ID at the same captured block before
exposing writes. Missing commitments render a distinct unavailable state; they
never fall back to same-shaped contract interfaces. Mainnet authorization and
promotion remain outside the web implementation units.

Individual tier runtime hashes vary because constructor values are immutable
in bytecode. Tier trust therefore comes from registration by the exact checked
factory, the exact checked bound deployer, and verified tier factory/token and
interface bindings—not from reusing one validation-tier hash for every tier.

## Direct creator and protocol operations

- `/create` guides a creator through metadata, immutable economics, mutable
  limits, material risks, acknowledgements, factory deployment, registry
  reconciliation, and the share-success state.
- `/tiers/[tierAddress]/manage` verifies factory registration and expected
  interfaces before exposing tier-owner pause, limits, grants, revocation,
  refund, withdrawal, metadata, and two-step ownership controls.
- `/protocol` verifies the configured factory, deployer, renderer, and USDG
  binding before exposing the separate protocol-owner and fixed fee-recipient
  controls.

All writes simulate first, durably record their exact intent before opening the
wallet, use the connected wallet for signatures, wait for a receipt, and prove
the action-specific event and direct-state postconditions that remain valid
after later onchain changes. The browser record is serialized in `localStorage`
and guarded by the Web Locks API so tabs cannot overwrite one another's
in-flight action. Missing, unreadable, or unavailable recovery storage blocks
signing rather than allowing an uncertain duplicate.

After any submitted transaction becomes uncertain, resubmission stays disabled
and the interface offers only an onchain outcome recheck, including after a
full reload. Original and replacement hashes are retained together; a confirmed
same-nonce replacement that did not apply the exact protected intent becomes a
definitive cancellation. An uncertain tier deployment checks the complete
reviewed launch terms against the append-only factory registry before another
deployment can be prepared. Creator proceeds, protocol fees, and refunds keep
their contract-defined fixed destinations; the application never offers a
redirect field.

## Supporter memberships and account discovery

- `/tiers/[tierAddress]` reads the connected wallet's permanent credential,
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
