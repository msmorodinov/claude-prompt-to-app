# Data Codemap

<!-- Generated: 2026-04-05 | Files scanned: 3 | Token estimate: ~700 -->

**Last Updated:** 2026-04-05
**Database:** SQLite (aiosqlite)
**File:** backend/sessions.db
**Entry Point:** backend/db.py:init_db()

## Schema

### sessions
Stores user sessions, one per app invocation.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                      -- UUID hex string, 12 chars
  user_id TEXT DEFAULT 'anonymous',         -- From X-User-Id header
  app_id INTEGER,                           -- Which app is running
  prompt_version_id INTEGER,                -- Locked prompt version (immutable)
  title TEXT,                               -- Auto-titled from first message
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_display_name TEXT,                   -- Optional display name (admin)
  message_count INTEGER DEFAULT 0,          -- Incremented by agent
  FOREIGN KEY (app_id) REFERENCES apps(id),
  FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(id)
)
```

**Indexes:**
- PRIMARY KEY on `id` (lookup speed)
- Index on `(user_id, created_at)` (list user sessions)
- Index on `app_id` (filter by app)

### messages
One row per SSE event (assistant message, ask, user answers).

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,                       -- "user" | "assistant"
  content TEXT NOT NULL,                    -- JSON: {text}, {blocks}, {answers}, {ask_id, questions}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
)
```

**Content Examples:**
```json
// User message
{"text": "Tell me about positioning"}

// Assistant (show widget)
{"blocks": [{"type": "text", "content": "..."}, ...]}

// Assistant (ask widget)
{"ask_id": "abc12345", "preamble": "...", "questions": [...]}

// User (form submission)
{"answers": {"q1": "answer1", "q2": ["a", "b"]}}
```

### apps
Prompt applications (like "positioning workshop").

```sql
CREATE TABLE apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,                -- "positioning-workshop", "app-builder"
  title TEXT NOT NULL,                      -- Human-readable name
  subtitle TEXT,                            -- Optional description
  is_active INTEGER DEFAULT 1,              -- 1 = can be selected, 0 = draft/archived
  current_version_id INTEGER,               -- Points to active prompt_versions row
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_version_id) REFERENCES prompt_versions(id)
)
```

**Indexes:**
- UNIQUE on `slug` (prevents duplicates)
- Index on `is_active` (filter public list)

### prompt_versions
Immutable version records for app prompts.

```sql
CREATE TABLE prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  body TEXT NOT NULL,                       -- Markdown prompt (up to 50KB)
  change_note TEXT,                         -- "Initial", "Updated UI instructions", ...
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id) REFERENCES apps(id)
)
```

**Notes:**
- `body` is immutable once inserted
- New versions created on app edit (app.current_version_id updated)
- Sessions lock to a specific version at creation (session.prompt_version_id)

## Relationships

```
sessions (id)
  ├─ user_id → (no FK, just filter)
  ├─ app_id → apps(id)
  └─ prompt_version_id → prompt_versions(id)

messages (id)
  └─ session_id → sessions(id) [ON DELETE CASCADE implied]

apps (id)
  └─ current_version_id → prompt_versions(id)

prompt_versions (id)
  └─ app_id → apps(id)
```

## Migrations

### Version 0 → 1
Initial schema (sessions, messages tables).

### Version 1 → 2
- Add `user_id` column to sessions (migrate existing rows to 'anonymous')
- Add `app_id`, `prompt_version_id` columns

### Version 2 → 3
- Create `apps` and `prompt_versions` tables
- Seed with default "positioning-workshop" app
- Seed with "app-builder" meta-app (prompts in app-builder-prompt.md)
- Migrate existing session prompts to first version

### Version 3 → 4 (future)
- Add `is_active` column to apps
- Add `user_display_name` to sessions
- Add `message_count` to sessions

## Query Patterns

### Load Session History

