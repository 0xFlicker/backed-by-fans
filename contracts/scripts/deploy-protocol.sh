#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"

readonly BBF_ROBINHOOD_RUNTIME_LIMIT=98304
readonly BBF_ROBINHOOD_INITCODE_LIMIT=196608
readonly BBF_NITRO_SEQUENCER_TX_DATA_LIMIT=95000
readonly BBF_ROBINHOOD_GAS_LIMIT=100000000
readonly BBF_MAINNET_USDG="0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
readonly BBF_INITIAL_PROTOCOL_AUTHORITY="0xeAA4B38A99f766117C1D493a21012fec25f70505"
readonly BBF_CREATE2_DEPLOYER_CODE_HASH="0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989"
readonly BBF_MAINNET_USDG_PROXY_RUNTIME_HASH="0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6"
readonly BBF_RENDERER_SCHEMA="0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4"
readonly BBF_ERC8056_CORE_INTERFACE="0xa60bf13d"
readonly BBF_ERC8056_PENDING_INTERFACE="0x4bd27648"
readonly BBF_EIP1967_IMPLEMENTATION_SLOT="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
readonly BBF_SAFE_FALLBACK_HANDLER_SLOT="0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5"
readonly BBF_SAFE_GUARD_SLOT="0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8"
readonly BBF_SENTINEL_MODULES="0x0000000000000000000000000000000000000001"

component_labels=("media store factory" "renderer" "renderer preview harness" "membership factory")
component_contracts=(
  "OnchainMediaStoreFactory"
  "OnchainMetadataRenderer"
  "RendererPreviewHarness"
  "MembershipFactory"
)
component_artifacts=(
  "src/media/OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory"
  "src/OnchainMetadataRenderer.sol:OnchainMetadataRenderer"
  "src/RendererPreviewHarness.sol:RendererPreviewHarness"
  "src/MembershipFactory.sol:MembershipFactory"
)
component_salt_preimages=(
  "Backed By Fans media store factory v4"
  "Backed By Fans renderer v4"
  "Backed By Fans renderer preview harness v1"
  "Backed By Fans factory v6"
)
component_predecessors=("empty" "media store factory" "renderer" "renderer preview harness")
component_salts=()
component_init_codes=()
component_init_hashes=()
component_runtime_hashes=()
component_addresses=()
component_present=()
deployment_prefix_count=0
payment_token_manifest=""
payment_token_manifest_relative=""
payment_token_manifest_blob=""
payment_token_addresses=()
payment_token_symbols=()
payment_token_decimals=()
payment_token_scaled=()
payment_token_runtime_hashes=()
payment_tokens_json="[]"
factory_constructor_args=""
source_commit=""
build_config_json=""
build_config_hash=""
forge_version=""
configured_solc_version=""
repo_root=""
operational_state_file=""
operational_state_relative=""
operational_state_blob=""
deployment_lock_directory=""

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-protocol.sh <testnet|mainnet> [dry-run|broadcast|status|resume-verify|recover-dropped]

Deploys Backed By Fans deterministically through the canonical CREATE2 deployer.

  dry-run       Build the exact Robinhood artifacts and deploy their raw CREATE2
                calldata on an exact-chain-id Anvil fork. This is the default.
  broadcast     Require the encrypted Foundry account, repeat the Anvil-fork
                preflight, then submit raw CREATE2 calls in protocol order.
  status        Validate the chain, deterministic plan, runtime hashes, and prefix.
  resume-verify Require a complete deployment, retry Blockscout source verification,
                promote the durable broadcast record, and regenerate web bindings.
  recover-dropped
                Prove one submitted transaction was dropped or reverted, then
                return only that component to pending. A later broadcast performs
                the fresh, separately authorized submission.

Optional overrides:
  ACCOUNT                 Encrypted Foundry keystore account name for broadcast
  BBF_ANVIL_PORT          Port for the local fork (random high port by default)
  RECOVER_DROPPED_TRANSACTION_HASH
                          Exact journaled hash authorized for recover-dropped

The keystore password is read only by Cast's terminal prompt. Password arguments,
password files, private keys, mnemonics, and password environment variables are
not accepted. Every mainnet action also requires CONFIRM_MAINNET_DEPLOYMENT=4663.
EOF
}

fail() {
  echo "Protocol deployment: $*" >&2
  exit 1
}

release_deployment_lock() {
  [[ -n "$deployment_lock_directory" ]] || return 0
  rm -f "$deployment_lock_directory/owner"
  rmdir "$deployment_lock_directory" 2>/dev/null || true
  deployment_lock_directory=""
}

acquire_deployment_lock() {
  local lock_key owner
  lock_key="$(printf '%s' "$repo_root" | shasum -a 256 | awk '{print $1}')"
  deployment_lock_directory="/tmp/bbf-protocol-deployment-${lock_key}.lock"
  if ! mkdir "$deployment_lock_directory" 2>/dev/null; then
    owner="$(cat "$deployment_lock_directory/owner" 2>/dev/null || printf 'owner details unavailable')"
    deployment_lock_directory=""
    fail "another protocol deployment operation holds the repo-wide lock ($owner); resolve that process or remove its stale lock explicitly"
  fi
  printf 'pid=%s action=%s network=%s started=%s\n' \
    "$$" "$action" "$network" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"$deployment_lock_directory/owner"
  trap release_deployment_lock EXIT
  trap 'release_deployment_lock; exit 130' INT
  trap 'release_deployment_lock; exit 143' TERM
}

lowercase() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

