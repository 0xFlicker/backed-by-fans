#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

renderer_paths=(
  web/src/features/renderer-lab
  web/src/features/creator-studio
  web/src/features/renderer-registry
  web/src/app/render
  web/src/app/renderer
  .agents/skills/backed-by-fans-renderer/scripts
)

fail_if_present() {
  local description="$1"
  local pattern="$2"
  shift 2

  if rg -n -i --glob '!**/*.test.*' --glob '!**/*.spec.*' \
    --glob '!web/src/contracts.ts' \
    "$pattern" "$@"; then
    echo "Renderer ecosystem boundary failed: $description" >&2
    exit 1
  fi
}

fail_if_present \
  "renderer feed, catalog, curation, or enablement gate found" \
  'renderer.{0,24}(feed|catalog|curation|ranking|enablement)|(?:feed|catalog|curation|ranking).{0,24}renderer' \
  "${renderer_paths[@]}"

fail_if_present \
  "SIWE, OAuth, or hosted renderer authentication found" \
  'siwe|sign[ -]?in with ethereum|oauth|nextauth|authjs|renderer.{0,24}(session token|access token)' \
  "${renderer_paths[@]}"

fail_if_present \
  "hosted renderer storage, upload, or compilation found" \
  '(@vercel/blob|aws-sdk|@aws-sdk|s3client|cloudinary|uploadthing|supabase|firebase|renderer.{0,24}(upload|bucket|database|hosted compil))' \
  "${renderer_paths[@]}"

fail_if_present \
  "private RPC credential or provider key found" \
  '(alchemy|infura|quicknode|rpc[_ -]?(api[_ -]?)?(key|token|secret)|private[_ -]?rpc)' \
  "${renderer_paths[@]}"

fail_if_present \
  "handwritten renderer ABI or deployment-address map found" \
  '(rendererAbi\s*=|rendererABI\s*=|rendererAddresses\s*=|rendererAddressMap\s*=)' \
  web/src

if find web/src/app -type f -path '*/api/*' -print | rg -i 'renderer'; then
  echo "Renderer ecosystem boundary failed: hosted renderer API route found" >&2
  exit 1
fi

echo "Renderer ecosystem boundaries: passed"
