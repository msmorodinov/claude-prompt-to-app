# App Builder Separation from Admin Apps

**Date:** 2026-04-08
**Status:** DESIGN

## Problem

App Builder is a system-level meta-app (creates/edits other apps), but is stored in the `apps` DB table and displayed alongside user apps in the Admin panel. This creates confusion — a tool and its products are mixed in the same list.

## Decision

Fully remove App Builder from the database. Make it a system component that loads its prompt from `backend/app-builder-prompt.md` at runtime. No DB record, no versioning in DB — git is the version control.

## Changes

### 1. Database Migration (v6)

In `backend/db.py` (current max version is 5, so this is v6):

1. Get App Builder's `app_id`: `SELECT id FROM apps WHERE slug = 'app-builder'`
2. Add `mode TEXT DEFAULT 'normal'` column to `sessions` table
3. Set `mode = 'app-builder'` on sessions WHERE `app_id = <builder_id>`
4. Set `app_id = NULL` on sessions WHERE `app_id = <builder_id>`
5. Delete related `app_versions` rows
6. Delete `apps` row where `slug = 'app-builder'`
7. Set `PRAGMA user_version = 6`
8. Keep migration v3 code for idempotency (already-migrated DBs skip it)

Order matters: capture builder ID first, set `mode` before nullifying `app_id`.

### 2. SessionState Changes

In `backend/session.py`:

- Add field `mode: str = "normal"` to `SessionState`
- Values: `"normal"` (regular app session) or `"app-builder"` (system App Builder session)
- Old sessions without `mode` column default to `"normal"`

In `backend/db.py`:

- `save_session()`: add `mode: str = "normal"` parameter, include in INSERT column list and VALUES
- `get_session_meta()`: add `mode` to SELECT, return in result dict
- `get_sessions_by_user()`: add `s.mode` to SELECT
- `get_all_sessions_admin()`: add `s.mode` to SELECT
- Session reconstruction in `server.py`: read `db_meta["mode"]` and pass to `SessionState`

In `backend/session.py` — `SessionManager.create()`:

- Add `mode: str = "normal"` parameter, pass to `SessionState` constructor

### 3. Session Creation

In `backend/server.py` — `POST /sessions/create`:

- New optional parameter: `mode: str | None` (default `None`)
- **Validate `mode`**: must be `None`, `"normal"`, or `"app-builder"` — return 422 otherwise
- When `mode == "app-builder"`:
  - Skip `_resolve_app()` — no DB lookup
  - Set `app_id = None`, `prompt_version_id = None`
  - Store `mode = "app-builder"` in session
- Validation: `edit_app_id` only allowed when `mode == "app-builder"`
- When `mode` is absent/null: existing behavior (resolve app from DB, `mode = "normal"`)

### 4. Agent Changes

In `backend/agent.py`:

- Remove `APP_BUILDER_SLUG` constant and `_is_app_builder()` function
- Replace with `session.mode == "app-builder"` check
- **Prompt loading**: Before calling `_get_prompt_for_session`, branch on `session.mode`:
  - If `"app-builder"`: read `Path(__file__).parent / "app-builder-prompt.md"` directly, skip `_get_prompt_for_session` entirely (avoids fallback to legacy `prompt.md`)
  - If `"normal"`: existing behavior via `_get_prompt_for_session`
- Determine `include_save_app` / `include_update_app` via `session.mode`

### 5. Tools

In `backend/tools.py`:

- No changes. `create_tools()` already accepts `include_save_app` and `include_update_app` flags.

### 6. Admin API

In `backend/admin_apps.py`:

- No changes. App Builder is gone from DB — won't appear in results.

### 7. Frontend — AdminPage

In `frontend/src/pages/AdminPage.tsx`:

- `handleEditWithAI()`: replace `listApps()` + slug lookup with direct `POST /sessions/create` using `{ mode: "app-builder", edit_app_id: selectedAppId }`
- Remove "App Builder app not found" error handling — always available

### 8. Frontend — AppSelector / AppList

- No changes needed. App Builder no longer in DB = no longer in lists.

### 9. Frontend — Session Display

In session sidebar / session viewer:

- Sessions with `mode == "app-builder"`: display as "App Builder" (hardcoded label, not from DB app title)
- Sessions with `app_id = None` and `mode == "normal"`: display as before (legacy/unknown)

### 10. Backend API — Session Endpoints

In `GET /sessions` and `GET /sessions/{id}`:

- Include `mode` field in response
- For `mode == "app-builder"` sessions: return `app_title: "App Builder"` (hardcoded in backend query/serialization)

### 11. Frontend Types

- Add `mode: string` to `SessionSummary` (api.ts) and `AdminSession` (api-admin.ts)
- Session display logic in `SessionSidebar` and `SessionList`: `mode === "app-builder" ? "App Builder" : s.app_name`

### 12. Known Limitations

- `edit_app_id` is stored in `SessionState` but not persisted to DB. Edit-mode App Builder sessions lose their target on server restart. This is a pre-existing gap, not introduced by this change. Worth fixing separately.

## Testing

### Backend
- `test_db.py`: migration v6 — App Builder deleted, sessions updated, mode column added
- `test_server.py`: `POST /sessions/create` with `mode: "app-builder"` + `edit_app_id`
- `test_server.py`: `edit_app_id` without `mode: "app-builder"` returns 400
- `test_session.py`: `SessionState.mode` field defaults and values

### Frontend
- AdminPage: "Edit with AI" sends `{ mode: "app-builder" }` not `{ app_id: builder.id }`
- Session display: sessions with `mode == "app-builder"` show "App Builder" label

## Out of Scope

- App Builder prompt versioning (use git)
- New admin sections for system tools
- Changes to `save_app` / `update_app` tool behavior (still creates inactive drafts)