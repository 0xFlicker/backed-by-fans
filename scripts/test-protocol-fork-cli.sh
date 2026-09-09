#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
python3 "$repo_root/scripts/protocol-fork/test_lifecycle.py"
if bash "$repo_root/scripts/test-protocol-fork.sh" invalid >/dev/null 2>&1; then
  echo "Invalid lifecycle mode was accepted" >&2; exit 1
fi
if bash "$repo_root/scripts/test-protocol-fork.sh" stop --run-id ../foreign >/dev/null 2>&1; then
  echo "Unsafe run ID was accepted" >&2; exit 1
fi
echo "Protocol fork CLI guards passed"
