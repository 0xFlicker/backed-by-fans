#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/bbf-payment-token-test.XXXXXX")"
real_path="$PATH"
anvil_pid=""
cleanup() {
  if [[ -n "$anvil_pid" ]]; then
    kill "$anvil_pid" 2>/dev/null || true
    wait "$anvil_pid" 2>/dev/null || true
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT INT TERM
export MOCK_LOG="$test_dir/cast.log"
export PATH="$script_dir/test-fixtures/payment-tokens:$PATH"
export BBF_FACTORY_ADDRESS="0x9999999999999999999999999999999999999999"

fail() { printf 'payment-token wrapper test: %s\n' "$*" >&2; exit 1; }
assert_contains() { grep -Fq -- "$2" "$1" || fail "missing '$2' in $1"; }
run_failure() {
  if "$@" >"$test_dir/failure.out" 2>&1; then fail "command unexpectedly succeeded: $*"; fi
}

chmod +x "$script_dir/test-fixtures/payment-tokens/cast"
: >"$MOCK_LOG"
"$script_dir/manage-payment-tokens.sh" testnet list >"$test_dir/list.out"
assert_contains "$test_dir/list.out" "Symbol: USDG"
assert_contains "$test_dir/list.out" "Symbol: AMD"
assert_contains "$test_dir/list.out" "Factory fee balance (raw): 123456"
assert_contains "$test_dir/list.out" "ERC-8056: scaled"
assert_contains "$test_dir/list.out" "ERC-8056: unscaled"

unlisted="0x3333333333333333333333333333333333333333"
MOCK_UNLISTED="$unlisted" "$script_dir/manage-payment-tokens.sh" testnet enable "$unlisted" safe >"$test_dir/enable.json"
assert_contains "$test_dir/enable.json" '"action": "enable"'
assert_contains "$test_dir/enable.json" '"chainId": 46630'
assert_contains "$MOCK_LOG" "cast call $unlisted name()(string)"

MOCK_UNLISTED="$unlisted" MOCK_CORE_ONLY=true run_failure \
  "$script_dir/manage-payment-tokens.sh" testnet enable "$unlisted" safe
assert_contains "$test_dir/failure.out" "ERC-8056 core and pending support differ"

"$script_dir/manage-payment-tokens.sh" testnet disable \
  0x1111111111111111111111111111111111111111 safe >"$test_dir/disable.json"
assert_contains "$test_dir/disable.json" '"action": "disable"'

"$script_dir/manage-payment-tokens.sh" testnet withdraw \
  0x2222222222222222222222222222222222222222 safe >"$test_dir/withdraw.json"
assert_contains "$test_dir/withdraw.json" '"action": "withdraw"'
assert_contains "$test_dir/withdraw.json" '"token": "0x2222222222222222222222222222222222222222"'

run_failure "$script_dir/manage-payment-tokens.sh" testnet disable \
  0x1111111111111111111111111111111111111111 submit
assert_contains "$test_dir/failure.out" "CONFIRM_PAYMENT_TOKEN_WRITE=46630"

CONFIRM_PAYMENT_TOKEN_WRITE=46630 "$script_dir/manage-payment-tokens.sh" testnet disable \
  0x1111111111111111111111111111111111111111 submit >"$test_dir/submit.out"
assert_contains "$MOCK_LOG" "cast send $BBF_FACTORY_ADDRESS"

MOCK_FEE_RECIPIENT=0x4444444444444444444444444444444444444444 \
  CONFIRM_PAYMENT_TOKEN_WRITE=46630 run_failure \
  "$script_dir/manage-payment-tokens.sh" testnet withdraw \
  0x2222222222222222222222222222222222222222 submit
assert_contains "$test_dir/failure.out" "expected 0x4444444444444444444444444444444444444444"

CONFIRM_PAYMENT_TOKEN_WRITE=46630 "$script_dir/manage-payment-tokens.sh" testnet withdraw \
  0x2222222222222222222222222222222222222222 submit >"$test_dir/withdraw-submit.out"
assert_contains "$MOCK_LOG" "feeRecipient()(address)"

export PATH="$real_path"
for command_name in anvil cast forge jq nc; do
  command -v "$command_name" >/dev/null 2>&1 \
    || fail "$command_name is required for the live-Anvil CLI lifecycle"
done

project_dir="$(cd "$script_dir/.." && pwd)"
anvil_host="127.0.0.1"
anvil_port="${BBF_PAYMENT_TOKEN_TEST_PORT:-18547}"
rpc_url="http://$anvil_host:$anvil_port"
owner="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
member="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

if nc -z "$anvil_host" "$anvil_port" 2>/dev/null; then
  fail "port $anvil_port is already occupied"
fi
anvil \
  --silent \
  --host "$anvil_host" \
  --port "$anvil_port" \
  --chain-id 46630 \
  --block-time 1 \
  --code-size-limit 98304 \
  --gas-limit 100000000 \
  >"$test_dir/anvil.log" 2>&1 &
anvil_pid="$!"
for _ in $(seq 1 50); do
  if ! kill -0 "$anvil_pid" 2>/dev/null; then
    fail "live-Anvil CLI lifecycle exited before becoming ready"
  fi
  if cast chain-id --rpc-url "$rpc_url" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
[[ "$(cast chain-id --rpc-url "$rpc_url")" == "46630" ]] \
  || fail "live-Anvil CLI lifecycle started on the wrong chain"

export FOUNDRY_PROFILE="robinhood"
export FOUNDRY_BROADCAST="$test_dir/broadcast"
forge_create() {
  local contract="$1"
  shift
  (
    cd "$project_dir"
    forge create "$contract" \
      --rpc-url "$rpc_url" \
      --unlocked \
      --from "$owner" \
      --broadcast \
      --json \
      "$@"
  ) | jq -er '.deployedTo'
}
candidate_token="$(forge_create test/mocks/LocalWebUSDG.sol:LocalWebUSDG)"
broken_token="$(forge_create test/mocks/LocalWebUSDG.sol:LocalWebUSDG)"
media_store_factory="$(forge_create src/media/OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory)"
renderer="$(forge_create src/OnchainMetadataRenderer.sol:OnchainMetadataRenderer)"
factory="$({
  cd "$project_dir"
  forge create src/MembershipFactory.sol:MembershipFactory \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$owner" \
    --broadcast \
    --json \
    --constructor-args "[$broken_token]" "$media_store_factory" "$owner" "$owner"
} | jq -er '.deployedTo')"

