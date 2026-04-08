# App Builder Separation from Admin Apps

**Date:** 2026-04-08
**Status:** DESIGN

## Problem

App Builder is a system-level meta-app (creates/edits other apps), but is stored in the `apps` DB table and displayed alongside user apps in the Admin panel. This creates confusion — a tool and its products are mixed in the same list.

## Decision

Fully remove App Builder from the database. Make it a system component that loads its prompt from `backend/app-builder-prompt.md` at runtime. No DB record, no versioning in DB — git is the version control.

## Changes

### 1. Database Migration (v4)

In `backend/db.py`:

1. Delete `apps` row where `slug = 'app-builder'`
2. Delete related `app_versions` rows
3. Set `app_id = NULL` on `sessions` that referenced App Builder
4. Add `mode TEXT DEFAULT 'normal'` column to `sessions` table
5. Set `mode = 'app-builder'` on sessions that had App Builder's `app_id` (before nullifying)
6. Keep migration v3 code for idempotency (already-migrated DBs skip it)

### 2. SessionState Changes

In `backend/session.py`:

- Add field `mode: str = "normal"` to `SessionState`
- Values: `"normal"` (regular app session) or `"app-builder"` (system App Builder session)
- Old sessions without `mode` column default to `"normal"`

### 3. Session Creation

In `backend/server.py` — `POST /sessions/create`:

- New optional parameter: `mode: str | None` (default `None`)
- When `mode == "app-builder"`:
  - Skip `_resolve_app()` — no DB lookup
  - Set `app_id = None`, `prompt_version_id = None`
  - Store `mode = "app-builder"` in session
- Validation: `edit_app_id` only allowed when `mode == "app-builder"`
- When `mode` is absent/null: existing behavior (resolve app from DB)

### 4. Agent Changes

In `backend/agent.py`:

- Remove `APP_BUILDER_SLUG` constant and `_is_app_builder()` function
- Replace with `session.mode == "app-builder"` check
- Read prompt from `Path(__file__).parent / "app-builder-prompt.md"` directly (not from DB version)
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
- For `mode == "app-builder"` sessions: return `app_title: "App Builder"` (hardcoded)

## Testing

### Backend
- `test_db.py`: migration v4 — App Builder deleted, sessions updated, mode column added
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