# Production Deploy — forge-simple on 5.230.132.39

**Status:** DONE
**Created:** 2026-04-11
**Completed:** 2026-04-11
**Server:** Ubuntu 24.04 LTS, x86_64, 4GB RAM, 26GB free disk
**Domain:** https://prompt2app.novaco.io
**Repo path:** /opt/forge-simple (cloned from msmorodinov/claude-prompt-to-app)

## What Was Done

### Phase 1: Server Hardening

- SSH deploy key generated (ED25519, `deploy@prompt2app`) at `/root/.ssh/deploy_key`
- Public key added to GitHub repo as deploy key
- `fail2ban` installed
- `ufw` enabled: ports 22, 80, 443
- Swap: 4GB `/swapfile` already existed (later observed at 72.5% utilization)

### Phase 2: System Dependencies

```bash
apt update && apt upgrade -y
apt install -y python3-pip python3-venv
```

> **Change from plan:** nginx was NOT installed — Caddy used instead (see Phase 6).

### Phase 3: Claude Code CLI + Tools

- `@anthropic-ai/claude-code` v2.1.101 installed globally via npm
- `@openai/codex` v0.120.0 installed globally (note: `@anthropic-ai/codex-cli` does not exist)

### Phase 4: Application Deploy

- Python venv at `/opt/forge-simple/.venv`, dependencies from `requirements.txt`
- Frontend built with Vite → `frontend/dist/`
- PM2 manages the backend process (NOT systemd as originally planned)

#### `ecosystem.config.cjs` (in repo)
```js
module.exports = {
  apps: [{
    name: "forge-simple",
    script: ".venv/bin/python",
    args: "-m backend.server",
    interpreter: "none",
    env: { PYTHONUNBUFFERED: "1" },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    out_file: "deploy/logs/app-out.log",
    error_file: "deploy/logs/app-err.log",
  }],
};
```

#### Deploy scripts (in repo under `deploy/`)
- `setup.sh` — one-time idempotent setup: PM2, venv, deps, frontend build, cron
- `deploy.sh` — auto-deploy: `git fetch` + pull + build + `pm2 restart` (runs every minute via cron)
- `logs/` — deploy.log, app-out.log, app-err.log
- `.deploy.lock` — flock-based concurrency guard

### Phase 5: Reverse Proxy — Caddy (NOT nginx)

> **Major change from plan:** Caddy replaced nginx+certbot. Caddy provides automatic HTTPS/SSL via Let's Encrypt with zero configuration.

Caddyfile at `/etc/caddy/Caddyfile`:
- Domain: `prompt2app.novaco.io`
- Frontend: static files from `/opt/forge-simple/frontend/dist` with SPA fallback (`try_files`)
- Backend proxy: `/chat*`, `/stream*`, `/answers*`, `/sessions*`, `/session-status*`, `/health*`, `/config*`, `/apps*`, `/admin/*`, `/api/*` → `localhost:4910`
- SSE: `flush_interval -1` on stream endpoint
- Automatic HTTPS/SSL provisioning

### Phase 6: CORS Fix

- `https://prompt2app.novaco.io` added to backend `allow_origins` in `server.py`
- Service restarted after fix

### Phase 7: MCP Servers

All configured at user scope (`--scope user`) in `/root/.claude.json`:

| Server | Package | API Key Required |
|--------|---------|-----------------|
| DeepWiki | `@anthropic-ai/deepwiki-mcp` | No |
| Perplexity | `@anthropic-ai/perplexity-mcp` | `PERPLEXITY_API_KEY` |
| Brave Search | `@anthropic-ai/brave-search-mcp` | `BRAVE_API_KEY` |

### Phase 8: Auto-Deploy (added post-plan)

Cron-based polling every 60 seconds:
- Script: `/opt/forge-simple/scripts/deploy.sh`
- Checks main branch for new commits
- Atomic frontend swap (build to temp dir → `mv`)
- Tests run before backend restart; rollback on failure
- `flock`-based concurrency control
- Log rotation via `/etc/logrotate.d/forge-deploy`
- Optional Telegram notifications (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)

### Verification (all passed)

- `curl https://prompt2app.novaco.io/health` → 200 `{"status":"ok"}`
- Frontend loads at `https://prompt2app.novaco.io/`
- `/apps` returns "Positioning Workshop" (id:1, slug:default)
- Claude CLI v2.1.101, Codex CLI v0.120.0 available
- Disk: 35% (14GB/38GB), RAM: 1.6GB/3.8GB

## Deviations from Original Plan

