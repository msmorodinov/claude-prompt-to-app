# App Builder Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove App Builder from the apps database table, making it a system component that loads from `.md` file at runtime. Admin UI shows only user-created apps.

**Architecture:** Add `mode` column to sessions table (values: `"normal"`, `"app-builder"`). Migration v6 moves existing App Builder sessions to use `mode` field, then deletes the App Builder DB record. Agent reads prompt from file when `mode == "app-builder"`. Frontend sends `mode` instead of `app_id` for App Builder sessions.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript (frontend), SQLite (database)

**Spec:** `docs/superpowers/specs/2026-04-08-app-builder-separation-design.md`

---

### Task 1: Add `mode` field to SessionState and SessionManager

**Files:**
- Modify: `backend/session.py:22-42` (SessionState dataclass)
- Modify: `backend/session.py:159-173` (SessionManager.create)
- Test: `backend/tests/test_session.py`

- [ ] **Step 1: Write failing test for SessionState mode field**

```python
# Add to backend/tests/test_session.py

def test_session_state_mode_default():
    """SessionState defaults mode to 'normal'."""
    s = SessionState()
    assert s.mode == "normal"


def test_session_state_mode_app_builder():
    """SessionState accepts mode='app-builder'."""
    s = SessionState(mode="app-builder")
    assert s.mode == "app-builder"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_session.py::test_session_state_mode_default -v`
Expected: FAIL — `TypeError: unexpected keyword argument 'mode'`

- [ ] **Step 3: Add `mode` field to SessionState**

In `backend/session.py`, add after `edit_app_id` field (line 27):

```python
mode: str = "normal"  # "normal" | "app-builder"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_session.py::test_session_state_mode_default tests/test_session.py::test_session_state_mode_app_builder -v`
Expected: PASS

- [ ] **Step 5: Write failing test for SessionManager.create with mode**

```python
def test_session_manager_create_with_mode():
    """SessionManager.create passes mode to SessionState."""
    mgr = SessionManager()
    s = mgr.create(mode="app-builder")
    assert s.mode == "app-builder"


def test_session_manager_create_default_mode():
    """SessionManager.create defaults mode to 'normal'."""
    mgr = SessionManager()
    s = mgr.create()
    assert s.mode == "normal"
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_session.py::test_session_manager_create_with_mode -v`
Expected: FAIL — `TypeError: unexpected keyword argument 'mode'`

- [ ] **Step 7: Add `mode` parameter to SessionManager.create**

In `backend/session.py`, update `SessionManager.create`:

```python
def create(
    self,
    user_id: str = "anonymous",
    app_id: int | None = None,
    prompt_version_id: int | None = None,
    edit_app_id: int | None = None,
    mode: str = "normal",
) -> SessionState:
    session = SessionState(
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
        edit_app_id=edit_app_id,
        mode=mode,
    )
    self._sessions[session.session_id] = session
    return session
```

- [ ] **Step 8: Run all session tests**

Run: `cd backend && python -m pytest tests/test_session.py -v`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add backend/session.py backend/tests/test_session.py
git commit -m "feat: add mode field to SessionState and SessionManager"
```

---

### Task 2: Add `mode` to database — save_session and query functions

**Files:**
- Modify: `backend/db.py:502-521` (save_session)
- Modify: `backend/db.py:586-601` (get_sessions_by_user)
- Modify: `backend/db.py:604-618` (get_all_sessions_admin)
- Modify: `backend/db.py:635-649` (get_session_meta)
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: Write failing test for save_session with mode**

```python
# Add to backend/tests/test_db.py

@pytest.mark.asyncio
async def test_save_session_with_mode(tmp_path):
    """save_session persists mode field."""
    db_path = tmp_path / "test.db"
    await init_db(db_path)
    await save_session("s1", user_id="u1", mode="app-builder", db_path=db_path)
    meta = await get_session_meta("s1", db_path=db_path)
    assert meta is not None
    assert meta["mode"] == "app-builder"


