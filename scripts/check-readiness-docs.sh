#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

readiness_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/bbf-readiness.XXXXXX")"
trap 'rm -rf -- "$readiness_tmp_dir"' EXIT

expect_readiness_rejected() {
  local name="$1"
  local source="$2"
  local filter="$3"
  local message="$4"
  local candidate="$readiness_tmp_dir/$name.json"

  jq "$filter" "$source" >"$candidate"
  if "$repo_root/scripts/check-readiness-record.sh" "$candidate" >/dev/null 2>&1; then
    echo "$message" >&2
    exit 1
  fi
}

required_docs=(
  "docs/protocol/integration.md"
  "docs/protocol/accounting.md"
  "docs/runbooks/deployment.md"
  "docs/runbooks/verification.md"
  "docs/runbooks/monitoring.md"
  "docs/runbooks/incident-response.md"
  "docs/runbooks/ownership.md"
  "docs/runbooks/safe.md"
  "docs/runbooks/mainnet-readiness.md"
  "docs/pilots/testnet-pilot.md"
  "docs/release/local-evidence.md"
  "docs/release/testnet-usdg-evidence.md"
)

for document in "${required_docs[@]}"; do
  test -s "$document" || {
    echo "missing required readiness document: $document" >&2
    exit 1
  }
done

test -x scripts/check-testnet-usdg.sh

jq empty contracts/deployments/*.json contracts/deployments/fixtures/*.json

test "$(jq -r '.status' contracts/deployments/robinhood-testnet.json)" = "blocked"
test "$(jq -r '.chainId' contracts/deployments/robinhood-testnet.json)" = "46630"
test "$(jq -r '.paymentToken' contracts/deployments/robinhood-testnet.json)" \
  = "0x7E955252E15c84f5768B83c41a71F9eba181802F"

test "$(jq -r '.status' contracts/deployments/robinhood-mainnet.json)" = "blocked"
test "$(jq -r '.chainId' contracts/deployments/robinhood-mainnet.json)" = "4663"
test "$(jq -r '.paymentToken' contracts/deployments/robinhood-mainnet.json)" \
  = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"

readiness="contracts/deployments/readiness-template.json"
"$repo_root/scripts/check-readiness-record.sh" "$readiness"
test "$(jq -r '.status' "$readiness")" = "blocked"
test "$(jq -r '.signatures | length' "$readiness")" = "0"

jq -e '
  .gates.canonicalToken.status == "PASS" and
  all(
    .gates | to_entries[] | select(.key != "canonicalToken") | .value.status;
    . == "OPEN" or . == "BLOCKED"
  ) and
  ([.gates[] | select(.status == "BLOCKED")] | length > 0)
' "$readiness" >/dev/null

expect_readiness_rejected \
  "incomplete-ready" "$readiness" '.status = "ready"' \
  "an incomplete readiness record was incorrectly accepted as ready"
expect_readiness_rejected \
  "substituted-gate" "$readiness" \
  '.gates.unknownGate = .gates.canonicalToken | del(.gates.canonicalToken)' \
  "a readiness record with a substituted gate key was incorrectly accepted"
expect_readiness_rejected \
  "empty-candidate" "$readiness" '.candidateId = ""' \
  "a readiness record with an empty candidate identity was incorrectly accepted"

invalid_partial_pass_filters=(
  '.gates.canonicalToken.evidence = []'
  'del(.gates.canonicalToken.owner)'
  'del(.gates.canonicalToken.reviewedAtUtc)'
)
for invalid_filter in "${invalid_partial_pass_filters[@]}"; do
  expect_readiness_rejected \
    "partial-pass" "$readiness" "$invalid_filter" \
    "a partial PASS gate without complete evidence was incorrectly accepted: $invalid_filter"
done

valid_ready="contracts/deployments/fixtures/readiness-ready.valid.json"
"$repo_root/scripts/check-readiness-record.sh" "$valid_ready"
invalid_ready_filters=(
  'del(.observedDeployment.deploymentProvenance)'
  '.observedDeployment.deploymentProvenance.factoryDeploymentTransactionHash = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'
  'del(.observedDeployment.webPublicConfig)'
  '.observedDeployment.webPublicConfig.factoryRuntimeCodeHash = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'
  '.observedDeployment.webPublicConfig.usdGImplementationAddress = "0xffffffffffffffffffffffffffffffffffffffff"'
  '.observedDeployment.webPublicConfig.usdGImplementationRuntimeCodeHash = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'
  'del(.observedDeployment.creationCodeHashes)'
  'del(.observedDeployment.runtimeCodeHashes)'
  'del(.observedDeployment.usdG)'
  'del(.observedDeployment.protocolControl)'
  'del(.observedDeployment.multisig)'
  'del(.operations.confirmationPolicy)'
  'del(.operations.publicSupersessionWording)'
  '.signatures[1].role = .signatures[0].role'
  '.chainId = 46630'
)
for invalid_filter in "${invalid_ready_filters[@]}"; do
  expect_readiness_rejected \
    "invalid-ready" "$valid_ready" "$invalid_filter" \
    "an incomplete or inconsistent ready record was incorrectly accepted: $invalid_filter"
done

expect_readiness_rejected \
  "ready-testnet" "$valid_ready" '
    .network = "robinhood-testnet" |
    .chainId = 46630 |
    .observedDeployment.webPublicConfig.chainId = 46630
  ' "a ready testnet record was incorrectly accepted despite the mainnet-only release schema"

if rg -n -i \
  'brand (status|clearance): (cleared|pass)|audit status: (complete|pass)|mainnet status: (deployed|live|pass)|public testnet pilot status: (complete|pass)' \
  README.md docs contracts/README.md; then
  echo "readiness documentation contains a prohibited unsupported claim" >&2
  exit 1
fi

rg -q 'Backed By Fans' README.md docs/brand docs/protocol docs/runbooks
rg -q '0x7E955252E15c84f5768B83c41a71F9eba181802F' \
  docs/release/testnet-usdg-evidence.md
rg -q 'b300467aabfe9ce7a2d59cba7c684d068005f5c414dcd943a42ee5d55bea1e73' \
  docs/release/testnet-usdg-evidence.md scripts/check-testnet-usdg.sh
rg -q '0x7E955252E15c84f5768B83c41a71F9eba181802F' docs/runbooks/deployment.md
rg -q '0x7E955252E15c84f5768B83c41a71F9eba181802F' \
  docs/runbooks/mainnet-readiness.md
rg -q 'supersed' docs/runbooks/verification.md docs/runbooks/incident-response.md

echo "Readiness documentation and blocked manifests are internally consistent."
