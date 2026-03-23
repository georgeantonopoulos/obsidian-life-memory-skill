#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANONICAL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="${1:-$CANONICAL_ROOT/}"
DST="${2:-/root/.openclaw/workspace/skills/obsidian-life-memory/}"

mkdir -p "$DST"

SRC_REAL="$(realpath "$SRC")"
DST_REAL="$(realpath "$DST")"

if [[ "$SRC_REAL" == "$DST_REAL" ]]; then
  echo "Sync skipped: source and destination are the same ($SRC_REAL)"
  exit 0
fi

rsync -a --delete \
  --exclude '.git/' \
  --exclude 'local-overrides/' \
  --exclude 'scripts/__pycache__/' \
  "$SRC" "$DST"

echo "Synced $(date -u +%FT%TZ): $SRC -> $DST"
