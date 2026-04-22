#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/forge-simple"
VENV="$PROJECT_DIR/.venv"
ENV_FILE="/etc/forge-simple.env"
ENV_EXAMPLE="$PROJECT_DIR/deploy/forge-simple.env.example"
UNIT_SRC="$PROJECT_DIR/deploy/forge-simple.service"
UNIT_DST="/etc/systemd/system/forge-simple.service"
RENDER_TMP="/var/tmp/forge-render"

echo "=== forge-simple: install renderer dependencies ==="

# --- System packages ---
echo "[1/5] Installing system packages (fonts-noto-color-emoji, bubblewrap)..."
apt-get update -qq
apt-get install -y --no-install-recommends fonts-noto-color-emoji bubblewrap

# --- Playwright Python package + Chromium ---
echo "[2/5] Installing playwright into venv..."
"$VENV/bin/pip" install --quiet playwright

echo "[3/5] Installing Chromium via playwright..."
"$VENV/bin/playwright" install chromium

echo "[4/5] Installing Chromium system dependencies..."
"$VENV/bin/playwright" install-deps chromium

# --- Renderer workspace ---
echo "[5/5] Creating renderer tmpfs mount point..."
mkdir -p "$RENDER_TMP"
chmod 755 "$RENDER_TMP"

# Compat stub (not used for storage, R2 handles everything)
mkdir -p "$PROJECT_DIR/backend/storage" || true

# --- Env file check ---
if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "WARNING: $ENV_FILE not found."
    echo "  Create it from the example template:"
    echo "    cp $ENV_EXAMPLE $ENV_FILE"
    echo "    chmod 0600 $ENV_FILE"
    echo "  Then fill in the R2_* credentials."
    echo ""
fi

# --- Apply systemd unit ---
echo "[unit] Copying $UNIT_SRC → $UNIT_DST ..."
cp "$UNIT_SRC" "$UNIT_DST"
systemctl daemon-reload
systemctl restart forge-simple
echo "[unit] forge-simple restarted. Status:"
systemctl status forge-simple --no-pager -l || true

# --- Version summary ---
echo ""
echo "=== Installed versions ==="
bwrap --version || echo "bwrap: not found"
"$VENV/bin/playwright" --version || echo "playwright: not found"
"$VENV/bin/python" -c "
import subprocess, sys
r = subprocess.run(['$VENV/bin/playwright', 'chromium', '--version'], capture_output=True, text=True)
print('chromium:', r.stdout.strip() or r.stderr.strip())
" 2>/dev/null || echo "chromium version: unknown"

echo ""
echo "Done. Smoke-test: ssh into server, create a carousel session and call render_html."
