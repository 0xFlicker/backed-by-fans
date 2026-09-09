#!/usr/bin/env bash
# Shared read/prepare environment only. No account, signing, or submission path.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/public-chain-common.sh"
bbf_admin_environment() {
  local network="$1"
  local configured_rpc="${BBF_ADMIN_RPC_URL:-}"
  local configured_factory="${BBF_FACTORY_ADDRESS:-}"
  bbf_load_dotenv "$script_dir/../.env"
  if [[ -n "$configured_factory" ]]; then export BBF_FACTORY_ADDRESS="$configured_factory"; fi
  if [[ "$network" == forknet ]]; then
    [[ -n "$configured_rpc" ]] || { echo 'Fork administration requires explicit BBF_ADMIN_RPC_URL' >&2; return 1; }
    export BBF_ADMIN_RPC_URL="$configured_rpc"
  else
    bbf_configure_public_network "$network"
    export BBF_ADMIN_RPC_URL="${configured_rpc:-$rpc_url}"
  fi
}
