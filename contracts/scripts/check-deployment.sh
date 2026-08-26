#!/usr/bin/env bash
set -euo pipefail

manifest_path="${1:-deployments/robinhood-testnet.json}"
rpc_url="${2:-${ROBINHOOD_TESTNET_RPC_URL:-}}"

if [[ -z "${rpc_url}" ]]; then
  echo "deployment check: RPC URL is missing" >&2
  exit 2
fi
if [[ ! -f "${manifest_path}" ]]; then
  echo "deployment check: manifest not found: ${manifest_path}" >&2
  exit 2
fi
IFS=$'\t' read -r \
  manifest_status captured_block manifest_hash renderer factory deployer store_a store_b \
  validation_tier renderer_creation_block factory_creation_block \
  validation_tier_creation_block < <(
    jq -r '[
      .status,
      .capturedBlockNumber,
      .capturedBlockHash,
      .renderer,
      .factory,
      .deployer,
      .creationCodeStoreA,
      .creationCodeStoreB,
      .validationTier,
      .rendererCreationBlockNumber,
      .factoryCreationBlockNumber,
      .validationTierCreationBlockNumber
    ] | @tsv' "${manifest_path}"
  )

if [[ "${manifest_status}" != "deployed" ]]; then
  echo "deployment check: manifest is not deployed; inspect its blocker field" >&2
  exit 2
fi

manifest_hash="$(tr '[:upper:]' '[:lower:]' <<<"${manifest_hash}")"

if ! block_json="$(cast block "${captured_block}" --rpc-url "${rpc_url}" --json)"; then
  echo "deployment check: RPC request failed before contract checks" >&2
  exit 3
fi
observed_hash="$(jq -r '.hash' <<<"${block_json}" | tr '[:upper:]' '[:lower:]')"
if [[ "${observed_hash}" != "${manifest_hash}" ]]; then
  echo "deployment check: captured block hash differs from the selected RPC" >&2
  exit 4
fi

check_creation_block() {
  local address="$1"
  local creation_block="$2"
  local label="$3"
  local previous_block=$((creation_block - 1))
  local code_at_creation
  local code_before_creation

  if ! code_at_creation="$(cast code "${address}" --block "${creation_block}" --rpc-url "${rpc_url}")" \
    || ! code_before_creation="$(cast code "${address}" --block "${previous_block}" --rpc-url "${rpc_url}")"; then
    echo "deployment check: RPC failed while checking ${label} creation block" >&2
    exit 3
  fi
  if [[ "${code_at_creation}" == "0x" || "${code_before_creation}" != "0x" ]]; then
    echo "deployment check: ${label} creation block does not match RPC history" >&2
    exit 4
  fi
}

check_creation_block "${renderer}" "${renderer_creation_block}" "renderer"
check_creation_block "${factory}" "${factory_creation_block}" "factory"
check_creation_block "${deployer}" "${factory_creation_block}" "deployer"
check_creation_block "${store_a}" "${factory_creation_block}" "creation code store A"
check_creation_block "${store_b}" "${factory_creation_block}" "creation code store B"
check_creation_block \
  "${validation_tier}" "${validation_tier_creation_block}" "validation tier"

DEPLOYMENT_MANIFEST_PATH="${manifest_path}" OBSERVED_BLOCK_HASH="${observed_hash}" \
  forge script script/CheckDeployment.s.sol:CheckDeployment \
    --rpc-url "${rpc_url}" \
    --fork-block-number "${captured_block}" \
    --sig "run()"