@pytest.mark.asyncio
async def test_save_session_default_mode(tmp_path):
    """save_session defaults mode to 'normal'."""
    db_path = tmp_path / "test.db"
    await init_db(db_path)
    await save_session("s2", user_id="u1", db_path=db_path)
    meta = await get_session_meta("s2", db_path=db_path)
    assert meta is not None
    assert meta["mode"] == "normal"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_db.py::test_save_session_with_mode -v`
Expected: FAIL — `TypeError: unexpected keyword argument 'mode'`

- [ ] **Step 3: Add migration v6 — add mode column to sessions**

In `backend/db.py`, add at end of `_migrate` function (after `if version < 5` block):

```python
    if version < 6:
        # Add mode column to sessions
        if not await _column_exists(db, "sessions", "mode"):
            await db.execute(
                "ALTER TABLE sessions ADD COLUMN mode TEXT DEFAULT 'normal'"
            )

        # Migrate App Builder sessions: set mode before nullifying app_id
        cursor = await db.execute(
            "SELECT id FROM apps WHERE slug = 'app-builder'"
        )
        builder_row = await cursor.fetchone()
        if builder_row:
            builder_id = builder_row[0]
            # Mark App Builder sessions
            await db.execute(
                "UPDATE sessions SET mode = 'app-builder' WHERE app_id = ?",
                (builder_id,),
            )
            # Nullify app_id on those sessions
            await db.execute(
                "UPDATE sessions SET app_id = NULL, prompt_version_id = NULL "
                "WHERE mode = 'app-builder'",
            )
            # Delete App Builder versions and app record
            await db.execute(
                "DELETE FROM prompt_versions WHERE app_id = ?", (builder_id,)
            )
            await db.execute(
                "DELETE FROM apps WHERE id = ?", (builder_id,)
            )

        await db.execute("PRAGMA user_version = 6")
        await db.commit()
```

- [ ] **Step 4: Update save_session to accept and persist mode**

In `backend/db.py`, update `save_session`:

```python
async def save_session(
    session_id: str,
    user_id: str = "anonymous",
    title: str | None = None,
    app_id: int | None = None,
    prompt_version_id: int | None = None,
    user_display_name: str | None = None,
    mode: str = "normal",
    db_path: str | Path = DB_PATH,
) -> None:
    db = await _get_db(db_path)
    try:
        await db.execute(
            "INSERT OR REPLACE INTO sessions "
            "(id, user_id, title, app_id, prompt_version_id, user_display_name, mode) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session_id, user_id, title, app_id, prompt_version_id, user_display_name, mode),
        )
        await db.commit()
    finally:
        await db.close()
