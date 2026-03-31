# Multi-App Prompt Management with Versioning

**Status:** PENDING APPROVAL
**Date:** 2026-03-31
**Complexity:** L (4-5 days)

## Overview

Replace the single hardcoded `prompt.md` file with a DB-backed multi-app system. Each "app" is a named prompt stored in SQLite. Admins can create, edit, and version prompts through a CRUD editor in the admin panel. Users see an app selector on the start screen when multiple apps exist. Every prompt edit creates a new immutable version; sessions lock to the version active at creation time.

**Variant:** Full multi-app (Variant 1 from idea doc).

### Key Design Decisions

- **Two new tables:** `apps` + `prompt_versions`. `sessions` gains `app_id` + `prompt_version_id` FK columns.
- **DB is authoritative.** `prompt.md` becomes seed-only (read once on first migration if no apps exist).
- **Version immutability:** Each edit creates a new `prompt_versions` row. Sessions lock to a version at creation time. Old sessions never break.
- **Admin panel gets tab navigation:** "Sessions" tab (existing) + "Apps" tab (new CRUD + version history + diff).
- **User-facing start screen:** App selector grid replaces the single "Start" button when 2+ apps exist. Single-app mode auto-selects (no friction added).
- **Diff:** Frontend-side `diff-match-patch` library for line-level diff visualization. No backend diff computation.
- **Prompt validation:** Backend validates non-empty body, valid frontmatter (title required) before saving a version.
- **No auth changes** -- admin remains unprotected (Tailscale-only deployment).

### Touch Points

| Layer | Files Modified | Files Created |
|-------|---------------|---------------|
| Backend DB | `db.py` | -- |
| Backend API | `server.py` | `admin_apps.py` (new router) |
| Backend config | `prompt_config.py` | -- |
| Backend agent | `agent.py` | -- |
| Backend session | `session.py` | -- |
| Frontend API | `api.ts`, `api-admin.ts` | -- |
| Frontend types | `types.ts` | -- |
| Frontend pages | `AdminPage.tsx` | -- |
| Frontend components | `ChatContainer.tsx` | `AppSelector.tsx`, `admin/AppList.tsx`, `admin/AppEditor.tsx`, `admin/VersionHistory.tsx`, `admin/VersionDiff.tsx` |
| Frontend styles | `admin.css` | -- |
| Tests | `test_db.py`, `test_server.py` | `test_admin_apps.py` |

---

## 1. Database Schema

### Migration from user_version 1 to 2

File: `backend/db.py` -- extend `_migrate()`.

```sql
-- New table: apps
CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL COLLATE NOCASE,  -- URL-safe identifier, case-insensitive
    title TEXT NOT NULL,                -- Display title
    subtitle TEXT DEFAULT '',           -- Optional subtitle
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),  -- App lifecycle
    current_version_id INTEGER,         -- FK to prompt_versions.id (latest published)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- New table: prompt_versions
CREATE TABLE IF NOT EXISTS prompt_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id INTEGER NOT NULL,
    body TEXT NOT NULL,                 -- Full prompt markdown (no frontmatter)
    change_note TEXT DEFAULT '',        -- Optional note ("fixed competitor section")
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (app_id) REFERENCES apps(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prompt_versions_app_id ON prompt_versions(app_id);
CREATE INDEX IF NOT EXISTS idx_sessions_app_id ON sessions(app_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);  -- pre-existing gap

-- Add columns to sessions (with column-exists guard for retry safety)
-- SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS, so check PRAGMA table_info first
ALTER TABLE sessions ADD COLUMN app_id INTEGER DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN prompt_version_id INTEGER DEFAULT NULL;
```

### Seed logic (inside migration to version 2)

1. If `prompt.md` exists, parse frontmatter via existing `load_prompt()` to get `title`, `subtitle`, and `body`.
2. Insert into `apps`: `slug='default', title=<from frontmatter>, subtitle=<from frontmatter>, is_active=1`.
3. Insert into `prompt_versions`: `app_id=<new app id>, body=<prompt body>, change_note='Seeded from prompt.md'`.
4. Update `apps` SET `current_version_id = <new version id>`.
5. Backfill all existing sessions: `UPDATE sessions SET app_id = <app id>, prompt_version_id = <version id> WHERE app_id IS NULL`.
6. If `prompt.md` does not exist, insert a minimal placeholder: `title='Default App', body='You are a helpful assistant.'`.

### Complete migration code

**DB connection setup** (apply on every `aiosqlite.connect()` call):

```python
async def _get_db(db_path=DB_PATH):
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA journal_mode = WAL")
    return db
```

**Helper for safe ALTER TABLE** (SQLite lacks `ADD COLUMN IF NOT EXISTS`):

```python
async def _column_exists(db, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)
```

**Migration code:**

```python
from backend.prompt_config import load_prompt  # top-level import, not inside migration

if version < 2:
    # 1. Create tables
    await db.execute("""
        CREATE TABLE IF NOT EXISTS apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL COLLATE NOCASE,
            title TEXT NOT NULL,
            subtitle TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
            current_version_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            change_note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (app_id) REFERENCES apps(id)
        )
    """)

    # 2. Indexes (IF NOT EXISTS is safe for retries)
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_prompt_versions_app_id ON prompt_versions(app_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_app_id ON sessions(app_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)"
    )

    # 3. Add columns to sessions (safe for retry — check existence first)
    if not await _column_exists(db, "sessions", "app_id"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN app_id INTEGER DEFAULT NULL"
        )
    if not await _column_exists(db, "sessions", "prompt_version_id"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN prompt_version_id INTEGER DEFAULT NULL"
        )

    # 4. Seed from prompt.md
    prompt_path = Path(__file__).parent / "prompt.md"
    if prompt_path.exists():
        meta, body = load_prompt()
        title = meta.get("title", "Default App")
        subtitle = meta.get("subtitle", "")
    else:
        title, subtitle, body = "Default App", "", "You are a helpful assistant."

    await db.execute(
        "INSERT INTO apps (slug, title, subtitle) VALUES (?, ?, ?)",
        ("default", title, subtitle),
    )
    app_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
    app_id = app_row[0]

    await db.execute(
        "INSERT INTO prompt_versions (app_id, body, change_note) VALUES (?, ?, ?)",
        (app_id, body, "Seeded from prompt.md"),
    )
    ver_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
    version_id = ver_row[0]

    await db.execute(
        "UPDATE apps SET current_version_id = ? WHERE id = ?",
        (version_id, app_id),
    )

    # 5. Backfill existing sessions
    await db.execute(
        "UPDATE sessions SET app_id = ?, prompt_version_id = ? WHERE app_id IS NULL",
        (app_id, version_id),
    )

    await db.execute("PRAGMA user_version = 2")
    await db.commit()
```

