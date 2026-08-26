#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

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
)

for document in "${required_docs[@]}"; do
  test -s "$document" || {
    echo "missing required readiness document: $document" >&2
    exit 1
  }
done

jq empty contracts/deployments/*.json contracts/deployments/fixtures/*.json

test "$(jq -r '.status' contracts/deployments/robinhood-testnet.json)" = "blocked"
test "$(jq -r '.chainId' contracts/deployments/robinhood-testnet.json)" = "46630"
test "$(jq -r 'has("paymentToken")' contracts/deployments/robinhood-testnet.json)" = "false"

test "$(jq -r '.status' contracts/deployments/robinhood-mainnet.json)" = "blocked"
test "$(jq -r '.chainId' contracts/deployments/robinhood-mainnet.json)" = "4663"
test "$(jq -r '.paymentToken' contracts/deployments/robinhood-mainnet.json)" \
  = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"

readiness="contracts/deployments/readiness-template.json"
"$repo_root/scripts/check-readiness-record.sh" "$readiness"
test "$(jq -r '.status' "$readiness")" = "blocked"
test "$(jq -r '.signatures | length' "$readiness")" = "0"

jq -e 'all(.gates[].status; . == "OPEN" or . == "BLOCKED")' "$readiness" >/dev/null

if "$repo_root/scripts/check-readiness-record.sh" \
  <(jq '.status = "ready"' "$readiness") >/dev/null 2>&1; then
  echo "an incomplete readiness record was incorrectly accepted as ready" >&2
  exit 1
fi
if "$repo_root/scripts/check-readiness-record.sh" \
  <(jq '.gates.unknownGate = .gates.canonicalToken | del(.gates.canonicalToken)' "$readiness") \
  >/dev/null 2>&1; then
  echo "a readiness record with a substituted gate key was incorrectly accepted" >&2
  exit 1
fi
if "$repo_root/scripts/check-readiness-record.sh" \
  <(jq '.candidateId = ""' "$readiness") >/dev/null 2>&1; then
  echo "a readiness record with an empty candidate identity was incorrectly accepted" >&2
  exit 1
fi

valid_ready="contracts/deployments/fixtures/readiness-ready.valid.json"
"$repo_root/scripts/check-readiness-record.sh" "$valid_ready"
invalid_ready_filters=(
  'del(.observedDeployment.deploymentProvenance)'
  '.observedDeployment.deploymentProvenance.factoryDeploymentTransactionHash = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'
  'del(.observedDeployment.webPublicConfig)'
  '.observedDeployment.webPublicConfig.factoryRuntimeCodeHash = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'
  'del(.observedDeployment.creationCodeHashes)'
  'del(.observedDeployment.runtimeCodeHashes)'
  'del(.observedDeployment.usdG)'
  'del(.observedDeployment.protocolControl)'
  'del(.observedDeployment.multisig)'
  'del(.operations.confirmationPolicy)'
  'del(.operations.publicSupersessionWording)'
  '.signatures[1].role = .signatures[0].role'
  '.chainId = 4663'
)
for invalid_filter in "${invalid_ready_filters[@]}"; do
  if "$repo_root/scripts/check-readiness-record.sh" \
    <(jq "$invalid_filter" "$valid_ready") >/dev/null 2>&1; then
    echo "an incomplete or inconsistent ready record was incorrectly accepted: $invalid_filter" >&2
    exit 1
  fi
done

if rg -n -i \
  'brand (status|clearance): (cleared|pass)|audit status: (complete|pass)|mainnet status: (deployed|live|pass)|public testnet pilot status: (complete|pass)' \
  README.md docs contracts/README.md; then
  echo "readiness documentation contains a prohibited unsupported claim" >&2
  exit 1
fi

rg -q 'Backed By Fans' README.md docs/brand docs/protocol docs/runbooks
rg -q 'No approved official testnet USDG' docs/runbooks/mainnet-readiness.md
rg -q 'supersed' docs/runbooks/verification.md docs/runbooks/incident-response.md

echo "Readiness documentation and blocked manifests are internally consistent."
