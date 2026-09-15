# Guarded testnet release preparation

Implementation commit: `9c0684d`. Prepared operational manifest commit: `d001db2`.
Target: Robinhood testnet, chain 46630. Preparation does not authorize public signing,
broadcast, source promotion, or website cutover.

The prior active candidate was archived byte-for-byte as
`contracts/deployments/protocol/46630/candidate-cda6f6ed7493-promoted.json`.
The prior `run-latest.json` pointer was removed; its timestamped historical receipt remains.

## Prepared deployment

`contracts/config/operational-state/46630.json` contains the replacement addresses:

| Component | Address | Live state at preparation |
| --- | --- | --- |
| Tier implementation | `0x573A8219F28F93b819464d95e46Dd801d19557C2` | Not deployed |
| Membership factory | `0xF6F02F771B0424CA83eC8F582E4187B9741EaC05` | Not deployed |

The four shared components already exist and passed validation. Safe ownership,
payment tokens, and their runtime hashes were preserved. Protocol token remains zero,
matching the existing deferred-launch configuration. Testnet market buybacks require
a valid protocol-token launch, trading dependencies, and testnet routes before activation.
The mainnet/fork route catalog does not supply those testnet dependencies.

## Verification

- `deploy-protocol.sh testnet prepare`: passed against live chain state.
- `deploy-protocol.sh testnet dry-run`: passed on an isolated chain-46630 Anvil fork,
  including raw CREATE2 deployment and validation of both replacement components.
  The first attempt failed because the RPC could not serve historical state; a fresh
  fork retry passed without changing source or relaxing validation.
- Full web suite: 803 tests in 113 files passed.
- Generated contract binding drift check: passed.

No public transaction was submitted. The manual review RPC on 18557 and web server
on 3110 were preserved.

## Remaining release gate

The clean-room gate still requires resolution of the five existing Fizz utility
license headers documented in `contract-security-2026-09-13.md`. They were not
relabeled or excluded. Functional deployment rehearsal does not clear this gate.

After resolving the gate and receiving explicit deployment authorization, use the
existing encrypted Foundry account and `./scripts/deploy-protocol.sh testnet broadcast`
from `contracts/`. The wrapper repeats live validation and fork rehearsal before signing.
Follow `docs/runbooks/deployment.md` for verification, explorer clone recognition,
Safe operator configuration, and separately authorized website cutover.
