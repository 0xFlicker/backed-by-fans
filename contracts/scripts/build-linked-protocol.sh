#!/usr/bin/env bash
set -euo pipefail

# Pure local build: no RPC, signer, externally supplied library address or deployment.
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
readonly library_artifact="src/libraries/VestingLedger.sol:VestingLedger"
readonly create2_deployer="0x4e59b44847b379578588920cA78FbF26c0B4956C"
readonly library_salt_preimage="Backed By Fans vesting ledger v1"
readonly leaf_output="out/vesting-leaf"
readonly leaf_artifact="$leaf_output/VestingLedger.sol/VestingLedger.json"
readonly manifest="$leaf_output/link-manifest.json"

# Reject inherited address overrides; every approved mapping is derived below.
base_config="$(FOUNDRY_PROFILE=robinhood forge config --json)"
jq -e '.libraries == []' <<<"$base_config" >/dev/null \
  || { echo "Linked build rejects externally configured libraries" >&2; exit 1; }

FOUNDRY_PROFILE=robinhood forge build src/libraries/VestingLedger.sol \
  --out "$leaf_output" --cache-path cache/vesting-leaf --force --ignore-eip-3860 >&2
jq -e '.bytecode.linkReferences == {} and .deployedBytecode.linkReferences == {}' \
  "$leaf_artifact" >/dev/null
init_code="$(jq -er '.bytecode.object' "$leaf_artifact")"
runtime_template="$(jq -er '.deployedBytecode.object' "$leaf_artifact")"
[[ "$init_code" =~ ^0x[0-9a-fA-F]+$ && "$runtime_template" =~ ^0x[0-9a-fA-F]+$ ]] \
  || { echo "Invalid leaf bytecode" >&2; exit 1; }
salt="$(cast keccak "$library_salt_preimage")"
init_hash="$(cast keccak "$init_code")"
address="$(cast create2 --deployer "$create2_deployer" --salt "$salt" --init-code-hash "$init_hash")"

# Solidity libraries inject their own address into the first PUSH20 during construction.
# Refuse an unknown compiler format rather than hashing an unpatched template.
runtime="$(python3 - "$runtime_template" "$address" <<'PY'
import sys
code, address = sys.argv[1:]
if not code.startswith('0x73' + '0' * 40):
    raise SystemExit('Unrecognized Solidity library self-address prefix')
if len(address) != 42:
    raise SystemExit('Invalid derived library address')
print('0x73' + address[2:].lower() + code[44:])
PY
)"
runtime_hash="$(cast keccak "$runtime")"
mapping="$library_artifact:$address"
jq -n --arg artifact "$library_artifact" --arg preservedArtifact "$leaf_artifact" \
  --arg deployer "$create2_deployer" --arg salt "$salt" --arg address "$address" \
  --arg initCode "$init_code" --arg initCodeHash "$init_hash" \
  --arg runtimeCode "$runtime" --arg runtimeCodeHash "$runtime_hash" --arg mapping "$mapping" \
  '{schemaVersion: 1, artifact: $artifact, preservedArtifact: $preservedArtifact,
    create2Deployer: $deployer, salt: $salt, address: $address,
    initCode: $initCode, initCodeHash: $initCodeHash,
    runtimeCode: $runtimeCode, runtimeCodeHash: $runtimeCodeHash, mapping: $mapping}' >"$manifest"

# Do not clean/rewrite the independent leaf output while building linked consumers.
FOUNDRY_PROFILE=robinhood forge build --libraries "$mapping" --ignore-eip-3860 >&2
printf '%s\n' "$project_dir/$manifest"
