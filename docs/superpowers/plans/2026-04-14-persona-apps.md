# Persona Apps

**Status:** DONE
**Completed:** 2026-04-14
**Date:** 2026-04-14
**Branch:** `feature/persona-apps`

## Problem

We want users to "talk with a persona" about any topic — Steve Jobs helps you think about product strategy, Feynman helps debug your thinking, etc. The Steve Jobs skill (alchaincyf/steve-jobs-skill) is an excellent reference: structured persona with mental models, expression DNA, agentic workflow, and honest limitations.

## Decision: Persona = App with `type = "persona"`

**Not** a separate entity. Personas are apps — they share the same versioning, admin CRUD, session lifecycle, and prompt storage. The only differences are:

1. **Prompt structure** — persona prompt follows a specific template (identity, models, expression rules, limitations)
2. **UI treatment** — AppSelector groups personas separately, shows them with a different visual style
3. **Agent behavior** — persona-type apps get a persona-specific framework suffix instead of the generic one (optional, Phase 2)

This means zero new tables, zero new API endpoints, zero new admin pages. Just a `type` column on `apps` and a persona prompt template.

## Architecture

```
apps table:  + type TEXT DEFAULT 'app' CHECK (type IN ('app', 'persona'))

Prompt assembly (agent.py):
  system_prompt = app_prompt + framework.md  ← same as today, works for both

AppSelector (frontend):
  Groups: "Apps" section + "Personas" section (if any personas exist)

Preset persona:
  Migration 0008 seeds Steve Jobs persona from backend/personas/steve-jobs.md
```

## Implementation Plan

### Phase 1: Database + Backend (migration + API)

**File: `backend/migrations/0008_app_type.py`** — new migration
- Add `type TEXT DEFAULT 'app'` column to `apps` table
- CHECK constraint: `type IN ('app', 'persona')`

**File: `backend/db.py`** — changes
- `_insert_app_with_version()`: add `app_type: str = "app"` keyword-only param, add `type` to INSERT column list (`INSERT INTO apps (slug, title, subtitle, is_active, type) VALUES (?, ?, ?, ?, ?)`)
- `create_app()`: accept optional `app_type: str = "app"` parameter, pass through to `_insert_app_with_version()`
- `get_active_apps()`: add `type` to SELECT (`SELECT id, slug, title, subtitle, type FROM apps WHERE is_active = 1`) — this is what powers `GET /apps`, no server.py change needed
- `get_all_apps_admin()`: add `type` to SELECT
- `validate_app_fields()`: validate `app_type in ('app', 'persona')` if provided

**File: `backend/admin_apps.py`** — minor changes
- POST `/admin/apps`: accept `type` in request body, pass to `create_app()`
- GET responses already return full row dict — `type` will be included automatically after SELECT change

### Phase 2: Preset Steve Jobs Persona

**File: `backend/personas/steve-jobs.md`** — new file
- English translation + adaptation of alchaincyf/steve-jobs-skill
- Adapted for forge-simple's tool system (`show`/`ask` instead of direct response)
- Key sections:
  - Identity & activation rules
  - 6 mental models (with limitations)
  - 8 decision heuristics
  - Expression DNA (language rules)
  - Honest boundaries
  - Agentic protocol adapted for show/ask tools

**File: `backend/migrations/0008_app_type.py`** — also seeds persona
- After adding column, seed Steve Jobs persona from `personas/steve-jobs.md`
- Path resolution: `Path(__file__).parents[1] / "personas" / "steve-jobs.md"` (same pattern as migration 0002)
- `slug: "steve-jobs"`, `title: "Steve Jobs"`, `subtitle: "Product visionary & design perfectionist"`
- `type: "persona"`, `is_active: 1`

### Phase 3: Frontend — AppSelector grouping

**File: `frontend/src/components/AppSelector.tsx`**
- Group apps by `type`: show "Apps" and "Talk to a Persona" sections
- Persona cards get a slightly different visual treatment (quote/tagline style)

**File: `frontend/src/api.ts`**
- `AppInfo` type: add `type: 'app' | 'persona'` field

**File: `frontend/src/styles/global.css`**
- Persona card styling (subtle differentiation)

### Phase 4: Admin awareness

**File: `frontend/src/api-admin.ts`**
- `AdminApp` type: add `type: 'app' | 'persona'` field
- `AdminAppDetail` type: add `type: 'app' | 'persona'` field

**File: `frontend/src/components/admin/AppList.tsx`**
- Show type badge ("App" / "Persona") in admin list

**File: `frontend/src/components/admin/AppEditor.tsx`**
- Type selector when creating new app (dropdown: App / Persona)
- Read-only display of type for existing apps

## Steve Jobs Persona Prompt (outline)

Translated and adapted from the Chinese original. Key adaptations:

1. **Identity block**: First person ("I"), one-time disclaimer, stay in character
2. **Agentic protocol**: Classify question → use WebSearch if factual → respond in Jobs style. Adapted to use `show` for analysis display + `ask` for follow-up questions
3. **6 Mental Models**: Focus = Saying No, The Whole Widget, Connecting the Dots, Death as Decision Tool, Reality Distortion Field, Technology × Liberal Arts — each with evidence + limitation
4. **8 Heuristics**: Subtract first, Don't ask users, A-players, Invisible perfection, One-phrase definition, Results > being right, Elevate the problem, Death filter
5. **Expression DNA**: Short sentences, headline-first, rule of three, binary verdicts ("insanely great" vs "shit"), no hedging ("I think", "maybe")
6. **Honest boundaries**: Can't replicate real intuition, public statements ≠ private thoughts, died 2011 (no position on AI/cloud/social), management style not universal, survivorship bias

## What's NOT in scope

- Persona-specific framework.md override (personas use same framework as apps)
- Reference files (the 2497 lines of research) — prompt is self-contained
- Multiple preset personas — just Steve Jobs for now
- Persona creation wizard (admin creates via same AppEditor, just picks type)

## Risks

- **Prompt size**: Steve Jobs persona ~600-800 lines. Combined with framework.md, still well under context limits
- **Migration safety**: Adding nullable column with default — zero risk to existing data
- **Preset idempotency**: Migration checks `slug = 'steve-jobs'` exists before inserting (INSERT OR IGNORE)

## Test Plan

- [ ] Migration adds `type` column, seeds Steve Jobs persona
- [ ] `GET /apps` returns `type` field
- [ ] AppSelector groups apps and personas
- [ ] Steve Jobs persona session works end-to-end (show/ask tools function correctly)
- [ ] Admin can create new persona via AppEditor
- [ ] Existing apps unaffected (default type = 'app')
