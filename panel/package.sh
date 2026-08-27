#!/usr/bin/env bash
set -euo pipefail

panel_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
repo_dir="$(CDPATH= cd -- "$panel_dir/.." && pwd -P)"
version="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$panel_dir/manifest.json")"

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s /absolute/path/outside/repository/HNK_Ai_Panel_v%s.ccx\n' "$0" "$version" >&2
  exit 64
fi

requested_output="$1"
if [ "${requested_output#/}" = "$requested_output" ]; then
  printf 'Refusing relative output path; choose an absolute path outside the repository.\n' >&2
  exit 64
fi

output_name="$(basename -- "$requested_output")"
expected_name="HNK_Ai_Panel_v${version}.ccx"
if [ "$output_name" != "$expected_name" ]; then
  printf 'Output filename must be %s.\n' "$expected_name" >&2
  exit 64
fi

output_parent="$(dirname -- "$requested_output")"
if [ ! -d "$output_parent" ]; then
  printf 'Output directory must already exist: %s\n' "$output_parent" >&2
  exit 64
fi
output_parent="$(CDPATH= cd -- "$output_parent" && pwd -P)"
case "$output_parent" in
  "$repo_dir"|"$repo_dir"/*)
    printf 'Refusing repository output path: %s\n' "$requested_output" >&2
    exit 64
    ;;
esac
output="$output_parent/$output_name"

archive_stage="$(mktemp -d "$output_parent/.hnk-panel-archive.XXXXXX")"
stage="$archive_stage/source"
archive_tmp="$archive_stage/$output_name"
cleanup() {
  rm -rf -- "$archive_stage"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

mkdir -p "$stage/panel"
cp -a "$panel_dir/." "$stage/panel/"
rm -f "$stage/panel/package.sh" "$stage/panel/PERMISSIONS.md" \
  "$stage/panel/release-manifest.json"
find "$stage/panel" -exec touch -t 202608260000.00 {} +
(
  cd "$stage/panel"
  find . -type f -print | LC_ALL=C sort | zip -X -q "$archive_tmp" -@
)
unzip -tqq "$archive_tmp"
chmod 0600 "$archive_tmp"
mv -f -- "$archive_tmp" "$output"
printf '%s\n' "$output"
