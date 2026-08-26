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
  validation_tier_creation_block factory_deployment_tx validation_tier_creation_tx \
  factory_deployment_input_hash validation_tier_creation_input_hash validation_tier_owner < <(
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
      .validationTierCreationBlockNumber,
      .factoryDeploymentTransactionHash,
      .validationTierCreationTransactionHash,
      .factoryDeploymentInputHash,
      .validationTierCreationInputHash,
      .validationTierOwner
    ] | @tsv' "${manifest_path}"
  )

if [[ "${manifest_status}" != "deployed" ]]; then
  echo "deployment check: manifest is not deployed; inspect its blocker field" >&2
  exit 2
fi

manifest_hash="$(tr '[:upper:]' '[:lower:]' <<<"${manifest_hash}")"
factory_deployment_tx="$(tr '[:upper:]' '[:lower:]' <<<"${factory_deployment_tx}")"
validation_tier_creation_tx="$(tr '[:upper:]' '[:lower:]' <<<"${validation_tier_creation_tx}")"
factory_deployment_input_hash="$(tr '[:upper:]' '[:lower:]' <<<"${factory_deployment_input_hash}")"
validation_tier_creation_input_hash="$(tr '[:upper:]' '[:lower:]' <<<"${validation_tier_creation_input_hash}")"

to_decimal() {
  local value="$1"
  if [[ "${value}" == 0x* ]]; then
    cast to-dec "${value}"
  else
    printf '%s\n' "${value}"
  fi
}

check_transaction_provenance() {
  local transaction_hash="$1"
  local expected_block="$2"
  local expected_input_hash="$3"
  local expected_to="$4"
  local expected_from="$5"
  local expected_created_contract="$6"
  local label="$7"
  local transaction_json
  local receipt_json

  if ! transaction_json="$(cast tx "${transaction_hash}" --rpc-url "${rpc_url}" --json)" \
    || ! receipt_json="$(cast receipt "${transaction_hash}" --rpc-url "${rpc_url}" --json)"; then
    echo "deployment check: RPC failed while fetching ${label} transaction evidence" >&2
    exit 3
  fi

  local observed_hash observed_to observed_from observed_input observed_input_hash
  local transaction_block receipt_block receipt_status receipt_contract
  observed_hash="$(jq -r '.hash // empty' <<<"${transaction_json}" | tr '[:upper:]' '[:lower:]')"
  observed_to="$(jq -r '.to // empty' <<<"${transaction_json}" | tr '[:upper:]' '[:lower:]')"
  observed_from="$(jq -r '.from // empty' <<<"${transaction_json}" | tr '[:upper:]' '[:lower:]')"
  observed_input="$(jq -r '.input // empty' <<<"${transaction_json}")"
  transaction_block="$(to_decimal "$(jq -r '.blockNumber // empty' <<<"${transaction_json}")")"
  receipt_block="$(to_decimal "$(jq -r '.blockNumber // empty' <<<"${receipt_json}")")"
  receipt_status="$(to_decimal "$(jq -r '.status // empty' <<<"${receipt_json}")")"
  receipt_contract="$(jq -r '.contractAddress // empty' <<<"${receipt_json}" | tr '[:upper:]' '[:lower:]')"

  if [[ -z "${observed_input}" || "${observed_input}" == "0x" ]]; then
    echo "deployment check: ${label} transaction input is empty" >&2
    exit 4
  fi
  observed_input_hash="$(cast keccak "${observed_input}" | tr '[:upper:]' '[:lower:]')"

  if [[ "${observed_hash}" != "${transaction_hash}" \
    || "${transaction_block}" != "${expected_block}" \
    || "${receipt_block}" != "${expected_block}" \
    || "${receipt_status}" != "1" \
    || "${observed_input_hash}" != "${expected_input_hash}" ]]; then
    echo "deployment check: ${label} hash, block, status, or audited input differs" >&2
    exit 4
  fi
  if [[ "${observed_to}" != "${expected_to}" \
    || ( "${expected_from}" != "*" && "${observed_from}" != "${expected_from}" ) \
    || "${receipt_contract}" != "${expected_created_contract}" ]]; then
    echo "deployment check: ${label} sender, destination, or created contract differs" >&2
    exit 4
  fi
}

if ! block_json="$(cast block "${captured_block}" --rpc-url "${rpc_url}" --json)"; then
  echo "deployment check: RPC request failed before contract checks" >&2
  exit 3
fi
observed_hash="$(jq -r '.hash' <<<"${block_json}" | tr '[:upper:]' '[:lower:]')"
if [[ "${observed_hash}" != "${manifest_hash}" ]]; then
  echo "deployment check: captured block hash differs from the selected RPC" >&2
  exit 4
fi

factory_lower="$(tr '[:upper:]' '[:lower:]' <<<"${factory}")"
validation_tier_owner_lower="$(tr '[:upper:]' '[:lower:]' <<<"${validation_tier_owner}")"
check_transaction_provenance \
  "${factory_deployment_tx}" \
  "${factory_creation_block}" \
  "${factory_deployment_input_hash}" \
  "" \
  "*" \
  "${factory_lower}" \
  "factory deployment"
check_transaction_provenance \
  "${validation_tier_creation_tx}" \
  "${validation_tier_creation_block}" \
  "${validation_tier_creation_input_hash}" \
  "${factory_lower}" \
  "${validation_tier_owner_lower}" \
  "" \
  "validation tier creation"

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
