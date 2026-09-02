# Phase 1 Quickstart: Public Testnet Beta

This guide is for implementing and validating the feature. It deliberately stops before public
testnet broadcast and production-domain promotion unless the operator explicitly authorizes each.

## 1. Establish the baseline

```bash
cd /Users/user/Development/backed-by-fans
git status --short

cd contracts
forge build
forge test

cd ../web
bun run generate:check
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
```

Record existing failures separately from feature regressions. Never format `contracts/lib/**` or the
deployment-identity source files ignored by `foundry.toml`.

## 2. Implement protocol behavior first

Follow [accepted-payment-tokens.md](./contracts/accepted-payment-tokens.md):

1. extend the factory interface, tier configuration, events, and errors;
2. seed and enumerate token status;
3. validate the selected token before tier publication consumes state;
4. keep the tier's immutable token and raw accounting;
5. make protocol-fee withdrawal token-specific;
6. follow [mutable-tier-renderer.md](./contracts/mutable-tier-renderer.md) to replace the immutable
   renderer pointer with owner-only validated replacement and metadata refresh;
7. update unit, adversarial, fuzz, invariant, and lifecycle tests.

Focused checks while iterating:

```bash
cd /Users/user/Development/backed-by-fans/contracts
forge test --match-path 'test/FactoryAndFees.t.sol'
forge test --match-path 'test/PaymentsAndTime.t.sol'
forge test --match-path 'test/ClaimsAndWithdrawals.t.sol'
forge test --match-path 'test/CustomRendererAddress.t.sol'
forge test --match-path 'test/MetadataAndStandards.t.sol'
forge test --match-path 'test/invariants/*.t.sol'
forge test --match-path 'test/e2e/*.t.sol'
```

Then run the full contract suite and deployment-script fixture tests.

## 3. Implement one token amount/read layer

Follow [scaled-token-amounts.md](./contracts/scaled-token-amounts.md). Create one shared module and
table-driven tests before changing screens. Required fixtures include:

- an unscaled six-decimal ERC-20 test double modeled after testnet USDG presentation;
- scaled 18-decimal token at `1e18`, below `1e18`, and above `1e18`;
- scheduled multiplier before and after effectiveness;
- conversion values that round down, round up, carry, and round to zero;
- the three clarified product-display examples;
- metadata, ERC-165, current multiplier, and pending multiplier read errors.

The test must assert that raw values used in simulated wallet calls never come from rounded display
text.

## 4. Replace payment assumptions by journey

Update and test in this order:

1. deployment/config/authenticity read model;
2. creator token selection, price parsing, review, and publication;
3. supporter join/renew/prepay/gift/contribution;
4. account discovery and claims;
5. creator management, refunds, and proceeds;
6. protocol fee balances and withdrawals;
7. owner-only tier renderer preview and replacement in creator management;
8. common wallet readiness, catalog, and transaction messages;
9. faucet and explicit testnet copy.

Search for leftovers:

```bash
cd /Users/user/Development/backed-by-fans
rg -n 'USDG|priceUsd|formatUnits\([^,]+, 6\)|parseUnits\([^,]+, 6\)' web/src
```

Remaining `USDG` references must be either token-specific test fixtures, the confirmed external
testnet/mainnet USDG configuration, or copy that names the selected USDG token intentionally—not a
global assumption or an internally deployed testnet substitute.

## 5. Freeze the testnet launch manifest

Immediately before deployment rehearsal:

1. start from the confirmed chain `46630` launch addresses below;
2. query each address for code, metadata, ERC-165, current multiplier, pending
   multiplier, and effective time;
3. require the ordered testnet deployment manifest to match exactly:
   - USDG: `0x7E955252E15c84f5768B83c41a71F9eba181802F`
   - AMD: `0x71178BAc73cBeb415514eB542a8995b82669778d`
   - NFLX: `0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93`
   - PLTR: `0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0`
   - AMZN: `0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02`
   - TSLA: `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`
4. assert the workflow deploys no internal USDG token;
5. assert the mainnet manifest still contains canonical USDG only.

