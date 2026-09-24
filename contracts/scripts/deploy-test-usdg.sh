#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"
project_dir="$(cd "$script_dir/.." && pwd)"
action="${1:-dry-run}"
case "$action" in dry-run|broadcast|status) ;; *) echo 'Usage: deploy-test-usdg.sh [dry-run|broadcast|status]' >&2; exit 2 ;; esac
bbf_load_dotenv "$project_dir/.env"
bbf_configure_public_network testnet
bbf_reject_broadcast_override "TestUSDG deployment"
bbf_verify_public_chain "TestUSDG deployment"
cd "$project_dir"
broadcast_file="broadcast/DeployTestUSDG.s.sol/46630/run-latest.json"
token=""
if [[ -f "$broadcast_file" ]]; then
  token="$(jq -er '[.transactions[] | select(.contractName == "TestUSDG") | .contractAddress] | last' "$broadcast_file")"
fi
validate() {
  [[ -n "$token" ]] || { echo 'No TestUSDG deployment recorded.' >&2; return 1; }
  [[ "$(cast call "$token" 'symbol()(string)' --rpc-url "$rpc_url")" == '"bUSD"' ]]
  [[ "$(cast call "$token" 'decimals()(uint8)' --rpc-url "$rpc_url")" == 6 ]]
  [[ "$(cast call "$token" 'CLAIM_AMOUNT()(uint256)' --rpc-url "$rpc_url" | awk '{print $1}')" == 100000000 ]]
  [[ "$(cast call "$token" 'COOLDOWN()(uint256)' --rpc-url "$rpc_url" | awk '{print $1}')" == 86400 ]]
  local expected_code actual_code
  expected_code="$(forge inspect TestUSDG deployedBytecode)"
  actual_code="$(cast code "$token" --rpc-url "$rpc_url")"
  [[ "$expected_code" == "$actual_code" ]] || { echo 'TestUSDG runtime differs from source.' >&2; return 1; }
  echo "Verified TestUSDG: $token"
}
if [[ "$action" == status ]]; then validate; exit; fi
if [[ -n "$token" ]]; then
  validate
  echo 'Existing deployment retained.'
elif [[ "$action" == dry-run ]]; then
  forge script script/DeployTestUSDG.s.sol:DeployTestUSDG --rpc-url "$rpc_url" --sender "$BBF_APPROVED_DEPLOYER"
  exit
else
  account="${ACCOUNT:-$default_account}"
  bbf_verify_public_account "TestUSDG deployment" "$account" "$BBF_APPROVED_DEPLOYER"
  forge script script/DeployTestUSDG.s.sol:DeployTestUSDG --rpc-url "$rpc_url" --sender "$BBF_APPROVED_DEPLOYER" --account "$account" --broadcast --verify --verifier blockscout --verifier-url "$verifier_url"
  token="$(jq -er '[.transactions[] | select(.contractName == "TestUSDG") | .contractAddress] | last' "$broadcast_file")"
  validate
fi
if [[ "$action" == broadcast ]]; then
  echo "Next: regenerate web bindings, then onboard $token through the protocol Safe with setMinimumPayment(token, 1000000) and setPaymentTokenEnabled(token, true)."
fi
