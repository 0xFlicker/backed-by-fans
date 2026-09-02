#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-renderer-registry.sh [dry-run|broadcast|status]

Deploys the permissionless renderer registry on Robinhood Chain Testnet.
Broadcast uses the backed-by-fans-testnet encrypted account and requires its
password. This is separate from the membership protocol deployment.
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
broadcast_file="$project_dir/broadcast/DeployRendererRegistry.s.sol/46630/run-latest.json"
bbf_load_dotenv "$project_dir/.env"
bbf_configure_public_network testnet
bbf_reject_broadcast_override "Renderer registry deployment"
cd "$project_dir"
bbf_verify_public_chain "Renderer registry deployment"
forge clean

registry_address="${RENDERER_REGISTRY_ADDRESS:-}"
if [[ -z "$registry_address" && -f "$broadcast_file" ]]; then
  registry_address="$(jq -er '
    [.transactions[]? | select(.contractName == "RendererRegistry") | .contractAddress]
    | last // empty
  ' "$broadcast_file")"
fi

validate_registry() {
  if [[ -z "$registry_address" ]]; then
    echo "Renderer registry deployment: no deployed address is recorded" >&2
    return 1
  fi
  RENDERER_REGISTRY_ADDRESS="$registry_address" forge script \
    script/DeployRendererRegistry.s.sol:ValidateRendererRegistry \
    --rpc-url "$rpc_url" -vvv
}

if [[ "$action" == "status" ]]; then
  validate_registry
  exit 0
fi

if [[ "$action" == "broadcast" && -n "$registry_address" ]]; then
  if validate_registry; then
    echo "Renderer registry deployment: existing verified deployment retained at $registry_address"
    exit 0
  fi
  echo "Renderer registry deployment: recorded address is not live; continuing with a new broadcast" >&2
  registry_address=""
fi

forge_args=(
  script/DeployRendererRegistry.s.sol:DeployRendererRegistry
  --rpc-url "$rpc_url"
  --sender "$BBF_APPROVED_DEPLOYER"
  -vvvv
)

if [[ "$action" == "broadcast" ]]; then
  account="${ACCOUNT:-$default_account}"
  bbf_verify_public_account "Renderer registry deployment" "$account" "$BBF_APPROVED_DEPLOYER"
  forge_args+=(
    --account "$account"
    --broadcast
    --verify
    --verifier blockscout
    --verifier-url "$verifier_url"
  )
fi

forge script "${forge_args[@]}"

if [[ "$action" == "broadcast" ]]; then
  registry_address="$(jq -er '
    [.transactions[]? | select(.contractName == "RendererRegistry") | .contractAddress]
    | last // empty
  ' "$broadcast_file")"
  validate_registry
  echo "Renderer registry deployment complete: $registry_address"
  echo "Next: cd ../web && bun run generate"
fi