| Original Plan | What Actually Happened |
|--------------|----------------------|
| nginx + certbot for SSL | Caddy with automatic HTTPS |
| IP-only, no SSL | Domain `prompt2app.novaco.io` with SSL |
| systemd service | PM2 with `ecosystem.config.cjs` |
| 2GB swap to add | 4GB swap already existed |
| `@anthropic-ai/codex-cli` | Package doesn't exist; used `@openai/codex` |
| No auto-deploy | Cron-based auto-deploy via `deploy/deploy.sh` |

## Known Issues

- **Root user** — everything runs as root. Create dedicated user in future.
- **4GB RAM** — swap at 72.5% indicates memory pressure. Monitor `htop`.
- **No backup** — SQLite not backed up. Add cron job.
- **systemd killed tmux** — `user@1000.service` stop/restart cycle terminated tmux sessions (observed 19:05:16 on deploy day)
- **CORS drift** — production origin `https://prompt2app.novaco.io` patched only on server, not committed to repo. Next deploy will overwrite it.

---

## Recommendations & Improvements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the production deployment, fix config drift, and add observability.

**Architecture:** Environment-aware CORS config, SQLite backup cron, dedicated OS user, health monitoring.

**Tech Stack:** Python/FastAPI, Caddy, PM2, cron, SQLite

---

### Task 1: Fix CORS Config Drift (CRITICAL)

Production origin was added via `sed` on the server but never committed. Next auto-deploy will overwrite `server.py` and break CORS.

**Files:**
- Modify: `backend/server.py:79-83`

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_server.py
def test_cors_includes_production_origin():
    """CORS must include production domain to prevent deploy regression."""
    from backend.server import app
    cors = next(m for m in app.user_middleware if m.cls.__name__ == "CORSMiddleware")
    origins = cors.kwargs["allow_origins"]
    assert "https://prompt2app.novaco.io" in origins
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && python -m pytest tests/test_server.py::test_cors_includes_production_origin -v
```

- [ ] **Step 3: Add production origin + env-based CORS**

```python
# backend/server.py, replace allow_origins block
import os

_CORS_ORIGINS = [
    "http://localhost:4920",
    "http://localhost:4921",
    "http://100.96.19.118:4920",
    "https://prompt2app.novaco.io",
]
_extra = os.environ.get("EXTRA_CORS_ORIGINS", "")
if _extra:
    _CORS_ORIGINS.extend(o.strip() for o in _extra.split(",") if o.strip())

# ... in app setup:
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    ...
)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && python -m pytest tests/test_server.py::test_cors_includes_production_origin -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_server.py
git commit -m "fix: add production CORS origin to repo, prevent deploy drift"
```

---

### Task 2: SQLite Backup Cron

No backup exists. Losing the DB means losing all session history and app definitions.

**Files:**
- Create: `deploy/backup.sh`

- [ ] **Step 1: Write backup script**

```bash
#!/usr/bin/env bash
# Daily SQLite backup with 7-day retention
set -euo pipefail

PROJECT_DIR="/opt/forge-simple"
BACKUP_DIR="$PROJECT_DIR/deploy/backups"
DB_FILE="$PROJECT_DIR/backend/forge.db"
RETAIN_DAYS=7

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
    echo "No database file found at $DB_FILE"
    exit 0
fi

# Use SQLite .backup for consistency (safe during writes)
STAMP=$(date '+%Y%m%d-%H%M%S')
sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/forge-$STAMP.db'"

# Prune old backups
find "$BACKUP_DIR" -name "forge-*.db" -mtime +$RETAIN_DAYS -delete

