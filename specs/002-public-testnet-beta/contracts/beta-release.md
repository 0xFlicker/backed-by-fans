# Contract: Public Testnet Beta Release

## Chain profiles

### Robinhood Chain testnet (`46630`)

- Active public protocol version: the new multi-token factory deployment.
- Initial accepted tokens:
  - USDG: `0x7E955252E15c84f5768B83c41a71F9eba181802F`
  - AMD: `0x71178BAc73cBeb415514eB542a8995b82669778d`
  - NFLX: `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93`
  - PLTR: `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0`
  - AMZN: `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02`
  - TSLA: `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`
- No Backed By Fans test USDG contract is deployed or substituted.
- Canonical site: `https://backedbyfans.xyz`.
- Faucet: `https://faucet.testnet.chain.robinhood.com/`.
- User transactions and operator deployment are permitted only after their existing wallet/operator
  authorization gates.

### Robinhood Chain mainnet (`4663`)

- Initial accepted-token manifest: canonical USDG only.
- Stock Token entries: zero.
- This feature permits inspection and tests only; it authorizes no mainnet broadcast, enablement,
  web chain switch, or production transaction.

## Testnet manifest freeze

Before generating the final broadcast payload, record for each launch token:

- chain ID and checksum address;
- deployed code presence/hash;
- factory-manifest order;
- ERC-20 name, symbol, and decimals;
- ERC-165/8056 capability result;
- current/pending multiplier reads for Stock Tokens;
- canonical source or fresh faucet transaction used to identify the address.

Any mismatch stops before the operator gate. The script must not discover and add wallet-held tokens
implicitly.

## Operator checkpoint

The deployment tool may build, test, fork-rehearse, estimate, and print the candidate without
authorization. It must stop before public writes and show:

1. chain ID and RPC target;
2. source commit and operational-state hash;
3. every contract to deploy and expected address;
4. all six confirmed initially enabled token addresses in order;
5. ownership and fee-recipient addresses;
6. transaction count and expected signer;
7. Nitro bytecode/gas preflight result;
8. exact command the operator will run for broadcast.

Broadcast requires the established interactive encrypted Foundry account/password flow. The operator
must be told that deployment is immutable and creates a new active protocol version.

## Post-deployment sequence

After explicit approval and successful broadcast:

1. wait through the established receipt/confirmation path;
2. verify runtime code and every constructor/registry dependency by direct chain reads;
3. verify all six token statuses and the USDG-only mainnet profile;
4. promote the verified candidate deployment record to active testnet state;
5. archive or supersede the previous candidate according to the existing journal workflow;
6. run `bun run generate` in `web` and inspect the generated contract/address diff;
7. run `bun run generate:check` before web release;
8. do not promote the web while it references the pre-beta factory.

## Web artifact contract

The Vercel project uses `web` as its root. Public configuration must include:

- `NEXT_PUBLIC_SITE_URL=https://backedbyfans.xyz`;
- Robinhood Chain testnet RPC configuration;
- WalletConnect project configuration;
- generated active testnet contract records from the approved deployment.

Secret RPC credentials must not be embedded in browser-visible values unless the selected provider
explicitly treats that URL/key as public and domain-restricted.

## Promotion gate

Before assigning the canonical domain, verify the exact staged artifact for:

- home and membership discovery;
- creator flow with external testnet USDG and each faucet Stock Token;
- supporter join/renew and funding guidance, including a complete join-and-renew for each Stock Token;
- account and creator management;
- tier-owner renderer preview and replacement, including metadata refresh for an existing credential;
- accepted-token reads, with Safe/CLI administration evidenced separately from the public website;
- `/render` preview/deployment;
- `/skill` content and agent handoff;
- direct shared membership/referral/renderer links;
- wrong-network, insufficient-gas, insufficient-token, RPC-error, and disabled-token states;
- mobile/desktop layout, keyboard use, and automated accessibility checks;
- explicit testnet/test-assets language.

Promotion to `backedbyfans.xyz` is a separate explicit operator-approved action. The production smoke
test is evidence about the canonical domain only after promotion.

## Rollback contract

- Record the prior known-good Vercel deployment URL/ID before promotion.
- A web regression may be recovered with Vercel's routing-layer rollback/promote operation.
- Verify the restored domain and relevant routes after rollback.
- Never describe web rollback as reverting tiers, payments, renderer contracts, or any other onchain
  state.

## Monitoring scopes

| Scope         | Examples                                                  | Operator response boundary                                                     |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Website       | build/runtime error, broken route, bad asset              | roll back or fix web artifact                                                  |
| RPC           | unavailable/rate-limited reads                            | identify provider/chain read impact; no token substitution                     |
| Payment token | paused/reverting token, metadata/multiplier failure       | identify affected token and tiers; other tokens remain separate                |
| Renderer      | current/candidate renderer reverts or has unusable output | identify presentation impact; do not imply payment or membership-state failure |
| Protocol      | factory/tier write revert, wrong active address           | stop affected writes and verify chain/version configuration                    |

Status communication names the affected chain, protocol version, token when applicable, and whether
the issue affects display, new publication, or existing payment operations.