Do not add every token in the wallet, and do not infer an address from a similarly named mainnet
asset.

## 6. Rehearse deployment locally

Use the existing deployment workflow and its test fixtures:

```bash
cd /Users/user/Development/backed-by-fans/contracts
forge build
forge test --match-path 'test/deployment/*.t.sol'
./scripts/test-deploy-protocol.sh
./scripts/deploy-protocol.sh testnet dry-run
```

The dry-run must show the complete six-token manifest, new factory identity, ownership, fee recipient,
source/operational-state identity, mutable-renderer ABI/runtime identity, and Nitro byte/gas checks.
If the deployment workflow requires reviewed committed source, stop and ask the user to commit; do not
create a commit implicitly.

## STOP: operator testnet deployment required

At this point, stop and tell the operator:

- why a new testnet protocol deployment is required;
- every intended contract/token status write;
- the exact reviewed command to run;
- that the command will request the encrypted Foundry account password;
- that Wagmi generation is required after verified promotion;
- that no mainnet transaction will be sent.

Do not run broadcast from agent automation without explicit authorization.

## 7. Resume after the operator deploys

After the operator reports deployment complete:

```bash
cd /Users/user/Development/backed-by-fans/contracts
./scripts/deploy-protocol.sh testnet resume-verify

cd ../web
bun run generate
git diff -- src/contracts.ts
bun run generate:check
```

Use the actual supported promotion/resume mode if its name changes during implementation; do not
invent a second receipt-polling loop. Verify chain state and generated addresses before continuing.

Then rerun full contract and web checks plus Playwright against local/fork-backed protocol state.

## 8. Prepare the staged public web release

Configure a Vercel project rooted at `/Users/user/Development/backed-by-fans/web`, with production
domain auto-assignment disabled for the staged production build. Set reviewed production environment
values, including `NEXT_PUBLIC_SITE_URL=https://backedbyfans.xyz` and the Robinhood Chain testnet
configuration.

Stop and obtain explicit operator authorization before using authenticated Vercel credentials to
create the staged deployment. Configuration review alone does not authorize deployment.

Build/deploy a staging artifact, then exercise every route listed in
[beta-release.md](./contracts/beta-release.md). Record:

- staged deployment URL/ID and source commit;
- active testnet factory and accepted-token reads;
- route/browser evidence;
- prior known-good production deployment URL/ID;
- unresolved external dependencies such as faucet or RPC availability.

Use a fresh wallet to follow the official faucet path and complete a purchase. Separately create,
join, and renew a tier with each of AMD, NFLX, PLTR, AMZN, and TSLA on live testnet. These are staged
testnet browser results, not local fixture evidence.

## STOP: canonical-domain promotion approval required

Do not assign or promote `backedbyfans.xyz` until the operator explicitly approves the tested staged
artifact and DNS/domain configuration.

After approval, promote the exact artifact without rebuilding, run the named creator, supporter,
account, renderer, `/skill`, faucet, token-selection, and direct-link canonical-domain journeys, and
verify the rollback command/status path. This is production web evidence, not approval for mainnet.

## Safe/CLI token administration

The public website has no operator administration interface. Use the reviewed contract script to:

1. inspect the accepted-token list and token-specific factory fee balances;
2. preflight code, ERC-20 metadata, and claimed ERC-8056 state before preparing enablement;
3. generate destination/calldata/value for Safe submission or use the explicitly authorized deployer
   send mode;
4. enable or disable one token idempotently;
5. withdraw one token's protocol fees independently.

Every public write still requires explicit authorization. Do not discover tokens from browser wallet
holdings or silently add them to protocol policy.

## Completion evidence

Keep these evidence classes distinct in the handoff:

- source review and generated diff;
- local Foundry/Vitest/Playwright/build results;
- testnet deployment receipts and direct reads;
- staged-host browser results;
- canonical-domain browser results;
- mainnet manifest inspection only.

The feature is not complete merely because local tests pass, and the public beta does not authorize a
mainnet deployment.
