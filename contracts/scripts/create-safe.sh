#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/create-safe.sh <testnet|mainnet> [dry-run|broadcast]

Creates the Backed By Fans 1-of-1 Safe through Safe v1.5.0's canonical L2
factory. Dry-run is the default. Broadcast requires the matching Foundry
encrypted account and never reads a private key from the environment.

Optional overrides:
  ACCOUNT                 Foundry encrypted-keystore account name

Every mainnet run also requires CONFIRM_MAINNET_SAFE_CREATION=4663.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

network="${1:-}"
action="${2:-dry-run}"
expected_deployer="0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027"

case "$network" in
  testnet)
    expected_chain_id="46630"
    default_account="backed-by-fans-testnet"
    default_rpc_url="https://rpc.testnet.chain.robinhood.com"
    ;;
  mainnet)
    expected_chain_id="4663"
    default_account="backed-by-fans"
    default_rpc_url="https://rpc.mainnet.chain.robinhood.com"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if [[ "$action" != "dry-run" && "$action" != "broadcast" ]]; then
  usage >&2
  exit 2
fi

if [[ "$network" == "mainnet" && "${CONFIRM_MAINNET_SAFE_CREATION:-}" != "4663" ]]; then
  echo "Safe creation: mainnet requires CONFIRM_MAINNET_SAFE_CREATION=4663" >&2
  exit 1
fi

if [[ "${FOUNDRY_BROADCAST+x}" == "x" ]]; then
  echo "Safe creation: unset FOUNDRY_BROADCAST so the public artifact stays in contracts/broadcast" >&2
  exit 1
fi

account="${ACCOUNT:-$default_account}"
rpc_url="$default_rpc_url"

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

observed_chain_id="$(cast chain-id --rpc-url "$rpc_url")"
if [[ "$observed_chain_id" != "$expected_chain_id" ]]; then
  echo "Safe creation: expected chain $expected_chain_id, RPC returned $observed_chain_id" >&2
  exit 1
fi

observed_deployer="$(cast wallet address --account "$account")"
normalized_observed="$(printf '%s' "$observed_deployer" | tr '[:upper:]' '[:lower:]')"
normalized_expected="$(printf '%s' "$expected_deployer" | tr '[:upper:]' '[:lower:]')"
if [[ "$normalized_observed" != "$normalized_expected" ]]; then
  echo "Safe creation: account $account resolves to $observed_deployer, expected $expected_deployer" >&2
  exit 1
fi

forge_args=(
  script/CreateSafe.s.sol:CreateRobinhoodSafe
  --rpc-url "$rpc_url"
  --account "$account"
  --sender "$expected_deployer"
  -vvvv
)

if [[ "$action" == "broadcast" ]]; then
  forge_args+=(--broadcast)
fi

forge script "${forge_args[@]}"
