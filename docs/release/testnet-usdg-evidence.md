# Robinhood testnet USDG evidence

Status: **canonical-token gate evidence only**.

Paxos's official USDG testnet documentation publishes the Robinhood Testnet
USDG proxy as `0x7E955252E15c84f5768B83c41a71F9eba181802F` and the testnet supply-control
address as `0x4549bb98c667aAb626627C118102c28065E8f54C`:

- <https://docs.paxos.com/guides/stablecoin/usdg/testnet>

Robinhood's official connection documentation publishes chain ID `46630` and
the public testnet RPC used for the independent observation:

- <https://docs.robinhood.com/chain/connecting/>

## Live observation

On 2026-08-26 at `2026-08-26T13:56:57Z`, read-only calls through
`https://rpc.testnet.chain.robinhood.com` observed:

- chain ID: `46630`
- observation block: `107733085`
- observation block hash: `0xb300467aabfe9ce7a2d59cba7c684d068005f5c414dcd943a42ee5d55bea1e73`
- token name: `Global Dollar`
- token symbol: `USDG`
- decimals: `6`
- total supply: `11001240000000` base units
- paused: `false`
- proxy runtime code hash: `0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6`
- EIP-1967 implementation: `0xf0863d7a29a55d0c4263c11bfac754312ff078df`
- implementation runtime code hash: `0x72f197ff5ab8dcedf1244113dd91f245af65ae2c3354456d8bbfb6a3939ecd18`
- EIP-1967 admin slot: zero
- EIP-1967 beacon slot: zero

The repository wrapper deterministically rechecks the recorded block hash, then
captures a fresh block/hash and pins the opt-in Foundry fork to that exact current
block. The fork verifies the exact proxy, EIP-1967 implementation, both runtime
hashes, name, symbol, decimals, supply and balance reads, pause state, and complete
renderer/factory instantiation with token, owner, and fee-recipient bindings. Run
the documented command in the deployment runbook to reproduce a current
observation; no manual browser interaction is required. The official public RPC
is not represented as an archival-state provider for the older observation.

Deployment-day readiness must still re-observe the proxy, implementation, authorities,
code hashes, decimals, pause state, and exact block/hash; this evidence is not a
substitute for that later inventory.

This record proves only the canonical public testnet token gate and basic
compatibility reads. It is not a Backed By Fans protocol deployment, public
pilot, source verification, security or accounting review, production rehearsal,
brand clearance, or mainnet authorization.
