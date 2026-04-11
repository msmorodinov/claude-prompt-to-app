# Admin System Status & Auth Management

**Date:** 2026-04-11
**Status:** SPEC (awaiting approval)

## Overview

Add a "System" tab to the admin panel showing runtime status (auth, CLI, sessions, MCP servers, uptime) and allow switching between Max OAuth and API key authentication modes. Two phases: read-only status first, then auth management.

## Motivation

Currently there is zero visibility into how the system authenticates with Claude. Auth is implicit — inherited from CLI's OAuth config. If auth breaks, sessions silently fail. Admins must SSH in and inspect env vars / CLI config manually.

## Phases

### Phase 1: Read-only System Status
- New "System" tab in admin (alongside Sessions, Apps)
- Compact status indicator (colored dot) in admin header
- `GET /admin/system-status` endpoint aggregating all system info

### Phase 2: Auth Management
- Switch between API key and Max OAuth modes from the UI
- Input/remove API key
- Test connection button
- Warning when changing auth with active sessions

## Backend

### Database: `system_config` table

```sql
CREATE TABLE IF NOT EXISTS system_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

| key | values | description |
|-----|--------|-------------|
| `auth_mode` | `"max_oauth"` (default) / `"api_key"` | Active auth mode |
| `api_key` | `"sk-ant-..."` | Anthropic API key, plain text |

No `oauth_token` stored — CLI manages Max OAuth tokens automatically via `~/.claude/credentials.json`.

**Security model:** No encryption. Localhost-only access (same as all admin endpoints). DB file should have `0600` permissions. This is documented as "localhost-only by design."

### New module: `backend/system_config.py`

Follows same DB access pattern as `db.py`: `async with aiosqlite.connect(DB_PATH) as db:` per call.

Functions:
- `get_system_config() -> dict` — read all config from `system_config` table
- `set_auth_mode(mode: str, api_key: str | None) -> None` — write mode + optional key
- `delete_api_key() -> None` — remove key, reset to `max_oauth`
- `get_auth_env() -> dict[str, str]` — returns env vars dict for `ClaudeAgentOptions.env`

`get_auth_env()` logic:
```python
async def get_auth_env() -> dict[str, str]:
    config = await get_system_config()
    if config.get("auth_mode") == "api_key" and config.get("api_key"):
        return {"ANTHROPIC_API_KEY": config["api_key"]}
    return {}  # empty = CLI uses its own OAuth
```

### Endpoint: `GET /admin/system-status`

Response schema:
```json
{
  "auth": {
    "mode": "max_oauth",
    "has_credentials": true,
    "credentials_note": "Managed by CLI",
    "last_test": {
      "ok": true,
      "at": "2026-04-11T15:00:00Z",
      "detail": "CLI accessible"
    }
  },
  "cli": {
    "version": "1.0.42",
    "available": true
  },
  "server": {
    "uptime_seconds": 3600,
    "started_at": "2026-04-11T12:00:00Z"
  },
  "sessions": {
    "active": 2,
    "waiting_input": 1,
    "total": 15,
    "last_activity": "2026-04-11T14:55:00Z"
  },
  "mcp_servers": [
    {"name": "Deepwiki", "command": "https://mcp.deepwiki.com/mcp", "status": "connected"},
    {"name": "Context7", "command": "npx ...", "status": "connected"}
  ]
}
```

Data sources:
| Field | Source | Caching |
|-------|--------|---------|
| `auth` | `system_config` table + in-memory `_last_auth_test` | Config from DB; test result in memory (reset to `null` on server restart → UI shows "Never tested") |
| `cli.version` | `claude --version` subprocess | Cached at server startup (`_CLI_VERSION_CACHE`) |
| `cli.available` | `shutil.which("claude")` | Cached at server startup |
| `server` | `_SERVER_START_TIME = time.time()` at startup | Computed on request |
| `sessions.active/waiting_input` | In-memory `_sessions` dict, filter by status | Live count |
| `sessions.total` | `SELECT COUNT(*) FROM sessions` | Live query |
| `sessions.last_activity` | `SELECT MAX(updated_at) FROM sessions` | Live query |
| `mcp_servers` | Reuse existing `mcp_servers()` function from server.py | Cached for 60s (shared cache with `/api/mcp-servers`) |

### Phase 2 Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/admin/auth/mode` | `{"mode": "api_key", "api_key": "sk-..."}` or `{"mode": "max_oauth"}` | Switch auth mode |
| `POST` | `/admin/auth/test` | — | Test current auth, cache result |
| `DELETE` | `/admin/auth/api-key` | — | Remove key, switch to max_oauth |

**`POST /admin/auth/test`** runs `claude --version` (verifies CLI binary is callable with current env). Does NOT run a model call — no quota spent. This tests CLI availability, not auth credentials. Result stored in memory as `_last_auth_test = {"ok": bool, "at": str, "detail": str}`. Initial value is `null` (lost on server restart — UI shows "Never tested").

