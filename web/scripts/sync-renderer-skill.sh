#!/bin/sh
set -eu

web_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_root=${1:-"$web_root/../../onchain-render-skill"}
public_root="$web_root/public/skill"

if [ ! -f "$source_root/SKILL.md" ] || [ ! -x "$source_root/scripts/check-dependencies.sh" ]; then
  printf 'Renderer skill source is incomplete: %s\n' "$source_root" >&2
  exit 1
fi

mkdir -p "$public_root/references"
cp "$source_root/SKILL.md" "$public_root/SKILL.md"
cp "$source_root/README.md" "$public_root/README.md"
cp "$source_root/LICENSE" "$public_root/LICENSE"
cp "$source_root/llms.txt" "$public_root/llms.txt"
cp "$source_root/references/deployment.md" "$public_root/references/deployment.md"
cp "$source_root/references/interface.md" "$public_root/references/interface.md"
cp "$source_root/references/local-testing.md" "$public_root/references/local-testing.md"

archive_path="$public_root/onchain-render-skill.tar.gz"
temporary_archive=$(mktemp "${TMPDIR:-/tmp}/onchain-render-skill.XXXXXX.tar.gz")
tar --exclude='.git' --exclude='.github' -czf "$temporary_archive" -C "$source_root" .
mv "$temporary_archive" "$archive_path"
chmod 644 "$archive_path"

printf 'Published renderer skill assets from %s\n' "$source_root"
