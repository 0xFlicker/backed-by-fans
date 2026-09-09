#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "${1:-}" in
  serve|stop) ;;
  *) echo "Usage: test-protocol-fork-no-token.sh serve|stop --run-id ID" >&2; exit 2 ;;
esac
export BBF_FORK_EXECUTION_RPC_URL="${BBF_FORK_EXECUTION_RPC_URL:-http://127.0.0.1:18557}"
export BBF_FORK_OWNER_ADDRESS="${BBF_FORK_OWNER_ADDRESS:-0x467172992E0aBa58411d14eC8b174167B0e359a6}"
exec python3 "$repo_root/scripts/protocol-fork/lifecycle.py" "$@" --without-token
