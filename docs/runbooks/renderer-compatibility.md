# Onchain Renderer Compatibility and Budget Runbook

This runbook records local engineering evidence for the replacement onchain renderer. It is not a public-testnet or marketplace certification. Public candidate promotion still requires the explicit operator-password gate, pinned RPC checks, official Robinhood Blockscout display, and independent consumer checks.

## Network envelope

The Robinhood profile and local Anvil gate use:

- maximum runtime code: 98,304 bytes;
- maximum initcode: 196,608 bytes;
- maximum Nitro sequencer transaction data: 95,000 bytes;
- renderer project ceilings: 88,000-byte runtime and 176,000-byte initcode;
- local block and call gas: 100,000,000;
- low-level `ImmutableCodeStore` payload: 98,303 bytes, reserving one byte for the non-executable `STOP` prefix;
- creator-facing renderable media: at most 90 KiB.

Start local Anvil with both Robinhood-specific controls:

```sh
anvil --chain-id 31337 --code-size-limit 98304 --gas-limit 100000000
```

That chain-31337 node remains useful for the product lifecycle and visual gallery. It is not the
release preflight. The public deployment wrapper starts a fork with the target Robinhood chain ID
itself (`46630` for testnet), the same code-size and gas controls, and the target state for the Safe,
six launch tokens, and canonical CREATE2 deployer.

Use `FOUNDRY_PROFILE=robinhood` for build, script, and deployment commands. Foundry 1.7.1's in-process test VM cannot configure Robinhood's raised EIP-3860 initcode limit. `forge build` has an `--ignore-eip-3860` flag, but `forge test` does not. Large-media creation transactions must therefore be proven against the configured Anvil or Robinhood fork. Test-only `--code-size-limit` and aggregate gas overrides may be used to deploy test harnesses; explicit production artifact and per-call assertions remain authoritative.

## Measured renderer matrix

Measured on 2026-08-30 from the real registry/tier/renderer implementation, with optimizer runs 200 and Solidity 0.8.36. Native-media render cases use exact immutable-store runtime bytes. Gas is the isolated renderer or public `MembershipTier.tokenURI` call, not an estimate inferred from output size.

The size ladder uses STACK. The 90 KiB maximum is then exercised independently across all six engines so the product cap is based on the real worst case.

|        Media | Raw SVG bytes | Public `tokenURI` bytes | RPC hex bytes |   SVG gas | Public `tokenURI` gas |
| -----------: | ------------: | ----------------------: | ------------: | --------: | --------------------: |
|         None |             — |                  10,569 |        21,140 |         — |             1,366,556 |
| 24 KiB STACK |        38,649 |                  69,269 |       138,540 | 2,272,424 |             9,299,698 |
| 64 KiB STACK |        93,265 |                 166,369 |       332,740 | 5,781,420 |            24,840,780 |
| 80 KiB STACK |       115,099 |                 205,185 |       410,372 | 7,311,822 |            31,894,178 |

| 90 KiB engine | Raw SVG bytes | Public `tokenURI` bytes | RPC hex bytes |   SVG gas | Public `tokenURI` gas |
| ------------- | ------------: | ----------------------: | ------------: | --------: | --------------------: |
| STACK         |       128,757 |                 229,461 |       458,924 | 8,306,392 |            36,551,491 |
| CHORUS        |       130,285 |                 232,185 |       464,372 | 8,483,801 |            37,234,503 |
| LOOM          |       131,935 |                 235,113 |       470,228 | 8,677,914 |            37,947,474 |
| BLOOM         |       130,122 |                 231,889 |       463,780 | 8,362,310 |            37,007,953 |
| MARQUEE       |       128,206 |                 228,489 |       456,980 | 8,168,893 |            36,240,721 |
| AFTERIMAGE    |       128,235 |                 228,541 |       457,084 | 8,275,137 |            36,404,708 |

The final six-engine `OnchainMetadataRenderer` artifact is 52,919-byte runtime and 52,947-byte
initcode. The reviewed `MembershipFactory` payload appends its five fixed constructor arguments to
45,834 bytes of base creation code, producing 45,994 bytes of initcode and 46,026 bytes of raw
CREATE2 transaction data. Both components remain below the applicable project, Robinhood EVM, and
Nitro sequencer ceilings.

## Release deployment compatibility

The renderer initcode exceeds Ethereum's 49,152-byte EIP-3860 limit. Foundry 1.7.1 applies that
Ethereum limit in its in-process script broadcaster even when the target Robinhood node permits the
larger reviewed envelope. Public release deployment therefore must not use
`forge script --broadcast` for this graph. The raw wrapper also enforces Nitro's independent
95,000-byte transaction-data admission limit, which an Anvil fork does not emulate.

Run the exact release preflight instead:

