# Admin System Status & Auth Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "System" tab to admin showing runtime status (auth, CLI, sessions, MCP servers, uptime) and allow switching between Max OAuth and API key authentication.

**Architecture:** New `system_config` KV table in SQLite for auth settings. New `backend/system_config.py` module for config CRUD + auth env builder. New `GET /admin/system-status` endpoint aggregating data from DB, in-memory sessions, and cached CLI info. Frontend adds `SystemStatus.tsx` component rendered in a new "System" tab. Phase 1 is read-only; Phase 2 adds auth management endpoints and UI.

**Tech Stack:** Python/FastAPI, aiosqlite, React/TypeScript, existing admin CSS patterns

**Spec:** `docs/superpowers/specs/2026-04-11-admin-system-status-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|----------------|
| `backend/system_config.py` | `system_config` table CRUD, `get_auth_env()` |
| `backend/tests/test_system_config.py` | Tests for system_config module |
| `frontend/src/components/admin/SystemStatus.tsx` | System tab UI component |
| `frontend/src/__tests__/SystemStatus.test.tsx` | Frontend tests for SystemStatus |

### Modified files
| File | Changes |
|------|---------|
| `backend/db.py` | Add `system_config` table to `init_db()` |
| `backend/server.py` | Add `/admin/system-status` endpoint, cache CLI version at startup, add Phase 2 auth endpoints |
| `backend/agent.py` | Import and use `get_auth_env()` in `run_agent()` |
| `frontend/src/pages/AdminPage.tsx` | Add `'system'` tab type, render `SystemStatus` |
| `frontend/src/api-admin.ts` | Add `fetchSystemStatus()`, Phase 2: `setAuthMode()`, `testAuth()`, `deleteApiKey()` |
| `frontend/src/styles/admin.css` | Add system status card styles, header dot indicator |
| `CLAUDE.md` | Add `system_config.py` to project structure |

---

## Phase 1: Read-Only System Status

### Task 1: Database — `system_config` table

**Files:**
- Modify: `backend/db.py` (inside `init_db()`, after existing CREATE TABLE statements)
- Create: `backend/system_config.py`
- Create: `backend/tests/test_system_config.py`

- [ ] **Step 1: Write failing tests for system_config module**

```python
# backend/tests/test_system_config.py
"""Tests for system_config module."""
import pytest
from backend.system_config import get_system_config, get_auth_env

pytestmark = pytest.mark.asyncio


class TestGetSystemConfig:
    async def test_empty_table_returns_defaults(self, tmp_db):
        config = await get_system_config(tmp_db)
        assert config["auth_mode"] == "max_oauth"
        assert config.get("api_key") is None

    async def test_reads_stored_values(self, tmp_db):
        from backend.system_config import set_auth_mode
        await set_auth_mode("api_key", "sk-ant-test123", tmp_db)
        config = await get_system_config(tmp_db)
        assert config["auth_mode"] == "api_key"
        assert config["api_key"] == "sk-ant-test123"


class TestGetAuthEnv:
    async def test_max_oauth_returns_empty(self, tmp_db):
        env = await get_auth_env(tmp_db)
        assert env == {}

    async def test_api_key_returns_env_var(self, tmp_db):
        from backend.system_config import set_auth_mode
        await set_auth_mode("api_key", "sk-ant-test123", tmp_db)
        env = await get_auth_env(tmp_db)
        assert env == {"ANTHROPIC_API_KEY": "sk-ant-test123"}

    async def test_api_key_mode_without_key_returns_empty(self, tmp_db):
        from backend.system_config import set_auth_mode
        await set_auth_mode("max_oauth", None, tmp_db)
        env = await get_auth_env(tmp_db)
        assert env == {}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_system_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.system_config'`

- [ ] **Step 3: Add `system_config` table to `init_db()`**

In `backend/db.py`, inside `init_db()`, after the existing `CREATE TABLE` statements (around line 87), add:

```python
        await db.execute("""
            CREATE TABLE IF NOT EXISTS system_config (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
```

- [ ] **Step 4: Check if `tmp_db` fixture exists in conftest.py**

Run: `cd backend && grep -n "tmp_db" tests/conftest.py`

If it doesn't exist, add it to `backend/tests/conftest.py`:

```python
@pytest.fixture
async def tmp_db(tmp_path):
    db_path = tmp_path / "test.db"
    await init_db(db_path)
    yield db_path
```

Ensure `init_db` accepts an optional `db_path` parameter. Check existing signature — if it doesn't, the `system_config` module should use `DB_PATH` from `db.py` as default and accept override for testing.

