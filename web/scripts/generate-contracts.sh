#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "$script_dir/.." && pwd -P)"
generation_lock_directory=""
generation_lock_owner=""
generation_lock_held=false

fail() {
  echo "Contract generation: $*" >&2
  exit 1
}

release_generation_lock() {
  local current_owner=""
  [[ "$generation_lock_held" == "true" ]] || return 0
  if [[ -f "$generation_lock_directory/owner" ]]; then
    current_owner="$(cat "$generation_lock_directory/owner" 2>/dev/null || true)"
  fi
  if [[ "$current_owner" == "$generation_lock_owner" ]]; then
    rm -f "$generation_lock_directory/owner"
    rmdir "$generation_lock_directory" 2>/dev/null || true
  fi
  generation_lock_held=false
}

acquire_generation_lock() {
  local blocked_lock lock_key owner repo_root token
  if ! repo_root="$(git -C "$web_dir" rev-parse --show-toplevel 2>/dev/null)"; then
    fail "web project is not in a Git checkout"
  fi
  repo_root="$(cd "$repo_root" && pwd -P)"
  lock_key="$(printf '%s' "$repo_root" | shasum -a 256 | awk '{print $1}')"
  generation_lock_directory="/tmp/bbf-protocol-deployment-${lock_key}.lock"
  if ! mkdir "$generation_lock_directory" 2>/dev/null; then
    blocked_lock="$generation_lock_directory"
    owner="$(cat "$generation_lock_directory/owner" 2>/dev/null || printf 'owner details unavailable')"
    generation_lock_directory=""
    fail "another protocol deployment operation holds the repo-wide lock ($owner); resolve that process or remove its stale lock explicitly at $blocked_lock"
  fi

  token="generate-$$-${RANDOM:-0}-$(date -u +%Y%m%dT%H%M%SZ)"
  generation_lock_owner="pid=$$ action=generate network=web started=$(date -u +%Y-%m-%dT%H:%M:%SZ) token=$token"
  generation_lock_held=true
  trap release_generation_lock EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  printf '%s\n' "$generation_lock_owner" >"$generation_lock_directory/owner"
}

acquire_generation_lock
cd "$web_dir"
bun x wagmi generate
bun x prettier --write src/contracts.ts
