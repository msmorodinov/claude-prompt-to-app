# Architecture Codemap

<!-- Generated: 2026-04-05 | Files scanned: 5 | Token estimate: ~750 -->

**Last Updated:** 2026-04-05
**Entry Points:** backend/server.py:app, frontend/src/App.tsx

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (React 19)                    │
├─────────────────────────────────────────────────────────┤
│  App.tsx (Router)                                        │
│  ├─ ChatPage (SSE streaming, message renderer)           │
│  │  ├─ AppSelector (app dropdown)                        │
│  │  ├─ ChatContainer (main UI)                           │
│  │  └─ SessionSidebar (past sessions)                    │
│  └─ AdminPage (monitoring + app mgmt)                    │
│     ├─ SessionList (all sessions)                        │
│     ├─ AppList (CRUD apps)                               │
│     └─ SessionViewer (read-only history)                 │
└─────────────────────────────────────────────────────────┘
           ↓ SSE /stream              ↑ POST /chat, /answers
           ↓ GET /sessions            ↑ GET /apps, /config
           ↓ GET /admin/*             ↑
┌─────────────────────────────────────────────────────────┐
│               FASTAPI SERVER (Python 3.11+)              │
├─────────────────────────────────────────────────────────┤
│  server.py (Main FastAPI app)                            │
│  ├─ POST /chat → run_agent()                             │
│  ├─ GET /stream → _sse_generator()                       │
│  ├─ POST /answers → session.pending_answers + event.set()│
│  ├─ POST /sessions/create → SessionManager.create()      │
│  ├─ GET /sessions, /sessions/{id} → load_session()      │
│  ├─ GET /health                                          │
│  ├─ GET /apps, /config (public app list)                 │
│  └─ router: admin_apps_router (GET/POST /admin/apps/*)  │
│                                                           │
│  admin_apps.py (Admin CRUD routes)                       │
│  ├─ GET /admin/apps → list all apps                      │
│  ├─ POST /admin/apps → create_app()                      │
│  ├─ GET /admin/apps/{id} → get app + current version     │
│  ├─ PUT /admin/apps/{id} → update_app() + new version    │
│  ├─ GET /admin/apps/{id}/versions → version history      │
│  ├─ GET /admin/sessions → get_all_sessions_admin()       │
│  └─ GET /admin/sessions/{id}/stream, /history           │
│                                                           │
│  SessionManager (in-memory registry)                     │
│  └─ sessions: dict[str, SessionState]                    │
│                                                           │
│  SQLite (aiosqlite)                                      │
│  └─ db.py (CRUD + migrations)                            │
└─────────────────────────────────────────────────────────┘
           ↓ spawn subprocess        ↑ MCP server (tools)
           ↓ stdin/stdout            ↑
┌─────────────────────────────────────────────────────────┐
│        CLAUDE CODE CLI (Agent Subprocess)                │
├─────────────────────────────────────────────────────────┤
│  agent.py (agent loop)                                   │
│  ├─ build system_prompt (app prompt + framework.md)      │
│  ├─ configure ClaudeSDKClient + ClaudeAgentOptions       │
│  ├─ loop: agent calls tools → tool returns → next turn   │
│  └─ push SSE events via session.push_sse()               │
│                                                           │
│  tools.py (MCP tool definitions)                         │
│  ├─ show(blocks) → push "assistant_message" → return     │
│  ├─ ask(questions) → push "ask_message" → BLOCK          │
│  │                   await session.pending_ask_event     │
│  │                   (resumed by POST /answers)          │
│  ├─ save_app(slug, title, body) → db.create_app()       │
│  └─ update_app(app_id, body) → db.update_app()          │
│                                                           │
│  ClaudeSDKClient (subprocess)                            │
│  └─ mcp__app__show, mcp__app__ask, WebSearch, WebFetch   │
└─────────────────────────────────────────────────────────┘
           ↓ read/write
┌─────────────────────────────────────────────────────────┐
│           SQLITE (sessions.db)                           │
├─────────────────────────────────────────────────────────┤
│ sessions (id, user_id, app_id, prompt_version_id, title)│
│ messages (id, session_id, role, content, created_at)    │
│ apps (id, slug, title, subtitle, is_active, ...)        │
│ prompt_versions (id, app_id, body, change_note, ...)    │
└─────────────────────────────────────────────────────────┘
```

## Data Flow: User → Agent → Browser

### 1. Send Message
```
Browser POST /chat(message, session_id?)
  ↓
server.py:chat()
  ├─ Resolve or create session
  ├─ Add to history
  ├─ Start agent task: run_agent(session, message)
  └─ Return session_id
```

### 2. Agent Spawns
```
agent.py:run_agent(session, user_message)
  ├─ Load app prompt from db (locked to session's prompt_version_id)
  ├─ Build system_prompt = app_prompt + framework.md
  ├─ Create MCP server with tools (show, ask, ±save_app, ±update_app)
  ├─ Start ClaudeSDKClient with agent loop
  └─ Loop until agent returns or error
```

### 3. Agent Calls Tool
```
Agent calls: mcp__app__show({ blocks: [...] })
  ↓
tools.py:show_tool(args)
  ├─ session.push_sse("assistant_message", {blocks})
  ├─ Add to history + save to DB
  └─ Return "Displayed N block(s)"

Agent calls: mcp__app__ask({ questions: [...] })
  ↓
tools.py:ask_tool(args)
  ├─ Generate ask_id
  ├─ session.push_sse("ask_message", {id, questions})
  ├─ session.start_ask(ask_id)
  ├─ BLOCK: await session.pending_ask_event.wait()  ← WAITS HERE
  │
  │  [Browser receives SSE → renders form → user submits]
  │
  │  Browser POST /answers(session_id, ask_id, answers)
  │    ↓
  │  server.py:answers()
  │    ├─ Validate session, ask_id
  │    ├─ session.pending_answers = answers
  │    ├─ session.pending_ask_event.set()  ← UNBLOCKS ↑
  │    └─ Return OK
  │
  ├─ Add answers to history + save to DB
  └─ Return "User answers: ..."
```

### 4. SSE Stream
```
Browser GET /stream (EventSource)
  ↓
server.py:_sse_generator(session)
  ├─ Loop: event = await session.sse_queue.get() (timeout 15s)
  ├─ Yield: "event: {type}\ndata: {json}\n\n"
  ├─ Detect dead agent (timeout → agent_dead → return error)
  └─ Stop on terminal events (done, error)
```

## Service Boundaries

| Service | Responsibility | Owns |
|---------|-----------------|------|
| **Browser** | UI rendering, SSE listening, form submission | React state, localStorage (user_id, session_id) |
| **FastAPI** | HTTP routing, session mgmt, SSE broadcast, DB access | SessionManager, SQLite connection pool |
| **Agent** | App logic (Claude calls tools in a loop) | system_prompt, tool handlers, liveness checks |
| **SQLite** | Persistent data (sessions, messages, apps, versions) | Schema, migrations, indexes |

## Key Integration Points

1. **Session Registry** — SessionManager keeps all active sessions in-memory (lost on server restart)
2. **Event Queue** — Each session has asyncio.Queue for SSE events, shared between agent & HTTP handlers
3. **Blocking Tool** — `ask()` uses asyncio.Event to block tool handler, resumed by `/answers` POST
4. **Subprocess Lifecycle** — Agent task spawned per chat message, cleanup on done/error via done callback
5. **Version Locking** — Session captures `prompt_version_id` at creation, agent always uses that version

## Constraints

- Single agent loop per session at a time (enforced by `if session.agent_running: raise 409`)
- No persistence of in-memory sessions → server restart loses active sessions
- ANTHROPIC_API_KEY must NOT be set (uses Max subscription, not API key)
- Tool exceptions kill agent loop → all tool handlers wrapped in try/except
