# Safe creation and configuration runbook

Status: **OPEN — scripts are verified; no Backed By Fans Safe is recorded as
deployed**.

Safe's hosted configuration and transaction services currently include both
[Robinhood Chain mainnet](https://safe-config.safe.global/api/v1/chains/4663/)
and [Robinhood Testnet](https://safe-config.safe.global/api/v1/chains/46630/).
The canonical [Safe v1.5.0 deployment
registry](https://github.com/safe-global/safe-deployments/tree/main/src/assets/v1.5.0)
includes both chain IDs. Recheck those sources before creation instead of
assuming that a contract address alone proves working wallet infrastructure.

The current v1 bootstrap configuration deliberately has one owner and threshold
one. That owner is the encrypted Foundry deployer account. A 1-of-1 Safe is a
smart account, **not a multisig security improvement**: compromise or loss of
that one key still controls or strands the account. It gives Backed By Fans a
standard Safe administration surface and a path to add owners later, but it does
not satisfy the production organizational-control gate by itself.

## Pinned Safe deployment

The creation script uses Safe's canonical released v1.5.0 contracts and rejects
code-hash or version drift before creating anything:

| Component | Address |
| --- | --- |
| `SafeL2` v1.5.0 singleton | `0xEdd160fEBBD92E350D4D398fb636302fccd67C7e` |
| `SafeProxyFactory` v1.5.0 | `0x14F2982D601c9458F93bd70B218933A6f8165e7b` |
| Compatibility fallback handler v1.5.0 | `0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4` |

It calls `createProxyWithNonceL2`, not the legacy factory entrypoint. The
initializer has exactly one owner, threshold one, no setup delegatecall, no
modules, no guard, no payment, and the v1.5.0 compatibility fallback handler.
The script verifies those facts, the proxy singleton, version, and initial nonce.

The salt and initializer are identical on mainnet and testnet, so the Safe must
have the same address on both chains. Chain-specific state and transactions are
still independent; operators must verify the chain before every action.

## Create the testnet Safe

The expected encrypted Foundry account is `backed-by-fans-testnet`, resolving to
`0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027`. That owner is pinned in Solidity;
only the local keystore alias can be overridden. The wrapper pins Robinhood's
official public RPC, rejects an ambient `FOUNDRY_BROADCAST` override, and
verifies the account, RPC chain ID, canonical Safe code, predicted address, and
created account state. It defaults to a dry-run.

```sh
cd contracts
./scripts/create-safe.sh testnet dry-run
./scripts/create-safe.sh testnet broadcast
```

For the pinned owner and configuration, the expected deterministic Safe address
is `0xeAA4B38A99f766117C1D493a21012fec25f70505`. The dry-run must predict that
exact address. Any difference is a stop condition.

Safe's factory is permissionless. If this exact Safe already exists, the script
accepts it only after all pinned singleton, owner, threshold, module, guard,
handler, version, and nonce checks pass; it never treats arbitrary code at the
address as a successful creation.

The broadcast command prompts for the Foundry keystore password. It does not
read a private key or mnemonic from the environment. Record the Safe address and
transaction hash from Foundry's successful output and broadcast artifact.

Directly verify the returned address:

```sh
export SAFE_ADDRESS=0xeAA4B38A99f766117C1D493a21012fec25f70505
export ROBINHOOD_RPC_URL=https://rpc.testnet.chain.robinhood.com

cast call "$SAFE_ADDRESS" "masterCopy()(address)" --rpc-url "$ROBINHOOD_RPC_URL"
cast call "$SAFE_ADDRESS" "VERSION()(string)" --rpc-url "$ROBINHOOD_RPC_URL"
cast call "$SAFE_ADDRESS" "getOwners()(address[])" --rpc-url "$ROBINHOOD_RPC_URL"
cast call "$SAFE_ADDRESS" "getThreshold()(uint256)" --rpc-url "$ROBINHOOD_RPC_URL"
cast call "$SAFE_ADDRESS" "nonce()(uint256)" --rpc-url "$ROBINHOOD_RPC_URL"
```

The expected values are the pinned `SafeL2` singleton, version `1.5.0`, the sole
deployer owner, threshold `1`, and nonce `0`. Also inspect the Safe through the
hosted Safe Wallet on Robinhood Testnet. If the owner key exists only in the
Foundry keystore, it is not automatically available as a browser-wallet signer;
do not copy it into a browser merely to satisfy this runbook. Establish and
rehearse an approved Safe operation path before assigning protocol authority.

## Create the mainnet Safe

Having this script in the repository does not authorize its use. Mainnet
creation remains behind the mainnet readiness and explicit-authorization gates.
It additionally requires the exact confirmation value for both rehearsal and
broadcast:

```sh
cd contracts
export CONFIRM_MAINNET_SAFE_CREATION=4663
ACCOUNT=backed-by-fans ./scripts/create-safe.sh mainnet dry-run
ACCOUNT=backed-by-fans ./scripts/create-safe.sh mainnet broadcast
```

The mainnet predicted address must match the testnet Safe address. A mismatch is
a stop condition: recheck the owner, salt, singleton, handler, factory, and chain
instead of accepting a second address.

## Operational configuration

The public protocol factory binds this deterministic Safe as both initial owner
and fee recipient. These are not shell inputs: keeping them out of constructor
arguments makes the public deployment deterministic and prevents an operator
from accidentally selecting the deployer EOA instead. The protocol contracts
name the Safe, not the EOA, as owner and fee recipient.
Because the deployer is the Safe's sole owner in this bootstrap configuration,
it still indirectly controls both authorities. Moving to a real multisig
requires adding independent owners and raising the threshold.

The protocol does not require Safe, but production protocol ownership, fee
custody, and creator operations should use independently reviewed organizational
controls appropriate to their risk. This document is a checklist, not evidence
that any Safe is configured.

For each proposed Safe, record and verify directly:

- chain and Safe address;
- owner addresses, organizational roles, independence, and recovery plan;
- signature threshold and the rationale for loss/compromise tolerance;
- every enabled module, guard, and fallback handler, including an explicit
  disposition when the list is empty;
- Safe singleton/version, runtime code, nonce, and official deployment source;
- transaction service dependence and a direct-chain signing fallback; and
- which address will be factory owner, fee recipient, or tier owner.

## Rehearsal gate

On a non-public local environment, rehearse receive, propose, independently
review, reject, execute, and recover for each required operation. Include
two-step ownership nomination/acceptance, fee withdrawal, creator withdrawal,
refund preview/top-up, pause/unpause, and cancellation of a mistaken pending
ownership nomination by replacing it with the intended nonzero nominee.

Before production acceptance, an operator other than the proposer must compare
the decoded calldata, target, value, chain ID, nonce, and expected post-state.
Record transaction hashes and direct post-state reads. Do not export seed phrases
or private keys into evidence.
