# Deploy & Infrastructure

Production is auto-deployed. Read this before touching anything that could reach prod.

## Server

| Field | Value |
|---|---|
| Host | `prompt2app-prod` (SSH alias) · `5.230.132.39` · `prompt2app.novaco.io` |
| Provider | Noez/Netcup VPS · Debian (`vps69888b9c328c2878119337.noezserver.de`) |
| User | `root` |
| Project path | `/opt/forge-simple` |
| Python venv | `/opt/forge-simple/.venv` |
| Systemd unit | `forge-simple.service` (backend on `:4910`) |
| Web server | Caddy (TLS + reverse proxy, serves `frontend/dist` static + proxies `/api`, `/chat`, `/stream`, etc. to `:4910`) |
| DB | SQLite file inside `/opt/forge-simple` (persisted on disk) |

SSH access is configured via `~/.ssh/config` alias `prompt2app-prod` using the `claude-prompt-to-app-deploy` key. Just: `ssh prompt2app-prod`.

## Auto-deploy pipeline

Cron runs `/opt/forge-simple/deploy/deploy.sh` **every minute**. The script:

1. `git fetch origin main`; if `HEAD == origin/main` → exit (no-op).
2. `git pull --ff-only origin main`. Abort on divergence.
3. Install backend deps only if `backend/requirements.txt` changed.
4. Install frontend deps only if `frontend/package-lock.json` changed.
5. `vite build` to a temp dir → atomic swap into `frontend/dist` (keeps previous build as `dist.bak`).
6. `systemctl restart forge-simple`.
7. **Health-check loop: poll `/health` every 2s up to 30s.** If it never comes up → rollback `dist` from `dist.bak`, restart service again, log ERROR.

Concurrent runs are prevented by `flock` on `deploy/.deploy.lock`.

**Logs:** `/opt/forge-simple/deploy/logs/deploy.log`. First stop here when something looks wrong on prod.

## Rules for writing code that ships

- **Any push to `main` ships to prod within ~60 seconds**. There is no staging. There is no manual approval gate. Treat `main` as production.
- **Migrations run on service startup** (see `backend/migrate.py`). A broken migration takes the backend down. Write migrations idempotent (`IF NOT EXISTS`, `_column_exists` guards — see `0009_app_model.py` as the current reference).
- **Startup may take up to ~30 seconds** if a migration is heavy. `deploy.sh` health check retries for 30s. If your migration is slower than that, raise the retry budget first.
- **The health check hits `/health` on localhost:4910.** Keep that endpoint cheap and unauthenticated — do not add DB calls or auth to it.
- **Never `git push --force` to `main`.** The deploy script uses `--ff-only`; force-push breaks the fetch and silently halts deploys.
- **Static assets live in `frontend/dist/`** served by Caddy. Caches are keyed by content hash (Vite's default). But if a user's tab is still open, they run the old JS — forced reloads only happen when they navigate. Keep API backwards-compatible for at least one session's worth of requests, or accept the short breakage window.

## Verifying a deploy

```bash
# from local machine
ssh prompt2app-prod 'cd /opt/forge-simple && git log --oneline -1 && tail -20 deploy/logs/deploy.log'

# external check — HTML last-modified shows when dist was swapped
curl -sI https://prompt2app.novaco.io | grep -i last-modified

# backend health + version fingerprint
curl -s https://prompt2app.novaco.io/health
```

If `last-modified` is older than the most recent commit, the deploy failed or rolled back — tail `deploy.log` for `ERROR`.

## Manual intervention (when auto-deploy is wedged)

```bash
ssh prompt2app-prod
cd /opt/forge-simple

# 1. Is the lock stuck? (empty file from a crashed run)
ls -la deploy/.deploy.lock                # if it exists for >5 min and no deploy is running, rm it
rm -f deploy/.deploy.lock

# 2. Diverged git?
git status
git fetch origin main && git log HEAD..origin/main --oneline

# 3. Force a deploy run (same code cron runs)
bash deploy/deploy.sh; tail -40 deploy/logs/deploy.log

# 4. Manual frontend rebuild (if backend was fine but dist got rolled back)
cd frontend && BUILD_TMP=$(mktemp -d) && npx vite build --outDir "$BUILD_TMP" --emptyOutDir \
  && mv dist dist.bak && mv "$BUILD_TMP" dist && chmod 755 dist

# 5. Backend logs
journalctl -u forge-simple -n 100 --no-pager
```

## Hardening status

- **SSH:** root-with-key only. Password auth disabled in `/etc/ssh/sshd_config` (see `PasswordAuthentication no`). `fail2ban` guards port 22.
- **Automatic security patches:** `unattended-upgrades` enabled.
- **No firewall script checked in** — VPS provider's default firewall + distribution `ufw`/`nftables` as configured on the box. Do not change without testing SSH stays up.

If you need to rotate the SSH key: add the new one to `~/.ssh/authorized_keys`, test it from a separate session, only then remove the old entry. The Proxmox/VPS web console is the only recovery path if you lock yourself out.
