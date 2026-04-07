# Forge-Simple Architecture Index

<!-- Generated: 2026-04-05 | Files scanned: 8 | Token estimate: ~850 -->

**Last Updated:** 2026-04-05

A prompt-driven agentic web app framework. Claude drives app logic via MCP tools (`show`, `ask`, `save_app`). The UI is a dumb chat renderer that displays whatever Claude requests.

## System Overview

```
Browser (React SPA)
    ↓ SSE (push events)
    ↓ POST /chat, /answers
FastAPI Server (Python 3.11+)
    ↓ subprocess
    ↓ Claude Code CLI (agent loop)
    ↓ MCP tools (show, ask, save_app)
SQLite (aiosqlite)
    ↓ sessions, messages, apps, versions
```

## Codemaps

| Document | Purpose | Key Files |
|----------|---------|-----------|
| **[architecture.md](./architecture.md)** | System boundaries, data flow, integration points | server.py, agent.py, session.py |
| **[backend.md](./backend.md)** | API routes, handler chain, MCP tools, agent lifecycle | server.py, admin_apps.py, agent.py, tools.py, db.py |
| **[frontend.md](./frontend.md)** | Page tree, component hierarchy, hooks, SSE event flow | App.tsx, ChatPage, AdminPage, MessageList, WidgetRenderer |
| **[data.md](./data.md)** | SQLite schema, migrations, relationships | db.py, sessions.db |
| **[dependencies.md](./dependencies.md)** | External services, packages, versions | requirements.txt, package.json |

## Quick Links

**Startup:**
```bash
# Backend: localhost:4910
cd backend && pip install -r requirements.txt && python server.py

# Frontend: localhost:4920 (proxies to backend)
cd frontend && npm install && npm run dev -- --port 4920
```

**Key Concepts:**

- **Multi-app prompt management** — Each app has versioned prompts, admins control which version is active
- **Session isolation** — Each user session locked to one app + version, session ID in `sessionStorage`
- **Async wait pattern** — `ask()` tool blocks via `asyncio.Event`, resumed by `/answers` POST
- **Widget catalog** — 11 display widgets (show), 7 input widgets (ask)
- **Admin panel** — `/admin` route for session monitoring, app CRUD, version history

## Architecture Layers

### Session Lifecycle
1. User selects app via `AppSelector` dropdown
2. Frontend `POST /sessions/create` with `app_id` → backend creates `SessionState` in-memory
3. User sends first message → `POST /chat` → backend spawns agent subprocess
4. Agent calls `ask()` → sends form via SSE → blocks on `asyncio.Event`
5. User submits form → `POST /answers` → event.set() unblocks agent
6. Agent calls `show()` → sends content via SSE → returns immediately
7. Agent loop continues until `done` or `error` event

### App & Version Management
- Each app has `slug` (unique), `title`, `subtitle`, `is_active` flag
- Versions track `prompt_body` + `change_note` + `created_at`
- Editing an app auto-creates a new version (immutable)
- `current_version_id` on app row points to active version
- New sessions always use `current_version_id` (locked for session duration)

### MCP Tools
| Tool | Type | Purpose |
|------|------|---------|
| `show` | Fire-and-forget | Display content blocks (text, table, progress, etc.) |
| `ask` | Blocking | Prompt user with form, wait for submit |
| `save_app` | Admin-only | Create new app (App Builder meta-app only) |
| `update_app` | Admin-only | Edit prompt of target app (edit mode only) |

## File Sizes & Token Estimates

| File | Lines | Purpose |
|------|-------|---------|
| backend/server.py | ~350 | FastAPI routes, SSE, session mgmt |
| backend/agent.py | ~150 | Claude SDK client, agent loop setup |
| backend/tools.py | ~200 | MCP tool definitions (show, ask, save_app) |
| backend/db.py | ~500 | SQLite CRUD, migrations, validation |
| backend/session.py | ~150 | SessionState, event queue, dedup |
| frontend/src/App.tsx | ~25 | Router (Chat + Admin pages) |
| frontend/src/pages/ChatPage.tsx | ~80 | Main chat UI |
| frontend/src/components/MessageList.tsx | ~100 | Message renderer |
| frontend/src/components/WidgetRenderer.tsx | ~80 | Widget dispatcher |
| frontend/src/hooks/useSSE.ts | ~120 | SSE connection & event dispatch |
| frontend/src/hooks/useChat.ts | ~100 | Chat state management |

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) — Framework design, widget catalog, constraints
- [CLAUDE.md](../../CLAUDE.md) — Detailed system design and architecture
- [README.md](../../README.md) — Development setup, usage guide
- [backend/tests/](../../backend/tests/) — Test suite (pytest)
- [frontend/__tests__/](../../frontend/__tests__/) — Test suite (vitest)
