#!/usr/bin/env bash
# Auto-deploy: called by cron every minute.
# Checks origin/main for changes, pulls + rebuilds + restarts if needed.
# Uses atomic frontend swap and rollback on failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCK_FILE="$PROJECT_DIR/deploy/.deploy.lock"
LOG_FILE="$PROJECT_DIR/deploy/logs/deploy.log"

mkdir -p "$PROJECT_DIR/deploy/logs"

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

log "=== Deploy started: ${LOCAL:0:7} -> ${REMOTE:0:7} ==="

# Pull changes
if ! git pull origin main --ff-only >> "$LOG_FILE" 2>&1; then
    log "ERROR: git pull failed (diverged?). Manual intervention needed."
    exit 1
fi
log "Git pull complete"

# Backend deps (only if requirements changed)
if git diff "$LOCAL" "$REMOTE" -- backend/requirements.txt | grep -q .; then
    log "Installing Python dependencies..."
    .venv/bin/pip install -q -r backend/requirements.txt >> "$LOG_FILE" 2>&1
fi

# Frontend deps (only if lockfile changed)
if git diff "$LOCAL" "$REMOTE" -- frontend/package-lock.json | grep -q .; then
    log "Installing frontend dependencies..."
    (cd frontend && npm ci --silent) >> "$LOG_FILE" 2>&1
fi

# Frontend build to temp dir (atomic swap)
log "Building frontend..."
BUILD_TMP=$(mktemp -d)
if ! (cd frontend && npx vite build --outDir "$BUILD_TMP") >> "$LOG_FILE" 2>&1; then
    log "ERROR: frontend build failed. Current site unchanged."
    rm -rf "$BUILD_TMP"
    exit 1
fi

# Atomic swap: old dist -> dist.bak, new build -> dist
cd "$PROJECT_DIR/frontend"
rm -rf dist.bak
[ -d dist ] && mv dist dist.bak
mv "$BUILD_TMP" dist
chmod 755 dist
log "Frontend swapped"

cd "$PROJECT_DIR"

# Restart backend
if ! systemctl restart forge-simple >> "$LOG_FILE" 2>&1; then
    log "ERROR: systemctl restart failed. Rolling back frontend."
    cd "$PROJECT_DIR/frontend"
    rm -rf dist
    [ -d dist.bak ] && mv dist.bak dist
    exit 1
fi

# Health check with retry (migrations can take several seconds)
HEALTH_OK=0
for _ in $(seq 1 15); do
    sleep 2
    if curl -sf http://localhost:4910/health > /dev/null; then
        HEALTH_OK=1
        break
    fi
done

if [ "$HEALTH_OK" = "1" ]; then
    log "=== Deploy SUCCESS: $(git rev-parse --short HEAD) ==="
    rm -rf "$PROJECT_DIR/frontend/dist.bak"
else
    log "ERROR: health check failed after restart (30s timeout)"
    # Rollback frontend
    cd "$PROJECT_DIR/frontend"
    rm -rf dist
    [ -d dist.bak ] && mv dist.bak dist
    systemctl restart forge-simple >> "$LOG_FILE" 2>&1 || true
    log "Rolled back frontend, restarted service"
    exit 1
fi
