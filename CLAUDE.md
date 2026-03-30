# Prompt-to-App — Agentic Web App Framework

## Overview

Generic framework for prompt-driven agentic web apps. Claude drives the logic via MCP tools (`show` and `ask`). The UI is a "dumb" chat renderer — it shows whatever Claude requests.

The example app is a positioning workshop based on Gerstep's methodology, but the framework is app-agnostic.

## Architecture

```
Browser (React SPA)  <──SSE──>  FastAPI (Python)  <──subprocess──>  Claude Code CLI
                     ──POST──>    | in-process MCP tools              (agent brain)
                                  | SQLite (session history)
```

**Key pattern — async wait:**
1. Claude calls `ask(questions)` MCP tool
2. Tool handler sends questions to browser via SSE, then `await asyncio.Event()`
3. User fills form in browser, clicks Submit
4. Browser POSTs to `/answers` -> `event.set()` unblocks handler
5. Handler returns answers to Claude, agent loop continues

`show` tool is fire-and-forget — sends to SSE, returns immediately.

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11+, FastAPI, uvicorn, claude-agent-sdk |
| Frontend | React 19 + Vite + TypeScript |
| Database | SQLite (aiosqlite) — session history |
| Auth | Claude Max subscription via OAuth (NO API key) |
| Deploy | localhost (Beelink/Proxmox via Tailscale) |

## Project Structure

```
forge-simple/
├── CLAUDE.md
├── ARCHITECTURE.md
├── POSITIONING-WORKSHOP-SPEC.pdf
├── README.md
│
├── backend/
│   ├── __init__.py
│   ├── server.py          # FastAPI app, SSE, /answers, admin endpoints
│   ├── agent.py           # Claude SDK client, agent lifecycle
│   ├── tools.py           # MCP tools: show + ask (with asyncio.Event)
│   ├── schemas.py         # JSON schemas for all widget types
│   ├── session.py         # Session state (pending events, answers, SSE queue)
│   ├── db.py              # SQLite: save/load sessions, auto-title
│   ├── prompt.md          # System prompt (positioning methodology)
│   ├── app.json           # App config (title, etc.)
│   ├── framework.md       # Framework description for agent
│   ├── requirements.txt
│   └── tests/             # pytest: test_db, test_server, test_session, test_tools, test_schemas
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx               # Router: / → ChatPage, /admin → AdminPage
│       ├── types.ts              # SSE events, widget types, answers
│       ├── api.ts                # fetch helpers: /chat, /answers, /sessions
│       ├── api-admin.ts          # Admin API: /admin/sessions, stream, history
│       ├── userId.ts             # Anonymous user ID (localStorage)
│       ├── hooks/
│       │   ├── useSSE.ts         # SSE connection, reconnect, event dispatch
│       │   └── useChat.ts        # Chat message state, scroll management
│       ├── pages/
│       │   ├── ChatPage.tsx      # Main chat page wrapper
│       │   └── AdminPage.tsx     # Admin monitoring dashboard
│       ├── components/
│       │   ├── ChatContainer.tsx  # Chat + SessionSidebar + read-only mode
│       │   ├── SessionSidebar.tsx # Past session list sidebar
│       │   ├── MessageList.tsx    # Message renderer (readOnly support)
│       │   ├── AssistantMessage.tsx
│       │   ├── AskMessage.tsx     # readOnly support
│       │   ├── UserMessage.tsx
│       │   ├── InputArea.tsx
│       │   ├── WidgetRenderer.tsx # Dynamic dispatch: type -> component
│       │   ├── display/          # show widgets (11 types)
│       │   │   ├── TextWidget.tsx
│       │   │   ├── SectionHeader.tsx
│       │   │   ├── DataTable.tsx
│       │   │   ├── Comparison.tsx
│       │   │   ├── CategoryList.tsx
│       │   │   ├── QuoteHighlight.tsx
│       │   │   ├── MetricBars.tsx
│       │   │   ├── CopyableBlock.tsx
│       │   │   ├── ProgressBar.tsx
│       │   │   ├── FinalResult.tsx
│       │   │   └── TimerWidget.tsx
│       │   ├── input/            # ask widgets (7 types)
│       │   │   ├── SingleSelect.tsx
│       │   │   ├── MultiSelect.tsx
│       │   │   ├── FreeText.tsx
│       │   │   ├── RankPriorities.tsx
│       │   │   ├── SliderScale.tsx
│       │   │   ├── Matrix2x2.tsx
│       │   │   └── TagInput.tsx
│       │   └── admin/            # Admin monitoring components
│       │       ├── SessionList.tsx
│       │       └── SessionViewer.tsx
│       ├── __tests__/            # Vitest: widgets, hooks, components
│       └── styles/
│           ├── global.css
│           └── admin.css
│
└── e2e/                          # Playwright E2E tests
    ├── playwright.config.ts
    ├── fixtures/
    │   ├── mock_server.py        # Mock backend for testing
    │   └── mock-agent.py
    └── tests/
        ├── ask-flow.spec.ts
        ├── workshop-flow.spec.ts
        ├── responsive-widgets.spec.ts
        ├── multi-user-admin.spec.ts
        └── real-backend.spec.ts
```

## MCP Tools (2 tools)

### `show` — fire-and-forget display
- Claude calls when it wants to display content to user
- Sends blocks to browser via SSE, returns immediately
- Widget types: text, section_header, data_table, comparison, category_list, quote_highlight, metric_bars, copyable, progress, final_result, timer

