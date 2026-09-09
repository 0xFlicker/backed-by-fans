#!/usr/bin/env bash
set -euo pipefail
web_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
previous="$(mktemp)"
trap 'rm -f -- "$previous"' EXIT
cp "$web_root/src/contracts.ts" "$previous"
cd "$web_root"
bun run generate
if ! cmp -s "$previous" src/contracts.ts; then
  diff -u "$previous" src/contracts.ts || true
  echo "Generated contract bindings were stale. Review the generated change and rerun verification." >&2
  exit 1
fi
