#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${BBF_DEPLOY_TEST_TOCTOU_MARKER:-}" ]]; then
  case "${0##*/}" in
    git)
      if [[ -f "$BBF_DEPLOY_TEST_TOCTOU_MARKER" ]]; then
        export MOCK_GIT_DIRTY_WEB=1
      fi
      exec "$BBF_DEPLOY_TEST_BASE_MOCK_BIN/git" "$@"
      ;;
    bun)
      "$BBF_DEPLOY_TEST_BASE_MOCK_BIN/bun" "$@"
      if [[ "$*" == "x wagmi generate" ]]; then
        : >"$BBF_DEPLOY_TEST_TOCTOU_MARKER"
      fi
      exit 0
      ;;
  esac
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d "${TMPDIR:-/tmp}/backed-by-fans-deploy-test.XXXXXX")"
mock_bin="$script_dir/test-fixtures/deploy-protocol"
mock_log="$test_dir/calls.log"
project_root="$test_dir/project"
contracts_dir="$project_root/contracts"
wrapper_dir="$contracts_dir/scripts"
public_state="$test_dir/public-prefix"
local_state="$test_dir/local-prefix"
anvil_ready="$test_dir/anvil-ready"
operational_state="$contracts_dir/config/operational-state/46630.json"
payment_token_manifest="$contracts_dir/config/payment-tokens/46630.json"
reviewed_operational_state="$test_dir/reviewed-operational-state.json"
reviewed_payment_token_manifest="$test_dir/reviewed-payment-token-manifest.json"
deployment_lock=""

cleanup_test() {
  if [[ -n "$deployment_lock" && -d "$deployment_lock" ]]; then
    rm -f "$deployment_lock/owner"
    rmdir "$deployment_lock" 2>/dev/null || true
  fi
  rm -rf "$test_dir"
}
trap cleanup_test EXIT

fail() {
  echo "deploy-protocol wrapper test: $*" >&2
  exit 1
}

assert_contains() {
  if ! grep -F -- "$2" "$1" >/dev/null; then
    echo "deploy-protocol wrapper test: contents of $1:" >&2
    sed -n '1,160p' "$1" >&2
    fail "expected '$2' in $1"
  fi
}

assert_not_contains() {
  if grep -F -- "$2" "$1" >/dev/null; then
    fail "did not expect '$2' in $1"
  fi
}

assert_count() {
  local observed
  observed="$(grep -F -c -- "$2" "$1" || true)"
  [[ "$observed" == "$3" ]] || fail "expected $3 occurrences of '$2' in $1, got $observed"
}

assert_jq() {
  local file="$1"
  shift
  jq -e "$@" "$file" >/dev/null || fail "jq assertion failed for $file: $*"
}

run_expect_failure() {
  if "$@" >"$test_dir/stdout" 2>"$test_dir/stderr"; then
    fail "command unexpectedly succeeded: $*"
  fi
}

reset_project_state() {
  printf '0\n' >"$public_state"
  printf '0\n' >"$local_state"
  rm -f "$anvil_ready"
  : >"$mock_log"
  rm -rf "$contracts_dir/deployments/protocol" "$contracts_dir/broadcast"
  rm -f "$project_root/web/src/contracts.ts"
  cp "$reviewed_operational_state" "$operational_state"
  cp "$reviewed_payment_token_manifest" "$payment_token_manifest"
}

real_cast="$(command -v cast)"
export REAL_CAST="$real_cast"
export MOCK_LOG="$mock_log"
export MOCK_GIT_ROOT="$project_root"
export MOCK_CHAIN_ID=46630
export MOCK_DEPLOYER=0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027
export MOCK_PROTOCOL_OWNER=0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027
export MOCK_PUBLIC_STATE="$public_state"
export MOCK_LOCAL_STATE="$local_state"
export MOCK_ANVIL_READY="$anvil_ready"
export MOCK_MEDIA_RUNTIME=0x600a
export MOCK_RENDERER_RUNTIME=0x600b
export MOCK_PREVIEW_RUNTIME=0x600f
export MOCK_SECOND_RENDERER_RUNTIME=0x600e
export MOCK_RENDERER_SCHEMA=0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4
export MOCK_FACTORY_RUNTIME=0x600c
export MOCK_PAYMENT_TOKEN_RUNTIME=0x600d
export MOCK_CREATE2_RUNTIME=0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3
export MOCK_CREATE2_ADDRESS=0x4e59b44847b379578588920cA78FbF26c0B4956C
export MOCK_SAFE_ADDRESS=0xeAA4B38A99f766117C1D493a21012fec25f70505
export MOCK_TIER_DEPLOYER_ADDRESS=0x1111111111111111111111111111111111111111

