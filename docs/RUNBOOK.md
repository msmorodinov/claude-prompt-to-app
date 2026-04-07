# Runbook: Production Operations

<!-- AUTO-GENERATED: 2026-04-05 from deploy/deploy.sh, CLAUDE.md -->

## Overview

This runbook covers deployment, monitoring, health checks, troubleshooting, and incident response for the Prompt-to-App framework in production.

**Deployment Target:** Beelink (localhost via Proxmox + Tailscale)
**Process:** Automated via cron + PM2
**Frontend:** Built Vite SPA served from `frontend/dist/`
**Backend:** FastAPI on port 4910, proxied via frontend dev server

## Quick Reference

| Operation | Command | Time |
|-----------|---------|------|
| Deploy | `deploy/deploy.sh` (auto via cron) | ~2-3 min |
| Health check | `curl http://localhost:4910/health` | <1 sec |
| View logs | `tail -f deploy/logs/deploy.log` | — |
| Restart app | `pm2 restart forge-simple` | ~5 sec |
| Stop app | `pm2 stop forge-simple` | <1 sec |
| Start app | `pm2 start forge-simple` | <5 sec |
| Full rebuild | `make install && make build` | ~60 sec |

## Deployment Procedure

### Automatic Deployment

Deployment runs automatically every minute via cron, triggered by changes to `origin/main`.

**Process:**
1. Cron task runs `deploy/deploy.sh`
2. Script fetches latest from origin/main
3. If changes detected:
   - Pulls git changes (fast-forward only)
   - Installs Python dependencies (if requirements.txt changed)
   - Installs frontend dependencies (always)
   - Builds frontend (`npm run build`)
   - Restarts app via PM2
4. Logs written to `deploy/logs/deploy.log`

**Cron Job Setup:**
```bash
# Run every minute as the app user
* * * * * cd /home/max/projects/forge-simple && deploy/deploy.sh
```

### Manual Deployment

If you need to deploy immediately without waiting for cron:

```bash
# Run deploy script directly
cd /home/max/projects/forge-simple
./deploy/deploy.sh

# Check logs
tail -f deploy/logs/deploy.log

# Verify restart successful
pm2 logs forge-simple
```

### Rollback Procedure

If a deployment breaks production:

```bash
# 1. Identify the broken commit
git log --oneline -10 origin/main

# 2. Reset to last known-good commit
git reset --hard <commit-hash>

# 3. Rebuild and restart
make install
npm run build --prefix frontend
pm2 restart forge-simple

# 4. Verify health
curl http://localhost:4910/health
```

## Health Checks

### Application Health

```bash
# Quick health endpoint
curl http://localhost:4910/health

# Expected response
{"status": "ok"}
```

### Database Health

```bash
# Check SQLite database exists and is readable
ls -la backend/db.sqlite3

# If database is corrupted, it can be deleted (will be recreated on startup)
rm backend/db.sqlite3
pm2 restart forge-simple
```

### Backend Connectivity

```bash
# Check if backend is responding on port 4910
curl -I http://localhost:4910/health

# Check if frontend can proxy to backend
curl http://localhost:4920/api/health  # Via frontend proxy
```

### Frontend Connectivity

```bash
# Load frontend
curl -I http://localhost:4920

# Should return 200 with HTML
```

### Process Status

```bash
# Check PM2 process status
pm2 status

# Check process list
pm2 list

# View real-time logs
pm2 logs forge-simple

# View logs with tail
tail -50 ~/.pm2/logs/forge-simple-out.log
tail -50 ~/.pm2/logs/forge-simple-err.log
```

## Monitoring

### Log Locations

| Log | Location | Purpose |
|-----|----------|---------|
| Deployment | `deploy/logs/deploy.log` | Track deployment history |
| Backend (stdout) | `~/.pm2/logs/forge-simple-out.log` | Application output |
| Backend (stderr) | `~/.pm2/logs/forge-simple-err.log` | Error messages |

### Log Levels

Backend uses Python logging (default: INFO level).

To see more detail:
```bash
LOGLEVEL=DEBUG pm2 restart forge-simple
```

### Database Monitoring

Sessions and app data are stored in SQLite at `backend/db.sqlite3`.

