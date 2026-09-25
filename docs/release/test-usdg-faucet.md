# TestUSDG faucet and next testnet release

Target: Robinhood Sepolia (Robinhood Chain Testnet), chain 46630.

Replacement pending: the obsolete zero-supply token is `0xdbbD302Fb4c20c1019814343BbA754869D0F6120`. Deploy the replacement below, then regenerate bindings from its new Foundry broadcast record.

`TestUSDG` is a six-decimal ERC-20 named TestUSDG with symbol `bUSD`. The same contract exposes `claim()`, which mints 100 bUSD to the caller once every rolling 24 hours. First claim is immediately available. The caller pays gas in test ETH; the faucet charges no additional fee. The constructor mints 1,000,000,000 bUSD once to the deployment sender (`0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027` in the public deployment script). There is no ongoing privileged mint function or cooldown bypass. Tokens can be transferred and used for membership payments. The limit is per address, not per person. Deployment is restricted to chain 46630 or local chain 31337.

## Deploy

Run from `contracts/`:

```sh
./scripts/deploy-test-usdg.sh dry-run --replace
./scripts/deploy-test-usdg.sh broadcast --replace
./scripts/deploy-test-usdg.sh status
```

Broadcast uses the existing encrypted `backed-by-fans-testnet` account and prompts locally for its password. Do not send passwords through chat. The script verifies the chain, approved sender, source runtime and faucet constants; an existing matching broadcast is reused. `--replace` permits replacement of the obsolete runtime; repeated runs retain the matching new deployment. Timestamped old broadcast records remain historical evidence. Public addresses and ABI are imported through Foundry/Wagmi generation, never handwritten into the website.

After a successful deployment, run `bun run generate` from `web/`. The claim page is `/chains/46630/faucet`; it appears only once a deployed address is present in generated bindings. The testnet notice links to both bUSD and the external test-ETH faucet. An insufficient bUSD balance in the membership flow links to this faucet.

## Register with the new protocol factory

Keep the protocol token zero for the next release. Through the protocol Safe, call the newly released factory in this order:

1. `setMinimumPayment(bUSD, 1000000)` — one bUSD minimum.
2. `setPaymentTokenEnabled(bUSD, true)`.

These are the existing supported-token governance methods. No buyback route, operator, or public-buyback policy is required for the no-protocol-token deployment. Do not modify the pinned legacy token list merely to onboard this additional token; validate the two governance receipts and the factory's listed/enabled state after the release.

## Verification

- Solidity covers metadata, the billion-token initial supply and recipient, zero-recipient rejection, airdrop funding transfers, 100-token claims, the exact 24-hour boundary, independent wallets, transfers not resetting cooldowns, fuzzed callers, and rejection of mainnet deployment.
- UI covers cooldown eligibility, gas requirements, and passing the Wagmi simulation request through to the wallet; success requires a matching receipt event.
- Local rehearsal deployed the faucet and used the retained protocol Safe to enable it. Evidence: `artifacts/test-usdg/local.json` (disposable addresses, not public deployment proof).
- The original zero-supply token was deployed. The replacement broadcast, new protocol release, and Safe token-onboarding calls remain outstanding. After replacement, update any prepared Safe transaction payload to use the new token address.
