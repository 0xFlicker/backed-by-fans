#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/mint-testnet-usdg.sh <recipient> <USDG amount> [dry-run|broadcast]

Examples:
  ./scripts/mint-testnet-usdg.sh 0x1234... 100 dry-run
  ./scripts/mint-testnet-usdg.sh 0x1234... 100.5 broadcast

The amount is expressed as human-readable six-decimal USDG. Broadcast uses the
backed-by-fans-testnet encrypted Foundry account.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

recipient_input="${1:-}"
amount_input="${2:-}"
action="${3:-dry-run}"
if [[ -z "$recipient_input" || -z "$amount_input" ]]; then
  usage >&2
  exit 2
fi
if [[ "$action" != "dry-run" && "$action" != "broadcast" ]]; then
  usage >&2
  exit 2
fi
if [[ ! "$amount_input" =~ ^[0-9]+([.][0-9]{1,6})?$ ]]; then
  echo "USDG mint: amount must be a decimal with at most six fractional digits" >&2
  exit 2
fi

recipient="$(cast to-check-sum-address "$recipient_input")"
amount_base_units="$(cast parse-units "$amount_input" 6)"
if [[ "$amount_base_units" == "0" ]]; then
  echo "USDG mint: amount must be greater than zero" >&2
  exit 2
fi

project_dir="$(cd "$script_dir/.." && pwd)"
bbf_load_dotenv "$project_dir/.env"
bbf_configure_public_network testnet
bbf_reject_broadcast_override "Testnet USDG mint"
cd "$project_dir"

bbf_verify_public_chain "Testnet USDG mint"
export USDG_RECIPIENT="$recipient"
export USDG_AMOUNT="$amount_base_units"

forge_args=(
  script/MintTestnetUSDG.s.sol:MintTestnetUSDG
  --rpc-url "$rpc_url"
  --sender "$BBF_APPROVED_DEPLOYER"
  -vvvv
)
if [[ "$action" == "broadcast" ]]; then
  account="${ACCOUNT:-$default_account}"
  bbf_verify_public_account "Testnet USDG mint" "$account" "$BBF_APPROVED_DEPLOYER"
  forge_args+=(--account "$account" --broadcast)
fi

forge script "${forge_args[@]}"
