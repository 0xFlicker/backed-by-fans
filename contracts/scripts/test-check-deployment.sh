#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -r "${test_dir}"' EXIT
mkdir -p "${test_dir}/bin"

captured_hash="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
factory_tx="0x1111111111111111111111111111111111111111111111111111111111111111"
tier_tx="0x2222222222222222222222222222222222222222222222222222222222222222"
factory_input_hash="0x3333333333333333333333333333333333333333333333333333333333333333"
tier_input_hash="0x4444444444444444444444444444444444444444444444444444444444444444"
factory="0x0000000000000000000000000000000000000002"
tier_owner="0x0000000000000000000000000000000000000007"

write_manifest() {
  local input_hash="$1"
  jq -n \
    --arg captured_hash "${captured_hash}" \
    --arg factory_tx "${factory_tx}" \
    --arg tier_tx "${tier_tx}" \
    --arg factory_input_hash "${input_hash}" \
    --arg tier_input_hash "${tier_input_hash}" \
    --arg factory "${factory}" \
    --arg tier_owner "${tier_owner}" \
    '{
      status: "deployed",
      capturedBlockNumber: 500,
      capturedBlockHash: $captured_hash,
      renderer: "0x0000000000000000000000000000000000000001",
      factory: $factory,
      deployer: "0x0000000000000000000000000000000000000003",
      creationCodeStoreA: "0x0000000000000000000000000000000000000004",
      creationCodeStoreB: "0x0000000000000000000000000000000000000005",
      validationTier: "0x0000000000000000000000000000000000000006",
      validationTierOwner: $tier_owner,
      rendererCreationBlockNumber: 450,
      factoryCreationBlockNumber: 460,
      validationTierCreationBlockNumber: 475,
      factoryDeploymentTransactionHash: $factory_tx,
      validationTierCreationTransactionHash: $tier_tx,
      factoryDeploymentInputHash: $factory_input_hash,
      validationTierCreationInputHash: $tier_input_hash
    }' >"${test_dir}/manifest.json"
}

cat >"${test_dir}/bin/cast" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

factory_tx="0x1111111111111111111111111111111111111111111111111111111111111111"
factory="0x0000000000000000000000000000000000000002"
tier_owner="0x0000000000000000000000000000000000000007"

case "$1" in
  block)
    printf '%s\n' '{"hash":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
    ;;
  tx)
    if [[ "$2" == "${factory_tx}" ]]; then
      printf '%s\n' "{\"hash\":\"${factory_tx}\",\"to\":null,\"from\":\"0x0000000000000000000000000000000000000008\",\"input\":\"0xfac7\",\"blockNumber\":\"0x1cc\"}"
    else
      printf '%s\n' "{\"hash\":\"$2\",\"to\":\"${factory}\",\"from\":\"${tier_owner}\",\"input\":\"0x71e2\",\"blockNumber\":\"0x1db\"}"
    fi
    ;;
  receipt)
    if [[ "$2" == "${factory_tx}" ]]; then
      printf '%s\n' "{\"contractAddress\":\"${factory}\",\"blockNumber\":\"0x1cc\",\"status\":\"0x1\"}"
    else
      printf '%s\n' '{"contractAddress":null,"blockNumber":"0x1db","status":"0x1"}'
    fi
    ;;
  keccak)
    if [[ "$2" == "0xfac7" ]]; then
      printf '%s\n' '0x3333333333333333333333333333333333333333333333333333333333333333'
    else
      printf '%s\n' '0x4444444444444444444444444444444444444444444444444444444444444444'
    fi
    ;;
  to-dec)
    printf '%d\n' "$(( $2 ))"
    ;;
  code)
    address="$2"
    shift 2
    block=""
    while [[ $# -gt 0 ]]; do
      if [[ "$1" == "--block" ]]; then
        block="$2"
        break
      fi
      shift
    done
    case "${address}" in
      0x0000000000000000000000000000000000000001) creation=450 ;;
      0x0000000000000000000000000000000000000002|0x0000000000000000000000000000000000000003|0x0000000000000000000000000000000000000004|0x0000000000000000000000000000000000000005) creation=460 ;;
      0x0000000000000000000000000000000000000006) creation=475 ;;
      *) exit 1 ;;
    esac
    if [[ "${block}" -ge "${creation}" ]]; then
      printf '%s\n' '0x01'
    else
      printf '%s\n' '0x'
    fi
    ;;
  *)
    exit 1
    ;;
esac
EOF

cat >"${test_dir}/bin/forge" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "${test_dir}/bin/cast" "${test_dir}/bin/forge"

write_manifest "${factory_input_hash}"
PATH="${test_dir}/bin:${PATH}" \
  "${script_dir}/check-deployment.sh" "${test_dir}/manifest.json" "fixture-rpc" >/dev/null

write_manifest "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
if PATH="${test_dir}/bin:${PATH}" \
  "${script_dir}/check-deployment.sh" "${test_dir}/manifest.json" "fixture-rpc" \
  >/dev/null 2>&1; then
  echo "deployment wrapper accepted a transaction input not bound to the manifest" >&2
  exit 1
fi

injection_marker="${test_dir}/renderer-block-injection-ran"
write_manifest "${factory_input_hash}"
jq --arg malicious_block "x[\$(touch ${injection_marker})0]" \
  '.rendererCreationBlockNumber = $malicious_block' \
  "${test_dir}/manifest.json" >"${test_dir}/malicious-manifest.json"
if PATH="${test_dir}/bin:${PATH}" \
  "${script_dir}/check-deployment.sh" "${test_dir}/malicious-manifest.json" "fixture-rpc" \
  >/dev/null 2>&1; then
  echo "deployment wrapper accepted a non-decimal renderer creation block" >&2
  exit 1
fi
if [[ -e "${injection_marker}" ]]; then
  echo "deployment wrapper executed a renderer creation block payload" >&2
  exit 1
fi

echo "Deployment wrapper policy tests passed."