```python
# backend/db.py:get_session(session_id)
async def get_session(session_id: str):
    SELECT s.*, m.role, m.content, m.created_at
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.session_id
    WHERE s.id = ?
    ORDER BY m.created_at ASC
```

### List User Sessions

```python
# backend/db.py:get_sessions_by_user(user_id)
async def get_sessions_by_user(user_id: str):
    SELECT id, title, app_id, prompt_version_id, created_at
    FROM sessions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
```

### Get Active Apps

```python
# backend/db.py:get_active_apps()
async def get_active_apps():
    SELECT id, slug, title, subtitle, current_version_id
    FROM apps
    WHERE is_active = 1
    ORDER BY created_at ASC
```

### Get Prompt Version

```python
# backend/db.py:get_prompt_body_by_version(version_id)
async def get_prompt_body_by_version(version_id: int):
    SELECT body
    FROM prompt_versions
    WHERE id = ?
```

### List Version History

```python
# backend/db.py:get_versions_for_app(app_id)
async def get_versions_for_app(app_id: int):
    SELECT id, change_note, created_at
    FROM prompt_versions
    WHERE app_id = ?
    ORDER BY created_at DESC
```

### Version Diff

```python
# backend/db.py:get_version_pair(app_id, vid1, vid2)
SELECT body FROM prompt_versions WHERE id = vid1
SELECT body FROM prompt_versions WHERE id = vid2
-- Frontend uses diff-match-patch to compute diff
```

## Data Constraints

| Field | Constraint | Reason |
|-------|-----------|--------|
| `sessions.id` | PRIMARY KEY | Unique session ID |
| `apps.slug` | UNIQUE | Prevent duplicate app names |
| `prompt_versions.body` | TEXT (50KB max) | Prevent runaway storage |
| `sessions.user_id` | NOT NULL | Session ownership |
| `messages.role` | "user" \| "assistant" | Message type validation |

## Storage Notes

### Session Lifecycle
- Created: `POST /sessions/create` (or implicit in `/chat`)
- Messages accumulate as agent runs (push_sse + save_message)
- Persisted: All data goes to SQLite (not lost on server restart)
- Locked: `prompt_version_id` frozen at session creation (agent always uses same version)

### App Version Immutability
- Editing an app does NOT mutate the version row
- Instead: INSERT new row in prompt_versions, UPDATE apps.current_version_id
- Old versions preserved for history/diff (no DELETE)
- New sessions always use current_version_id

### Cleanup Policy
- Sessions: No automatic cleanup (kept for history)
- Messages: No automatic cleanup (kept for auditing)
- Apps: `is_active` flag used instead of DELETE
- Versions: Never deleted (audit trail)

## Database Initialization

```python
# backend/server.py:lifespan()
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()  # Called on startup
    yield
```

**init_db() steps:**
1. Connect to sessions.db (creates if missing)
2. Enable PRAGMA foreign_keys, journal_mode=WAL
3. Create base tables (sessions, messages)
4. Run migrations (check PRAGMA user_version, apply deltas)
5. Seed default apps if not present

## Testing Data

Test fixtures use in-memory SQLite (`:memory:`):

```python
# backend/tests/conftest.py
@pytest.fixture
async def db():
    db = await aiosqlite.connect(":memory:")
    await init_db(db_path=":memory:")
    yield db
    await db.close()
```

## Performance Considerations

- **Indexes** on (user_id, created_at) speed up session listing
- **WAL mode** enables concurrent readers
- **PRAGMA foreign_keys = ON** ensures referential integrity
- **No pagination** currently (relies on LIMIT in queries)
- **No archival** — all rows kept forever (OK for local deployment)

## Admin Monitoring

Admin endpoints for debugging:

```python
# backend/db.py
async def get_all_sessions_admin():
    # List all sessions with app_id, message_count, status
    SELECT id, user_id, app_id, title, created_at, message_count
    FROM sessions
    ORDER BY created_at DESC

async def get_session_admin(session_id: str):
    # Full history for admin view
    SELECT role, content, created_at FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
```
