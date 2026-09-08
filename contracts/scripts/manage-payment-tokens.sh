#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
network="${1:-}"
action="${2:-}"
case "$network" in forknet|testnet|mainnet) ;; *) echo 'Usage: manage-payment-tokens.sh <forknet|testnet|mainnet> <list|inspect|enable|disable> [token]' >&2; exit 2 ;; esac
case "$action" in
  list) [[ $# == 2 ]] || { echo 'list takes no extra arguments' >&2; exit 2; } ;;
  inspect|enable|disable) [[ $# == 3 ]] || { echo 'One token is required. Only read/prepare modes exist; direct submission is unavailable.' >&2; exit 2; } ;;
  *) echo 'Unsupported action. Only list, inspect, enable and disable are available; these never submit.' >&2; exit 2 ;;
esac
source "$script_dir/protocol-admin-common.sh"
bbf_admin_environment "$network"
cd "$script_dir/../../web"
exec bun scripts/protocol-admin.ts tokens "$@"