To inspect the database:
```bash
sqlite3 backend/db.sqlite3

# Useful queries
SELECT COUNT(*) as session_count FROM sessions;
SELECT COUNT(*) as app_count FROM apps;
SELECT * FROM sessions LIMIT 5;
.tables  # List all tables
.schema  # View schema
```

### Metrics to Watch

- **Session count:** Monitor growth to detect usage patterns
- **Agent errors:** Check stderr for uncaught exceptions in tool handlers
- **Response times:** Check browser DevTools Network tab for slow endpoints
- **Database size:** `ls -lh backend/db.sqlite3` should stay reasonable

## Common Issues & Troubleshooting

### Issue: Agent Not Responding

**Symptoms:** Frontend shows "Thinking..." forever; backend logs show agent_dead timeout

**Diagnosis:**
```bash
# Check backend logs
tail -50 ~/.pm2/logs/forge-simple-err.log

# Check Claude Code CLI is installed
which claude
claude --version

# Check API authentication
claude --help  # Should show auth status
```

**Resolution:**
1. Verify Claude Code CLI is installed and authenticated
2. Check rate limiting: backend has per-user limits (see validator.py)
3. Restart backend: `pm2 restart forge-simple`

### Issue: Frontend Not Loading

**Symptoms:** Blank page or 404 on http://localhost:4920

**Diagnosis:**
```bash
# Check if frontend dist exists
ls -la frontend/dist/

# Check frontend server is running
pm2 logs forge-simple | grep -i vite
```

**Resolution:**
```bash
# Rebuild frontend
cd frontend && npm run build

# Restart app
pm2 restart forge-simple
```

### Issue: "Port Already in Use"

**Symptoms:** Restart fails; "Address already in use"

**Diagnosis:**
```bash
lsof -i :4910  # Check port 4910
lsof -i :4920  # Check port 4920
```

**Resolution:**
```bash
# Kill the process holding the port
kill -9 <PID>

# Restart
pm2 restart forge-simple
```

### Issue: Database Locked

**Symptoms:** Backend logs: "database is locked"

**Diagnosis:**
```bash
# Check for long-running database operations
sqlite3 backend/db.sqlite3
PRAGMA database_list;
.open /path/to/db.sqlite3
PRAGMA integrity_check;
```

**Resolution:**
```bash
# Restart app (closes all DB connections)
pm2 stop forge-simple
sleep 2
pm2 start forge-simple

# If issue persists, recreate database
rm backend/db.sqlite3
pm2 restart forge-simple
```

### Issue: Session Lost or Not Persisted

**Symptoms:** User refreshes page and session data is gone

**Expected behavior:** Sessions are stored in SQLite; should survive restarts

**Diagnosis:**
```bash
# Check if session was saved to database
sqlite3 backend/db.sqlite3 "SELECT * FROM sessions WHERE id='<session_id>';"

# Check backend logs for save_session errors
grep -i "save_session" ~/.pm2/logs/forge-simple-err.log
```

**Resolution:**
1. Verify database exists: `ls -la backend/db.sqlite3`
2. Check permissions: should be readable/writable by app user
3. Restart backend: `pm2 restart forge-simple`

### Issue: Out of Memory

**Symptoms:** Backend crashes; PM2 shows error in logs

**Diagnosis:**
```bash
# Check system memory
free -h

# Check PM2 process memory
pm2 monit
```

**Resolution:**
1. Restart app to clear session cache: `pm2 restart forge-simple`
2. If persistent, check for memory leaks:
   - Look for unbounded in-memory session queue growth
   - Review recent code changes for circular references

### Issue: High CPU Usage

**Symptoms:** Server slow; PM2 monit shows high CPU

**Diagnosis:**
```bash
# Check which process is using CPU
top -p $(pgrep -f "python.*server.py")

# Check for hot loops in agent
grep -i "while true" backend/*.py
```

**Resolution:**
1. Check backend logs for infinite loops
2. Restart backend: `pm2 restart forge-simple`
3. Review recent agent code changes

## Backup & Recovery

### Database Backup

```bash
# Create backup
cp backend/db.sqlite3 backend/db.sqlite3.backup.$(date +%s)

# List backups
ls -lh backend/db.sqlite3.backup.*
```

### Restore from Backup

