# ERC721 airdrop gas benchmark

On 2026-10-08, unmodified GasliteDrop used **9.17% less gas** than
the prepared ERC721Airdrop helper for 200 NFTs sent to distinct new wallets on
a local fork of the actual Robinhood collection. Deployment used
**19.91% less gas**.
These are measured local transaction receipts, not mainnet receipts or live fee quotes.

## Transfers to distinct wallets

All amounts are gas units. Saving is `(prepared - Gaslite) / prepared`.
Approval and creator registry setup are excluded from transfer figures.

| NFTs | GasliteDrop | Prepared safe helper | Gas saved | Saving |
| ---: | ----------: | -------------------: | --------: | -----: |
|    1 |      81,415 |               89,235 |     7,820 |  8.76% |
|   10 |     407,950 |              448,711 |    40,761 |  9.08% |
|   50 |   1,859,554 |            2,046,738 |   187,184 |  9.15% |
|  100 |   3,673,648 |            4,043,894 |   370,246 |  9.16% |
|  200 |   7,297,516 |            8,034,005 |   736,489 |  9.17% |

## What causes the difference

Two controls isolate the safe-transfer path and compiler version:

| Implementation, 200 distinct wallets                                  |       Gas |
| --------------------------------------------------------------------- | --------: |
| Unmodified GasliteDrop, Solidity 0.8.19                               | 7,297,516 |
| Prepared helper, Solidity 0.8.36                                      | 8,034,005 |
| Prepared helper changing only safeTransferFrom to transferFrom        | 7,480,605 |
| GasliteDrop changing only compiler pragma and contract name to 0.8.36 | 7,296,697 |

The safe-transfer path adds **553,400 gas**, or **2,767 per distinct
wallet**, accounting for **75.14% of the total gap** in the
200-NFT case. Both helpers call the same existing collection; the OpenZeppelin
import in our helper is an interface. This is not a comparison between two NFT
implementations. The remaining gap includes our checks, batch event, and Solidity
call/loop overhead together; those components were not separately profiled.

The compiler control saves just 819 gas compared with original Gaslite in
this case. Its source differs only in pragma, contract name, and SPDX comment.
The safe-path control has all the prepared helper's checks and receipt event.
Neither control changes production code. An optimized Gaslite safe-transfer
variant would require a separate measurement; this control does not benchmark it.

## Other recipient patterns

Sending several NFTs to the same initially empty wallet reuses its balance slot
and warms its address within the transaction. The relative safe-transfer cost
is therefore lower than for distinct wallets.

| NFTs | GasliteDrop | Prepared safe helper | Gas saved | Saving |
| ---: | ----------: | -------------------: | --------: | -----: |
|    1 |      81,415 |               89,235 |     7,820 |  8.76% |
|   10 |     210,850 |              229,111 |    18,261 |  7.97% |
|   50 |     786,490 |              851,174 |    64,684 |  7.60% |
|  100 |   1,505,632 |            1,628,378 |   122,746 |  7.54% |
|  200 |   2,939,620 |            3,178,609 |   238,989 |  7.52% |

For an accepting receiver contract, Gaslite never invokes onERC721Received;
the prepared helper invokes it once per NFT. The receiver used here returns the
ERC721 magic value without additional work. Arbitrary receiver code can cost more.

| NFTs | GasliteDrop | Prepared safe helper | Gas saved | Saving |
| ---: | ----------: | -------------------: | --------: | -----: |
|    1 |      81,415 |               90,708 |     9,293 | 10.24% |
|   50 |     786,490 |              924,824 |   138,334 | 14.96% |

## Deployment and approval

| Transaction       | GasliteDrop | Prepared helper |
| ----------------- | ----------: | --------------: |
| Deployment        |     255,190 |         318,641 |
| setApprovalForAll |      48,819 |          48,807 |

Approval differs by 12 gas solely because the deployed addresses have different
zero-byte counts in their calldata. The collection executes the same approval
function. Registry setup was shared and all four helpers were authorized before
measurement; it is not included in these comparison figures.

