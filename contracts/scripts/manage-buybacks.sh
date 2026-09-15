#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
network="${1:-}"
action="${2:-}"
case "$network" in forknet|testnet|mainnet) ;; *) echo 'Usage: manage-buybacks.sh <forknet|testnet|mainnet> <inspect|prepare> ...' >&2; exit 2 ;; esac
case "$action" in
  inspect) [[ $# == 2 || $# == 3 ]] || { echo 'inspect takes at most one asset' >&2; exit 2; } ;;
  prepare)
    [[ $# == 7 && "${4:-}" == --input && "${6:-}" == --output ]] || { echo 'prepare <route|limits|interval|policy|operator|mode|pause|asset-pause> --input <json-file> --output <payload-file>' >&2; exit 2; }
    case "$3" in route|limits|interval|policy|operator|mode|pause|asset-pause) ;; *) echo 'Unsupported configuration action' >&2; exit 2 ;; esac ;;
  *) echo 'Only inspect and prepare are available; direct submission is unavailable.' >&2; exit 2 ;;
esac
source "$script_dir/protocol-admin-common.sh"
bbf_admin_environment "$network"
# Resolve caller-relative files before entering web for its pinned Bun dependencies.
if [[ "$action" == prepare ]]; then
  input="$5"; output="$7"
  [[ "$input" == /* ]] || input="$PWD/$input"
  [[ "$output" == /* ]] || output="$PWD/$output"
  set -- "$network" "$action" "$3" --input "$input" --output "$output"
fi
cd "$script_dir/../../web"
exec bun scripts/protocol-admin.ts buybacks "$@"
