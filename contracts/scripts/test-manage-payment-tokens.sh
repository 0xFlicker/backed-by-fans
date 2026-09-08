#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/bbf-payment-token-cli.XXXXXX")"
trap 'rm -rf -- "$test_dir"' EXIT
fail() { echo "payment-token CLI test: $*" >&2; exit 1; }
reject() { if "$@" >"$test_dir/output" 2>&1; then fail 'invalid command succeeded'; fi; }
reject "$script_dir/manage-payment-tokens.sh" testnet withdraw 0x1111111111111111111111111111111111111111
reject "$script_dir/manage-payment-tokens.sh" testnet enable 0x1111111111111111111111111111111111111111 submit
reject "$script_dir/manage-payment-tokens.sh" testnet disable 0x1111111111111111111111111111111111111111 safe
reject "$script_dir/manage-payment-tokens.sh" unsupported list
reject env -u BBF_ADMIN_RPC_URL "$script_dir/manage-payment-tokens.sh" forknet list
# Source/generation and payload tests accompany the actual threshold-signed
# registry tests in ProtocolSafeForkTest. An EOA pretending to execute a Safe
# payload is deliberately no longer presented as Safe integration evidence.
cd "$script_dir/../../web"
bun run test scripts/protocol-admin.test.ts src/lib/payment-token-read.test.ts src/features/protocol/registry-reconciliation.test.ts
