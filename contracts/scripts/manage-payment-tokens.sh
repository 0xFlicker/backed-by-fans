#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/public-chain-common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/manage-payment-tokens.sh <testnet|mainnet> <list|inspect|enable|disable|withdraw> [token] [safe|submit]

Read commands use the configured chain RPC. Writes print reviewed Safe calldata by default.
The submit mode is allowed only when CONFIRM_PAYMENT_TOKEN_WRITE exactly matches the chain ID
and the selected encrypted Foundry account is the factory's current owner.
EOF
}

network="${1:-}"
action="${2:-}"
token="${3:-}"
mode="${4:-safe}"
case "$network" in testnet|mainnet) ;; *) usage >&2; exit 2 ;; esac
case "$action" in list|inspect|enable|disable|withdraw) ;; *) usage >&2; exit 2 ;; esac
if [[ "$action" != "list" && ! "$token" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "Payment-token management: a valid token address is required" >&2
  exit 2
fi
if [[ "$mode" != "safe" && "$mode" != "submit" ]]; then
  echo "Payment-token management: write mode must be safe or submit" >&2
  exit 2
fi

project_dir="$(cd "$script_dir/.." && pwd)"
bbf_load_dotenv "$project_dir/.env"
bbf_configure_public_network "$network"
if [[ -n "${BBF_PAYMENT_TOKEN_RPC_URL:-}" ]]; then
  rpc_url="$BBF_PAYMENT_TOKEN_RPC_URL"
fi
bbf_verify_public_chain "Payment-token management"

broadcast_file="$project_dir/broadcast/DeployDirectProtocol.s.sol/$expected_chain_id/run-latest.json"
factory_address="${BBF_FACTORY_ADDRESS:-}"
if [[ -z "$factory_address" && -f "$broadcast_file" ]]; then
  factory_address="$(jq -er '
    [.transactions[]?.additionalContracts[]?
      | select(.contractName == "MembershipFactory") | .address]
    | last // empty
  ' "$broadcast_file")"
fi
if [[ ! "$factory_address" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "Payment-token management: no active MembershipFactory is configured for chain $expected_chain_id" >&2
  exit 1
fi
factory_code="$(cast code "$factory_address" --rpc-url "$rpc_url")"
if [[ -z "$factory_code" || "$factory_code" == "0x" || "$factory_code" == "0x0" ]]; then
  echo "Payment-token management: factory has no runtime at $factory_address" >&2
  exit 1
fi

call() {
  cast call "$1" "$2" "${@:3}" --rpc-url "$rpc_url"
}

bool_call() {
  local output normalized
  output="$(call "$@")"
  normalized="$(printf '%s' "$output" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in true|1|"0x1") printf 'true\n' ;; false|0|"0x0") printf 'false\n' ;; *) return 1 ;; esac
}

optional_interface_call() {
  local output normalized
  if output="$(call "$@" 2>&1)"; then
    normalized="$(printf '%s' "$output" | tr '[:upper:]' '[:lower:]')"
    case "$normalized" in
      true|1|"0x1") printf 'true\n' ;;
      false|0|"0x0") printf 'false\n' ;;
      *) return 1 ;;
    esac
    return
  fi
  normalized="$(printf '%s' "$output" | tr '[:upper:]' '[:lower:]')"
  if [[ "$normalized" == *"execution reverted"* \
    || "$normalized" == *"contractfunctionexecutionerror"* \
    || "$normalized" == *"returned no data"* ]]; then
    printf 'false\n'
    return
  fi
  printf '%s\n' "$output" >&2
  return 1
}

token_addresses() {
  local count offset page
  count="$(call "$factory_address" 'paymentTokenCount()(uint256)')"
  count="${count%% *}"
  [[ "$count" =~ ^[0-9]+$ ]] || {
    echo "Payment-token management: malformed token count" >&2
    return 1
  }
  offset=0
  while (( offset < count )); do
    page="$(call "$factory_address" 'paymentTokens(uint256,uint256)(address[])' "$offset" 100)"
    printf '%s\n' "$page" | grep -Eo '0x[0-9a-fA-F]{40}' || true
    offset=$((offset + 100))
  done
}

inspect_token() {
  local inspected="$1" listed enabled name symbol decimals balance core pending
  listed="$(bool_call "$factory_address" 'isPaymentTokenListed(address)(bool)' "$inspected")"
  enabled="$(bool_call "$factory_address" 'isPaymentTokenEnabled(address)(bool)' "$inspected")"
  name="$(call "$inspected" 'name()(string)')"
  symbol="$(call "$inspected" 'symbol()(string)')"
  decimals="$(call "$inspected" 'decimals()(uint8)')"
  balance="$(call "$inspected" 'balanceOf(address)(uint256)' "$factory_address")"
  core="$(optional_interface_call "$inspected" 'supportsInterface(bytes4)(bool)' 0xa60bf13d)"
  pending="$(optional_interface_call "$inspected" 'supportsInterface(bytes4)(bool)' 0x4bd27648)"
  [[ "$core" == "$pending" ]] || {
    echo "Payment-token management: $inspected reports inconsistent ERC-8056 interfaces" >&2
    return 1
  }
  printf 'Token: %s\nName: %s\nSymbol: %s\nDecimals: %s\nListed: %s\nEnabled: %s\nFactory fee balance (raw): %s\n' \
    "$inspected" "$name" "$symbol" "$decimals" "$listed" "$enabled" "$balance"
  if [[ "$core" == "true" ]]; then
    local current future effective
    current="$(call "$inspected" 'uiMultiplier()(uint256)')"
    future="$(call "$inspected" 'newUIMultiplier()(uint256)')"
    effective="$(call "$inspected" 'effectiveAt()(uint256)')"
    [[ "${current%% *}" != "0" && "${future%% *}" != "0" ]] || {
      echo "Payment-token management: $inspected reports a zero UI multiplier" >&2
      return 1
    }
    printf 'ERC-8056: scaled\nCurrent UI multiplier: %s\nPending UI multiplier: %s\nEffective at: %s\n' \
      "$current" "$future" "$effective"
  else
    printf 'ERC-8056: unscaled\n'
  fi
}

preflight_admission() {
  local candidate="$1" code name symbol decimals core pending
  code="$(cast code "$candidate" --rpc-url "$rpc_url")"
  [[ -n "$code" && "$code" != "0x" && "$code" != "0x0" ]] || {
    echo "Payment-token management: token has no runtime" >&2
    return 1
  }
  name="$(call "$candidate" 'name()(string)')"
  symbol="$(call "$candidate" 'symbol()(string)')"
  decimals="$(call "$candidate" 'decimals()(uint8)')"
  [[ -n "$name" && -n "$symbol" && "${decimals%% *}" =~ ^[0-9]+$ ]] || {
    echo "Payment-token management: token metadata is incomplete" >&2
    return 1
  }
  core="$(optional_interface_call "$candidate" 'supportsInterface(bytes4)(bool)' 0xa60bf13d)"
  pending="$(optional_interface_call "$candidate" 'supportsInterface(bytes4)(bool)' 0x4bd27648)"
  [[ "$core" == "$pending" ]] || {
    echo "Payment-token management: ERC-8056 core and pending support differ" >&2
    return 1
  }
  if [[ "$core" == "true" ]]; then
    local current future
    current="$(call "$candidate" 'uiMultiplier()(uint256)')"
    future="$(call "$candidate" 'newUIMultiplier()(uint256)')"
    [[ "${current%% *}" != "0" && "${future%% *}" != "0" ]] || {
      echo "Payment-token management: UI multipliers must be nonzero" >&2
      return 1
    }
    call "$candidate" 'effectiveAt()(uint256)' >/dev/null
  fi
}

if [[ "$action" == "list" ]]; then
  while IFS= read -r listed_token; do
    inspect_token "$listed_token"
    printf '\n'
  done < <(token_addresses)
  exit 0
fi

if [[ "$action" == "inspect" ]]; then
  inspect_token "$token"
  exit 0
fi

listed="$(bool_call "$factory_address" 'isPaymentTokenListed(address)(bool)' "$token")"
case "$action" in
  enable)
    if [[ "$listed" == "false" ]]; then preflight_admission "$token"; fi
    calldata="$(cast calldata 'setPaymentTokenEnabled(address,bool)' "$token" true)"
    ;;
  disable)
    [[ "$listed" == "true" ]] || {
      echo "Payment-token management: cannot disable an unlisted token" >&2
      exit 1
    }
    calldata="$(cast calldata 'setPaymentTokenEnabled(address,bool)' "$token" false)"
    ;;
  withdraw)
    [[ "$listed" == "true" ]] || {
      echo "Payment-token management: cannot withdraw fees for an unlisted token" >&2
      exit 1
    }
    calldata="$(cast calldata 'withdrawProtocolFees(address)' "$token")"
    ;;
esac

if [[ "$mode" == "safe" ]]; then
  jq -n \
    --arg chainId "$expected_chain_id" \
    --arg to "$factory_address" \
    --arg data "$calldata" \
    --arg action "$action" \
    --arg token "$token" \
    '{chainId: ($chainId | tonumber), to: $to, value: "0", data: $data, action: $action, token: $token}'
  exit 0
fi

if [[ "${CONFIRM_PAYMENT_TOKEN_WRITE:-}" != "$expected_chain_id" ]]; then
  echo "Payment-token management: submit requires CONFIRM_PAYMENT_TOKEN_WRITE=$expected_chain_id" >&2
  exit 1
fi
account="${ACCOUNT:-$default_account}"
if [[ "$action" == "withdraw" ]]; then
  authorized_sender="$(call "$factory_address" 'feeRecipient()(address)')"
else
  authorized_sender="$(call "$factory_address" 'owner()(address)')"
fi
bbf_verify_public_account "Payment-token management" "$account" "$authorized_sender"
cast send "$factory_address" --data "$calldata" --rpc-url "$rpc_url" --account "$account"
