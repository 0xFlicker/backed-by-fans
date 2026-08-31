# Oversized factory deployment incident

The testnet release from source commit `618cccc1b5b5a69bda7e81e6ec0814105e487dc4`
successfully deployed the media store factory and initial renderer, then the Robinhood Nitro
sequencer rejected the membership-factory submission with JSON-RPC error `-32000: oversized data`.
The exact recovery journal is preserved as `candidate-618cccc-oversized.json`.

Evidence checked at `2026-08-31T03:50:03Z` through the configured chain-46630 RPC:

- media store factory transaction
  `0x04cab2ce6b98186a9a1b0bf8a990632c9a34bdf84ba475799abe02c88f625ead` mined
  successfully at nonce 13;
- renderer transaction
  `0xfc8dccd88baf74834eb746d8a0b9762dc57e2c7416adbc41b7075e511e030cd2` mined
  successfully at nonce 14;
- the locally signed factory hash
  `0x98f24b5d19a5c4419b686282b740a09c708774133693c74e78c86be2544711ce` was absent;
- the operator's latest and pending nonces were both 15, proving the rejected submission did not
  consume a nonce; and
- the deployed media and renderer runtime hashes exactly matched the journal.

Root cause: the old zero-argument `RobinhoodMembershipFactory` wrapper produced 112,035 bytes of
initcode and 112,067 bytes of raw CREATE2 calldata. That passed the local Anvil fork because Anvil
does not model Nitro sequencer admission, but exceeded Nitro's 95,000-byte transaction-data limit.

The corrected release deletes that wrapper and appends the five fixed constructor arguments to the
actual `MembershipFactory` creation bytecode. The resulting raw CREATE2 calldata is 46,026 bytes.
The fixed transaction therefore resumes safely at nonce 15 while retaining the two valid deployed
predecessors.