create2_deployer=0x4e59b44847b379578588920cA78FbF26c0B4956C
media_salt="$($real_cast keccak 'Backed By Fans media store factory v4')"
renderer_salt="$($real_cast keccak 'Backed By Fans renderer v4')"
preview_salt="$($real_cast keccak 'Backed By Fans renderer preview harness v1')"
factory_salt="$($real_cast keccak 'Backed By Fans factory v6')"
export MOCK_MEDIA_ADDRESS="$($real_cast create2 --deployer "$create2_deployer" --salt "$media_salt" --init-code 0x6001)"
export MOCK_RENDERER_ADDRESS="$($real_cast create2 --deployer "$create2_deployer" --salt "$renderer_salt" --init-code 0x6002)"
export MOCK_PREVIEW_ADDRESS="$($real_cast create2 --deployer "$create2_deployer" --salt "$preview_salt" --init-code 0x6005)"
export MOCK_SECOND_RENDERER_ADDRESS=0x9999999999999999999999999999999999999999
export MOCK_TESTNET_USDG_ADDRESS=0x7E955252E15c84f5768B83c41a71F9eba181802F
export MOCK_TESTNET_AMD_ADDRESS=0x71178BAc73cBeb415514eB542a8995b82669778d
export MOCK_TESTNET_NFLX_ADDRESS=0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93
export MOCK_TESTNET_PLTR_ADDRESS=0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0
export MOCK_TESTNET_AMZN_ADDRESS=0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02
export MOCK_TESTNET_TSLA_ADDRESS=0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E
export MOCK_PAYMENT_TOKEN_ADDRESSES="$MOCK_TESTNET_USDG_ADDRESS $MOCK_TESTNET_AMD_ADDRESS $MOCK_TESTNET_NFLX_ADDRESS $MOCK_TESTNET_PLTR_ADDRESS $MOCK_TESTNET_AMZN_ADDRESS $MOCK_TESTNET_TSLA_ADDRESS"
payment_token_array="[$(printf '%s' "$MOCK_PAYMENT_TOKEN_ADDRESSES" | tr ' ' ',')]"
factory_constructor_args="$($real_cast abi-encode \
  'constructor(address[],address,address,address)' \
  "$payment_token_array" \
  "$MOCK_MEDIA_ADDRESS" \
  "$MOCK_SAFE_ADDRESS" \
  "$MOCK_SAFE_ADDRESS")"
mock_factory_init_code="0x6003${factory_constructor_args#0x}"
export MOCK_FACTORY_ADDRESS="$($real_cast create2 --deployer "$create2_deployer" --salt "$factory_salt" --init-code "$mock_factory_init_code")"
export MOCK_MEDIA_RUNTIME_HASH="$($real_cast keccak "$MOCK_MEDIA_RUNTIME")"
export MOCK_RENDERER_RUNTIME_HASH="$($real_cast keccak "$MOCK_RENDERER_RUNTIME")"
export MOCK_PREVIEW_RUNTIME_HASH="$($real_cast keccak "$MOCK_PREVIEW_RUNTIME")"
export MOCK_SECOND_RENDERER_RUNTIME_HASH="$($real_cast keccak "$MOCK_SECOND_RENDERER_RUNTIME")"
export MOCK_FACTORY_RUNTIME_HASH="$($real_cast keccak "$MOCK_FACTORY_RUNTIME")"
export MOCK_PAYMENT_TOKEN_RUNTIME_HASH="$($real_cast keccak "$MOCK_PAYMENT_TOKEN_RUNTIME")"

mkdir -p "$wrapper_dir" "$project_root/web/src" \
  "$contracts_dir/config/operational-state" "$contracts_dir/config/payment-tokens"
cp "$script_dir/deploy-protocol.sh" "$script_dir/public-chain-common.sh" "$wrapper_dir/"
cp "$script_dir/../config/operational-state/46630.json" "$operational_state"
cp "$script_dir/../config/payment-tokens/46630.json" "$payment_token_manifest"
jq --arg runtime "$MOCK_PAYMENT_TOKEN_RUNTIME_HASH" \
  '.releaseStatus = "validated" | .initialTokens[].runtimeCodehash = $runtime' \
  "$payment_token_manifest" >"${payment_token_manifest}.tmp"
mv "${payment_token_manifest}.tmp" "$payment_token_manifest"
jq \
  --arg implementation "$MOCK_RENDERER_ADDRESS" \
  --arg runtime_hash "$MOCK_RENDERER_RUNTIME_HASH" \
  --argjson payment_tokens "$(jq -c '.initialTokens | map({
    symbol,
    address,
    runtimeCodehash,
    implementation: null,
    implementationRuntimeCodehash: null
  })' "$payment_token_manifest")" \
  --arg media "$MOCK_MEDIA_ADDRESS" \
  --arg media_runtime "$MOCK_MEDIA_RUNTIME_HASH" \
  --arg preview "$MOCK_PREVIEW_ADDRESS" \
  --arg preview_runtime "$MOCK_PREVIEW_RUNTIME_HASH" \
  --arg factory "$MOCK_FACTORY_ADDRESS" \
  --arg factory_runtime "$MOCK_FACTORY_RUNTIME_HASH" \
  '.deployment.paymentTokens = $payment_tokens
   | .deployment.mediaStoreFactory = {address: $media, runtimeCodehash: $media_runtime}
   | .deployment.renderer = {address: $implementation, runtimeCodehash: $runtime_hash}
   | .deployment.previewHarness = {address: $preview, runtimeCodehash: $preview_runtime}
   | .deployment.membershipFactory = {address: $factory, runtimeCodehash: $factory_runtime}' \
  "$operational_state" >"${operational_state}.tmp"
mv "${operational_state}.tmp" "$operational_state"
cp "$operational_state" "$reviewed_operational_state"
cp "$payment_token_manifest" "$reviewed_payment_token_manifest"
deploy_wrapper="$wrapper_dir/deploy-protocol.sh"
export PATH="$mock_bin:$PATH"
export TMPDIR="$test_dir"
unset ROBINHOOD_TESTNET_RPC_URL ROBINHOOD_MAINNET_RPC_URL
unset ETH_PASSWORD PRIVATE_KEY ETH_PRIVATE_KEY CAST_PRIVATE_KEY MNEMONIC MNEMONIC_PATH