```sh
cd contracts
./scripts/deploy-protocol.sh testnet dry-run
```

The wrapper builds with `FOUNDRY_PROFILE=robinhood` and `--ignore-eip-3860`, recomputes the exact
salt/initcode/runtime tuple for media factory, renderer, preview harness, and membership factory,
and proves it against the Solidity release constants and creation bytecode. It then starts a
chain-46630 Anvil fork and submits the canonical deployer's raw `salt || initcode` calldata from an
impersonated approved deployer. This exercises the actual four-contract order and raised initcode
envelope without a public write or
keystore password.

An authorized public run repeats that preflight, then uses the encrypted Foundry account through
Cast's terminal password prompt. The release is not promoted until every runtime hash and factory
dependency getter passes and Blockscout verifies all four sources. A partial sequence remains only
in `deployments/protocol/46630/candidate.json`; it cannot enable Wagmi addresses.

The recovery order is fixed:

| Component                  | Allowed predecessor                       |
| -------------------------- | ----------------------------------------- |
| `OnchainMediaStoreFactory` | no candidate code                         |
| `OnchainMetadataRenderer`  | exact media factory runtime               |
| `RendererPreviewHarness`   | exact media factory and renderer runtimes |
| `MembershipFactory`        | exact preview-harness prefix              |

Any non-prefix state, bytecode mismatch, or final immutable/dependency mismatch is a release stop.

The enforced response ceilings are 600,000 bytes for `tokenURI` and 1,200,002 bytes for its
JSON-RPC hex representation. LOOM is the worst measured 90 KiB case and preserves about 62.1%
call-gas headroom against the 100M local ceiling. If a later renderer exceeds either response
ceiling or loses acceptable call headroom, do not enable it. Lower `MAX_RENDERABLE_MEDIA_BYTES`
only as a coordinated protocol, renderer, Studio, tests and documentation change.

## Renderer compatibility

Creators may publish or later select any direct renderer contract implementing the fixed
`BackedByFans.MembershipRenderer.v1` schema. A renderer exposes its name, bounded `uint16` engine
count and engine names, configuration validation, SVG preview, token-URI preview, and the production
`renderTokenURI` entry point. There is no platform renderer registry gate.

Before tier publication or owner-authorized replacement, the protocol checks code presence, schema,
and the renderer's acceptance of the tier's current art/media configuration. A successful
replacement stores the new address and emits ERC-4906 metadata refresh for existing credentials.
It does not change art/media inputs or membership/economic state. The old renderer remains active if
validation or the write fails.

The compatibility checks prove mechanical interface behavior, not aesthetic quality. The creator
previews the actual result and decides whether to use it. Renderer authors should still exercise the
full local visual, gas, and response-size suite before sharing an address.

## Storage deployment evidence

On Robinhood-sized Anvil:

| Operation                |                           Payload/runtime |                     Gas | Result                                        |
| ------------------------ | ----------------------------------------: | ----------------------: | --------------------------------------------- |
| Creator registry `store` |      90 KiB payload / 92,161-byte runtime |              20,504,434 | Passed; event omitted payload bytes           |
| Direct low-level store   | 98,303-byte payload / 98,304-byte runtime |              21,409,386 | Passed at the exact boundary                  |
| Direct low-level store   |                       98,304-byte payload | 3,966,160 before revert | Rejected by `PayloadTooLarge(98_304, 98_303)` |

The configured node's 100M block gas leaves substantial room for the largest allowed storage transaction. Duplicate creator uploads reuse the content-addressed address and do not append another registry record.

## Required commands

```sh
cd contracts
forge fmt --check
FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860
FOUNDRY_PROFILE=robinhood forge test \
  --match-path test/RendererBudget.t.sol \
  --code-size-limit 1000000 \
  --gas-limit 1000000000 \
  -vv
```

The one-billion test gas ceiling is only for a harness transaction that executes SVG preview and
public `tokenURI` calls sequentially. Each measured production call is independently asserted
below 100M gas.

## Visual and consumer gate

For each enabled renderer and engine, generate token IDs 1, 7, and 42 in active and afterglow
states for generated-only and onchain-image compositions, then inspect:

- 320-pixel marketplace thumbnail;
- full canonical SVG;
- creator-Studio preview; and
- the public `MembershipTier.tokenURI` image decoded by an independent consumer.

Reject generic theme swaps, illegible thumbnail hierarchy, empty media apertures in generated-only
mode, broken afterglow, media that is referenced instead of embedded, and any metadata containing
`animation_url` or a remote media dependency. The final public candidate must additionally render
through the official Robinhood Blockscout NFT/media surface and the pinned consumer matrix before
its broadcast record or generated bindings become canonical. JPEG and PNG embedding both require
automated coverage even though one representative onchain image is sufficient for the 72-cell
visual matrix.
