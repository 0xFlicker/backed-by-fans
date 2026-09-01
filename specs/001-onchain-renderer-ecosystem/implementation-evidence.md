# Onchain Renderer Ecosystem Implementation Evidence

**Recorded**: 2026-08-31  
**Source checkpoint**: `2771bf819f5985e7912ce87239659279555a8320` plus the working-tree implementation listed by `git status`

## Evidence boundary

This record covers source, local browser, local helper, contract, local Anvil, and read-only
Robinhood testnet validation. It is not evidence of a merge, push, brand clearance, production
readiness, or participant acceptance trial. No new Robinhood testnet transaction and no mainnet
transaction was submitted while collecting this continuation evidence. The generated public
addresses in `web/src/contracts.ts` and the public broadcast/deployment records were not changed by
the local validation run.

## Contract and renderer-template validation

- `FOUNDRY_PROFILE=robinhood forge test --code-size-limit 1000000 --gas-limit 1000000000 -vvv`
  passed 219 tests with zero failures and one explicitly skipped Robinhood fork test. The run
  includes unit, fuzz, invariant, direct-address, preview-harness, native-media, renderer-budget,
  and deployment tests.
- `FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860` and both contract/template
  `forge fmt --check` runs passed.
- `test-clean-room.sh`, `test-create-safe.sh`, `test-testnet-usdg.sh`, and
  `test-deploy-protocol.sh` passed. These are local wrapper tests; they do not authorize or perform
  a public protocol deployment.
- The renderer template passed all 5 Foundry tests. `forge build --sizes` measured
  `CustomRenderer` at 10,409 runtime bytes and 10,435 initcode bytes.
- The authoritative Robinhood renderer-budget test passed the 98,304-byte runtime/initcode limits
  and the project's strict raw `salt || initcode < 95,000` deployment limit. For transparency, a
  separate generic `forge build --sizes --ignore-eip-3860` diagnostic exits nonzero against
  Ethereum's hard-coded 24,576-byte EIP-170 threshold: `MembershipTier` is 24,924 bytes and
  `OnchainMetadataRenderer` is 52,399 bytes. That diagnostic is not the Robinhood Nitro limit and
  is not used as the target-chain gate.

## Web validation

- Renderer package schema drift, generated-binding drift, Prettier, ESLint, TypeScript, the
  production build, and the renderer ecosystem boundary script passed.
- Vitest passed all 312 tests across 53 files.
- The complete Playwright run passed 73 tests with 62 intentional project/suite skips. The focused
  renderer-lab matrix passed 15 tests across desktop Chromium, tablet Chromium, phone Chromium,
  Firefox, and WebKit.
- Existing build warnings were limited to MetaMask's optional React Native async-storage import and
  ox's dynamic dependency warning; neither changed the build result.

## Loopback and fallback evidence

- Eleven Bun tests exercise the package builder and the real `127.0.0.1` high-port HTTP helper,
  including exact-origin CORS, capability checks, expiry, bounded requests, and file fallback.
- The browser matrix exercises the complete loopback-accepted UI handoff with a deterministic fetch
  fixture and separately exercises the real denied/unavailable UI path and file fallback. The URL
  capability fragment is removed immediately after parsing.
- A headless Chromium attempt to contact the real helper was denied by the browser's local-network
  policy before the request reached the helper. Therefore this evidence does not claim a real
  browser-to-helper success under a user-granted Local Network Access permission. That remains a
  manual permission-path check in a user-controlled browser; denial already degrades to file import.

## Local Anvil quickstart

- `scripts/test-web-anvil.sh` passed 30 tests with 30 intentional skips. It deployed the local
  protocol, created and published direct-renderer tiers, exercised renderer address copy/reuse and
  failure sharing, and verified the exact 37,535-byte native-media tier plus active/afterglow
  `tokenURI` responses.
- Anvil used a local development chain and browser-owned test accounts. No production key, encrypted
  operator password, public transaction, public RPC write, or hosted renderer state was used.
- The quickstart explicitly checked that public broadcast records and generated contract bindings
  were unchanged.

## Browser and helper lifetime audit

- Renderer package, candidate, request, result, approval, deployment preparation, and processed
  image data are React/process-memory values. Production renderer-lab code does not write them to
  `localStorage`, `sessionStorage`, IndexedDB, cookies, an API route, or a storage backend.
- The selected JPEG/PNG is processed in the existing browser pipeline. Temporary processing data is
  disposed, and only the bounded renderer-call bytes remain in component state until replacement,
  reload, navigation, or page closure. Those bytes are injected only into the canonical RPC preview
  call for examples with a local-image slot.
- Candidate/request/result mutation fingerprints invalidate prior approval and prepared deployment
  state. Reload coverage proves the gallery and selected image do not survive page lifetime; unit
  coverage asserts no renderer/image storage writes occur.
- The loopback helper stores bounded candidate, result, approval, and deployment coordination data
  only in its process. It rejects source-image/native-media fields at any depth, and clears all
  session values on expiry or explicit close. Preview outputs and failures may be returned to the
  helper, but creator source-image bytes may not.