```

- [ ] **Step 5: Update get_session_meta to return mode**

In `backend/db.py`, update `get_session_meta`:

```python
async def get_session_meta(
    session_id: str, db_path: str | Path = DB_PATH
) -> dict[str, Any] | None:
    """Return session metadata for hydration."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT user_id, app_id, prompt_version_id, sdk_session_id, status, mode "
            "FROM sessions WHERE id = ?",
            (session_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        result = dict(row)
        # Default mode for pre-migration sessions
        if result.get("mode") is None:
            result["mode"] = "normal"
        return result
    finally:
        await db.close()
```

- [ ] **Step 6: Update get_sessions_by_user to return mode**

In `backend/db.py`, update `get_sessions_by_user` SELECT:

```python
cursor = await db.execute(
    "SELECT s.id, s.created_at, s.title, s.status, s.message_count, "
    "s.app_id, s.mode, a.title as app_name "
    "FROM sessions s LEFT JOIN apps a ON s.app_id = a.id "
    "WHERE s.user_id = ? ORDER BY s.created_at DESC",
    (user_id,),
)
```

- [ ] **Step 7: Update get_all_sessions_admin to return mode**

In `backend/db.py`, update `get_all_sessions_admin` SELECT:

```python
cursor = await db.execute(
    "SELECT s.id, s.user_id, s.status, s.message_count, s.created_at, s.title, "
    "s.app_id, s.mode, a.title as app_name, s.user_display_name "
    "FROM sessions s LEFT JOIN apps a ON s.app_id = a.id "
    "ORDER BY s.created_at DESC"
)
```

- [ ] **Step 8: Run tests**

Run: `cd backend && python -m pytest tests/test_db.py -v`
Expected: All PASS (including new mode tests)

- [ ] **Step 9: Commit**

```bash
git add backend/db.py backend/tests/test_db.py
git commit -m "feat: add mode column to sessions, migration v6 removes App Builder from DB"
```

---

### Task 3: Write migration v6 test

**Files:**
- Test: `backend/tests/test_db.py`

- [ ] **Step 1: Write test for migration v6**

```python
@pytest.mark.asyncio
async def test_migration_v6_removes_app_builder(tmp_path):
    """Migration v6 removes App Builder from apps, sets mode on its sessions."""
    db_path = tmp_path / "test.db"
    await init_db(db_path)

    # Verify App Builder is gone
    apps = await get_all_apps_admin(db_path=db_path)
    slugs = [a["slug"] for a in apps]
    assert "app-builder" not in slugs

    # Verify mode column exists with default
    await save_session("test-s", user_id="u1", db_path=db_path)
    meta = await get_session_meta("test-s", db_path=db_path)
    assert meta["mode"] == "normal"
```

- [ ] **Step 2: Run test**

Run: `cd backend && python -m pytest tests/test_db.py::test_migration_v6_removes_app_builder -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_db.py
git commit -m "test: add migration v6 test — App Builder removal"
```

---

### Task 4: Update agent.py — mode-based prompt loading

**Files:**
- Modify: `backend/agent.py:22-100` (remove _is_app_builder, update run_agent)

- [ ] **Step 1: Remove `APP_BUILDER_SLUG` and `_is_app_builder` function**

In `backend/agent.py`, remove lines 26-33:

```python
# DELETE these lines:
APP_BUILDER_SLUG = "app-builder"

async def _is_app_builder(app_id: int | None) -> bool:
    if app_id is None:
        return False
    app = await get_app_by_id(app_id)
    return app is not None and app["slug"] == APP_BUILDER_SLUG
```

- [ ] **Step 2: Add APP_BUILDER_PROMPT_PATH constant**

Replace the deleted lines with:

```python
APP_BUILDER_PROMPT_PATH = Path(__file__).parent / "app-builder-prompt.md"
```

- [ ] **Step 3: Update run_agent to use session.mode**

Replace the prompt loading and tool setup section in `run_agent`:

```python
async def run_agent(session: SessionState, user_message: str) -> None:
    framework = FRAMEWORK_PATH.read_text()

    is_builder = session.mode == "app-builder"
    is_edit_mode = is_builder and session.edit_app_id is not None

    # Load prompt based on mode
    if is_builder:
        app_prompt = APP_BUILDER_PROMPT_PATH.read_text()
    else:
        app_prompt = await _get_prompt_for_session(session)

    system_prompt = f"{app_prompt}\n\n{framework}"

    if is_edit_mode:
        system_prompt += await _build_edit_context(session.edit_app_id)

    tools = create_tools(
        session,
        session.session_id,
        include_save_app=is_builder,
        include_update_app=is_edit_mode,
    )
    # ... rest of run_agent unchanged
```

- [ ] **Step 4: Remove unused import**

Remove `get_app_by_id` from imports if no longer used elsewhere in agent.py. Keep it if `_build_edit_context` still uses it (it does — via `get_app_by_id(edit_app_id)`).

Check: `_build_edit_context` uses `get_app_by_id` → keep the import.

- [ ] **Step 5: Run all backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/agent.py
git commit -m "refactor: agent uses session.mode instead of DB lookup for App Builder"
```

---

### Task 5: Update server.py — session creation with mode

**Files:**
- Modify: `backend/server.py:312-352` (create_session endpoint)
- Test: `backend/tests/test_server.py`

- [ ] **Step 1: Write failing test for mode-based session creation**

```python
# Add to backend/tests/test_server.py

@pytest.mark.asyncio
async def test_create_session_app_builder_mode(client):
    """POST /sessions/create with mode='app-builder' creates builder session."""
    resp = await client.post(
        "/sessions/create",
        json={"mode": "app-builder"},
        headers={"X-User-Id": "test-user"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data


@pytest.mark.asyncio
async def test_create_session_invalid_mode(client):
    """POST /sessions/create with invalid mode returns 422."""
    resp = await client.post(
        "/sessions/create",
        json={"mode": "superuser"},
        headers={"X-User-Id": "test-user"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_edit_app_id_requires_builder_mode(client):
    """edit_app_id without mode='app-builder' returns 400."""
    resp = await client.post(
        "/sessions/create",
        json={"edit_app_id": 1},
        headers={"X-User-Id": "test-user"},
    )
    assert resp.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_server.py::test_create_session_app_builder_mode -v`
Expected: FAIL

- [ ] **Step 3: Update create_session endpoint**

In `backend/server.py`, rewrite `create_session`:

```python
@app.post("/sessions/create")
async def create_session(request: Request) -> dict:
    user_id = _get_user_id(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    req_app_id = body.get("app_id") if body else None
    edit_app_id = body.get("edit_app_id") if body else None
    req_mode = body.get("mode") if body else None

    # Validate mode
    if req_mode is not None and req_mode not in ("normal", "app-builder"):
        raise HTTPException(status_code=422, detail="mode must be 'normal' or 'app-builder'")

    if edit_app_id is not None and not isinstance(edit_app_id, int):
        raise HTTPException(status_code=422, detail="edit_app_id must be an integer")

    # Validate edit target exists and is active
    if edit_app_id is not None:
        target = await get_app_by_id(edit_app_id)
        if not target:
            raise HTTPException(status_code=404, detail="Edit target app not found")
        if not target["is_active"]:
            raise HTTPException(status_code=403, detail="Cannot edit an archived app")

    # Determine mode
    mode = req_mode or "normal"

    if mode == "app-builder":
        # App Builder: no DB app lookup
        app_id = None
        prompt_version_id = None
    else:
        app_id, prompt_version_id = await _resolve_app(req_app_id)

    # edit_app_id only valid with app-builder mode
    if edit_app_id is not None and mode != "app-builder":
        raise HTTPException(status_code=400, detail="edit_app_id requires mode='app-builder'")

    session = sessions.create(
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
        edit_app_id=edit_app_id,
        mode=mode,
    )
    await save_session(
        session.session_id,
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
        user_display_name=_get_display_name(request),
        mode=mode,
    )
    return {"session_id": session.session_id}
```

- [ ] **Step 4: Update session hydration in chat endpoint**

In `backend/server.py`, find where `SessionState` is reconstructed from DB meta (in `chat` endpoint around line 140). Add `mode` to the hydration:

Find the pattern where `get_session_meta` result is used to create `SessionState` and add:
```python
mode=db_meta.get("mode", "normal"),
```

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_server.py -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/server.py backend/tests/test_server.py
git commit -m "feat: session creation supports mode parameter, validates app-builder mode"
```

---

### Task 6: Update session list endpoints — return mode and app_title

**Files:**
- Modify: `backend/server.py:356-396` (list_sessions, admin_list_sessions)

- [ ] **Step 1: Update list_sessions to add app_name for builder sessions**

In `backend/server.py`, update `list_sessions`:

```python
@app.get("/sessions")
async def list_sessions(request: Request) -> list:
    user_id = _get_user_id(request)
    rows = await get_sessions_by_user(user_id)
    for row in rows:
        if row.get("mode") == "app-builder" and not row.get("app_name"):
            row["app_name"] = "App Builder"
    return rows
```

- [ ] **Step 2: Update admin_list_sessions similarly**

In `backend/server.py`, update `admin_list_sessions`:

```python
@app.get("/admin/sessions")
async def admin_list_sessions() -> list:
    rows = await get_all_sessions_admin()
    for row in rows:
        if row.get("mode") == "app-builder" and not row.get("app_name"):
            row["app_name"] = "App Builder"
    return rows
```

- [ ] **Step 3: Run backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat: session list endpoints return 'App Builder' label for builder sessions"
```

---

### Task 7: Update frontend types — add mode to SessionSummary and AdminSession

**Files:**
- Modify: `frontend/src/api.ts:65-73` (SessionSummary)
- Modify: `frontend/src/api-admin.ts:9-20` (AdminSession)

- [ ] **Step 1: Add mode to SessionSummary**

In `frontend/src/api.ts`, update `SessionSummary`:

```typescript
export interface SessionSummary {
  id: string
  created_at: string
  title: string | null
  status: string
  message_count: number
  app_id: number | null
  app_name: string | null
  mode?: string
}
```

- [ ] **Step 2: Add mode to AdminSession**

In `frontend/src/api-admin.ts`, update `AdminSession`:

```typescript
export interface AdminSession {
  id: string
  user_id: string
  status: 'idle' | 'active' | 'waiting_input' | 'done' | 'error'
  message_count: number
  created_at: string
  title: string | null
  app_id: number | null
  app_name: string | null
  user_display_name: string | null
  mode?: string
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/src/api-admin.ts
git commit -m "feat: add mode field to SessionSummary and AdminSession types"
```

---

### Task 8: Update AdminPage — handleEditWithAI uses mode

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx:95-115` (handleEditWithAI)

- [ ] **Step 1: Replace handleEditWithAI implementation**

In `frontend/src/pages/AdminPage.tsx`, replace `handleEditWithAI`:

```typescript
const handleEditWithAI = useCallback(async () => {
  if (!selectedAppId) return
  setShowMenu(false)
  setHeaderError(null)
  try {
    const data = await request<{ session_id: string }>('/sessions/create', {
      method: 'POST',
      body: JSON.stringify({ mode: 'app-builder', edit_app_id: selectedAppId }),
    })
    sessionStorage.setItem('session_id', data.session_id)
    window.location.href = '/'
  } catch (err) {
    setHeaderError(err instanceof Error ? err.message : 'Failed to start AI edit session')
  }
}, [selectedAppId])
```

- [ ] **Step 2: Remove unused `listApps` import if no longer needed**

Check if `listApps` is used elsewhere in AdminPage.tsx. If not, remove from imports:

```typescript
import { request } from '../api'  // keep request
// Remove listApps if unused
```

If `listApps` is still used elsewhere in the file, keep the import.

- [ ] **Step 3: Run typecheck and frontend tests**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: No errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx
git commit -m "refactor: handleEditWithAI uses mode='app-builder' instead of DB lookup"
```

---

### Task 9: Update session display — show "App Builder" for builder sessions

**Files:**
- Modify: `frontend/src/components/SessionSidebar.tsx` (session label)
- Modify: `frontend/src/components/admin/SessionList.tsx` (admin session label)

- [ ] **Step 1: Check current session display logic**

Read `SessionSidebar.tsx` and `SessionList.tsx` to find where `app_name` is rendered. The backend now returns `app_name: "App Builder"` for builder sessions, so this may already work without changes.

If `app_name` is displayed directly from the API response, no frontend changes needed — the backend handles it in Task 6.

- [ ] **Step 2: Verify by running frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit if changes were needed**

```bash
git add frontend/src/components/SessionSidebar.tsx frontend/src/components/admin/SessionList.tsx
git commit -m "feat: display 'App Builder' label for builder sessions in sidebar"
```

---

### Task 10: Final verification and cleanup

**Files:**
- Verify: all backend and frontend tests pass
- Verify: typecheck passes

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: All PASS

- [ ] **Step 2: Run frontend typecheck and tests**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: No errors, all tests pass

- [ ] **Step 3: Run local CI check**

Run: `./scripts/check-ci.sh`
Expected: All checks pass

- [ ] **Step 4: Verify App Builder not in app list**

Start the app locally and confirm:
1. `/admin` page — App Builder not in app list
2. "Edit with AI" button still works (creates builder session)
3. Regular apps display normally

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup after App Builder separation"
```

---

### Task 11: Update CLAUDE.md project structure

**Files:**
- Modify: `CLAUDE.md` (if any file paths changed)

- [ ] **Step 1: Verify no structural changes needed**

No files were added or removed — only modifications. `backend/app-builder-prompt.md` remains in place. No CLAUDE.md update needed unless the description of App Builder in the overview section should be updated.

- [ ] **Step 2: Update App Builder description in CLAUDE.md if needed**

If the current CLAUDE.md describes App Builder as "stored in DB" or similar, update to reflect it's now a system component loaded from file.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect App Builder as system component"
```
