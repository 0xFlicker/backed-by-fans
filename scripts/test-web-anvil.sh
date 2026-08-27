#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contracts_dir="$repo_root/contracts"
web_dir="$repo_root/web"
anvil_host="127.0.0.1"
anvil_port="${BBF_ANVIL_PORT:-8547}"
web_host="127.0.0.1"
web_port="${BBF_ANVIL_WEB_PORT:-3110}"
rpc_url="http://$anvil_host:$anvil_port"
web_url="http://$web_host:$web_port"
creator="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
member="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
gift_recipient="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
new_owner="0x90F79bf6EB2c4f870365E785982E1f101E93b906"
temp_dir="$(mktemp -d)"
anvil_pid=""
web_pid=""

cleanup() {
  if [[ -n "$web_pid" ]]; then
    kill "$web_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
  fi
  if [[ -n "$anvil_pid" ]]; then
    kill "$anvil_pid" 2>/dev/null || true
    wait "$anvil_pid" 2>/dev/null || true
  fi
  rm -rf -- "$temp_dir"
}
trap cleanup EXIT INT TERM

for command_name in anvil cast forge jq curl bun nc; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required for the local Anvil browser gate." >&2
    exit 1
  fi
done

if [[ "$anvil_port" == "$web_port" ]]; then
  echo "Anvil and Next.js must use different ports." >&2
  exit 1
fi
if nc -z "$anvil_host" "$anvil_port" 2>/dev/null; then
  echo "Port $anvil_port is already occupied; refusing to reuse an existing service." >&2
  exit 1
fi
if nc -z "$web_host" "$web_port" 2>/dev/null; then
  echo "Port $web_port is already occupied; refusing to reuse an existing service." >&2
  exit 1
fi

public_generation_before="$({
  git status --porcelain=v1 -- web/src/contracts.ts contracts/broadcast
  git diff -- web/src/contracts.ts contracts/broadcast
  git diff --cached -- web/src/contracts.ts contracts/broadcast
} | shasum -a 256)"

anvil --silent --host "$anvil_host" --port "$anvil_port" --chain-id 31337 \
  >"$temp_dir/anvil.log" 2>&1 &
anvil_pid="$!"

for _ in $(seq 1 50); do
  if ! kill -0 "$anvil_pid" 2>/dev/null; then
    echo "Local Anvil exited before becoming ready." >&2
    sed -n '1,120p' "$temp_dir/anvil.log" >&2
    exit 1
  fi
  if cast block-number --rpc-url "$rpc_url" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if ! kill -0 "$anvil_pid" 2>/dev/null \
  || ! cast block-number --rpc-url "$rpc_url" >/dev/null 2>&1; then
  echo "Local Anvil did not become ready." >&2
  sed -n '1,120p' "$temp_dir/anvil.log" >&2
  exit 1
fi

cd "$contracts_dir"

export FOUNDRY_BROADCAST="$temp_dir/broadcast"
usdg="$({
  forge create test/mocks/LocalWebUSDG.sol:LocalWebUSDG \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$creator" \
    --broadcast \
    --json
} | jq -er '.deployedTo')"

export LOCAL_USDG_ADDRESS="$usdg"
export PROTOCOL_OWNER="$creator"
export FEE_RECIPIENT="$creator"
deployment_json="$(forge script script/DeployProtocol.s.sol:DeployLocalProtocol \
  --rpc-url "$rpc_url" \
  --broadcast \
  --unlocked \
  --sender "$creator" \
  --json)"
factory="$(jq -ers 'map(select(.returns.factory.value?))[0].returns.factory.value' <<<"$deployment_json")"

tier_config="($creator,\"Local Creator Circle\",\"LOCAL\",10000000,2592000,500,100,0,12,(\"An Anvil-backed creator membership.\",\"\",\"\"))"
cast send "$factory" \
  'createTier((address,string,string,uint256,uint64,uint16,uint16,uint64,uint64,(string,string,string)))' \
  "$tier_config" \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null
tier="$(cast call "$factory" 'tiers(uint256,uint256)(address[])' 0 1 \
  --rpc-url "$rpc_url" --json | jq -er '.[0][0]')"

cast send "$usdg" 'mint(address,uint256)' "$member" 1000000000 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null
cast send "$usdg" 'mint(address,uint256)' "$creator" 1000000000 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null

export NEXT_PUBLIC_ANVIL_RPC_URL="$rpc_url"
export NEXT_PUBLIC_ANVIL_FACTORY_ADDRESS="$factory"
export NEXT_PUBLIC_ANVIL_USDG_ADDRESS="$usdg"
export NEXT_PUBLIC_SITE_URL="$web_url"
export BBF_ANVIL_RPC_URL="$rpc_url"
export BBF_ANVIL_CREATOR_ADDRESS="$creator"
export BBF_ANVIL_TIER_ADDRESS="$tier"
export BBF_ANVIL_MEMBER_ADDRESS="$member"
export BBF_ANVIL_GIFT_RECIPIENT_ADDRESS="$gift_recipient"
export BBF_ANVIL_NEW_OWNER_ADDRESS="$new_owner"

public_generation_after="$({
  git status --porcelain=v1 -- web/src/contracts.ts contracts/broadcast
  git diff -- web/src/contracts.ts contracts/broadcast
  git diff --cached -- web/src/contracts.ts contracts/broadcast
} | shasum -a 256)"
if [[ "$public_generation_before" != "$public_generation_after" ]]; then
  echo "Local deployment altered public broadcasts or generated contracts." >&2
  exit 1
fi

cd "$web_dir"
bun run build
bun run start -- --hostname "$web_host" --port "$web_port" \
  >"$temp_dir/web.log" 2>&1 &
web_pid="$!"

for _ in $(seq 1 100); do
  if ! kill -0 "$web_pid" 2>/dev/null; then
    echo "Configured Next.js production server exited before becoming ready." >&2
    sed -n '1,160p' "$temp_dir/web.log" >&2
    exit 1
  fi
  if curl --fail --silent --connect-timeout 1 --max-time 2 "$web_url" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done
if ! kill -0 "$web_pid" 2>/dev/null \
  || ! curl --fail --silent --connect-timeout 1 --max-time 2 "$web_url" >/dev/null 2>&1; then
  echo "Configured Next.js production server did not become ready." >&2
  sed -n '1,160p' "$temp_dir/web.log" >&2
  exit 1
fi

if ! PLAYWRIGHT_BASE_URL="$web_url" bunx playwright test \
  tests/e2e/anvil-membership.spec.ts \
  tests/e2e/create-tier.spec.ts \
  tests/e2e/creator-operations.spec.ts \
  tests/e2e/join-renew-gift.spec.ts \
  tests/e2e/claims-refunds.spec.ts \
  tests/e2e/rpc-recovery.spec.ts \
  --grep '@anvil' \
  --workers=1; then
  token_id="$(cast call "$tier" 'tokenOf(address)(uint256)' "$member" --rpc-url "$rpc_url")"
  echo "Configured browser evidence failed; local member token id: $token_id" >&2
  if [[ "$token_id" != "0" ]]; then
    cast call "$tier" 'expiresAt(uint256)(uint64)' "$token_id" \
      --rpc-url "$rpc_url" >&2
    cast call "$tier" 'sharesOf(uint256)(uint256)' "$token_id" \
      --rpc-url "$rpc_url" >&2
    cast call "$tier" 'referralOf(uint256)(uint8,address)' "$token_id" \
      --rpc-url "$rpc_url" >&2
  fi
  exit 1
fi

echo "Configured Anvil browser evidence passed. This is local development evidence only."
