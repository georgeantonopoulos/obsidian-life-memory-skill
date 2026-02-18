#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_SCRIPT="$REPO_DIR/scripts/sync_live_copy.sh"
LOG_DIR="/root/.openclaw/workspace/logs"
LOG_FILE="$LOG_DIR/obsidian-skill-sync.log"

mkdir -p "$LOG_DIR"

{
  echo "[$(date -u +%FT%TZ)] starting sync"
  cd "$REPO_DIR"
  git fetch origin
  git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
  bash "$SYNC_SCRIPT"
  echo "[$(date -u +%FT%TZ)] sync complete"
} >> "$LOG_FILE" 2>&1