echo "Backup complete: forge-$STAMP.db"
```

- [ ] **Step 2: Add to setup.sh**

Add cron entry in `deploy/setup.sh` alongside the deploy cron:

```bash
BACKUP_MARKER="# forge-simple-backup"
if ! crontab -l 2>/dev/null | grep -qF "$BACKUP_MARKER"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * $PROJECT_DIR/deploy/backup.sh $BACKUP_MARKER") | crontab -
fi
```

- [ ] **Step 3: Add `deploy/backups/` to `.gitignore`**

```
deploy/backups/
```

- [ ] **Step 4: Commit**

```bash
git add deploy/backup.sh deploy/setup.sh .gitignore
git commit -m "feat: add daily SQLite backup with 7-day retention"
```

---

### Task 3: Dedicated OS User

Everything runs as root — a security risk. PM2 and Caddy should run under a dedicated user.

- [ ] **Step 1: Create user and transfer ownership**

```bash
# On server:
useradd -r -m -s /bin/bash forge
chown -R forge:forge /opt/forge-simple
```

- [ ] **Step 2: Update PM2 to run as `forge` user**

```bash
# Stop root PM2, start under forge
pm2 kill
su - forge -c "cd /opt/forge-simple && pm2 start ecosystem.config.cjs && pm2 save"
# Set up PM2 startup for forge user
env PATH=$PATH:/usr/bin pm2 startup systemd -u forge --hp /home/forge
```

- [ ] **Step 3: Update crontab ownership**

Move cron entries from root's crontab to `forge` user's crontab.

- [ ] **Step 4: Update Caddy file permissions**

Caddy reads from `frontend/dist/` — ensure `forge` user owns it. Caddy itself runs as its own user, but needs read access.

```bash
chmod -R o+r /opt/forge-simple/frontend/dist
```

- [ ] **Step 5: Verify**

```bash
curl https://prompt2app.novaco.io/health
pm2 status
```

---

### Task 4: Health Monitoring & Alerting

No monitoring — if the service goes down at 3 AM, nobody knows.

**Files:**
- Create: `deploy/healthcheck.sh`

- [ ] **Step 1: Write health check script**

```bash
#!/usr/bin/env bash
# Health check with Telegram alerting
set -euo pipefail

URL="https://prompt2app.novaco.io/health"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" 2>/dev/null || echo "000")

if [ "$STATUS" != "200" ]; then
    MSG="⚠️ forge-simple DOWN — /health returned $STATUS at $(date)"
    echo "$MSG"

    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d chat_id="$TELEGRAM_CHAT_ID" -d text="$MSG" > /dev/null
    fi

    # Attempt auto-recovery
    pm2 restart forge-simple 2>/dev/null || true
fi
```

- [ ] **Step 2: Add to cron (every 5 min)**

```bash
HEALTH_MARKER="# forge-simple-health"
if ! crontab -l 2>/dev/null | grep -qF "$HEALTH_MARKER"; then
    (crontab -l 2>/dev/null; echo "*/5 * * * * /opt/forge-simple/deploy/healthcheck.sh $HEALTH_MARKER") | crontab -
fi
```

- [ ] **Step 3: Commit**

```bash
git add deploy/healthcheck.sh deploy/setup.sh
git commit -m "feat: add health monitoring with Telegram alerts and auto-recovery"
```

---

### Task 5: Deploy Notifications

`deploy.sh` already has a placeholder for Telegram — wire it up.

**Files:**
- Modify: `deploy/deploy.sh`

- [ ] **Step 1: Add notification function to deploy.sh**

After the `log "=== Deploy complete"` line:

```bash
# Notify on successful deploy
notify() {
    local msg="$1"
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d chat_id="$TELEGRAM_CHAT_ID" -d text="$msg" > /dev/null 2>&1 || true
    fi
}

notify "✅ forge-simple deployed: $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
```

- [ ] **Step 2: Add env vars to PM2 config or `.env`**

```bash
# On server, add to /opt/forge-simple/.env or export in crontab:
TELEGRAM_BOT_TOKEN=<bot-token>
TELEGRAM_CHAT_ID=<chat-id>
```

- [ ] **Step 3: Commit**

```bash
git add deploy/deploy.sh
git commit -m "feat: add Telegram deploy notifications"
```

---

### Task 6: Memory Pressure Mitigation

Swap at 72.5% (2.9GB/4GB). Server is under memory pressure.

- [ ] **Step 1: Audit memory consumers**

```bash
# On server:
ps aux --sort=-%mem | head -20
pm2 monit
```

- [ ] **Step 2: Set PM2 memory limit**

Add to `ecosystem.config.cjs`:

```js
max_memory_restart: "500M",  // restart if backend exceeds 500MB
```

- [ ] **Step 3: Consider disabling unused MCP servers**

Each MCP server (Perplexity, Brave, DeepWiki) spawns a Node process. If not actively used, remove from `/root/.claude.json` to free RAM.

- [ ] **Step 4: Commit PM2 config change**

```bash
git add ecosystem.config.cjs
git commit -m "perf: add memory limit to PM2 config"
```

---

### Priority Order

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | CORS config drift | **CRITICAL** — next deploy breaks prod | 10 min |
| 2 | SQLite backup | **HIGH** — data loss risk | 15 min |
| 4 | Health monitoring | **HIGH** — silent failures | 15 min |
| 5 | Deploy notifications | **MEDIUM** — visibility | 10 min |
| 6 | Memory mitigation | **MEDIUM** — stability | 15 min |
| 3 | Dedicated OS user | **LOW** — security hardening | 30 min |