## Reproducible method and limits

- Collection: 0x11F4eF611DC2689e0fdB1a9A090822Ad5dEd0747, chain 4663.
- Fork origin: block 83,567,955, hash 0x531092e70511a5d9cc7f2af8e155227a36db6d52c25160909e683769eb75261c.
- Execution: separate Anvil at http://127.0.0.1:18559; Cancun EVM; 100 million block gas limit.
- [Gaslite source revision](https://github.com/PopPunkLLC/GasliteDrop/blob/6da9ef9003264e7b48308cdd7081ba442b447563/contracts/src/GasliteDrop.sol):
  `6da9ef9003264e7b48308cdd7081ba442b447563`. Solidity 0.8.19, Paris bytecode target,
  optimizer enabled, 200 runs. No source changes for the primary Gaslite sample.
- Prepared helper revision: `594a39051adb73c0dfa87ed4eb0c4cbbb99b5d13`.
  Solidity 0.8.36, Cancun target, optimizer enabled, 200 runs.
- Gaslite's checked-in artifact did not match its checked-in source hash. The
  source was compiled afresh, and its artifact metadata source hash was checked
  against the downloaded pinned file before execution.
- Existing whitelist, blacklist and authorizer entries were copied into one
  creator-owned list on the local fork, with all four benchmark helpers added.
  All four approvals were granted before the common transfer snapshot.
- The largest holder had 67 NFTs at the pinned block. Another 133 actual NFTs
  were transferred to that holder using local impersonated-wallet transactions.
  The collection's ownership storage was not fabricated. Every assignment was
  verified as owned by the sender before measurement. This inventory setup is
  local benchmark preparation, not evidence the creator holds 200 live NFTs.
- Every sample restored the same snapshot. Each helper received exactly the
  same calldata and token assignments. There were 48 transfer samples across
  four implementations and twelve recipient/count cases.
- Each transaction was independently mined. Gas comes from receipt.gasUsed,
  including transaction intrinsic gas, calldata gas and applicable refunds.
  Successful receipts, exact NFT Transfer events, and every resulting ownerOf
  value were checked. Post-transfer reads are separate calls and do not warm
  the measured transaction. This is a deterministic gas comparison, not a
  wall-clock throughput benchmark.
- EOAs had no code at the fork block. Addresses were generated deterministically
  from the same labels for every implementation. No access lists were supplied.
- Gas units omit L1 data charges or chain-specific fees outside EVM receipt gas.
  These figures do not estimate the exact creator list or future network prices.
  Actual token assignments, recipient balances, smart-wallet code and validator
  state can change costs. Local transactions used a fixed 0.1 gwei gas price.
- No mainnet deployment, registry write, approval or NFT transfer was submitted.
  Production contracts and the page were not changed for this benchmark.

Raw results, the exact local harness, compilation inputs and a CSV are retained
under `artifacts/erc721-airdrop/benchmark/`. The local receipt hashes in the JSON
belong to snapshot trials; they are not public explorer transaction hashes.
The directory is ignored by Git.

To rerun, start a fresh benchmark fork with
`node artifacts/erc721-airdrop/benchmark/start-fork.mjs`, then run
`node artifacts/erc721-airdrop/benchmark/run.cjs`. The start script loads the
existing configured private RPC without printing it. The harness accepts only
the dedicated loopback port 18559 and checks execution chain 4663. Keep the
existing review nodes on ports 18557 and 18558 unchanged. The retained artifacts
preserve the exact compared bytecode; control sources and compiler settings are
also retained. Redirect harness output to run.log to regenerate this report
with report.py.

## Decision

Gaslite is measurably cheaper for this collection. Use it as the base if
minimizing gas is the priority. The receiver check is the main cost difference
for distinct wallets and is a product tradeoff: transferFrom does not ask a
recipient contract to accept the NFT. The existing validator authorization
requirement remains with either helper. Any change to the page's receipt proof
or addition of safe-transfer support should be tested before deployment.
