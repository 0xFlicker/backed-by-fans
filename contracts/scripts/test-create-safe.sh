#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/backed-by-fans-safe-test.XXXXXX")"
mock_bin="$script_dir/test-fixtures/create-safe"
mock_log="$test_dir/calls.log"
trap 'rm -rf "$test_dir"' EXIT

fail() {
  echo "create-safe wrapper test: $*" >&2
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
unset ROBINHOOD_TESTNET_RPC_URL ROBINHOOD_MAINNET_RPC_URL

dotenv_fixture="$test_dir/.env"
printf 'CONFIRM_MAINNET_DEPLOYMENT=4663\nCONFIRM_MAINNET_SAFE_CREATION=4663\n' >"$dotenv_fixture"
(
  unset CONFIRM_MAINNET_DEPLOYMENT CONFIRM_MAINNET_SAFE_CREATION
  # shellcheck source=public-chain-common.sh
  source "$script_dir/public-chain-common.sh"
  bbf_load_dotenv "$dotenv_fixture"
  [[ -z "${CONFIRM_MAINNET_DEPLOYMENT+x}" ]] || fail "dotenv authorized mainnet deployment"
  [[ -z "${CONFIRM_MAINNET_SAFE_CREATION+x}" ]] || fail "dotenv authorized mainnet Safe creation"
)
(
  export CONFIRM_MAINNET_DEPLOYMENT=4662
  export CONFIRM_MAINNET_SAFE_CREATION=4662
  # shellcheck source=public-chain-common.sh
  source "$script_dir/public-chain-common.sh"
  bbf_load_dotenv "$dotenv_fixture"
  [[ "$CONFIRM_MAINNET_DEPLOYMENT" == "4662" ]] || fail "dotenv replaced deployment confirmation"
  [[ "$CONFIRM_MAINNET_SAFE_CREATION" == "4662" ]] || fail "dotenv replaced Safe confirmation"
)

: >"$mock_log"
"$script_dir/create-safe.sh" testnet dry-run
assert_contains "$mock_log" "cast chain-id --rpc-url"
assert_contains "$mock_log" "cast wallet address --account backed-by-fans-testnet"
assert_contains "$mock_log" "forge script script/CreateSafe.s.sol:CreateRobinhoodSafe"
assert_contains "$mock_log" "--sender 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027"
assert_not_contains "$mock_log" "--broadcast"

: >"$mock_log"
"$script_dir/create-safe.sh" testnet broadcast
assert_contains "$mock_log" "--broadcast"
if [[ "$(grep -o -- '--broadcast' "$mock_log" | wc -l | tr -d ' ')" != "1" ]]; then
  fail "broadcast flag was not added exactly once"
fi

: >"$mock_log"
run_expect_failure "$script_dir/create-safe.sh" mainnet dry-run
[[ ! -s "$mock_log" ]] || fail "mainnet confirmation failure invoked external tools"

: >"$mock_log"
run_expect_failure env CONFIRM_MAINNET_SAFE_CREATION=4662 \
  "$script_dir/create-safe.sh" mainnet broadcast
[[ ! -s "$mock_log" ]] || fail "wrong mainnet confirmation invoked external tools"

: >"$mock_log"
run_expect_failure env FOUNDRY_BROADCAST="$test_dir/temporary-broadcast" \
  "$script_dir/create-safe.sh" testnet dry-run
[[ ! -s "$mock_log" ]] || fail "temporary broadcast override invoked external tools"

: >"$mock_log"
run_expect_failure env MOCK_CHAIN_ID=4663 "$script_dir/create-safe.sh" testnet dry-run
assert_not_contains "$mock_log" "forge script"
assert_not_contains "$mock_log" "cast wallet address"

: >"$mock_log"
run_expect_failure env MOCK_DEPLOYER=0x0000000000000000000000000000000000000001 \
  "$script_dir/create-safe.sh" testnet dry-run
assert_not_contains "$mock_log" "forge script"

echo "create-safe wrapper tests: passed"