---

## 2. Backend API

### New file: `backend/admin_apps.py`

A FastAPI `APIRouter` with prefix `/admin/apps`. Keeps `server.py` clean.

#### Endpoints

**`GET /admin/apps`** -- List all apps with version count.

```python
# Response: [{id, slug, title, subtitle, is_active, current_version_id, created_at, updated_at, version_count}]
# Ordered by created_at DESC
```

**`POST /admin/apps`** -- Create a new app with its first version.

```python
# Body: {slug: str, title: str, subtitle?: str, body: str}
# Validation:
#   - slug: ^[a-z0-9][a-z0-9-]*[a-z0-9]$ (2+ chars, lowercase alphanum + hyphens, no leading/trailing hyphen)
#   - slug: unique (409 if exists)
#   - title: non-empty after strip
#   - body: non-empty after strip, < 50000 chars
# Creates app row + first prompt_versions row, sets current_version_id
# Response: {id, slug, current_version_id}
# Status: 201
```

**`GET /admin/apps/{app_id}`** -- App detail with current version body.

```python
# Response: {id, slug, title, subtitle, is_active, current_version: {id, body, change_note, created_at} | null}
# Status: 404 if app not found
```

**`PUT /admin/apps/{app_id}`** -- Update app. Creates new version if body changed.

```python
# Body: {title?: str, subtitle?: str, body?: str, change_note?: str, is_active?: bool}
# Logic:
#   1. If body is provided AND differs from current version body:
#      -> INSERT INTO prompt_versions (app_id, body, change_note)
#      -> UPDATE apps SET current_version_id = <new version id>, updated_at = NOW
#   2. If title/subtitle/is_active provided:
#      -> UPDATE apps SET title=?, subtitle=?, is_active=?, updated_at = NOW
#   3. If only change_note with no body change -> ignore (change_note is per-version)
# Validation: same rules as POST for title/body when provided
# Response: {id, slug, current_version_id}
# Status: 404 if app not found
```

**`GET /admin/apps/{app_id}/versions`** -- Version history.

```python
# Response: [{id, change_note, created_at, body_preview}]
# body_preview: first 200 chars of body
# Ordered by created_at DESC (newest first)
# Status: 404 if app not found
```

**`GET /admin/apps/{app_id}/versions/{version_id}`** -- Full version body.

```python
# Response: {id, app_id, body, change_note, created_at}
# Status: 404 if version not found or doesn't belong to app
```

No backend diff endpoint -- diff is computed client-side with `diff-match-patch`.

### Prompt Validation

Validation logic shared between `create_app` and `update_app`, extracted as a helper in `admin_apps.py`:

```python
import re

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
MAX_BODY_LENGTH = 50_000

def validate_app_fields(
    slug: str | None = None,
    title: str | None = None,
    body: str | None = None,
) -> list[str]:
    """Return list of validation error messages. Empty list = valid."""
    errors = []
    if slug is not None:
        if not _SLUG_RE.match(slug):
            errors.append(
                "slug must be 2+ chars, lowercase alphanumeric and hyphens, "
                "no leading/trailing hyphen"
            )
    if title is not None:
        if not title.strip():
            errors.append("title must not be empty")
    if body is not None:
        if not body.strip():
            errors.append("body must not be empty")
        if len(body) > MAX_BODY_LENGTH:
            errors.append(f"body must be under {MAX_BODY_LENGTH} characters")
    return errors
```

Used in endpoint handlers -- returns 422 with `{"errors": [...]}` if validation fails.

### Changes to existing endpoints in `server.py`

**1. Mount the new router:**

```python
from backend.admin_apps import router as admin_apps_router
app.include_router(admin_apps_router)
```

**2. New public endpoint `GET /apps`:**

```python
@app.get("/apps")
async def list_apps() -> list:
    """Active apps for user app selector."""
    return await get_active_apps()
    # Response: [{id, slug, title, subtitle}]
    # Only is_active=1 apps, ordered by created_at ASC
```

**3. Change `POST /sessions/create`:**

```python
@app.post("/sessions/create")
async def create_session(request: Request) -> dict:
    user_id = _get_user_id(request)
    # Parse optional body (currently sends no body)
    try:
        body = await request.json()
    except Exception:
        body = {}
    app_id = body.get("app_id")

    # Resolve app and lock version
    if app_id:
        app_row = await get_app_by_id(app_id)
        if not app_row or not app_row["is_active"]:
            raise HTTPException(status_code=404, detail="App not found or inactive")
        prompt_version_id = app_row["current_version_id"]
    else:
        # Default app (backward compat)
        app_row = await get_default_app()
        app_id = app_row["id"] if app_row else None
        prompt_version_id = app_row["current_version_id"] if app_row else None

    session = sessions.create(
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
    )
    await save_session(
        session.session_id,
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
    )
    return {"session_id": session.session_id}
```

**4. Change `GET /config`:**

```python
@app.get("/config")
async def config(app_id: int | None = None) -> dict:
    if app_id:
        return await get_app_config_from_db(app_id)
    # Default: first active app
    return await get_app_config_from_db(None)
```

### New DB functions in `db.py`

