#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# Browser acceptance shares the fresh authentic launch, threshold Safe, assets,
# receipt export and scoped teardown with the protocol acceptance entrypoint.
# Required private origin/pin/evidence inputs are validated by that harness.
if [[ $# -eq 0 ]]; then
  set -- run --run-id "${BBF_FORK_RUN_ID:-web-$(date -u +%Y%m%dT%H%M%S)-$$}"
fi
exec bash "$repo_root/scripts/protocol-fork/bootstrap.sh" "$@"
