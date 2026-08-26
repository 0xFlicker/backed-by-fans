#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if rg -n --glob '*.sol' '^[[:space:]]*import[[:space:]].*archive' src test script; then
  echo "clean-room gate: an archive import was found" >&2
  exit 1
fi

spdx_failure=0
while IFS= read -r source_file; do
  if [[ "$(sed -n '1p' "$source_file")" != '// SPDX-License-Identifier: MIT' ]]; then
    echo "clean-room gate: missing MIT SPDX header: $source_file" >&2
    spdx_failure=1
  fi
done < <(rg --files src test script -g '*.sol')

if [[ "$spdx_failure" -ne 0 ]]; then
  exit 1
fi

check_dependency() {
  local dependency_path="$1"
  local expected_tag="$2"
  local expected_commit="$3"
  local actual_tag
  local actual_commit

  actual_tag="$(git -C "$dependency_path" describe --tags --exact-match HEAD)"
  actual_commit="$(git -C "$dependency_path" rev-parse HEAD)"

  if [[ "$actual_tag" != "$expected_tag" || "$actual_commit" != "$expected_commit" ]]; then
    echo "clean-room gate: unexpected dependency revision at $dependency_path" >&2
    exit 1
  fi
}

check_dependency \
  "lib/openzeppelin-contracts" \
  "v5.7.0" \
  "cab19933c33c2ad1d4c7a84864a3601dddfd16f3"
check_dependency \
  "lib/forge-std" \
  "v1.16.2" \
  "bf647bd6046f2f7da30d0c2bf435e5c76a780c1b"

echo "clean-room gate: passed"
