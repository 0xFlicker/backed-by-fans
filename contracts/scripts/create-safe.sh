#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"

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
project_dir="$(cd "$script_dir/.." && pwd)"
bbf_load_dotenv "$project_dir/.env"

if ! bbf_configure_public_network "$network"; then
  usage >&2
  exit 2
fi

if [[ "$action" != "dry-run" && "$action" != "broadcast" ]]; then
  usage >&2
  exit 2
fi

bbf_require_mainnet_confirmation "$network" CONFIRM_MAINNET_SAFE_CREATION "Safe creation"
bbf_reject_broadcast_override "Safe creation"

account="${ACCOUNT:-$default_account}"

cd "$project_dir"

bbf_verify_public_context "Safe creation" "$account" "$BBF_APPROVED_DEPLOYER"

forge_args=(
  script/CreateSafe.s.sol:CreateRobinhoodSafe
  --rpc-url "$rpc_url"
  --account "$account"
  --sender "$BBF_APPROVED_DEPLOYER"
  -vvvv
)

if [[ "$action" == "broadcast" ]]; then
  forge_args+=(--broadcast)
fi

forge script "${forge_args[@]}"