```python
# --- App CRUD ---

async def get_active_apps(db_path=DB_PATH) -> list[dict]:
    """Active apps for user-facing selector. Returns [{id, slug, title, subtitle}]."""

async def get_app_by_id(app_id: int, db_path=DB_PATH) -> dict | None:
    """Single app by ID (includes current_version_id, is_active)."""

async def get_default_app(db_path=DB_PATH) -> dict | None:
    """First active app. Fallback for backward compat when no app_id provided."""

async def get_all_apps_admin(db_path=DB_PATH) -> list[dict]:
    """All apps with version_count for admin list."""

async def create_app(slug: str, title: str, subtitle: str, body: str, db_path=DB_PATH) -> dict:
    """Create app + first version. Returns {id, slug, current_version_id}."""

async def update_app(app_id: int, *, title: str | None = None, subtitle: str | None = None,
                     body: str | None = None, change_note: str = "",
                     is_active: bool | None = None, db_path=DB_PATH) -> dict:
    """Update app metadata and/or create new version if body changed.
    Always sets updated_at = CURRENT_TIMESTAMP (SQLite has no auto-update trigger).
    Returns {id, slug, current_version_id}."""

async def get_app_config_from_db(app_id: int | None, db_path=DB_PATH) -> dict:
    """Return {title, subtitle} for /config endpoint.
    Falls back to default app if app_id is None."""

# --- Version queries ---

async def get_app_versions(app_id: int, db_path=DB_PATH) -> list[dict]:
    """Version history for an app, newest first.
    Returns [{id, change_note, created_at, body_preview}].
    body_preview is first 200 chars of body."""

async def get_version_by_id(app_id: int, version_id: int, db_path=DB_PATH) -> dict | None:
    """Full version detail. Returns None if not found or wrong app_id.
    Returns {id, app_id, body, change_note, created_at}."""

async def get_prompt_body_by_version(version_id: int, db_path=DB_PATH) -> str | None:
    """Prompt text for a specific version. Used by agent.
    Returns just the body string, or None if not found."""

# --- Modified existing ---

async def save_session(session_id, user_id="anonymous", title=None,
                       app_id=None, prompt_version_id=None, db_path=DB_PATH) -> None:
    """Extended: now accepts app_id and prompt_version_id.
    INSERT includes the new columns."""
```

---

## 3. Agent Integration

### `backend/agent.py` changes

Current code (lines 26-29):

```python
async def run_agent(session: SessionState, user_message: str) -> None:
    framework = FRAMEWORK_PATH.read_text()
    _, app_prompt = load_prompt()  # <-- reads from file every time
    system_prompt = f"{app_prompt}\n\n{framework}"
```

Changed to:

```python
async def run_agent(session: SessionState, user_message: str) -> None:
    framework = FRAMEWORK_PATH.read_text()
    app_prompt = await _get_prompt_for_session(session)
    system_prompt = f"{app_prompt}\n\n{framework}"
    # ... rest of function unchanged
```

New helper function:

```python
async def _get_prompt_for_session(session: SessionState) -> str:
    """Get the locked prompt version for this session from DB.

    Falls back to prompt.md for pre-migration sessions or if DB lookup fails.
    """
    if session.prompt_version_id:
        body = await get_prompt_body_by_version(session.prompt_version_id)
        if body:
            return body
        logger.warning(
            "prompt_version_id=%d not found in DB, falling back to file",
            session.prompt_version_id,
        )
    # Fallback: load from file (pre-migration sessions or DB failure)
    _, body = load_prompt()
    return body
```

Import changes:

```python
# Add:
from backend.db import get_prompt_body_by_version
# Keep (for fallback):
from backend.prompt_config import load_prompt
```

### `backend/session.py` changes

Add fields to `SessionState` dataclass:

```python
@dataclass
class SessionState:
    session_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    user_id: str = "anonymous"
    app_id: int | None = None              # NEW: which app this session belongs to
    prompt_version_id: int | None = None   # NEW: locked prompt version for this session
    status: str = "idle"
    # ... all other fields unchanged
```

Update `SessionManager.create()`:

```python
def create(
    self,
    user_id: str = "anonymous",
    app_id: int | None = None,
    prompt_version_id: int | None = None,
) -> SessionState:
    session = SessionState(
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
    )
    self._sessions[session.session_id] = session
    return session
```

### `backend/prompt_config.py` changes

Add deprecation note at module docstring:

```python
"""Parse YAML frontmatter from prompt.md.

DEPRECATION NOTE (2026-03-31): After the prompt versioning migration
(user_version >= 2), this module is only used for the initial seed from
prompt.md during migration. The DB (apps + prompt_versions tables) is the
authoritative source for prompt content going forward.

See db.py: get_prompt_body_by_version() for the runtime prompt lookup.
"""
```

`load_prompt()` and `get_app_config()` remain unchanged for backward compat and seed usage. `get_app_config()` will no longer be called from `server.py` -- replaced by `get_app_config_from_db()` in `db.py`.

---

## 4. Frontend Changes

### 4a. API Layer

**`frontend/src/api.ts` -- additions and modifications:**

New types:

```typescript
export interface AppInfo {
  id: number
  slug: string
  title: string
  subtitle?: string
}
```

New function:

```typescript
export async function listApps(): Promise<AppInfo[]> {
  try {
    return await request('/apps')
  } catch {
    return []
  }
}
```

Modified `createSession` -- accept optional `appId`:

```typescript
export async function createSession(appId?: number): Promise<{ session_id: string }> {
  return request('/sessions/create', {
    method: 'POST',
    body: JSON.stringify(appId != null ? { app_id: appId } : {}),
  })
}
```

Modified `loadConfig` -- accept optional `appId`:

```typescript
export async function loadConfig(appId?: number): Promise<AppConfig> {
  const params = appId != null ? `?app_id=${appId}` : ''
  try {
    return await request(`/config${params}`)
  } catch {
    return { title: 'App' }
  }
}
```

**`frontend/src/api-admin.ts` -- new types and functions added:**

