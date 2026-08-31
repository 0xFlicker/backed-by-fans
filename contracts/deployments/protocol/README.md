# Protocol deployment evidence

`scripts/deploy-protocol.sh <network> broadcast` creates
`<chain-id>/candidate.json` before the first public transaction. The file is an append-by-state
recovery journal for one exact compiler-artifact fingerprint; it is not a deployment address source.

The journal records, in order, the media-store factory, renderer, renderer preview harness, and
membership factory:

- contract/artifact identity;
- CREATE2 salt and initcode hash;
- expected address and runtime hash;
- allowed predecessor state;
- submitted transaction hash before receipt polling;
- mined receipt and observed runtime hash; and
- Blockscout source-verification state.

Schema 4 also records the exact source commit, normalized Foundry profile, Forge/Solidity versions,
payment-token address/runtime, and the committed operational-state path and Git blob. That reviewed
record pins bootstrap addresses/runtime hashes plus current Safe, factory, fee-recipient, and full
renderer-registry state. Governance changes update the committed operational record; they do not
rewrite historical deployment evidence.

A source, compiler, optimizer, metadata, deployer, salt, or expected-address change produces a
different fingerprint. Preserve the old journal and resolve the release explicitly; do not edit it
to make a new build appear resumable.

Failed candidates are renamed with their source commit and failure reason, with an adjacent incident
record containing the chain and nonce evidence. A corrected release always starts a fresh
`candidate.json`; an archived journal is never rewritten to describe different bytecode.

When a newer committed release starts, the wrapper automatically moves a complete promoted journal
to `candidate-<source-commit>-promoted.json` after proving that it matches the active broadcast.
Pending, submitted, failed, incomplete, or mismatched journals are never moved automatically. The
active `run-latest.json` pointer may advance only when its prior contents already have an identical
timestamped history record.

The release wrapper also rejects any `salt || initcode` payload above Robinhood Nitro's 95,000-byte
sequencer transaction-data limit before local preflight or signing. Anvil validates the exact chain
state, order, runtime, gas, and raised EVM code limits, but it does not emulate this sequencer
admission rule.

Only a complete, dependency-valid, source-verified journal can produce
`broadcast/DeployDirectProtocol.s.sol/<chain-id>/run-latest.json`. Wagmi consumes the promoted
broadcast record, never this candidate file directly.

Binding generation is staged against a copy of every existing Foundry broadcast. Candidate
bindings and the timestamped record are installed before `run-latest.json`; that active pointer is
the final release gate. Mutating testnet and mainnet operations share one repo-wide lock because
both networks write the same generated bindings. Ordinary `bun run generate` acquires that same
lock, and recovery refuses dirty broadcast inputs from every other chain.
