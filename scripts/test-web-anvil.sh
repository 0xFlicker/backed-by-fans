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
fork_url="${BBF_ANVIL_FORK_URL:-}"
visual_hold_seconds="${BBF_ANVIL_VISUAL_HOLD_SECONDS:-0}"
creator="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
member="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
gift_recipient="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
new_owner="0x90F79bf6EB2c4f870365E785982E1f101E93b906"
render_probe="0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
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

capture_public_generation_state() {
  git -C "$repo_root" status --porcelain=v1 -- web/src/contracts.ts contracts/broadcast
  git -C "$repo_root" diff -- web/src/contracts.ts contracts/broadcast
  git -C "$repo_root" diff --cached -- web/src/contracts.ts contracts/broadcast
}

require_equal() {
  local observed="$1"
  local expected="$2"
  local label="$3"
  if [[ "$observed" != "$expected" ]]; then
    echo "$label mismatch in the local deployment graph." >&2
    exit 1
  fi
}

for command_name in anvil cast forge jq curl bun nc xxd; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required for the local Anvil browser gate." >&2
    exit 1
  fi
done

if [[ "$anvil_port" == "$web_port" ]]; then
  echo "Anvil and Next.js must use different ports." >&2
  exit 1
fi
if [[ ! "$visual_hold_seconds" =~ ^[0-9]+$ ]] || (( visual_hold_seconds > 60 )); then
  echo "BBF_ANVIL_VISUAL_HOLD_SECONDS must be an integer from 0 through 60." >&2
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

media_path="$temp_dir/local-membership.jpg"
(
  cd "$web_dir"
  bun -e '
    import sharp from "sharp";
    const [source, target] = Bun.argv.slice(1);
    await sharp(source)
      .resize(640, 640, { fit: "cover" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(target);
  ' "$web_dir/public/brand/backstage-membership-hero-v1.png" "$media_path"
)
media_length="$(wc -c <"$media_path" | tr -d ' ')"
if (( media_length <= 24576 || media_length > 90 * 1024 )); then
  echo "Prepared creator media must be above 24,576 bytes and at most 90 KiB; got $media_length." >&2
  exit 1
fi
media_payload="0x$(xxd -p "$media_path" | tr -d '\n')"
media_digest="$(cast keccak "$media_payload")"

public_generation_before="$temp_dir/public-generation-before"
public_generation_after="$temp_dir/public-generation-after"
capture_public_generation_state >"$public_generation_before"

anvil_args=(
  --silent
  --host "$anvil_host"
  --port "$anvil_port"
  --chain-id 31337
  --block-time 1
  --code-size-limit 98304
  --gas-limit 100000000
)
if [[ -n "$fork_url" ]]; then
  anvil_args+=(--fork-url "$fork_url")
fi
anvil "${anvil_args[@]}" >"$temp_dir/anvil.log" 2>&1 &
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
export FOUNDRY_PROFILE="robinhood"
usdg="$({
  forge create test/mocks/LocalWebUSDG.sol:LocalWebUSDG \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$creator" \
    --broadcast \
    --json
} | jq -er '.deployedTo')"

# Foundry 1.7.1's `forge script` executor models Ethereum's 49,152-byte
# EIP-3860 initcode limit. Robinhood and this Anvil configuration permit the
# renderer's larger creation code, so broadcast each exact constructor directly
# and let the configured RPC enforce its actual limits.
media_store_factory="$({
  forge create src/media/OnchainMediaStoreFactory.sol:OnchainMediaStoreFactory \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$creator" \
    --broadcast \
    --json
} | jq -er '.deployedTo')"
renderer="$({
  forge create src/OnchainMetadataRenderer.sol:OnchainMetadataRenderer \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$creator" \
    --broadcast \
    --json
} | jq -er '.deployedTo')"
preview_harness="$({
  forge create src/RendererPreviewHarness.sol:RendererPreviewHarness \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$creator" \
    --broadcast \
    --json
} | jq -er '.deployedTo')"
renderer_registry="$({
  forge create src/RendererRegistry.sol:RendererRegistry \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$creator" \
    --broadcast \
    --json
} | jq -er '.deployedTo')"
factory="$({
  forge create src/MembershipFactory.sol:MembershipFactory \
    --rpc-url "$rpc_url" \
    --unlocked \
    --from "$creator" \
    --broadcast \
    --json \
    --constructor-args "$usdg" "$media_store_factory" "$creator" "$creator"
} | jq -er '.deployedTo')"

