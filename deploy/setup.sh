#!/usr/bin/env bash
# One-time setup: PM2, dependencies, first build, cron.
# Idempotent — safe to re-run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRON_MARKER="# forge-simple-autodeploy"

cd "$PROJECT_DIR"

echo "=== forge-simple deploy setup ==="

# 1. Ensure PM2 is installed
if ! command -v pm2 &>/dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# 2. Python venv + deps
if [ ! -d .venv ]; then
    echo "Creating Python venv..."
    python3 -m venv .venv
fi
echo "Installing Python dependencies..."
.venv/bin/pip install -q -r backend/requirements.txt

# 3. Frontend deps + build
echo "Building frontend..."
cd frontend
npm ci
npm run build
cd "$PROJECT_DIR"

# 4. Create log directory
mkdir -p deploy/logs

# 5. Start/restart PM2
if pm2 describe forge-simple &>/dev/null; then
    echo "Restarting PM2 process..."
    pm2 restart ecosystem.config.cjs
else
    echo "Starting PM2 process..."
    pm2 start ecosystem.config.cjs
fi
pm2 save

# 6. Add cron entry (idempotent)
if ! crontab -l 2>/dev/null | grep -qF "$CRON_MARKER"; then
    echo "Adding cron entry..."
    (crontab -l 2>/dev/null; echo "* * * * * $PROJECT_DIR/deploy/deploy.sh $CRON_MARKER") | crontab -
    echo "Cron entry added"
else
    echo "Cron entry already exists"
fi

echo ""
echo "=== Setup complete ==="
echo "  App:  http://$(hostname -I | awk '{print $1}'):4910"
echo "  Logs: pm2 logs forge-simple"
echo "  Deploy log: deploy/logs/deploy.log"
