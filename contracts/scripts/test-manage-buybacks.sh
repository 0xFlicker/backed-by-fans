#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/bbf-buyback-cli.XXXXXX")"
trap 'rm -rf -- "$test_dir"' EXIT
reject() { if "$@" >"$test_dir/output" 2>&1; then echo 'buyback CLI test: invalid command succeeded' >&2; exit 1; fi; }
reject "$script_dir/manage-buybacks.sh" testnet submit
reject "$script_dir/manage-buybacks.sh" testnet prepare withdraw --input a --output b
reject "$script_dir/manage-buybacks.sh" forknet prepare policy --input a
reject "$script_dir/manage-buybacks.sh" wrong inspect
reject env -u BBF_ADMIN_RPC_URL "$script_dir/manage-buybacks.sh" forknet inspect
# Every supported action must pass argument validation before the explicit fork RPC guard.
for configuration in route limits interval policy operator mode pause asset-pause; do
  reject env -u BBF_ADMIN_RPC_URL "$script_dir/manage-buybacks.sh" forknet prepare "$configuration" --input a --output b
  [[ "$(cat "$test_dir/output")" == *'Fork administration requires explicit BBF_ADMIN_RPC_URL'* ]] || { echo "buyback CLI test: rejected supported action $configuration" >&2; exit 1; }
done
cd "$script_dir/../../web"
bun run test scripts/protocol-admin.test.ts
