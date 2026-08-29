#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/backed-by-fans-deploy-test.XXXXXX")"
mock_bin="$script_dir/test-fixtures/create-safe"
mock_log="$test_dir/calls.log"
wrapper_dir="$test_dir/project/scripts"
trap 'rm -rf "$test_dir"' EXIT

fail() {
  echo "deploy-protocol wrapper test: $*" >&2
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

mkdir -p "$wrapper_dir"
cp "$script_dir/deploy-protocol.sh" "$script_dir/public-chain-common.sh" "$wrapper_dir/"
deploy_wrapper="$wrapper_dir/deploy-protocol.sh"

: >"$mock_log"
"$deploy_wrapper" testnet dry-run
assert_contains "$mock_log" "cast chain-id --rpc-url"
assert_contains "$mock_log" "forge script script/DeployProtocol.s.sol:DeployProtocol"
assert_contains "$mock_log" "--always-use-create-2-factory"
assert_contains "$mock_log" "--create2-deployer 0x4e59b44847b379578588920cA78FbF26c0B4956C"
assert_contains "$mock_log" "--sender 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027"
assert_not_contains "$mock_log" "--broadcast"
assert_not_contains "$mock_log" "--verify"
assert_not_contains "$mock_log" "--account"

: >"$mock_log"
"$deploy_wrapper" testnet broadcast
assert_contains "$mock_log" "cast wallet address --account backed-by-fans-testnet"
assert_contains "$mock_log" "--broadcast"
assert_contains "$mock_log" "--verify"
assert_contains "$mock_log" "--verifier blockscout"
assert_contains "$mock_log" "--verifier-url https://explorer.testnet.chain.robinhood.com/api/"

: >"$mock_log"
run_expect_failure "$deploy_wrapper" mainnet dry-run
[[ ! -s "$mock_log" ]] || fail "mainnet confirmation failure invoked external tools"

: >"$mock_log"
run_expect_failure env CONFIRM_MAINNET_DEPLOYMENT=4662 \
  "$deploy_wrapper" mainnet broadcast
[[ ! -s "$mock_log" ]] || fail "wrong mainnet confirmation invoked external tools"

: >"$mock_log"
CONFIRM_MAINNET_DEPLOYMENT=4663 MOCK_CHAIN_ID=4663 \
  "$deploy_wrapper" mainnet broadcast
assert_contains "$mock_log" "cast wallet address --account backed-by-fans"
assert_contains "$mock_log" "--verifier-url https://robinhoodchain.blockscout.com/api/"

: >"$mock_log"
run_expect_failure env FOUNDRY_BROADCAST="$test_dir/temporary-broadcast" \
  "$deploy_wrapper" testnet dry-run
[[ ! -s "$mock_log" ]] || fail "temporary broadcast override invoked external tools"

: >"$mock_log"
run_expect_failure env MOCK_CHAIN_ID=4663 "$deploy_wrapper" testnet dry-run
assert_not_contains "$mock_log" "forge"
assert_not_contains "$mock_log" "cast wallet address"

: >"$mock_log"
run_expect_failure env MOCK_DEPLOYER=0x0000000000000000000000000000000000000001 \
  "$deploy_wrapper" testnet broadcast
assert_not_contains "$mock_log" "forge"

: >"$mock_log"
"$deploy_wrapper" testnet status
assert_contains "$mock_log" "cast chain-id --rpc-url"
assert_contains "$mock_log" "forge script script/DeployProtocol.s.sol:ValidateProtocol --rpc-url"
assert_not_contains "$mock_log" "cast wallet address"
assert_not_contains "$mock_log" "--account"
assert_not_contains "$mock_log" "--sender"
assert_not_contains "$mock_log" "--broadcast"
assert_not_contains "$mock_log" "--resume"

: >"$mock_log"
run_expect_failure "$deploy_wrapper" testnet resume-verify
assert_contains "$test_dir/stderr" "missing durable Foundry broadcast artifact"
[[ ! -s "$mock_log" ]] || fail "missing resume artifact invoked external tools"

mkdir -p "$test_dir/project/broadcast/DeployProtocol.s.sol/46630"
printf '{}\n' >"$test_dir/project/broadcast/DeployProtocol.s.sol/46630/run-latest.json"
: >"$mock_log"
"$deploy_wrapper" testnet resume-verify
assert_contains "$mock_log" "forge script script/DeployProtocol.s.sol:ValidateCompletedProtocol --rpc-url"
assert_contains "$mock_log" "forge script script/DeployProtocol.s.sol:DeployProtocol --rpc-url"
assert_contains "$mock_log" "--resume"
assert_contains "$mock_log" "--verify"
assert_contains "$mock_log" "--verifier blockscout"
assert_contains "$mock_log" "--verifier-url https://explorer.testnet.chain.robinhood.com/api/"
assert_not_contains "$mock_log" "cast wallet address"
assert_not_contains "$mock_log" "--account"
assert_not_contains "$mock_log" "--sender"
assert_not_contains "$mock_log" "--broadcast"

: >"$mock_log"
run_expect_failure env MOCK_FORGE_FAIL_ON=ValidateCompletedProtocol \
  "$deploy_wrapper" testnet resume-verify
assert_contains "$mock_log" "ValidateCompletedProtocol"
assert_not_contains "$mock_log" "--resume"

: >"$mock_log"
run_expect_failure "$deploy_wrapper" mainnet status
[[ ! -s "$mock_log" ]] || fail "mainnet status without confirmation invoked external tools"

: >"$mock_log"
run_expect_failure "$deploy_wrapper" mainnet resume-verify
[[ ! -s "$mock_log" ]] || fail "mainnet resume without confirmation invoked external tools"

: >"$mock_log"
run_expect_failure env FOUNDRY_BROADCAST="$test_dir/temporary-broadcast" \
  "$deploy_wrapper" testnet status
[[ ! -s "$mock_log" ]] || fail "temporary broadcast override reached status tools"

: >"$mock_log"
run_expect_failure env FOUNDRY_BROADCAST="$test_dir/temporary-broadcast" \
  "$deploy_wrapper" testnet resume-verify
[[ ! -s "$mock_log" ]] || fail "temporary broadcast override reached resume tools"

echo "deploy-protocol wrapper tests: passed"