```bash
# Stop app
pm2 stop forge-simple

# Restore
cp backend/db.sqlite3.backup.<timestamp> backend/db.sqlite3

# Start app
pm2 start forge-simple

# Verify
curl http://localhost:4910/health
```

## Scaling Notes

Current setup is single-instance on Beelink (localhost).

For multi-instance scaling:
- Replace SQLite with PostgreSQL
- Use a Redis cache for sessions
- Add load balancer (nginx)
- Ensure session IDs are globally unique

See CLAUDE.md for current design constraints.

## Security Checklist

Before production:

- [ ] ANTHROPIC_API_KEY is NOT set (uses OAuth via Claude Code CLI)
- [ ] Database credentials/secrets not in code
- [ ] CORS origins whitelist set correctly in server.py
- [ ] Rate limiting enabled (validator.py)
- [ ] All user inputs validated before processing
- [ ] No hardcoded test data in production database
- [ ] Logs don't contain sensitive data (PII, tokens)
- [ ] HTTPS enabled (if exposed beyond localhost)

## Incident Response

### Severity Levels

| Level | Definition | Response Time |
|-------|-----------|---|
| Critical | App down, users blocked | Immediate |
| High | Feature broken, degraded | <5 min |
| Medium | Feature partially broken | <30 min |
| Low | Minor bug, cosmetic issue | <1 day |

### Critical Issue Procedure

1. **Assess:** Determine what's broken
   ```bash
   pm2 status
   curl http://localhost:4910/health
   pm2 logs forge-simple -n 100
   ```

2. **Containment:** Stop damage
   ```bash
   pm2 stop forge-simple
   ```

3. **Investigate:** Check logs + code
   ```bash
   tail -100 ~/.pm2/logs/forge-simple-err.log
   git log --oneline -5
   ```

4. **Fix:** Either rollback or apply hot fix
   ```bash
   # Rollback: revert to last good commit
   git reset --hard <commit>
   pm2 restart forge-simple

   # OR hot fix: apply patch
   # (edit code)
   pm2 restart forge-simple
   ```

5. **Verify:** Check health
   ```bash
   curl http://localhost:4910/health
   pm2 logs forge-simple -n 20
   ```

6. **Document:** Add notes to deploy.log
   ```bash
   echo "INCIDENT: [description] RESOLVED at $(date)" >> deploy/logs/deploy.log
   ```

## Performance Tuning

### Backend

- **Connection pooling:** SQLite uses built-in connection pool (aiosqlite)
- **Agent timeouts:** Configured in server.py SSE generator (15 sec)
- **Rate limiting:** Per-user limits in validator.py

To adjust:
```python
# In server.py, _sse_generator function
event = await asyncio.wait_for(q.get(), timeout=15.0)  # Change timeout here
```

### Frontend

- **Bundle size:** Run `npm run build` and check dist/ size
- **Lazy loading:** Dynamic import of admin components
- **Caching:** Browser caches static assets; clear with `make clean`

## Troubleshooting Decision Tree

```
App Down?
├─ PM2 status shows stopped
│  └─ Check deploy.log for errors
│     ├─ Git pull failed? → Manual git reset + restart
│     ├─ npm install failed? → Check node_modules, rebuild
│     ├─ Backend crashed? → Check Python version, deps
│     └─ Frontend build failed? → Check TypeScript errors
└─ PM2 status shows running but health check fails
   └─ Check backend logs
      ├─ Database locked? → Restart app
      ├─ Agent dead? → Check Claude CLI auth
      ├─ Port conflict? → Kill existing process
      └─ Unknown error? → Check full error stack

Slow Response?
├─ Check CPU: top -p $(pgrep -f "python")
├─ Check Memory: free -h
├─ Check Disk: df -h
└─ Restart: pm2 restart forge-simple

DB Issues?
└─ Check integrity: sqlite3 db.sqlite3 "PRAGMA integrity_check;"
   ├─ Corrupted? → Rebuild from backup
   └─ Locked? → Restart app
```

## Runbook Updates

This runbook was generated on **2026-04-05** from:
- `deploy/deploy.sh` — Deployment automation script
- `backend/server.py` — FastAPI configuration
- `CLAUDE.md` — System design and architecture

Update this runbook when:
- Deployment procedure changes
- New error conditions discovered
- Performance tuning applied
- Security issues fixed

Last verified: 2026-04-05