### `ask` — blocking, waits for user response
- Claude calls when it wants to ask questions
- Sends questions to browser via SSE, blocks via asyncio.Event
- Unblocked when user POSTs /answers
- Widget types: single_select, multi_select, free_text, rank_priorities, slider_scale, matrix_2x2, tag_input

Claude also has built-in: **WebSearch** (competitor research), **WebFetch** (read competitor sites).

## Widget Catalog

### Input widgets (inside `ask`)
| Type | Component | Use case |
|------|-----------|----------|
| `single_select` | Radio buttons | Forced-choice, company stage |
| `multi_select` | Checkboxes | "Which markets" |
| `free_text` | Textarea/input | Company description, positioning draft |
| `rank_priorities` | Drag-and-drop | Priority ranking |
| `slider_scale` | Scale 1-10 | "Rate PMF confidence" |
| `matrix_2x2` | Clickable matrix | effort vs impact |
| `tag_input` | Tag entry via Enter | "5 brand association words" |

### Display widgets (inside `show`)
| Type | Component | Use case |
|------|-----------|----------|
| `text` | Markdown | Commentary, analysis |
| `section_header` | Section title | Phase separation |
| `data_table` | Table + highlights | Tabular data, research results |
| `comparison` | Side-by-side diff | Before/after, draft vs final |
| `category_list` | Categorized lists | Grouped items with optional styles |
| `quote_highlight` | Highlighted quote | Key insight |
| `metric_bars` | Metric bars | Scored metrics with bars |
| `copyable` | Copy-to-clipboard | Team exercise, final |
| `progress` | Progress bar | Workshop progress |
| `final_result` | Accent result | Positioning statement |
| `timer` | Countdown | "Don't overthink" |

## SSE Event Types

| Event | Payload | Frontend renders |
|-------|---------|-----------------|
| `assistant_message` | `{blocks: [...]}` | Claude message with display widgets |
| `ask_message` | `{id, preamble?, questions: [...]}` | Form + Submit button |
| `user_message` | `{answers: {...}}` | Compact answer block |
| `research_start` | `{label}` | Searching animation |
| `research_done` | `{label}` | Checkmark |
| `stream_delta` | `{text}` | Incremental text |
| `done` | `{}` | Session complete |
| `error` | `{message}` | Error display |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | Start or continue session (auto-titles on first msg) |
| `GET` | `/stream` | SSE event stream to browser |
| `POST` | `/answers` | User submits form -> unblocks `ask` tool |
| `POST` | `/sessions/create` | Create new session (auto on page load) |
| `GET` | `/sessions` | List user's sessions (with status, message_count) |
| `GET` | `/sessions/{id}` | Load specific session history |
| `GET` | `/health` | Health check |
| `GET` | `/config` | App config (title from app.json) |
| `GET` | `/admin/sessions` | All sessions with status (admin) |
| `GET` | `/admin/sessions/{id}/stream` | Read-only SSE stream (admin) |
| `GET` | `/admin/sessions/{id}/history` | Full message history (admin) |

## Design

- **Theme**: Dark (bg: `#08080a`, surface: `#121215`, accent: `#e8c46c`)
- **Fonts**: Playfair Display (headings), DM Sans (body), JetBrains Mono (meta/labels)
- **Layout**: AssistantMessage left no border; UserMessage right subtle border
- **Widgets**: Cards with subtle border
- **Animations**: fade-in new messages, pulse research indicator

## Claude Agent SDK Usage

```python
from claude_agent_sdk import (
    ClaudeSDKClient, ClaudeAgentOptions,
    tool, create_sdk_mcp_server,
)

server = create_sdk_mcp_server(name="app", version="1.0.0", tools=[show_tool, ask_tool])

options = ClaudeAgentOptions(
    mcp_servers={"app": server},
    allowed_tools=["mcp__app__show", "mcp__app__ask"],
    disallowed_tools=["AskUserQuestion"],  # Block built-in (needs TTY)
    system_prompt=POSITIONING_SYSTEM_PROMPT,
    permission_mode="acceptEdits",
)
```

## Session Lifecycle

- Frontend auto-creates a session on page load via `POST /sessions/create`
- Session ID stored in `sessionStorage` (key: `session_id`) — persists within tab, resets on new tab
- User ID generated once per browser, stored in `localStorage` — sent as `X-User-Id` header
- First user message auto-titles the session (first 80 chars)
- Session sidebar allows browsing and viewing past sessions in read-only mode
- Framework-level thinking indicator: `isLoading` state drives `◎ Thinking...` in MessageList (no agent SSE events needed)

## Key Constraints

- Multi-user with session isolation (each session has a `user_id`, ownership checked on /chat and /answers)
- Single agent loop per session at a time
- All state in-memory during session, persisted to SQLite
- `ANTHROPIC_API_KEY` must NOT be set (overrides Max subscription)
- `AskUserQuestion` built-in tool must be disabled (requires TTY)
- Uncaught exceptions in tool handlers kill the agent loop — always try/except
- Tool names: `mcp__app__show`, `mcp__app__ask`

## Development

```bash
# Backend
cd backend && pip install -r requirements.txt && python server.py  # :4910

# Frontend
cd frontend && npm install && npm run dev -- --port 4920  # :4920 with proxy to backend
```