reset_project_state
canonical_project_root="$(cd "$project_root" && pwd -P)"
deployment_lock_key="$(printf '%s' "$canonical_project_root" | shasum -a 256 | awk '{print $1}')"
deployment_lock="/tmp/bbf-protocol-deployment-${deployment_lock_key}.lock"
mkdir "$deployment_lock"
printf 'pid=4242 action=broadcast network=mainnet\n' >"$deployment_lock/owner"
mkdir "$test_dir/alternate-tmp"
run_expect_failure env TMPDIR="$test_dir/alternate-tmp" "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "another protocol deployment operation holds the repo-wide lock"
assert_contains "$test_dir/stderr" "pid=4242"
[[ ! -s "$mock_log" ]] || fail "lock contention reached build or chain tools"
rm "$deployment_lock/owner"
rmdir "$deployment_lock"

reset_project_state
jq '.releaseStatus = "pending"' "$payment_token_manifest" \
  >"${payment_token_manifest}.tmp"
mv "${payment_token_manifest}.tmp" "$payment_token_manifest"
run_expect_failure "$deploy_wrapper" testnet dry-run
assert_contains "$test_dir/stderr" "payment-token manifest is not release-validated"
assert_not_contains "$mock_log" "cast send $create2_deployer"

reset_project_state
jq '.initialTokens[1].address = .initialTokens[0].address' "$payment_token_manifest" \
  >"${payment_token_manifest}.tmp"
mv "${payment_token_manifest}.tmp" "$payment_token_manifest"
run_expect_failure "$deploy_wrapper" testnet dry-run
assert_contains "$test_dir/stderr" "payment-token manifest is not release-validated"
assert_not_contains "$mock_log" "cast send $create2_deployer"

reset_project_state
"$deploy_wrapper" testnet dry-run
assert_contains "$mock_log" "FOUNDRY_PROFILE=robinhood forge clean"
assert_contains "$mock_log" "FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860"
assert_contains "$mock_log" "anvil --fork-url https://rpc.testnet.chain.robinhood.com --chain-id 46630"
assert_count "$mock_log" "cast send $create2_deployer --data <raw-create2-calldata> --rpc-url http://127.0.0.1:" 4
assert_count "$mock_log" "--nonce" 4
assert_not_contains "$mock_log" "cast send $create2_deployer --data <raw-create2-calldata> --rpc-url https://rpc.testnet.chain.robinhood.com"
assert_not_contains "$mock_log" "cast mktx $create2_deployer"
assert_not_contains "$mock_log" "cast publish <signed-transaction>"
assert_contains "$mock_log" "--from 0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027 --unlocked"
assert_not_contains "$mock_log" "cast wallet address"
assert_not_contains "$mock_log" ":DeployProtocol --rpc-url"
[[ "$(cat "$public_state")" == "0" ]] || fail "dry-run changed public prefix"
[[ "$(cat "$local_state")" == "4" ]] || fail "dry-run did not deploy all components on Anvil"
[[ ! -e "$contracts_dir/deployments/protocol/46630/candidate.json" ]] \
  || fail "dry-run wrote a public recovery journal"

reset_project_state
env MOCK_PREEXISTING_PREVIEW_HARNESS=1 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
assert_count "$mock_log" "cast send $create2_deployer --data <raw-create2-calldata> --rpc-url http://127.0.0.1:" 3
assert_count "$mock_log" "cast mktx $create2_deployer <raw-create2-calldata> --rpc-url https://rpc.testnet.chain.robinhood.com" 3
assert_count "$mock_log" "cast publish <signed-transaction> --rpc-url https://rpc.testnet.chain.robinhood.com --async" 3
[[ "$(cat "$public_state")" == "3" ]] \
  || fail "broadcast did not deploy the three missing public components"
assert_jq "$candidate" \
  '[.components[].status] == ["deployed", "deployed", "validated-existing", "deployed"]'
assert_jq "$candidate" '.status == "promoted" and .currentPrefix == 4'
[[ -f "$active" ]] || fail "sparse existing-component broadcast was not promoted"

reset_project_state
run_expect_failure env MOCK_FACTORY_BYTECODE_BYTES=94617 "$deploy_wrapper" testnet dry-run
assert_contains "$test_dir/stderr" \
  "membership factory raw CREATE2 transaction data is 95001 bytes; Robinhood Nitro sequencer limit is 95000"
assert_not_contains "$mock_log" "cast send $create2_deployer"

reset_project_state
mkdir -p "$contracts_dir/broadcast/DeployDirectProtocol.s.sol/4663"
printf '{"transactions":[]}\n' \
  >"$contracts_dir/broadcast/DeployDirectProtocol.s.sol/4663/run-latest.json"
