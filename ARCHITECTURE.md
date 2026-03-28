# Positioning Workshop — Architecture

## Overview

Web-app for startup/product positioning workshops. Claude drives the logic (what to ask, when to research competitors, when to deep-dive, when to deliver results). The UI is a "dumb" chat renderer — it shows whatever Claude requests via MCP tools.

Based on Gerstep's positioning-plugin methodology, but Claude adapts freely (not a rigid script).

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
├── ARCHITECTURE.md
├── README.md
├── LICENSE
│
├── backend/
│   ├── __init__.py
│   ├── server.py          # FastAPI app, SSE endpoint, /answers endpoint
│   ├── agent.py           # Claude SDK client, agent lifecycle
│   ├── tools.py           # MCP tools: show + ask (with asyncio.Event)
│   ├── schemas.py         # JSON schemas for all widget types
│   ├── session.py         # Session state (pending events, answers, SSE queue)
│   ├── db.py              # SQLite: save/load workshop sessions
│   ├── prompt.py          # System prompt (positioning methodology)
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts              # SSE events, widget types, answers
│       ├── api.ts                # fetch helpers: POST /chat, POST /answers
│       ├── hooks/
│       │   ├── useSSE.ts         # SSE connection, reconnect, event dispatch
│       │   └── useChat.ts        # Chat message state, scroll management
│       ├── components/
│       │   ├── ChatContainer.tsx
│       │   ├── MessageList.tsx
│       │   ├── AssistantMessage.tsx
│       │   ├── AskMessage.tsx
│       │   ├── UserMessage.tsx
│       │   ├── InputArea.tsx
│       │   ├── WidgetRenderer.tsx   # Dynamic dispatch: type -> component
│       │   ├── display/            # show widgets (11 types)
│       │   │   ├── TextWidget.tsx
│       │   │   ├── SectionHeader.tsx
│       │   │   ├── CompetitorTable.tsx
│       │   │   ├── ComparisonCard.tsx
│       │   │   ├── AlignmentMap.tsx
│       │   │   ├── QuoteHighlight.tsx
│       │   │   ├── StrengthMeter.tsx
│       │   │   ├── CopyableBlock.tsx
│       │   │   ├── ProgressBar.tsx
│       │   │   ├── FinalResult.tsx
│       │   │   └── TimerWidget.tsx
│       │   └── input/              # ask widgets (7 types)
│       │       ├── SingleSelect.tsx
│       │       ├── MultiSelect.tsx
│       │       ├── FreeText.tsx
│       │       ├── RankPriorities.tsx
│       │       ├── SliderScale.tsx
│       │       ├── Matrix2x2.tsx
│       │       └── TagInput.tsx
│       └── styles/
│           └── global.css
│
└── e2e/                         # End-to-end tests
    ├── playwright.config.ts
    ├── fixtures/
    │   └── mock_server.py       # Mock backend for testing
    └── tests/
```

## MCP Tools (2 tools)

### `show` — fire-and-forget display
- Claude calls when it wants to display content to user
- Sends blocks to browser via SSE, returns immediately
- Widget types: text, section_header, competitor_table, comparison_card, alignment_map, quote_highlight, strength_meter, copyable, progress, final_result, timer

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
| `competitor_table` | Table + highlights | Research results |
| `comparison_card` | Side-by-side diff | Draft vs final |
| `alignment_map` | Agreement map | Team synthesis |
| `quote_highlight` | Highlighted quote | Key insight |
| `strength_meter` | Metric bars | Positioning score |
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
| `POST` | `/chat` | Start or continue workshop session |
| `GET` | `/stream` | SSE event stream to browser |
| `POST` | `/answers` | User submits form -> unblocks `ask` tool |
| `GET` | `/sessions` | List past sessions (SQLite) |
| `GET` | `/sessions/{id}` | Load specific session history |

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

server = create_sdk_mcp_server(name="workshop", version="1.0.0", tools=[show_tool, ask_tool])

options = ClaudeAgentOptions(
    mcp_servers={"workshop": server},
    allowed_tools=["mcp__workshop__show", "mcp__workshop__ask"],
    disallowed_tools=["AskUserQuestion"],  # Block built-in (needs TTY)
    system_prompt=POSITIONING_SYSTEM_PROMPT,
    permission_mode="acceptEdits",
)
```

## Key Constraints

- Single user, single agent loop at a time
- All state in-memory during session, persisted to SQLite on completion
- `ANTHROPIC_API_KEY` must NOT be set (overrides Max subscription)
- `AskUserQuestion` built-in tool must be disabled (requires TTY)
- Uncaught exceptions in tool handlers kill the agent loop — always try/except
- Tool names: `mcp__workshop__show`, `mcp__workshop__ask`

## Development

```bash
# Backend
cd backend && pip install -r requirements.txt && python server.py  # :8000

# Frontend
cd frontend && npm install && npm run dev  # :5173 with proxy to backend
```
