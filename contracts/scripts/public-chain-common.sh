#!/usr/bin/env bash

bbf_configure_public_network() {
  case "$1" in
    testnet)
      expected_chain_id="46630"
      default_account="backed-by-fans-testnet"
      rpc_url="https://rpc.testnet.chain.robinhood.com"
      verifier_url="https://explorer.testnet.chain.robinhood.com/api/"
      ;;
    mainnet)
      expected_chain_id="4663"
      default_account="backed-by-fans"
      rpc_url="https://rpc.mainnet.chain.robinhood.com"
      verifier_url="https://robinhoodchain.blockscout.com/api/"
      ;;
    *)
      return 1
      ;;
  esac
}

bbf_require_mainnet_confirmation() {
  local network="$1"
  local variable_name="$2"
  local label="$3"
  local provided="${!variable_name:-}"

  if [[ "$network" == "mainnet" && "$provided" != "4663" ]]; then
    echo "$label: mainnet requires $variable_name=4663" >&2
    return 1
  fi
}

bbf_reject_broadcast_override() {
  local label="$1"
  if [[ "${FOUNDRY_BROADCAST+x}" == "x" ]]; then
    echo "$label: unset FOUNDRY_BROADCAST so the public artifact stays in contracts/broadcast" >&2
    return 1
  fi
}

bbf_verify_public_chain() {
  local label="$1"
  local observed_chain_id

  observed_chain_id="$(cast chain-id --rpc-url "$rpc_url")"
  if [[ "$observed_chain_id" != "$expected_chain_id" ]]; then
    echo "$label: expected chain $expected_chain_id, RPC returned $observed_chain_id" >&2
    return 1
  fi
}

bbf_verify_public_account() {
  local label="$1"
  local account="$2"
  local expected_deployer="$3"
  local observed_deployer
  local normalized_observed
  local normalized_expected

  observed_deployer="$(cast wallet address --account "$account")"
  normalized_observed="$(printf '%s' "$observed_deployer" | tr '[:upper:]' '[:lower:]')"
  normalized_expected="$(printf '%s' "$expected_deployer" | tr '[:upper:]' '[:lower:]')"
  if [[ "$normalized_observed" != "$normalized_expected" ]]; then
    echo "$label: account $account resolves to $observed_deployer, expected $expected_deployer" >&2
    return 1
  fi
}

bbf_verify_public_context() {
  bbf_verify_public_chain "$1"
  bbf_verify_public_account "$1" "$2" "$3"
}