run_live_cli() {
  BBF_PAYMENT_TOKEN_RPC_URL="$rpc_url" \
    BBF_FACTORY_ADDRESS="$factory" \
    "$script_dir/manage-payment-tokens.sh" "$@"
}
execute_safe_file() {
  local safe_file="$1"
  local data
  data="$(jq -er '.data' "$safe_file")"
  cast send "$factory" \
    --data "$data" \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$owner" \
    >/dev/null
}
create_tier() {
  local token="$1"
  local salt="$2"
  local name="$3"
  local symbol="$4"
  local tier_metadata art_config media_config tier_config
  tier_metadata='("A local CLI lifecycle tier.","")'
  art_config='(0,0x0123456789abcdef0123456789abcdef,0,64,56,2,52,0,1,0,50,50,36,55,52,48,44)'
  media_config='(0,0x0000000000000000000000000000000000000000,0,0x0000000000000000000000000000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000000000000000000000000000)'
  tier_config="($owner,$salt,$renderer,$token,\"$name\",\"$symbol\",1000000,2592000,500,100,0,12,$tier_metadata,$art_config,$media_config)"
  cast send "$factory" \
    'createTier((address,bytes32,address,address,string,string,uint256,uint64,uint16,uint16,uint64,uint64,(string,string),(uint16,uint128,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8),(uint8,address,uint32,bytes32,bytes32)))' \
    "$tier_config" \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$owner" \
    >/dev/null
}

run_live_cli testnet enable "$candidate_token" safe >"$test_dir/live-enable.json"
execute_safe_file "$test_dir/live-enable.json"
[[ "$(cast call "$factory" 'isPaymentTokenEnabled(address)(bool)' "$candidate_token" --rpc-url "$rpc_url")" == "true" ]] \
  || fail "candidate token was not enabled through CLI calldata"

