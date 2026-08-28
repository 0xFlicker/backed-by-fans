# Contract dependency lock

The dependency gitlinks are the executable lock. Tags are recorded for human
review and must resolve to the commits below.

| Dependency | Tag | Commit | License |
| --- | --- | --- | --- |
| OpenZeppelin Contracts | `v5.7.0` | `cab19933c33c2ad1d4c7a84864a3601dddfd16f3` | MIT |
| forge-std | `v1.16.2` | `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` | MIT OR Apache-2.0 |

The compiler is Solidity `0.8.36` and the required Foundry release is `v1.7.1`.
Do not update a dependency to a moving branch. Review and record a new exact tag,
commit, and license in the same change that updates its gitlink.

## External deployed-contract provenance

These repositories are not vendored or compiled into Backed By Fans. The Safe
creation script calls their canonical deployed contracts through
project-authored interfaces and pins their released addresses, code hashes,
version, setup behavior, and documented storage slots.

| Dependency | Tag | Commit | License | Use |
| --- | --- | --- | --- | --- |
| [Safe Smart Account](https://github.com/safe-global/safe-smart-account) | `v1.5.0` | `dc437e8fba8b4805d76bcbd1c668c9fd3d1e83be` | LGPL-3.0 | `SafeL2`, proxy factory behavior, setup ABI, and account validation |
| [Safe Deployments](https://github.com/safe-global/safe-deployments) | repository snapshot | `0974182c16c57ca6fe2b9bba8cffb8a7e55fb83c` | MIT | Canonical v1.5.0 addresses and chain availability |

Updating either pinned Safe release or deployment snapshot requires a reviewed
source change with new addresses, code hashes, deterministic Safe address,
tests, and this provenance record. No Safe source is copied into this project.

## Public standards provenance

The project-authored standard interfaces were transcribed from the CC0 public
specifications, with original project comments:

| Standard | Status | Required interface ID |
| --- | --- | --- |
| [ERC-5192](https://eips.ethereum.org/EIPS/eip-5192) | Final | `0xb45a3c0e` |
| [ERC-5643](https://eips.ethereum.org/EIPS/eip-5643) | Stagnant | `0x8c65f84d` |
| [ERC-4906](https://eips.ethereum.org/EIPS/eip-4906) | Final | `0x49064906` |

Tests derive the ERC-5192 and ERC-5643 identifiers from their Solidity
signatures. ERC-4906 specifies a fixed identifier because its interface contains
events rather than functions.
