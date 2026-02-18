#!/usr/bin/env bash
set -euo pipefail

# Sync canonical skill repo -> live OpenClaw skill copy
# while preserving instance-local/private customizations.

SRC="${1:-/root/.openclaw/workspace/obsidian-life-memory-skill/}"
DST="${2:-/root/.openclaw/workspace/skills/obsidian-life-memory/}"

mkdir -p "$DST"

# Keep destination git metadata and local-only overlays untouched.
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'local-overrides/' \
  --exclude 'scripts/__pycache__/' \
  "$SRC" "$DST"

echo "Synced $(date -u +%FT%TZ): $SRC -> $DST"
