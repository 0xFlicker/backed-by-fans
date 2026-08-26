#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Readiness documents =="
"$repo_root/scripts/check-readiness-docs.sh"

echo "== Contracts =="
cd "$repo_root/contracts"
./scripts/check-clean-room.sh
bash ./scripts/test-check-deployment.sh
forge fmt --check
forge build --sizes
forge test -vvv

if ! command -v slither >/dev/null 2>&1; then
  echo "Slither 0.11.6 is required for complete local verification." >&2
  exit 1
fi
slither_version="$(slither --version 2>&1)"
case "$slither_version" in
  *0.11.6*) ;;
  *)
    echo "Expected Slither 0.11.6, found: $slither_version" >&2
    exit 1
    ;;
esac
slither . --config-file slither.config.json --fail-high

echo "== Web =="
cd "$repo_root/web"
bun install --frozen-lockfile
bun run format
bun run lint
bun run test
bun run build
bun run typecheck
bun run test:e2e

if rg -n 'Create Next App|next\.svg|vercel\.svg' src public .next/static; then
  echo "starter identity detected in web output" >&2
  exit 1
fi
if rg -n 'PRIVATE_KEY|SECRET_KEY|MNEMONIC|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY' \
  src public .next/static; then
  echo "obvious secret pattern detected in web output" >&2
  exit 1
fi

cd "$repo_root"
git diff --check

echo "Local Backed By Fans verification passed. This is not public-pilot, audit, or deployment evidence."