**`POST /admin/auth/mode` validation:** If `mode == "api_key"`, `api_key` must be a non-empty string; return 422 otherwise. If `mode == "max_oauth"`, `api_key` field is ignored.

**Race condition policy:** Auth changes take effect on next new session only. Active/waiting sessions keep their original env. If sessions are active when auth changes, endpoint returns `{"warning": "N active sessions will keep using previous auth until they complete."}`.

### Integration with agent.py

In `run_agent()`, before creating `ClaudeSDKClient`:

```python
from backend.system_config import get_auth_env

options = ClaudeAgentOptions(
    env=await get_auth_env(),
    # ... existing options
)
```

No other changes to agent.py. The `env` field on `ClaudeAgentOptions` passes env vars to the CLI subprocess.

## Frontend

### New files
- `frontend/src/components/admin/SystemStatus.tsx` — System tab content

### Modified files
- `frontend/src/pages/AdminPage.tsx` — add `'system'` to `AdminTab` type, add tab button and render `SystemStatus`
- `frontend/src/api-admin.ts` — add `fetchSystemStatus()`, `testAuth()`, `setAuthMode()`, `deleteApiKey()`

### AdminPage changes

```typescript
type AdminTab = 'sessions' | 'apps' | 'system'
```

New tab button in header nav. System tab renders `<SystemStatus />` full-width (no list/detail split).

### SystemStatus component

Five cards in a responsive grid (2 columns on desktop, 1 on mobile):

1. **Auth Card**
   - Phase 1: Shows mode label ("Max Subscription" / "API Key"), credential status, last test result with timestamp
   - Phase 2: Adds mode switcher (two radio buttons), API key input (masked with show/hide toggle), "Test Connection" button, warning banner if active sessions exist

2. **CLI Card** — version string, availability indicator

3. **Sessions Card** — active / waiting / total counts, last activity relative time

4. **MCP Servers Card** — list with status badges (connected = green, needs_auth = yellow, error = red)

5. **Server Card** — uptime (formatted as "2h 15m"), started_at timestamp

### Header status indicator

Small dot (8px) next to "Admin" title in header:
- Green: `auth.has_credentials && cli.available`
- Yellow: `!auth.last_test` (never tested) or any MCP server `needs_auth`
- Red: `auth.last_test.ok === false` or `!cli.available`

### Polling strategy

- System tab active: poll `/admin/system-status` every 30 seconds
- System tab inactive: no polling
- On tab switch to System: immediate fetch
- After auth change (Phase 2): immediate re-fetch

### Styling

Follows existing admin dark theme:
- Card background: `var(--surface)` (#121215)
- Card border: `1px solid rgba(255,255,255,0.06)`
- Status badges: inline colored dots + text
- API key input: monospace font (JetBrains Mono), masked by default
- Grid gap: 16px, card padding: 20px

## Testing

### Backend tests (`backend/tests/test_system_config.py`)
- `test_default_config` — returns `max_oauth` when table is empty
- `test_set_api_key_mode` — stores key, returns correct env
- `test_delete_api_key` — resets to max_oauth
- `test_get_auth_env_max_oauth` — returns empty dict
- `test_get_auth_env_api_key` — returns `ANTHROPIC_API_KEY`
- `test_system_status_endpoint` — returns all fields with correct types
- `test_auth_test_endpoint` — caches result
- `test_auth_mode_change_warning` — warns about active sessions

### Frontend tests (`frontend/src/__tests__/SystemStatus.test.tsx`)
- Renders all 5 cards
- Shows correct auth mode label
- Status indicator color logic
- Phase 2: mode switch updates UI
- Phase 2: API key input masked/unmasked toggle
- Phase 2: active session warning shown

### E2E (later, not in scope)
- Navigate to /admin, click System tab, verify cards render

## Migration

`db.py` — add `system_config` table creation to `init_db()`:
```python
await db.execute("""
    CREATE TABLE IF NOT EXISTS system_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
""")
```

No data migration needed — empty table defaults to `max_oauth` mode.

## Out of scope

- OAuth flow automation (redirecting to Anthropic's OAuth page)
- Token refresh management (CLI handles this)
- Encryption of stored API keys (localhost-only)
- Admin authentication (existing "no auth, localhost only" policy)
- Quota usage tracking (not reliably available from CLI)
- Actual auth credential validation (test only checks CLI availability, not whether credentials are valid)

## `has_credentials` semantics

| Mode | `has_credentials` | `credentials_note` |
|------|-------------------|---------------------|
| `max_oauth` | Always `true` | `"Managed by CLI"` — CLI handles OAuth tokens via `~/.claude/credentials.json`; backend cannot inspect them |
| `api_key` | `true` if `api_key` exists in `system_config` | `null` |
| (no config) | `true` (defaults to `max_oauth`) | `"Managed by CLI"` |