## Operator-gated testnet deployment and reconciliation

The separate operator gate was satisfied earlier in this implementation workflow. The operator ran
the guarded Robinhood-testnet broadcast interactively and reported completion; no password or key
material was provided to the agent. The promoted deployment record is complete and source-verified
at source commit `d93f0c7f7e4ded670c5941cde990db3c9b0c0060`:

- `OnchainMediaStoreFactory`: `0xe54a9a47B0b261776f28B9509319bD8070358594`
- `OnchainMetadataRenderer`: `0xf0c285eC82D5C3454146d87D7232503f392E021F`
- `RendererPreviewHarness`: `0x35ACe5985a9088699197cd1931fc3083dee229B6`
- `MembershipFactory`: `0x7d4729c5f4ecA2048C9bAd4748aFc804076B79b5`

There are no contract source, direct deployment script, or public-record changes between that
deployment source and the current checkpoint. Current generated bindings contain the same four
testnet addresses, and `bun run generate:check` passed.

A read-only live RPC smoke check returned chain ID `46630`, found runtime code at the factory,
renderer, and preview harness, confirmed matching factory/renderer schemas, and read the canonical
renderer name `BACKED BY FANS / FOUNDING SIX`. A direct canonical-renderer preview returned a
5,509-character SVG. An `eth_call` through the deployed preview harness created the undeployed
renderer template transiently and returned a 1,544-character SVG. No transaction was signed or
submitted by these checks.

No second protocol deployment is required for this implementation. Any future immutable protocol
replacement still requires a new explicit operator approval and direct interactive password entry;
the completed testnet approval does not authorize Robinhood mainnet or a creator renderer write.

## Creator renderer registry checkpoint — 2026-09-01

This checkpoint adds a separate permissionless renderer registry without changing the deployed
membership protocol. No registry transaction was broadcast while collecting this evidence.

- The registry contract, interface, focused tests, testnet-only deployment script, generated ABI,
  Anvil configuration, and web configuration are present. The registry has no owner or membership
  admission authority. `deployAndRegister(bytes)` uses one creator-wallet transaction and returns
  the address actually created.
- The connected creator's valid created renderers are resolved independently and appear before the
  six default Art Studio styles. A broken registry entry cannot hide valid entries. Custom remains
  last and accepts an unregistered same-chain address directly.
- The renderer package, helper, embedded skill, standalone skill, and `/skill` download now use
  package format 2: final initcode plus its byte length, with no salt, predicted address, or CREATE2
  deployment request. The skill warns that the registry is constructor `msg.sender` and requires
  any intended owner to be encoded explicitly.
- The initcode ceiling is 94,656 bytes. A viem regression test serializes the maximum input inside a
  deliberately large signed EIP-1559 envelope and measures 94,909 bytes, preserving 91 bytes under
  the chain's 95,000-byte transaction envelope.
- The complete Foundry suite passed with no failures. The focused registry suite passed 10 tests.
  A real Robinhood-testnet dry-run on chain 46630 validated the schema, page size, and 94,656-byte
  cap, estimated 1,227,504 gas and approximately 0.000024550081227504 ETH, and did not broadcast.
- Vitest passed 308 tests across 54 files. TypeScript, ESLint, Prettier, package-schema drift,
  generated-binding determinism, the production build, and the renderer ecosystem boundary check
  passed. The package-format-2 renderer-lab matrix passed 15 tests across desktop, tablet, phone,
  Firefox, and WebKit.
- The configured local Anvil run passed 30 applicable browser tests with 30 intentional viewport
  skips. It covered creator tier publication, direct renderer reuse, cross-membership sharing,
  wallet operations, and native-media active/afterglow responses. This is local evidence only.
- The standalone skill passed 12 Bun tests with 77 expectations when localhost binding was allowed.
  The sandbox-only run could not bind its loopback helper; that was an execution restriction, not a
  product failure.
- A twelve-lens Solidity audit produced no confirmed exploit. It identified the transaction-envelope
  availability issue above, which was fixed and retested. Remaining observations are trust-boundary
  reminders: registration is not certification, and renderer constructors must not infer creator
  ownership from `msg.sender`.

The operator-gated deployment and its read-only follow-up are recorded below.

## Creator renderer registry deployment — 2026-09-01

The operator deployed the standalone registry to Robinhood Chain Testnet (chain 46630), then ran
wagmi generation. This completed T092 without changing or redeploying the membership protocol.

- Registry: `0x4d421062e1Af4AB12e4f65ba475F169f633d745A`
- Deployment transaction:
  `0x5784cee8e114d4d12e6d951b8dceb686bb144466eece89b8c2e751df95dbe3f3`
- The Foundry broadcast record, returned deployment address, and generated
  `rendererRegistryAddress[46630]` agree.
- The read-only deployment status check found live contract code, the expected renderer schema,
  page-size limit 100, and initcode limit 94,656 bytes.
- Initial creator enumeration returned zero creators, as expected before the first renderer is
  deployed through this registry.
- After generation, TypeScript completed without errors and Vitest passed all 308 tests across 54
  files. The renderer-lab and public-config assertions now cover the deployed generated address.