```typescript
// --- App management types ---

export interface AdminApp {
  id: number
  slug: string
  title: string
  subtitle: string
  is_active: boolean
  current_version_id: number | null
  version_count: number
  created_at: string
  updated_at: string
}

export interface AdminAppDetail {
  id: number
  slug: string
  title: string
  subtitle: string
  is_active: boolean
  current_version: {
    id: number
    body: string
    change_note: string
    created_at: string
  } | null
}

export interface PromptVersion {
  id: number
  change_note: string
  created_at: string
  body_preview: string
}

export interface PromptVersionFull {
  id: number
  app_id: number
  body: string
  change_note: string
  created_at: string
}

// --- App management API ---

export async function fetchAdminApps(): Promise<AdminApp[]> {
  return request('/admin/apps')
}

export async function fetchAdminApp(appId: number): Promise<AdminAppDetail> {
  return request(`/admin/apps/${appId}`)
}

export async function createAdminApp(data: {
  slug: string
  title: string
  subtitle?: string
  body: string
}): Promise<{ id: number; slug: string; current_version_id: number }> {
  return request('/admin/apps', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateAdminApp(
  appId: number,
  data: {
    title?: string
    subtitle?: string
    body?: string
    change_note?: string
    is_active?: boolean
  },
): Promise<{ id: number; slug: string; current_version_id: number }> {
  return request(`/admin/apps/${appId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function fetchAppVersions(appId: number): Promise<PromptVersion[]> {
  return request(`/admin/apps/${appId}/versions`)
}

export async function fetchVersionFull(
  appId: number,
  versionId: number,
): Promise<PromptVersionFull> {
  return request(`/admin/apps/${appId}/versions/${versionId}`)
}
```

### 4b. Admin Panel -- Tab Navigation

**`frontend/src/pages/AdminPage.tsx` -- rewrite:**

```tsx
import { useState } from 'react'
import SessionList from '../components/admin/SessionList'
import SessionViewer from '../components/admin/SessionViewer'
import AppList from '../components/admin/AppList'
import AppEditor from '../components/admin/AppEditor'
import '../styles/admin.css'

type AdminTab = 'sessions' | 'apps'

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('sessions')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Admin</h1>
        <nav className="admin-tabs">
          <button
            className={`admin-tab ${tab === 'sessions' ? 'active' : ''}`}
            onClick={() => setTab('sessions')}
          >
            Sessions
          </button>
          <button
            className={`admin-tab ${tab === 'apps' ? 'active' : ''}`}
            onClick={() => setTab('apps')}
          >
            Apps
          </button>
        </nav>
      </header>
      <div className="admin-layout">
        {tab === 'sessions' ? (
          <>
            <SessionList
              selectedId={selectedSessionId}
              onSelect={setSelectedSessionId}
            />
            {selectedSessionId ? (
              <SessionViewer key={selectedSessionId} sessionId={selectedSessionId} />
            ) : (
              <div className="admin-empty">Select a session to monitor</div>
            )}
          </>
        ) : (
          <>
            <AppList selectedId={selectedAppId} onSelect={setSelectedAppId} />
            {selectedAppId ? (
              <AppEditor key={selectedAppId} appId={selectedAppId} />
            ) : (
              <div className="admin-empty">Select an app to edit</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

CSS additions to `admin.css`:

```css
.admin-tabs {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.admin-tab {
  padding: 0.4rem 1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.85rem;
  cursor: pointer;
}

.admin-tab:hover {
  color: var(--text);
}

.admin-tab.active {
  border-color: var(--accent);
  color: var(--accent);
}
```

### 4c. New Admin Components

**`frontend/src/components/admin/AppList.tsx`:**

- Props: `selectedId: number | null`, `onSelect: (id: number) => void`.
- Fetches `AdminApp[]` on mount via `fetchAdminApps()`, polls every 10s.
- Lists all apps (active first, then archived). Each item shows:
  - Title (heading font).
  - Slug in monospace.
  - Version count badge.
  - Active/archived status badge (green vs muted).
- "Create App" button at top. Clicking toggles an inline create form:
  - Slug input, title input, body textarea (compact).
  - "Create" button calls `createAdminApp(...)`.
  - On success, refreshes list and auto-selects the new app.
- Click on app item calls `onSelect(app.id)`.
- Selected app has accent border (same pattern as `SessionList`).

**`frontend/src/components/admin/AppEditor.tsx`:**

- Props: `appId: number`.
- On mount, fetches `AdminAppDetail` via `fetchAdminApp(appId)`.
- Sections:
  1. **Header:** App title (editable inline) + slug (read-only, mono) + active/archive toggle switch.
  2. **Metadata:** Title and subtitle inputs. Changes saved via "Save Metadata" button (calls `updateAdminApp` with just `{title, subtitle}`).
  3. **Prompt editor:** Monospace `<textarea>` with min 20 rows, auto-grow to content. Tab key inserts `\t` (intercepts keydown, `preventDefault`). Character count below: "1,234 / 50,000". Loaded with `current_version.body`.
  4. **Change note:** Single-line input. Placeholder: "Describe what changed...".
  5. **Action bar:**
     - "Publish New Version" button -- enabled only when `editedBody !== originalBody`. Calls `updateAdminApp(appId, {body, change_note})`. On success: reloads detail, clears change note, shows success flash.
     - "Version History" button -- toggles `VersionHistory` panel.
  6. **Unsaved changes indicator:** Yellow dot next to title when body differs from DB version.
- State: `originalBody` vs `editedBody` tracked for dirty detection. `isSaving` for loading spinner on save.

**`frontend/src/components/admin/VersionHistory.tsx`:**

- Props: `appId: number`, `onClose: () => void`.
- Fetches `PromptVersion[]` via `fetchAppVersions(appId)`.
- Renders scrollable list of version cards. Each card:
  - Version number: displayed as `v{total - index}` (e.g., v3, v2, v1).
  - Change note (or "No note" in muted text).
  - Created date: relative format (e.g., "2 hours ago") with absolute tooltip.
  - Body preview: first 200 chars with ellipsis.
- Diff selection: each card has a checkbox. When exactly 2 are checked, a floating "Compare" button appears.
- "Compare" button:
  - Fetches both full versions via `fetchVersionFull(appId, versionId)` (2 parallel requests).
  - Renders `VersionDiff` component with the two versions (older on left, newer on right).
- Click on version card body (not checkbox): expands to show full body in a read-only monospace panel.

**`frontend/src/components/admin/VersionDiff.tsx`:**

- Props: `left: PromptVersionFull`, `right: PromptVersionFull`, `onClose: () => void`.
- **Lazy-loaded** via `React.lazy()` in `VersionHistory.tsx` to avoid bundling `diff-match-patch` for non-admin routes.
- Diff computation:
  ```typescript
  import DiffMatchPatch from 'diff-match-patch'
  const dmp = new DiffMatchPatch()
  const diffs = dmp.diff_main(left.body, right.body)
  dmp.diff_cleanupSemantic(diffs)
  ```
- Renders unified diff view:
  - `DIFF_DELETE` (-1): red background (`rgba(248, 81, 73, 0.15)`), red text.
  - `DIFF_INSERT` (1): green background (`rgba(63, 185, 80, 0.15)`), green text.
  - `DIFF_EQUAL` (0): normal text.
- Header: "v{leftNum} ({left.created_at formatted}) vs v{rightNum} ({right.created_at formatted})".
- Close button (X) in top-right.
- Monospace `font-family: var(--font-mono)` for the diff body.
- `white-space: pre-wrap` to preserve line breaks.

### 4d. User-Facing App Selector

**`frontend/src/components/AppSelector.tsx`:**

```tsx
import type { AppInfo } from '../api'

interface Props {
  apps: AppInfo[]
  onSelect: (appId: number) => void
}

export default function AppSelector({ apps, onSelect }: Props) {
  return (
    <div className="app-selector">
      <h2>Choose your workshop</h2>
      <div className="app-grid">
        {apps.map((app) => (
          <button
            key={app.id}
            className="app-card"
            onClick={() => onSelect(app.id)}
          >
            <h3>{app.title}</h3>
            {app.subtitle && <p>{app.subtitle}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}
```

CSS additions to `global.css`:

```css
.app-selector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  padding: 2rem;
}

.app-selector h2 {
  font-family: var(--font-heading);
  color: var(--text);
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  width: 100%;
  max-width: 800px;
}

.app-card {
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s, background 0.2s;
}

.app-card:hover {
  border-color: var(--accent);
  background: var(--surface-2);
}

.app-card h3 {
  font-family: var(--font-heading);
  font-size: 1.2rem;
  color: var(--accent);
  margin-bottom: 0.5rem;
}

.app-card p {
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.4;
}
```

### 4e. ChatContainer Changes

**`frontend/src/components/ChatContainer.tsx` -- modifications:**

New state variables:

```typescript
const [apps, setApps] = useState<AppInfo[]>([])
const [selectedAppId, setSelectedAppId] = useState<number | null>(null)
```

New effect to load apps on mount:

```typescript
useEffect(() => {
  listApps().then(setApps)
}, [])
```

Auto-select when single app:

```typescript
useEffect(() => {
  if (apps.length === 1 && selectedAppId === null) {
    setSelectedAppId(apps[0].id)
  }
}, [apps, selectedAppId])
```

Change config loading to depend on selectedAppId:

```typescript
useEffect(() => {
  loadConfig(selectedAppId ?? undefined).then(config => {
    setAppConfig(config)
    document.title = config.title
  })
}, [selectedAppId])
```

Change session creation to pass app_id:

```typescript
useEffect(() => {
  if (sessionId) return
  // Don't create session until app is selected (when multi-app)
  if (apps.length > 1 && selectedAppId === null) return
  let cancelled = false
  createSession(selectedAppId ?? undefined).then(({ session_id }) => {
    if (cancelled) return
    setSessionId(session_id)
    sessionStorage.setItem(SESSION_KEY, session_id)
  }).catch((err) => {
    console.error('Failed to create session:', err)
  })
  return () => { cancelled = true }
}, [sessionId, selectedAppId, apps.length])
```

Change start screen render to show app selector when needed:

```typescript
{showStartScreen ? (
  apps.length > 1 && selectedAppId === null ? (
    <AppSelector
      apps={apps}
      onSelect={(id) => setSelectedAppId(id)}
    />
  ) : (
    <div className="start-screen">
      <h2>Ready to begin?</h2>
      {appConfig.subtitle && <p className="start-subtitle">{appConfig.subtitle}</p>}
      <button className="start-btn" onClick={handleStart}>Start</button>
    </div>
  )
) : /* ... existing code unchanged */ }
```

New session handler also resets selectedAppId when multi-app:

```typescript
const handleNewSession = useCallback(async () => {
  try {
    // Reset app selection for multi-app — DON'T create session here.
    // Session creation is handled by the useEffect that watches selectedAppId.
    setSessionId(null)
    sessionStorage.removeItem(SESSION_KEY)
    setMessages([])
    setIsLoading(false)
    setHasHistory(false)
    setSessionError(false)
    setSessionDone(false)
    setViewingSessionId(null)
    setViewedMessages([])
    historyLoaded.current = false
    setSidebarOpen(false)
    if (apps.length > 1) {
      setSelectedAppId(null)  // triggers app selector
    }
    // If single app, sessionId=null triggers the session-creation useEffect
  } catch (err) { /* ... */ }
}, [apps.length, setMessages, setIsLoading])
```

---

## 5. Data Flow

### Session creation with app version locking

```
User opens page
  -> Frontend: GET /apps -> [{id: 1, slug: "positioning", title: "Positioning Workshop"},
                              {id: 2, slug: "branding", title: "Brand Workshop"}]
  -> If 1 app: auto-select, show "Ready to begin?" immediately.
  -> If 2+: show AppSelector grid. User clicks on a card.

User selects app (id=2) -> clicks "Start"
  -> Frontend: POST /sessions/create {app_id: 2}
  -> Backend:
       1. SELECT current_version_id FROM apps WHERE id=2 AND is_active=1 -> 7
       2. sessions.create(user_id="u123", app_id=2, prompt_version_id=7)
       3. INSERT INTO sessions (id, user_id, app_id, prompt_version_id)
          VALUES ("abc123", "u123", 2, 7)
  -> Response: {session_id: "abc123"}

User sends first message ("start")
  -> POST /chat {message: "start", session_id: "abc123"}
  -> server.py: run_agent(session, "start")
  -> agent.py: _get_prompt_for_session(session)
       1. session.prompt_version_id = 7
       2. SELECT body FROM prompt_versions WHERE id=7
       3. Returns prompt text: "You are a branding expert..."
  -> system_prompt = prompt_body + "\n\n" + framework.md
  -> Agent runs with that exact prompt. Session proceeds.
```

### Admin edits a prompt (creates new version)

```
Admin opens /admin -> clicks "Apps" tab -> selects "Positioning Workshop" (id=1)
  -> GET /admin/apps/1
  -> Response: {
       id: 1, slug: "positioning", title: "Positioning Workshop",
       current_version: {id: 5, body: "You are a positioning expert...",
                         change_note: "added competitor section", created_at: "..."}
     }
  -> Editor textarea populated with version 5 body.

Admin edits body text, types change_note: "revised competitor analysis section"
  -> Clicks "Publish New Version"
  -> PUT /admin/apps/1 {body: "<modified text>", change_note: "revised competitor analysis section"}
  -> Backend:
       1. Fetch current version body for app 1 -> version 5 body
       2. Compare: new body != version 5 body -> body changed
       3. INSERT INTO prompt_versions (app_id, body, change_note)
          VALUES (1, "<modified text>", "revised competitor analysis section")
       4. New version id = 6
       5. UPDATE apps SET current_version_id=6, updated_at=CURRENT_TIMESTAMP WHERE id=1
  -> Response: {id: 1, slug: "positioning", current_version_id: 6}

Impact:
  - Sessions already running with prompt_version_id=5 -> UNAFFECTED, continue using v5 prompt
  - New sessions created after this point -> locked to version 6
  - Version 5 remains in prompt_versions table, fully retrievable
```

### Version diff comparison

```
Admin clicks "Version History" for app 1
  -> GET /admin/apps/1/versions
  -> Response: [
       {id: 6, change_note: "revised competitor...", created_at: "2026-03-31T10:00", body_preview: "You are a..."},
       {id: 5, change_note: "added competitor...", created_at: "2026-03-30T14:00", body_preview: "You are a..."},
       {id: 1, change_note: "Seeded from prompt.md", created_at: "2026-03-29T08:00", body_preview: "You are a..."}
     ]
  -> Displayed as: v3, v2, v1

Admin checks v2 and v3 checkboxes, clicks "Compare"
  -> Parallel fetch:
       GET /admin/apps/1/versions/5 -> {id: 5, body: "<full text v2>", ...}
       GET /admin/apps/1/versions/6 -> {id: 6, body: "<full text v3>", ...}
  -> Frontend: diff-match-patch computes diff between v2.body and v3.body
  -> Renders unified diff: red for removed lines, green for added lines
```

### Backward compat: single-app mode

```
Deployment with only the seeded "default" app (migration created it from prompt.md):
  -> GET /apps -> [{id: 1, slug: "default", title: "Positioning Workshop"}]
  -> apps.length === 1 -> auto-select, no AppSelector grid shown
  -> POST /sessions/create {} -> uses default app, locks version
  -> UX is identical to pre-migration behavior (no extra clicks)
```

---

## 6. Migration Strategy

### Ordering

1. Backend DB migration runs automatically on `init_db()` call at app startup (inside `_migrate()` when `user_version < 2`).
2. No manual migration script needed -- same pattern as existing version 0->1 migration.
3. `prompt.md` is read exactly once during migration, then never again by the running server (except as fallback in `agent.py` if DB lookup fails for edge cases).

### Backward compatibility

- **Sessions created before migration** get `app_id=1, prompt_version_id=1` via backfill.
- **`POST /sessions/create` with no body** still works -- uses default app (id=1).
- **`GET /config` with no `app_id` param** still works -- returns default app config.
- **Frontend without multi-app code** still works -- single session creation, single config endpoint. The new `/apps` endpoint is additive.
- **`prompt.md` file** is not deleted, renamed, or modified. It stays as documentation / seed reference.
- **Zero-apps edge case:** If migration seeds from `prompt.md` but file is missing and DB has no apps, `GET /apps` returns `[]`, frontend shows "No apps available" message with link to admin. `POST /sessions/create` without `app_id` when no default app exists returns 404 with clear error message.

### Rollback plan

If migration needs to be reverted:
1. `prompt.md` still exists and is unchanged -- app reverts to file-based.
2. Drop `apps` and `prompt_versions` tables.
3. Remove `app_id` and `prompt_version_id` columns from sessions (SQLite 3.35+ supports `ALTER TABLE DROP COLUMN`; for older versions, requires table rebuild via CREATE-AS-SELECT).
4. Set `PRAGMA user_version = 1`.

In practice, rollback is unlikely. The migration is purely additive: new tables + new nullable columns on sessions. Nothing is deleted or altered destructively.

### Testing the migration

- **Fresh DB:** `init_db()` creates all tables from scratch, runs migration 0->1->2.
- **Existing DB at version 1:** Migration 1->2 adds tables, seeds from prompt.md, backfills sessions.
- **Existing DB at version 1, no `prompt.md`:** Migration uses fallback placeholder.
- **Existing DB already at version 2:** No-op (idempotent).

---

## 7. Trade-Off Analysis

### Decision 1: DB as authority vs file as authority

- **Chosen:** DB is authoritative after seed.
- **Rationale:** Multi-app requires DB. A single file cannot represent multiple apps. Version history must live in DB for querying and comparison. The DX tradeoff (IDE editing -> browser textarea) is acknowledged.
- **Mitigation for DX regression:** Monospace textarea, tab key support, character count, markdown preview panel. Future iteration: embed CodeMirror for syntax highlighting and better editing experience.
- **Alternative rejected:** Hybrid file + DB snapshots (Gemini review suggestion). Two sources of truth creates sync bugs -- if someone edits `prompt.md` directly after migration, the change is invisible to the system. Clean separation: file is seed, DB is runtime.

### Decision 2: Client-side diff vs server-side diff

- **Chosen:** Client-side with `diff-match-patch`.
- **Rationale:** Diff computation is fast for text under 50KB (sub-millisecond). No Python dependency needed. Frontend lazy-loads the diff component so non-admin users pay zero bundle cost. `diff-match-patch` is 45KB minified, MIT-licensed, Google-maintained, battle-tested.
- **Alternative rejected:** Backend `difflib` endpoint. Adds a round trip, API surface, caching concerns, and Python dependency for something the browser handles locally in <1ms.

### Decision 3: App selector UX -- grid vs dropdown

- **Chosen:** Grid of cards when 2+ apps; auto-skip when 1 app.
- **Rationale:** Visual, shows title + subtitle at a glance. Works well for 2-10 apps (expected scale). Single-app auto-selects with no extra click (zero UX regression from today). Card-based selection is consistent with the app's existing dark design language.
- **Alternative rejected:** Dropdown select. Less visual, hides subtitle, worse for discovery. Would only be needed at 50+ apps, far beyond target scale.

### Decision 4: Version storage -- full body vs incremental diff

- **Chosen:** Full body per version.
- **Rationale:** Prompts are typically 1-5KB of text. Even 1000 versions of 5KB = 5MB total -- trivial for SQLite. Full body storage makes every operation simple:
  - Rollback: `UPDATE apps SET current_version_id = <old id>`.
  - Comparison: `SELECT body FROM prompt_versions WHERE id IN (x, y)`.
  - Agent lookup: `SELECT body FROM prompt_versions WHERE id = ?`.
  No reconstruction, no patch ordering, no corruption risk.
- **Alternative rejected:** Incremental diff storage + reconstruction. Over-engineering for the problem scale. Adds complexity (patch application order, error recovery) with zero practical benefit.

### Decision 5: Router extraction for admin app endpoints

- **Chosen:** Separate `backend/admin_apps.py` with FastAPI `APIRouter`.
- **Rationale:** `server.py` is currently 327 lines. Adding 6 CRUD endpoints with validation would push it past 500 and mix session management with app management. `APIRouter` is FastAPI's idiomatic pattern for modular applications.
- **Alternative rejected:** Inline everything in `server.py`. Violates project coding style guidelines ("200-400 lines typical, 800 max", "high cohesion, low coupling").

### Decision 6: Admin authentication

- **Chosen:** No auth on admin endpoints (maintains status quo).
- **Rationale:** Deployment target is localhost behind Tailscale VPN. Adding auth (OAuth, session cookies, middleware) is a separate L-sized task orthogonal to prompt management. The idea doc explicitly scopes this out.
- **Risk accepted:** Any Tailscale network member can access admin endpoints. This is the existing risk for session monitoring endpoints. Documented, not addressed in this scope.

---

## 8. Implementation Phases

### Phase 1: DB Migration + Backend Models (day 1)

**Files:** `backend/db.py`

Tasks:
- Extend `_migrate()` with `if version < 2:` block (create tables, seed from `prompt.md`, backfill sessions, set `user_version = 2`).
- Add DB functions: `get_active_apps`, `get_app_by_id`, `get_default_app`, `get_all_apps_admin`, `create_app`, `update_app`, `get_app_config_from_db`, `get_app_versions`, `get_version_by_id`, `get_prompt_body_by_version`.
- Modify `save_session` to accept and store `app_id` and `prompt_version_id`.
- Add `validate_app_fields` helper (slug regex, title/body non-empty, body length limit).

Tests (`backend/tests/test_db.py` -- extend existing):
- Migration from version 1 to 2 on fresh DB.
- Migration from version 1 to 2 on DB with existing sessions (backfill).
- Seed from `prompt.md` (file exists) and fallback (file missing).
- `create_app`: valid input, slug conflict, validation errors.
- `update_app`: metadata-only update, body change creates version, no-op on same body.
- `get_app_versions`: ordering, body_preview truncation.
- `get_prompt_body_by_version`: valid id, invalid id returns None.

**Acceptance:** Migration runs cleanly on both fresh and existing DBs. All new functions pass tests. All existing `test_db.py` tests still pass.

### Phase 2: Backend API (day 1-2)

**Files:** `backend/admin_apps.py` (new), `backend/server.py` (modified), `backend/session.py` (modified)

Tasks:
- Create `admin_apps.py` with 6 endpoints: GET list, POST create, GET detail, PUT update, GET versions, GET version detail.
- Mount router in `server.py` via `app.include_router()`.
- Add `GET /apps` public endpoint in `server.py`.
- Modify `POST /sessions/create` in `server.py`: parse body for `app_id`, look up `current_version_id`, pass both to `sessions.create()` and `save_session()`.
- Modify `GET /config` in `server.py`: accept `app_id` query param, call `get_app_config_from_db()`.
- Add `app_id: int | None = None` and `prompt_version_id: int | None = None` fields to `SessionState` dataclass.
- Update `SessionManager.create()` signature to accept new fields.

Tests (`backend/tests/test_admin_apps.py` -- new):
- GET `/admin/apps` returns list with version count.
- POST `/admin/apps` creates app + version; rejects bad slug, empty title, empty body.
- GET `/admin/apps/{id}` returns detail with current version body.
- PUT `/admin/apps/{id}` with new body creates version; with same body does not.
- PUT `/admin/apps/{id}` with `is_active=false` archives app.
- GET `/admin/apps/{id}/versions` returns history newest first.
- GET `/admin/apps/{id}/versions/{vid}` returns full body; 404 for wrong app.
- GET `/apps` returns only active apps.
- POST `/sessions/create` with `app_id` locks correct version.
- POST `/sessions/create` without `app_id` uses default app.
- GET `/config?app_id=N` returns correct app config.

Tests (`backend/tests/test_server.py` -- extend):
- Existing tests still pass with new session fields.

**Acceptance:** All endpoints return correct responses. Validation rejects bad input with 422. Existing server tests still pass.

### Phase 3: Agent Integration (day 2)

**Files:** `backend/agent.py` (modified), `backend/prompt_config.py` (docstring update only)

Tasks:
- Add `_get_prompt_for_session(session)` async helper.
- Replace `_, app_prompt = load_prompt()` with `app_prompt = await _get_prompt_for_session(session)`.
- Add import for `get_prompt_body_by_version` from `db.py`.
- Keep `load_prompt` import for fallback path.
- Add deprecation note to `prompt_config.py` module docstring.

Tests:
- Agent uses DB prompt when `prompt_version_id` is set on session.
- Agent falls back to file prompt when `prompt_version_id` is None (pre-migration session).
- Agent falls back to file prompt when `prompt_version_id` points to deleted/missing version (defensive).

**Acceptance:** Agent correctly resolves prompt from DB for new sessions. Old sessions without `prompt_version_id` continue to work via file fallback.

### Phase 4: Frontend Admin -- Tab Nav + App CRUD (day 2-3)

**Files:**
- `frontend/src/pages/AdminPage.tsx` (rewrite with tab state)
- `frontend/src/components/admin/AppList.tsx` (new)
- `frontend/src/components/admin/AppEditor.tsx` (new)
- `frontend/src/components/admin/VersionHistory.tsx` (new)
- `frontend/src/api-admin.ts` (add app management API functions and types)
- `frontend/src/styles/admin.css` (extend with tab, app list, editor styles)

Tasks:
- AdminPage: add tab state (`sessions | apps`), render tab buttons, conditionally render content.
- AppList: fetch apps, display cards, create form, select handler.
- AppEditor: fetch detail, metadata form, prompt textarea (monospace, tab key, char count), change note input, "Publish New Version" button (dirty check), active/archive toggle.
- VersionHistory: fetch version list, display cards with version numbers, body preview, checkboxes for diff selection.
- CSS: tabs, app list items, editor layout, textarea styling, version cards.

**Acceptance:** Admin can switch between Sessions and Apps tabs. Can create new apps, edit prompts, see version history. Tab switching preserves state within each tab. Existing session monitoring unchanged.

### Phase 5: Frontend Diff + App Selector (day 3-4)

**Files:**
- `frontend/src/components/admin/VersionDiff.tsx` (new, lazy-loaded)
- `frontend/src/components/AppSelector.tsx` (new)
- `frontend/src/components/ChatContainer.tsx` (modified)
- `frontend/src/api.ts` (modified: add `listApps`, change `createSession` and `loadConfig` signatures)
- `frontend/src/styles/global.css` (extend with app selector / app card styles)

Tasks:
- Install npm dependencies: `diff-match-patch`, `@types/diff-match-patch`.
- VersionDiff: lazy-loaded component, computes diff via `diff-match-patch`, renders unified view with red/green highlighting, close button.
- AppSelector: grid of app cards, title + subtitle, click handler.
- ChatContainer changes:
  - Add `apps` and `selectedAppId` state.
  - Load apps on mount via `listApps()`.
  - Auto-select when single app.
  - Defer session creation until app selected (when multi-app).
  - Pass `selectedAppId` to `createSession()` and `loadConfig()`.
  - Render `AppSelector` on start screen when `apps.length > 1 && !selectedAppId`.
  - Reset `selectedAppId` on new session (when multi-app).
- API changes: `listApps()`, `createSession(appId?)`, `loadConfig(appId?)`.

**Acceptance:** Diff view correctly shows red/green changes between two selected versions. App selector grid renders when 2+ apps exist. Single-app mode has zero UX change from current behavior. New session correctly receives selected app's prompt.

### Phase 6: Tests + Polish (day 4-5)

Tasks:
- Backend integration test: full flow -- create app via admin API -> create session with that app -> verify agent receives correct prompt body.
- Frontend vitest tests:
  - `AppSelector`: renders app cards, fires onSelect.
  - `AppList`: fetches and displays apps.
  - `AppEditor`: dirty detection, save calls API.
- E2E test (Playwright): admin creates app -> user selects app on start screen -> session starts -> verify correct prompt used (check SSE events or session DB).
- Manual QA on localhost:
  - Fresh install: migration seeds from prompt.md.
  - Existing DB: migration backfills sessions.
  - Create second app via admin -> user sees app selector.
  - Edit prompt -> new sessions get new version, old sessions unaffected.
  - Version history -> diff between two versions.
  - Archive app -> disappears from user selector.
- Fix any issues found during testing.
- Polish: loading states, error messages, edge case handling.

**Acceptance:** All tests pass. 80%+ coverage on new backend code. Full manual walkthrough succeeds end-to-end.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails if `prompt.md` missing at migration time | Low | Medium | Guarded with `Path.exists()`, fallback to hardcoded placeholder title and body |
| Race between user selecting app and admin publishing new version | Low | Medium | Version locked at `POST /sessions/create` time (not at page load or "Start" click) |
| Large prompt bodies bloat SQLite | Very Low | Low | Non-issue at target scale. SQLite TEXT handles up to 1GB. 1000 versions * 5KB = 5MB. |
| Admin editor UX worse than IDE for prompt engineering | Medium | Low | Monospace textarea, tab key support, char count, preview. Future: CodeMirror integration. |
| `diff-match-patch` bundle size impacts non-admin users | Low | Low | Lazy-loaded via `React.lazy()`, only fetched when admin opens diff view |
| Admin endpoints exploited (no auth) | Low | Medium | Existing risk scope. Tailscale-only deployment. Documented, not addressed here. |
| `SessionState` field additions break existing code | Low | Low | New fields default to `None`. All existing code that creates `SessionState` or accesses its fields continues to work unchanged. |
| Frontend backward compat (old frontend code, new backend) | Low | Low | All API changes are backward compatible: `POST /sessions/create` works with empty body, `GET /config` works without query param, `GET /apps` is a new additive endpoint. |
| Slug validation UX confusion | Low | Low | Display validation error message in admin UI create form. Placeholder text shows example slug format. |

---

## Critic Assessment

**APPROVED** (after revision)

Strengths:
1. Version locking at `POST /sessions/create` correctly prevents the race condition identified in the idea doc.
2. Router extraction (`admin_apps.py`) keeps `server.py` focused and under file size guidelines.
3. Client-side diff is pragmatic -- zero backend complexity for a UI-only concern.
4. Single-app auto-select preserves current UX for existing single-app deployments (no regression).
5. Migration handles both "prompt.md exists" and "prompt.md missing" edge cases.
6. Full body per version is the right storage choice at this data scale.
7. Validation on slug/title/body prevents broken prompts from entering the system.
8. Lazy-loading of diff component avoids penalizing non-admin bundle size.

Minor notes for implementer:
- The slug validation regex and format should be shown as placeholder/hint text in the admin create form, not just as a post-submit error.
- Consider adding a "Restore this version" button in VersionHistory that copies an old version's body into the editor textarea. Not a blocker -- can be done during polish or as a follow-up.
- The "Publish New Version" button should be visually distinct (accent color) and show a brief success flash ("Version published") on save. Not architecturally significant but good UX.

## Database Review Fixes (incorporated)

**Blocking issues (all fixed in plan):**
1. `ALTER TABLE ADD COLUMN` retry safety — added `_column_exists()` guard using `PRAGMA table_info` before each ALTER.
2. `from backend.prompt_config import load_prompt` — moved to top-level import (not inside migration function).
3. `PRAGMA foreign_keys = ON` — added to `_get_db()` helper, enforced on every connection.

**High-priority (all fixed in plan):**
1. Added `CREATE INDEX idx_prompt_versions_app_id` in migration.
2. Added `CREATE INDEX idx_messages_session_id` (pre-existing gap, fixed here).
3. Added `CHECK (is_active IN (0, 1))` constraint on `apps.is_active`.
4. Added `PRAGMA journal_mode = WAL` in `_get_db()` helper.

**Low-priority (incorporated):**
1. `COLLATE NOCASE` on `apps.slug`.
2. `CREATE INDEX idx_sessions_app_id`.
3. `updated_at` convention documented in `update_app()` docstring.
4. Last-write-wins on concurrent admin edits: accepted as non-issue for single-admin Tailscale deployment.