env MOCK_BUN_REQUIRE_PRESERVED_BROADCASTS=1 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
assert_contains "$mock_log" "cast wallet address --account backed-by-fans-testnet"
assert_count "$mock_log" "cast send $create2_deployer --data <raw-create2-calldata> --rpc-url http://127.0.0.1:" 4
assert_count "$mock_log" "cast mktx $create2_deployer <raw-create2-calldata> --rpc-url https://rpc.testnet.chain.robinhood.com" 4
assert_count "$mock_log" "cast publish <signed-transaction> --rpc-url https://rpc.testnet.chain.robinhood.com --async" 4
assert_count "$mock_log" "--nonce" 8
assert_count "$mock_log" "forge verify-contract --watch --chain 46630" 4
assert_contains "$mock_log" \
  "--constructor-args $factory_constructor_args $MOCK_FACTORY_ADDRESS src/MembershipFactory.sol:MembershipFactory"
assert_contains "$mock_log" "bun x wagmi generate"
assert_contains "$mock_log" "bun x prettier --write"
assert_not_contains "$mock_log" "--password"
assert_not_contains "$mock_log" "--password-file"
assert_not_contains "$mock_log" "--private-key"
assert_not_contains "$mock_log" "forge script script/DeployDirectProtocol.s.sol:DeployProtocol"
[[ "$(cat "$public_state")" == "4" ]] || fail "broadcast did not deploy the public prefix"
[[ -f "$candidate" ]] || fail "broadcast did not persist its recovery journal"
[[ -f "$active" ]] || fail "broadcast did not promote its active Foundry record"
assert_jq "$candidate" '.status == "promoted" and .currentPrefix == 4'
assert_jq "$candidate" '[.components[].status] == ["deployed", "deployed", "deployed", "deployed"]'
assert_jq "$candidate" '[.components[].sourceVerified] == [true, true, true, true]'
assert_jq "$active" '.chain == 46630 and (.transactions | length) == 4'
assert_jq "$active" '[.transactions[].transactionType] == ["CALL", "CALL", "CALL", "CALL"]'
assert_jq "$active" '[.transactions[].additionalContracts[0].contractName] == ["OnchainMediaStoreFactory", "OnchainMetadataRenderer", "RendererPreviewHarness", "MembershipFactory"]'
assert_jq "$active" '.deploymentPlan.components[0].allowedPredecessor == "empty" and .deploymentPlan.components[3].allowedPredecessor == "renderer preview harness"'
assert_jq "$active" '
  .commit == "1111111111111111111111111111111111111111"
  and .deploymentPlan.schemaVersion == 5
  and (.deploymentPlan.paymentTokens | map(.address | ascii_downcase)) == [
    "0x7e955252e15c84f5768b83c41a71f9eba181802f",
    "0x71178bac73cbeb415514eb542a8995b82669778d",
    "0x3b8262a63d25f0477c4dde23f83cfe22cb768c93",
    "0x1fbe1a0e43594b3455993b5de5fd0a7a266298d0",
    "0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02",
    "0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e"
  ]
  and .deploymentPlan.sourceCommit == .commit
  and .deploymentPlan.operationalStateBlob == "2222222222222222222222222222222222222222"'
assert_not_contains "$mock_log" "TestnetUSDG"
assert_jq "$candidate" '.buildConfigHash | test("^0x[0-9a-f]{64}$")'
assert_jq "$candidate" '.forgeVersion == "forge Version: 1.7.1" and .solcVersion == "0.8.36" and .buildConfig.optimizer_runs == 200'

: >"$mock_log"
env \
  MOCK_GIT_HEAD=3333333333333333333333333333333333333333 \
  MOCK_MEDIA_BYTECODE=0x6011 \
  "$deploy_wrapper" testnet status >"$test_dir/stdout" 2>"$test_dir/stderr"
assert_contains "$test_dir/stderr" "status is validating promoted addresses and runtimes"
assert_contains "$mock_log" "cast code $MOCK_MEDIA_ADDRESS --rpc-url"

# A promoted journal is complete relative to the plan it recorded. Preserve the
# schema-v4 payment-token field and valid three-component shape used by a
# preceding release so a later schema/component expansion cannot strand it.
previous_timestamped=""
for historical_active in "$(dirname "$active")"/run-[0-9]*.json; do
  if cmp -s "$active" "$historical_active"; then
    previous_timestamped="$historical_active"
    break
  fi
done
[[ -n "$previous_timestamped" ]] \
  || fail "initial active broadcast has no timestamped history record"
jq \
  --arg token "$MOCK_TESTNET_USDG_ADDRESS" \
  --arg runtime "$MOCK_PAYMENT_TOKEN_RUNTIME_HASH" \
  '.schemaVersion = 4
   | .paymentToken = {address: $token, runtimeCodeHash: $runtime}
   | del(.paymentTokenManifest, .paymentTokenManifestBlob, .paymentTokens)
   | .components = .components[:3]
   | .currentPrefix = 3' \
  "$candidate" >"${candidate}.tmp"
mv "${candidate}.tmp" "$candidate"
jq \
  --arg token "$MOCK_TESTNET_USDG_ADDRESS" \
  --arg runtime "$MOCK_PAYMENT_TOKEN_RUNTIME_HASH" \
  '.transactions = .transactions[:3]
   | .deploymentPlan.schemaVersion = 4
   | .deploymentPlan.paymentToken = {address: $token, runtimeCodeHash: $runtime}
   | del(
       .deploymentPlan.paymentTokenManifest,
       .deploymentPlan.paymentTokenManifestBlob,
       .deploymentPlan.paymentTokens
     )
   | .deploymentPlan.components = .deploymentPlan.components[:3]' \
  "$active" >"${active}.tmp"
