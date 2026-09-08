#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "${1:-}" in
  preflight)
    [[ $# -eq 1 ]] || { echo "Usage: test-protocol-fork.sh preflight" >&2; exit 2; }
    exec bun "$repo_root/scripts/protocol-fork/preflight.ts"
    ;;
  run|serve|stop)
    exec bash "$repo_root/scripts/protocol-fork/bootstrap.sh" "$@"
    ;;
  *)
    echo "Usage: test-protocol-fork.sh preflight | run|serve|stop --run-id ID" >&2
    exit 2
    ;;
esac