- [ ] **Step 5: Implement `backend/system_config.py`**

```python
"""System configuration: auth mode, API key storage, auth env builder."""
from pathlib import Path

import aiosqlite

from backend.db import DB_PATH, _get_db


async def get_system_config(db_path: str | Path = DB_PATH) -> dict:
    """Read all system config. Returns defaults for missing keys."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute("SELECT key, value FROM system_config")
        rows = await cursor.fetchall()
        config = {row["key"]: row["value"] for row in rows}
        return {
            "auth_mode": config.get("auth_mode", "max_oauth"),
            "api_key": config.get("api_key"),
        }
    finally:
        await db.close()


async def set_auth_mode(
    mode: str, api_key: str | None = None, db_path: str | Path = DB_PATH
) -> None:
    """Set auth mode and optionally store API key."""
    db = await _get_db(db_path)
    try:
        await db.execute(
            "INSERT OR REPLACE INTO system_config (key, value) VALUES ('auth_mode', ?)",
            (mode,),
        )
        if mode == "api_key" and api_key:
            await db.execute(
                "INSERT OR REPLACE INTO system_config (key, value) VALUES ('api_key', ?)",
                (api_key,),
            )
        elif mode == "max_oauth":
            await db.execute("DELETE FROM system_config WHERE key = 'api_key'")
        await db.commit()
    finally:
        await db.close()


async def delete_api_key(db_path: str | Path = DB_PATH) -> None:
    """Remove API key and reset to max_oauth."""
    await set_auth_mode("max_oauth", db_path=db_path)


async def get_auth_env(db_path: str | Path = DB_PATH) -> dict[str, str]:
    """Return env vars dict for ClaudeAgentOptions.env."""
    config = await get_system_config(db_path)
    if config["auth_mode"] == "api_key" and config.get("api_key"):
        return {"ANTHROPIC_API_KEY": config["api_key"]}
    return {}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_system_config.py -v`