mv "${active}.tmp" "$active"
cp "$active" "$previous_timestamped"

previous_active="$test_dir/previous-active.json"
cp "$active" "$previous_active"
: >"$mock_log"
env \
  MOCK_GIT_HEAD=3333333333333333333333333333333333333333 \
  MOCK_OPERATIONAL_BLOB=3333333333333333333333333333333333333333 \
  "$deploy_wrapper" testnet broadcast
promoted_archive="$contracts_dir/deployments/protocol/46630/candidate-111111111111-promoted.json"
[[ -f "$promoted_archive" ]] || fail "superseded promoted journal was not archived"
assert_jq "$promoted_archive" \
  '.status == "promoted"
   and .schemaVersion == 4
   and .paymentToken.address == "0x7E955252E15c84f5768B83c41a71F9eba181802F"
   and .sourceCommit == "1111111111111111111111111111111111111111"
   and .currentPrefix == 3
   and (.components | length) == 3'
assert_jq "$candidate" \
  '.status == "promoted" and .sourceCommit == "3333333333333333333333333333333333333333"'
assert_jq "$active" \
  '.commit == "3333333333333333333333333333333333333333"'
assert_count "$mock_log" "cast publish <signed-transaction>" 0
previous_active_preserved=0
for historical_active in "$(dirname "$active")"/run-[0-9]*.json; do
  if cmp -s "$previous_active" "$historical_active"; then
    previous_active_preserved=1
    break
  fi
done
[[ "$previous_active_preserved" == "1" ]] \
  || fail "superseded active broadcast lost its timestamped history record"

reviewed_owner=0x3333333333333333333333333333333333333333
jq \
  --arg owner "$reviewed_owner" \
  '.safe.owners = [$owner] | .factory.owner = $owner' \
  "$operational_state" >"${operational_state}.tmp"
mv "${operational_state}.tmp" "$operational_state"
: >"$mock_log"
env \
  MOCK_GIT_HEAD=4444444444444444444444444444444444444444 \
  MOCK_OPERATIONAL_BLOB=5555555555555555555555555555555555555555 \
  MOCK_SAFE_OWNERS_JSON="[[\"$reviewed_owner\"]]" \
  MOCK_FACTORY_OWNER="$reviewed_owner" \
  "$deploy_wrapper" testnet status
assert_contains "$mock_log" "cast code $MOCK_FACTORY_ADDRESS --rpc-url"

jq \
  '.deployment.mediaStoreFactory.address = "0x6666666666666666666666666666666666666666"' \
  "$operational_state" >"${operational_state}.tmp"
mv "${operational_state}.tmp" "$operational_state"
: >"$mock_log"
run_expect_failure env \
  MOCK_GIT_HEAD=7777777777777777777777777777777777777777 \
  MOCK_OPERATIONAL_BLOB=8888888888888888888888888888888888888888 \
  "$deploy_wrapper" testnet status
assert_contains "$test_dir/stderr" "reviewed media store factory"
assert_not_contains "$mock_log" "cast code 0x6666666666666666666666666666666666666666"

reset_project_state
run_expect_failure env MOCK_GIT_DIRTY=1 "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "requires a clean committed checkout"
[[ ! -s "$mock_log" ]] || fail "dirty source reached public deployment tools"

reset_project_state
run_expect_failure env FOUNDRY_OPTIMIZER_RUNS=999 "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "unset FOUNDRY_OPTIMIZER_RUNS"
[[ ! -s "$mock_log" ]] || fail "Foundry environment override reached public deployment tools"

reset_project_state
run_expect_failure env MOCK_FORGE_CONFIG_OVERRIDE=1 "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "differs from the reviewed release profile"
assert_not_contains "$mock_log" "cast send"
assert_not_contains "$mock_log" "cast wallet address"

reset_project_state
run_expect_failure env MOCK_FORGE_VERSION="forge Version: 1.6.0" "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "Forge 1.7.1 is required"
assert_not_contains "$mock_log" "cast chain-id"
assert_not_contains "$mock_log" "cast send"

reset_project_state
run_expect_failure env MOCK_CAST_FAIL_PUBLIC_AT=2 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
[[ "$(cat "$public_state")" == "1" ]] || fail "failed broadcast did not preserve the deployed prefix"
[[ -f "$candidate" ]] || fail "failed broadcast did not preserve recovery evidence"
[[ ! -f "$active" ]] || fail "partial deployment became an active broadcast"
assert_jq "$candidate" '.currentPrefix == 1 and .components[0].status == "deployed" and .components[1].status == "pending"'

: >"$mock_log"
run_expect_failure env \
  MOCK_GIT_HEAD=3333333333333333333333333333333333333333 \
  "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" \
  "unfinished recovery journal belongs to source commit 1111111111111111111111111111111111111111"
assert_not_contains "$mock_log" "cast wallet address"
assert_not_contains "$mock_log" "cast publish <signed-transaction>"
assert_jq "$candidate" \
  '.currentPrefix == 1 and .components[0].status == "deployed" and .components[1].status == "pending"'

: >"$mock_log"
run_expect_failure env MOCK_GIT_DIRTY_WEB=1 "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "tracked source inputs differ from recovery commit"
[[ ! -s "$mock_log" ]] || fail "dirty web generator input reached recovery tools"