candidate_salt="$(cast keccak 'bbf-cli-candidate-tier')"
broken_salt="$(cast keccak 'bbf-cli-broken-tier')"
rejected_salt="$(cast keccak 'bbf-cli-rejected-tier')"
create_tier "$candidate_token" "$candidate_salt" "Candidate Tier" "CAND"
create_tier "$broken_token" "$broken_salt" "Broken Tier" "BROKE"
candidate_tier="$(cast call "$factory" 'tiers(uint256,uint256)(address[])' 0 2 \
  --rpc-url "$rpc_url" --json | jq -er '.[0][0]')"
broken_tier="$(cast call "$factory" 'tiers(uint256,uint256)(address[])' 0 2 \
  --rpc-url "$rpc_url" --json | jq -er '.[0][1]')"

run_live_cli testnet disable "$candidate_token" safe >"$test_dir/live-disable.json"
execute_safe_file "$test_dir/live-disable.json"
[[ "$(cast call "$factory" 'isPaymentTokenEnabled(address)(bool)' "$candidate_token" --rpc-url "$rpc_url")" == "false" ]] \
  || fail "candidate token was not disabled through CLI calldata"
if create_tier "$candidate_token" "$rejected_salt" "Rejected Tier" "NOPE" \
  >"$test_dir/rejected-tier.out" 2>&1; then
  fail "disabled token unexpectedly published a new tier"
fi
[[ "$(cast call "$factory" 'isTierSaltUsed(address,bytes32)(bool)' "$owner" "$rejected_salt" --rpc-url "$rpc_url")" == "false" ]] \
  || fail "rejected publication consumed its tier salt"

for token in "$candidate_token" "$broken_token"; do
  cast send "$token" 'mint(address,uint256)' "$member" 10000000 \
    --rpc-url "$rpc_url" --unlocked --from "$owner" >/dev/null
done
for tier in "$candidate_tier" "$broken_tier"; do
  if [[ "$tier" == "$candidate_tier" ]]; then token="$candidate_token"; else token="$broken_token"; fi
  cast send "$token" 'approve(address,uint256)' "$tier" 1000000 \
    --rpc-url "$rpc_url" --unlocked --from "$member" >/dev/null
  cast send "$tier" 'purchase(uint64,address)' 1 \
    0x0000000000000000000000000000000000000000 \
    --rpc-url "$rpc_url" --unlocked --from "$member" >/dev/null
done
[[ "$(cast call "$candidate_tier" 'tokenOf(address)(uint256)' "$member" --rpc-url "$rpc_url")" != "0" ]] \
  || fail "existing disabled-token tier stopped serving purchases"

candidate_fee="$(cast call "$candidate_token" 'balanceOf(address)(uint256)' "$factory" --rpc-url "$rpc_url")"
broken_fee="$(cast call "$broken_token" 'balanceOf(address)(uint256)' "$factory" --rpc-url "$rpc_url")"
[[ "${candidate_fee%% *}" -gt 0 && "${broken_fee%% *}" -gt 0 ]] \
  || fail "local lifecycle did not accrue independent token fees"
cast send "$broken_token" 'setBlocked(address,bool)' "$owner" true \
  --rpc-url "$rpc_url" --unlocked --from "$owner" >/dev/null

run_live_cli testnet withdraw "$broken_token" safe >"$test_dir/live-withdraw-broken.json"
broken_data="$(jq -er '.data' "$test_dir/live-withdraw-broken.json")"
if cast send "$factory" --data "$broken_data" \
  --rpc-url "$rpc_url" --unlocked --from "$owner" \
  >"$test_dir/broken-withdraw.out" 2>&1; then
  fail "blocked fee token unexpectedly withdrew"
fi
run_live_cli testnet withdraw "$candidate_token" safe >"$test_dir/live-withdraw-candidate.json"
execute_safe_file "$test_dir/live-withdraw-candidate.json"
[[ "$(cast call "$candidate_token" 'balanceOf(address)(uint256)' "$factory" --rpc-url "$rpc_url")" == "0" ]] \
  || fail "healthy token fee withdrawal did not empty its factory balance"
[[ "$(cast call "$broken_token" 'balanceOf(address)(uint256)' "$factory" --rpc-url "$rpc_url")" == "$broken_fee" ]] \
  || fail "failed token withdrawal changed its retained fee balance"

run_live_cli testnet list >"$test_dir/live-list.out"
assert_contains "$test_dir/live-list.out" "Enabled: false"
assert_contains "$test_dir/live-list.out" "Factory fee balance (raw): $broken_fee"

printf 'payment-token wrapper tests: passed\n'
