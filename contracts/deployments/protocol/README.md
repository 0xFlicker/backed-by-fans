# Protocol deployment evidence

`scripts/deploy-protocol.sh <network> broadcast` creates
`<chain-id>/candidate.json` before the first public transaction. The file is an append-by-state
recovery journal for one exact compiler-artifact fingerprint; it is not a deployment address source.

The journal records, in order, the media-store factory, renderer, and membership factory:

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

Only a complete, dependency-valid, source-verified journal can produce
`broadcast/DeployDirectProtocol.s.sol/<chain-id>/run-latest.json`. Wagmi consumes the promoted
broadcast record, never this candidate file directly.

Binding generation is staged against a copy of every existing Foundry broadcast. Candidate
bindings and the timestamped record are installed before `run-latest.json`; that active pointer is
the final release gate. Mutating testnet and mainnet operations share one repo-wide lock because
both networks write the same generated bindings. Ordinary `bun run generate` acquires that same
lock, and recovery refuses dirty broadcast inputs from every other chain.
