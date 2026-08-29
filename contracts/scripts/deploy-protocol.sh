#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-protocol.sh <testnet|mainnet> [dry-run|broadcast|status|resume-verify]

Deploys Backed By Fans deterministically through Foundry's canonical CREATE2 deployer.
Dry-run is the default. Broadcast uses the matching encrypted Foundry account,
writes the public broadcast artifact, and requests Blockscout source verification.
Status validates deployment state without loading an account. Resume-verify uses
Foundry's durable broadcast artifact to resume its native verification workflow.

Optional overrides:
  ACCOUNT                 Foundry encrypted-keystore account name for dry-run/broadcast

Every mainnet run also requires CONFIRM_MAINNET_DEPLOYMENT=4663.
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

if [[ "$action" != "dry-run" && "$action" != "broadcast" && "$action" != "status" && "$action" != "resume-verify" ]]; then
  usage >&2
  exit 2
fi

bbf_require_mainnet_confirmation "$network" CONFIRM_MAINNET_DEPLOYMENT "Protocol deployment"
bbf_reject_broadcast_override "Protocol deployment"

cd "$project_dir"

if [[ "$action" == "resume-verify" ]]; then
  broadcast_artifact="broadcast/DeployProtocol.s.sol/$expected_chain_id/run-latest.json"
  if [[ ! -f "$broadcast_artifact" ]]; then
    echo "Protocol deployment: missing durable Foundry broadcast artifact: $broadcast_artifact" >&2
    exit 1
  fi
fi

bbf_verify_public_chain "Protocol deployment"

if [[ "$action" == "status" ]]; then
  forge script \
    script/DeployProtocol.s.sol:ValidateProtocol \
    --rpc-url "$rpc_url" \
    -vvv
  exit 0
fi

if [[ "$action" == "resume-verify" ]]; then
  forge script \
    script/DeployProtocol.s.sol:ValidateCompletedProtocol \
    --rpc-url "$rpc_url" \
    -vvv

  forge script \
    script/DeployProtocol.s.sol:DeployProtocol \
    --rpc-url "$rpc_url" \
    --resume \
    --verify \
    --verifier blockscout \
    --verifier-url "$verifier_url" \
    -vvvv
  exit 0
fi

forge_args=(
  script/DeployProtocol.s.sol:DeployProtocol
  --rpc-url "$rpc_url"
  --sender "$BBF_APPROVED_DEPLOYER"
  --always-use-create-2-factory
  --create2-deployer "$BBF_CREATE2_DEPLOYER"
  -vvvv
)

if [[ "$action" == "broadcast" ]]; then
  account="${ACCOUNT:-$default_account}"
  bbf_verify_public_account "Protocol deployment" "$account" "$BBF_APPROVED_DEPLOYER"
  forge_args+=(
    --account "$account"
    --broadcast
    --verify
    --verifier blockscout
    --verifier-url "$verifier_url"
  )
fi

forge script "${forge_args[@]}"
