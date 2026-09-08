# Integration source inputs

`pons/4663/0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e` retains Pons files retrieved on
2026-09-07 with Blockscout's `inspect_contract_code` from that factory's verified
compilation bundle. Upstream paths start with `contracts/src/v2/`. File contents preserve
the upstream text, with trailing whitespace at end of file normalized to one newline.
Each Pons file retains its MIT SPDX identifier. `manifest.json` records content hashes.
These snapshots are evidence and are not compiled as replacement Pons contracts.

The prior source review recorded Solidity 0.8.35, Cancun, optimizer 200, via IR for
the verified bundle. Complete compiler input, constructor/immutable values and an
independent runtime comparison remain an explicit G1 requirement; a hash of retrieved
source does not establish runtime equivalence. The available GitHub revision
`8b9bf371030279133017b5c1b713823f5889c5d2` differs from the deployed curve, so it is
not used as the identity of these snapshots.

`src/interfaces/external/ILaunchpadV2.sol` is an unchanged copy of the upstream shared
interface. `IPons.sol` derives the narrow integration surface from the retained source.
Solidity generates all integration ABIs. No explorer ABI is copied into web source.

`uniswap/manifest.json` pins the official Universal Router source and its transitive
v4/Permit2 interface, type and command dependencies. Files are unmodified and retain
their respective MIT, GPL or BUSL headers and root license files. Importing a file does
not relicense it under Backed By Fans' MIT license. Only the required source closure is
retained. These source revisions must still be checked against the router/manager
deployed at the fork origin; successful local compilation alone is insufficient.

Sources: [verified Pons bundle](https://robinhoodchain.blockscout.com/address/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?tab=contract),
[Pons repository](https://github.com/ponsdotdev/ponsfamily),
[Universal Router](https://github.com/Uniswap/universal-router).
