#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-testnet-usdg.sh [dry-run|broadcast|status]

Deploys the testnet-only LOL Dollar (symbol USDG) through Foundry's canonical
CREATE2 deployer. Broadcast uses the backed-by-fans-testnet encrypted account.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

action="${1:-dry-run}"
if [[ "$action" != "dry-run" && "$action" != "broadcast" && "$action" != "status" ]]; then
  usage >&2
  exit 2
fi

project_dir="$(cd "$script_dir/.." && pwd)"
bbf_load_dotenv "$project_dir/.env"
bbf_configure_public_network testnet
bbf_reject_broadcast_override "Testnet USDG deployment"
cd "$project_dir"
bbf_verify_public_chain "Testnet USDG deployment"

if [[ "$action" == "status" ]]; then
  forge script script/TestnetUSDG.s.sol:ValidateTestnetUSDG --rpc-url "$rpc_url" -vvv
  exit 0
fi

forge_args=(
  script/TestnetUSDG.s.sol:DeployTestnetUSDG
  --rpc-url "$rpc_url"
  --sender "$BBF_APPROVED_DEPLOYER"
  --always-use-create-2-factory
  --create2-deployer "$BBF_CREATE2_DEPLOYER"
  -vvvv
)

if [[ "$action" == "broadcast" ]]; then
  account="${ACCOUNT:-$default_account}"
  bbf_verify_public_account "Testnet USDG deployment" "$account" "$BBF_APPROVED_DEPLOYER"
  forge_args+=(
    --account "$account"
    --broadcast
    --verify
    --verifier blockscout
    --verifier-url "$verifier_url"
  )
fi

forge script "${forge_args[@]}"
