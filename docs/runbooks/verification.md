# Deployment verification runbook

Status: **local procedure ready; no public deployment verified**.

Use this after the broadcast and manifest capture steps in
[deployment.md](deployment.md). A deployer cannot verify their own work alone.
The verifier starts from a clean checkout, reproduces the pinned build, and uses
a second RPC provider that is operationally independent from the broadcast RPC.

## Required evidence

1. Fetch the manifest's captured block through the second RPC and compare its
   hash exactly.
2. Run `contracts/scripts/check-deployment.sh` against that RPC. It proves the
   network/token, creation blocks, factory/deployer/store/tier bindings, code
   hashes, pristine validation tier, registration, standards, ownership, empty
   proxy slots, compiler settings, and exact verification URL network/address.
3. Reconstruct `type(MembershipTier).creationCode` independently from the two
   immutable code stores, skipping each STOP prefix, then compare length and
   hash with the local artifact and deployer commitments.
4. Confirm verified source pages for renderer, factory, deployer, both stores,
   and the pristine validation tier.
5. Record the verifier, UTC time, clean source commit, RPC provider (never its
   secret URL), command output digest, and disposition in the readiness record.
6. On deployment day, separately record USDG proxy, current implementation and
   authority, proxy and implementation code hashes, decimals, pause state, and
   one observation block/hash. Do not infer these facts solely from a symbol.

```sh
cd contracts
../scripts/check-readiness-docs.sh
./scripts/check-clean-room.sh
forge build --sizes
./scripts/check-deployment.sh deployments/robinhood-testnet.json "$SECOND_RPC_URL"
```

The current testnet manifest is blocked, so the last command must not be run as
if a deployment exists. A transport error is not a contract mismatch. A block,
code, source, ownership, or manifest mismatch invalidates the candidate.

## Post-deployment smoke

Before public promotion, an operator independent of the deployer reconstructs
the launch tier from the audited creation template and constructor inputs,
proves the factory has no tier authority, and performs deliberately low-value
payment/allocation plus claim or refund, creator/protocol withdrawal, and direct
active-status reads through the production web build. Reconcile transaction
receipts, fixed destinations, every custody bucket, and resulting active state.
Record evidence in the readiness manifest. A local mock lifecycle cannot replace
this public-chain smoke.

## Immutable evidence and supersession

Hash and sign the reviewed deployment and readiness JSON files outside the
repository using the approved organizational signing method. Do not put a
private key or signature secret in this repository. Record signer identity,
scheme, signature, digest, and signing time in the immutable evidence bundle.
Validate the populated record before signing:

```sh
./scripts/check-readiness-record.sh contracts/deployments/readiness-candidate.json
```

A `ready` record is rejected unless all eleven gates are `PASS` with nonempty
evidence, an owner, review time, every frozen-artifact digest/build setting, and
at least two complete signatures. The checked-in blocked template is not a
release candidate.

Never edit an accepted deployment manifest to reconcile a mismatch and never
"roll back" chain state. Create a new manifest with a new identifier and an
explicit `supersedes` reference; mark the prior record superseded in an append-
only index. An incident record must explain why. A newer manifest is not valid
until every gate is rerun against the new deployment.