: >"$mock_log"
run_expect_failure env MOCK_GIT_UNTRACKED_WEB=1 "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "untracked source input web/scripts/untracked-generator.ts"
[[ ! -s "$mock_log" ]] || fail "untracked web generator input reached recovery tools"

: >"$mock_log"
run_expect_failure env MOCK_GIT_DIRTY_MAINNET_BROADCAST=1 \
  "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "tracked source inputs differ from recovery commit"
[[ ! -s "$mock_log" ]] || fail "dirty mainnet broadcast input reached testnet recovery tools"
[[ ! -f "$active" ]] || fail "dirty mainnet broadcast input became a testnet active pointer"
[[ ! -f "$project_root/web/src/contracts.ts" ]] \
  || fail "dirty mainnet broadcast input changed web bindings"

: >"$mock_log"
run_expect_failure env MOCK_GIT_UNTRACKED_MAINNET_BROADCAST=1 \
  "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" \
  "untracked source input contracts/broadcast/DeployDirectProtocol.s.sol/4663/run-latest.json"
[[ ! -s "$mock_log" ]] || fail "untracked mainnet broadcast input reached testnet recovery tools"
[[ ! -f "$active" ]] || fail "untracked mainnet broadcast input became a testnet active pointer"
[[ ! -f "$project_root/web/src/contracts.ts" ]] \
  || fail "untracked mainnet broadcast input changed web bindings"

: >"$mock_log"
"$deploy_wrapper" testnet broadcast
assert_count "$mock_log" "cast publish <signed-transaction> --rpc-url https://rpc.testnet.chain.robinhood.com --async" 3
[[ "$(cat "$public_state")" == "4" ]] || fail "prefix resume did not finish deployment"
assert_jq "$candidate" '[.components[].status] == ["deployed", "deployed", "deployed", "deployed"]'
[[ -f "$active" ]] || fail "resumed deployment did not promote its active record"

reset_project_state
run_expect_failure env MOCK_CAST_FAIL_PUBLIC_RECEIPT_AT=1 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
[[ "$(cat "$public_state")" == "1" ]] || fail "receipt failure did not preserve the mined prefix"
[[ -f "$candidate" ]] || fail "receipt failure did not preserve the recovery journal"
[[ ! -f "$active" ]] || fail "unreconciled submission became an active broadcast"
assert_jq "$candidate" '.currentPrefix == 0 and .components[0].status == "submitted" and (.components[0].transactionHash | type) == "string" and .components[0].receipt == null'

: >"$mock_log"
env MOCK_CAST_FAIL_PUBLIC_RECEIPT_AT=1 "$deploy_wrapper" testnet broadcast
assert_count "$mock_log" "cast publish <signed-transaction> --rpc-url https://rpc.testnet.chain.robinhood.com --async" 3
first_public_hash="$($real_cast keccak "$(printf '0x%064x' 1001)")"
assert_not_contains "$mock_log" "cast receipt $first_public_hash"
[[ "$(cat "$public_state")" == "4" ]] || fail "submitted-hash recovery did not finish deployment"
assert_jq "$candidate" '[.components[].status] == ["validated-existing", "deployed", "deployed", "deployed"]'
[[ -f "$active" ]] || fail "submitted-hash recovery did not promote its active record"

reset_project_state
pending_nonce_state="$test_dir/public-pending-nonce"
printf '0\n' >"$pending_nonce_state"
run_expect_failure env \
  MOCK_PENDING_NONCE_STATE="$pending_nonce_state" \
  MOCK_CAST_TERMINATE_AFTER_PUBLIC_AT=1 \
  "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
interrupted_hash="$($real_cast keccak "$(printf '0x%064x' 1001)")"
[[ "$(cat "$public_state")" == "0" ]] || fail "publish interruption incorrectly mined the transaction"
[[ "$(cat "$pending_nonce_state")" == "1" ]] || fail "publish interruption did not reserve the submitted nonce"
[[ ! -f "$active" ]] || fail "publish interruption became an active broadcast"
[[ ! -d "$deployment_lock" ]] || fail "publish interruption left the deployment lock behind"
assert_jq "$candidate" \
  --arg hash "$interrupted_hash" \
  '.components[0].status == "submitted"
   and .components[0].transactionHash == $hash
   and .components[0].submittedNonce == 0'

: >"$mock_log"
run_expect_failure env \
  MOCK_PENDING_NONCE_STATE="$pending_nonce_state" \
  MOCK_CAST_PENDING_TRANSACTION_HASH="$interrupted_hash" \
  "$deploy_wrapper" testnet broadcast
assert_contains "$test_dir/stderr" "$interrupted_hash"
assert_contains "$test_dir/stderr" "recover-dropped"
assert_count "$mock_log" "cast mktx $create2_deployer" 0
assert_count "$mock_log" "cast publish <signed-transaction>" 0
assert_jq "$candidate" \
  --arg hash "$interrupted_hash" \
  '.components[0].status == "submitted"
   and .components[0].transactionHash == $hash
   and .components[0].submittedNonce == 0'

reset_project_state
run_expect_failure env MOCK_CAST_DROP_PUBLIC_AT=1 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
dropped_hash="$($real_cast keccak "$(printf '0x%064x' 1001)")"
[[ "$(cat "$public_state")" == "0" ]] || fail "dropped submission advanced the public prefix"
assert_jq "$candidate" '.components[0].status == "submitted" and .components[0].submittedNonce == 0'
[[ ! -f "$active" ]] || fail "dropped submission became an active broadcast"