require_equal \
  "$(cast call "$factory" 'paymentToken()(address)' --rpc-url "$rpc_url")" \
  "$usdg" \
  "Factory payment token"
require_equal \
  "$(cast call "$factory" 'mediaStoreFactory()(address)' --rpc-url "$rpc_url")" \
  "$media_store_factory" \
  "Factory media store"
require_equal \
  "$(cast call "$renderer" 'rendererSchema()(bytes32)' --rpc-url "$rpc_url")" \
  "$(cast keccak 'BackedByFans.MembershipRenderer.v1')" \
  "Canonical renderer schema"
require_equal \
  "$(cast call "$renderer_registry" 'rendererSchema()(bytes32)' --rpc-url "$rpc_url")" \
  "$(cast keccak 'BackedByFans.MembershipRenderer.v1')" \
  "Renderer registry schema"
require_equal \
  "$(cast call "$factory" 'mediaStoreFactoryRuntimeCodehash()(bytes32)' --rpc-url "$rpc_url")" \
  "$(cast codehash "$media_store_factory" --rpc-url "$rpc_url")" \
  "Media store runtime codehash"
tier_deployer="$(cast call "$factory" 'deployer()(address)' --rpc-url "$rpc_url")"
require_equal \
  "$(cast call "$tier_deployer" 'factory()(address)' --rpc-url "$rpc_url")" \
  "$factory" \
  "Tier deployer factory"
cast send "$media_store_factory" 'store(bytes,uint8)' "$media_payload" 1 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null
media_store="$(cast call "$media_store_factory" \
  'mediaStore(address,uint8,uint32,bytes32)(address)' \
  "$creator" 1 "$media_length" "$media_digest" --rpc-url "$rpc_url")"
media_runtime_codehash="$(cast codehash "$media_store" --rpc-url "$rpc_url")"
require_equal \
  "$(cast call "$media_store_factory" 'creatorMediaCount(address)(uint256)' "$creator" \
    --rpc-url "$rpc_url")" \
  "1" \
  "Creator media registration"

tier_salt="0x8b390fcf87bf5ea112fd26e41d77d06f13744880fda7e48fc25bda05af0a56a6"
tier_metadata="(\"An Anvil-backed creator membership.\",\"\")"
art_config="(0,0x0123456789abcdef0123456789abcdef,0,64,56,2,52,0,1,0,50,50,36,55,52,48,44)"
media_config="(1,$media_store,$media_length,$media_digest,$media_runtime_codehash)"
tier_config="($creator,$tier_salt,$renderer,\"Local Creator Circle\",\"LOCAL\",10000000,2592000,500,100,0,12,$tier_metadata,$art_config,$media_config)"
cast send "$factory" \
  'createTier((address,bytes32,address,string,string,uint256,uint64,uint16,uint16,uint64,uint64,(string,string),(uint16,uint128,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8),(uint8,address,uint32,bytes32,bytes32)))' \
  "$tier_config" \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null
tier="$(cast call "$factory" 'tiers(uint256,uint256)(address[])' 0 1 \
  --rpc-url "$rpc_url" --json | jq -er '.[0][0]')"
predicted_identity="$(cast call "$factory" 'predictTierIdentity(address,bytes32)(bytes32)' \
  "$creator" "$tier_salt" --rpc-url "$rpc_url")"
require_equal \
  "$(cast call "$tier" 'tierIdentity()(bytes32)' --rpc-url "$rpc_url")" \
  "$predicted_identity" \
  "Tier identity"
require_equal \
  "$(cast call "$factory" 'tierForIdentity(bytes32)(address)' "$predicted_identity" \
    --rpc-url "$rpc_url")" \
  "$tier" \
  "Factory identity registration"
require_equal \
  "$(cast call "$factory" 'isTierSaltUsed(address,bytes32)(bool)' "$creator" "$tier_salt" \
    --rpc-url "$rpc_url")" \
  "true" \
  "Creator tier salt consumption"
require_equal \
  "$(cast call "$tier" 'renderer()(address)' --rpc-url "$rpc_url")" \
  "$renderer" \
  "Tier renderer"

if [[ -n "$fork_url" ]]; then
  echo "Exact constructor deployment and $media_length-byte native-media tier verified on the configured Robinhood fork."
