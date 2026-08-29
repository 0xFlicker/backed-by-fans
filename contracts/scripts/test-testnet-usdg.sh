#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/backed-by-fans-usdg-test.XXXXXX")"
mock_bin="$script_dir/test-fixtures/create-safe"
mock_log="$test_dir/calls.log"
trap 'rm -rf "$test_dir"' EXIT

fail() {
  echo "testnet-usdg wrapper test: $*" >&2
  exit 1
}

assert_contains() {
  grep -F -- "$2" "$1" >/dev/null || fail "expected '$2' in $1"
}

assert_not_contains() {
  if grep -F -- "$2" "$1" >/dev/null; then
    fail "did not expect '$2' in $1"
  fi
}

run_expect_failure() {
  if "$@" >"$test_dir/stdout" 2>"$test_dir/stderr"; then
    fail "command unexpectedly succeeded: $*"
  fi
}

export MOCK_LOG="$mock_log"
export MOCK_CHAIN_ID=46630
export MOCK_DEPLOYER=0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027
export PATH="$mock_bin:$PATH"

: >"$mock_log"
"$script_dir/deploy-testnet-usdg.sh" dry-run
assert_contains "$mock_log" "forge script script/TestnetUSDG.s.sol:DeployTestnetUSDG"
assert_contains "$mock_log" "--sender 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027"
assert_not_contains "$mock_log" "--account"
assert_not_contains "$mock_log" "--broadcast"

: >"$mock_log"
"$script_dir/deploy-testnet-usdg.sh" broadcast
assert_contains "$mock_log" "cast wallet address --account backed-by-fans-testnet"
assert_contains "$mock_log" "--account backed-by-fans-testnet"
assert_contains "$mock_log" "--broadcast"
assert_contains "$mock_log" "--verify"

: >"$mock_log"
"$script_dir/deploy-testnet-usdg.sh" status
assert_contains "$mock_log" "forge script script/TestnetUSDG.s.sol:ValidateTestnetUSDG"
assert_not_contains "$mock_log" "cast wallet address"
assert_not_contains "$mock_log" "--account"

: >"$mock_log"
"$script_dir/mint-testnet-usdg.sh" 0x1111111111111111111111111111111111111111 100 dry-run
assert_contains "$mock_log" "cast parse-units 100 6"
assert_contains "$mock_log" "forge script script/TestnetUSDG.s.sol:MintTestnetUSDG"
assert_not_contains "$mock_log" "--account"
assert_not_contains "$mock_log" "--broadcast"

: >"$mock_log"
"$script_dir/mint-testnet-usdg.sh" 0x1111111111111111111111111111111111111111 100 broadcast
assert_contains "$mock_log" "cast wallet address --account backed-by-fans-testnet"
assert_contains "$mock_log" "--account backed-by-fans-testnet"
assert_contains "$mock_log" "--broadcast"

: >"$mock_log"
run_expect_failure env MOCK_CHAIN_ID=4663 "$script_dir/deploy-testnet-usdg.sh" dry-run
assert_not_contains "$mock_log" "forge"

: >"$mock_log"
run_expect_failure env FOUNDRY_BROADCAST="$test_dir/broadcast" \
  "$script_dir/mint-testnet-usdg.sh" 0x1111111111111111111111111111111111111111 100 dry-run
assert_not_contains "$mock_log" "forge"

echo "testnet-usdg wrapper tests: passed"