: >"$mock_log"
env \
  RECOVER_DROPPED_TRANSACTION_HASH="$dropped_hash" \
  MOCK_CAST_DROPPED_TRANSACTION_HASH="$dropped_hash" \
  "$deploy_wrapper" testnet recover-dropped
assert_count "$mock_log" "cast publish <signed-transaction> --rpc-url https://rpc.testnet.chain.robinhood.com --async" 0
assert_contains "$mock_log" "cast wallet address --account backed-by-fans-testnet"
assert_jq "$candidate" '.components[0].status == "pending" and .components[0].transactionHash == null and .components[0].recoveryHistory[0].evidence == "dropped"'

: >"$mock_log"
"$deploy_wrapper" testnet broadcast
assert_count "$mock_log" "cast publish <signed-transaction> --rpc-url https://rpc.testnet.chain.robinhood.com --async" 4
[[ "$(cat "$public_state")" == "4" ]] || fail "fresh authorization did not resubmit the recovered prefix"
[[ -f "$active" ]] || fail "recovered deployment did not promote its active record"

reset_project_state
run_expect_failure env MOCK_CAST_DROP_PUBLIC_AT=1 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
env \
  RECOVER_DROPPED_TRANSACTION_HASH="$dropped_hash" \
  MOCK_CAST_DROPPED_TRANSACTION_HASH="$dropped_hash" \
  MOCK_LATEST_NONCE=1 \
  MOCK_PENDING_NONCE=1 \
  "$deploy_wrapper" testnet recover-dropped
assert_jq "$candidate" '.components[0].status == "pending" and .components[0].recoveryHistory[0].evidence == "nonce-consumed"'

reset_project_state
run_expect_failure env MOCK_CAST_REVERT_PUBLIC_AT=1 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
env \
  RECOVER_DROPPED_TRANSACTION_HASH="$dropped_hash" \
  MOCK_CAST_REVERTED_TRANSACTION_HASH="$dropped_hash" \
  MOCK_LATEST_NONCE=1 \
  MOCK_PENDING_NONCE=1 \
  "$deploy_wrapper" testnet recover-dropped
assert_jq "$candidate" '.components[0].status == "pending" and .components[0].recoveryHistory[0].evidence == "confirmed-revert"'

reset_project_state
printf 'export const existingBindings = true;\n' >"$project_root/web/src/contracts.ts"
run_expect_failure env MOCK_BUN_FAIL=1 "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
[[ "$(cat "$public_state")" == "4" ]] || fail "binding failure lost the deployed public prefix"
[[ ! -f "$active" ]] || fail "binding failure left an active deployment pointer"
assert_contains "$project_root/web/src/contracts.ts" "existingBindings"
assert_jq "$candidate" '.status == "source-verified" and (has("activeBroadcast") | not)'
assert_contains "$test_dir/stderr" "failed before active deployment promotion"

reset_project_state
toctou_mock_bin="$test_dir/toctou-mock-bin"
toctou_marker="$test_dir/toctou-source-dirty"
toctou_broadcast_dir="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630"
toctou_timestamped="$toctou_broadcast_dir/run-123.json"
toctou_timestamped_expected="$test_dir/toctou-timestamped-expected.json"
toctou_bindings_expected="$test_dir/toctou-bindings-expected.ts"
mkdir -p "$toctou_mock_bin" "$toctou_broadcast_dir"
ln -s "$script_dir/test-deploy-protocol.sh" "$toctou_mock_bin/git"
ln -s "$script_dir/test-deploy-protocol.sh" "$toctou_mock_bin/bun"
printf '{"sentinel":"existing timestamped record"}\n' >"$toctou_timestamped"
printf 'export const existingBindings = "unchanged";\n' >"$project_root/web/src/contracts.ts"
cp "$toctou_timestamped" "$toctou_timestamped_expected"
cp "$project_root/web/src/contracts.ts" "$toctou_bindings_expected"
run_expect_failure env \
  PATH="$toctou_mock_bin:$PATH" \
  BBF_DEPLOY_TEST_TOCTOU_MARKER="$toctou_marker" \
  BBF_DEPLOY_TEST_BASE_MOCK_BIN="$mock_bin" \
  "$deploy_wrapper" testnet broadcast
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$toctou_broadcast_dir/run-latest.json"
[[ -f "$toctou_marker" ]] || fail "TOCTOU fixture did not dirty the tracked web input"
[[ "$(cat "$public_state")" == "4" ]] || fail "TOCTOU fixture did not reach staged promotion"
cmp -s "$toctou_timestamped_expected" "$toctou_timestamped" \
  || fail "TOCTOU failure changed the existing timestamped record"
[[ "$(find "$toctou_broadcast_dir" -maxdepth 1 -type f -name 'run-[0-9]*.json' | wc -l | tr -d ' ')" == "1" ]] \
  || fail "TOCTOU failure published a new timestamped record"
cmp -s "$toctou_bindings_expected" "$project_root/web/src/contracts.ts" \
  || fail "TOCTOU failure changed web/src/contracts.ts"
[[ ! -f "$active" ]] || fail "TOCTOU failure published the active deployment pointer"
assert_jq "$candidate" '.status == "source-verified" and (has("activeBroadcast") | not)'
assert_contains "$test_dir/stderr" "tracked source inputs differ from recovery commit"
assert_contains "$test_dir/stderr" "tracked source changed during staged web binding generation"