else
  echo "Exact constructor deployment and $media_length-byte native-media tier verified on local Anvil."
fi

cast send "$usdg" 'mint(address,uint256)' "$member" 1000000000 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null
cast send "$usdg" 'mint(address,uint256)' "$creator" 1000000000 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null
cast send "$usdg" 'mint(address,uint256)' "$render_probe" 1000000000 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$creator" >/dev/null

render_snapshot="$(cast rpc --rpc-url "$rpc_url" evm_snapshot | jq -er '.')"
cast send "$usdg" 'approve(address,uint256)' "$tier" 10000000 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$render_probe" >/dev/null
cast send "$tier" 'purchase(uint64,address)' 1 \
  0x0000000000000000000000000000000000000000 \
  --rpc-url "$rpc_url" \
  --unlocked \
  --from "$render_probe" >/dev/null
render_token_id="$(cast call "$tier" 'tokenOf(address)(uint256)' "$render_probe" \
  --rpc-url "$rpc_url")"
active_token_uri="$(cast call "$tier" 'tokenURI(uint256)(string)' "$render_token_id" \
  --rpc-url "$rpc_url")"
cast rpc --rpc-url "$rpc_url" evm_increaseTime 2592001 >/dev/null
cast rpc --rpc-url "$rpc_url" evm_mine >/dev/null
afterglow_token_uri="$(cast call "$tier" 'tokenURI(uint256)(string)' "$render_token_id" \
  --rpc-url "$rpc_url")"
if (( ${#active_token_uri} < 100 || ${#afterglow_token_uri} < 100 )) \
  || [[ "$active_token_uri" == "$afterglow_token_uri" ]]; then
  echo "Media-backed active and afterglow tokenURI evidence is incomplete." >&2
  exit 1
fi
cast rpc --rpc-url "$rpc_url" evm_revert "$render_snapshot" \
  | jq -er 'select(. == true)' >/dev/null
echo "Media-backed active/afterglow tokenURI responses verified (${#active_token_uri}/${#afterglow_token_uri} response characters)."

export NEXT_PUBLIC_ANVIL_RPC_URL="$rpc_url"
export NEXT_PUBLIC_ANVIL_FACTORY_ADDRESS="$factory"
export NEXT_PUBLIC_ANVIL_USDG_ADDRESS="$usdg"
export NEXT_PUBLIC_ANVIL_RENDERER_ADDRESS="$renderer"
export NEXT_PUBLIC_ANVIL_PREVIEW_HARNESS_ADDRESS="$preview_harness"
export NEXT_PUBLIC_ANVIL_RENDERER_REGISTRY_ADDRESS="$renderer_registry"
export NEXT_PUBLIC_SITE_URL="$web_url"
export BBF_ANVIL_RPC_URL="$rpc_url"
export BBF_ANVIL_CREATOR_ADDRESS="$creator"
export BBF_ANVIL_TIER_ADDRESS="$tier"
export BBF_ANVIL_MEMBER_ADDRESS="$member"
export BBF_ANVIL_GIFT_RECIPIENT_ADDRESS="$gift_recipient"
export BBF_ANVIL_NEW_OWNER_ADDRESS="$new_owner"
export BBF_ANVIL_MEDIA_STORE_ADDRESS="$media_store"

capture_public_generation_state >"$public_generation_after"
if ! diff -u "$public_generation_before" "$public_generation_after"; then
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

if (( visual_hold_seconds > 0 )); then
  echo "Holding the configured production server for $visual_hold_seconds seconds of manual visual inspection."
  sleep "$visual_hold_seconds"
fi

if ! PLAYWRIGHT_BASE_URL="$web_url" bunx playwright test \
  tests/e2e/anvil-membership.spec.ts \
  tests/e2e/create-tier.spec.ts \
  tests/e2e/creator-operations.spec.ts \
  tests/e2e/join-renew-gift.spec.ts \
  tests/e2e/claims-refunds.spec.ts \
  tests/e2e/rpc-recovery.spec.ts \
  tests/e2e/custom-renderer-address.spec.ts \
  tests/e2e/renderer-sharing.spec.ts \
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

if [[ -n "$fork_url" ]]; then
  echo "Configured Robinhood-fork Anvil browser evidence passed. This is local development evidence only."
else
  echo "Configured Anvil browser evidence passed. This is local development evidence only."
fi
