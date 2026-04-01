#!/usr/bin/env bash
# Auto-deploy: called by cron every minute.
# Checks origin/main for changes, pulls + rebuilds + restarts if needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCK_FILE="$PROJECT_DIR/deploy/.deploy.lock"
LOG_FILE="$PROJECT_DIR/deploy/logs/deploy.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

# Use flock to prevent concurrent runs (fd 9)
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    exit 0
fi

cd "$PROJECT_DIR"

# Fetch latest from origin
git fetch origin main --quiet 2>>"$LOG_FILE"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
fi

log "=== Deploy started: $LOCAL -> $REMOTE ==="

# Pull changes
git pull origin main --ff-only >> "$LOG_FILE" 2>&1
log "Git pull complete"

# Backend deps
if git diff "$LOCAL" "$REMOTE" -- backend/requirements.txt | grep -q .; then
    log "Installing Python dependencies..."
    .venv/bin/pip install -r backend/requirements.txt >> "$LOG_FILE" 2>&1
fi

# Frontend deps + build (always rebuild — merge commits can hide diffs)
log "Installing frontend dependencies..."
npm install --prefix frontend >> "$LOG_FILE" 2>&1
log "Building frontend..."
npm run build --prefix frontend >> "$LOG_FILE" 2>&1
log "Frontend build complete"

# Restart app via PM2
pm2 restart forge-simple >> "$LOG_FILE" 2>&1
log "=== Deploy complete: $(git rev-parse --short HEAD) ==="