reset_project_state
printf '4\n' >"$public_state"
"$deploy_wrapper" testnet resume-verify
candidate="$contracts_dir/deployments/protocol/46630/candidate.json"
active="$contracts_dir/broadcast/DeployDirectProtocol.s.sol/46630/run-latest.json"
assert_not_contains "$mock_log" "cast send"
assert_not_contains "$mock_log" "anvil --fork-url"
assert_not_contains "$mock_log" "cast wallet address"
assert_count "$mock_log" "forge verify-contract --watch --chain 46630" 4
assert_contains "$mock_log" "bun x wagmi generate"
assert_jq "$candidate" '[.components[].status] == ["validated-existing", "validated-existing", "validated-existing", "validated-existing"]'
assert_jq "$active" '[.transactions[].hash] == [null, null, null, null]'

reset_project_state
"$deploy_wrapper" testnet status
assert_contains "$mock_log" "cast chain-id --rpc-url"
assert_contains "$mock_log" "FOUNDRY_PROFILE=robinhood forge test --match-contract DeploymentScriptsTest"
assert_not_contains "$mock_log" "forge script"
assert_not_contains "$mock_log" "cast wallet address"
assert_not_contains "$mock_log" "cast send"
assert_not_contains "$mock_log" "anvil --fork-url"
assert_not_contains "$mock_log" "forge verify-contract"
assert_not_contains "$mock_log" "bun x wagmi generate"

reset_project_state
run_expect_failure env MOCK_MEDIA_BYTECODE=0x6011 "$deploy_wrapper" testnet status
assert_contains "$test_dir/stderr" "reviewed media store factory"
drifted_media_address="$($real_cast create2 --deployer "$create2_deployer" --salt "$media_salt" --init-code 0x6011)"
assert_contains "$mock_log" "cast chain-id --rpc-url"
assert_not_contains "$mock_log" "cast code $drifted_media_address --rpc-url"

reset_project_state
run_expect_failure env MOCK_GIT_DIRTY_OPERATIONAL=1 "$deploy_wrapper" testnet status
assert_contains "$test_dir/stderr" "reviewed operational state has uncommitted changes"
[[ ! -s "$mock_log" ]] || fail "dirty operational state reached chain or build tools"

reset_project_state
run_expect_failure env MOCK_GIT_DIRTY=1 "$deploy_wrapper" testnet status
assert_contains "$test_dir/stderr" "requires a clean committed checkout"
[[ ! -s "$mock_log" ]] || fail "dirty source reached authoritative status tools"

reset_project_state
printf '4\n' >"$public_state"
reviewed_owner=0x3333333333333333333333333333333333333333
reviewed_fee_recipient=0x4444444444444444444444444444444444444444
jq \
  --arg owner "$reviewed_owner" \
  --arg fee_recipient "$reviewed_fee_recipient" \
  '.safe.owners = [$owner]
   | .factory.owner = $owner
   | .factory.feeRecipient = $fee_recipient' \
  "$operational_state" >"${operational_state}.tmp"
mv "${operational_state}.tmp" "$operational_state"
env \
  MOCK_SAFE_OWNERS_JSON="[[\"$reviewed_owner\"]]" \
  MOCK_FACTORY_OWNER="$reviewed_owner" \
  MOCK_FACTORY_FEE_RECIPIENT="$reviewed_fee_recipient" \
  "$deploy_wrapper" testnet status
assert_not_contains "$mock_log" "rendererRecord(uint32)"

: >"$mock_log"
run_expect_failure env ETH_PASSWORD=plaintext "$deploy_wrapper" testnet status
assert_contains "$test_dir/stderr" "unset ETH_PASSWORD"
[[ ! -s "$mock_log" ]] || fail "plaintext signer input reached external tools"

: >"$mock_log"
run_expect_failure env FOUNDRY_BROADCAST="$test_dir/temporary-broadcast" \
  "$deploy_wrapper" testnet dry-run
[[ ! -s "$mock_log" ]] || fail "temporary broadcast override invoked external tools"

: >"$mock_log"
run_expect_failure env MOCK_CHAIN_ID=4663 "$deploy_wrapper" testnet status
assert_not_contains "$mock_log" "cast wallet address"
assert_not_contains "$mock_log" "cast send"

: >"$mock_log"
run_expect_failure "$deploy_wrapper" mainnet dry-run
[[ ! -s "$mock_log" ]] || fail "mainnet confirmation failure invoked external tools"

: >"$mock_log"
run_expect_failure env CONFIRM_MAINNET_DEPLOYMENT=4662 \
  "$deploy_wrapper" mainnet broadcast
[[ ! -s "$mock_log" ]] || fail "wrong mainnet confirmation invoked external tools"

reset_project_state
run_expect_failure env MOCK_DEPLOYER=0x0000000000000000000000000000000000000001 \
  "$deploy_wrapper" testnet broadcast
assert_contains "$mock_log" "anvil --fork-url"
assert_not_contains "$mock_log" "cast mktx $create2_deployer"
assert_not_contains "$mock_log" "cast publish <signed-transaction>"
[[ "$(cat "$public_state")" == "0" ]] || fail "wrong account changed public prefix"

echo "deploy-protocol wrapper tests: passed"