Expected: All 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/system_config.py backend/tests/test_system_config.py backend/db.py
git commit -m "feat: add system_config table and auth config module"
```

---

### Task 2: Backend — `/admin/system-status` endpoint

**Files:**
- Modify: `backend/server.py` — add endpoint, startup cache, server start time
- Test: `backend/tests/test_server.py`

**Depends on:** Task 1

- [ ] **Step 1: Write failing test for system-status endpoint**

Add to `backend/tests/test_server.py`:

```python
class TestSystemStatus:
    async def test_returns_all_fields(self, client):
        resp = await client.get("/admin/system-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "auth" in data
        assert "cli" in data
        assert "server" in data
        assert "sessions" in data
        assert data["auth"]["mode"] == "max_oauth"
        assert data["auth"]["has_credentials"] is True
        assert isinstance(data["server"]["uptime_seconds"], (int, float))
        assert isinstance(data["sessions"]["active"], int)
        assert isinstance(data["sessions"]["total"], int)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_server.py::TestSystemStatus -v`
Expected: FAIL — 404 Not Found

- [ ] **Step 3: Add startup caching and server start time**

At the top of `backend/server.py`, after existing imports, add:

```python
import shutil
import time

from backend.system_config import get_system_config
```

After the `app = FastAPI(...)` line, add module-level state:

```python
_SERVER_START_TIME: float = 0.0
_CLI_VERSION_CACHE: str | None = None
_CLI_AVAILABLE: bool = False
_last_auth_test: dict | None = None
```

In the `lifespan()` function, after `await init_db()`, add:

```python
    global _SERVER_START_TIME, _CLI_VERSION_CACHE, _CLI_AVAILABLE
    _SERVER_START_TIME = time.time()
    claude_bin = shutil.which("claude")
    _CLI_AVAILABLE = claude_bin is not None
    if claude_bin:
        try:
            proc = await asyncio.create_subprocess_exec(
                claude_bin, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
            if proc.returncode == 0:
                _CLI_VERSION_CACHE = stdout.decode().strip()
        except (asyncio.TimeoutError, OSError):
            pass
```

- [ ] **Step 4: Implement the endpoint**

Add before the `/health` endpoint:

```python
@app.get("/admin/system-status")
async def system_status_admin() -> dict:
    """Aggregated system status for admin dashboard."""
    config = await get_system_config()

    # Auth info
    if config["auth_mode"] == "api_key":
        has_credentials = bool(config.get("api_key"))
        credentials_note = None
    else:
        has_credentials = True
        credentials_note = "Managed by CLI"

    # Session counts from in-memory state
    all_live = sessions.list_all()
    active_count = sum(1 for s in all_live if s.status == "active")
    waiting_count = sum(1 for s in all_live if s.status == "waiting_input")

    # Total sessions from DB
    db_sessions = await get_all_sessions_admin()
    total_count = len(db_sessions)
    last_activity = None
    if db_sessions:
        last_activity = max(
            (s.get("created_at", "") for s in db_sessions), default=None
        )

    # MCP servers (reuse existing function)
    mcp = await mcp_servers()

    return {
        "auth": {
            "mode": config["auth_mode"],
            "has_credentials": has_credentials,
            "credentials_note": credentials_note,
            "last_test": _last_auth_test,
        },
        "cli": {
            "version": _CLI_VERSION_CACHE,
            "available": _CLI_AVAILABLE,
        },
        "server": {
            "uptime_seconds": int(time.time() - _SERVER_START_TIME),
            "started_at": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ", time.gmtime(_SERVER_START_TIME)
            ),
        },
        "sessions": {
            "active": active_count,
            "waiting_input": waiting_count,
            "total": total_count,
            "last_activity": last_activity,
        },
        "mcp_servers": mcp,
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_server.py::TestSystemStatus -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/server.py backend/tests/test_server.py
git commit -m "feat: add /admin/system-status endpoint with cached CLI info"
```

---

### Task 3: Frontend — API helpers for system status

**Files:**
- Modify: `frontend/src/api-admin.ts`
- No test file needed — covered by integration in Task 5

**Depends on:** Task 2

- [ ] **Step 1: Add types and fetch function**

Add to `frontend/src/api-admin.ts`:

```typescript
export interface AuthStatus {
  mode: 'max_oauth' | 'api_key'
  has_credentials: boolean
  credentials_note: string | null
  last_test: {
    ok: boolean
    at: string
    detail: string
  } | null
}

export interface SystemStatus {
  auth: AuthStatus
  cli: {
    version: string | null
    available: boolean
  }
  server: {
    uptime_seconds: number
    started_at: string
  }
  sessions: {
    active: number
    waiting_input: number
    total: number
    last_activity: string | null
  }
  mcp_servers: McpServer[]
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  return request('/admin/system-status')
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api-admin.ts
git commit -m "feat: add SystemStatus types and fetchSystemStatus API helper"
```

---

### Task 4: Frontend — SystemStatus component

**Files:**
- Create: `frontend/src/components/admin/SystemStatus.tsx`
- Create: `frontend/src/__tests__/SystemStatus.test.tsx`

**Depends on:** Task 3

- [ ] **Step 1: Write failing tests**

```typescript
// frontend/src/__tests__/SystemStatus.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SystemStatus from '../components/admin/SystemStatus'

const mockStatus = {
  auth: {
    mode: 'max_oauth' as const,
    has_credentials: true,
    credentials_note: 'Managed by CLI',
    last_test: null,
  },
  cli: { version: '1.0.42', available: true },
  server: { uptime_seconds: 3600, started_at: '2026-04-11T12:00:00Z' },
  sessions: { active: 2, waiting_input: 1, total: 15, last_activity: '2026-04-11T14:55:00Z' },
  mcp_servers: [
    { name: 'Deepwiki', command: 'https://mcp.deepwiki.com/mcp', status: 'connected' },
    { name: 'Context7', command: 'npx ...', status: 'needs_auth' },
  ],
}

vi.mock('../api-admin', () => ({
  fetchSystemStatus: vi.fn(() => Promise.resolve(mockStatus)),
}))

describe('SystemStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all status cards', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Authentication')).toBeTruthy()
      expect(screen.getByText('Claude CLI')).toBeTruthy()
      expect(screen.getByText('Sessions')).toBeTruthy()
      expect(screen.getByText('MCP Servers')).toBeTruthy()
      expect(screen.getByText('Server')).toBeTruthy()
    })
  })

  it('shows Max Subscription label for max_oauth mode', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Max Subscription')).toBeTruthy()
    })
  })

  it('shows Never tested when last_test is null', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Never tested')).toBeTruthy()
    })
  })

  it('shows CLI version', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('1.0.42')).toBeTruthy()
    })
  })

  it('shows session counts', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy()  // active
      expect(screen.getByText('15')).toBeTruthy() // total
    })
  })

  it('renders MCP server statuses', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Deepwiki')).toBeTruthy()
      expect(screen.getByText('Context7')).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/SystemStatus.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SystemStatus component**

```typescript
// frontend/src/components/admin/SystemStatus.tsx
import { useState, useEffect, useCallback } from 'react'
import { fetchSystemStatus } from '../../api-admin'
import type { SystemStatus as SystemStatusType } from '../../api-admin'

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected' ? 'var(--success, #4ade80)' :
    status === 'needs_auth' ? 'var(--warning, #facc15)' :
    'var(--error, #e85454)'
  return <span className="system-dot" style={{ background: color }} />
}

export function getHeaderDotColor(data: SystemStatusType | null): string {
  if (!data) return 'var(--text-muted, #666)'
  if (!data.cli.available || data.auth.last_test?.ok === false) {
    return 'var(--error, #e85454)'
  }
  if (
    !data.auth.last_test ||
    data.mcp_servers.some(s => s.status === 'needs_auth')
  ) {
    return 'var(--warning, #facc15)'
  }
  return 'var(--success, #4ade80)'
}

export default function SystemStatus() {
  const [data, setData] = useState<SystemStatusType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const status = await fetchSystemStatus()
      setData(status)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  if (error) {
    return <div className="system-status-error">Error: {error}</div>
  }

  if (!data) {
    return <div className="system-status-loading">Loading...</div>
  }

  return (
    <div className="system-status">
      {/* Auth Card */}
      <div className="system-card">
        <h3 className="system-card-title">Authentication</h3>
        <div className="system-card-row">
          <span className="system-label">Mode</span>
          <span className="system-value">
            {data.auth.mode === 'max_oauth' ? 'Max Subscription' : 'API Key'}
          </span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Credentials</span>
          <span className="system-value">
            {data.auth.has_credentials ? 'Configured' : 'Not set'}
            {data.auth.credentials_note && (
              <span className="system-note"> ({data.auth.credentials_note})</span>
            )}
          </span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Last test</span>
          <span className="system-value">
            {data.auth.last_test
              ? `${data.auth.last_test.ok ? '✓' : '✗'} ${data.auth.last_test.detail}`
              : 'Never tested'}
          </span>
        </div>
      </div>

      {/* CLI Card */}
      <div className="system-card">
        <h3 className="system-card-title">Claude CLI</h3>
        <div className="system-card-row">
          <span className="system-label">Version</span>
          <span className="system-value system-mono">
            {data.cli.version ?? 'Unknown'}
          </span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Status</span>
          <span className="system-value">
            <StatusDot status={data.cli.available ? 'connected' : 'error'} />
            {data.cli.available ? 'Available' : 'Not found'}
          </span>
        </div>
      </div>

      {/* Sessions Card */}
      <div className="system-card">
        <h3 className="system-card-title">Sessions</h3>
        <div className="system-card-row">
          <span className="system-label">Active</span>
          <span className="system-value">{data.sessions.active}</span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Waiting input</span>
          <span className="system-value">{data.sessions.waiting_input}</span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Total</span>
          <span className="system-value">{data.sessions.total}</span>
        </div>
        {data.sessions.last_activity && (
          <div className="system-card-row">
            <span className="system-label">Last activity</span>
            <span className="system-value system-mono">
              {new Date(data.sessions.last_activity).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* MCP Servers Card */}
      <div className="system-card">
        <h3 className="system-card-title">MCP Servers</h3>
        {data.mcp_servers.length === 0 ? (
          <div className="system-card-row">
            <span className="system-note">No MCP servers configured</span>
          </div>
        ) : (
          data.mcp_servers.map(s => (
            <div className="system-card-row" key={s.name}>
              <span className="system-value">
                <StatusDot status={s.status} />
                {s.name}
              </span>
              <span className="system-note">{s.status}</span>
            </div>
          ))
        )}
      </div>

      {/* Server Card */}
      <div className="system-card">
        <h3 className="system-card-title">Server</h3>
        <div className="system-card-row">
          <span className="system-label">Uptime</span>
          <span className="system-value">{formatUptime(data.server.uptime_seconds)}</span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Started</span>
          <span className="system-value system-mono">
            {new Date(data.server.started_at).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/SystemStatus.test.tsx`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/SystemStatus.tsx frontend/src/__tests__/SystemStatus.test.tsx
git commit -m "feat: add SystemStatus component with tests"
```

---

### Task 5: Frontend — Wire System tab into AdminPage

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx`
- Modify: `frontend/src/styles/admin.css`

**Depends on:** Task 4

- [ ] **Step 1: Add System tab to AdminPage**

In `frontend/src/pages/AdminPage.tsx`:

Update type:
```typescript
type AdminTab = 'sessions' | 'apps' | 'system'
```

Add import:
```typescript
import SystemStatus from '../components/admin/SystemStatus'
```

Add tab button after the Apps button inside `<nav className="admin-tabs">`:
```tsx
<button
  className={`admin-tab ${tab === 'system' ? 'active' : ''}`}
  data-testid="admin-tab"
  onClick={() => setTab('system')}
>
  System
</button>
```

Add System tab rendering. After the Apps tab `<>...</>` block, before the closing `</div>` of `admin-layout`, add:

```tsx
) : (
  <SystemStatus />
)}
```

Adjust the `admin-layout` className logic — System tab should be full-width (no sidebar):
```tsx
<div className={`admin-layout${tab === 'apps' && selectedAppId ? ' admin-layout--has-detail' : ''}${tab === 'system' ? ' admin-layout--full' : ''}`} data-testid="admin-layout">
```

- [ ] **Step 2: Add CSS for system status**

Append to `frontend/src/styles/admin.css`:

```css
/* System Status */
.admin-layout--full {
  grid-template-columns: 1fr;
}

.system-status {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  padding: 1.5rem 2rem;
  overflow-y: auto;
}

.system-status-loading,
.system-status-error {
  padding: 2rem;
  color: var(--text-muted, #888);
  font-family: var(--font-body, 'DM Sans', sans-serif);
}

.system-status-error {
  color: var(--error, #e85454);
}

.system-card {
  background: var(--surface, #121215);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.system-card-title {
  font-family: var(--font-heading, 'Playfair Display', serif);
  font-size: 1rem;
  font-weight: 600;
  color: var(--accent, #e8c46c);
  margin: 0;
}

.system-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.system-label {
  font-family: var(--font-body, 'DM Sans', sans-serif);
  font-size: 0.85rem;
  color: var(--text-muted, #888);
}

.system-value {
  font-family: var(--font-body, 'DM Sans', sans-serif);
  font-size: 0.85rem;
  color: var(--text-primary, #e0e0e0);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.system-mono {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.8rem;
}

.system-note {
  font-size: 0.75rem;
  color: var(--text-muted, #888);
}

.system-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Header status dot */
.admin-header-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: 0.5rem;
}

@media (max-width: 639px) {
  .system-status {
    grid-template-columns: 1fr;
    padding: 1rem;
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles and frontend tests pass**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: No type errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx frontend/src/styles/admin.css
git commit -m "feat: wire System tab into admin with status card styles"
```

---

### Task 6: Header status dot indicator

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx`

**Depends on:** Task 5

- [ ] **Step 1: Add header dot with polling**

In `AdminPage.tsx`, add imports and state:

```typescript
import { useState, useEffect } from 'react'
import { fetchSystemStatus } from '../api-admin'
import type { SystemStatus as SystemStatusType } from '../api-admin'
import { getHeaderDotColor } from '../components/admin/SystemStatus'
```

Add state inside `AdminPage()`:
```typescript
const [systemData, setSystemData] = useState<SystemStatusType | null>(null)
```

Add effect for polling (only when NOT on system tab, since SystemStatus polls itself):
```typescript
useEffect(() => {
  if (tab === 'system') return
  let cancelled = false
  const load = async () => {
    try {
      const data = await fetchSystemStatus()
      if (!cancelled) setSystemData(data)
    } catch { /* ignore */ }
  }
  load()
  const interval = setInterval(load, 60_000)
  return () => { cancelled = true; clearInterval(interval) }
}, [tab])
```

Add dot in header, after `<span className="admin-version">`:
```tsx
<span
  className="admin-header-dot"
  style={{ background: getHeaderDotColor(systemData) }}
  title={systemData ? `Auth: ${systemData.auth.mode}` : 'Loading...'}
/>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx
git commit -m "feat: add status indicator dot to admin header"
```

---

## Phase 2: Auth Management

### Task 7: Backend — Auth management endpoints

**Files:**
- Modify: `backend/server.py`
- Modify: `backend/tests/test_server.py`

**Depends on:** Task 2

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_server.py`:

```python
class TestAuthManagement:
    async def test_set_api_key_mode(self, client):
        resp = await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key", "api_key": "sk-ant-test123"},
        )
        assert resp.status_code == 200
        status = await client.get("/admin/system-status")
        assert status.json()["auth"]["mode"] == "api_key"

    async def test_set_max_oauth_mode(self, client):
        # First set API key, then switch back
        await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key", "api_key": "sk-ant-test123"},
        )
        resp = await client.post(
            "/admin/auth/mode",
            json={"mode": "max_oauth"},
        )
        assert resp.status_code == 200
        status = await client.get("/admin/system-status")
        assert status.json()["auth"]["mode"] == "max_oauth"

    async def test_api_key_mode_requires_key(self, client):
        resp = await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key"},
        )
        assert resp.status_code == 422

    async def test_delete_api_key(self, client):
        await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key", "api_key": "sk-ant-test123"},
        )
        resp = await client.delete("/admin/auth/api-key")
        assert resp.status_code == 200
        status = await client.get("/admin/system-status")
        assert status.json()["auth"]["mode"] == "max_oauth"

    async def test_auth_mode_warns_active_sessions(self, client):
        # This test may need mocking of sessions.list_all()
        resp = await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key", "api_key": "sk-ant-test123"},
        )
        data = resp.json()
        assert "warning" not in data or data["warning"] is None  # no active sessions in test
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_server.py::TestAuthManagement -v`
Expected: FAIL — 404 / 405

- [ ] **Step 3: Implement auth endpoints**

Add to `backend/server.py`, before the `/health` endpoint:

```python
from backend.system_config import set_auth_mode, delete_api_key


@app.post("/admin/auth/mode")
async def admin_set_auth_mode(request: Request) -> dict:
    """Switch auth mode. If api_key mode, api_key is required."""
    body = await request.json()
    mode = body.get("mode")
    api_key = body.get("api_key")

    if mode not in ("api_key", "max_oauth"):
        raise HTTPException(status_code=422, detail="Invalid mode")
    if mode == "api_key" and not api_key:
        raise HTTPException(status_code=422, detail="api_key required for api_key mode")

    await set_auth_mode(mode, api_key)

    # Warn about active sessions
    active = [s for s in sessions.list_all() if s.status in ("active", "waiting_input")]
    warning = None
    if active:
        warning = f"{len(active)} active session(s) will keep using previous auth until they complete."

    return {"ok": True, "mode": mode, "warning": warning}


@app.delete("/admin/auth/api-key")
async def admin_delete_api_key() -> dict:
    """Remove API key and reset to max_oauth."""
    await delete_api_key()
    return {"ok": True, "mode": "max_oauth"}


@app.post("/admin/auth/test")
async def admin_test_auth() -> dict:
    """Test CLI availability. Does not spend quota."""
    global _last_auth_test
    import time as _time

    claude_bin = shutil.which("claude")
    if not claude_bin:
        _last_auth_test = {
            "ok": False,
            "at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
            "detail": "Claude CLI not found",
        }
        return _last_auth_test

    try:
        proc = await asyncio.create_subprocess_exec(
            claude_bin, "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, _ = await asyncio.wait_for(proc.communicate(), timeout=5)
        ok = proc.returncode == 0
        _last_auth_test = {
            "ok": ok,
            "at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
            "detail": "CLI accessible" if ok else "CLI returned error",
        }
    except (asyncio.TimeoutError, OSError) as exc:
        _last_auth_test = {
            "ok": False,
            "at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
            "detail": f"CLI error: {exc}",
        }

    return _last_auth_test
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_server.py::TestAuthManagement -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/server.py backend/tests/test_server.py
git commit -m "feat: add auth management endpoints (set mode, test, delete)"
```

---

### Task 8: Backend — Inject auth env into agent

**Files:**
- Modify: `backend/agent.py`

**Depends on:** Task 1

- [ ] **Step 1: Add auth env injection**

In `backend/agent.py`, add import:
```python
from backend.system_config import get_auth_env
```

In `run_agent()`, modify the `ClaudeAgentOptions` construction to include `env`:

```python
    options = ClaudeAgentOptions(
        mcp_servers={"app": server},
        allowed_tools=allowed,
        disallowed_tools=["AskUserQuestion"],
        system_prompt=system_prompt,
        permission_mode="acceptEdits",
        resume=session.sdk_session_id,
        env=await get_auth_env(),
    )
```

- [ ] **Step 2: Run backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Commit**

```bash
git add backend/agent.py
git commit -m "feat: inject auth env from system_config into agent sessions"
```

---

### Task 9: Frontend — Auth management UI in SystemStatus

**Files:**
- Modify: `frontend/src/api-admin.ts`
- Modify: `frontend/src/components/admin/SystemStatus.tsx`
- Modify: `frontend/src/__tests__/SystemStatus.test.tsx`

**Depends on:** Tasks 4, 7

- [ ] **Step 1: Add Phase 2 API helpers**

In `frontend/src/api-admin.ts`, add:

```typescript
export async function setAuthMode(
  mode: 'api_key' | 'max_oauth',
  apiKey?: string
): Promise<{ ok: boolean; mode: string; warning: string | null }> {
  return request('/admin/auth/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, api_key: apiKey }),
  })
}

export async function testAuth(): Promise<{
  ok: boolean
  at: string
  detail: string
}> {
  return request('/admin/auth/test', { method: 'POST' })
}

export async function deleteApiKey(): Promise<{ ok: boolean; mode: string }> {
  return request('/admin/auth/api-key', { method: 'DELETE' })
}
```

- [ ] **Step 2: Write failing tests for auth management UI**

Add to `frontend/src/__tests__/SystemStatus.test.tsx`:

```typescript
import userEvent from '@testing-library/user-event'
import { setAuthMode, testAuth } from '../api-admin'

// Add to the existing vi.mock:
// vi.mock('../api-admin', () => ({
//   fetchSystemStatus: vi.fn(() => Promise.resolve(mockStatus)),
//   setAuthMode: vi.fn(() => Promise.resolve({ ok: true, mode: 'api_key', warning: null })),
//   testAuth: vi.fn(() => Promise.resolve({ ok: true, at: '2026-04-11T15:00:00Z', detail: 'CLI accessible' })),
//   deleteApiKey: vi.fn(() => Promise.resolve({ ok: true, mode: 'max_oauth' })),
// }))

describe('SystemStatus auth management', () => {
  it('shows mode switcher', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByLabelText('Max Subscription')).toBeTruthy()
      expect(screen.getByLabelText('API Key')).toBeTruthy()
    })
  })

  it('shows API key input when API Key mode selected', async () => {
    const user = userEvent.setup()
    render(<SystemStatus />)
    await waitFor(() => screen.getByLabelText('API Key'))
    await user.click(screen.getByLabelText('API Key'))
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeTruthy()
  })

  it('has test connection button', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Test CLI')).toBeTruthy()
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/SystemStatus.test.tsx`
Expected: FAIL — mode switcher elements not found

- [ ] **Step 4: Add auth management UI to SystemStatus**

Update the Auth Card section in `SystemStatus.tsx`. Replace the existing Auth Card with:

```typescript
// Add state at the top of the component:
const [localMode, setLocalMode] = useState<'max_oauth' | 'api_key'>('max_oauth')
const [apiKeyInput, setApiKeyInput] = useState('')
const [showKey, setShowKey] = useState(false)
const [saving, setSaving] = useState(false)
const [testing, setTesting] = useState(false)
const [warning, setWarning] = useState<string | null>(null)

// Sync localMode with fetched data:
useEffect(() => {
  if (data) setLocalMode(data.auth.mode)
}, [data?.auth.mode])

// Handlers:
const handleSaveMode = async () => {
  setSaving(true)
  setWarning(null)
  try {
    const result = await setAuthMode(
      localMode,
      localMode === 'api_key' ? apiKeyInput : undefined
    )
    if (result.warning) setWarning(result.warning)
    await load()
    setApiKeyInput('')
  } finally {
    setSaving(false)
  }
}

const handleTest = async () => {
  setTesting(true)
  try {
    await testAuth()
    await load()
  } finally {
    setTesting(false)
  }
}
```

Replace the Auth Card JSX:

```tsx
{/* Auth Card */}
<div className="system-card">
  <h3 className="system-card-title">Authentication</h3>

  <div className="system-card-row">
    <label className="system-radio">
      <input
        type="radio"
        name="auth-mode"
        checked={localMode === 'max_oauth'}
        onChange={() => setLocalMode('max_oauth')}
      />
      Max Subscription
    </label>
    <label className="system-radio">
      <input
        type="radio"
        name="auth-mode"
        checked={localMode === 'api_key'}
        onChange={() => setLocalMode('api_key')}
      />
      API Key
    </label>
  </div>

  {localMode === 'api_key' && (
    <div className="system-card-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type={showKey ? 'text' : 'password'}
          className="system-input"
          placeholder="sk-ant-..."
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
        />
        <button
          className="system-btn-small"
          onClick={() => setShowKey(v => !v)}
          type="button"
        >
          {showKey ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )}

  {localMode !== data?.auth.mode || (localMode === 'api_key' && apiKeyInput) ? (
    <button
      className="system-btn-primary"
      onClick={handleSaveMode}
      disabled={saving || (localMode === 'api_key' && !apiKeyInput)}
    >
      {saving ? 'Saving...' : 'Save'}
    </button>
  ) : null}

  {warning && <div className="system-warning">{warning}</div>}

  <div className="system-card-row">
    <span className="system-label">Credentials</span>
    <span className="system-value">
      {data.auth.has_credentials ? 'Configured' : 'Not set'}
      {data.auth.credentials_note && (
        <span className="system-note"> ({data.auth.credentials_note})</span>
      )}
    </span>
  </div>

  <div className="system-card-row">
    <span className="system-label">Last test</span>
    <span className="system-value">
      {data.auth.last_test
        ? `${data.auth.last_test.ok ? '✓' : '✗'} ${data.auth.last_test.detail}`
        : 'Never tested'}
    </span>
  </div>

  <button
    className="system-btn-secondary"
    onClick={handleTest}
    disabled={testing}
  >
    {testing ? 'Testing...' : 'Test CLI'}
  </button>
</div>
```

- [ ] **Step 5: Add Phase 2 CSS**

Append to `frontend/src/styles/admin.css`:

```css
/* System Status - Phase 2 */
.system-radio {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-body, 'DM Sans', sans-serif);
  font-size: 0.85rem;
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
}

.system-radio input[type="radio"] {
  accent-color: var(--accent, #e8c46c);
}

.system-input {
  flex: 1;
  background: var(--bg, #08080a);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  color: var(--text-primary, #e0e0e0);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.8rem;
}

.system-input:focus {
  outline: none;
  border-color: var(--accent, #e8c46c);
}

.system-btn-primary {
  background: var(--accent, #e8c46c);
  color: var(--bg, #08080a);
  border: none;
  border-radius: 4px;
  padding: 0.4rem 0.8rem;
  font-family: var(--font-body, 'DM Sans', sans-serif);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.system-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.system-btn-secondary {
  background: transparent;
  color: var(--text-primary, #e0e0e0);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 0.35rem 0.7rem;
  font-family: var(--font-body, 'DM Sans', sans-serif);
  font-size: 0.8rem;
  cursor: pointer;
}

.system-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.system-btn-small {
  background: transparent;
  color: var(--text-muted, #888);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.system-warning {
  background: rgba(250, 204, 21, 0.1);
  border: 1px solid var(--warning, #facc15);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  color: var(--warning, #facc15);
}
```

- [ ] **Step 6: Update the mock in tests to include Phase 2 functions**

Update the `vi.mock` in `SystemStatus.test.tsx`:

```typescript
vi.mock('../api-admin', () => ({
  fetchSystemStatus: vi.fn(() => Promise.resolve(mockStatus)),
  setAuthMode: vi.fn(() => Promise.resolve({ ok: true, mode: 'api_key', warning: null })),
  testAuth: vi.fn(() => Promise.resolve({ ok: true, at: '2026-04-11T15:00:00Z', detail: 'CLI accessible' })),
  deleteApiKey: vi.fn(() => Promise.resolve({ ok: true, mode: 'max_oauth' })),
}))
```

- [ ] **Step 7: Run all tests**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: All tests pass, no type errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api-admin.ts frontend/src/components/admin/SystemStatus.tsx frontend/src/__tests__/SystemStatus.test.tsx frontend/src/styles/admin.css
git commit -m "feat: add auth management UI to System tab"
```

---

### Task 10: Documentation — Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Depends on:** All tasks

- [ ] **Step 1: Update Project Structure**

Add `system_config.py` to the backend section in the project structure tree:

```
│   ├── system_config.py   # System config: auth mode, API key storage
```

Add `SystemStatus.tsx` to the admin components section:

```
│       │       ├── SystemStatus.tsx        # System status & auth management tab
```

- [ ] **Step 2: Update API Endpoints table**

Add to the "Session & Chat" or a new "System" section:

```
| `GET`    | `/admin/system-status`     | Aggregated system status (auth, CLI, sessions, MCP) |
| `POST`   | `/admin/auth/mode`         | Switch auth mode (api_key / max_oauth) |
| `POST`   | `/admin/auth/test`         | Test CLI availability |
| `DELETE`  | `/admin/auth/api-key`      | Remove API key, reset to max_oauth |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add system status and auth endpoints to project structure"
```

---

## Summary

| Task | Description | Phase | Depends on |
|------|-------------|-------|------------|
| 1 | DB table + `system_config.py` module | 1 | — |
| 2 | `/admin/system-status` endpoint | 1 | 1 |
| 3 | Frontend API helpers | 1 | 2 |
| 4 | `SystemStatus.tsx` component | 1 | 3 |
| 5 | Wire System tab into AdminPage | 1 | 4 |
| 6 | Header status dot indicator | 1 | 5 |
| 7 | Auth management endpoints | 2 | 2 |
| 8 | Inject auth env into agent | 2 | 1 |
| 9 | Auth management UI | 2 | 4, 7 |
| 10 | Update CLAUDE.md | — | All |
