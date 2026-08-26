#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rpc_url="${1:-${ROBINHOOD_TESTNET_RPC_URL:-}}"
evidence_block_number=107733085
evidence_block_hash="0xb300467aabfe9ce7a2d59cba7c684d068005f5c414dcd943a42ee5d55bea1e73"

if [[ -z "$rpc_url" ]]; then
  echo "usage: $0 ROBINHOOD_TESTNET_RPC_URL" >&2
  exit 1
fi

observed_block_hash="$(
  cast block "$evidence_block_number" --rpc-url "$rpc_url" --field hash
)"
if [[ "$observed_block_hash" != "$evidence_block_hash" ]]; then
  echo "Robinhood testnet evidence block hash mismatch." >&2
  exit 1
fi

observation_block_number="$(
  cast to-dec "$(cast block-number --rpc-url "$rpc_url")"
)"
observation_block_hash="$(
  cast block "$observation_block_number" --rpc-url "$rpc_url" --field hash
)"

cd "$repo_root/contracts"
RUN_ROBINHOOD_FORK_TESTS=true \
  ROBINHOOD_TESTNET_RPC_URL="$rpc_url" \
  USDG_OBSERVATION_BLOCK_NUMBER="$observation_block_number" \
  forge test --match-path test/fork/RobinhoodUSDG.t.sol -vvv

echo "Robinhood testnet USDG evidence block hash and current-state preflight passed."
echo "Current observation block: $observation_block_number"
echo "Current observation block hash: $observation_block_hash"