require_hex() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^0x[0-9a-fA-F]+$ || $(((${#value} - 2) % 2)) -ne 0 ]]; then
    fail "$label is not even-length hex"
  fi
}

reject_plaintext_signer_inputs() {
  local variable
  for variable in ETH_PASSWORD PRIVATE_KEY ETH_PRIVATE_KEY CAST_PRIVATE_KEY MNEMONIC MNEMONIC_PATH; do
    if [[ "${!variable+x}" == "x" ]]; then
      fail "unset $variable; public signing must use the encrypted keystore terminal prompt"
    fi
  done
}

resolve_source_commit() {
  if ! repo_root="$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null)"; then
    fail "deployment source is not a Git checkout"
  fi
  repo_root="$(cd "$repo_root" && pwd -P)"
  if ! source_commit="$(git -C "$repo_root" rev-parse --verify HEAD 2>/dev/null)"; then
    fail "deployment source is not a committed Git checkout"
  fi
  [[ "$source_commit" =~ ^[0-9a-fA-F]{40}$ ]] \
    || fail "deployment source commit is not a full Git SHA"
}

require_clean_initial_broadcast() {
  local changes
  if ! changes="$(git -C "$repo_root" status --porcelain --untracked-files=all)"; then
    fail "could not inspect deployment source status"
  fi
  [[ -z "$changes" ]] \
    || fail "public deployment requires a clean committed checkout; commit or remove every change first"
}

require_recorded_source_checkout() {
  local journal="$1"
  local recorded_commit untracked path
  if ! recorded_commit="$(jq -er '.sourceCommit' "$journal" 2>/dev/null)"; then
    fail "recovery journal $journal does not identify its source commit"
  fi
  [[ "$recorded_commit" == "$source_commit" ]] \
    || fail "recovery journal $journal belongs to source commit $recorded_commit, not $source_commit"
  git -C "$repo_root" diff --quiet "$recorded_commit" -- . \
    ":(exclude)contracts/deployments/protocol/$expected_chain_id/**" \
    ":(exclude)contracts/broadcast/DeployDirectProtocol.s.sol/$expected_chain_id/**" \
    ':(exclude)web/src/contracts.ts' \
    || fail "tracked source inputs differ from recovery commit $recorded_commit"

  if ! untracked="$(git -C "$repo_root" ls-files --others --exclude-standard -- .)"; then
    fail "could not inspect untracked recovery inputs"
  fi
  while IFS= read -r path; do
    [[ -z "$path" ]] && continue
    if [[ "$path" == "contracts/deployments/protocol/$expected_chain_id/"* \
      || "$path" == "contracts/broadcast/DeployDirectProtocol.s.sol/$expected_chain_id/"* ]]; then
      continue
    fi
    fail "untracked source input $path is not part of recovery commit $recorded_commit"
  done <<<"$untracked"
}

prepare_broadcast_journal_slot() {
  local journal="$1"
  local active="$2"
  local recorded_commit status archived active_commit active_plan journal_plan

  if [[ ! -f "$journal" ]]; then
    require_clean_initial_broadcast
    return
  fi

  recorded_commit="$(jq -er '.sourceCommit' "$journal" 2>/dev/null)" \
    || fail "recovery journal $journal does not identify its source commit"
  if [[ "$recorded_commit" == "$source_commit" ]]; then
    require_recorded_source_checkout "$journal"
    return
  fi

  require_clean_initial_broadcast
  status="$(jq -er '.status' "$journal" 2>/dev/null)" \
    || fail "recovery journal $journal has no valid status"
  if [[ "$status" != "promoted" ]]; then
    fail "unfinished recovery journal belongs to source commit $recorded_commit, not $source_commit"
  fi
  jq -e --arg active "$active" '
    (.components | length) > 0
    and .currentPrefix == (.components | length)
    and all(.components[];
      (.status == "deployed" or .status == "validated-existing")
      and .sourceVerified == true)
    and .activeBroadcast == $active
  ' "$journal" >/dev/null \
    || fail "promoted recovery journal $journal is incomplete and cannot be archived automatically"
  [[ -f "$active" ]] \
    || fail "promoted recovery journal $journal references missing active broadcast $active"
  active_commit="$(jq -er '.commit' "$active" 2>/dev/null)" \
    || fail "active broadcast $active does not identify its source commit"
  [[ "$active_commit" == "$recorded_commit" ]] \
    || fail "promoted recovery journal $journal and active broadcast $active disagree on source commit"
  active_plan="$(jq -S -c '.deploymentPlan // null' "$active")"
  journal_plan="$(journal_fingerprint "$journal")"
  [[ "$active_plan" == "$journal_plan" ]] \
    || fail "promoted recovery journal $journal and active broadcast $active describe different deployments"

  archived="${journal%.json}-${recorded_commit:0:12}-promoted.json"
  [[ ! -e "$archived" ]] \
    || fail "completed deployment archive already exists at $archived; preserve both records and resolve explicitly"
  mv "$journal" "$archived"
  echo "Protocol deployment: archived completed recovery journal at $archived"
}

reject_build_environment_overrides() {
  local variable
  while IFS='=' read -r variable _; do
    case "$variable" in
      FOUNDRY_* | DAPP_*)
        fail "unset $variable; public artifacts must use the committed Foundry configuration"
        ;;
    esac
  done < <(env)
}

validate_build_environment() {
  local config
  if ! config="$(FOUNDRY_PROFILE=robinhood forge config --json)"; then
    fail "could not resolve the Robinhood Foundry configuration"
  fi
  if ! printf '%s' "$config" | jq -e '
    .src == "src" and .test == "test" and .script == "script" and .out == "out"
    and .libs == ["lib"]
    and .remappings == [
      "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
      "forge-std/=lib/forge-std/src/"
    ]
    and .auto_detect_remappings == false
    and .solc == "0.8.36" and .auto_detect_solc == false
    and .evm_version == "cancun"
    and .optimizer == true and .optimizer_runs == 200 and .optimizer_details == null
    and .via_ir == false and .bytecode_hash == "ipfs" and .cbor_metadata == true
    and .use_literal_content == false and .revert_strings == null
    and .libraries == [] and .additional_compiler_profiles == []
    and .compilation_restrictions == [] and .dynamic_test_linking == false
    and .sparse_mode == false and .build_info == true
    and .always_use_create_2_factory == true
    and (.create2_deployer | ascii_downcase) == "0x4e59b44847b379578588920ca78fbf26c0b4956c"
    and .create2_library_salt == "0x0000000000000000000000000000000000000000000000000000000000000000"
    and .code_size_limit == 98304 and .gas_limit == 100000000
    and .block_gas_limit == 100000000
  ' >/dev/null; then
    fail "Robinhood Foundry configuration differs from the reviewed release profile"
  fi

  build_config_json="$(printf '%s' "$config" | jq -S -c '{
    src, test, script, out, libs, remappings, auto_detect_remappings,
    solc, auto_detect_solc, evm_version, optimizer, optimizer_runs,
    optimizer_details, via_ir, bytecode_hash, cbor_metadata,
    use_literal_content, revert_strings, libraries,
    additional_compiler_profiles, compilation_restrictions,
    dynamic_test_linking, sparse_mode, build_info,
    always_use_create_2_factory, create2_deployer, create2_library_salt,
    code_size_limit, gas_limit, block_gas_limit
  }')"
  build_config_hash="0x$(printf '%s' "$build_config_json" | shasum -a 256 | awk '{print $1}')"
  forge_version="$(forge --version | sed -n '1p')"
  [[ "$forge_version" == "forge Version: 1.7.1" ]] \
    || fail "Forge 1.7.1 is required for reviewed public artifacts; observed ${forge_version:-unknown}"
  configured_solc_version="$(printf '%s' "$config" | jq -er '.solc')"
}

load_payment_token_manifest() {
  payment_token_manifest_relative="config/payment-tokens/$expected_chain_id.json"
  payment_token_manifest="$project_dir/$payment_token_manifest_relative"
  [[ -f "$payment_token_manifest" ]] \
    || fail "payment-token manifest is missing at $payment_token_manifest"
  jq -e --argjson chain_id "$expected_chain_id" --argjson expected_count \
    "$([[ "$expected_chain_id" == "46630" ]] && printf 6 || printf 1)" '
      .schemaVersion == 1
      and .chainId == $chain_id
      and .releaseStatus == (if $chain_id == 46630 then "validated" else "inspection-only" end)
      and (.initialTokens | type == "array" and length == $expected_count)
      and ([.initialTokens[].address | ascii_downcase] | unique | length == $expected_count)
      and all(.initialTokens[];
        (.symbol | type == "string" and length > 0)
        and (.address | test("^0x[0-9a-fA-F]{40}$"))
        and (.expectedDecimals | type == "number" and . >= 0 and . <= 255)
        and (.requiresScaledUI | type == "boolean")
        and (.runtimeCodehash | test("^0x[0-9a-fA-F]{64}$")))
    ' "$payment_token_manifest" >/dev/null \
    || fail "payment-token manifest is not release-validated at $payment_token_manifest"

  payment_token_addresses=()
  while IFS= read -r value; do payment_token_addresses+=("$value"); done \
    < <(jq -er '.initialTokens[].address' "$payment_token_manifest")
  payment_token_symbols=()
  while IFS= read -r value; do payment_token_symbols+=("$value"); done \
    < <(jq -er '.initialTokens[].symbol' "$payment_token_manifest")
  payment_token_decimals=()
  while IFS= read -r value; do payment_token_decimals+=("$value"); done \
    < <(jq -er '.initialTokens[].expectedDecimals' "$payment_token_manifest")
  payment_token_scaled=()
  while IFS= read -r value; do payment_token_scaled+=("$value"); done \
    < <(jq -er '.initialTokens[].requiresScaledUI' "$payment_token_manifest")
  payment_token_runtime_hashes=()
  while IFS= read -r value; do payment_token_runtime_hashes+=("$value"); done \
    < <(jq -er '.initialTokens[].runtimeCodehash' "$payment_token_manifest")
  payment_tokens_json="$(jq -c '.initialTokens' "$payment_token_manifest")"
  payment_token_manifest_blob="$(git -C "$repo_root" hash-object "$payment_token_manifest")"
}

build_deployment_plan() {
  FOUNDRY_PROFILE=robinhood forge clean
  FOUNDRY_PROFILE=robinhood forge build --ignore-eip-3860
  load_payment_token_manifest

  local index artifact init_code runtime_code raw_create2_bytes
  local init_bytes runtime_bytes salt init_hash runtime_hash address
  for index in 0 1 2 3; do
    artifact="${component_artifacts[$index]}"
    init_code="$(FOUNDRY_PROFILE=robinhood forge inspect "$artifact" bytecode)"
    runtime_code="$(FOUNDRY_PROFILE=robinhood forge inspect "$artifact" deployedBytecode)"
    if [[ "$index" == "3" ]]; then
      local encoded_payment_tokens
      encoded_payment_tokens="[$(IFS=,; printf '%s' "${payment_token_addresses[*]}")]"
      factory_constructor_args="$(cast abi-encode \
        'constructor(address[],address,address,address)' \
        "$encoded_payment_tokens" \
        "${component_addresses[0]}" \
        "$BBF_INITIAL_PROTOCOL_AUTHORITY" \
        "$BBF_INITIAL_PROTOCOL_AUTHORITY")"
      require_hex "membership factory constructor arguments" "$factory_constructor_args"
      init_code="${init_code}${factory_constructor_args#0x}"
    fi
    require_hex "${component_labels[$index]} initcode" "$init_code"
    require_hex "${component_labels[$index]} runtime" "$runtime_code"

    init_bytes=$(((${#init_code} - 2) / 2))
    runtime_bytes=$(((${#runtime_code} - 2) / 2))
    raw_create2_bytes=$((32 + init_bytes))
    if ((init_bytes > BBF_ROBINHOOD_INITCODE_LIMIT)); then
      fail "${component_labels[$index]} initcode is $init_bytes bytes; Robinhood limit is $BBF_ROBINHOOD_INITCODE_LIMIT"
    fi
    if ((raw_create2_bytes > BBF_NITRO_SEQUENCER_TX_DATA_LIMIT)); then
      fail "${component_labels[$index]} raw CREATE2 transaction data is $raw_create2_bytes bytes; Robinhood Nitro sequencer limit is $BBF_NITRO_SEQUENCER_TX_DATA_LIMIT"
    fi
    if ((runtime_bytes > BBF_ROBINHOOD_RUNTIME_LIMIT)); then
      fail "${component_labels[$index]} runtime is $runtime_bytes bytes; Robinhood limit is $BBF_ROBINHOOD_RUNTIME_LIMIT"
    fi

    salt="$(cast keccak "${component_salt_preimages[$index]}")"
    init_hash="$(cast keccak "$init_code")"
    runtime_hash="$(cast keccak "$runtime_code")"
    address="$(cast create2 \
      --deployer "$BBF_CREATE2_DEPLOYER" \
      --salt "$salt" \
      --init-code-hash "$init_hash")"

    component_salts[$index]="$salt"
    component_init_codes[$index]="$init_code"
    component_init_hashes[$index]="$init_hash"
    component_runtime_hashes[$index]="$runtime_hash"
    component_addresses[$index]="$address"
  done
}

validate_plan_against_solidity() {
  local output factory_runtime_hash
  if ! output="$(BBF_RELEASE_CHAIN_ID="$expected_chain_id" \
    BBF_RELEASE_MEDIA_SALT="${component_salts[0]}" \
    BBF_RELEASE_RENDERER_SALT="${component_salts[1]}" \
    BBF_RELEASE_PREVIEW_HARNESS_SALT="${component_salts[2]}" \
    BBF_RELEASE_FACTORY_SALT="${component_salts[3]}" \
    BBF_RELEASE_MEDIA_INIT_HASH="${component_init_hashes[0]}" \
    BBF_RELEASE_RENDERER_INIT_HASH="${component_init_hashes[1]}" \
    BBF_RELEASE_PREVIEW_HARNESS_INIT_HASH="${component_init_hashes[2]}" \
    BBF_RELEASE_FACTORY_INIT_HASH="${component_init_hashes[3]}" \
    BBF_RELEASE_MEDIA_RUNTIME_HASH="${component_runtime_hashes[0]}" \
    BBF_RELEASE_RENDERER_RUNTIME_HASH="${component_runtime_hashes[1]}" \
    BBF_RELEASE_PREVIEW_HARNESS_RUNTIME_HASH="${component_runtime_hashes[2]}" \
    BBF_RELEASE_MEDIA_ADDRESS="${component_addresses[0]}" \
    BBF_RELEASE_RENDERER_ADDRESS="${component_addresses[1]}" \
    BBF_RELEASE_PREVIEW_HARNESS_ADDRESS="${component_addresses[2]}" \
    BBF_RELEASE_FACTORY_ADDRESS="${component_addresses[3]}" \
    FOUNDRY_PROFILE=robinhood forge test \
      --match-contract DeploymentScriptsTest \
      --match-test test_releaseWrapperPlanMatchesSolidityConfig \
      --code-size-limit 1000000 \
      --gas-limit 1000000000 \
      -vv 2>&1)"; then
    printf '%s\n' "$output" >&2
    fail "Solidity release-plan parity test failed"
  fi
  printf '%s\n' "$output"
  factory_runtime_hash="$(printf '%s\n' "$output" | awk \
    '/BBF_RELEASE_FACTORY_RUNTIME_HASH/ { print $NF; found = 1; exit } END { if (!found) exit 1 }')" \
    || fail "Solidity release-plan test did not report the factory runtime hash"
  require_hex "membership factory runtime hash" "$factory_runtime_hash"
  [[ ${#factory_runtime_hash} -eq 66 ]] || fail "membership factory runtime hash has the wrong length"
  component_runtime_hashes[3]="$factory_runtime_hash"
}

rpc_call_json() {
  local target_rpc="$1"
  local label="$2"
  local address="$3"
  local signature="$4"
  shift 4
  local output
  if ! output="$(cast call "$address" "$signature" "$@" \
    --rpc-url "$target_rpc" \
    --json 2>/dev/null)"; then
    fail "$label RPC call failed"
  fi
  printf '%s\n' "$output"
}

rpc_code() {
  local target_rpc="$1"
  local label="$2"
  local address="$3"
  local output
  if ! output="$(cast code "$address" --rpc-url "$target_rpc" 2>/dev/null)"; then
    fail "$label code query failed"
  fi
  printf '%s\n' "$output"
}

require_address_match() {
  local label="$1"
  local observed="$2"
  local expected="$3"
  if [[ "$(lowercase "$observed")" != "$(lowercase "$expected")" ]]; then
    fail "$label is $observed; expected $expected"
  fi
}

require_runtime_hash() {
  local target_rpc="$1"
  local label="$2"
  local address="$3"
  local expected_hash="$4"
  local code observed_hash
  code="$(rpc_code "$target_rpc" "$label" "$address")"
  if [[ "$code" == "0x" || "$code" == "0x0" || -z "$code" ]]; then
    fail "$label has no runtime at $address"
  fi
  observed_hash="$(cast keccak "$code")"
  if [[ "$(lowercase "$observed_hash")" != "$(lowercase "$expected_hash")" ]]; then
    fail "$label runtime hash is $observed_hash; expected $expected_hash"
  fi
}

validate_canonical_create2_deployer() {
  require_runtime_hash \
    "$1" \
    "canonical CREATE2 deployer" \
    "$BBF_CREATE2_DEPLOYER" \
    "$BBF_CREATE2_DEPLOYER_CODE_HASH"
}

validate_operational_state_manifest() {
  [[ -f "$operational_state_file" ]] \
    || fail "reviewed operational state is missing at $operational_state_file"
  jq -e --argjson chain_id "$expected_chain_id" '
    . as $state
    | .schemaVersion == 2 and .chainId == $chain_id
    and (.deployment.paymentTokens | type == "array"
      and length == (if $chain_id == 46630 then 6 else 1 end)
      and all(.[];
        (.symbol | type == "string" and length > 0)
        and (.address | test("^0x[0-9a-fA-F]{40}$"))
        and (.runtimeCodehash | test("^0x[0-9a-fA-F]{64}$"))))
    and all([
      .deployment.mediaStoreFactory,
      .deployment.renderer,
      .deployment.previewHarness,
      .deployment.membershipFactory
    ][];
      (.address | test("^0x[0-9a-fA-F]{40}$"))
      and (.runtimeCodehash | test("^0x[0-9a-fA-F]{64}$")))
    and (if $chain_id == 4663 then
      (.deployment.paymentTokens[0].implementation | test("^0x[0-9a-fA-F]{40}$"))
      and (.deployment.paymentTokens[0].implementationRuntimeCodehash
        | test("^0x[0-9a-fA-F]{64}$"))
    else
      all(.deployment.paymentTokens[];
        .implementation == null and .implementationRuntimeCodehash == null)
    end)
    and (.safe.address | test("^0x[0-9a-fA-F]{40}$"))
    and (.safe.singleton | test("^0x[0-9a-fA-F]{40}$"))
    and (.safe.version | type == "string" and length > 0 and length <= 32)
    and (.safe.owners | type == "array" and length > 0
      and all(.[]; test("^0x[0-9a-fA-F]{40}$")))
    and (.safe.threshold | type == "number" and . >= 1)
    and ($state.safe.threshold <= ($state.safe.owners | length))
    and (.safe.modules | type == "array"
      and all(.[]; test("^0x[0-9a-fA-F]{40}$")))
    and (.safe.guard | test("^0x[0-9a-fA-F]{40}$"))
    and (.safe.fallbackHandler | test("^0x[0-9a-fA-F]{40}$"))
    and (.factory.owner | test("^0x[0-9a-fA-F]{40}$"))
    and (.factory.pendingOwner | test("^0x[0-9a-fA-F]{40}$"))
    and (.factory.feeRecipient | test("^0x[0-9a-fA-F]{40}$"))
  ' "$operational_state_file" >/dev/null \
    || fail "reviewed operational state is malformed at $operational_state_file"

  local expected_safe
  expected_safe="$(jq -er '.safe.address' "$operational_state_file")"
  require_address_match "reviewed protocol Safe" \
    "$expected_safe" "$BBF_INITIAL_PROTOCOL_AUTHORITY"
}

validate_plan_against_operational_state() {
  local expected observed index key

  expected="$(jq -S -c '[.deployment.paymentTokens[] | {
    symbol,
    address: (.address | ascii_downcase),
    runtimeCodehash: (.runtimeCodehash | ascii_downcase)
  }]' "$operational_state_file")"
  observed="$(printf '%s' "$payment_tokens_json" | jq -S -c '[.[] | {
    symbol,
    address: (.address | ascii_downcase),
    runtimeCodehash: (.runtimeCodehash | ascii_downcase)
  }]')"
  [[ "$observed" == "$expected" ]] \
    || fail "payment-token manifest differs from reviewed operational state"

  local keys=(mediaStoreFactory renderer previewHarness membershipFactory)
  for index in 0 1 2 3; do
    key="${keys[$index]}"
    expected="$(jq -er --arg key "$key" '.deployment[$key].address' "$operational_state_file")"
    require_address_match "reviewed ${component_labels[$index]}" \
      "${component_addresses[$index]}" "$expected"
    expected="$(jq -er --arg key "$key" '.deployment[$key].runtimeCodehash' "$operational_state_file")"
    observed="${component_runtime_hashes[$index]}"
    [[ "$(lowercase "$observed")" == "$(lowercase "$expected")" ]] \
      || fail "${component_labels[$index]} runtime hash differs from reviewed operational state"
  done
}

require_committed_operational_state() {
  case "$operational_state_file" in
    "$repo_root"/*)
      operational_state_relative="${operational_state_file:$(( ${#repo_root} + 1 ))}"
      ;;
    *) fail "reviewed operational state is outside the deployment source checkout" ;;
  esac
  git -C "$repo_root" ls-files --error-unmatch -- "$operational_state_relative" >/dev/null 2>&1 \
    || fail "reviewed operational state must be tracked at $operational_state_relative"
  git -C "$repo_root" diff --quiet HEAD -- "$operational_state_relative" \
    || fail "reviewed operational state has uncommitted changes at $operational_state_relative"
  operational_state_blob="$(git -C "$repo_root" rev-parse \
    "HEAD:$operational_state_relative" 2>/dev/null)" \
    || fail "could not resolve the reviewed operational-state blob"
  [[ "$operational_state_blob" =~ ^[0-9a-fA-F]{40,64}$ ]] \
    || fail "reviewed operational-state blob hash is malformed"
  echo "Protocol deployment: reviewed operational state $operational_state_relative at $source_commit blob $operational_state_blob"
}

validate_protocol_safe() {
  local target_rpc="$1"
  local output observed expected_storage safe_code safe_address
  local expected_owners observed_owners expected_threshold
  local expected_modules observed_modules expected_handler expected_guard

  safe_address="$(jq -er '.safe.address' "$operational_state_file")"

  safe_code="$(rpc_code "$target_rpc" "protocol Safe" "$safe_address")"
  [[ "$safe_code" != "0x" && "$safe_code" != "0x0" && -n "$safe_code" ]] \
    || fail "protocol Safe has no runtime"

  output="$(rpc_call_json "$target_rpc" "Safe masterCopy" \
    "$safe_address" "masterCopy()(address)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  require_address_match "Safe singleton" "$observed" \
    "$(jq -er '.safe.singleton' "$operational_state_file")"

  output="$(rpc_call_json "$target_rpc" "Safe VERSION" \
    "$safe_address" "VERSION()(string)")"
  [[ "$(printf '%s' "$output" | jq -er '.[0]')" == \
    "$(jq -er '.safe.version' "$operational_state_file")" ]] \
    || fail "protocol Safe version differs from reviewed operational state"

  output="$(rpc_call_json "$target_rpc" "Safe owners" \
    "$safe_address" "getOwners()(address[])")"
  expected_owners="$(jq -c '.safe.owners | map(ascii_downcase)' "$operational_state_file")"
  observed_owners="$(printf '%s' "$output" | jq -ec '.[0] | map(ascii_downcase)')" \
    || fail "protocol Safe owners response is malformed"
  [[ "$observed_owners" == "$expected_owners" ]] \
    || fail "protocol Safe owners differ from reviewed operational state"

  output="$(rpc_call_json "$target_rpc" "Safe threshold" \
    "$safe_address" "getThreshold()(uint256)")"
  expected_threshold="$(jq -er '.safe.threshold' "$operational_state_file")"
  [[ "$(printf '%s' "$output" | jq -er '.[0]')" == "$expected_threshold" ]] \
    || fail "protocol Safe threshold differs from reviewed operational state"

  output="$(rpc_call_json "$target_rpc" "Safe modules" \
    "$safe_address" \
    "getModulesPaginated(address,uint256)(address[],address)" \
    "$BBF_SENTINEL_MODULES" 128)"
  expected_modules="$(jq -c '.safe.modules | map(ascii_downcase)' "$operational_state_file")"
  observed_modules="$(printf '%s' "$output" | jq -ec '.[0] | map(ascii_downcase)')" \
    || fail "protocol Safe modules response is malformed"
  [[ "$observed_modules" == "$expected_modules" ]] \
    || fail "protocol Safe modules differ from reviewed operational state"
  observed="$(printf '%s' "$output" | jq -er '.[1]')"
  require_address_match "Safe module sentinel" "$observed" "$BBF_SENTINEL_MODULES"

  output="$(rpc_call_json "$target_rpc" "Safe fallback handler" \
    "$safe_address" "getStorageAt(uint256,uint256)(bytes)" \
    "$BBF_SAFE_FALLBACK_HANDLER_SLOT" 1)"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  expected_handler="$(jq -er '.safe.fallbackHandler' "$operational_state_file")"
  expected_storage="0x000000000000000000000000${expected_handler#0x}"
  [[ "$(lowercase "$observed")" == "$(lowercase "$expected_storage")" ]] \
    || fail "protocol Safe fallback handler differs from reviewed operational state"

  output="$(rpc_call_json "$target_rpc" "Safe guard" \
    "$safe_address" "getStorageAt(uint256,uint256)(bytes)" \
    "$BBF_SAFE_GUARD_SLOT" 1)"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  expected_guard="$(jq -er '.safe.guard' "$operational_state_file")"
  expected_storage="0x000000000000000000000000${expected_guard#0x}"
  [[ "$(lowercase "$observed")" == "$(lowercase "$expected_storage")" ]] \
    || fail "protocol Safe guard differs from reviewed operational state"
}

validate_payment_tokens() {
  local target_rpc="$1"
  local output code observed_hash implementation_slot implementation
  local index token symbol decimals scaled supports_core supports_pending multiplier

  for index in "${!payment_token_addresses[@]}"; do
    token="${payment_token_addresses[$index]}"
    symbol="${payment_token_symbols[$index]}"
    decimals="${payment_token_decimals[$index]}"
    scaled="${payment_token_scaled[$index]}"
    code="$(rpc_code "$target_rpc" "$symbol" "$token")"
    if [[ "$code" == "0x" || "$code" == "0x0" || -z "$code" ]]; then
      fail "$symbol has no runtime at $token"
    fi
    observed_hash="$(cast keccak "$code")"
    [[ "$(lowercase "$observed_hash")" == "$(lowercase "${payment_token_runtime_hashes[$index]}")" ]] \
      || fail "$symbol runtime hash differs from the release-validated manifest"

    output="$(rpc_call_json "$target_rpc" "$symbol decimals" "$token" "decimals()(uint8)")"
    [[ "$(printf '%s' "$output" | jq -er '.[0]')" == "$decimals" ]] \
      || fail "$symbol decimals differ from the release manifest"
    output="$(rpc_call_json "$target_rpc" "$symbol symbol" "$token" "symbol()(string)")"
    [[ "$(printf '%s' "$output" | jq -er '.[0]')" == "$symbol" ]] \
      || fail "$symbol contract symbol differs from the release manifest"
    output="$(rpc_call_json "$target_rpc" "$symbol name" "$token" "name()(string)")"
    [[ -n "$(printf '%s' "$output" | jq -er '.[0]')" ]] || fail "$symbol name is empty"

    supports_core="false"
    if output="$(cast call "$token" "supportsInterface(bytes4)(bool)" \
      "$BBF_ERC8056_CORE_INTERFACE" --rpc-url "$target_rpc" --json 2>/dev/null)"; then
      supports_core="$(printf '%s' "$output" | jq -r '.[0]')"
    fi
    supports_pending="false"
    if output="$(cast call "$token" "supportsInterface(bytes4)(bool)" \
      "$BBF_ERC8056_PENDING_INTERFACE" --rpc-url "$target_rpc" --json 2>/dev/null)"; then
      supports_pending="$(printf '%s' "$output" | jq -r '.[0]')"
    fi
    if [[ "$scaled" == "true" ]]; then
      [[ "$supports_core" == "true" && "$supports_pending" == "true" ]] \
        || fail "$symbol does not expose the reviewed ERC-8056 interfaces"
      output="$(rpc_call_json "$target_rpc" "$symbol UI multiplier" \
        "$token" "uiMultiplier()(uint256)")"
      multiplier="$(printf '%s' "$output" | jq -er '.[0]')"
      [[ "$multiplier" != "0" ]] || fail "$symbol current UI multiplier is zero"
      output="$(rpc_call_json "$target_rpc" "$symbol pending UI multiplier" \
        "$token" "newUIMultiplier()(uint256)")"
      multiplier="$(printf '%s' "$output" | jq -er '.[0]')"
      [[ "$multiplier" != "0" ]] || fail "$symbol pending UI multiplier is zero"
      rpc_call_json "$target_rpc" "$symbol UI multiplier schedule" \
        "$token" "effectiveAt()(uint256)" >/dev/null
    elif [[ "$supports_core" == "true" || "$supports_pending" == "true" ]]; then
      fail "$symbol unexpectedly claims ERC-8056 support"
    fi
  done

  [[ "$expected_chain_id" == "4663" ]] || return 0
  token="${payment_token_addresses[0]}"
  if ! implementation_slot="$(cast storage "$token" \
    "$BBF_EIP1967_IMPLEMENTATION_SLOT" \
    --rpc-url "$target_rpc" 2>/dev/null)"; then
    fail "mainnet USDG implementation-slot query failed"
  fi
  implementation="0x${implementation_slot: -40}"
  local reviewed_implementation reviewed_implementation_hash
  reviewed_implementation="$(jq -er '.deployment.paymentTokens[0].implementation' "$operational_state_file")"
  reviewed_implementation_hash="$(jq -er '.deployment.paymentTokens[0].implementationRuntimeCodehash' "$operational_state_file")"
  require_address_match "mainnet USDG implementation" \
    "$implementation" "$reviewed_implementation"
  require_runtime_hash "$target_rpc" "mainnet USDG implementation" \
    "$reviewed_implementation" \
    "$reviewed_implementation_hash"
  output="$(rpc_call_json "$target_rpc" "mainnet USDG pause state" \
    "$token" "paused()(bool)")"
  [[ "$(printf '%s' "$output" | jq -er '.[0]')" == "false" ]] \
    || fail "mainnet USDG is paused"
}

validate_factory_dependencies() {
  local target_rpc="$1"
  local factory="${component_addresses[3]}"
  local output observed tier_deployer renderer_schema index token_page

  output="$(rpc_call_json "$target_rpc" "factory payment-token count" \
    "$factory" "paymentTokenCount()(uint256)")"
  [[ "$(printf '%s' "$output" | jq -er '.[0]')" == "${#payment_token_addresses[@]}" ]] \
    || fail "factory payment-token count differs from the release manifest"
  token_page="$(rpc_call_json "$target_rpc" "factory payment-token page" \
    "$factory" "paymentTokens(uint256,uint256)(address[])" 0 "${#payment_token_addresses[@]}")"
  for index in "${!payment_token_addresses[@]}"; do
    observed="$(printf '%s' "$token_page" | jq -er --argjson index "$index" '.[0][$index]')"
    require_address_match "factory payment token $index" \
      "$observed" "${payment_token_addresses[$index]}"
    output="$(rpc_call_json "$target_rpc" "factory listed payment token $index" \
      "$factory" "isPaymentTokenListed(address)(bool)" "${payment_token_addresses[$index]}")"
    [[ "$(printf '%s' "$output" | jq -er '.[0]')" == "true" ]] \
      || fail "factory payment token $index is not listed"
    output="$(rpc_call_json "$target_rpc" "factory enabled payment token $index" \
      "$factory" "isPaymentTokenEnabled(address)(bool)" "${payment_token_addresses[$index]}")"
    [[ "$(printf '%s' "$output" | jq -er '.[0]')" == "true" ]] \
      || fail "factory payment token $index is not enabled"
  done

  output="$(rpc_call_json "$target_rpc" "factory media store" \
    "$factory" "mediaStoreFactory()(address)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  require_address_match "factory media store" "$observed" "${component_addresses[0]}"

  output="$(rpc_call_json "$target_rpc" "factory renderer schema" \
    "$factory" "rendererSchema()(bytes32)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  [[ "$(lowercase "$observed")" == "$(lowercase "$BBF_RENDERER_SCHEMA")" ]] \
    || fail "factory renderer schema is wrong"

  output="$(rpc_call_json "$target_rpc" "canonical renderer schema" \
    "${component_addresses[1]}" "rendererSchema()(bytes32)")"
  renderer_schema="$(printf '%s' "$output" | jq -er '.[0]')"
  [[ "$(lowercase "$renderer_schema")" == "$(lowercase "$BBF_RENDERER_SCHEMA")" ]] \
    || fail "canonical renderer schema is wrong"

  output="$(rpc_call_json "$target_rpc" "factory media runtime hash" \
    "$factory" "mediaStoreFactoryRuntimeCodehash()(bytes32)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  [[ "$(lowercase "$observed")" == "$(lowercase "${component_runtime_hashes[0]}")" ]] \
    || fail "factory media runtime hash binding is wrong"

  output="$(rpc_call_json "$target_rpc" "factory owner" "$factory" "owner()(address)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  require_address_match "factory owner" "$observed" \
    "$(jq -er '.factory.owner' "$operational_state_file")"

  output="$(rpc_call_json "$target_rpc" "factory pending owner" \
    "$factory" "pendingOwner()(address)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  require_address_match "factory pending owner" "$observed" \
    "$(jq -er '.factory.pendingOwner' "$operational_state_file")"

  output="$(rpc_call_json "$target_rpc" "factory fee recipient" \
    "$factory" "feeRecipient()(address)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  require_address_match "factory fee recipient" "$observed" \
    "$(jq -er '.factory.feeRecipient' "$operational_state_file")"

  output="$(rpc_call_json "$target_rpc" "factory tier deployer" \
    "$factory" "deployer()(address)")"
  tier_deployer="$(printf '%s' "$output" | jq -er '.[0]')"
  output="$(rpc_code "$target_rpc" "tier deployer" "$tier_deployer")"
  [[ "$output" != "0x" && "$output" != "0x0" && -n "$output" ]] \
    || fail "factory tier deployer has no runtime"

  output="$(rpc_call_json "$target_rpc" "tier deployer factory" \
    "$tier_deployer" "factory()(address)")"
  observed="$(printf '%s' "$output" | jq -er '.[0]')"
  require_address_match "tier deployer factory" "$observed" "$factory"
}

validate_chain_state() {
  local target_rpc="$1"
  local require_complete="${2:-false}"
  local observed_chain
  if ! observed_chain="$(cast chain-id --rpc-url "$target_rpc" 2>/dev/null)"; then
    fail "RPC chain-id query failed"
  fi
  [[ "$observed_chain" == "$expected_chain_id" ]] \
    || fail "expected chain $expected_chain_id, RPC returned $observed_chain"

  validate_canonical_create2_deployer "$target_rpc"
  validate_protocol_safe "$target_rpc"
  validate_payment_tokens "$target_rpc"
  inspect_prefix "$target_rpc"
  if [[ "${component_present[3]}" == "1" ]]; then
    validate_factory_dependencies "$target_rpc"
  fi
  if [[ "$require_complete" == "true" && "$deployment_prefix_count" -ne 4 ]]; then
    fail "protocol deployment is incomplete at prefix $deployment_prefix_count"
  fi
}

inspect_prefix() {
  local target_rpc="$1"
  local index code observed_runtime_hash
  deployment_prefix_count=0
  component_present=(0 0 0 0)

  for index in 0 1 2 3; do
    if ! code="$(cast code "${component_addresses[$index]}" \
      --rpc-url "$target_rpc" 2>/dev/null)"; then
      fail "RPC code query failed for ${component_labels[$index]}"
    fi
    if [[ "$code" != "0x" && "$code" != "0x0" && -n "$code" ]]; then
      require_hex "observed ${component_labels[$index]} runtime" "$code"
      observed_runtime_hash="$(cast keccak "$code")"
      if [[ "$(lowercase "$observed_runtime_hash")" != "$(lowercase "${component_runtime_hashes[$index]}")" ]]; then
        fail "${component_labels[$index]} at ${component_addresses[$index]} has runtime hash $observed_runtime_hash; expected ${component_runtime_hashes[$index]}"
      fi
      component_present[$index]=1
    fi
  done

  if [[ "${component_present[1]}" == "1" && "${component_present[0]}" != "1" ]]; then
    fail "renderer exists without its media store factory predecessor"
  fi
  if [[ "${component_present[2]}" == "1" \
    && ("${component_present[0]}" != "1" || "${component_present[1]}" != "1") ]]; then
    fail "renderer preview harness exists without both predecessors"
  fi
  if [[ "${component_present[3]}" == "1" \
    && ("${component_present[0]}" != "1" || "${component_present[1]}" != "1" \
      || "${component_present[2]}" != "1") ]]; then
    fail "membership factory exists without all predecessors"
  fi

  for index in 0 1 2 3; do
    if [[ "${component_present[$index]}" == "1" ]]; then
      deployment_prefix_count=$((deployment_prefix_count + 1))
    else
      break
    fi
  done
}

print_recovery_table() {
  local index status
  printf '\n%-22s %-42s %-66s %-66s %-20s %s\n' \
    "COMPONENT" "EXPECTED ADDRESS" "INITCODE HASH" "RUNTIME HASH" "PREDECESSOR" "STATE"
  for index in 0 1 2 3; do
    status="missing"
    [[ "${component_present[$index]:-0}" == "1" ]] && status="validated"
    printf '%-22s %-42s %-66s %-66s %-20s %s\n' \
      "${component_labels[$index]}" \
      "${component_addresses[$index]}" \
      "${component_init_hashes[$index]}" \
      "${component_runtime_hashes[$index]}" \
      "${component_predecessors[$index]}" \
      "$status"
  done
  printf '\n'
}

plan_json() {
  local created_at
  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jq -n \
    --argjson chain_id "$expected_chain_id" \
    --arg network "$network" \
    --arg created_at "$created_at" \
    --arg source_commit "$source_commit" \
    --arg operational_state_path "$operational_state_relative" \
    --arg operational_state_blob "$operational_state_blob" \
    --arg build_config_hash "$build_config_hash" \
    --argjson build_config "$build_config_json" \
    --arg forge_version "$forge_version" \
    --arg solc_version "$configured_solc_version" \
    --arg deployer "$BBF_APPROVED_DEPLOYER" \
    --arg create2_deployer "$BBF_CREATE2_DEPLOYER" \
    --arg payment_token_manifest "$payment_token_manifest_relative" \
    --arg payment_token_manifest_blob "$payment_token_manifest_blob" \
    --argjson payment_tokens "$payment_tokens_json" \
    --arg m_contract "${component_contracts[0]}" \
    --arg m_artifact "${component_artifacts[0]}" \
    --arg m_salt "${component_salts[0]}" \
    --arg m_init "${component_init_hashes[0]}" \
    --arg m_runtime "${component_runtime_hashes[0]}" \
    --arg m_address "${component_addresses[0]}" \
    --arg r_contract "${component_contracts[1]}" \
    --arg r_artifact "${component_artifacts[1]}" \
    --arg r_salt "${component_salts[1]}" \
    --arg r_init "${component_init_hashes[1]}" \
    --arg r_runtime "${component_runtime_hashes[1]}" \
    --arg r_address "${component_addresses[1]}" \
    --arg h_contract "${component_contracts[2]}" \
    --arg h_artifact "${component_artifacts[2]}" \
    --arg h_salt "${component_salts[2]}" \
    --arg h_init "${component_init_hashes[2]}" \
    --arg h_runtime "${component_runtime_hashes[2]}" \
    --arg h_address "${component_addresses[2]}" \
    --arg f_contract "${component_contracts[3]}" \
    --arg f_artifact "${component_artifacts[3]}" \
    --arg f_salt "${component_salts[3]}" \
    --arg f_init "${component_init_hashes[3]}" \
    --arg f_runtime "${component_runtime_hashes[3]}" \
    --arg f_address "${component_addresses[3]}" \
    '{
      schemaVersion: 5,
      chainId: $chain_id,
      network: $network,
      sourceCommit: $source_commit,
      operationalStatePath: $operational_state_path,
      operationalStateBlob: $operational_state_blob,
      buildConfigHash: $build_config_hash,
      buildConfig: $build_config,
      forgeVersion: $forge_version,
      solcVersion: $solc_version,
      deployer: $deployer,
      create2Deployer: $create2_deployer,
      paymentTokenManifest: $payment_token_manifest,
      paymentTokenManifestBlob: $payment_token_manifest_blob,
      paymentTokens: $payment_tokens,
      createdAt: $created_at,
      status: "prepared",
      currentPrefix: 0,
      components: [
        {
          order: 0, label: "media store factory", contractName: $m_contract,
          artifact: $m_artifact, salt: $m_salt, initCodeHash: $m_init,
          runtimeCodeHash: $m_runtime, expectedAddress: $m_address,
          allowedPredecessor: "empty", status: "pending", transactionHash: null,
          receipt: null, sourceVerified: false
        },
        {
          order: 1, label: "renderer", contractName: $r_contract,
          artifact: $r_artifact, salt: $r_salt, initCodeHash: $r_init,
          runtimeCodeHash: $r_runtime, expectedAddress: $r_address,
          allowedPredecessor: "media store factory", status: "pending",
          transactionHash: null, receipt: null, sourceVerified: false
        },
        {
          order: 2, label: "renderer preview harness", contractName: $h_contract,
          artifact: $h_artifact, salt: $h_salt, initCodeHash: $h_init,
          runtimeCodeHash: $h_runtime, expectedAddress: $h_address,
          allowedPredecessor: "renderer", status: "pending",
          transactionHash: null, receipt: null, sourceVerified: false
        },
        {
          order: 3, label: "membership factory", contractName: $f_contract,
          artifact: $f_artifact, salt: $f_salt, initCodeHash: $f_init,
          runtimeCodeHash: $f_runtime, expectedAddress: $f_address,
          allowedPredecessor: "renderer preview harness", status: "pending", transactionHash: null,
          receipt: null, sourceVerified: false
        }
      ]
    }'
}

journal_fingerprint() {
  jq -S -c '{
    schemaVersion, chainId, sourceCommit, operationalStatePath,
    operationalStateBlob, buildConfigHash, buildConfig,
    forgeVersion, solcVersion, deployer, create2Deployer,
    paymentTokenManifest, paymentTokenManifestBlob, paymentTokens,
    components: [.components[] | {
      order, contractName, artifact, salt, initCodeHash, runtimeCodeHash,
      expectedAddress, allowedPredecessor
    }]
  }' "$1"
}

immutable_plan_fingerprint() {
  jq -S -c '
    (if has("deploymentPlan") then .deploymentPlan else . end)
    | {
        schemaVersion, chainId, buildConfigHash, forgeVersion, solcVersion,
        create2Deployer, paymentTokenManifestBlob, paymentTokens,
        components: [.components[] | {
          order, contractName, artifact, salt, initCodeHash, runtimeCodeHash,
          expectedAddress, allowedPredecessor
        }]
      }
  ' "$1"
}

load_promoted_plan_for_status() {
  local active="$1"
  local current_plan current_immutable active_immutable index
  jq -e --argjson chain_id "$expected_chain_id" '
    .deploymentPlan.schemaVersion == 5
    and .deploymentPlan.chainId == $chain_id
    and (.deploymentPlan.paymentTokens | type == "array"
      and length == (if $chain_id == 46630 then 6 else 1 end)
      and all(.[];
        (.address | test("^0x[0-9a-fA-F]{40}$"))
        and (.runtimeCodehash | test("^0x[0-9a-fA-F]{64}$"))))
    and (.deploymentPlan.components | length == 4)
  ' "$active" >/dev/null \
    || fail "active broadcast $active has no valid promoted deployment plan"

  current_plan="$(mktemp "${TMPDIR:-/tmp}/bbf-current-plan.XXXXXX")"
  plan_json >"$current_plan"
  current_immutable="$(immutable_plan_fingerprint "$current_plan")"
  active_immutable="$(immutable_plan_fingerprint "$active")"
  rm -f "$current_plan"
  if [[ "$current_immutable" != "$active_immutable" ]]; then
    echo "Protocol deployment: current checkout artifacts differ from the promoted plan; status is validating promoted addresses and runtimes" >&2
  fi

  payment_tokens_json="$(jq -c '.deploymentPlan.paymentTokens' "$active")"
  payment_token_addresses=()
  while IFS= read -r value; do payment_token_addresses+=("$value"); done \
    < <(jq -er '.deploymentPlan.paymentTokens[].address' "$active")
  payment_token_symbols=()
  while IFS= read -r value; do payment_token_symbols+=("$value"); done \
    < <(jq -er '.deploymentPlan.paymentTokens[].symbol' "$active")
  payment_token_decimals=()
  while IFS= read -r value; do payment_token_decimals+=("$value"); done \
    < <(jq -er '.deploymentPlan.paymentTokens[].expectedDecimals' "$active")
  payment_token_scaled=()
  while IFS= read -r value; do payment_token_scaled+=("$value"); done \
    < <(jq -er '.deploymentPlan.paymentTokens[].requiresScaledUI' "$active")
  payment_token_runtime_hashes=()
  while IFS= read -r value; do payment_token_runtime_hashes+=("$value"); done \
    < <(jq -er '.deploymentPlan.paymentTokens[].runtimeCodehash' "$active")
  for index in 0 1 2 3; do
    component_salts[$index]="$(jq -er --argjson index "$index" '.deploymentPlan.components[$index].salt' "$active")"
    component_init_hashes[$index]="$(jq -er --argjson index "$index" '.deploymentPlan.components[$index].initCodeHash' "$active")"
    component_runtime_hashes[$index]="$(jq -er --argjson index "$index" '.deploymentPlan.components[$index].runtimeCodeHash' "$active")"
    component_addresses[$index]="$(jq -er --argjson index "$index" '.deploymentPlan.components[$index].expectedAddress' "$active")"
  done
  validate_plan_against_operational_state
}

atomic_jq() {
  local journal="$1"
  shift
  local temporary="${journal}.tmp.$$"
  jq "$@" "$journal" >"$temporary"
  mv "$temporary" "$journal"
}

require_journal_plan_match() {
  local journal="$1"
  local generated temporary existing_fingerprint expected_fingerprint
  [[ -f "$journal" ]] || fail "recovery journal $journal does not exist"
  generated="$(plan_json)"
  temporary="${journal}.plan.$$"
  printf '%s\n' "$generated" >"$temporary"
  existing_fingerprint="$(journal_fingerprint "$journal")"
  expected_fingerprint="$(journal_fingerprint "$temporary")"
  rm -f "$temporary"
  if [[ "$existing_fingerprint" != "$expected_fingerprint" ]]; then
    fail "recovery journal $journal belongs to different source artifacts; preserve it and resolve explicitly"
  fi
}

prepare_journal() {
  local journal="$1"
  local target_rpc="$2"
  local generated index status observed_at
  local receipt receipt_status transaction_hash
  generated="$(plan_json)"
  mkdir -p "$(dirname "$journal")"

  if [[ -f "$journal" ]]; then
    require_journal_plan_match "$journal"
  else
    printf '%s\n' "$generated" >"$journal"
  fi

  inspect_prefix "$target_rpc"
  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  for index in 0 1 2 3; do
    status="$(jq -r --argjson index "$index" '.components[$index].status' "$journal")"
    if [[ "$status" == "submitted" ]]; then
      if [[ "${component_present[$index]}" == "1" ]]; then
        atomic_jq "$journal" \
          --argjson index "$index" \
          --arg observed_at "$observed_at" \
          --arg runtime_hash "${component_runtime_hashes[$index]}" \
          '.components[$index].status = "validated-existing"
           | .components[$index].observedAt = $observed_at
           | .components[$index].observedRuntimeCodeHash = $runtime_hash'
        continue
      fi
      transaction_hash="$(jq -r --argjson index "$index" '.components[$index].transactionHash' "$journal")"
      if ! receipt="$(cast receipt "$transaction_hash" \
        --rpc-url "$target_rpc" \
        --confirmations 1 \
        --json 2>/dev/null)"; then
        fail "submitted ${component_labels[$index]} transaction $transaction_hash is not confirmed; do not rebroadcast it. Inspect that exact hash, then use recover-dropped with RECOVER_DROPPED_TRANSACTION_HASH only when the RPC evidence proves recovery is safe"
      fi
      receipt_status="$(printf '%s' "$receipt" | jq -r '.status')"
      if [[ "$receipt_status" != "0x1" && "$receipt_status" != "1" ]]; then
        fail "submitted ${component_labels[$index]} transaction $transaction_hash reverted"
      fi
      inspect_prefix "$target_rpc"
      if [[ "${component_present[$index]}" != "1" ]]; then
        fail "submitted ${component_labels[$index]} transaction mined without the exact runtime"
      fi
      record_receipt "$journal" "$index" "$receipt"
    fi
  done

  inspect_prefix "$target_rpc"

  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for index in 0 1 2 3; do
    status="$(jq -r --argjson index "$index" '.components[$index].status' "$journal")"
    if [[ "${component_present[$index]}" == "1" ]]; then
      atomic_jq "$journal" \
        --argjson index "$index" \
        --arg observed_at "$observed_at" \
        --arg runtime_hash "${component_runtime_hashes[$index]}" \
        '.components[$index].status =
          (if .components[$index].status == "pending" then "validated-existing"
           else .components[$index].status end)
         | .components[$index].observedAt = $observed_at
         | .components[$index].observedRuntimeCodeHash = $runtime_hash'
    elif [[ "$status" != "pending" ]]; then
      fail "recovery journal says ${component_labels[$index]} is $status, but its exact runtime is absent"
    fi
  done
  atomic_jq "$journal" --argjson prefix "$deployment_prefix_count" '.currentPrefix = $prefix'
}

recover_dropped_submission() {
  local journal="$1"
  local target_rpc="$2"
  local authorized_hash="${RECOVER_DROPPED_TRANSACTION_HASH:-}"
  local submitted_count index transaction_hash submitted_nonce
  local receipt receipt_status evidence latest_nonce pending_nonce recovered_at

  [[ "$authorized_hash" =~ ^0x[0-9a-fA-F]{64}$ ]] \
    || fail "recover-dropped requires RECOVER_DROPPED_TRANSACTION_HASH with the exact journaled hash"
  require_journal_plan_match "$journal"
  inspect_prefix "$target_rpc"

  submitted_count="$(jq '[.components[] | select(.status == "submitted")] | length' "$journal")"
  [[ "$submitted_count" == "1" ]] \
    || fail "recover-dropped requires exactly one submitted journal component"
  index="$(jq -er '.components | map(.status == "submitted") | index(true)' "$journal")"
  [[ "${component_present[$index]}" != "1" ]] \
    || fail "journaled component already has its exact runtime; use broadcast to reconcile it"
  transaction_hash="$(jq -er --argjson index "$index" '.components[$index].transactionHash' "$journal")"
  [[ "$(lowercase "$transaction_hash")" == "$(lowercase "$authorized_hash")" ]] \
    || fail "authorized recovery hash does not match the submitted journal transaction"
  submitted_nonce="$(jq -er --argjson index "$index" '.components[$index].submittedNonce' "$journal")" \
    || fail "submitted journal component has no recorded pre-submission nonce"
  [[ "$submitted_nonce" =~ ^[0-9]+$ ]] \
    || fail "submitted journal nonce is malformed"

  if receipt="$(cast receipt "$transaction_hash" \
    --rpc-url "$target_rpc" \
    --confirmations 1 \
    --json 2>/dev/null)"; then
    receipt_status="$(printf '%s' "$receipt" | jq -er '.status')"
    if [[ "$receipt_status" == "0x1" || "$receipt_status" == "1" ]]; then
      fail "submitted transaction succeeded but the exact runtime is absent; refusing automatic recovery"
    fi
    [[ "$receipt_status" == "0x0" || "$receipt_status" == "0" ]] \
      || fail "submitted transaction receipt status is malformed"
    evidence="confirmed-revert"
  else
    if cast tx "$transaction_hash" --rpc-url "$target_rpc" --json >/dev/null 2>&1; then
      fail "submitted transaction is still known by the RPC; refusing dropped-transaction recovery"
    fi
    evidence="absent-from-rpc"
  fi

  latest_nonce="$(cast nonce "$BBF_APPROVED_DEPLOYER" \
    --block latest \
    --rpc-url "$target_rpc" 2>/dev/null)" \
    || fail "could not read deployer latest nonce for recovery"
  pending_nonce="$(cast nonce "$BBF_APPROVED_DEPLOYER" \
    --block pending \
    --rpc-url "$target_rpc" 2>/dev/null)" \
    || fail "could not read deployer pending nonce for recovery"
  [[ "$latest_nonce" =~ ^[0-9]+$ && "$pending_nonce" =~ ^[0-9]+$ ]] \
    || fail "deployer nonce evidence is malformed"

  if [[ "$evidence" == "absent-from-rpc" ]]; then
    if [[ "$latest_nonce" == "$submitted_nonce" && "$pending_nonce" == "$submitted_nonce" ]]; then
      evidence="dropped"
    elif ((latest_nonce > submitted_nonce && pending_nonce >= latest_nonce)); then
      evidence="nonce-consumed"
    else
      fail "absent transaction nonce remains reserved or is inconsistent; refusing recovery"
    fi
  else
    ((latest_nonce > submitted_nonce && pending_nonce >= latest_nonce)) \
      || fail "reverted transaction nonce evidence is inconsistent; refusing recovery"
  fi

  recovered_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  atomic_jq "$journal" \
    --argjson index "$index" \
    --arg transaction_hash "$transaction_hash" \
    --argjson submitted_nonce "$submitted_nonce" \
    --argjson latest_nonce "$latest_nonce" \
    --argjson pending_nonce "$pending_nonce" \
    --arg evidence "$evidence" \
    --arg recovered_at "$recovered_at" \
    '.components[$index].recoveryHistory =
      ((.components[$index].recoveryHistory // []) + [{
        transactionHash: $transaction_hash,
        submittedNonce: $submitted_nonce,
        observedLatestNonce: $latest_nonce,
        observedPendingNonce: $pending_nonce,
        evidence: $evidence,
        recoveredAt: $recovered_at
      }])
     | .components[$index].status = "pending"
     | .components[$index].transactionHash = null
     | .components[$index].receipt = null
     | del(.components[$index].submittedAt, .components[$index].submittedNonce)'
  echo "Protocol deployment: recovered dropped submission evidence; run broadcast for a fresh authorized transaction"
}

record_submission() {
  local journal="$1"
  local index="$2"
  local transaction_hash="$3"
  local submitted_nonce="$4"
  local submitted_at
  submitted_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  atomic_jq "$journal" \
    --argjson index "$index" \
    --arg transaction_hash "$transaction_hash" \
    --argjson submitted_nonce "$submitted_nonce" \
    --arg submitted_at "$submitted_at" \
    '.components[$index].status = "submitted"
     | .components[$index].transactionHash = $transaction_hash
     | .components[$index].submittedNonce = $submitted_nonce
     | .components[$index].submittedAt = $submitted_at'
}

record_receipt() {
  local journal="$1"
  local index="$2"
  local receipt="$3"
  local confirmed_at
  confirmed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  atomic_jq "$journal" \
    --argjson index "$index" \
    --argjson receipt "$receipt" \
    --arg confirmed_at "$confirmed_at" \
    --arg runtime_hash "${component_runtime_hashes[$index]}" \
    '.components[$index].status = "deployed"
     | .components[$index].receipt = $receipt
     | .components[$index].confirmedAt = $confirmed_at
     | .components[$index].observedRuntimeCodeHash = $runtime_hash'
}

submit_component() {
  local target_rpc="$1"
  local signer_mode="$2"
  local journal="$3"
  local index="$4"
  local raw_data transaction_hash receipt status submitted_nonce
  local signed_transaction published_hash
  local send_args mktx_args

  inspect_prefix "$target_rpc"
  if [[ "${component_present[$index]}" == "1" ]]; then
    echo "Protocol deployment: ${component_labels[$index]} already validated at ${component_addresses[$index]}"
    return
  fi
  if [[ "$deployment_prefix_count" -ne "$index" ]]; then
    fail "${component_labels[$index]} cannot deploy from prefix $deployment_prefix_count"
  fi

  raw_data="0x${component_salts[$index]#0x}${component_init_codes[$index]#0x}"
  if [[ "$signer_mode" != "keystore" ]]; then
    send_args=(
      send "$BBF_CREATE2_DEPLOYER"
      --data "$raw_data"
      --rpc-url "$target_rpc"
      --async
    )
    send_args+=(--from "$BBF_APPROVED_DEPLOYER" --unlocked)
  fi

  echo "Protocol deployment: submitting ${component_labels[$index]} to the canonical CREATE2 deployer"
  if ! submitted_nonce="$(cast nonce "$BBF_APPROVED_DEPLOYER" \
    --block pending \
    --rpc-url "$target_rpc" 2>/dev/null)"; then
    fail "could not read the deployer pending nonce before ${component_labels[$index]} submission"
  fi
  [[ "$submitted_nonce" =~ ^[0-9]+$ ]] \
    || fail "deployer pending nonce is malformed before ${component_labels[$index]} submission"
  if [[ "$signer_mode" == "keystore" ]]; then
    mktx_args=(
      mktx "$BBF_CREATE2_DEPLOYER"
      "$raw_data"
      --rpc-url "$target_rpc"
      --nonce "$submitted_nonce"
      --account "$account"
    )
    signed_transaction="$(cast "${mktx_args[@]}")"
    signed_transaction="$(printf '%s' "$signed_transaction" | tr -d '"[:space:]')"
    if [[ ! "$signed_transaction" =~ ^0x([0-9a-fA-F]{2})+$ ]]; then
      fail "Cast did not return a signed transaction for ${component_labels[$index]}"
    fi
    transaction_hash="$(cast keccak "$signed_transaction")"
    [[ "$transaction_hash" =~ ^0x[0-9a-fA-F]{64}$ ]] \
      || fail "could not compute the signed transaction hash for ${component_labels[$index]}"

    # Persist the exact signed transaction identity before publication. If the
    # process dies after the RPC accepts it, recovery can reconcile this hash
    # and nonce without ever sending a second transaction.
    record_submission "$journal" "$index" "$transaction_hash" "$submitted_nonce"
    published_hash="$(cast publish "$signed_transaction" --rpc-url "$target_rpc" --async)"
    published_hash="$(printf '%s' "$published_hash" | tr -d '"[:space:]')"
    [[ "$(lowercase "$published_hash")" == "$(lowercase "$transaction_hash")" ]] \
      || fail "published transaction hash differs from the signed ${component_labels[$index]} transaction"
  else
    send_args+=(--nonce "$submitted_nonce")
    transaction_hash="$(cast "${send_args[@]}")"
    transaction_hash="$(printf '%s' "$transaction_hash" | tr -d '"[:space:]')"
    if [[ ! "$transaction_hash" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
      fail "Cast did not return a transaction hash for ${component_labels[$index]}"
    fi
    record_submission "$journal" "$index" "$transaction_hash" "$submitted_nonce"
  fi

  if ! receipt="$(cast receipt "$transaction_hash" \
    --rpc-url "$target_rpc" \
    --confirmations 1 \
    --json 2>/dev/null)"; then
    fail "receipt query failed for ${component_labels[$index]} transaction $transaction_hash"
  fi
  status="$(printf '%s' "$receipt" | jq -r '.status')"
  if [[ "$status" != "0x1" && "$status" != "1" ]]; then
    fail "${component_labels[$index]} transaction $transaction_hash did not succeed"
  fi

  inspect_prefix "$target_rpc"
  if [[ "$deployment_prefix_count" -lt $((index + 1)) ]]; then
    fail "${component_labels[$index]} transaction mined but exact runtime validation failed"
  fi
  record_receipt "$journal" "$index" "$receipt"
  atomic_jq "$journal" --argjson prefix "$deployment_prefix_count" '.currentPrefix = $prefix'
}

deploy_missing_prefix() {
  local target_rpc="$1"
  local signer_mode="$2"
  local journal="$3"
  local index

  validate_chain_state "$target_rpc" false
  prepare_journal "$journal" "$target_rpc"
  for index in 0 1 2 3; do
    submit_component "$target_rpc" "$signer_mode" "$journal" "$index"
    validate_chain_state "$target_rpc" false
  done

  validate_chain_state "$target_rpc" true
  [[ "$deployment_prefix_count" -eq 4 ]] || fail "completed validator returned without a full prefix"
  atomic_jq "$journal" '.status = "deployed" | .currentPrefix = 4'
}

cleanup_anvil() {
  if [[ -n "${anvil_pid:-}" ]]; then
    kill "$anvil_pid" 2>/dev/null || true
    wait "$anvil_pid" 2>/dev/null || true
    anvil_pid=""
  fi
  if [[ -n "${anvil_directory:-}" && -d "$anvil_directory" ]]; then
    rm -rf "$anvil_directory"
    anvil_directory=""
  fi
}

run_anvil_preflight() {
  local port local_rpc attempts observed_chain local_journal
  anvil_directory="$(mktemp -d "${TMPDIR:-/tmp}/bbf-protocol-preflight.XXXXXX")"
  port="${BBF_ANVIL_PORT:-$((20000 + RANDOM % 20000))}"
  local_rpc="http://127.0.0.1:$port"

  anvil \
    --fork-url "$rpc_url" \
    --chain-id "$expected_chain_id" \
    --host 127.0.0.1 \
    --port "$port" \
    --code-size-limit "$BBF_ROBINHOOD_RUNTIME_LIMIT" \
    --gas-limit "$BBF_ROBINHOOD_GAS_LIMIT" \
    --silent \
    >"$anvil_directory/anvil.log" 2>&1 &
  anvil_pid=$!
  if [[ -n "$deployment_lock_directory" ]]; then
    trap 'cleanup_anvil; release_deployment_lock' EXIT
    trap 'cleanup_anvil; release_deployment_lock; exit 130' INT
    trap 'cleanup_anvil; release_deployment_lock; exit 143' TERM
  else
    trap cleanup_anvil EXIT
    trap 'cleanup_anvil; exit 130' INT
    trap 'cleanup_anvil; exit 143' TERM
  fi

  observed_chain=""
  for attempts in $(seq 1 100); do
    if observed_chain="$(cast chain-id --rpc-url "$local_rpc" 2>/dev/null)"; then
      break
    fi
    if ! kill -0 "$anvil_pid" 2>/dev/null; then
      fail "Anvil fork exited before its RPC became ready"
    fi
    sleep 0.1
  done
  if [[ "$observed_chain" != "$expected_chain_id" ]]; then
    fail "Anvil preflight expected chain $expected_chain_id, got ${observed_chain:-no response}"
  fi

  cast rpc anvil_impersonateAccount "$BBF_APPROVED_DEPLOYER" --rpc-url "$local_rpc" >/dev/null
  cast rpc anvil_setBalance \
    "$BBF_APPROVED_DEPLOYER" \
    0x21e19e0c9bab2400000 \
    --rpc-url "$local_rpc" \
    >/dev/null

  local_journal="$anvil_directory/deployment.json"
  deploy_missing_prefix "$local_rpc" unlocked "$local_journal"
  echo "Protocol deployment: exact chain-$expected_chain_id Anvil-fork raw CREATE2 preflight passed"
  cleanup_anvil
  if [[ -n "$deployment_lock_directory" ]]; then
    trap release_deployment_lock EXIT
    trap 'release_deployment_lock; exit 130' INT
    trap 'release_deployment_lock; exit 143' TERM
  else
    trap - EXIT INT TERM
  fi
}

verify_sources() {
  local journal="$1"
  local index verified_at output safe_output
  local -a verify_command
  for index in 0 1 2 3; do
    require_recorded_source_checkout "$journal"
    verify_command=(
      forge verify-contract
      --watch
      --chain "$expected_chain_id"
      --rpc-url "$rpc_url"
      --verifier blockscout
      --verifier-url "$verifier_url"
    )
    if [[ "$index" == "3" ]]; then
      verify_command+=(--constructor-args "$factory_constructor_args")
    fi
    verify_command+=("${component_addresses[$index]}" "${component_artifacts[$index]}")
    if ! output="$("${verify_command[@]}" 2>&1)"; then
      safe_output="${output//$rpc_url/<rpc-url>}"
      printf '%s\n' "$safe_output" >&2
      fail "Blockscout source verification failed for ${component_labels[$index]}"
    fi
    require_recorded_source_checkout "$journal"
    safe_output="${output//$rpc_url/<rpc-url>}"
    printf '%s\n' "$safe_output"
    verified_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    atomic_jq "$journal" \
      --argjson index "$index" \
      --arg verified_at "$verified_at" \
      '.components[$index].sourceVerified = true
       | .components[$index].sourceVerifiedAt = $verified_at'
  done
  require_recorded_source_checkout "$journal"
  atomic_jq "$journal" '.status = "source-verified"'
}

ensure_no_conflicting_active_broadcast() {
  local active="$1"
  local journal="$2"
  local active_plan journal_plan historical
  [[ -f "$active" ]] || return 0
  active_plan="$(jq -S -c '.deploymentPlan // null' "$active")"
  journal_plan="$(journal_fingerprint "$journal")"
  [[ "$active_plan" != "$journal_plan" ]] || return 0

  for historical in "$(dirname "$active")"/run-[0-9]*.json; do
    [[ -f "$historical" ]] || continue
    if cmp -s "$active" "$historical"; then
      return 0
    fi
  done
  fail "active broadcast $active belongs to another deployment and has no identical timestamped history record"
}

render_broadcast_record() {
  local journal="$1"
  local target="$2"
  local temporary timestamp commit
  local verified_count complete_count
  verified_count="$(jq '[.components[] | select(.sourceVerified == true)] | length' "$journal")"
  complete_count="$(jq '[.components[] | select(.status == "deployed" or .status == "validated-existing")] | length' "$journal")"
  [[ "$verified_count" == "4" && "$complete_count" == "4" ]] \
    || fail "deployment cannot become a public broadcast until all runtimes and sources are verified"

  timestamp="$(date +%s)"
  temporary="${target}.tmp.$$"
  commit="$(jq -er '.sourceCommit' "$journal")" \
    || fail "recovery journal $journal does not identify its source commit"
  [[ "$commit" =~ ^[0-9a-fA-F]{40}$ ]] \
    || fail "recovery journal $journal has an invalid source commit"

  jq \
    --arg commit "$commit" \
    --argjson timestamp "$((timestamp * 1000))" \
    --argjson deployment_plan "$(journal_fingerprint "$journal")" \
    --arg create2 "$BBF_CREATE2_DEPLOYER" \
    --arg journal "$journal" \
    '{
      transactions: [.components[] | {
        hash: .transactionHash,
        transactionType: "CALL",
        contractName: null,
        contractAddress: $create2,
        additionalContracts: [{
          transactionType: "CREATE2",
          contractName: .contractName,
          address: .expectedAddress
        }]
      }],
      receipts: [.components[] | select(.receipt != null) | .receipt],
      libraries: [],
      pending: [],
      returns: {
        mediaStoreFactory: {
          internal_type: "contract OnchainMediaStoreFactory",
          value: .components[0].expectedAddress
        },
        renderer: {
          internal_type: "contract OnchainMetadataRenderer",
          value: .components[1].expectedAddress
        },
        previewHarness: {
          internal_type: "contract RendererPreviewHarness",
          value: .components[2].expectedAddress
        },
        factory: {
          internal_type: "contract MembershipFactory",
          value: .components[3].expectedAddress
        }
      },
      timestamp: $timestamp,
      chain: .chainId,
      commit: $commit,
      deploymentPlan: $deployment_plan,
      recoveryJournal: $journal
    }' \
    "$journal" >"$temporary"
  mv "$temporary" "$target"
}

generate_web_bindings() {
  local staged_project="$1"
  local staged_output="$2"
  local web_dir
  web_dir="$project_dir/../web"
  [[ -d "$web_dir" ]] || fail "web project not found at $web_dir"
  if ! (cd "$web_dir" && \
    BBF_WAGMI_FOUNDRY_PROJECT="$staged_project" \
    BBF_WAGMI_OUTPUT="$staged_output" \
    bun x wagmi generate && \
    bun x prettier --write "$staged_output"); then
    return 1
  fi
  [[ -s "$staged_output" ]] || return 1
}

promote_with_bindings() {
  local journal="$1"
  local stage_directory staged_project staged_active staged_bindings
  local broadcast_directory timestamped timestamp web_bindings
  stage_directory="$(mktemp -d "${TMPDIR:-/tmp}/bbf-protocol-promotion.XXXXXX")"
  staged_project="$stage_directory/contracts"
  staged_active="$staged_project/broadcast/DeployDirectProtocol.s.sol/$expected_chain_id/run-latest.json"
  staged_bindings="$stage_directory/contracts.ts"
  web_bindings="$repo_root/web/src/contracts.ts"

  require_recorded_source_checkout "$journal"
  ensure_no_conflicting_active_broadcast "$active_broadcast" "$journal"
  mkdir -p "$staged_project"
  ln -s "$project_dir/out" "$staged_project/out"
  if [[ -d "$project_dir/broadcast" ]]; then
    cp -R "$project_dir/broadcast" "$staged_project/broadcast"
  fi
  mkdir -p "$(dirname "$staged_active")"
  render_broadcast_record "$journal" "$staged_active"
  if ! generate_web_bindings "$staged_project" "$staged_bindings"; then
    rm -rf "$stage_directory"
    fail "web binding generation failed before active deployment promotion"
  fi
  if ! (require_recorded_source_checkout "$journal"); then
    rm -rf "$stage_directory"
    fail "tracked source changed during staged web binding generation"
  fi

  broadcast_directory="$(dirname "$active_broadcast")"
  mkdir -p "$broadcast_directory"
  timestamp="$(date +%s)"
  timestamped="$broadcast_directory/run-$timestamp.json"
  while [[ -e "$timestamped" ]]; do
    timestamp=$((timestamp + 1))
    timestamped="$broadcast_directory/run-$timestamp.json"
  done

  if ! (require_recorded_source_checkout "$journal"); then
    rm -rf "$stage_directory"
    fail "tracked source changed before active deployment promotion"
  fi
  cp "$staged_active" "${timestamped}.tmp.$$"
  mv "${timestamped}.tmp.$$" "$timestamped"
  cp "$staged_bindings" "${web_bindings}.tmp.$$"
  mv "${web_bindings}.tmp.$$" "$web_bindings"

  # The active pointer is the release gate and is installed last. A generator
  # failure or machine interruption before this point cannot expose the staged
  # deployment to ordinary binding generation.
  cp "$staged_active" "${active_broadcast}.tmp.$$"
  mv "${active_broadcast}.tmp.$$" "$active_broadcast"
  atomic_jq "$journal" \
    --arg active "$active_broadcast" \
    '.status = "promoted" | .activeBroadcast = $active'
  rm -rf "$stage_directory"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

network="${1:-}"
action="${2:-dry-run}"
project_dir="$(cd "$script_dir/.." && pwd -P)"
bbf_load_dotenv "$project_dir/.env"

if ! bbf_configure_public_network "$network"; then
  usage >&2
  exit 2
fi
operational_state_file="$project_dir/config/operational-state/$expected_chain_id.json"
if [[ "$action" != "dry-run" && "$action" != "broadcast" \
  && "$action" != "status" && "$action" != "resume-verify" \
  && "$action" != "recover-dropped" ]]; then
  usage >&2
  exit 2
fi

bbf_require_mainnet_confirmation "$network" CONFIRM_MAINNET_DEPLOYMENT "Protocol deployment"
bbf_reject_broadcast_override "Protocol deployment"
reject_plaintext_signer_inputs

cd "$project_dir"
resolve_source_commit
require_committed_operational_state
validate_operational_state_manifest
journal="deployments/protocol/$expected_chain_id/candidate.json"
active_broadcast="broadcast/DeployDirectProtocol.s.sol/$expected_chain_id/run-latest.json"
if [[ "$action" == "broadcast" || "$action" == "resume-verify" \
  || "$action" == "recover-dropped" ]]; then
  acquire_deployment_lock
fi
if [[ "$action" == "broadcast" ]]; then
  prepare_broadcast_journal_slot "$journal" "$active_broadcast"
elif [[ "$action" == "resume-verify" ]]; then
  if [[ -f "$journal" ]]; then
    require_recorded_source_checkout "$journal"
  else
    require_clean_initial_broadcast
  fi
elif [[ "$action" == "recover-dropped" ]]; then
  [[ -f "$journal" ]] || fail "recover-dropped requires an existing recovery journal at $journal"
  require_recorded_source_checkout "$journal"
elif [[ "$action" == "status" ]]; then
  require_clean_initial_broadcast
fi
reject_build_environment_overrides
validate_build_environment
bbf_verify_public_chain "Protocol deployment"
build_deployment_plan
validate_plan_against_solidity
if [[ "$action" == "status" && -f "$active_broadcast" ]]; then
  load_promoted_plan_for_status "$active_broadcast"
else
  validate_plan_against_operational_state
fi
validate_chain_state "$rpc_url" false
print_recovery_table

if [[ "$action" == "status" ]]; then
  exit 0
fi

if [[ "$action" == "resume-verify" ]]; then
  validate_chain_state "$rpc_url" true
  prepare_journal "$journal" "$rpc_url"
  ensure_no_conflicting_active_broadcast "$active_broadcast" "$journal"
  verify_sources "$journal"
  promote_with_bindings "$journal"
  exit 0
fi

run_anvil_preflight
if [[ "$action" == "dry-run" ]]; then
  exit 0
fi

account="${ACCOUNT:-$default_account}"
bbf_verify_public_account "Protocol deployment" "$account" "$BBF_APPROVED_DEPLOYER"
validate_chain_state "$rpc_url" false
if [[ "$action" == "recover-dropped" ]]; then
  recover_dropped_submission "$journal" "$rpc_url"
  exit 0
fi
prepare_journal "$journal" "$rpc_url"
ensure_no_conflicting_active_broadcast "$active_broadcast" "$journal"
deploy_missing_prefix "$rpc_url" keystore "$journal"
verify_sources "$journal"
promote_with_bindings "$journal"
